# Tasks

## 1. Cổng bàn vận hành không đòi lớp thứ hai

- [x] 1.1 `common/auth`: xoá `requireSecondFactor`, bỏ lời gọi trong `requireMaster` và `assertOps`; `Actor` bỏ
      `secondFactorAt`; sửa chú thích `requireMaster` / `requireOps` (design mục 1). Kiểm: `pnpm run typecheck` chỉ ra
      mọi chỗ còn đọc trường đã bỏ
- [x] 1.2 `group.shared.context`: bỏ dòng `requireSecondFactor` và chú thích của nó; `review.shared.locateTask` sửa chú
      thích "Route của nhóm không đòi lớp thứ hai" thành lý do còn đúng (chỉ vai trong nhóm được tính ở route của nhóm)
- [ ] 1.3 `tests/auth.http.test.ts`: ca 403 `TWO_FACTOR_REQUIRED` đổi thành ca dương — staff đúng phạm vi, phiên mở bằng
      mật khẩu, gọi hàng chờ → 200; giữ ca ngoài phạm vi → 403 `FORBIDDEN` (scenario "Staff vừa được gắn quyền làm việc
      ngay", "Staff ngoài phạm vi vẫn bị chặn"); bỏ `secondFactorAt` khỏi helper (`ops-helpers.ts`, `group-helpers.ts`…).
      Kiểm: `pnpm test auth.http` xanh
- [ ] 1.4 Test `review/queues`: master đăng nhập mật khẩu, nhận và quyết một việc của nhóm ở bàn vận hành → quyết định
      ghi dưới vai master (scenario "Master xử việc của nhóm ở bàn vận hành"); ca 404 / 403 qua route của nhóm vẫn xanh

## 2. Đăng nhập không đọc mã

- [x] 2.1 `auth.service.login`: bỏ khối kiểm `totpCode` và `secondFactorAt`; `loginWithGoogle`: bỏ nhánh chặn tài khoản có
      quyền đã bật hai lớp (design mục 4); `identity.shared.openSession` bỏ tham số `secondFactorAt`, giữ `privileged`,
      sửa chú thích; `resolveActor` bỏ `secondFactorAt`
- [x] 2.2 `identity.schema`: bỏ `totpCode` khỏi `loginBodySchema`, giữ `z.object` không strict (design mục 2);
      `auth.routes` bỏ `totpCode` khỏi lời gọi, sửa `summary` "kèm mã lớp thứ hai"
- [ ] 2.3 Test HTTP: master đăng nhập mật khẩu không mã rồi gọi bàn vận hành → được (scenario "Master đăng nhập bằng mật
      khẩu rồi dùng bàn vận hành"); body có `totpCode` 6 số bất kỳ → 200, phiên mở ("Client cũ vẫn gửi mã lúc đăng
      nhập"); staff đăng nhập Google rồi gọi bàn vận hành trong phạm vi → được ("Tài khoản có quyền đăng nhập bằng
      Google"). Trần 3 phiên của tài khoản có quyền vẫn xanh ở `sessions.http.test.ts`

## 3. Bỏ thiết lập và đặt lại lớp thứ hai

- [x] 3.1 `account.service`: xoá `setupTwoFactor`, `confirmTwoFactor`; `me.routes`: xoá `POST /me/two-factor/setup`,
      `/confirm`; `identity.schema`: xoá `twoFactorSetupSchema`, `twoFactorConfirmBodySchema`, khối "HAI LỚP";
      `IdentityService` bỏ hai khai báo (design mục 3)
- [x] 3.2 Hồ sơ: bỏ `twoFactorEnabled` khỏi `meSchema`, kiểu hồ sơ trong `identity.service.ts` và `identity.shared`
      (`toMyProfile`); test hồ sơ (`profile.http.test.ts`) không còn trường đó
- [x] 3.3 `ops.service.resetTwoFactor`, khai báo trong `IdentityService`, `src/cli/reset-two-factor.ts`, script
      `cli:reset-2fa` trong `package.json`: xoá (design mục 6); `create-master.ts` bỏ câu nhắc thiết lập lớp thứ hai;
      `cli-identity.ts` sửa chú thích
- [ ] 3.4 Xoá `tests/two-factor.http.test.ts`; `master-accounts.test.ts` bỏ ca đặt lại lớp thứ hai, thêm ca master vừa
      tạo đăng nhập mật khẩu dùng bàn vận hành ngay (scenario "Master vừa tạo dùng bàn vận hành ngay"); test HTTP hai route
      cũ → 404 `NOT_FOUND` (scenario "Gọi thao tác thiết lập lớp thứ hai cũ")

## 4. Đổi email chỉ đòi mật khẩu

- [x] 4.1 `account.service.requestEmailChange`: bỏ khối kiểm `totpCode`; `emailChangeBodySchema` bỏ `totpCode`;
      `IdentityService.requestEmailChange` bỏ tham số (design mục 5)
- [ ] 4.2 Test HTTP: staff xin đổi email chỉ với đúng mật khẩu → thư mã gửi tới email mới (scenario "Staff xin đổi
      email chỉ với mật khẩu"); ca sai mật khẩu → 401 `INVALID_CREDENTIALS`, chỉ Google → 409 `PASSWORD_NOT_SET` vẫn xanh

## 5. Migration và thư viện

- [x] 5.1 `schema.prisma`: xoá `Account.totpSecretEnc`, `Account.totpEnabledAt`, `Session.secondFactorAt`;
      `prisma format` → `prisma validate` → `prisma migrate dev --create-only --name remove_two_factor` → **đọc SQL**:
      đúng ba `ALTER TABLE … DROP COLUMN`, không gì khác (design mục 7) → `pnpm db:migrate` → `prisma generate`
- [ ] 5.2 `identity.repository`: bỏ hai cột khỏi kiểu cập nhật tài khoản và lượt ẩn danh; bỏ `secondFactorAt` khỏi kiểu
      mở phiên, kiểu phiên, câu SQL `findActorSession`. Test DB repository (`identity.repository.db.test.ts`,
      `session-refresh.db.test.ts`, `hot-paths.db.test.ts`…) bỏ trường đã xoá và xanh
- [x] 5.3 `pnpm remove otplib`; xoá `totpMatches`, `TOTP_ISSUER`, `TOTP_EPOCH_TOLERANCE` khỏi `identity.shared`; chú thích
      `SECRETS_ENCRYPTION_KEY` (`config/env.ts`, `common/crypto/secrets.ts`, `identity.service.ts`, `.env.*.example`) bỏ
      chữ TOTP (design mục 8). Kiểm: `grep -ri "otplib\|totp" src` không còn kết quả
- [x] 5.4 Các test còn lại TypeScript chỉ ra (`account-lock`, `category`, `group-*`, `platform`, `retention-data`,
      `screening-decision`, `trust-dashboard`, `device-flags`, `disposable-domains`, `identity.*`): bỏ trường đã xoá. Kiểm:
      `pnpm run typecheck` sạch

## 6. Tài liệu

- [x] 6.1 TK: TK 5 bỏ "Bắt buộc đăng nhập hai lớp…" ở master, staff và "vẫn đòi hai lớp" ở quyền treo, sửa câu "mất máy
      tạo mã thì đội kỹ thuật đặt lại hai lớp"; TK 27 cam kết 28 bỏ câu thứ hai; TK 30 mục Định danh bỏ "đăng nhập hai lớp
      bằng ứng dụng tạo mã", giữ "tối đa 3 phiên". Ghi chốt 23/10/2026
- [x] 6.2 CLAUDE.md: mục thư viện bỏ "Hai lớp cho master, staff: otplib…", cây `cli/` bỏ `reset-two-factor`, mục OpenSpec
      thêm `remove-two-factor`; README: bảng lệnh bỏ `cli:reset-2fa`, các bước tạo master trên Render bỏ dòng "Gỡ lớp thứ
      hai"; `tests/README.md` bỏ dòng `two-factor.http.test.ts` và `TWO_FACTOR_REQUIRED`; `docs/review.md` sửa chỗ nhắc
      lớp thứ hai; `docs/VIEC-DANG-DO.md` ghi việc cho `ghim-app`

## 7. Kiểm tra tích hợp

- [ ] 7.1 `pnpm run check` (gồm test DB — bật `docker compose up -d --wait postgres-test storage-test`), `pnpm run
format:check`, `pnpm run build`, `pnpm db:drift` ra "No difference detected"

## Workflow follow-up

- Archive bằng `/opsx:archive remove-two-factor` sau khi nhóm 7 xanh; rồi `pnpm exec prettier --write openspec` và
  `pnpm run spec:validate`.
- Deploy: Render chạy `prisma migrate deploy` trước khi bản mới nhận traffic.
- `ghim-app`: `npm run api:sync`, bỏ `TwoFactorGate` (`app/ops/_layout.tsx`), ô mã ở `app/login.tsx`, hàm gọi hai route
  đã bỏ (`src/api/client.ts`, `src/queries/auth.ts`).
