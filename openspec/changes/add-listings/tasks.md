# Tasks

> **Đã duyệt 12/10/2026**, theo `design.md` duyệt cùng ngày. Máy làm chưa có Docker nên không có Postgres hay kho
> ảnh: test thuần chạy ở máy bằng `pnpm test:unit` (task 0.2); test DB, test HTTP, `db:drift` chạy trên CI. Làm trên
> nhánh `add-listings`, commit theo nhóm task và push; CI chạy qua một PR nháp vào `main` — mỗi nhóm task có test DB /
> HTTP xong thì chờ CI xanh mới sang nhóm sau.

## 0. Chốt trước khi code

- [x] 0.1 Sửa proposal, delta spec, TK theo design đã duyệt (D3: `listing/editing`, `listing/suspension`; bản sao ảnh:
      `media/image-storage`; câu 18 của `add-screening`: `listing/visibility`); xác minh `pnpm run spec:validate` xanh
      — làm xong 12/10/2026
- [x] 0.2 `vitest.unit.config.ts` + script `pnpm test:unit`: chỉ chạy test không cần DB (`*.calc.test.ts` và các test
      thuần sẵn có), không `globalSetup`; xác minh chạy xanh trên máy không có Postgres, và `pnpm test` (cấu hình cũ)
      vẫn gồm mọi file

## 1. Schema và migration

- [x] 1.1 Khai 7 enum và 3 bảng của design mục 2 vào `prisma/schema.prisma` (cột mảng `image_ids`, `hide_reasons`,
      `restrictions`; partial index bảng tin, tìm kiếm, bảng tin nhóm, việc nền, bên nghe), comment `///` cho mọi CHECK
      viết tay; xác minh `pnpm exec prisma format && pnpm exec prisma validate`
- [x] 1.2 Migration `init_listing` sinh **không cần DB**: `prisma migrate diff --from-schema <schema ở HEAD>
--to-schema prisma/schema.prisma --script`, đọc SQL, thêm CHECK (giá không âm, nơi đăng ↔ nhóm, đủ trường khi
      khác nháp, huy hiệu chỉ ở sàn chung, đồng hồ chạy XOR dừng, `fault` chỉ ở bị từ chối / bị gỡ); xác minh trên CI:
      `migrate deploy` qua và `pnpm db:drift` ra "No difference detected" — đã qua trên Neon Postgres 18.6 ngày 13/10/2026
- [ ] 1.3 `tests/listing.db.test.ts`: mỗi CHECK (23514), unique (`listing_id`, `from_version`), unique
      `moved_from_listing_id`, PK `listing_badge_blocks`, FK sang `accounts`, `groups`, `categories`; xác minh CI xanh

## 2. Phần tính toán thuần (xác minh bằng `pnpm test:unit`)

- [x] 2.1 `listing.calc.ts`: bảng mũi tên design mục 3; xác minh unit test đủ 8 trạng thái × 15 mũi tên × 5 bên —
      mọi ô hợp lệ ra đúng trạng thái, mọi ô còn lại ra `INVALID_TRANSITION`
- [x] 2.2 `display-period.calc.ts` `nextClock`: lên bảng lần đầu, thêm / bớt lý do dừng và lý do trôi, bị gỡ /
      khôi phục, bị từ chối, gia hạn sớm / sau khi hết hạn (áp lúc lên bảng lại), hết ngày lúc đang chờ, `shown_ms` /
      `shown_since`; xác minh mỗi scenario của spec `listing/display-period` thành một unit test, cộng D4
- [x] 2.3 `placement.calc.ts` trên ảnh chụp nhóm: thứ tự lỗi của design mục 5 bước 4–5, người ngoài, người bị cấm,
      nhóm khoá / đóng / đang chuyển riêng tư, đơn vị con; kiểm trường bắt buộc lúc gửi; xác minh mỗi scenario của
      spec `listing/placement` và `listing/submission` (phần không cần DB)
- [x] 2.4 `edit.calc.ts` `classifyEdit`: so giá trị, qua máy hay không, `widen` / `narrow` / `regroup`, huy hiệu, khoá
      nơi đăng, tin đã rời nhóm hẳn (`LISTING_DETACHED`), thu hẹp gỡ `new_account`; xác minh mỗi scenario của spec
      `listing/editing`
- [x] 2.5 `hide.calc.ts`: lý do đặt / gỡ theo từng sự kiện (bảng design mục 9), công tắc `allowOutsiders` lúc rời,
      cấm và rời độc lập không theo thứ tự, không đặt lên nháp, đổi nhóm làm rơi lý do của nhóm cũ, lý do hết hẳn ghi
      `left_group_at`; xác minh mỗi scenario của spec `listing/suspension`, kể cả chạy hai thứ tự sự kiện
- [x] 2.6 `visibility.calc.ts` `canView` cho mọi bề mặt của design mục 12; xác minh mỗi scenario của spec
      `listing/visibility` và delta `identity/profile`
