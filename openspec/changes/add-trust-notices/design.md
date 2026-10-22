# Design

> **Đã duyệt 22/10/2026.** Người dùng duyệt design và tasks ("duyệt, bạn bắt đầu code"); sáu câu hỏi mở đã chốt cùng
> ngày theo đề xuất (proposal, mục "Đã chốt"); TK 24 đã thêm hai dòng.

## Context

- `notification` áp ma trận cho sự kiện outbox: mỗi file `notification.<module>-matrix.ts` xuất `X_MATRIX` (sự kiện →
  `Handler`) và `X_NOTICE_EVENTS`; `notification.module.ts` đăng ký bên nghe theo danh sách đó, `handleEvent` dò lần lượt
  `GROUP ?? LISTING ?? MEDIA ?? REVIEW ?? MESSAGING`. `NoticeDraft` có `body` (câu nhắc — banner, đẩy lên điện thoại) và
  `detail` (chỉ xem trong app; push không bao giờ mang `detail`). Gộp theo từng người nhận + khoá; lần cập nhật đổi
  `body` = `render(count)` và nhắc lại theo `notification.collapseAlertMinutes` (30); `data`, `detail` giữ của dòng đầu.
  Mỗi người nhận một dòng mỗi sự kiện (`sourceEventId`, `recipientId` unique).
- `notification` **không lọc tài khoản đã xoá**: dòng vẫn được ghi (push thì tự rơi vì phiên đã thu hồi); tài khoản đã
  xoá hẳn làm hỏng khoá ngoại và sự kiện bị thử lại mãi. Chỉ `masterIds` lọc `active`.
- Sự kiện `trust` hiện có (`trust.outbox.ts`) đủ để biết **chuyện gì** xảy ra nhưng thiếu ngày hết hạn, hạn khiếu nại,
  điều luật: `strike.issued` mang `kind`, `listingId`, `ruleText`, `inherited`; `strike.cancelled` mang `cause`
  (`appeal` · `amnesty` · `serious_cancel`); `strike.decided` mang `decision` (`permanent` · `downgrade` · `cancel` ·
  `kept` · `lifted`); `strike.expired` chỉ mã. Luật C1 của `trust`: bên nghe hỏi lại, không tin payload. `TrustService`
  có sẵn `strikeDetail(strikeId)` (loại, điểm, điều, ngày ra, ngày hết hạn, hạn khiếu nại, tin, trạng thái) và
  `standingOf(accountId)` (điểm, hạn khoá đăng tin).
- Hai chỗ **không phát gì**: `decideAppeal` với `lost` (và `won` trên gậy đã hết hiệu lực); `onAccountCreated` kế thừa
  phát một `strike.issued { inherited: true }` cho **mỗi** gậy, không có mã lượt chung.
- `screening.cooldown.started { accountId, until }` đã phát, chưa ai nghe; phát lại được khi đang chờ (sửa, gia hạn tin
  vẫn chạy lượt dò, `until` lùi thêm). Câu 429 `SUBMISSION_COOLDOWN` dùng `formatTimeVN` — chỉ `HH:mm:ss`, không ngày,
  mơ hồ với thời gian chờ 24 giờ.
- `review` không phát gì khi mở, gộp hay huỷ việc. Người xử việc tính lúc đọc (`routeOf` + `routesFor`): cấp đơn vị →
  điều hành cả nhóm → chủ nhóm → staff danh mục → master; `excludedIds` của việc đã loại chủ tin và tài khoản chung máy;
  `groups.reviewersOf` đã bỏ điều hành viên bị khoá hay có gậy nặng. Hàng chờ nhóm (`groupQueue`) là `openTasks({groupId})`
  rồi lọc theo `routesFor`.
- `notification` dựng sau `trust`, `screening`, `review` trong `app.ts` — nối thẳng service, không cần cổng nối muộn.

## Goals / Non-Goals

**Goals:** đúng các requirement của `notification/trust-notices` và N36 trong `notification/group-notices`; mỗi chuyện
đúng một thông báo; thông báo phản ánh trạng thái lúc gửi chứ không phải payload lúc phát.

**Non-Goals:** lọc tài khoản đã xoá cho các ma trận cũ (chỉ ma trận mới lọc — sửa chung là change khác nếu cần); gửi
email; đổi giao diện app; số liệu thông báo.

## Decisions

### 1. Ma trận mới `notification.trust-matrix.ts`, đọc lại qua `trust`

