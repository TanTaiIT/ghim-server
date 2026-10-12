# Tasks

> **Đã duyệt 12/10/2026**, theo `design.md` đã duyệt cùng ngày. Máy có Docker: test DB / HTTP chạy tại
> máy (`pnpm test`), CI là lớp kiểm thứ hai. Làm sau khi `add-listings` archive (proposal, mục Impact).

## 0. Chốt trước khi code

- [x] 0.1 Xác minh phần "Sửa đi kèm" của design đã áp — delta spec `trust/trust-tiers` (câu 1, 2, 3, 4, 6, 9),
      `trust/quotas` (câu 8), `group/group-roles` (câu 7); TK 20, 28, 5; design `add-listings` (`shown_ms` /
      `shown_since`, `fault`, `trust.tier.changed`). Kiểm 12/10/2026: đã có cả, còn thiếu khoá
      `trust.cleanShownDays` (task 1.3); xác minh `pnpm run spec:validate` xanh
- [x] 0.2 `add-listings` đã archive (spec `listing/*` vào `openspec/specs/`) trước khi archive change này

## 1. Schema, migration, con số

- [x] 1.1 Khai enum và 3 bảng của design mục 3 vào `prisma/schema.prisma` (`trust_clean_listings` PK `listing_id`,
      không FK sang `listings`; `trust_tiers` PK `account_id`; `trust_tier_changes` index (`account_id`, `at`)), comment
      `///` cho mọi CHECK viết tay; xác minh `pnpm exec prisma format && pnpm exec prisma validate`
- [x] 1.2 Migration `init_trust` (`migrate dev --create-only`, đọc SQL, thêm CHECK `voided_at` ⇔ `void_cause`); xác
      minh `tests/trust.db.test.ts`: CHECK (`23514`), PK một dòng mỗi tin, FK sang `accounts`; `pnpm db:drift` sạch
- [x] 1.3 `config-keys.ts` thêm `trust.cleanShownDays` 7; xác minh `tests/config-keys.test.ts`

## 2. Phần tính toán thuần (xác minh bằng `pnpm test:unit`)

- [x] 2.1 `tier.calc.ts` `computeTier`: cửa sổ 7 ngày **dời** (design mục 4), mức cao nhất đủ cả tuổi lẫn tin sạch,
      `next` (ngày tuổi và tin sạch còn thiếu); xác minh mỗi scenario thuần của spec `trust/trust-tiers` thành một
      unit test, thêm năm tin cùng ngày qua ba ngày liền, dời qua nhiều cửa sổ, chạy hai lần cùng đầu vào ra cùng
      kết quả
- [x] 2.2 `quota.calc.ts` `quotaDecision`: lượt làm tăng tin sống (`submit`, `move`, `renew_expired`, gửi lại từ bị
      từ chối / bị gỡ) cần `live < cap`; `renew_early` cần `live <= cap`; sửa tin đang hiển thị / chờ duyệt không xét
      trần; mọi lượt xét nhịp gửi kèm `retryAt`; trần người ngoài; xác minh mỗi scenario thuần của spec `trust/quotas`
- [x] 2.3 Dấu dữ kiện `facts_hash` (SHA-256 của dữ kiện chuẩn hoá + phiên bản bảng con số): thứ tự đầu vào không đổi
      dấu; xác minh unit test

## 3. Nối module có sẵn

- [x] 3.1 `listing` lộ cổng cho `trust` (đọc bằng `tx` của lượt gửi khi cần): `ListingQuotaFacts` (đếm tin sống —
      đang kiểm, chờ duyệt, đang hiển thị không tạm ẩn, chưa xoá; lượt gửi trong một giờ và lượt sớm nhất; tin sống
      của người ngoài trong nhóm; danh sách tin chiếm chỗ: mã, tiêu đề, trạng thái), `ListingDashboardFacts` (tin
      hạn chế kèm lý do, tin chờ duyệt), `shownCandidates({ minShownMs, since })`; `ListingTrustPort.assertCanSubmit`
      nhận thêm `listingId`, trạng thái gốc và cờ người ngoài (từ ảnh chụp của `lockForPosting`); xác minh test DB
      của từng cổng và mọi test `listing` cũ vẫn xanh
- [x] 3.2 `group`: cổng `GroupTrustPort.tierOf`; `requireEligible` thêm "T1 trở lên" → 409 `TRUST_TIER_TOO_LOW` ở
      bổ nhiệm điều hành viên và lúc bấm đồng ý nhận chủ (master giao hay chủ cũ chuyển); helper test
      (`createActiveGroup`, `appointModerator`) dựng người nhận vai ở T1 — ghi thẳng `trust_tiers` như dữ liệu nền;
      xác minh mọi test nhóm cũ vẫn xanh
- [x] 3.3 `identity`: `trust` nghe `identity.account.deleted` → xoá `trust_tiers` của tài khoản (dữ kiện tin sạch ở
      lại cho `add-data-retention`); xác minh test qua bộ phát outbox thật
- [x] 3.4 Cổng tạm: `BuyerInterest` (luôn sai tới `add-messaging`), `HoldExplanation` (câu "đang chờ người duyệt" cho
      mọi tin tới `add-screening`); xác minh test dựng `trust` với cổng giả đè được cả hai

## 4. Repository

- [x] 4.1 `trust.repository.ts`: ghi tin sạch `ON CONFLICT DO NOTHING`; đặt / gỡ `voided_at` bằng upsert (thêm dòng
      `clean_at` trống nếu chưa có — design mục 13); ghi mức có điều kiện `facts_hash` cũ, cùng transaction ghi
      `trust_tier_changes` và sự kiện `trust.tier.changed`; danh sách tài khoản cần tính lại cho lượt hằng ngày;
      xác minh test DB và mỗi dòng bảng tranh chấp của design mục 13 chạy hai lượt song song

