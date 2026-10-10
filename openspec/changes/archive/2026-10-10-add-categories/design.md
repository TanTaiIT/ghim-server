# Design

## Context

Làm chung một lượt với `add-platform-roles` (xem design của change đó cho nhật ký, bộ phát outbox, guard
`requireCategoryOps`, migration chung `init_platform_category`). `category` sở hữu danh mục, cài đặt cho máy
duyệt, mẫu thông tin và khu vực; `platform` hỏi "danh mục có tồn tại" qua service của `category`;
`screening` (đợt 3) sẽ đọc cài đặt và ghi lại `(danh mục, phiên bản cài đặt)` đã dùng. Câu hỏi mở đã chốt ở
`proposal.md`; hành vi ở `specs/category/*`.

Dữ liệu khu vực: `provinces.open-api.vn/api/v2?depth=2` (34 tỉnh, 3.321 phường, mã số chính thức) và bảng tay
`vnProvince.ts` của hệ thống cũ (`formerNames`, `aliases` cấp tỉnh). Tên cũ cấp phường chưa có nguồn.

## Goals / Non-Goals

**Goals:**

- Hai capability của `category` chạy được, có test ở đúng tầng; cài đặt có phiên bản để máy duyệt tra lại.
- Khu vực nạp từ một file dữ liệu sinh bằng script, tìm bỏ dấu và bằng tên cũ; mã ổn định cho `listing`.

**Non-Goals:**

- Áp cài đặt vào máy duyệt và hàng chờ (`add-screening`, `add-review-queues`); tin tạm ẩn khi tắt danh mục,
  điền và lọc theo mẫu, bắt buộc khu vực cho tin sàn (`add-listings`).
- Tên cũ cấp phường: cột có sẵn, dữ liệu bổ sung sau; sửa lỗi chính tả khi tìm.

## Decisions

### 1. Danh mục phẳng, cài đặt tách khỏi tên, mỗi lần đổi cài đặt là một phiên bản

```
categories                 id uuidv7, name (unique), status category_status (active | disabled),
                           settings_version int (≥ 1), created_by, created_at, updated_at
category_setting_versions  (category_id → categories, version) PK, price_cap bigint?,
                           reference_price bigint?, risk_level risk_level (low | medium | high),
                           always_manual bool, group_review group_review (group | platform),
                           changed_by, created_at
```

Cài đặt hiện hành = dòng `category_setting_versions` có `version = categories.settings_version`; mỗi
`PUT /ops/categories/:id/settings` gửi **trọn bộ** cài đặt, kiểm (không âm, số nguyên đồng qua `priceSchema`,
`reference_price <= price_cap` khi có cả hai), tạo phiên bản kế trong một transaction cùng tăng
`settings_version` và ghi nhật ký. Tên đổi bằng `PATCH /ops/categories/:id` (không tạo phiên bản cài đặt).
Tạo danh mục = tạo `categories` + phiên bản cài đặt 1 (mặc định: không trần, không giá tham chiếu, rủi ro
thấp, luôn duyệt tay tắt, nhóm duyệt). Bật / tắt là `status`, không xoá (không có route DELETE).

_Thay thế đã cân nhắc:_ cài đặt là cột trên `categories` + bảng lịch sử — hai nơi cho một sự thật; dùng bảng
con số chung — cài đặt của 50 danh mục không phải "con số của hệ thống", và `screening` cần `(danh mục,
phiên bản)` chứ không cần phiên bản toàn cục.

### 2. Cài đặt máy duyệt không ra app

Hai DTO: `publicCategorySchema` (`id`, `name`, `templateVersion`) cho `GET /categories` và
`GET /categories/:id/template*`; `categoryAdminSchema` (đủ cài đặt, trạng thái, phiên bản) cho `/ops/*`. Không
có cách nào trả cài đặt qua route công khai vì schema response không có trường đó (nguyên tắc 8).

### 3. Mẫu thông tin: một bản nháp chung, phát hành thành phiên bản bất biến

