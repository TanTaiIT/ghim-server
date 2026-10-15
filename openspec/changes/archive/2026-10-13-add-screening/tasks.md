# Tasks

> **Đã duyệt 12/10/2026**, theo `design.md` đã duyệt cùng ngày. Máy có Docker: test DB / HTTP chạy tại
> máy (`pnpm test`), CI là lớp kiểm thứ hai. `add-listings`, `add-trust-tiers` đã archive.

## 0. Chốt trước khi code

- [x] 0.1 Xác minh phần "Sửa đi kèm" của design đã áp — delta spec `screening/*` theo các câu đã chốt, `identity/profile`
      câu 12; spec `listing/visibility` câu 18 (đã archive); TK 13, 14, 25, 29, 30; CLAUDE.md mục Stack (`sharp`) và thứ
      tự change (`add-image-moderation`). Còn thiếu: 9 khoá mới ở TK 28 và `config-keys.ts` (task 1.3)
- [x] 0.2 Cài `sharp` (đồng ý 12/10/2026, CLAUDE.md mục Stack: "cài khi code `add-screening`"); xác minh `pnpm install`
      trên Windows và image CI (Linux) tải đúng bản dựng sẵn, `pnpm run build` không cần thêm bước

## 1. Schema, migration, con số

- [x] 1.1 Khai enum và 11 bảng của design mục 4 vào `prisma/schema.prisma` (index từng `bandN` của `image_checks` và
      `image_whitelist`), comment `///` cho mọi CHECK viết tay; xác minh `prisma format && prisma validate`
- [x] 1.2 Migration `init_screening` (`--create-only`, đọc SQL, thêm CHECK: `decided_at` ⇔ `outcome` ⇔ `cause`; cổng
      cứng không tắt được; `0 < medium_from < high_from`; cụm ≥ 2 chữ); xác minh `tests/screening.db.test.ts` mỗi CHECK
      (`23514`), unique lượt theo (`listing_id`, `listing_version`, `trigger`), unique `lookup_code`, unique `folded`;
      `pnpm db:drift` sạch
- [x] 1.3 `config-keys.ts` thêm 9 khoá của design mục 13; TK 28 dòng "Máy duyệt" ghi đủ; xác minh
      `tests/config-keys.test.ts`
- [x] 1.4 Khởi tạo lúc khởi động: 12 luật và 3 cổng cứng đúng trọng số TK 14 cùng phiên bản luật 1 — chạy lại không tạo
      thêm (như bảng con số); xác minh test khởi động hai lần

## 2. Phần tính toán thuần (xác minh bằng `pnpm test:unit`)

- [x] 2.1 `phrase.calc.ts`: chuẩn hoá bằng `fold`, so theo dãy chữ nguyên, ghép chữ cái tách rời (≥ 3 chữ một ký tự),
      ngoại lệ trọn chỗ trúng, cụm ≥ 2 chữ; xác minh mọi scenario thuần của spec `banned-phrases` và `identity/profile`
- [x] 2.2 Dấu hiệu, mỗi dấu hiệu một hàm thuần (design mục 6): gõ bừa (âm tiết tiếng Việt, danh sách chữ Latin trong
      `data/`, chuỗi phím, ký tự lặp), liên hệ ngoài sàn (số điện thoại Việt Nam, "zalo", đường link), trùng tin của
      mình (bộ ba chữ cái ≥ 0,9), đăng dồn theo mức, giá bất thường [P10 ÷ 2, P90 × 2] và thiếu mẫu, giá 0 ở danh mục
      giá trị cao, tài khoản mới, bị giữ nhiều, sai danh mục (từ khoá); xác minh mỗi scenario thuần của spec
      `risk-scoring` thành một unit test
- [x] 2.3 `score.calc.ts` + `decide.calc.ts`: trọng số và chế độ theo phiên bản luật (ghi đè danh mục trước), chạy thử
      ghi `trial` không cộng điểm, cụm mơ hồ cộng một lần; dải theo ngưỡng danh mục hay chung; ma trận dải × T0–T3 theo
      nơi đăng; thứ tự kết luận lỗi → cổng cứng → luôn duyệt tay → đánh dấu thiết bị → ma trận; xác minh mọi scenario
      thuần của `machine-decision`, `hard-gates`, `risk-scoring`
- [x] 2.4 `explanation.calc.ts`: `plain` / `fraud`, `fixable[]`, câu chung ba phần không chứa mã luật, cụm, ảnh hay
      "thiết bị"; xác minh mọi scenario thuần của `explanations`, kể cả hai lượt khác tín hiệu chỉ khác `lookupCode`
- [x] 2.5 `dhash.calc.ts` (phần thuần: 64 bit → 5 dải, khoảng cách Hamming) và `price-stats.calc.ts` (P10, P90 trên giá
      khác 0); xác minh unit test, kể cả hai ảnh lệch ≤ 4 bit luôn chung ít nhất một dải

## 3. Nối module có sẵn

- [x] 3.1 `listing`: cổng `ListingScreeningFacts` (`snapshot`, `recentOwnListings`, `submissionsSince`,
      `categoryPriceSamples`, `liveListingsText`, `liveListingsWithImages`); `ListingScreeningPort` thật thay bản tạm;
      người đăng xem tin của mình thấy câu báo của lần giữ gần nhất (`ListingExplanation.latest`); gỡ máy tạm
      `DEV_MACHINE_REVIEW` (env, README, `.env.development.example`); xác minh test DB của cổng và mọi test `listing` cũ
      vẫn xanh
