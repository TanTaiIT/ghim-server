# Design

## Context

Bốn con số nằm ở bốn module: `accounts.created_at` (`identity`), `listings.first_live_at` (`listing`),
`screening_runs.started_at` / `decided_at` + `outcome` (`screening`), `review_decisions.decided_at` + `outcome`
(`review`). `ops` đã là nơi gọi cổng của mọi module cho hạn lưu (`RetentionDeps`), chưa có số liệu nào. Ngày của
người dùng là ngày Việt Nam (`SHOP_TIME_ZONE`, `startOfDayVN` trong `common/time`).

## Goals / Non-Goals

**Goals**: một request trả đủ bảng N ngày; đếm đúng ranh giới ngày Việt Nam; không module nào đọc bảng của module
khác; không lưu thêm gì.

**Non-Goals**: doanh thu; số theo danh mục; biểu đồ dài hạn (90 ngày là trần — xem xu hướng một quý là đủ, dài hơn là
báo cáo, không phải trang chủ).

## Decisions

### 1. Mỗi module một cổng đếm theo ngày, `ops` ghép

`identity.newAccountsByDay(from, to)`, `listing.firstLiveByDay(from, to)` trả `DayCount[]` (`{ day, count }`);
`screening.runsByDay(from, to)` trả `{ day, started, passFull, passLimited, hold }[]`; `review.decisionsByDay(from, to)`
trả `{ day, passed, rejected }[]`. Nửa mở `[from, to)`; `day` là khoá `YYYY-MM-DD` theo giờ Việt Nam. `ops` gọi bốn
cổng song song rồi ghép theo khoá ngày (`calc/daily-stats.calc.ts`, thuần, có unit test), ngày thiếu điền 0.

Phương án bị loại: `ops` tự `$queryRaw` bốn bảng — nhanh hơn một chút nhưng là module đọc bảng của module khác, điều
luật 12 cấm; và mỗi module tự biết cột nào là "mốc" của mình.

### 2. Ranh giới ngày tính trong SQL

`to_char((cột AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD')` — `AT TIME ZONE` trên `timestamptz` trả giờ địa
phương, cùng kết quả với `startOfDayVN` phía TypeScript (Việt Nam không đổi giờ mùa hè). `from` = 00:00 Việt Nam của
ngày `now − (N−1)`; `to` = 00:00 Việt Nam của ngày mai, nên hôm nay đang dở vẫn vào bảng và một lượt ghi đúng lúc
`now` không bị rơi.

### 3. Từ chối của người duyệt

`rejected` đếm quyết định về tin có `outcome` ∈ {`reject`, `remove`, `violation`}; `passed` đếm `pass`. `detach`,
`dismiss`, `restore`, `keep` không phải "đạt hay từ chối một tin" nên không vào hai số này. Chỉ quyết định có
`listing_id`. Tỉ lệ từ chối app tự chia — server trả hai số đếm để app khỏi phải xử số 0.

### 4. Quyền và giới hạn

Master (`requireMaster`) như `/ops/review/stats/*`. `days` 1–90, mặc định 7, sai → 400 ở tầng schema.

## Risks / Trade-offs

- **Bốn truy vấn gom nhóm mỗi lần hỏi**: bảng còn nhỏ, có chỉ mục theo thời gian ở `screening_runs` (phần), chưa có ở
  `accounts.created_at` và `listings.first_live_at`; master hỏi vài lần một ngày. Chậm thì thêm chỉ mục, chưa cần lưu
  sẵn.
- **Lượt máy đã gộp theo tháng** (`screening_run_stats`, sau 180 ngày) không vào bảng này — bảng là 90 ngày gần nhất
  nên không chạm.

## Migration Plan

Không migration. Deploy server rồi app `npm run api:sync`.
