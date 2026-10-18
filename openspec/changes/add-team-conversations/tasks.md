# Tasks

## 1. Dữ liệu

- [x] 1.1 `schema.prisma`: enum `conversation_kind`, cột `kind`, `group_id`, `team_pending_since`; `listing_id`,
      `seller_id` NULL được (design mục 1). Migration `add_team_conversations` thêm tay CHECK `conversations_kind_check`,
      partial unique `conversations_one_support`, `conversations_one_group`, partial index hàng hỗ trợ và danh sách quản
      trị; đọc SQL sinh ra trước khi áp
- [x] 1.2 Test DB: mỗi nhánh của CHECK chặn dòng sai loại; hai hội thoại hỗ trợ cùng người, hai hội thoại cùng người +
      nhóm bị chặn; dòng hội thoại về tin cũ vẫn hợp lệ. Xác minh: `pnpm db:drift` không lệch

## 2. Cổng sang module khác

- [x] 2.1 `group.conversationTeam(groupId)` (trên `reviewersOf`), `group.managedGroupIds(accountId)` (nhóm người đó
      đang giữ vai chủ / điều hành viên, không gồm vai treo), `group.groupsByIds`, `group.bannedAmong`; test qua HTTP ở
      nhóm 4 (mất vai, vai treo)
- [x] 2.2 `platform.activeStaffWithScope('support')` (đã có — chỉ quyền `active`); test: quyền treo không nhận báo hiệu
      ở nhóm 6
- [x] 2.3 `sideOf` async cho hội thoại với đội (design mục 2); `countOpenedSince` chỉ đếm `kind = 'listing'`

## 3. Hội thoại hỗ trợ

- [x] 3.1 `POST /me/support/conversation` (design mục 3): mở / mở lại / bỏ ẩn, hai lượt cùng lúc ra một, master 403
- [x] 3.2 Route bàn vận hành `/ops/support/conversations` (danh sách theo hàng, xem, tin nhắn, gửi, đã đọc; design mục
      6): staff gửi hội thoại của chính mình 403, gửi bỏ qua bộ lọc, nhật ký không chứa nội dung
- [x] 3.3 Test HTTP mọi scenario của `messaging/support-chat` (mở, ký tên đội, hàng đang chờ, người dùng nhắn tiếp, quyền,
      staff tự trả lời, quyền treo, staff qua app, người dùng xoá tài khoản, tin rỗng)

## 4. Hội thoại với quản trị nhóm

- [x] 4.1 `POST /groups/{groupId}/conversation` (design mục 3): xem được hồ sơ, trạng thái nhóm, cấm, quản trị tự nhắn,
      không tính hạn mức
- [x] 4.2 Danh sách hội thoại của quản trị ghép hội thoại `group` của các nhóm đang quản trị (design mục 2); gửi / đọc
      chung của đội; nhóm đóng và người bị cấm (design mục 4)
- [x] 4.3 Test HTTP mọi scenario của `messaging/group-admin-chat` (người mở được / không được, hai quản trị cùng thấy,
      mất vai, vai treo, quản trị mới thấy tin cũ, nhóm chưa có quản trị, ký tên nhóm, đổi tên nhóm, rời nhóm, nhóm đóng,
      bị cấm)

## 5. Luật chung của hội thoại

- [x] 5.1 DTO hội thoại và tin nhắn (design mục 5): `kind`, `group`, `role: 'team'`, `counterpart.kind`, `fromMe`,
      `senderId` null phía người dùng, `canOffer` false ngoài hội thoại về tin
- [x] 5.2 Test HTTP các requirement sửa / thêm của `messaging/conversations` (ba loại trong một danh sách, người ngoài
      gồm thành viên thường và quản trị nhóm khác, bộ lọc với quản trị và staff, đọc chung của đội, hội thoại cho biết
      đội), `messaging/blocking` (chặn không áp), `messaging/conversation-deletion` (người dùng xoá, đội trả lời thì hiện
      lại, quản trị xoá 403); test cũ của hội thoại về tin vẫn xanh

## 6. Thông báo, realtime, hạn lưu

- [x] 6.1 Sự kiện `messaging.message.sent` mang `recipientIds`, bên nghe đọc cả dạng cũ (design mục 7); `notification`:
      nhóm `support` / `messages`, tiêu đề theo phía; staff hỗ trợ không nhận hộp thư
- [x] 6.2 Realtime `message:new` tới mọi người nhận; `support:pending { count }` tới người mang quyền `support`
- [x] 6.3 Bên nghe dọn nhóm: xoá hội thoại `group` của nhóm bị dọn, trừ hội thoại đang giữ làm bằng chứng
- [x] 6.4 Test mọi scenario của "Báo tin nhắn của hội thoại với một đội" và "Báo hiệu hàng hỗ trợ cho staff"; test hạn
      lưu: hội thoại với đội chỉ xoá hẳn sau 1 năm không ai nhắn; test payload outbox dạng cũ

## 7. Tài liệu

- [x] 7.1 `docs/messaging.md` (ba loại hội thoại, route mới, trường mới / nullable, mã lỗi mới), `docs/realtime.md`
      (`support:pending`), tài liệu bàn vận hành cho staff hỗ trợ trong `docs/` theo chỗ các hướng dẫn ops hiện có
- [x] 7.2 CLAUDE.md: trạng thái module `messaging`; TK 24 đã sửa luật trong lượt soạn change này — kiểm khớp với spec lần
      cuối

## 8. Kiểm tra tích hợp

- [x] 8.1 `pnpm run check` (gồm test DB, Docker ở máy này), `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`

## Workflow follow-up

- Archive sau `add-price-offers`, trước `add-activity-status`.
- Repo `ghim-app`: `npm run api:sync`, nối "Chat với admin" (Trợ giúp) và "Nhắn quản trị" (trang nhóm).
