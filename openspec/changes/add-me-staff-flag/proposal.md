# Proposal

## Why

`remove-two-factor` (23/10/2026) bỏ `twoFactorEnabled` khỏi hồ sơ của tôi. App Ghim (`ghim-app`) đang dựa vào chính
trường đó để hiện lối vào bàn vận hành ở trang Cá nhân: chỉ master và staff bật được lớp thứ hai, nên đã bật là staff.
Bỏ trường mà không thay thì staff mất lối vào — master còn `role`, staff không còn tín hiệu nào trong hồ sơ. Lộ ra khi
nối app với bản server bỏ lớp thứ hai; người dùng chốt làm ngay ngày 23/10/2026.

## What Changes

- Hồ sơ của tôi có thêm cờ `staff`: đúng khi tài khoản đang mang quyền staff còn hiệu lực (`platform/staff-permissions`);
  quyền đang treo, đã thu hoặc chưa từng có → sai. Cờ có ở mọi route trả hồ sơ của tôi (`GET /me`, `PATCH /me`,
  `PUT /me/avatar`, `DELETE /me/avatar`).
- Hồ sơ công khai không có cờ này.

**Cố ý không làm**:

- Không trả phạm vi hay danh mục được giao: app chỉ cần biết có lối vào; phạm vi vẫn do server kiểm ở từng route
  `/ops/*`. Ẩn tab theo phạm vi là change riêng khi app cần.
- Không đổi luật bàn vận hành hay luật treo quyền.

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `identity/profile`: thêm requirement "Hồ sơ của tôi cho biết quyền staff".

## Impact

- **Code**: `identity` — `toMe` nhận thêm cờ, mặt service tài khoản hỏi quyền qua cổng `PrivilegeSource` đã có (không
  đọc bảng của `platform`); schema Zod `meSchema`.
- **API**: thêm `staff: boolean` vào hồ sơ của tôi. Không breaking.
- **Migration**: không.
- **Client** `ghim-app`: `opsAccess = role === 'master' || staff`, rồi `npm run api:sync` — làm ở repo app cùng lượt.
