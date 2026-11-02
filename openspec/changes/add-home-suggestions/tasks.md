# Tasks

## 1. Dữ liệu

- [ ] 1.1 Migration: `listing_views`, `search_history`, `accounts.personalized_suggestions`; schema Prisma; `db:drift`
- [ ] 1.2 Con số `retention.activityDays` (90), `suggestion.popularDays` (14)

## 2. Lịch sử thao tác (`listing/activity-history`)

- [ ] 2.1 `listing/activity/activity.repository.ts`: ghi xem (upsert + trần 200), ghi tìm (trùng 10 phút + trần 100),
      đọc cho hồ sơ quan tâm, xoá của một người, dọn theo hạn
- [ ] 2.2 Ghi ở `read.service` `detail()` và `feed()` theo điều kiện của spec; lỗi ghi chỉ log
- [ ] 2.3 `identity`: cột công tắc trên `GET/PATCH /me`; cổng cho `listing` đọc công tắc + tỉnh nhà
- [ ] 2.4 `DELETE /me/activity-history`; xoá tài khoản xoá luôn lịch sử; bước dọn trong `retention.service.ts`

## 3. Gợi ý (`listing/suggestions`)

- [ ] 3.1 `listing/read/suggestion.calc.ts`: hồ sơ quan tâm + điểm (hàm thuần, unit test theo bảng trọng số)
- [ ] 3.2 `suggestion.service.ts`: ứng viên (feed visibility, loại tin của mình / đã lưu / đã hỏi), xếp, trang 20,
      bù bằng "được quan tâm nhiều gần bạn"; cổng `messaging` trả mã tin đã hỏi
- [ ] 3.3 Route `GET /listings/suggestions` + schema; test HTTP theo các scenario

## 4. Tài liệu

- [ ] 4.1 TK 25 thêm dòng hạn lưu; TK 15 (bảng tin) nêu mục gợi ý và công tắc; CLAUDE.md module `listing`, thứ tự change;
      `docs/VIEC-DANG-DO.md` (rà soát pháp lý TK 29 xét thêm hai bảng)

## 5. ghim-app

- [ ] 5.1 `npm run api:sync`; `api` + `queries` cho gợi ý (trang kế), công tắc, xoá lịch sử
- [ ] 5.2 Trang chủ theo ảnh mẫu (theme teal): banner trượt ngang, dải nổi bật thẻ ảnh lớn, "Gợi ý cho bạn" lưới 2 cột + "Xem thêm"; dòng phụ theo cờ cá nhân hoá
- [ ] 5.3 Cài đặt: công tắc "Gợi ý theo hoạt động" + "Xoá lịch sử xem và tìm kiếm" (hỏi lại)
- [ ] 5.4 Thử trên máy ảo trỏ Render: khách thấy "được quan tâm nhiều", người dùng lưu / hỏi / xem vài tin xe máy thì
      gợi ý đổi theo; tắt công tắc thì về như khách; xoá lịch sử

## 6. Kiểm tra

- [ ] 6.1 `pnpm run check`, `build`, `db:drift`, `spec:validate` (ghim-server); `npm run check` (ghim-app)
