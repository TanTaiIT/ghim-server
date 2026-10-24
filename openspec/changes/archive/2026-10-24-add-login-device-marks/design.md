# Design

## Context

`device_posts` ghi ở bên nghe `listing.listing.submitted` và nuôi ba thứ: đánh dấu gian lận (`requiredDeviceFlags`),
luật xung đột lợi ích (`review` qua `identity.sharedDeviceAccounts`), luật người hỏi mua (`messaging` qua cùng hàm).
Đăng nhập (`openSession` trong `identity.shared.ts`) không nhận mã máy; app chỉ gửi `x-device-id` ở các route đăng
tin. Hạn lưu dữ liệu thiết bị là `device.dataRetentionDays` (180), job `ops/retention` gọi `purgeDeviceData`.

## Goals / Non-Goals

**Goals**: luật xung đột lợi ích và luật người hỏi mua nhận ra tài khoản chung máy kể cả khi một bên chỉ đăng nhập;
không đổi hành vi ba đánh dấu gian lận; không lộ mã máy.

**Non-Goals**: ghi dấu lúc làm mới phiên hay xem tin; dấu máy cho web; đổi cửa sổ 180 ngày.

## Decisions

### 1. Bảng riêng `device_logins`, không ghi vào `device_posts`

`device_posts` là "đã đăng tin từ máy này" và đánh dấu gian lận dựa vào thứ tự lần đăng đầu (`first_posted_at`).
Ghi lượt đăng nhập vào đó sẽ đẩy người nhà chỉ đăng nhập vào ba chỗ của máy và đổi mốc "đăng tin trước lúc khoá" —
spec device-registry nói rõ đăng nhập không được tính. Bảng mới `device_logins(device_hash, account_id,
first_seen_at, last_seen_at)` cùng hình với `device_posts`, CHECK `last_seen_at >= first_seen_at`, FK cascade.

### 2. Ghi trong `openSession`, sau khi phiên mở

Cả đăng nhập mật khẩu lẫn Google đều qua `openSession`; thêm `deviceId: string | null` vào đầu vào, có thì
`upsertDeviceLogin({ deviceHash: hashDeviceId(deviceId, hashKey), accountId, at })`. Băm HMAC như `deviceToken` của
`listing`, nên cùng một máy ra cùng một dấu ở cả hai bảng. Đăng nhập thất bại không tới `openSession` → không ghi.

### 3. `accountsSharingDevice` hợp hai nguồn

Một CTE `UNION ALL` hai bảng (lọc `>= since` từng bảng) rồi tự join theo `device_hash`: A đăng tin, B chỉ đăng nhập
cùng máy → B có trong kết quả của A và ngược lại. `review` và `messaging` không đổi: chúng chỉ gọi hàm này.

### 4. Hạn lưu

`purgeDeviceData` xoá thêm `device_logins.last_seen_at < before`, trả thêm `logins`; `ops/retention` cộng vào tổng.

### 5. Schema header dùng chung

`deviceHeadersSchema` chuyển từ `listing.schema.ts` sang `common/schemas/device-headers.ts`; `listing` và `identity`
cùng import. Header vẫn tuỳ chọn ở tầng schema vì thứ tự lỗi của `listing` (design add-listings mục 5).

## Risks / Trade-offs

- **Người nhà dùng chung điện thoại** giờ cũng bị loại khỏi việc của nhau dù chưa đăng tin — đúng ý TK 16 ("tài khoản
  dùng chung thiết bị"), và luật chỉ loại khỏi hàng chờ, không phạt.
- **Ca test review**: mọi lượt gửi tin của test dùng chung `DEVICE`, nhưng staff trong test không đăng nhập qua
  `/auth/login` (token ký thẳng), nên không có dấu đăng nhập ngoài ý muốn.

## Migration Plan

Một migration `add_device_logins` (bảng, chỉ mục, CHECK, FK). Không mất dữ liệu; `db:drift` sạch. Deploy server rồi
app `npm run api:sync` (chỉ thêm header tuỳ chọn).
