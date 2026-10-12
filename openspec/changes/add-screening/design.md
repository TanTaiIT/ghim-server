# Design

> **Đã duyệt 12/10/2026**: 20 câu ở mục 2 theo đề xuất; chấm chữ **đồng bộ trong lượt gửi** như TK 30 (mục 1);
> gói `sharp` cho so trùng ảnh; luật "gõ bừa", "sai danh mục" bật ngay từ đầu; **kiểm ảnh nhạy cảm hoãn** — tách
> sang change `add-image-moderation`, làm khi chọn được dịch vụ (mục 3). Thiết kế chung với `add-listings`,
> `add-trust-tiers` (đã duyệt cùng ngày); code sau hai change đó.

## Context

- `add-listings` để sẵn: cổng `ListingScreeningPort` gọi lúc gửi (bản tạm không chặn, không chấm); sự kiện
  `listing.listing.submitted { listingId, version, ownerId, kind, deviceHash, placement, groupId? }`; bên nghe
  `screening.result.recorded` (ghi có điều kiện `version`) và `screening.listing.recalled`; lý do hạn chế `machine`;
  máy tạm ở dev (`DEV_MACHINE_REVIEW`) mà change này gỡ.
- `add-trust-tiers` để sẵn: `trust.tierOf`, cổng `HoldExplanation` cho bảng uy tín (bản tạm: "đang chờ người duyệt");
  thời gian chờ trên bảng uy tín giao cho change này.
- `identity` có đánh dấu theo thiết bị (`device.calc.ts` thuần), mã tra cứu Crockford, quyền ops `support`. Dấu
  thiết bị của lượt gửi tới `identity` qua outbox (design `add-listings` mục 11), tức là **sau** lúc máy chấm chữ.
- `category` có `priceCap`, `referencePrice`, `riskLevel`, `alwaysManual`. `media` giữ ảnh riêng tư trong kho S3
  (RustFS ở dev, R2 ở production).
- Bảng con số có 10 khoá `screening.*` và `review.machineHoldHours` 24.
- Node không tự giải mã JPEG / PNG / WebP — cần gói để băm ảnh.

## Goals / Non-Goals

**Goals**

- Đủ mọi requirement của 7 capability `screening/*`, `identity/profile`, `trust/seller-dashboard` của change này.
- Máy chỉ ra `pass_full` / `pass_limited` / `hold` (luật 14); mọi lỗi, quá giờ, thiếu kết quả → `hold`.
- Không tin nào lên bảng khi chưa có kết quả cho chữ và **mọi** ảnh (cam kết 4).
- Mỗi kết quả ghi đủ căn cứ, `config_version` và `rule_version` — chấm lại cùng đầu vào ra cùng kết quả.
- Phần cần dịch vụ hay gói nằm sau cổng, đổi được mà không sửa luật; dev và test chạy không cần mạng.

**Non-Goals**: kiểm ảnh nhạy cảm cho tin và ảnh đại diện (`add-image-moderation`); tạo việc cho người, hậu kiểm, đo
"máy đúng / quá tay" (`add-review-queues`); gậy (`add-strikes`); lọc tin nhắn (`add-messaging`); hạn lưu kết quả 180
ngày (`add-data-retention`); đọc chữ trong ảnh.

## Decisions

### 1. Chấm chữ đồng bộ trong lượt gửi, ảnh bất đồng bộ

Đúng TK 30 ("listing gọi screening chấm chữ lúc gửi" là một trong bốn chỗ gọi đồng bộ, CLAUDE.md luật 12). Cổng
`ListingScreeningPort` có ba hàm, `listing` gọi trong mọi lượt gửi (gửi, gửi lại sau sửa, gia hạn, chuyển lên sàn):

