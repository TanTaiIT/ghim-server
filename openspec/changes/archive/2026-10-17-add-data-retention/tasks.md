# Tasks

**Đã duyệt 17/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. Dữ liệu và cấu hình

- [x] 1.1 Schema: `accounts.purged_at`, `groups.purged_at`, `listings.purge_reminded_for`, `strikes.anonymized_at`,
      bảng `screening_run_stats`, `job_runs`; bỏ FK `conversations.listing_id`, `strikes.account_id`; index cho lượt dọn;
      trigger `audit_log_immutable` cho phép ẩn danh hoá — migration `add_data_retention`, `///` ở model
- [x] 1.2 Khoá `retention.*` trong `config-keys.ts` (+ ràng buộc nhắc trước < hạn xoá), test `config-keys`

## 2. Việc nền và bảng kết quả

- [x] 2.1 `lib/jobs.ts`: `JobOutcome`, `runLog`; `ops.repository.ts` (`job_runs`); bản giả `jobs.fake.ts` ghi `runs`,
      `runScheduled`; `media.jobs.ts` trả `partial` khi còn `next`; `outbox.purge-published` chuyển sang `ops`

## 3. Cổng ở module sở hữu

- [x] 3.1 `listing`: `system/retention.service.ts` — `retentionDue`, `purge` (qua `media.purgeOwners`),
      `softDeleteWhere`, `remindPurge` + sự kiện `listing.purge.reminder`; `media.purgeOwners`
- [x] 3.2 `group.purgeDue` / `purgeClosed`; `identity.purgeDue` / `purgeDeletedAccount` / `purgeDeviceData` /
      `pseudonymOf`, sự kiện `identity.account.purged`; `messaging.retentionDue` / `purge`; `notification.purgeBefore`
- [x] 3.3 `screening.foldRuns` (+ `screening_run_stats`); `trust.strikesOfListings` / `anonymizeDue` /
      `anonymizeStrike(tx)` / `dropLiftedEmailHashes` + nghe `identity.account.purged`; `review.reportHolds` /
      `pseudonymizeDecisions(tx)`; `pseudonymizeAudit(tx)` ở `common/audit`
- [x] 3.4 N48 `listing.purge.reminder` trong `notification.listing-matrix.ts`

## 4. Module `ops`

- [x] 4.1 `evidence-hold.service.ts`, `calc/retention.calc.ts` (mốc, giữ — thuần), `retention.service.ts` (các bước,
      trần thời gian, `partial`, làm tiếp), `ops.jobs.ts`, `ops.routes.ts` (`GET /ops/jobs/runs`), `ops.module.ts`;
      wiring `app.ts` (`AppServices.ops`, `Repositories.ops`, `runLog`)

## 5. Test

- [x] 5.1 `retention.calc.test.ts` (thuần), `job-runs.test.ts` (bọc việc theo lịch: done / partial / failed)
- [x] 5.2 `retention-listings.http.test.ts`: nháp, sai sót / gỡ khỏi nhóm, vi phạm theo gậy, tự xoá, đã bán, hết hạn +
      nhắc N48 + gia hạn, nhóm đóng (tin, thành viên, tin đã chuyển), tài khoản đã xoá (tin, ảnh đại diện → dấu ảnh, hồ
      sơ, hội thoại còn), không mở tin
- [x] 5.3 `retention-hold.http.test.ts`: báo cáo mở / đóng 20 ngày / đóng 40 ngày, hội thoại gửi kèm báo cáo, gậy còn
      hiệu lực, xoá tài khoản khi có báo cáo, đã bán quá hạn có báo cáo, không hiện lại
- [x] 5.4 `retention-data.http.test.ts`: dấu thiết bị, IP phiên, hội thoại (cả hai xoá / một bên / 1 năm / 11 tháng),
      thông báo, kết quả máy gộp, gậy ẩn danh (+ khiếu nại, quyết định, nhật ký), khoá vĩnh viễn giữ dấu băm, gỡ khoá xoá
      dấu băm, quyết định giữ mãi, `job_runs` done / partial + làm tiếp, `GET /ops/jobs/runs`

## 6. Tài liệu và kiểm tra tích hợp

- [x] 6.1 `docs/retention.md` (mới), CLAUDE.md (module `ops`, luật 12 / 22, thứ tự change), `docs/VIEC-DANG-DO.md`,
      `tests/README.md`, `docs/strikes.md` (ẩn danh hoá)
- [x] 6.2 `pnpm run check`, `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