```
template_drafts    category_id PK → categories, fields jsonb, draft_version int, updated_by, updated_at
template_versions  (category_id, version) PK, fields jsonb, published_by, published_at
```

`fields` là mảng `{ name, label, type (text | number | single_choice | multi_choice), required, options? }`
kiểm bằng Zod (`name` `^[a-z0-9_]{1,40}$`, không trùng trong mẫu, `options` ≥ 1 với kiểu chọn). Mỗi danh mục
đúng một bản nháp; `PUT …/template/draft { baseDraftVersion, fields }` thay cả bản nháp với khoá lạc quan (409
`CONFLICT`) — ghi có điều kiện `WHERE draft_version = baseDraftVersion`, không đọc rồi ghi, nên hai lượt lưu
cùng lúc chỉ một lượt khớp. Phát hành xoá đúng bản nháp đã đọc (theo `draft_version`) trước khi tạo phiên
bản; bản nháp vừa được lưu bản mới hơn → 409 `CONFLICT`, không ghi gì, để không phát hành một bản master
chưa xem và không xoá mất bản vừa lưu. Staff phụ trách danh mục (`requireCategoryOps`) và master sửa nháp; chỉ master `publish`
(tạo `template_versions` kế, xoá nháp, tăng `categories.template_version`) và `discard` (xoá nháp).

Khoá tên (`template.calc.ts` `lockedFieldIssue`): tập `(name, type)` của mọi phiên bản đã phát hành là bất
biến — bản nháp mang `name` đã phát hành với `type` khác → 409 `TEMPLATE_FIELD_NAME_LOCKED`. API không có
thao tác "đổi tên", nên một lượt đổi tên chỉ có thể mang hình dạng "bỏ mục đã phát hành + thêm mục mới cùng
kiểu, cùng nhãn (so sau `fold`) dưới tên khác"; hình dạng đó cũng là 409 `TEMPLATE_FIELD_NAME_LOCKED`
(scenario "đổi tên mục đã phát hành"), so với nhãn của **mọi** phiên bản đã phát hành. Muốn đổi cách gọi thì
đổi nhãn, giữ tên. Bỏ hẳn một mục, hay thêm mục khác nhãn, vẫn được; tên đã bỏ vẫn bị khoá theo kiểu.
Bỏ mục ở bản sau được; phiên bản cũ đọc lại theo số. Ghi thẳng vào phiên bản đã phát hành → 409
`TEMPLATE_PUBLISHED` (không có route ghi; route sửa nháp từ chối khi body nhắm `version`).

`categories.template_version int?` (null = chưa phát hành) để app đọc mẫu hiện hành bằng một lượt tìm.

### 4. Khu vực: file dữ liệu sinh bằng script, nạp khi bảng rỗng, tìm bằng chuỗi đã bỏ dấu

```
provinces  code int PK, name, full_name, former_names text[], aliases text[], search_text
wards      code int PK, province_code → provinces, name, former_names text[], search_text
           index (province_code); unique (province_code, name)
```

`src/cli/build-regions.ts` tải API, trộn `former_names` / `aliases` cấp tỉnh từ
`src/modules/category/data/province-former-names.json` (chép từ `vnProvince.ts`, biên soạn tay), ghi
`src/modules/category/data/regions.json`. Cập nhật địa giới = chạy lại script, đọc diff, commit. Khởi động:
`seedRegionsIfEmpty` (như hạt giống miền). `search_text` = tên + tên cũ + tên gọi tắt, đã `foldName` (bỏ dấu,
hoa, `đ → d`); `GET /regions/search?q=` so `search_text LIKE %q%` với `q` đã fold, trả tỉnh trước rồi
phường, mỗi dòng ghi rõ cấp và tỉnh chứa. Tên cũ chia cho nhiều phường = mỗi phường có tên cũ đó trong
`former_names`, nên tìm trả cả hai. Không sửa lỗi chính tả.

_Thay thế đã cân nhắc:_ hằng số trong code như hệ thống cũ — không index, không `former_names` cấp phường,
và `listing` cần FK tới mã; `pg_trgm` cho gõ sai — thêm extension cho một tính năng chưa ai đòi.

