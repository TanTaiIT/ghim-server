# Design

## Context

- `prepare-promotions` đã tách vị trí xếp hạng khỏi mốc lên bảng: `listings.rank_at` là cột xếp của bốn index bảng tin
  và của con trỏ trang (`rankAt`, `id`), hiện luôn bằng `first_live_at` (CHECK `listings_rank_check` chỉ đòi hai cột cùng
  null). `listings.featured_until` luôn null, có index từng phần `listings_featured_idx WHERE featured_until IS NOT NULL`.
- "Ai thấy một tin" chỉ có một luật: `canView` / `visibleWhere` (`listing/calc/visibility.calc.ts`, CLAUDE.md luật 25).
- Phạm vi người quản trị đã có mẫu ở `review`: `viewerOf` đọc quyền staff qua `platform.staffGrant` mỗi lượt (không tin
  token); `groupRoleOver` đọc `group.reviewersOf` — chủ nhóm, điều hành cả nhóm, điều hành đúng đơn vị của tin, vai treo
  bị loại, nhóm không còn cho điều hành thì không ai.
- Nhật ký vận hành: `appendAudit(tx, …)` (`common/audit`), `actorRole` chỉ có `user` / `master`.

## Goals / Non-Goals

**Goals:**

- Chỉ `listing` ghi `rank_at`, `featured_until`, `last_bumped_at` (TK 30: chỉ Tin đăng đổi tin). Gói trả Xu sau này
  (`add-promotions`) gọi cổng của `listing`, không ghi thẳng.
- Kiểm phạm vi, trạng thái tin, thời gian chờ và ghi trong **một** transaction đã khoá dòng tin.

**Non-Goals:**

- Không bảng lịch sử đẩy tin riêng — nhật ký vận hành đã ghi ai làm gì.
- Không việc nền dọn hạn nổi bật đã qua — mọi chỗ đọc so với bây giờ (spec "Hạn nổi bật của một tin").
- Không phát sự kiện outbox: chưa ai nghe (thông báo cho người đăng hoãn — proposal câu 6).

## Decisions

### 1. Đặt trong `listing`, không dựng module `promotion`

`listing/boost/` (`boost.service.ts`, `boost.routes.ts`) + `listing/calc/boost.calc.ts`. Đẩy tin miễn phí không có ví,
không có gói, không có lượt mua — thứ duy nhất `promotion` của kế hoạch sở hữu mà ở đây cần là "lần đẩy trước", và một
cột trên tin trả lời đủ. Module `promotion` để `add-promotions` dựng khi có Xu, gọi cổng `applyPromotion(tx)` mà
`boost.service` tách ra sẵn.

_Đã cân nhắc_: module `promotion` + bảng `listing_boosts` (một dòng mỗi lượt) — thêm một module, một bảng, một bước hạn
lưu chỉ để đọc lần đẩy cuối; nhật ký đã giữ phần "ai, khi nào".

### 2. Dữ liệu

- `listings.last_bumped_at TIMESTAMPTZ(3) NULL` — lần đẩy lên đầu gần nhất, nguồn của thời gian chờ. Không index (đọc
  theo khoá chính trên dòng đã khoá).
- Đẩy lên đầu: `rank_at = now, last_bumped_at = now`. Đặt nổi bật: `featured_until = now + N ngày`. Bỏ nổi bật:
  `featured_until = NULL`.
- Cả ba **không** tăng `version` (lượt sửa của người đăng không vấp `LISTING_CHANGED` — spec "Đẩy lên đầu") và **không**
  đổi `updated_at` (thứ tự "Tin của tôi" giữ nguyên): ghi bằng `$executeRaw` một câu `UPDATE`, không qua
  `prisma.listing.update` vì `@updatedAt` tự đặt.
- `listings_rank_check` vẫn đúng: `rank_at` chỉ được đặt khi tin đang hiển thị, tức `first_live_at` đã có.
- Migration `add_admin_boost`: một `ADD COLUMN`, Prisma sinh, không SQL viết tay, không mất dữ liệu.

### 3. Một transaction, khoá dòng tin

`lockListing(tx, id)` (`SELECT … FOR UPDATE`, đã có) → đọc lại dòng → `boostRole` → `boostBlock` (với đẩy / đặt nổi bật)
→ `bumpRetryAt` (với đẩy lên đầu) → `UPDATE` → `appendAudit`. Hai người đẩy cùng lúc: người sau chờ khoá, đọc được
`last_bumped_at` mới, nhận 429. Phạm vi đọc **trước** khi khoá (`staffGrant`, `reviewersOf` không cần khoá tin) để
transaction ngắn; tin đổi nhóm / đơn vị giữa chừng hiếm và chỉ làm lượt đó dùng phạm vi cũ một lần.

### 4. Phạm vi — calc thuần

`boostRole({ actorId, isMaster, listing, grant, reviewers })` → `'master' | 'staff' | 'group_owner' | 'group_moderator'
| null`:

- master → `master`.
- Tin nơi đăng `group_public` / `members_only`: `reviewers.moderationAllowed`, chủ nhóm → `group_owner`; điều hành có
  `unitId` null hoặc bằng `listing.unitId` → `group_moderator`.
- Tin `marketplace`: grant `active` và `categoryId` thuộc grant → `staff`. Dòng huy hiệu nhóm không cho quản trị nhóm
  quyền gì trên tin sàn.

Viết lại trong `listing` chứ không gọi `review`: `listing` đứng trước `review` trong thứ tự dựng, và cổng ngược sẽ vòng.
Hai chỗ cùng luật nên test của `boost.calc` lặp đúng các ca của `groupRoleOver` / `directSubject` (trừ xung đột lợi ích
— người dùng chốt người quản trị được đẩy tin của mình).

