# Design

## Context

Động cơ: proposal.md — Why. Hiện trạng:

- Kênh realtime (`src/common/realtime/realtime.ts`, socket.io trong cùng tiến trình với HTTP — TK 30 "một tiến trình")
  cho mỗi kết nối vào phòng `user:<accountId>` và `session:<sessionId>`; cổng `Realtime` chỉ có `emitToUser`,
  `disconnectUser`, `disconnectSession`.
- `sessions.last_active_at` chỉ đổi khi refresh token — thưa và theo phiên, không đủ cho "lần cuối hoạt động" tới phút.
- `PATCH /me` sửa các trường hồ sơ của tôi (module `identity`); `GET /me` trả cài đặt như `nameHidden`.
- DTO hội thoại dựng một lượt cho cả trang trong `inbox.service` (`describe`), có cờ `locked` (chặn) và `gone`.

## Goals / Non-Goals

**Goals:** đọc trạng thái của cả một trang hội thoại không thêm truy vấn theo từng dòng; không ghi DB theo từng lượt
gọi HTTP; mốc hoạt động đúng tới phút.

**Non-Goals:** xem proposal — Cố ý chưa làm. Không chạy nhiều tiến trình (xem Risks).

## Decisions

1. **"Đang hoạt động" = tài khoản đang có ít nhất một kết nối realtime**, đọc trong bộ nhớ của tiến trình: cổng
   `Realtime` thêm `onlineAmong(accountIds): Set<string>` (kích thước phòng `user:<id>` > 0). App chỉ nối realtime khi
   đang mở (`docs/realtime.md`), nên kết nối là tín hiệu đúng nghĩa "đang mở app"; không cần nhịp tim riêng.
2. **Mốc lần cuối hoạt động là cột của `accounts`** (module `identity` sở hữu): `last_seen_at` TIMESTAMPTZ NULL, ghi khi
   một kết nối mở và khi kết nối **cuối cùng** của tài khoản đóng. Kênh realtime là hạ tầng chung, không ghi bảng của
   module nào: gateway nhận callback `onPresence(accountId)` qua deps, `app.ts` nối vào `identity.recordSeen` — thời
   điểm lấy từ đồng hồ của `identity` (lúc apply: đồng hồ của app, test đẩy được), không từ gateway. Ghi lúc mở để
   tiến trình chết giữa chừng vẫn còn một mốc gần đúng; không ghi ở mỗi request HTTP. Làm tròn tới phút ở DTO, không ở
   cột.
3. **Công tắc là cột của `accounts`**: `show_activity` BOOLEAN NOT NULL DEFAULT true; sửa qua `PATCH /me
{ showActivity }`, đọc ở `GET /me`. Cổng `identity` cho `messaging`: `activityOf(accountIds)` → `{ showActivity,
lastSeenAt }` theo lô — lúc apply: một truy vấn riêng mỗi trang hội thoại (chỉ khi trang có hội thoại về tin), không
   gộp vào `accountSummaries`: cổng đó có nhiều module khác dùng, thêm cột cho riêng một bên là nới hợp đồng của cả bọn.
4. **Luật hiện, tính trong `describe` của `messaging`**: `counterpart.activity = { online, lastActiveAt } | null`, là
   `null` khi hội thoại không phải về tin, `locked`, `gone`, người xem đã tắt, hay người kia đã tắt. Còn lại: `online`
   từ mục 1; `lastActiveAt` = `last_seen_at` làm tròn xuống phút, `null` khi quá `messaging.activityVisibleDays` ngày
   hoặc chưa có. Đang online thì `lastActiveAt` vẫn trả mốc gần nhất — app chỉ đọc nó khi `online = false`.
5. **Bảng con số**: khoá `messaging.activityVisibleDays` (số nguyên ngày, 1–30, giá trị khởi đầu 7) theo cách các khoá
   khác được thêm (phiên bản mới của bảng con số, khoảng hợp lệ — `platform/config-versions`).
6. **Xoá tài khoản**: lượt xoá mềm (`softDeleteAccount`) đặt `last_seen_at` = NULL ngay lúc xoá, và `recordSeen` không
   ghi tài khoản đã xoá — kết nối của nó bị cắt ngay sau lượt xoá, sự kiện ngắt tới sau thì không được viết lại mốc.
   `show_activity` không còn nghĩa nên giữ nguyên.

## Risks / Trade-offs

- [Chạy nhiều tiến trình sau này] → `onlineAmong` chỉ thấy kết nối của tiến trình mình. TK 30 chốt một tiến trình; khi
  tách, cổng này đổi sang adapter dùng chung của socket.io (`fetchSockets` qua adapter) — chỉ một chỗ phải đổi.
- [Máy mất mạng không đóng kết nối ngay] → socket.io tự cắt sau nhịp ping (mặc định cỡ 45 giây); "đang hoạt động" có thể
  trễ chừng ấy — chấp nhận được với một chấm trạng thái.
- [Một người mở app trên hai máy] → Mốc chỉ ghi khi kết nối cuối cùng đóng (phòng `user:<id>` rỗng); đóng một máy vẫn
  "đang hoạt động".
- [Ghi DB mỗi lượt nối / ngắt] → Một UPDATE theo khoá chính mỗi lượt; app nối lại khi đổi mạng hay mở lại app — cỡ vài
  lượt mỗi người mỗi giờ.

## Migration Plan

Một migration `add_activity_status`: hai cột của `accounts` (`last_seen_at` NULL cho mọi tài khoản cũ — "chưa có mốc";
`show_activity` mặc định true), không mất dữ liệu; khoá bảng con số mới theo cách các change trước thêm khoá. Đọc SQL
trước khi áp; production cần `pnpm db:deploy:prod`.