| Hàm              | Lúc                                                    | Làm gì                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `precheck`       | đầu lượt gửi, trước kiểm trường                        | Đang trong thời gian chờ và lượt là tin mới (câu 2) → 429 `SUBMISSION_COOLDOWN` kèm thời điểm gửi lại                                                                                                                   |
| `scoreText`      | sau kiểm trường và nơi đăng, **trước** transaction gửi | Chấm chữ: mọi dấu hiệu chữ (mục 6), cổng cứng cụm từ và giá vượt trần, luôn duyệt tay, đánh dấu thiết bị; chỉ đọc. Ném hay quá `screening.textScoreTimeoutMs` (mới, 2000) → kết quả chữ `error`, **không** ném ra ngoài |
| `openRun(tx, …)` | trong transaction gửi                                  | Ghi `screening_runs` với kết quả chữ và danh sách ảnh; chữ lỗi → kết luận `hold` / `error` ngay; mọi ảnh đã có kết quả → kết luận ngay (mục 5)                                                                          |

- Chấm **trước** transaction chứ không trong: chấm đọc nhiều thứ (thống kê giá, tin cũ của chính người đăng, lượt gửi
  24 giờ, đánh dấu thiết bị), để trong transaction là kéo dài khoá theo người của `trust` và khoá nhóm. Transaction
  ghi có điều kiện `version` nên bản được chấm đúng là bản được gửi.
- Lỗi chấm không thành lỗi gửi: tin vẫn được nhận và giữ cho người (spec machine-decision).
- `openRun` ghi bảng của `screening` trong transaction của `listing` — cùng khuôn với `media.attach(tx)`: chủ của bảng
  vẫn là người ghi, chỉ mượn transaction để lượt gửi và lượt chấm cùng thành hay cùng hỏng.

### 2. Câu hỏi mở — đã chốt

Câu 1–19 là câu hỏi mở của proposal; câu 20 chuyển từ design `add-listings`. Câu mở thứ hai của design đó — cho qua
đầy đủ có gỡ lý do "máy" — là câu 18.