- `TRUST_MATRIX` nghe `trust.strike.issued`, `trust.strike.cancelled`, `trust.strike.decided`, `trust.strike.expired`,
  `trust.tier.changed`, hai sự kiện mới ở mục 2, và `screening.cooldown.started` (thời gian chờ là chuyện của người dùng
  trong nhóm "mức tin cậy và gậy", nên ở cùng ma trận dù sự kiện của `screening`). Thêm vào danh sách đăng ký và chuỗi
  `??` của `handleEvent`.
- `MatrixContext` thêm ba cửa đọc, nối trong `app.ts`:
  - `strike(strikeId)` → `trust.strikeDetail` (null khi không còn);
  - `standing(accountId)` → `trust.standingOf`;
  - `liveAccounts(ids)` → tập mã tài khoản còn tồn tại và chưa xoá, đọc qua `identity.accountSummaries` (đã có trong
    phụ thuộc của `notification`). Tài khoản bị khoá vẫn nhận (đọc được khi mở khoá); chờ xác nhận email vẫn nhận.
- Mọi dòng của ma trận này: lọc người nhận qua `liveAccounts` trước khi dựng; nhóm `trust_strikes` (đã có trong enum —
  không migration); `personal: true`; `groupId: null`; tiêu đề "Ghim".
- Payload chỉ dùng để biết chuyện gì và tìm lại bản ghi; câu dựng từ `strikeDetail` lúc gửi. Bỏ: thêm ngày hết hạn,
  hạn khiếu nại vào payload — trái luật C1 và vẫn phải đọc lại khi gậy đổi giữa chừng.
- Gậy đã huỷ lúc gửi thông báo "nhận gậy" (ân xá ngay sau khi ra) → không gửi dòng nhận gậy; người dùng chỉ nhận dòng
  huỷ. Đúng tinh thần "thông báo theo trạng thái hiện tại".

### 2. Hai sự kiện mới của `trust`

- **`trust.appeal.decided { appealId, strikeId, accountId, verdict }`** — phát trong `decideAppeal` cho cả `won` lẫn
  `lost`, cùng transaction với lượt ghi khiếu nại, kể cả lượt tự thắng của lịch `review` (`by: null`). Khi `won` mà gậy
  còn hiệu lực, `strike.cancelled { cause: 'appeal' }` vẫn phát như cũ cho các bên nghe khác — ma trận **bỏ qua**
  `cause: 'appeal'` để không thành hai thông báo. `decideSerious` cập nhật khiếu nại đang chờ không qua `decideAppeal`
  nên không phát sự kiện này — dòng quyết gậy nghiêm trọng đã nói đủ (spec: một thông báo).
- **`trust.strike.inherited { accountId, strikeIds }`** — phát **một** lần trong transaction kế thừa của
  `onAccountCreated`, cạnh các `strike.issued { inherited: true }` giữ nguyên cho bên nghe khác. Ma trận bỏ qua
  `strike.issued` có `inherited: true`. Bỏ: gộp các `strike.issued` bằng khoá gộp — lần cập nhật không đổi `detail`, nên
  không liệt kê được ngày hết hạn của từng gậy.
- Không đổi bảng; outbox nhận loại sự kiện mới không cần migration (`type` là chuỗi).

### 3. Bảng thông báo

