# Tasks

Duyệt 25/10/2026 (người dùng chọn "Master · theo tháng").

## 1. Server

- [x] 1.1 `screening` repository: lượt đã kết luận theo tháng × kết quả × dải, và mã luật trúng nhiều nhất — mỗi truy vấn
      cộng `screening_runs` với `screening_run_stats`, tháng tính như `foldRunsBefore`
- [x] 1.2 `ops/stats.service.ts` (điền tháng trống, tên luật) + route `GET /ops/screening/stats` (master)
- [x] 1.3 Test HTTP mọi scenario của `screening/run-stats` (`screening-stats.http.test.ts`)

## 2. Tài liệu

- [x] 2.1 TK 14 đoạn "Số liệu của máy" + PDF; CLAUDE.md thứ tự change; `docs/VIEC-DANG-DO.md`

## 3. `ghim-app`

- [x] 3.1 `npm run api:sync`; màn "Số liệu máy duyệt" ở "Thêm" của bàn vận hành (master)
- [x] 3.2 Thử trên máy ảo: master mở màn, số khớp server

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run build` (ghim-server); `npm run check` (ghim-app)

## Workflow follow-up

- Archive bằng `/opsx:archive add-screening-stats` sau khi gộp vào `main`, sau `add-home-province`.