| #   | Câu hỏi                                                            | Chốt                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tin dính cổng cứng / luôn giữ có chấm đủ điểm                      | **Có**, chấm đủ để người duyệt thấy hết (TK 17); kết quả vẫn là giữ. TK 29 câu 1 (danh mục luôn duyệt tay giữ 100%) vẫn mở, viết theo TK 13.                                                                                                                          |
| 2   | Dò cổng cứng: đếm gì; trong thời gian chờ được sửa không           | Đếm **theo lượt qua máy** (một lượt trúng hai cổng = một lần), kể cả gửi lại sau sửa. Thời gian chờ chặn **tin mới** — gửi nháp lần đầu và chuyển tin lên sàn chung; sửa, gửi lại, gia hạn tin đang có vẫn làm được (như luật 3 điểm gậy, TK 21) và vẫn qua máy.      |
| 3   | Bật thật cụm mức mơ hồ có quét lại                                 | **Không**. Mức mơ hồ chỉ cộng điểm ở lượt qua máy sau.                                                                                                                                                                                                                |
| 4   | Quét lại khi bật cụm: tin đã bán / hết hạn, tên, ngày hiển thị     | Tin đã bán, hết hạn: **không đụng** (TK 18 không có mũi tên; không có trên bảng tin hay tìm kiếm, ai thấy thì báo cáo). Tên: lọc **lúc đọc** (mục 9), không cần quét. Ngày hiển thị của tin bị rút về **vẫn trôi** — D4 của `add-listings`, và chữ là của người đăng. |
| 5   | Bật thật trước 7 ngày chạy thử                                     | **Được, kèm lý do bắt buộc**, ghi `audit_log`.                                                                                                                                                                                                                        |
| 6   | Trúng nhiều cụm mơ hồ                                              | **Cộng một lần** 25 điểm; kết quả vẫn ghi mọi cụm đã trúng.                                                                                                                                                                                                           |
| 7   | "Khoảng thường thấy" của giá; giá tham chiếu khi thiếu mẫu         | Ngoài [P10 ÷ 2, P90 × 2] của giá khác 0 các tin cùng danh mục lên bảng trong 90 ngày. Thiếu 30 mẫu thì **không xét**; giá tham chiếu chỉ dùng cho "giá 0 ở danh mục giá trị cao" và để người duyệt xem.                                                               |
| 8   | "Trên" hay "từ" 2 triệu                                            | **Từ** 2 triệu (≥) — khớp TK 28 và khoá `highValueReferencePriceFrom`.                                                                                                                                                                                                |
| 9   | Dấu hiệu ngoài hai danh sách có được giải thích                    | **Không** — chỉ câu "Tin đang chờ người duyệt, thường trong 24 giờ". Bỏ "thiếu mô tả" khỏi danh sách tự sửa được (mô tả không bắt buộc từ 12/10).                                                                                                                     |
| 10  | Vừa lỗi tự sửa được vừa dấu hiệu gian lận                          | **Có** giải thích phần tự sửa được, kèm câu chung ba phần, không nêu phần gian lận.                                                                                                                                                                                   |
| 11  | Mã tra cứu: theo tin hay theo lần giữ; bao lâu; thời gian ước tính | **Theo lần giữ**; tra được bao lâu kết quả còn (180 ngày); thời gian ước tính = hạn hàng 0 (`review.machineHoldHours`). Hỗ trợ chỉ **gỡ đánh dấu thiết bị**; cụm từ, ảnh trùng do người duyệt quyết.                                                                  |
| 12  | Tên trúng cụm chắc; cụm mơ hồ với tên; ảnh đại diện                | Tên trúng cụm mức chắc: người khác thấy "Người dùng Ghim", chủ tài khoản thấy tên mình kèm lời nhắc đổi. Cụm mơ hồ: **không** tác dụng với tên. Ảnh đại diện: kiểm nhạy cảm (kể cả ảnh Google), không kiểm trùng — làm ở `add-image-moderation`.                      |
| 13  | Ai nuôi danh sách trắng ảnh mẫu                                    | **Mọi staff và master** (đúng spec).                                                                                                                                                                                                                                  |
| 14  | Lưới an toàn hạ tin thiếu kết quả ảnh với lý do nào                | **"máy"**.                                                                                                                                                                                                                                                            |
| 15  | "Bị giữ nhiều" đếm những lần nào                                   | Chỉ lần giữ vì **điểm hay cổng cứng**; không đếm lỗi máy, quá 5 phút, danh mục luôn duyệt tay, đánh dấu thiết bị. Từ `add-review-queues`: không đếm lần người duyệt đã cho đạt.                                                                                       |
| 16  | "Dùng máy của tài khoản bị khoá" xét trong bao lâu                 | **90 ngày** (`identity.deviceWindowDays`).                                                                                                                                                                                                                            |
| 17  | Gỡ đánh dấu thì tin đang chờ có chấm lại                           | **Không**, tin vẫn chờ người (nguyên tắc 2).                                                                                                                                                                                                                          |
| 18  | Tin hạn chế "máy" sửa xong, lần chấm mới ra Thấp                   | **Gỡ** lý do "máy": lượt qua máy mới thay kết quả của nội dung cũ; `add-review-queues` huỷ việc hậu kiểm khi tin được sửa và máy cho qua, nên không gỡ thì không còn ai gỡ. Sửa spec visibility của `add-listings`.                                                   |
| 19  | Cổng cứng có chế độ tắt / chạy thử                                 | **Chạy thử được, tắt không được**. Cụm từ cấm vẫn bật / chạy thử / tắt theo từng cụm.                                                                                                                                                                                 |
| 20  | Dấu thiết bị của chính lượt gửi chưa ghi lúc chấm                  | `scoreText` hỏi `identity.deviceFlagsFor(accountId, deviceHash, at)`: tính đánh dấu **kể cả lượt đang xét**, không ghi gì.                                                                                                                                            |

### 3. Dịch vụ và gói