### 5. `CategoryService` lộ hai cửa đọc cho module khác

`existingIds(ids): Promise<Set<string>>` (cho `platform` kiểm grant) và `settingsOf(categoryId)` (cho
`screening` sau). Hai hàm này đọc, không ghi (luật 11, 12).

### Dữ liệu — mọi bảng thuộc `category`

| Bảng                        | Ràng buộc chỉ DB trả lời được                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `categories`                | unique `name`; CHECK `settings_version >= 1`; `template_version` null hoặc ≥ 1                                                    |
| `category_setting_versions` | PK `(category_id, version)`; CHECK `price_cap >= 0`, `reference_price >= 0`, `reference_price <= price_cap` khi cả hai không null |
| `template_drafts`           | PK `category_id`; CHECK `draft_version >= 1`                                                                                      |
| `template_versions`         | PK `(category_id, version)`                                                                                                       |
| `provinces` / `wards`       | PK `code`; FK `province_code`; unique `(province_code, name)`                                                                     |

Enum mới: `category_status` (`active`, `disabled`), `risk_level` (`low`, `medium`, `high`), `group_review`
(`group`, `platform`). `category.schema.ts` khai tuple tương ứng.

### Mã lỗi mới (tập đóng của change này)

409 `TEMPLATE_PUBLISHED`, `TEMPLATE_FIELD_NAME_LOCKED`, `CONFLICT` (nháp lệch) · 400 `VALIDATION_ERROR` ·
404 `NOT_FOUND` · 403 `FORBIDDEN`.

### Route (tiền tố `/api/v1`)

- Khách: `GET /categories` (đang bật) · `GET /categories/:id/template` · `GET /categories/:id/template/versions/:version`
  · `GET /regions/provinces` · `GET /regions/provinces/:code/wards` · `GET /regions/search?q=`.
- Master: `GET /ops/categories` · `POST /ops/categories` · `PATCH /ops/categories/:id` (tên) ·
  `PUT /ops/categories/:id/settings` · `GET /ops/categories/:id/settings/versions/:version` (tra phiên bản
  cài đặt cũ — scenario "phiên bản 2 tra lại được") · `POST /ops/categories/:id/enable` · `POST /ops/categories/:id/disable` ·
  `POST /ops/categories/:id/template/publish` · `DELETE /ops/categories/:id/template/draft`.
- Staff phụ trách hoặc master (`requireCategoryOps`): `GET /ops/categories/:id/template/draft` ·
  `PUT /ops/categories/:id/template/draft`.

## Risks / Trade-offs

- [Tên cũ cấp phường rỗng khi chạy thật] → Cơ chế và scenario có test bằng dữ liệu dựng; proposal ghi khoảng
  trống; thêm dữ liệu là chạy lại script, không đổi code.
- [`search_text LIKE %q%` quét bảng 3.355 dòng] → Vài trăm KB trong bộ nhớ Postgres, dưới 10 ms; đổi sang
  `pg_trgm` khi có số đo.
- [Mẫu `fields` là jsonb, không có FK] → Kiểm bằng Zod lúc ghi và giữ bất biến sau khi phát hành; `listing`
  kiểm dữ liệu điền theo đúng phiên bản nó giữ.
- [Hai master-session hay staff cùng sửa nháp] → Khoá lạc quan `draft_version`; người sau tải lại.

## Migration Plan

1. Bảng của `category` nằm trong migration `init_platform_category` (design `add-platform-roles` bước 1), có
   CHECK viết tay; không mất dữ liệu.
2. Khởi động: `seedRegionsIfEmpty` nạp `regions.json` (3.355 dòng, chia lô). Danh mục không có sẵn: master tạo
   qua bàn vận hành.
3. Lùi: `migrate reset` trên DB dev.

## Open Questions

- Danh sách gợi ý `document_type` / `options` mẫu cho vài danh mục đầu (Điện thoại, Xe máy) — tài liệu cho
  master, không phải code; viết khi vận hành thật.
