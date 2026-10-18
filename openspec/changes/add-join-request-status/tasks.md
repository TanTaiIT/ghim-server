# Tasks

## 1. Hồ sơ nhóm kèm đơn đang chờ

- [ ] 1.1 `group.schema`: `joinRequest: { id, createdAt, expiresAt } | null` ở cả hai nhánh của `groupViewSchema`
      (design mục 1)
- [ ] 1.2 `group.membership.service.view`: hỏi `findPendingRequest` với `clock()` chỉ cho người đã đăng nhập, không phải
      master, chưa là thành viên (design mục 2, 3)
- [ ] 1.3 Test HTTP mọi scenario của "Người xin thấy đơn đang chờ của mình" (xét duyệt, có mã — hồ sơ chỉ tên, chưa gửi,
      khách và người khác, đã rút, được duyệt, quá hạn bằng đồng hồ đẩy); test hồ sơ hiện có vẫn xanh với trường mới

## 2. Tài liệu

- [ ] 2.1 CLAUDE.md: thứ tự change; TK 9 đã thêm câu trong lượt soạn change này — kiểm khớp với spec lần cuối

## 3. Kiểm tra tích hợp

- [ ] 3.1 `pnpm run check` (gồm test DB, Docker ở máy này), `pnpm run format:check`, `pnpm run build`
