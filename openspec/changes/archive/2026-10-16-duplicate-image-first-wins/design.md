# Design

> **Đã duyệt 16/10/2026.** Người dùng chọn hướng (a) "người đăng trước thắng" ("tôi chọn hướng đề xuất của bạn").

## Context

- `image_checks` một dòng mỗi ảnh; `checked_at` ghi lúc kiểm xong. Dòng `done` không bị kiểm lại; dòng `error` tạm
  (`transient`) được kiểm lại ở lượt gửi sau (T21) và lấy mốc mới — ảnh đó chưa từng kiểm xong trước đó.
- Ứng viên trùng: `duplicateCandidates({ bands, excludeOwner, excludeImageIds })` — mọi dòng `done` của tài khoản
  khác chung ít nhất một dải. Hai chỗ gọi: `conclusion.ts` (cổng của máy) và `facts.service.ts` (`duplicateMatches`,
  màn xử việc của người duyệt).

## Decisions

### 1. "Trước" là lúc kiểm xong, phá hoà bằng mã ảnh

- Ứng viên phải có `(checked_at, image_id) < (checked_at, image_id)` của ảnh đang xét: kiểm xong sớm hơn, hoặc cùng
  mili giây mà mã ảnh nhỏ hơn. Hai ảnh luôn có đúng một ảnh "trước" — hai tài khoản gửi cùng một ảnh cùng lúc thì
  đúng một tin bị giữ.
- `duplicateCandidates` nhận `before: { checkedAt, imageId }`. Ảnh đang xét chưa có `checkedAt` (không `done`) thì
  không so — như hiện nay, chỉ ảnh `done` mới có mã băm.
- Bỏ: so theo lúc tải lên (thứ tự mã `uuidv7` của ảnh) — đúng tinh thần "đăng trước" hơn một chút nhưng dựa vào cách
  sinh mã, không phải một mốc đặt tên rõ; chênh lệch với lúc kiểm xong chỉ vài giây.
- Bỏ: chỉ bỏ ứng viên thuộc tin chờ duyệt / bị từ chối (hướng c) — bản chép được duyệt cho qua vẫn làm tin của chủ
  ảnh bị giữ.

### 2. Dữ kiện cho người duyệt theo cùng luật

- `duplicateMatches` truyền cùng mốc: người duyệt tin của kẻ chép thấy tin gốc (spec `review/task-handling` "Tin bị
  giữ vì ảnh trùng" không đổi); người duyệt tin gốc không thấy bản chép như "ảnh trùng" — tránh nghi nhầm chủ ảnh.
- Tìm "ai đang chép ảnh của tôi" không thuộc change này.

## Risks / Trade-offs

- Kẻ chép kiểm xong trước chủ ảnh (chủ ảnh tải lên muộn hơn bản chép) thì chủ ảnh bị giữ — chấp nhận: máy không biết
  ai chụp, chỉ biết ai có trước; người duyệt quyết.
- Ảnh lỗi tạm được kiểm lại lấy mốc mới: một bản chép kiểm xong trong lúc đó thành "trước". Hiếm (kho ảnh không trả
  lời) và người duyệt vẫn quyết tin bị giữ.
