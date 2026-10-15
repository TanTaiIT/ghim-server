# Tasks

Theo `design.md`. Test HTTP, DB chạy trên CI (PR nháp nhánh `add-listings`); máy dev chạy `test:unit`.

## 1. Nền: bảng và phần tính thuần

- [x] 1.1 Migration `init_review` (design mục 2): enum `review_reason`, `review_task_status`, kết quả, nhận định;
      bảng `review_tasks`, `review_decisions`, `review_reason_templates` (sáu lý do khởi đầu),
      `review_sample_candidates`; partial unique một việc mở mỗi tin; CHECK viết tay; cột `listings.fault_reason`;
      xác minh test DB: hai việc mở cùng tin bị chặn, việc mở thiếu lý do bị chặn, nhận việc thiếu cột bị chặn;
      `db:drift` sạch
- [x] 1.2 `review/calc`: định tuyến theo chuỗi TK 16 có loại người (design mục 4), số hàng và hạn khi gộp, bỏ lý do,
      lấy mẫu theo rủi ro, tỉ lệ bị lật, tỉ lệ máy quá tay, tỉ lệ hậu kiểm tuần; xác minh `*.calc.test.ts`

## 2. Cổng của module khác

- [x] 2.1 `listing`: `review` nhận `after(tx)`, `approve` gỡ `machine`, `reject`/`remove` ghi `fault_reason` và người
      đăng thấy nó; `confirmLive`, `detachByGroup` (kiểm `version`); `reviewSubject`, `forReviewer`,
      `pendingInGroup`; xác minh test HTTP `listing` (các ca cũ vẫn xanh) và test mới cho ba thao tác
- [x] 2.2 `identity` `sharedDeviceAccounts` (180 ngày), `masterIds`; `trust` `cleanCount`; `screening` `runOf`,
      `duplicateMatches`; `group` `reviewersOf`; `platform` `activeStaffByCategory` và sự kiện
      `platform.staff.changed`; xác minh test DB từng cổng, test sự kiện của `platform`

## 3. Sinh, gộp, huỷ việc

- [x] 3.1 Repository upsert có gộp, bỏ lý do, huỷ (design mục 3); bên nghe sự kiện (design mục 7); bước khởi động
      sinh việc cho tin đang chờ duyệt từ trước; xác minh test DB hai lối sinh cùng lúc ra một việc, test HTTP các
      scenario sinh việc, gộp, bản sửa, rút về nháp của spec `review/queues`
- [x] 3.2 `review` cài `OpenWork.blocksPlacement` cho `listing`; xác minh test HTTP đổi nơi đăng khi tin đang có việc
      mở → 409 `PLACEMENT_LOCKED`

## 4. Hàng chờ, nhận việc, xung đột lợi ích

- [x] 4.1 Route hàng chờ và chi tiết việc — bàn vận hành và app cho điều hành nhóm (design mục 11); định tuyến theo
      danh mục, nhóm, đơn vị, master; bối cảnh người xử thấy; xác minh test HTTP spec `review/queues` (việc vào hàng
      của ai, xem hàng chờ) và `review/task-handling` (người xử thấy đủ bối cảnh)
- [x] 4.2 Nhận việc 10 phút, hai người nhận cùng lúc, trả việc khi mất vai hay mất quyền staff (sự kiện `group`,
      `identity`, `platform`); xác minh test HTTP spec `review/task-handling` và delta `platform/staff-permissions`
- [x] 4.3 Không xử việc của mình, chuỗi chuyển tiếp trong nhóm và trên sàn, việc cần hai người; xác minh test HTTP
      spec `review/conflict-of-interest`

## 5. Quyết định

- [x] 5.1 Quyết định trong cùng transaction với tin: đạt (bắt buộc nhận định máy với việc máy giữ), sai sót, gỡ khỏi
      nhóm, bác; kiểm thứ tự lỗi (design mục 5); nhật ký; mẫu người duyệt 5% trừ master; xác minh test HTTP spec
      `review/decisions`
- [x] 5.2 Gỡ trực tiếp, khôi phục tin sàn; lý do mẫu do master soạn; xác minh test HTTP các requirement tương ứng

## 6. Nhóm chuyển lên và vòng đời nhóm

- [x] 6.1 Gỡ khỏi nhóm kèm "trái quy định sàn" sinh việc hàng 4, gỡ khỏi nhóm trực tiếp; đóng nhóm, rời / gỡ / cấm,
      vào lại nhóm; xác minh test HTTP spec `review/group-escalation`, delta `group/group-lifecycle`,
      `group/membership`

## 7. Job và thông báo master

- [ ] 7.1 Job mỗi phút, mỗi giờ, mỗi tuần (design mục 9); xác minh test với job giả và đồng hồ đẩy tay: quá hạn chuyển
      master, mẫu quá hạn tự huỷ, lấy mẫu, nhắc master, cảnh báo sắp chạm hạn, cảnh báo hậu kiểm tuần
- [ ] 7.2 `notification` N40–N42 cho master (design mục 10); xác minh unit test ma trận và test DB hộp thư master

## 8. Số liệu cho master

- [ ] 8.1 Bảng tồn, tỉ lệ bị lật theo người duyệt, tỉ lệ máy quá tay theo luật; xác minh test HTTP spec
      `review/post-review` (tỉ lệ bị lật) và delta `screening/rule-management`

## 9. Tài liệu

- [ ] 9.1 CLAUDE.md: module `review` (bảng Module, cụm, cổng, sự kiện, mã lỗi), mục "(chưa có)" liên quan; `docs/review.md`
      cho bàn vận hành và app (hàng chờ, nhận việc, quyết định, mã lỗi); `docs/VIEC-DANG-DO.md` bỏ dòng "tin bị giữ
      không có đường ra", thêm "ghi dấu máy lúc đăng nhập của staff"

## 10. Kiểm tra tích hợp

- [ ] 10.1 `pnpm run check` (CI), `pnpm run build`, `pnpm db:drift` xanh
