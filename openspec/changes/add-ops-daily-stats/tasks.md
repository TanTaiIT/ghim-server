# Tasks

Duyệt 24/10/2026 (người dùng: "làm việc tiếp theo").

## 1. Server

- [x] 1.1 `common/time`: `dayKeyVN`, `DayCount`, `DAY_MS` xuất ra (design mục 2)
- [x] 1.2 Cổng đếm theo ngày: `identity.newAccountsByDay`, `listing.firstLiveByDay`, `screening.runsByDay`,
      `review.decisionsByDay` (repository SQL + service) (design mục 1)
- [x] 1.3 `ops`: `calc/daily-stats.calc.ts` (khoá ngày, khoảng, ghép điền 0; unit test), `daily-stats.service.ts`,
      schema `dailyStatsQuerySchema` / `dailyStatsSchema`, route `GET /ops/stats/daily` (master)
- [x] 1.4 Test HTTP mọi scenario của spec `ops/daily-stats` (`tests/ops-daily-stats.http.test.ts`)

## 2. Tài liệu

- [x] 2.1 `docs/VIEC-DANG-DO.md` mục 8; CLAUDE.md thứ tự change

## 3. `ghim-app`

- [x] 3.1 `npm run api:sync`; `opsApi.dailyStats`, `useDailyStats`; ô "Hôm nay" của `app/ops/(tabs)/home.tsx` (số hôm
      nay + bảng 7 ngày; staff giữ câu "chỉ master"); `npm run typecheck`, `lint`, `test`
- [x] 3.2 Thử trên máy ảo: master mở trang chủ bàn vận hành thấy số hôm nay khớp API

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run build` (ghim-server)

## Workflow follow-up

- Archive bằng `/opsx:archive add-ops-daily-stats` sau khi gộp vào `main`.