| Việc                             | Chốt                                                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kiểm ảnh nhạy cảm                | **Hoãn** — change `add-image-moderation` (cổng cứng "ảnh nhạy cảm", ảnh đại diện), làm khi chọn được dịch vụ. Cổng `ImageAnalyzer` của change này để sẵn chỗ: thêm một bước kiểm vào cùng lượt kiểm ảnh, không đổi luồng.                                                |
| Băm ảnh để so trùng              | Gói **`sharp`** (đồng ý 12/10/2026): thu ảnh về 9×8 xám → **dHash 64 bit**; trùng khi khoảng cách Hamming ≤ `screening.imageDuplicateMaxDistance` (4). Ứng viên: chia 64 bit thành 5 dải, index từng dải — hai ảnh lệch ≤ 4 bit chắc chắn trùng nguyên ít nhất một dải.  |
| "Chữ như gõ bừa"                 | **Luật tay trong code**, không gói: tỉ lệ chữ không phải âm tiết tiếng Việt hợp lệ (âm đầu + vần + âm cuối), không nằm trong danh sách chữ Latin thường gặp (hãng, mẫu máy — file `data/`), chuỗi phím liền ("asdf"), một ký tự lặp ≥ 4. **Bật ngay** (chốt 12/10/2026). |
| Suy ra danh mục ("sai danh mục") | **Từ khoá theo danh mục** do master và staff của danh mục đó nuôi; danh mục suy ra = danh mục có ≥ 2 từ khoá khớp tiêu đề trong khi danh mục đã chọn khớp 0. **Bật ngay** (chốt 12/10/2026). Đổi sang mô hình sau qua cổng `CategoryGuesser`.                            |

### 4. Dữ liệu — `screening` sở hữu 11 bảng

| Bảng                       | Cột chính                                                                                                                                                                                                                                                                                                                                                                     | Ràng buộc                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `screening_runs`           | `listing_id`, `listing_version`, `account_id`, `trigger` (`submission` / `recall`), `started_at`, `text_result` jsonb, `image_ids`, `decided_at`, `outcome`, `cause` (`score` / `gate` / `always_manual` / `device` / `error` / `timeout`), `score`, `band`, `tier`, `hits` jsonb, `explanation` jsonb, `lookup_code`, `rank_as_listing_id`, `config_version`, `rule_version` | Unique (`listing_id`, `listing_version`, `trigger`); unique `lookup_code`; CHECK `decided_at` ⇔ `outcome` ⇔ `cause` |
| `image_checks`             | `image_id`, `owner_account_id`, `status` (`pending` / `done` / `error`), `dhash` bigint, `band0..band4`, `checked_at`                                                                                                                                                                                                                                                         | PK `image_id` (ảnh bất biến → kết quả dùng lại khi tin sửa mà giữ ảnh); index từng `bandN`                          |
| `image_whitelist`          | `id`, `dhash`, `band0..band4`, `source_image_id`, `added_by`, `added_at`                                                                                                                                                                                                                                                                                                      | Index từng `bandN`                                                                                                  |
| `screening_rules`          | `code`, `kind` (`signal` / `gate`), `weight`, `mode` (`on` / `trial` / `off`)                                                                                                                                                                                                                                                                                                 | PK `code`; CHECK `kind = 'gate'` ⇒ `mode <> 'off'` (câu 19)                                                         |
| `screening_rule_overrides` | `code`, `category_id`, `weight?`, `mode?`                                                                                                                                                                                                                                                                                                                                     | PK (`code`, `category_id`)                                                                                          |
| `screening_category_bands` | `category_id`, `medium_from`, `high_from`                                                                                                                                                                                                                                                                                                                                     | PK `category_id`; CHECK `0 < medium_from < high_from`                                                               |
| `screening_rule_versions`  | `version`, `snapshot` jsonb (luật, ghi đè, dải, cụm từ), `created_by`, `created_at`                                                                                                                                                                                                                                                                                           | PK `version` — mỗi lần đổi luật hay cụm một dòng                                                                    |
| `banned_phrases`           | `id`, `text`, `folded`, `level` (`certain` / `ambiguous`), `mode`, `trial_ends_at`, `activated_at`, `activated_by`, `activation_reason`, `exceptions` text[]                                                                                                                                                                                                                  | Unique `folded`; CHECK ≥ 2 chữ (service trả 400 `BANNED_PHRASE_TOO_SHORT` trước)                                    |
| `screening_cooldowns`      | `account_id`, `until`, `started_at`                                                                                                                                                                                                                                                                                                                                           | PK `account_id`                                                                                                     |
| `category_price_stats`     | `category_id`, `low`, `high`, `samples`, `computed_at`                                                                                                                                                                                                                                                                                                                        | PK `category_id`                                                                                                    |
| `category_keywords`        | `category_id`, `keyword_folded`                                                                                                                                                                                                                                                                                                                                               | PK (`category_id`, `keyword_folded`)                                                                                |

