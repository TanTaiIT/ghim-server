# Tasks

**Đã duyệt 17/10/2026** — người dùng chọn Expo Push qua HTTP, làm cả ba phần (design, ghi chú đầu file).

## 1. Dữ liệu và cấu hình

- [x] 1.1 `sessions.push_token`, `push_tickets`, `conversation_presences`; migration; `EXPO_PUSH_URL`, `EXPO_ACCESS_TOKEN`
      trong `env.ts` và hai file `.env.*.example`

## 2. Cổng đẩy và token

- [x] 2.1 `common/push/expo-push.ts` (`PushSender`, Expo qua `fetch`, lô 100, biên nhận) — `expo-push.test.ts` với fetch giả
- [x] 2.2 `identity`: `PUT`/`DELETE /me/push-token`, `pushTargets`, `forgetPushToken` — `push-token.http.test.ts`
- [x] 2.3 `messaging`: `PUT`/`DELETE /me/conversations/{id}/viewing`, `viewingSessions`, `previewOf` — test ở 3.2

## 3. `notification`

- [x] 3.1 Ma trận `messaging` (N47 tin nhắn, gộp theo hội thoại, nhắc mỗi tin); `collapse.alertEvery`; việc
      `notification.push` và `notification.push-receipts`; module nghe `messaging.message.sent`, khai job
- [x] 3.2 `notification-messages.http.test.ts`: báo bên nhận, người gửi không nhận, bị chặn không ai nhận, gộp theo hội
      thoại; push tới máy đã cho phép, chưa cho phép, đã đăng xuất, khoá tài khoản; không đẩy hội thoại đang mở, hội thoại
      khác vẫn đẩy, đã đóng thì đẩy; `DeviceNotRegistered` quên token; biên nhận

## 4. Tài liệu và kiểm tra tích hợp

- [x] 4.1 `docs/realtime.md` (push, token), `docs/messaging.md` (viewing), CLAUDE.md (push không còn "chưa có", module
      `notification`), `docs/VIEC-DANG-DO.md`, `tests/README.md`
- [x] 4.2 `pnpm run check`, `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