## 5. Service và route (test HTTP qua `app.inject`)

- [x] 5.1 `recompute(accountId)`: gom dữ kiện → `computeTier` → ghi có điều kiện; không ghi gì khi mức và dấu không
      đổi; ghi kèm phiên bản bảng con số; `tierOf` đọc dòng đã lưu (chưa có = T0); xác minh
      `tests/trust-tiers.http.test.ts` mọi scenario của spec `trust/trust-tiers` qua luồng thật (đồng hồ đẩy theo
      ngày) — trừ "báo cáo đúng / bị bác" gọi thẳng cổng void của service (bên phát ở `add-reports`) và "có người hỏi
      mua" đè cổng `BuyerInterest`
- [x] 5.2 `assertCanSubmit`: khoá theo người (`pg_advisory_xact_lock`) trong transaction gửi của `listing`, đếm sau
      khoá, 409 `LISTING_QUOTA_EXCEEDED` kèm `details.occupying` và `details.howTo`, 429 `SUBMISSION_RATE_LIMITED` kèm
      `retryAt`, 409 `OUTSIDER_QUOTA_EXCEEDED`; xác minh `tests/trust-quotas.http.test.ts` mọi scenario của spec
      `trust/quotas`, kể cả hai lượt gửi song song ở 9/10 tin
- [x] 5.3 `GET /me/trust` (bảng uy tín): mức, `next`, hạn mức (tin sống / trần, lượt gửi còn lại,
      `nextSubmissionAt`), tin hạn chế kèm lý do, tin chờ duyệt kèm câu của `HoldExplanation`; xác minh
      `tests/trust-dashboard.http.test.ts` mọi scenario của spec `trust/seller-dashboard` — các ca "dấu hiệu gian lận"
      (cụm từ cấm, thiết bị, ảnh trùng, đăng dồn) cần `add-screening`: ở đây chỉ kiểm câu chung, ghi rõ phần chờ
- [x] 5.4 Vai trong nhóm theo mức; xác minh mọi scenario của delta `group/group-roles` (T0 bị từ chối, T1 được, tụt
      mức giữa lúc giao và lúc đồng ý, tụt mức không mất vai)

## 6. Bên nghe, việc nền

- [x] 6.1 `trust.events.ts`: `listing.state.changed` sang `sold` (được thấy ≥ `trust.soldCountsCleanAfterDays` và có
      người hỏi mua → tin sạch, tính lại ngay); sang `removed` / `rejected` với lỗi vi phạm → void; từ hai trạng thái
      đó về `live` → gỡ void; tính lại ngay; phát `trust.tier.changed` — `listing` gỡ "tài khoản mới" khi lên T1;
      xác minh test qua bộ phát outbox thật, kể cả nhận trùng
- [x] 6.2 `trust.jobs.ts` `trust.recompute-daily` 00:30 Asia/Ho_Chi_Minh: tin vượt `trust.cleanShownDays` thời gian
      được thấy (`shownCandidates`, cửa sổ 48 giờ để lượt lỡ một ngày vẫn bắt kịp) thành tin sạch; tính lại tài khoản
      vừa chạm mốc tuổi, có tin sạch vừa ra khỏi hàng dời, còn mang phiên bản bảng con số cũ; xác minh test đồng hồ cố
      định: lên T1 ngày 8, chạm mốc tuổi, bảng con số mới áp ở lượt kế, chạy hai lần không ghi trùng

## 7. Nối app và tài liệu

- [x] 7.1 `trust.module.ts`; dựng sau `listing` trong `buildApp`, thay bản tạm `ListingTrustPort` và nối
      `GroupTrustPort` (nối muộn như `PublicListingCounter`); `AppDeps.trust` vẫn đè được cho test; `Repositories`,
      `AppServices`, `tests/test-app.ts`; test không bàn về hạn mức đè `trust` để nhịp gửi T0 (3 lượt / giờ, đồng hồ
      test đứng yên) không chặn luồng của chúng; Swagger khai `GET /me/trust` và mã lỗi mới; xác minh `typecheck`,
      `lint`, `build` và test Swagger
- [x] 7.2 CLAUDE.md (module `trust`, `buildApp` nhận cổng thật, luật 18 bỏ "(chưa có)", trạng thái đợt 2), README,
      `tests/README.md`; xác minh `pnpm run format:check`

## 8. Kiểm tra tích hợp

- [ ] 8.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift` xanh; CI xanh. Chạy thử bản build với env dev: tài khoản
      mới gửi tới lượt thứ 4 trong giờ thì 429 kèm thời điểm gửi lại; `GET /me/trust` khớp; chạy tay
      `trust.recompute-daily` sau khi đẩy dữ liệu dev qua 7 ngày được thấy thì lên T1 và tin hết lý do "tài khoản mới"
      — 12/10/2026 ở máy: `check` (typecheck, lint, 1634 test, spec:validate), `test:unit`, `format:check`, `db:drift`,
      `build` xanh. Bản build với env dev: tài khoản mới T0, lượt gửi vượt nhịp nhận 429 kèm `retryAt` (DB dev đặt
      `quota.submitsPerHourT0` = 4 nên lượt thứ 5 mới chặn — đúng bảng con số có phiên bản), `GET /me/trust` khớp; lùi
      mốc dữ liệu dev 8 ngày rồi chạy lượt hằng ngày: tin thành sạch, lên T1, tin hết "tài khoản mới". Còn CI: chờ push.