- `category_price_stats` và `screening_cooldowns` là bảng đệm, tính lại được từ dữ kiện.
- Đổi cụm từ cấm cũng tạo một dòng `screening_rule_versions`, nên một kết quả chỉ cần `config_version` (bảng con số)
  và `rule_version` (luật + cụm).
- `add-image-moderation` thêm cột kết quả nhạy cảm vào `image_checks`.

### 5. Một lượt qua máy

1. **Chấm chữ** (`scoreText`, trong request gửi — mục 1): đọc phiên bản bảng con số và phiên bản luật một lần, chấm,
   trả kết quả chữ kèm hai phiên bản.
2. **Mở lượt** (`openRun(tx)`, trong transaction gửi): ghi `screening_runs` (unique → không tạo lần hai). Chữ lỗi →
   kết luận `hold` / `error` ngay. Ảnh nào chưa có `image_checks` thì lượt chờ ảnh.
3. **Kiểm ảnh**: bên nghe `listing.listing.submitted` (sau commit) xếp `screening.check-image` cho ảnh còn thiếu (pg-boss, thử
   lại 2 lần): `media.readImage` → `sharp` → dHash → tìm ứng viên theo dải, loại ảnh của chính người đăng và ảnh khớp
   danh sách trắng → ghi `image_checks` → thử kết luận mọi lượt đang chờ ảnh đó. Hết lượt thử → `status = error`.
4. **Kết luận** khi chữ xong và mọi ảnh có kết quả — hàm thuần `decide.calc.ts`:
   - lỗi ở chữ hay ảnh → `hold` (`error`);
   - cổng cứng đang bật — cụm chắc, ảnh trùng, giá vượt trần → `hold` (`gate`);
   - luôn duyệt tay (danh mục chọn hoặc suy ra) → `hold`; đánh dấu thiết bị → `hold`;
   - còn lại: điểm → dải (ngưỡng danh mục hoặc chung) → ma trận: T0 Thấp → đầy đủ nếu "chỉ thành viên", hạn chế (không
     lý do "máy" — lý do "tài khoản mới" do `listing` đặt) nếu nơi công khai; T1 Vừa → hạn chế kèm "máy"; T2, T3 Thấp /
     Vừa → đầy đủ; Cao → giữ.
   - Ghi kết quả, `explanation` (mục 8), mã tra cứu nếu có dấu hiệu gian lận, và phát `screening.result.recorded {
listingId, listingVersion, outcome, restrictMachine, rankAsListingId? }` trong cùng transaction. Ghi có điều kiện
     `decided_at IS NULL` — lưới an toàn và ảnh cuối về cùng lúc thì một lượt thắng; kết quả ảnh về sau khi đã giữ
     chỉ ghi vào `image_checks`.
5. **Dò cổng cứng**: lượt kết luận có cổng cứng đang bật → dưới khoá theo người, đếm lượt có cổng trong 24 giờ; tới
   3 → upsert `screening_cooldowns.until = now + 24 giờ`, phát `screening.cooldown.started`.

Lượt dùng hai phiên bản đọc ở bước 1, nên master đổi luật giữa lúc ảnh đang kiểm không làm lượt đổi luật giữa chừng.

### 6. Dấu hiệu — mỗi dấu hiệu một hàm thuần

