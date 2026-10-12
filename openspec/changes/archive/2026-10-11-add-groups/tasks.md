# Tasks

> Đã duyệt 11/10/2026. Làm cùng lượt với `add-notification-core` (làm `add-groups` trước, archive trước).

## 0. Chốt trước khi code

- [x] 0.1 Sửa proposal, delta spec theo các câu trả lời đã duyệt ở design mục 2 (thêm scenario cho: lời giao chủ có hạn, chủ cũ về thành viên, master giao đè, đề cử thiếu chủ, khoá do hệ thống tự mở, đơn vị con, danh sách lớp, lời mời không dò email, đổi cách vào huỷ đơn, gỡ cấm, nhóm khoá chỉ đọc, thông báo của nhóm); sửa TK 9, 10, 28 cùng lượt; xác minh `pnpm run spec:validate` xanh

## 1. Schema và migration

- [x] 1.1 Khai enum và 9 bảng của design mục 3 vào `prisma/schema.prisma`, comment `///` cho mọi ràng buộc viết tay; xác minh `pnpm exec prisma format && pnpm exec prisma validate` qua
- [x] 1.2 Sinh migration `init_group` bằng `migrate dev --create-only`, đọc SQL, thêm CHECK trạng thái ↔ thời điểm, CHECK cài đặt theo chế độ, partial unique (một chủ mỗi nhóm, một đơn chờ, một lời mời chờ, một lời giao chủ chờ, mã nhóm); xác minh `pnpm db:migrate` áp được và `pnpm db:drift` ra "No difference detected"
- [x] 1.3 `tests/group.db.test.ts`: mỗi CHECK (23514) và partial unique (P2002) của migration, FK sang `accounts` và `group_units`; xác minh xanh

## 2. Phần tính toán thuần

- [x] 2.1 `group-state.calc.ts`: bảng đường chuyển của design mục 4 (ai, từ đâu, sang đâu); xác minh unit test mọi ô hợp lệ và mọi ô bị từ chối
- [x] 2.2 `membership.calc.ts`: thứ tự xét vào nhóm (design mục 5), luật đơn (7 ngày sau từ chối, hạn 21 ngày), `roleEligibility`; xác minh unit test từng nhánh, kể cả master và người bị cấm
- [x] 2.3 `badges.calc.ts`: `badgeEligible` (design mục 7); xác minh unit test mọi scenario của spec `badges`
- [x] 2.4 Sinh mã nhóm (Crockford, độ dài từ bảng con số) và chọn đề cử thiếu chủ (design mục 2 câu 4); xác minh unit test bộ chữ, hoà ngày nhận vai, không có ai cấp cả nhóm

## 3. Repository

- [x] 3.1 `group.repository.ts`: lập nhóm, đọc hồ sơ, tìm theo `name_folded`, đổi trạng thái có điều kiện, cài đặt, mã, đơn vị; sự kiện outbox và nhật ký master trong cùng transaction; xác minh `tests/group.repository.db.test.ts` mỗi ghi có điều kiện trả đúng khi trạng thái đã đổi
- [x] 3.2 Thành viên, cấm, đơn, lời mời, danh sách lớp: khoá cặp (nhóm, người) và khoá theo người cho trần 3 đơn (design mục 9); xác minh test DB song song: hai quản trị duyệt một đơn → một thành; bấm tham gia đua với cấm → không còn là thành viên; 4 đơn song song → đúng 3
- [x] 3.3 Vai và lời giao chủ: nhận lời đổi chủ cũ → thành viên và người nhận → chủ trong một transaction; thiếu chủ, chủ cũ trở lại; xác minh test DB: nhận lời đua với huỷ, chủ cũ trở lại đua với nhận lời của người được giao, không bao giờ có hai chủ
- [x] 3.4 Thông báo của nhóm: ghi, đếm trong ngày theo nhóm, đọc theo phạm vi đơn vị; cổng `memberIds(groupId, unitId?, cursor)` cho `notification`; xác minh test DB phân trang đủ người, không trùng

## 4. Service

