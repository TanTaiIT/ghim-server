# Design

## Context

Động cơ: proposal.md — Why. Hiện trạng:

- `group.membership.service.view` dựng hồ sơ nhóm: master thấy đủ; người ngoài nhóm riêng tư nhận
  `{ visibility: 'name_only', id, name }`; còn lại nhận hồ sơ đủ với `membership` (null khi chưa vào).
- Repository đã có `findPendingRequest(groupId, accountId, now)` — `withdrawRequest` dùng nó, và nó đã loại đơn quá hạn
  theo `now` (đơn quá hạn chưa bị job đổi trạng thái vẫn không tính là đang chờ).
- `joinRequestSchema` (DTO đơn cho quản trị nhóm) mang cả `accountId`, `displayName`, `status`.

## Goals / Non-Goals

**Goals:** người xin thấy đơn của mình ở mọi dạng hồ sơ; không thêm truy vấn cho khách, thành viên, master.

**Non-Goals:** xem proposal — Cố ý chưa làm.

## Decisions

1. **Trường `joinRequest` ở cả hai nhánh của `groupViewSchema`**, kiểu `{ id, createdAt, expiresAt } | null`. Không
   dùng lại `joinRequestSchema`: người xin không cần tên của chính mình hay `status` (chỉ đơn đang chờ mới hiện), và DTO
   hẹp không lộ thêm gì nếu sau này hồ sơ được cache theo người xem.
2. **Chỉ hỏi khi người xem đã đăng nhập, không phải master và chưa là thành viên** — thành viên không thể có đơn chờ
   (duyệt là vào), master không vào nhóm. Đồng hồ là `clock()` của service, như `withdrawRequest`, để đơn quá hạn biến
   mất đúng lúc mà test đẩy được thời gian.
3. **Nhóm `pending_owner` / `closed`**: giữ nguyên các nhánh 404 hiện có, chạy trước khi hỏi đơn — không có đơn nào
   đáng hiện ở nhóm người xem không được thấy.

## Risks / Trade-offs

- [Thêm một truy vấn cho người ngoài nhóm đã đăng nhập] → `findPendingRequest` đi theo unique index một phần
  `group_join_requests_pending_key` (nhóm, tài khoản) `WHERE status = 'pending'` — chính index giữ luật "Gửi đơn trùng";
  không chạy cho khách và thành viên.