| Dấu hiệu                     | Dữ kiện (qua cổng)                                                    | Luật                                                                                |
| ---------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| giá bất thường               | `category_price_stats` (lượt đêm, qua `listing.categoryPriceSamples`) | câu 7; giá 0 không xét                                                              |
| gõ bừa                       | tiêu đề + mô tả                                                       | mục 3                                                                               |
| liên hệ ngoài sàn            | tiêu đề, mô tả                                                        | số điện thoại Việt Nam (0 / +84, có dấu cách, chấm, gạch), "zalo", đường link       |
| trùng tin của mình           | `listing.recentOwnListings(accountId, 30 ngày, kể cả đã xoá)`         | giống ≥ 0,9 trên bộ ba chữ cái của chữ bỏ dấu; trúng thì `rankAsListingId` = tin cũ |
| đăng dồn                     | `listing_submissions` 24 giờ (qua cổng)                               | T0, T1 > 10; T2, T3 > 30 (tính cả lượt đang gửi)                                    |
| danh mục rủi ro cao          | `category.settingsOf`                                                 | `riskLevel = high` (danh mục chọn hoặc suy ra)                                      |
| bị giữ nhiều                 | `screening_runs` của chính người đó 7 ngày                            | câu 15                                                                              |
| sai danh mục                 | `category_keywords`                                                   | mục 3; trúng thì áp luật của danh mục suy ra                                        |
| tài khoản mới                | `identity.accountCreatedAt`                                           | dưới `screening.newAccountDays` (mới, 3)                                            |
| trùng máy với tài khoản khoá | `identity.deviceFlagsFor` (câu 20)                                    | đã đăng trên máy trước lúc khoá, trong 90 ngày (câu 16)                             |
| giá 0 danh mục giá trị cao   | `category.referencePrice`                                             | giá 0 và tham chiếu ≥ 2 triệu (câu 8)                                               |
| cụm từ cấm mơ hồ             | `banned_phrases`                                                      | mục 7; cộng một lần (câu 6)                                                         |

Trọng số và chế độ đọc từ phiên bản luật (ghi đè theo danh mục trước, chung sau). Chạy thử: chấm và ghi vào `hits`
với cờ `trial`, không cộng điểm, không đổi kết quả. Tắt: không chấm. Khởi tạo: mọi luật bật đúng trọng số TK 14;
luật thêm về sau mới bắt đầu ở chạy thử (spec rule-management).

### 7. Cụm từ cấm — `phrase.calc.ts`

- Chuẩn hoá bằng `fold` sẵn có (bỏ dấu, chữ thường); tách chữ theo khoảng trắng và dấu câu.
- **Ghép chữ cái tách rời**: dãy ≥ 3 chữ dài 1 ký tự liền nhau ("b a n s u n g") ghép thành một khối, so với cụm bỏ
  khoảng trắng ("bansung"). Ngoài khối, so **theo dãy chữ nguyên** — "can sa" không khớp "can sang".
- **Ngoại lệ**: chỗ trúng nằm trọn trong một chỗ trúng của ngoại lệ thì bỏ; còn chỗ khác thì vẫn trúng.
- Bộ cụm dựng một lần mỗi phiên bản, giữ trong bộ nhớ, làm mới khi phiên bản đổi (như bảng con số); cùng bộ cho tên
  hiển thị (mục 9).
- **Bật thật cụm mức chắc** (`POST /ops/screening/phrases/:id/activate`, master; chưa đủ 7 ngày chạy thử thì bắt
  buộc `reason` — câu 5): đổi chế độ, tạo phiên bản, xếp `screening.rescan-phrase`: đọc tin đang hiển thị theo lô qua
  `listing.liveListingsText(cursor)`, tin khớp → `screening_runs` `trigger = recall` (mã tra cứu, câu chung ba phần) và
  phát `screening.listing.recalled { listingId, listingVersion }`. Cụm mơ hồ không quét (câu 3).

### 8. Câu báo — `explanation.calc.ts`