- [x] 2.7 `src/common/schemas/cursor.ts`: mã hoá / giải mã (`first_live_at`, `id`), con trỏ hỏng → 400
      `VALIDATION_ERROR`; xác minh unit test

## 3. Nối module có sẵn

- [ ] 3.1 `group`: `lockForPosting(tx, groupId, accountId)` (`FOR SHARE` + khoá cặp), `membersAmong`, `badgeHolders`,
      `badgeLabels`, `canRemoveBadge`; `group.member.left` mang `allowOutsiders`; sửa `updateSettings` — quyết đổi
      ngay hay đi qua đang chuyển riêng tư **trong** transaction đã `FOR UPDATE`, đếm bằng
      `PublicListingCounter.countInGroup(tx, …)`; xác minh test nhóm cũ vẫn xanh và test DB song song: gửi "nhóm công
      khai" đua với đổi sang riêng tư không bao giờ để lại tin "nhóm công khai" dưới nhóm riêng tư (CI)
- [ ] 3.2 `category`: `setStatus` phát `category.status.changed` cùng transaction; `statusOf`, `validateRegion`,
      `validateAttributes(…, { complete })` ở `template.calc.ts`; xác minh unit test kiểm mẫu (mục lạ, kiểu sai, thiếu
      mục bắt buộc chỉ khi `complete`) và test HTTP tắt / bật danh mục ghi đúng sự kiện (CI)
- [ ] 3.3 `media`: `requestUpload` nhận chủ `listing` qua cổng `ImageOwnership`; `copyImages` (`CopyObjectCommand`
      trước transaction, dòng `images` đã xác nhận trong transaction); xác minh test kho thật: chép ra tệp mới cùng
      nội dung, ảnh cũ giữ chủ; mọi scenario ảnh của spec `listing/drafts` và delta `media/image-storage` (CI)
- [ ] 3.4 `identity`: `deviceToken(deviceId)`; `recordListingSubmission(accountId, deviceHash, at)`; bên nghe
      `listing.submitted` ghi dấu máy; xác minh test sẵn có của `identity/device-registry` vẫn xanh với chữ ký mới, mã
      thô không nằm trong outbox (CI)
- [ ] 3.5 `config-keys.ts` thêm `listing.moveToMarketplaceDays` 30; `env.ts` thêm `DEV_TRUST_TIER` (T0–T3, mặc định
      T1 ở dev), `DEV_MACHINE_REVIEW` (`off` mặc định) — production từ chối khởi động nếu `DEV_MACHINE_REVIEW` khác
      `off`; xác minh `tests/config-keys.test.ts`, `tests/env.test.ts`

## 4. Repository

- [ ] 4.1 `listing.repository.ts` phần ghi: tạo / lưu nháp, đi mũi tên có điều kiện (`state`, `version`), dòng
      `listing_submissions`, sự kiện outbox và nhật ký master cùng transaction; bên nghe theo lô 500 dòng (`SELECT …
FOR UPDATE` → hàm thuần → một `UPDATE … FROM unnest(…)`); xác minh test DB: ghi có điều kiện trả đúng khi trạng
      thái / phiên bản đã đổi, lô 1200 tin đặt và gỡ đủ lý do, chạy lại không đổi gì (CI)
- [ ] 4.2 Phần đọc: `visibleWhere(viewer, surface)`, bảng tin, tìm kiếm `search_folded`, bảng tin nhóm, hồ sơ, gợi ý,
      tin của tôi, phân trang con trỏ; xác minh test DB sinh mọi tổ hợp của design mục 12 và so kết quả SQL với
      `canView` từng bề mặt; con trỏ không lặp, không sót khi có tin mới chen vào (CI)
- [ ] 4.3 Tranh chấp đồng thời: mỗi dòng bảng design mục 19 một test DB hai lượt song song (khuôn
      `code-attempts.db.test.ts`); xác minh CI xanh

## 5. Service và route (test HTTP qua `app.inject`, chạy trên CI)

- [ ] 5.1 Nháp: tạo (master 403, staff được), lưu khi thiếu, tối đa 6 ảnh, ảnh qua `media.resolve` / `attach`, xoá
      mềm ở mọi trạng thái; xác minh `tests/listing-drafts.http.test.ts` mọi scenario của `listing/drafts`,
      `listing/deletion`
- [ ] 5.2 Gửi: thứ tự kiểm của design mục 5, `x-device-id` bắt buộc, email chưa xác nhận, bấm hai lần → 200 cùng tin,
      cổng `trust` / `screening` bản tạm; xác minh `tests/listing-submission.http.test.ts` mọi scenario của
      `listing/submission`, `listing/placement`