Cổng mới của `listing`: `ListingPrivilegePort = Pick<PlatformService, 'staffGrant'>`; `ListingGroupPort` thêm
`reviewersOf`. `platform`, `group` dựng trước `listing` nên không cần nối muộn.

`boostBlock(listing)` → câu từ chối hay null: xoá → 404 (ở service); `checking` "Tin đang được máy kiểm"; `pending` "Tin
đang chờ duyệt"; `removed` "Tin đã bị gỡ"; `rejected`, `sold`, `expired`, `draft` mỗi trạng thái một câu; `hideReasons`
khác rỗng "Tin đang tạm ẩn";
`restrictions` khác rỗng "Tin đang hiển thị hạn chế — chỉ tin hiển thị đầy đủ mới đẩy được". Thứ tự kiểm theo trạng thái
trước, tạm ẩn, rồi hạn chế — câu luôn nói lý do nặng nhất.

### 5. API

| Route                                    | Ai        | Trả                                                                                |
| ---------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `GET /listings/:listingId/boost`         | đăng nhập | `{ role, blocked: string \| null, bumpRetryAt, featuredUntil, featuredMaxDays }`   |
| `POST /listings/:listingId/boost`        | đăng nhập | thân `{ effect: 'rank_to_top' } \| { effect: 'featured', days }` → cùng dạng `GET` |
| `DELETE /listings/:listingId/featured`   | đăng nhập | cùng dạng `GET`                                                                    |
| `GET /listings/featured?categoryId=`     | công khai | `{ items: ListingDto[] }` — dải sàn chung, tối đa `promotion.featuredStripSize`    |
| `GET /groups/:groupId/listings/featured` | công khai | `{ items: ListingDto[] }` — dải nhóm, theo phạm vi người xem như bảng tin nhóm     |

`POST` trả lại trạng thái đẩy thay vì DTO tin: app chỉ cần đổi nút; tin thì app tải lại qua query của nó. Lỗi:
401, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `BOOST_NOT_ALLOWED`, 429 `BOOST_COOLDOWN` (`details.retryAt`, cùng dạng
`SUBMISSION_COOLDOWN`), 400 `VALIDATION_ERROR` (số ngày ngoài khoảng — kiểm ở service vì trần đọc từ bảng con số).
`/listings/featured` là đường tĩnh nên find-my-way xếp trước `/listings/:listingId`.

### 6. Dải nổi bật

`read.service`: `featured(actor, { categoryId })` = `visibleWhere(viewer, categoryId ? 'category' : 'feed')` AND
`featuredUntil > now` (+ `categoryId`); `groupFeatured(actor, groupId)` = `visibleWhere(viewer, 'group_feed', groupId)`
với `viewerFor(actor, groupId)` như `groupFeed`. Xếp `featuredUntil asc, id asc`, `take` = `promotion.featuredStripSize`.
Index `listings_featured_idx` lọc trước, tập nhỏ. Dải không có con trỏ — một trang.

`toDto` / `toOwnDto`: `featuredUntil` null khi `featured_until <= now`.

### 7. Con số — nhóm mới "Đẩy tin" (`PROMOTION`)

| Khoá                          | Khởi đầu | Khoảng                         |
| ----------------------------- | -------- | ------------------------------ |
| `promotion.bumpCooldownHours` | 24       | 0 (không chờ) – trần `hours`   |
| `promotion.featuredMaxDays`   | 30       | 1 – 365                        |
| `promotion.featuredStripSize` | 6        | 1 – 50 (trần trang của server) |

Tên khoá trùng tên kế hoạch dùng cho gói trả Xu — `add-promotions` dùng lại, không đổi tên. Khoá mới đi đường như
mọi khoá thêm sau phiên bản 1 (giá trị khởi đầu tới khi master phát hành bảng mới) — kiểm lại ở `platform` lúc apply.

### 8. Nhật ký

`appendAudit` trong transaction ghi: `action` `listing.listing.bump` / `listing.listing.feature` /
`listing.listing.unfeature`, `actorRole` (`master` hay `user`), `targetType` `listing`, `details`
`{ role, days?, featuredUntil? }` — chỉ mã và số, không nội dung tin. Bỏ nổi bật tin không nổi bật: không ghi.

## Risks / Trade-offs

- [Quản trị nhóm đẩy mọi tin của nhóm mỗi 24 giờ] → chỉ đổi thứ tự trong bảng tin của chính nhóm đó; tin sàn chỉ
  master và staff đẩy được. Master nâng `promotion.bumpCooldownHours` nếu thấy lạm dụng; nhật ký cho biết ai.
- [Người quản trị đẩy tin của chính mình — người dùng chốt cho phép] → mọi lượt vào nhật ký kèm vai, master đọc được ở
  "Nhật ký vận hành" của app.
- [Con trỏ trang cũ] → tin vừa đẩy nhảy lên trên con trỏ nên không lặp; người đang lướt trang sau chỉ thấy nó khi tải lại.
- [Luật phạm vi viết hai chỗ (`review`, `listing`)] → test calc lặp ca của nhau; đổi luật phạm vi nhóm thì sửa cả hai
  (ghi vào CLAUDE.md mục `listing`).
- [`add-promotions` viết trước change này] → delta `listing/visibility` của nó phải viết lại trên bản sau change này
  trước khi apply (ghi ở proposal và kế hoạch).

## Migration Plan

Deploy thường: `prisma migrate deploy` thêm một cột null — không khoá bảng lâu, không backfill. Rollback: bỏ route là đủ;
cột thừa vô hại.
