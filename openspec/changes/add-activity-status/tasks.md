# Tasks

## 1. Dữ liệu và bảng con số

- [ ] 1.1 `schema.prisma`: `accounts.last_seen_at`, `accounts.show_activity` (design mục 2, 3); migration
      `add_activity_status`; khoá `messaging.activityVisibleDays` (1–30, giá trị khởi đầu 7) theo cách các khoá khác được
      thêm (design mục 5); đọc SQL sinh ra trước khi áp
- [ ] 1.2 Test: khoá con số mới ngoài khoảng bị từ chối như các khoá khác. Xác minh: `pnpm db:drift` không lệch

## 2. Kênh realtime và mốc hoạt động

- [ ] 2.1 Cổng `Realtime.onlineAmong(accountIds)`; gateway gọi `onPresence(accountId, at)` khi một kết nối mở và khi
      kết nối cuối cùng của tài khoản đóng (design mục 1, 2); `app.ts` nối vào `identity`
- [ ] 2.2 Test realtime (socket thật như các test realtime hiện có): nối → đang hoạt động, mốc được ghi; hai kết nối,
      đóng một → vẫn hoạt động, mốc chưa ghi lại; đóng cả hai → không hoạt động, mốc là lúc đóng

## 3. Công tắc trong hồ sơ

- [ ] 3.1 `PATCH /me { showActivity }`, `GET /me` trả `showActivity`; xoá tài khoản đặt `last_seen_at` = NULL (design
      mục 6)
- [ ] 3.2 Test HTTP mọi scenario của "Công tắc hiện trạng thái hoạt động"

## 4. Trạng thái trong hội thoại

- [ ] 4.1 Cổng `identity.activityOf` theo lô; `counterpart.activity` trong `describe` theo luật design mục 4
- [ ] 4.2 Test HTTP mọi scenario của `messaging/activity-status` (đang mở app, vừa thoát — làm tròn phút, quá 7 ngày,
      chưa từng nối, hồ sơ công khai không có, chặn hai chiều, người kia đã xoá tài khoản, hội thoại với đội, tắt hai
      chiều, bật lại)

## 5. Tài liệu

- [ ] 5.1 `docs/messaging.md` (`counterpart.activity`, luật hiện), `docs/realtime.md` (kết nối là tín hiệu hoạt động)
- [ ] 5.2 CLAUDE.md: trạng thái module; TK 24 và TK 28 đã thêm luật trong lượt soạn change này — kiểm khớp với spec lần
      cuối

## 6. Kiểm tra tích hợp

- [ ] 6.1 `pnpm run check` (gồm test DB, Docker ở máy này), `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`

## Workflow follow-up

- Archive sau `add-team-conversations` (spec "Chỉ bên kia của hội thoại về tin thấy" nhắc hội thoại với một đội).
- Repo `ghim-app`: `npm run api:sync`, vẽ chấm hoạt động, công tắc trong cài đặt.
