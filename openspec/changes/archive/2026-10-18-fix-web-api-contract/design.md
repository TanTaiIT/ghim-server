# Design

## Context

Động cơ: proposal.md — Why. Hiện trạng đo được:

- `app.ts` đăng ký CORS với `origin` và `credentials` (cookie chỉ bật khi origin là danh sách cụ thể), không khai
  phương thức → preflight trả `GET,HEAD,POST`. Header xin kèm thì được phản chiếu nguyên văn (`authorization`,
  `content-type`, `x-device-id` đều qua) — chỉ phương thức là thiếu.
- Tài liệu khai xác thực bằng `security` trong schema của từng route; mỗi file route tự khai hằng
  `bearer = [{ bearerAuth: [] }]`. `group.routes.ts` đã có mẫu cho phiên tuỳ chọn:
  `optionalBearer = [{}, ...bearer]` (`{}` trong OpenAPI nghĩa là "không cần xác thực"). Năm route phiên tuỳ chọn của
  `listing/read` chưa khai gì.

Không bảng, không cột, không migration; không module nào đổi quyền sở hữu hay luồng outbox.

## Goals / Non-Goals

**Goals:**

- Mọi phương thức API qua được preflight từ origin được phép, ở cả hai chế độ origin (`*` và danh sách).
- Tài liệu của năm route phiên tuỳ chọn khai đúng hai cách gọi, theo đúng mẫu đã có ở `group.routes.ts`.

**Non-Goals:**

- Tự suy `security` từ `preHandler` của route (xem quyết định 2) — đổi cách khai của mọi route là việc lớn hơn lỗi này.
- Một chốt tự động soi **mọi** route: cần móc vào lúc đăng ký route trong code app, không chỉ trong test — để change
  sau nếu lỗi này lặp lại ở module khác.
- Đổi cách xác thực, luật origin, hay header nào trình duyệt được đọc.

## Decisions

1. **Liệt kê phương thức tường minh: `GET, HEAD, POST, PUT, PATCH, DELETE`.** Thay vì `*`: khi kèm cookie
   (`credentials`, bàn vận hành ở production), trình duyệt coi `*` ở danh sách phương thức là chuỗi `*` chứ không
   phải "mọi phương thức", nên `*` chỉ chạy được ở dev và hỏng đúng ở production. Danh sách tường minh còn ghi lại bề
   mặt API: thêm một phương thức mới (không có trong sáu cái này) thì test preflight đỏ, buộc người thêm nhìn lại CORS.
   Header xin kèm giữ chế độ phản chiếu: cổng chặn là danh sách origin, không phải danh sách header; khai cứng header
   thì mỗi header mới (như `x-device-id` lúc thêm) lại là một lần hỏng trên trình duyệt.
2. **Khai `optionalBearer` trong `read.routes.ts` như `group.routes.ts`, không gom về một chỗ.** Phương án đã cân
   nhắc: transform của tài liệu tự đặt `security` theo `preHandler` (`authenticate` → bắt buộc, `authenticateOptional`
   → tuỳ chọn) — xoá hẳn lớp lỗi này, nhưng các file route gói xác thực vào mảng đặt tên riêng (`user`, `master`,
   `signedIn`, `staff`, `support`… — hơn chục bộ, mỗi bộ là `authenticate` cộng kiểm vai trò), nên transform phải
   bóc từng bộ, và `security` khai ngay cạnh route là thứ người review đọc được. Test giữ cửa cho năm route và một
   route đại diện của hai loại còn lại (spec).
3. **Test tài liệu đọc `/docs/json` của app thật**, không đọc schema trong code: thứ client sinh SDK đọc là tài liệu đã
   phục vụ, và transform Zod → OpenAPI có thể làm rơi trường nếu khai sai chỗ.

## Risks / Trade-offs

- [Mở thêm `PUT`/`PATCH`/`DELETE` cho trình duyệt] → Chỉ origin được phép mới qua; production vẫn bắt buộc danh sách
  cụ thể (env guard đang có). Request ghi vẫn phải qua xác thực và quyền như mọi client khác — CORS không phải lớp quyền.
- [Client đang tự xin Bearer (`ghim-app` `VIEWER`)] → Sau khi sinh lại SDK, hai cách cùng gắn một header giống nhau,
  không xung đột; app gỡ phần tự xin ở repo của nó.
- [Route phiên tuỳ chọn mới ở module khác lại quên khai] → Chưa có chốt tự động (Non-Goals); `anyone` /
  `authenticateOptional` hiện chỉ có ở `listing/read` (5 route) và `group` (1 route, đã khai), nên bề mặt rủi ro
  nhỏ. Hành vi server đã đúng sẵn: test HTTP hiện có đọc tin bằng Bearer (`getOwn`) đều qua — lỗi chỉ ở tài liệu.

## Migration Plan

Không migration. Triển khai như bản sửa thường; rollback là revert commit. Client cũ không bị ảnh hưởng: route vẫn
nhận gọi ẩn danh như trước.