- [x] 4.1 Vòng đời: lập (master), lời giao lần đầu, nhận / từ chối, khoá / mở khoá (lý do, `GROUP_OWNER_REQUIRED`), đóng (huỷ đơn, lời mời, lời giao, mã); xác minh `tests/group-lifecycle.http.test.ts` mọi scenario của spec `group-lifecycle` và các scenario mới của task 0.1
- [x] 4.2 Chế độ và cài đặt: đổi chế độ (cùng phía có hiệu lực ngay, công khai → riêng tư qua trạng thái chuyển và xong ngay khi chưa có tin, riêng tư → công khai), nhận tin người ngoài, hiện tên, kiểu bảng tin, mô tả, đổi mã, đổi cách vào huỷ đơn; xác minh `tests/group-modes.http.test.ts` mọi scenario của spec `group-modes`
- [x] 4.3 Vào nhóm: tham gia, đơn (gửi, rút, duyệt, từ chối, hạn kiểm lúc thao tác), lời mời (theo email không dò được), danh sách lớp, mã; xác minh `tests/group-membership.http.test.ts` mọi scenario vào nhóm của spec `membership`
- [x] 4.4 Thành viên: danh sách (chỉ quản trị), xếp đơn vị, tự rời (chủ phải chuyển trước), gỡ, cấm, gỡ cấm, điều hành viên đơn vị chỉ trong đơn vị mình, điều hành viên không xử nhau; xác minh cùng file test, mọi scenario còn lại của spec `membership`
- [x] 4.5 Vai: chuyển chủ, master giao đè, bổ nhiệm / bãi nhiệm / đổi phạm vi điều hành viên, việc hằng ngày lúc thiếu chủ, master không bị chặn; xác minh `tests/group-roles.http.test.ts` mọi scenario của spec `group-roles`
- [x] 4.6 Huy hiệu: `GET /me/group-badges`, người ngoài chỉ thấy tên nhóm riêng tư, `group.badge.rights_changed` ở mọi chỗ quyền có thể đổi; xác minh `tests/group-badges.http.test.ts` mọi scenario của spec `badges`
- [x] 4.7 Thông báo của nhóm: gửi (phạm vi, độ dài, 5 / ngày → `ANNOUNCEMENT_LIMIT`, trạng thái nhóm), xem lại; xác minh test HTTP mọi scenario của requirement mới ở task 0.1

## 5. Nối module

- [x] 5.1 `group.events.ts`: nghe `identity.account.locked` (thiếu chủ / tạm khoá, đề cử), `unlocked` (chủ cũ trở lại, khoá do hệ thống tự mở), `deleted` (rời mọi nhóm, huỷ đơn, lời mời, lời giao); xác minh test qua bộ phát outbox thật: khoá chủ → thiếu chủ có đề cử; mở khoá → trở lại; khoá chủ của nhóm không còn điều hành viên → tạm khoá
- [x] 5.2 Cổng `ownership.ownsAnyGroup` vào `identity`; `softDelete` chặn chủ nhóm; xác minh mọi scenario của delta `identity/account-deletion`
- [x] 5.3 `group.jobs.ts`: `group.expire-pending` và `group.ownerless-timeout` mỗi giờ; xác minh test với đồng hồ cố định: đơn ngày 22, lời mời ngày 15, thiếu chủ ngày 31 đổi đúng trạng thái và phát sự kiện; chạy hai lần không phát trùng
- [x] 5.4 `group.module.ts` (route, bên nghe, việc nền), thêm vào `buildApp`, `Repositories`, `AppServices`, `tests/test-app.ts`; xác minh `pnpm run check` xanh

## 6. Route và tài liệu

- [x] 6.1 Schema Zod và route app + bàn vận hành của design mục 17, Swagger khai mọi mã lỗi; xác minh test Swagger liệt kê đủ route nhóm và mã lỗi của từng route
- [x] 6.2 CLAUDE.md (module `group`, trạng thái đợt 1), README, `tests/README.md`; xác minh `pnpm run format:check`

## 7. Kiểm tra tích hợp

- [x] 7.1 `pnpm run check`, `pnpm db:drift`, `pnpm run build` xanh; bản build khởi động với env dev và đi hết một vòng: master lập nhóm → giao chủ → nhận → thành viên gửi đơn → duyệt → đóng nhóm