`explanation` lưu trong lượt: `kind` — `fraud` (câu chung ba phần + `lookupCode`) hay `plain` ("Tin đang chờ người
duyệt, thường trong {review.machineHoldHours} giờ"); `fixable[]` — mã của giá bất thường, giá vượt trần, sai danh mục,
liên hệ ngoài sàn (app có câu và việc làm được cho từng mã). Dấu hiệu gian lận = cụm từ cấm (hai mức), ảnh trùng, đánh
dấu thiết bị, trùng máy với tài khoản khoá, đăng dồn. Không trường nào của response người đăng chứa mã luật, cụm, ảnh
hay "thiết bị" — test so response của hai lượt khác tín hiệu: chỉ khác `lookupCode`.

Người đăng xem tin của mình → `listing` hỏi `ListingExplanation.latest(listingId)`; bảng uy tín → `HoldExplanation`.
Hỗ trợ tra mã: `GET /ops/screening/lookups/:code` (`requireOps('support')` hoặc master) → dấu hiệu, luật, cụm, ảnh,
loại đánh dấu thiết bị — không có dấu thiết bị (luật 21). Mã cùng bộ chữ Crockford với mã của `identity`, khác tiền tố.

### 9. Tên hiển thị

`identity` nhận cổng `NameScreen.allowed(name)` (cụm mức chắc đang bật). `getPublicProfile` và `accountSummaries` cho
người khác thay tên không qua bằng "Người dùng Ghim"; `GET /me` trả tên thật kèm cờ `nameHidden`. Lọc lúc đọc nên bật /
tắt cụm có hiệu lực ngay, không phải quét lại tên (câu 4).

### 10. Lưới an toàn — `screening.safety-net`, mỗi 5 phút

- Lượt chưa kết luận, `started_at` quá `screening.imageResultTimeoutMinutes` → `hold` / `timeout` (ghi có điều kiện).
- Tin đang hiển thị có ảnh chưa `done` (`listing.liveListingsWithImages` so với `image_checks`) → phát
  `screening.listing.restricted { listingId }`; `listing` thêm lý do `machine` (câu 14). Lẽ ra không xảy ra — có thì
  log cảnh báo.

### 11. Việc theo lịch, sự kiện, route

| Việc                      | Lịch                   | Làm gì                                           |
| ------------------------- | ---------------------- | ------------------------------------------------ |
| `screening.check-image`   | hàng việc, song song 4 | mục 5 bước 3                                     |
| `screening.safety-net`    | mỗi 5 phút             | mục 10                                           |
| `screening.price-stats`   | 02:00 Asia/Ho_Chi_Minh | tính lại `category_price_stats` cho mọi danh mục |
| `screening.rescan-phrase` | khi bật cụm mức chắc   | mục 7                                            |

Phát: `screening.result.recorded`, `screening.listing.recalled`, `screening.listing.restricted`,
`screening.cooldown.started { accountId, until }`. Nghe: `listing.listing.submitted` (xếp kiểm ảnh).

Bàn vận hành (`/api/v1/ops/screening`): luật — `GET /rules`, `PATCH /rules/:code`, `PUT|DELETE
/rules/:code/categories/:categoryId`, `PUT /bands/:categoryId` (master); cụm từ — `GET|POST /phrases`, `PATCH
/phrases/:id` (mức, ngoại lệ), `POST /phrases/:id/activate|deactivate` (master); danh sách trắng — `POST /whitelist`
(`imageId` của một ảnh trong kho), `DELETE /whitelist/:id` (staff, master); từ khoá danh mục — `PUT
/categories/:id/keywords` (master, staff của danh mục); tra mã — `GET /lookups/:code` (support, master).

### 12. Nối với module khác

- **`listing`**: gọi `precheck`, `scoreText`, `openRun(tx)` trong lượt gửi; cổng `ListingScreeningFacts` (`snapshot`,
  `recentOwnListings`, `submissionsSince`, `categoryPriceSamples`, `liveListingsText`, `liveListingsWithImages`); bên
  nghe thêm `screening.listing.restricted`; `applyMachineOutcome` nhận `restrictMachine` (đặt hay gỡ lý do "máy" theo
  kết quả mới — câu 18) và `rankAsListingId` (tin trùng lên bảng ở vị trí tin cũ). Gỡ máy tạm `DEV_MACHINE_REVIEW`.
- **`identity`**: `deviceFlagsFor(accountId, deviceHash, at)` (thuần, không ghi); `accountCreatedAt`; cổng
  `NameScreen`.
- **`media`**: `readImage(imageId)` → bytes (≤ 5 MB) cho dHash.
- **`trust`**: bảng uy tín hỏi `screening.cooldownOf(accountId)`; cổng `HoldExplanation` thật.
- **`category`**: đọc cài đặt như hiện có.

### 13. Mã lỗi, con số mới

Mã lỗi (spec): `SUBMISSION_COOLDOWN` (429), `BANNED_PHRASE_TOO_SHORT`. Con số mới: `screening.textScoreTimeoutMs`
2000, `screening.newAccountDays` 3, `screening.abnormalPricePercentile` 10, `screening.abnormalPriceFactor` 2,
`screening.priceWindowDays` 90, `screening.ownDuplicateDays` 30, `screening.heldManyCount` 3,
`screening.heldManyDays` 7, `screening.imageDuplicateMaxDistance` 4.

### 14. Tranh chấp đồng thời

| Tình huống                                        | Cơ chế                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Bấm Đăng hai lần                                  | Lượt thua của `listing` quay lui cả transaction, kể cả `openRun`; unique lượt chặn lần hai |
| Ảnh cuối về đúng lúc lưới an toàn chạy            | Kết luận ghi có điều kiện `decided_at IS NULL`; một lượt thắng                             |
| Người đăng sửa khi ảnh của bản cũ đang kiểm       | Kết quả mang `listing_version` cũ; `listing` bỏ qua vì lệch `version`                      |
| Hai lượt dính cổng cứng song song chạm lượt thứ 3 | Đếm và upsert cooldown dưới khoá theo người (`pg_advisory_xact_lock`)                      |
| Master đổi luật giữa lượt                         | Lượt dùng phiên bản đọc lúc chấm chữ                                                       |

### Sửa đi kèm (làm cùng lượt duyệt)

- **Delta spec** `screening/*` theo câu 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 19; `identity/profile` câu
  12; bỏ phần ảnh nhạy cảm (sang `add-image-moderation`). **`add-listings`**: spec visibility câu 18; design mục 5, 8, 16.
- **TK 13, 14, 25, 29**: các câu trên, kiểm ảnh nhạy cảm tách change riêng; **TK 28**: 9 khoá mới; **TK 30**: dHash.
- **CLAUDE.md**: mục Stack thêm `sharp`; thứ tự change thêm `add-image-moderation`.

## Risks / Trade-offs

- **Chưa kiểm ảnh nhạy cảm**: tới khi có `add-image-moderation`, ảnh nhạy cảm trong tin chỉ bị chặn nếu chữ hay điểm
  giữ tin lại, hoặc bị báo cáo. TK 29 ghi việc này vào mục "còn mở, cần chốt trước khi chạy thật".
- **Lượt gửi chậm thêm** thời gian chấm chữ (đọc có index, trần `textScoreTimeoutMs`). Quá trần thì tin vẫn được nhận
  và giữ cho người — không bao giờ chờ quá trần.
- **dHash bị lách** bằng cắt ảnh, lật, chèn chữ lớn; bắt được ảnh chép lại / nén lại — phần lớn tin lừa dùng ảnh chép.
  Đổi sang pHash hay so nhiều vùng sau qua cùng cổng.
- **Luật tay gõ bừa / sai danh mục bật ngay** có thể giữ nhầm lúc đầu. `hits` ghi đủ để đo; master hạ trọng số hay
  chuyển sang chạy thử không cần phát hành lại (spec rule-management).
- **Thống kê giá chậm một đêm** — đủ cho phân phối 90 ngày.

## Migration Plan

Một migration `init_screening` (bảng mục 4, enum, CHECK, index dải). 12 luật và 3 cổng cứng cùng phiên bản luật 1
khởi tạo lúc khởi động (như bảng con số). `listing` bỏ máy tạm; `env.ts` bỏ `DEV_MACHINE_REVIEW`. Lùi: revert code,
drop bảng; `listing` quay về cổng tạm.

## Đã duyệt (12/10/2026)

| #      | Chốt                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------- |
| S1–S20 | 20 câu ở mục 2 theo đề xuất                                                                             |
| D1     | Chấm chữ đồng bộ trong lượt gửi (`scoreText` trước transaction, `openRun` trong transaction), như TK 30 |
| D2     | Kiểm ảnh nhạy cảm hoãn — change `add-image-moderation`                                                  |
| D3     | Gói `sharp`, dHash, Hamming ≤ 4, index 5 dải                                                            |
| D4     | Gõ bừa, sai danh mục là luật tay, bật ngay                                                              |
| D5     | Tên trúng cụm chắc thay bằng "Người dùng Ghim" lúc đọc                                                  |
| D6     | Phiên bản cụm từ gộp chung chuỗi phiên bản luật                                                         |