| Mã  | Sự kiện → điều kiện                              | Nhắc  | Gộp                      | Câu nhắc (`body`)                                                  | Trong app (`detail`)                                              |
| --- | ------------------------------------------------ | ----- | ------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| N49 | `strike.issued`, không kế thừa, gậy chưa huỷ     | có    | —                        | Bạn nhận một gậy thường / nặng (liên quan tới tin «…»)             | Điều …: … Hết hạn dd/mm/yyyy. Khiếu nại được tới dd/mm/yyyy.      |
| N49 | `strike.issued`, gậy nghiêm trọng                | có    | —                        | Tài khoản bị khoá vì một gậy nghiêm trọng.                         | Điều …. Gậy đang chờ master quyết. Khiếu nại được tới dd/mm/yyyy. |
| N50 | `strike.inherited`, còn ít nhất một gậy hiệu lực | có    | —                        | Tài khoản mang theo N gậy còn hiệu lực.                            | Từng gậy: loại, ngày hết hạn                                      |
| N51 | `appeal.decided` `won`                           | có    | —                        | Khiếu nại được chấp nhận — gậy đã huỷ.                             | Tin «…» được khôi phục (khi gậy gắn tin còn tồn tại)              |
| N51 | `appeal.decided` `lost`                          | có    | —                        | Khiếu nại không được chấp nhận.                                    | Gậy vẫn hết hạn dd/mm/yyyy.                                       |
| N52 | `strike.cancelled` `amnesty` · `serious_cancel`  | có    | —                        | Một gậy của bạn đã được huỷ.                                       | (gậy nghiêm trọng) Tài khoản đã mở khoá.                          |
| N53 | `strike.decided` `permanent`                     | có    | —                        | Tài khoản bị khoá vĩnh viễn.                                       | —                                                                 |
| N53 | `strike.decided` `downgrade`                     | có    | —                        | Tài khoản đã mở khoá; gậy giờ là gậy nặng.                         | Hết hạn dd/mm/yyyy (đọc lại — tính từ ngày ra gậy nghiêm trọng)   |
| N54 | `strike.decided` `lifted`                        | có    | —                        | Khoá vĩnh viễn đã được gỡ.                                         | —                                                                 |
| N55 | `strike.expired`                                 | không | —                        | Một gậy của bạn đã hết hạn. (+ "Bạn đã đăng tin lại được.")        | —                                                                 |
| N56 | `tier.changed`, `to` > `from`                    | không | —                        | Tài khoản đã lên mức T…                                            | —                                                                 |
| N57 | `tier.changed`, `to` < `from`                    | có    | —                        | Tài khoản đang ở mức T…                                            | —                                                                 |
| N58 | `screening.cooldown.started`                     | có    | `trust:cooldown` / người | Tạm thời chưa gửi được tin mới — gửi lại từ HH:mm ngày dd/mm/yyyy. | Cần giúp thì nhắn Hỗ trợ Ghim.                                    |

- Không dòng nào: `strike.issued { inherited: true }`, `strike.cancelled { cause: 'appeal' }`, `strike.decided`
  `cancel` (đã có N52 qua `serious_cancel`) và `kept`, `strike.standing`, `strike.review_due`, `appeal.filed`,
  `appeal.closed`, và các sự kiện `identity` (xác nhận email, đánh dấu máy).
- `type` theo chuyện người dùng thấy: `trust.strike.issued`, `trust.strike.inherited`, `trust.appeal.decided`,
  `trust.strike.cancelled`, `trust.strike.decided`, `trust.strike.lifted`, `trust.strike.expired`, `trust.tier.raised`,
  `trust.tier.lowered`, `listing.submission.cooldown`. `data`: `{ strikeId, listingId }` cho dòng gậy (app mở bảng uy
  tín), `{}` cho mức, `{ retryAt }` cho thời gian chờ.
- N55 "đăng tin lại được": `standing.postingLockedUntil` hết và điểm hiện tại cộng điểm của gậy vừa hết đạt ngưỡng
  `strike.postingLockFromPoints` (3) — tức gậy này là gậy gỡ khoá. N53 `downgrade` đã hết hạn ngay lúc hạ (`trust` ghi
  thẳng `expired`, không phát `strike.expired`) thì câu nói gậy đã hết hạn.
- N51 thắng nói tin "được khôi phục", không "đã hiển thị lại": `listing` khôi phục tin ở bên nghe riêng của
  `strike.cancelled`, có thể chạy sau thông báo.
- N49 không nêu người ra gậy: không đọc `issuedBy`, `issuedByRole`; không nêu nhóm đã chuyển việc, không nêu người báo.

### 4. Thời gian chờ: một câu cho cả lỗi 429 và N58

- `common/time` thêm `formatMomentVN(date)` → `HH:mm ngày dd/mm/yyyy` theo giờ Việt Nam; `submissionCooldown` của
  `screening` đổi sang dùng nó — câu 429 có ngày, khớp từng chữ với N58 (test so hai câu). Đổi chữ trong `message`, không
  đổi `code` hay `details.retryAt`.
- Gộp theo người với khoá `trust:cooldown`, `render` bỏ qua số đếm và trả câu theo `until` mới nhất: phát lại khi đang
  chờ thì cập nhật dòng chưa đọc, nhắc lại tối đa mỗi 30 phút. Không có mã tra cứu (thời gian chờ không gắn lượt máy nào).

### 5. N36: `review` phát việc nhóm vào hàng máy giữ, `notification` hỏi lại lúc gửi

