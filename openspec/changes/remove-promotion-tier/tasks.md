# Tasks

## 1. Server

- [x] 1.1 `promotion/calc/purchase.calc.ts`: bỏ lý do `TRUST_TIER_TOO_LOW` và trường mức khỏi dữ kiện mua
- [x] 1.2 `promotion.schema.ts`, `promotion.service.ts`, `promotion.repository.ts`, `calc/catalog.calc.ts`: bỏ `minTier`,
      `tierAt`, `TIERS`; `promotion.ports.ts` bỏ `tierOf`; mô tả route mua gói bỏ mã lỗi
- [x] 1.3 `config-keys.ts`: bỏ `promotion.minTier`; `platform.service.ts`: phiên bản mới (khởi động, master đổi) chỉ mang
      khoá của sổ đăng ký
- [x] 1.4 `prisma/schema.prisma` + migration `remove_promotion_tier` bỏ cột `min_tier`
- [x] 1.5 Tests: `purchase.calc`, `promotion.http` (T0 mua được), `promotion.db`, `platform.service` (khoá đã gỡ)

## 2. Docs

- [x] 2.1 TK phần 19 (luật mua, quyền theo vai) và bảng con số phần 28; `docs/KE-HOACH-GOI-DAY-TIN.md`
- [x] 2.2 Spec delta của change này

## 3. App

- [x] 3.1 `npm run api:sync`; màn tạo gói bỏ ô chọn mức, danh sách gói bỏ nhãn mức; `src/api` + test

## 4. Kiểm tra

- [x] 4.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift`, `pnpm run spec:validate`; app `npm run check`
- [ ] 4.2 Deploy Render: bảng con số lên phiên bản mới không còn `promotion.minTier`; tài khoản T0 mua được "Đẩy lên đầu"
