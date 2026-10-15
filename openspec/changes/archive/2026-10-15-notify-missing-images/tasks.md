# Tasks

## 1. Cổng `listing`

- [x] 1.1 `noticeTargets(ids)` ở `listing/read`: người đăng và tiêu đề của tin chưa xoá; tin đã xoá hay không có thì
      vắng (design mục 3); xác minh test DB: tin sống, tin nháp có mặt; tin đã xoá, mã lạ vắng

## 2. `notification`

- [x] 2.1 Ma trận N38, N39 cho `media.image.missing` (design mục 2): người nhận, nhóm, nhắc, câu, gộp theo tin; bỏ qua
      tin đã xoá và loại chủ lạ; `MatrixContext.listingTargets`; xác minh unit test ma trận với ngữ cảnh giả
- [x] 2.2 `notification` nghe `media.image.missing`; xác minh test HTTP: lượt đối chiếu thấy ảnh đại diện mất → hộp
      thư chủ tài khoản có dòng nhóm "tài khoản"; ảnh tin mất → người đăng có dòng nhóm "tin đăng của bạn", hai ảnh
      cùng tin gộp một dòng; tin đã xoá → không dòng nào; hồ sơ và tin không đổi
- [x] 2.3 CLAUDE.md: `notification` nghe cả `media.image.missing`

## 3. Kiểm tra tích hợp

- [x] 3.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift` xanh