- **Phát**: `review.task.group_held { taskId, groupId }` trong transaction của `addReason`, chỉ khi việc **chuyển vào**
  hàng 0 (việc mới, hay việc đang mở ở hàng khác thêm lý do máy giữ) và tin thuộc một nhóm, không phải tin sàn. Gộp thêm lý
  do vào việc đã ở hàng 0, chạy lại `backfill` lúc khởi động, sự kiện lặp: không phát.
- **Đọc lại**: cửa đọc mới `review.groupHeldNotice(taskId)` → `null` khi việc đã đóng, không còn ở hàng 0, hay người xử
  không phải cấp nhóm (danh mục "tin nhóm bị giữ do sàn duyệt" → staff, đã chuyển cấp lên staff / master); không thì
  `{ groupId, recipients: [{ accountId, pending }] }`. `recipients` = người xử của việc theo `routesFor` (đã trừ chủ tin,
  tài khoản chung máy, điều hành viên bị khoá); `pending` = số việc hàng 0 đang mở của nhóm mà người đó đang xử được —
  cùng phép lọc của `groupQueue`, một lượt `openTasks({ groupId })` + `routesFor`.
- **Dựng**: mỗi người nhận một bản nháp (số khác nhau), khoá gộp `group:${groupId}:held`, `render` bỏ qua số đếm và
  trả "«tên nhóm» có N tin chờ duyệt." theo số hiện tại — mẫu của N40–N42, không phải N20 (N20 đếm số lượt từ lúc đọc).
  Nhóm `your_groups`, có nhắc, `personal: false` (tắt tiếng nhóm thì thôi nhắc, như N20), `data { groupId }`, `type`
  `group.review.pending`, nhắc lại theo `notification.collapseAlertMinutes` (30).
- Bỏ: `review` tính sẵn người nhận và số trong payload — đông cứng lúc phát, sai khi outbox thử lại (lùi tới 1 giờ),
  và gọi `routesFor` (đọc nhóm, danh mục, staff) ngay trong transaction đang khoá tin và việc.
- `notification` → `review` là cửa **đọc** đồng bộ mới; ghi vào CLAUDE.md cạnh các cửa đọc sẵn có của `notification`
  (nhóm, tin, `identity`, `screening`, `messaging`). Không ghi chéo.

### 6. Không migration

Không bảng, cột, enum mới: nhóm `trust_strikes` đã có; loại sự kiện outbox là chuỗi; hai sự kiện mới không cần bảng.
`pnpm db:drift` phải sạch.

## Risks / Trade-offs

- [Gậy làm mức xuống T1 ngay sau] → hai thông báo có nhắc gần nhau (N49 rồi N57): hai chuyện khác nhau, người dùng cần cả
  hai; không gộp vì `tier.changed` chạy ở transaction khác và không biết vì sao mức đổi.
- [Hai gậy hết hạn cùng lượt] → mỗi gậy một N55; cả hai có thể nói "đã đăng tin lại được" vì cùng đọc trạng thái lúc gửi.
  Chấp nhận — câu vẫn đúng.
- [Tài khoản bị khoá] → N49 nghiêm trọng, N53 khoá vĩnh viễn chỉ vào hộp thư (phiên đã thu hồi, không đẩy được); đọc
  được khi mở khoá. Email khi khoá ngoài change này (proposal, câu 5).
- [Đọc lúc gửi] → sự kiện thử lại muộn vẫn ra câu đúng trạng thái hiện tại; giá là thêm lượt đọc `trust` / `review` mỗi
  thông báo — số lượng nhỏ (gậy, việc nhóm), không phải đường nóng.
- [N36 và trần 2000 việc mở] → `openTasks` đọc tối đa `OPEN_TASKS_CAP`; nhóm vượt trần thì số có thể thấp hơn thật — cùng
  giới hạn đã ghi ở `docs/VIEC-DANG-DO.md` mục 6.
- [Câu 429 đổi chữ] → app hiện `message` của server nguyên văn; không app nào so chuỗi.

## Migration Plan

Không migration. Deploy như thường; sự kiện cũ trong outbox không đổi. App `ghim-app` (đọc lại lúc code, 22/10/2026)
hiện `title` / `body` của mọi loại và mở Cá nhân cho nhóm `trust_strikes`, nhưng **chưa hiện `detail`** — điều luật, ngày
hết hạn, hạn khiếu nại chưa tới mắt người dùng cho tới khi app hiện trường đó (việc của `ghim-app`, `docs/realtime.md`).
