# Tasks

## 1. Schema (chung migration với `add-platform-roles`)

- [x] 1.1 Khai enum `category_status`, `risk_level`, `group_review` và bảng `categories`, `category_setting_versions`, `template_drafts`, `template_versions`, `provinces`, `wards` vào `prisma/schema.prisma` trong cùng lượt với task 1.1 của `add-platform-roles`; xác minh `prisma validate` qua và migration `init_platform_category` chứa CHECK viết tay của design này
- [x] 1.2 Viết `tests/category.db.test.ts`: unique tên danh mục, PK phiên bản cài đặt, CHECK giá âm / giá tham chiếu vượt trần / `settings_version`, PK nháp, FK phường → tỉnh, unique `(province_code, name)`; xác minh `pnpm test:db` xanh

## 2. Khu vực

- [x] 2.1 `src/modules/category/data/province-former-names.json` (chép `formerNames` / `aliases` từ `docs/market/src/common/constants/vnProvince.ts`) và `src/cli/build-regions.ts` sinh `regions.json` từ API + file đó; xác minh chạy script ra 34 tỉnh / 3.321 phường, không mã trùng, tên khớp bảng cũ
- [x] 2.2 `category.repository.ts` phần khu vực (`seedRegions` chia lô, `listProvinces`, `listWards`, `searchRegions` trên `search_text`) + `fold` dùng chung từ `reserved-names` chuyển sang `src/common/text/fold.ts`; xác minh test DB nạp file, tìm "binh duong" ra Hồ Chí Minh, tên cũ dựng trong test chia cho hai phường trả cả hai, không khớp trả rỗng
- [x] 2.3 Route công khai `/regions/*` (`category.public.routes.ts`) và `seedRegionsIfEmpty` ở khởi động; xác minh HTTP test ba scenario của spec `regions` với repository giả, và `pnpm start:local` nạp 3.355 dòng lần đầu

## 3. Danh mục và cài đặt

- [x] 3.1 `category.schema.ts` (tuple enum, `priceSchema` cho trần giá / giá tham chiếu, body cài đặt trọn bộ, DTO công khai vs bàn vận hành) và repository + bản giả `tests/fakes/category-repository.fake.ts` cho danh mục, phiên bản cài đặt; xác minh unit test bản giả giữ unique tên và PK phiên bản
- [x] 3.2 `category.service.ts`: `create`, `rename`, `updateSettings` (phiên bản kế + nhật ký cùng transaction), `enable` / `disable`, `listPublic`, `listAdmin`, `existingIds`, `settingsOf`; xác minh unit test mọi scenario cài đặt của spec `category-catalog` (giá âm, phần lẻ, mức rủi ro lạ, người duyệt lạ, không trần, tham chiếu vượt trần, ba cài đặt tách riêng, phiên bản 2 tra lại được)
- [x] 3.3 Route `/ops/categories*` (master) và `GET /categories` công khai; xác minh HTTP test: staff phụ trách sửa trần giá → 403, người dùng tạo → 403, tắt / bật giữ nguyên cài đặt, xoá → 404, khách không thấy trần giá, master thấy đủ kể cả danh mục tắt

## 4. Mẫu thông tin

- [x] 4.1 Zod cho `fields` (tên, nhãn, kiểu, bắt buộc, lựa chọn) và hàm thuần `template.calc.ts`: kiểm trùng tên trong mẫu, khoá `(name, type)` với mọi phiên bản đã phát hành; xác minh unit test: trùng tên, chọn không có lựa chọn, đổi tên mục đã phát hành, dùng lại tên với kiểu khác, bỏ mục hợp lệ
- [x] 4.2 Service + repository: `getDraft`, `saveDraft` (khoá lạc quan `baseDraftVersion`), `discardDraft`, `publish` (phiên bản kế, xoá nháp, tăng `template_version`, nhật ký), `templateVersion(id, v)`; xác minh unit test mọi scenario mẫu của spec: nháp không ảnh hưởng app, 409 `CONFLICT`, `TEMPLATE_PUBLISHED`, `TEMPLATE_FIELD_NAME_LOCKED`, đọc phiên bản cũ
- [x] 4.3 Route nháp (`requireCategoryOps`), phát hành / bỏ nháp (master), đọc mẫu công khai theo phiên bản; xác minh HTTP test: staff danh mục khác → 403, staff phát hành → 403, khách đọc mẫu hiện hành và phiên bản cũ, danh mục không tồn tại → 404

## 5. Sửa sau rà soát (10/10/2026)

- [x] 5.1 Khoá lạc quan của bản nháp là lượt ghi có điều kiện theo `draft_version` (không đọc rồi ghi); phát hành chỉ xoá đúng bản nháp đã đọc, bản nháp vừa đổi → 409 `CONFLICT` và không ghi gì; xác minh `tests/category.service.test.ts` và test DB: hai lượt lưu cùng lúc chỉ một lượt thành, phát hành với số nháp cũ không ghi gì

## 6. Tài liệu và tích hợp

- [x] 6.1 CLAUDE.md: module `category` đang có, mục `data/` của nó, `src/cli/build-regions.ts`; README: cách cập nhật địa giới; `tests/README.md` thêm file test; xác minh `pnpm run format:check`
- [x] 6.2 Tag Swagger `Categories`, `Regions`, `Ops · Categories`; xác minh `/docs/json` đủ route, route công khai không có `bearerAuth`
- [x] 6.3 `pnpm run check`, `pnpm test:db`, `pnpm db:drift`, `pnpm run build` xanh; `pnpm start:local`: master tạo danh mục qua `/docs`, gắn staff cho danh mục đó (route của `platform`), staff soạn nháp, master phát hành, khách đọc mẫu và tìm "sai gon" ra Hồ Chí Minh

## Workflow follow-up

- Archive ngay sau `add-platform-roles` (`/opsx:archive add-categories`), rồi `pnpm exec prettier --write openspec`
  và `pnpm run spec:validate`.