- [x] 3.2 `identity`: `deviceFlagsFor(accountId, deviceHash, at)` thuần, tính cả lượt đang xét (câu 20); cổng
      `NameScreen` — người khác thấy "Người dùng Ghim", `GET /me` trả tên thật kèm `nameHidden`; xác minh scenario của
      `hard-gates` (đánh dấu thiết bị) và delta `identity/profile`
- [x] 3.3 `media`: `readImage(imageId)` (≤ 5 MB) cho dHash; xác minh test kho thật
- [x] 3.4 `trust`: bảng uy tín hỏi `cooldownOf(accountId)`, `HoldExplanation` thật; xác minh delta
      `trust/seller-dashboard` (thời gian chờ không nêu cổng cứng nào)

## 4. Repository

- [x] 4.1 `screening.repository.ts`: lượt (mở, kết luận có điều kiện `decided_at IS NULL`, cùng transaction phát
      `screening.result.recorded`), `image_checks` và tìm ứng viên theo dải, danh sách trắng, luật và phiên bản luật,
      cụm từ, thời gian chờ dưới khoá theo người, thống kê giá, từ khoá danh mục; xác minh test DB và mỗi dòng bảng
      tranh chấp design mục 14 chạy hai lượt song song

## 5. Service và route (test HTTP qua `app.inject`)

- [x] 5.1 Một lượt qua máy (design mục 5): `precheck` (429 `SUBMISSION_COOLDOWN` chỉ cho tin mới), `scoreText` có trần
      `screening.textScoreTimeoutMs` (lỗi → `error`, không ném), `openRun(tx)`, kết luận khi đủ chữ và mọi ảnh, dò cổng
      cứng và thời gian chờ; xác minh `tests/screening-decision.http.test.ts` mọi scenario của `machine-decision`,
      `hard-gates`, `risk-scoring` qua lượt gửi thật
- [x] 5.2 Kiểm ảnh: `media.readImage` → `sharp` → dHash → ứng viên theo dải, bỏ ảnh của chính người đăng và ảnh khớp
      danh sách trắng; tin chỉ hiện khi đủ kết quả ảnh; xác minh `tests/screening-images.http.test.ts` mọi scenario của
      `image-checks` trên kho thật, kể cả ảnh chép lại / nén lại
- [x] 5.3 Cụm từ cấm và luật trên bàn vận hành (`/api/v1/ops/screening`): cụm (thêm, sửa mức, ngoại lệ, bật thật — sớm
      thì bắt buộc lý do, ghi nhật ký — tắt), luật (trọng số, chế độ, ghi đè theo danh mục), dải theo danh mục, danh sách
      trắng, từ khoá danh mục; mỗi lần đổi một phiên bản luật; xác minh `tests/screening-rules.http.test.ts` mọi scenario
      của `banned-phrases`, `rule-management`, quyền master / staff
- [x] 5.4 Câu báo và tra mã: người đăng thấy câu của lần giữ (tự sửa được thì nói cách sửa; gian lận thì câu chung ba
      phần kèm mã); `GET /ops/screening/lookups/:code` cho support và master, gỡ đánh dấu thiết bị qua hỗ trợ; xác minh
      `tests/screening-explanations.http.test.ts` mọi scenario của `explanations`

## 6. Bên nghe, việc nền

- [x] 6.1 `screening.events.ts`: nghe `listing.listing.submitted` → xếp `screening.check-image` cho ảnh còn thiếu;
      `listing` nghe `screening.result.recorded`, `screening.listing.recalled`, `screening.listing.restricted` thật; xác
      minh test qua bộ phát outbox thật, kể cả nhận trùng
- [x] 6.2 `screening.jobs.ts`: `screening.check-image` (song song 4, thử lại 2 lần, hết lượt → `error`),
      `screening.safety-net` mỗi 5 phút (quá 5 phút → `hold` / `timeout`; tin đang hiện thiếu kết quả ảnh → hạn chế
      "máy"), `screening.price-stats` 02:00, `screening.rescan-phrase` khi bật cụm mức chắc (chỉ rút tin đang hiển
      thị); xác minh test đồng hồ cố định cho từng việc, chạy hai lần không làm trùng

## 7. Nối app và tài liệu

- [x] 7.1 `screening.module.ts`; dựng sau `listing` và `trust` trong `buildApp`, nối muộn cổng của `listing`, `identity`,
      `trust`; `Repositories`, `AppServices`, `tests/test-app.ts`; test không bàn về máy duyệt đè cổng `screening` như
      `trust`; Swagger khai mọi route và mã lỗi mới; xác minh `typecheck`, `lint`, `build` và test Swagger
- [x] 7.2 CLAUDE.md (module `screening`, luật 14 bỏ "(chưa có)" nếu có, trạng thái đợt 3), README, `tests/README.md`,
      `docs/` cho app nếu câu báo cần khuôn hiển thị; xác minh `pnpm run format:check`

## 8. Kiểm tra tích hợp

- [ ] 8.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift` xanh; CI xanh. Chạy thử bản build với env dev: tin sạch
      của T1 lên bảng đầy đủ; tin có số Zalo bị hạn chế / giữ đúng ma trận; tin dùng lại ảnh của tài khoản khác bị giữ
      kèm câu chung ba phần và mã tra cứu; hỗ trợ tra được mã
