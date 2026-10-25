# Tasks

Duyệt 25/10/2026: người dùng chốt năm câu ở proposal mục "Đã chốt" (chọn đúng đề xuất).

## 1. Server

- [x] 1.1 `schema.prisma` model `SavedSearch`, giá trị `saved_searches` của enum nhóm thông báo + migration
      `add_saved_searches` (hai CHECK viết tay); test DB: unique (người, khoá), hai CHECK (`saved-searches.db.test.ts`)
- [x] 1.2 `listing` repository: lưu dưới khoá advisory có trần, danh sách, xoá, khớp ngược bằng SQL, xoá theo tài khoản
- [x] 1.3 Cụm `read`: `saved-search.service.ts` — `saveSearch`, `savedSearches`, `deleteSavedSearch`, `savedSearchMatches`
      (xét `canView` bề mặt `feed`); route `GET` / `POST /me/saved-searches`, `DELETE /me/saved-searches/:id`
- [x] 1.4 Bảng con số: `listing.maxSavedSearches` (10), `notification.savedSearchAlertMinutes` (120)
- [x] 1.5 `notification`: nhóm thứ mười, cổng `savedSearchMatches`, dòng ma trận tin mới khớp lượt tìm (gộp theo lượt tìm)
- [x] 1.6 Test HTTP mọi scenario của `listing/saved-searches` (`saved-searches.http.test.ts`); route tin đăng 22;
      cài đặt thông báo đủ mười nhóm

## 2. Tài liệu

- [x] 2.1 TK 6, 24, 28 + PDF; CLAUDE.md thứ tự change; `docs/VIEC-DANG-DO.md`

## 3. `ghim-app`

- [x] 3.1 `npm run api:sync`; dải "Báo cho tôi…" lưu cả bộ lọc qua server; màn "Tìm kiếm đã lưu"; công tắc nhóm thứ
      mười; bấm thông báo mở màn tìm kiếm của lượt tìm
- [x] 3.2 Thử trên máy ảo: lưu lượt tìm, tin mới khớp → thông báo, bấm mở đúng lượt tìm, xoá lượt tìm

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift` (ghim-server); `npm run check` (ghim-app)

## Workflow follow-up

- Archive bằng `/opsx:archive add-saved-searches` sau khi gộp vào `main`, sau `fix-group-task-report-scope`.
