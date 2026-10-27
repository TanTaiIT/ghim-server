# Proposal

## Why

TK 29 hoãn "gói đẩy tin, tin nổi bật" (người đăng trả Xu — kế hoạch `docs/KE-HOACH-GOI-DAY-TIN.md`, hai proposal
`add-wallet`, `add-promotions` còn chờ). Chủ dự án muốn có đẩy tin ngay, nhưng do **người quản trị** làm, miễn phí, trong
phạm vi mình quản lý. Người dùng chốt ngày 27/10/2026:

1. Làm riêng, **miễn phí**, không cần ví. Gói trả Xu để sau và dùng chung chỗ giữ sẵn của `prepare-promotions` (vị trí
   xếp hạng riêng, hạn nổi bật).
2. Hai hiệu ứng, người quản trị chọn mỗi lần: **đẩy lên đầu** (tin đứng như vừa lên bảng rồi trôi dần) và **nổi bật N
   ngày** (vào dải "Tin nổi bật", tối đa 6 tin).
3. Phạm vi: **master** mọi tin; **staff** tin sàn chung thuộc danh mục được giao; **chủ nhóm và điều hành viên** tin của
   nhóm (điều hành đơn vị chỉ tin của đơn vị mình).
4. **Chờ 24 giờ** giữa hai lần đẩy lên đầu cùng một tin; người quản trị không bị trần số lượt mỗi ngày.
5. Người quản trị **được đẩy cả tin của chính mình** (nguyên tắc 2 nói về xử việc, đẩy tin không phải xử việc).
6. **Chưa báo** người đăng khi tin được đẩy — để change sau.

Đáp ứng TK 27 cam kết 3 (mọi thao tác của master vào nhật ký — change này ghi cả staff và quản trị nhóm), cam kết 15 (T0
không có tin đầy đủ ở nơi công khai — tin hạn chế không đẩy được), cam kết 20 (đẩy tin không đổi trạng thái, cờ tạm ẩn,
lý do hạn chế), cam kết 33 (con số chỉnh được). Không thuộc đợt nào của TK 29; nằm trước `add-wallet`, `add-promotions`.

## What Changes

- Người quản trị đẩy một tin đang hiển thị **đầy đủ** trong phạm vi mình: "đẩy lên đầu" đặt lại vị trí xếp hạng về bây
  giờ; "nổi bật N ngày" đặt hạn nổi bật (1 tới `promotion.featuredMaxDays` ngày — đặt lại thì tính từ bây giờ, kéo dài
  hay rút ngắn đều được); "bỏ nổi bật" kết thúc sớm.
- Tin chờ duyệt, đang kiểm, bị gỡ, tạm ẩn, hiển thị hạn chế, đã bán, hết hạn: **không đẩy được** và nói rõ vì sao. Tin
  nổi bật về sau bị hạn chế hay tạm ẩn thì rời dải; hiện lại đầy đủ mà hạn còn thì vào lại.
- Đẩy lên đầu cùng một tin cách nhau ít nhất `promotion.bumpCooldownHours` (giá trị khởi đầu 24 giờ) — sớm hơn bị từ
  chối kèm mốc đẩy lại được.
- Dải "Tin nổi bật": đầu bảng tin sàn chung, đầu từng danh mục, đầu bảng tin nhóm — tối đa
  `promotion.featuredStripSize` (khởi đầu 6) tin, hạn gần hết đứng trước để ai cũng có lượt lên đầu dải. Dải theo đúng
  luật "ai thấy một tin". Tin nổi bật vẫn ở chỗ của nó trong bảng tin bên dưới.
- Người quản trị hỏi được trước một tin: mình có đẩy được không, với vai gì, khi nào đẩy lên đầu lại được, đang nổi bật
  tới đâu — để app chỉ hiện nút khi có quyền.
- Mỗi lần đẩy, đặt nổi bật, bỏ nổi bật ghi vào nhật ký vận hành kèm vai của người làm.

**Cố ý không làm**: ví Xu, người đăng tự mua gói, `extend_expiry` (đã có gia hạn miễn phí); thông báo cho người đăng (câu
6); trần số lượt mỗi ngày của người quản trị; staff đẩy tin trong nhóm (staff chỉ tin sàn chung của danh mục mình); quản
trị nhóm đẩy tin sàn chung mang huy hiệu nhóm mình; danh sách mọi tin đang nổi bật trên bàn vận hành.

## Capabilities

### New Capabilities

- `listing/boosting`: người quản trị đẩy tin lên đầu, đặt và bỏ nổi bật trong phạm vi quản lý — ai được làm, tin nào
  đẩy được, thời gian chờ, nhật ký, hỏi trước quyền đẩy.

### Modified Capabilities

- `listing/visibility`: "Vị trí trên bảng tin" — đẩy lên đầu là thao tác duy nhất đổi vị trí; "Hạn nổi bật chưa dùng"
  thay bằng dải "Tin nổi bật" ở ba bảng tin.

## Impact

- **Code**: `listing` (thao tác đẩy, dải nổi bật, cổng mới tới `platform.staffGrant` và `group.reviewersOf`), con số mới
  nhóm "Đẩy tin" ở `common/config/config-keys.ts`.
- **API**: `GET /api/v1/listings/:listingId/boost`, `POST /api/v1/listings/:listingId/boost`,
  `DELETE /api/v1/listings/:listingId/featured`, `GET /api/v1/listings/featured`,
  `GET /api/v1/groups/:groupId/listings/featured`. `featuredUntil` của tin bắt đầu có giá trị. Không breaking.
- **Migration**: cột `listings.last_bumped_at` (null). Không mất dữ liệu, không SQL viết tay.
- **Tài liệu**: TK 6 (bảng ai được làm gì), TK 14, 19 (vị trí trên bảng tin), TK 28 (con số), TK 29 (hoãn lại);
  `docs/KE-HOACH-GOI-DAY-TIN.md` (đẩy tin của người quản trị đi trước gói trả Xu); CLAUDE.md thứ tự change. Proposal
  `add-promotions` phải sửa delta `listing/visibility` theo bản này trước khi apply.
- **App `ghim-app`**: nút đẩy tin / nổi bật cho người có quyền, dải "Tin nổi bật" ở trang chủ, danh mục, trang nhóm.