- [ ] 5.3 Vòng đời và sửa: rút về, đã bán, sửa (qua máy / không, `PLACEMENT_LOCKED`, `CONFLICT`, `LISTING_DETACHED`),
      gia hạn sớm / sau khi hết hạn (kèm sửa); mũi tên của máy qua `applyMachineOutcome`, của người duyệt và khiếu
      nại qua service (chưa có route); xác minh `tests/listing-lifecycle.http.test.ts` mọi scenario của
      `listing/lifecycle`, `listing/editing`, `listing/display-period` (trừ việc theo lịch — task 6.3)
- [ ] 5.4 Đọc: `GET /listings/:id` (người đăng thấy trạng thái, lý do tạm ẩn, lý do hạn chế; người khác như không tồn
      tại), bảng tin, tìm kiếm, gợi ý, bảng tin nhóm, `GET /users/:id/listings`, `GET /me/listings`; xác minh
      `tests/listing-visibility.http.test.ts` mọi scenario của `listing/visibility`, delta `identity/profile`
- [ ] 5.5 Huy hiệu: gắn qua sửa tin, một huy hiệu, `listing_badge_blocks`, ẩn khi nhóm khoá, nhóm gỡ huy hiệu (route,
      quyền, master ghi nhật ký); xác minh `tests/listing-badges.http.test.ts` mọi scenario của delta `group/badges`
- [ ] 5.6 Chuyển tin đã rời nhóm lên sàn chung: hạn 30 ngày, khu vực, một lần, chép nội dung và ảnh, tin mới đi như
      gửi; xác minh test HTTP mọi scenario "Chuyển tin đã rời nhóm lên sàn chung" của `listing/suspension`

## 6. Bên nghe, việc nền, chỗ cắm

- [ ] 6.1 `listing.events.ts`: khoá / mở khoá / xoá tài khoản; rời / vào nhóm, đổi đơn vị; cấm / gỡ cấm; khoá / mở /
      đóng nhóm; chuyển riêng tư (hạ "nhóm công khai" của thành viên, `group_privatized` cho người ngoài, rồi
      `completePrivatization`); tắt / bật danh mục; `trust.tier.changed`; `screening.result.recorded`,
      `screening.listing.recalled`, `screening.listing.restricted`; tự gỡ huy hiệu khi `group.badge.rights_changed`;
      xác minh test qua bộ phát outbox thật cho mọi scenario còn lại của `listing/suspension`, kể cả nhận trùng (CI)
- [ ] 6.2 Chỗ cắm: `ListingTrustPort` bản tạm (T0 ở production và test, `DEV_TRUST_TIER` ở dev),
      `ListingScreeningPort` bản tạm (`precheck`, `scoreText`, `openRun` không làm gì), `OpenWork` (luôn sai); máy tạm
      dev nghe `listing.submitted` khi `DEV_MACHINE_REVIEW` khác `off`; xác minh test dựng app với cổng giả đè được
      mức tin cậy, máy tạm không được nối khi `off`
- [ ] 6.3 `listing.jobs.ts`: `listing.expire-due` mỗi giờ, `listing.remind-expiring` 09:00 Asia/Ho_Chi_Minh; xác
      minh test đồng hồ cố định: hết ngày thì hết hạn trong lượt kế, đồng hồ đang dừng không hết hạn, nhắc đúng một
      lần mỗi hạn và nhắc lại sau gia hạn, chạy hai lần không phát trùng (CI)
- [ ] 6.4 `notification`: dòng N31–N35, N37 của design mục 11 vào ma trận; xác minh test ma trận: ai nhận, nhóm thông
      báo, gộp, nhắc (CI)

## 7. Nối app và tài liệu

- [ ] 7.1 `listing.module.ts` (route, bên nghe, việc nền); thêm vào `buildApp` sau `group`, nối cổng
      `ImageOwnership` vào `media` và `PublicListingCounter` vào `group`; `Repositories`, `AppServices`,
      `tests/test-app.ts`; Swagger khai mọi route và mã lỗi của design mục 17, 18; xác minh `pnpm run typecheck`,
      `pnpm run lint`, `pnpm run build` ở máy và test Swagger trên CI
- [ ] 7.2 CLAUDE.md (module `listing`, luật 4 phân trang con trỏ, luật 13 bỏ "(chưa có)", trạng thái đợt 2,
      `pnpm test:unit`), README, `tests/README.md`; xác minh `pnpm run format:check`

## 8. Kiểm tra tích hợp

- [ ] 8.1 CI xanh cả hai job (`check`, `test` — gồm `db:drift`); ở máy: `typecheck`, `lint`, `test:unit`,
      `spec:validate`, `build` xanh. Chạy thử bản build với env dev và `DEV_MACHINE_REVIEW=pass_full` hết một vòng —
      tạo nháp → tải ảnh → gửi → lên bảng → có trên bảng tin → đánh dấu đã bán — **cần Postgres và kho ảnh**: làm khi
      có Docker hay DB dev; chưa có thì ghi rõ là chưa chạy, không đánh dấu xong
