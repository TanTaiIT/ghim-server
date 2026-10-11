# Design

> **Đã duyệt 11/10/2026** (bảng "Đã chốt" cuối file): kho chuẩn S3 — R2 production, RustFS dev / test; ảnh đại
> diện là chủ ảnh đầu tiên, scenario về nháp chuyển sang `add-listings`; sửa TK 25, 28, 30; các mục còn lại theo đề
> xuất.

## Context

- Đã có: `identity` (tài khoản, hồ sơ công khai có trường `avatarUrl` nhưng **chưa chỗ nào ghi** — chưa có cách đặt
  ảnh đại diện, kể cả lấy từ Google; `GoogleIdentity` chưa mang `picture`), outbox, pg-boss, bảng con số có phiên
  bản, mọi test chạy trên Postgres thật.
- Chưa có tin đăng: nháp là của `add-listings`, làm **sau** change này trong đợt 2. Mà gần hết scenario của hai delta
  spec viết theo nháp.
- Hệ cũ (`docs/market`) dùng **Cloudinary**: server ký chữ ký theo người (thư mục `ghim/<userId>`, hạn 1 giờ, 60 chữ
  ký / phút), app tải thẳng, Mongo lưu nguyên đường link `res.cloudinary.com/…`, ảnh công khai trên CDN, biến thể
  ảnh lấy bằng tham số trên URL. Server không kiểm định dạng, dung lượng — để cho preset trên Cloudinary. Dọn bằng
  lượt quét ảnh mồ côi (24 giờ / 7 ngày), việc này chưa từng chạy tới 26/09/2026. Add-on kiểm ảnh nhạy cảm của
  Cloudinary bị tắt vì hết hạn ngạch thì Cloudinary từ chối luôn lượt tải. Ảnh Google lưu nguyên link
  `googleusercontent.com`.
- App cũ nén ảnh về JPEG cạnh dài 1600px, chất lượng 0,75; nén hỏng thì tải **ảnh gốc** (HEIC trên iPhone).
  `ghim-app` chưa có mã tải ảnh, đã chốt hướng: tải thẳng bằng quyền do backend cấp theo người, không bí mật nào
  trong app.
- Tài liệu quy tắc của market nhắc Cloudflare R2; bản thiết kế v3 vẽ Cloudinary. Không có số liệu chi phí, dung
  lượng nào.

## Goals / Non-Goals

**Goals**

- Đủ requirement của `media/image-storage` và `media/image-cleanup`, với **một chủ ảnh chạy thật ngay trong change
  này** (ảnh đại diện), để change archive được với test của chính nó.
- Một cổng cho mọi chủ ảnh sau này (tin, ảnh nhóm…): xin tải, xác nhận lúc chủ lưu, đường xem, dọn — `add-listings`
  chỉ việc cắm vào.
- Ruột ảnh không đổi được sau khi tải (nền cho cam kết 4 khi có kiểm ảnh ở đợt 3).
- Test chạy trên kho thật (container S3 cục bộ), như DB.

**Non-Goals** (giữ như proposal): thu nhỏ, nén (việc của app); tối đa 6 ảnh, ảnh bìa, đổi ảnh thì qua máy lại
(`add-listings`); kiểm trùng, nhạy cảm, danh sách trắng (`add-screening`); hạn lưu, tạm giữ bằng chứng
(`add-data-retention`). Thêm: **biến thể ảnh** (ảnh nhỏ cho danh sách) — `add-listings` quyết khi có bảng tin; bố
cục khoá trong kho để sẵn chỗ. Chuyển ảnh từ Cloudinary của hệ cũ — change chuyển dữ liệu riêng.

## Decisions

### 1. Kho ảnh: chuẩn S3 — Cloudflare R2 ở production, RustFS trong container cho dev và test

| Tiêu chí                                   | R2 (S3)                                 | Cloudinary (hệ cũ)                            | AWS S3             |
| ------------------------------------------ | --------------------------------------- | --------------------------------------------- | ------------------ |
| Chạy được trên máy dev / CI để test thật   | ✓ (container S3 bất kỳ)                 | ✗ — test phải dùng bản giả                    | ✓                  |
| Một quyền tải = đúng một ảnh, không ghi đè | ✓ khoá riêng + `If-None-Match: *` có ký | được (`overwrite: false` + `public_id` có ký) | ✓                  |
| Ảnh riêng tư tới khi tin hiện (TK 13)      | ✓ bucket riêng tư, đường xem có ký      | được, nhưng phải chuyển loại `authenticated`  | ✓                  |
| Server đọc được ruột ảnh để kiểm (đợt 3)   | ✓                                       | ✓                                             | ✓                  |
| Biến thể ảnh                               | tự làm (để `add-listings`)              | ✓ có sẵn trên URL                             | tự làm             |
| Chi phí theo lượt xem                      | không tính băng thông ra                | theo credit, gói trả phí đắt                  | tính băng thông ra |

- Chọn **chuẩn S3**: code chỉ thấy một chuỗi kết nối, đổi nhà cung cấp không đổi code — như `SMTP_URL`. Production
  **Cloudflare R2** (không tính băng thông ra, mà ảnh là phần nặng nhất của sàn rao vặt). Dev và test: **RustFS
  1.0.1** (`rustfs/rustfs:1.0.1`, Apache-2.0) trong docker-compose. MinIO đã không còn image trên Docker Hub
  (kiểm 11/10/2026) nên không dùng; SeaweedFS là phương án dự phòng.
- Container được chọn phải qua **một test cổng** trước mọi thứ khác (task 1.3): tải bằng URL có ký, tải lần hai cùng
  khoá bị từ chối (412), sai `Content-Length` hay `Content-Type` bị từ chối. Không qua thì đổi sang SeaweedFS, không
  nới thiết kế.
- Gói: `@aws-sdk/client-s3` và `@aws-sdk/s3-request-presigner` (3.1149.0) — cần hỏi trước khi cài (CLAUDE.md).
  `aws4fetch` nhẹ hơn nhưng phải tự đọc XML của lệnh liệt kê kho (đối chiếu hằng tháng) — không đáng.
- Biến môi trường: **một** `STORAGE_URL` (`http(s)://<key>:<secret>@<host>[:port]/<bucket>[?region=auto]`, phân
  tích ở `src/config/storage-url.ts`), bắt buộc mọi nơi — test nhận bucket riêng của worker. Cửa vào kho là
  `src/lib/storage.ts` (cạnh `mailer`, `jobs`): ký URL tải lên, ký đường xem, `head`, `deleteMany`, `list`,
  `ensureBucket` — module nào cũng dùng được mà không gọi sang `media`. Luôn dùng đường dẫn kiểu `host/bucket/key`
  (R2, RustFS, S3 đều nhận). Ký URL theo **giờ thật**: kho kiểm hạn chữ ký bằng đồng hồ của nó, không theo đồng hồ
  của app.

### 2. Trả lời câu hỏi mở của proposal (đề xuất)

| Câu hỏi                                                   | Đề xuất                                                                                                                                                                                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Định dạng nhận                                            | JPEG, PNG, WebP. **Không HEIC**: Android và web không hiển thị được; app phải chuyển định dạng, nén hỏng thì báo lỗi chứ không tải ảnh gốc như app cũ                                                                             |
| Dung lượng tối đa mỗi ảnh                                 | 5 MB — ảnh 1600px JPEG 0,75 khoảng 0,3–0,6 MB, dư nhiều cho PNG ảnh chụp màn hình                                                                                                                                                 |
| Hạn của một quyền tải                                     | 15 phút                                                                                                                                                                                                                           |
| Số lượt xin tải tối đa                                    | 120 / giờ / tài khoản — 6 ảnh mỗi tin, chọn lại nhiều lần vẫn dư; chặn kịch bản dùng kho làm chỗ chứa đồ                                                                                                                          |
| 48 giờ, lượt 6 giờ, đối chiếu hằng tháng                  | **48 giờ vào bảng con số** (cam kết 33). Nhịp 6 giờ và hằng tháng là **lịch việc nền** (TK 26), giữ trong code: lịch đăng ký lúc khởi động, đưa vào bảng con số thì đổi số không có tác dụng tới lần khởi động sau — trái luật 19 |
| Ảnh xem được bằng link trực tiếp trước khi tin hiện không | **Không.** Kho riêng tư; mọi đường xem do server ký, có hạn. Ai được xem do chủ ảnh quyết (tin: người đăng + người duyệt cho tới khi hiện) — một hàm cấp đường xem, sau đổi sang CDN chỉ sửa một chỗ                              |
| Một ảnh dùng lại cho nháp khác không                      | **Không.** Ảnh có đúng một chủ suốt đời; app tải lại (ảnh vẫn trên máy)                                                                                                                                                           |
| Tin chuyển lên sàn chung "như tin mới" (TK 9, 10)         | `media` **sao chép** ảnh sang chủ mới ngay trong kho (không qua app), ảnh mới đã xác nhận; ảnh cũ đi theo tin cũ và bị dọn theo tin cũ. Hàm sao chép làm ở `add-listings`, khi có chỗ gọi                                         |
| Đối chiếu thấy tin trỏ tới ảnh không còn trong kho        | Không sửa tin (chỉ `listing` đổi tin): ghi log mức `error` và phát `media.image.missing` (mã ảnh, chủ) để `listing` / hàng duyệt nghe ở đợt sau                                                                                   |

### 3. Phạm vi: chủ ảnh đầu tiên là **ảnh đại diện**; scenario về nháp chuyển sang `add-listings`

Change này archive trước `add-listings`, mà "mỗi scenario là một ca test" — scenario viết theo nháp không test được
khi chưa có nháp. Hai cách:

- **(đề xuất)** Viết lại scenario của `media/*` theo **chủ ảnh** chung, minh hoạ bằng ảnh đại diện (làm thật trong
  change này); chuyển các scenario chỉ nói về nháp — lưu nháp với ảnh ngoài kho / chưa tải xong / của người khác,
  lưu nháp hỏng không gỡ nhãn, nháp bị xoá hẳn kéo ảnh, tin xoá mềm giữ ảnh, ảnh bỏ khỏi nháp — sang
  `listing/drafts` và `listing/deletion` của `add-listings`, nơi `listing` gọi đúng cổng này. Luật không mất câu nào.
- Giữ nguyên spec, làm code `media` bây giờ, **archive cùng lúc** với `add-listings`. Không phải sửa spec, nhưng
  `media` nằm ngoài `openspec/specs/` suốt thời gian làm tin đăng.

Đi kèm: ảnh đại diện cần một route đặt ảnh (`identity/profile`) — thêm requirement vào `identity/profile` (MODIFIED
capability; proposal đang ghi "không có").

### 4. Dữ liệu

`media` sở hữu bảng `images`:

| Cột                         | Ý nghĩa                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `id` uuidv7                 | Cũng là khoá trong kho: `img/<id>` — ai có mã là ký được đường xem, không phải hỏi `media` |
| `owner_kind`, `owner_id`    | Chủ: `profile` (tài khoản) hay `listing` (khai sẵn, `add-listings` nối)                    |
| `uploader_id`               | Người xin tải; FK `accounts`                                                               |
| `content_type`, `byte_size` | Khai lúc xin, ký vào URL tải lên nên kho không nhận khác đi                                |
| `uploaded_at`               | Lần đầu thấy ảnh trong kho (`head`) — trước đó là "chưa tải xong"                          |
| `confirmed_at`              | `null` = nhãn "chưa xác nhận"                                                              |
| `released_at`               | Chủ đã bỏ ảnh này (lưu lại không có nó) — chờ lượt đối chiếu                               |
| `created_at`                | Lúc cấp quyền tải — mốc 48 giờ                                                             |

CHECK: `confirmed_at` cần `uploaded_at`; `released_at` cần `confirmed_at`; `byte_size > 0`. Index theo chủ; partial
index `created_at WHERE confirmed_at IS NULL` cho lượt dọn.

`identity` (ảnh đại diện): đổi `accounts.avatar_url` (chưa từng được ghi) thành `google_picture_url` — ảnh Google
lấy lại mỗi lần đăng nhập Google; thêm `avatar_image_id` (mã ảnh `media`, không FK chéo module) và
`avatar_from_google`. CHECK: không cùng lúc cả hai; `avatar_from_google` cần `google_picture_url`. DTO `avatarUrl`
giữ nguyên tên: đường xem có ký của ảnh, hay link Google.

### 5. Tải lên

`POST /media/uploads` `{ ownerKind, ownerId, contentType, byteSize }` → 201
`{ imageId, upload: { method: 'PUT', url, headers, expiresAt } }`.

- Chủ phải là của người xin: `profile` → `ownerId` là chính tài khoản; `listing` → hỏi cổng của `listing` (chưa có
  thì 404). Chủ của người khác hay không tồn tại → 404 `NOT_FOUND` như nhau.
- `contentType` ngoài ba định dạng, `byteSize` vượt trần → 400 `VALIDATION_ERROR`. Quá 120 lượt / giờ → 429
  `UPLOAD_LIMIT` (đếm trên bảng `images`, không cần bộ đếm riêng).
- URL ký kèm `Content-Type`, `Content-Length` và `If-None-Match: *` — app phải gửi đúng ba header `headers` trả về.
  Khoá mỗi quyền một khoá mới, nên dùng lại URL đã tải xong bị kho trả 412 và ruột ảnh không đổi.

### 6. Xác nhận khi chủ lưu — lời gọi đồng bộ thứ tư

Lưu hồ sơ / nháp phải trả `IMAGE_NOT_IN_STORAGE` **trong chính request**, và nhãn chỉ gỡ khi lần lưu thành công —
lưu hỏng thì nhãn còn. Outbox không làm được (gỡ nhãn sau khi commit có khe: lượt dọn chạy giữa lúc lưu và lúc sự
kiện tới thì xoá mất ảnh vừa lưu). Nên cổng `media` chạy **trong transaction của chủ**, như `appendEvents(tx)` /
`appendAudit(tx)`:

1. `media.resolve({ owner, uploaderId, imageIds })` — **trước** transaction: đọc dòng ảnh; ảnh chưa thấy trong kho
   thì `head` (có, đúng cỡ, đúng loại → ghi `uploaded_at`). Mã không tồn tại, của chủ khác, của người khác, chưa tải
   xong, là đường link → cùng một lỗi 400 `IMAGE_NOT_IN_STORAGE`. Gọi mạng nằm ngoài transaction để không giữ khoá.
2. `media.attach(tx, { owner, imageIds })` — **trong** transaction: khoá các dòng (`FOR UPDATE`), gỡ nhãn ảnh mới,
   đánh `released_at` cho ảnh cũ của chủ không còn trong danh sách. Dòng đã bị lượt dọn xoá giữa bước 1 và 2 →
   `IMAGE_NOT_IN_STORAGE`, transaction quay lui.

Lượt dọn xoá bằng `DELETE … WHERE confirmed_at IS NULL AND created_at < mốc`: dòng đang bị `attach` khoá thì chờ,
và Postgres xét lại điều kiện sau khi khoá nhả — ảnh vừa gỡ nhãn không bị xoá.

TK 30 đang ghi "gọi đồng bộ chỉ ba chỗ" → thêm chỗ thứ tư: **chủ ảnh (Định danh, Tin đăng) gọi Ảnh xác nhận ảnh
trong cùng giao dịch lưu**. Cần người dùng duyệt (sửa luật của TK).

### 7. Đường xem

Kho riêng tư. `storage.viewUrl(imageId)` ký GET có hạn 60 phút, **làm tròn lên mốc giờ** để cùng một ảnh trong
cùng một giờ có cùng URL (app cache được). Hàm thuần (HMAC cục bộ, không đọc DB), nên `identity` cấp đường xem ảnh
đại diện mà không gọi `media`. Ai được xem: chủ ảnh quyết — ảnh đại diện công khai như hồ sơ; ảnh tin theo luật của
`listing`.

### 8. Ảnh đại diện

- `PUT /me/avatar` `{ imageId }` (ảnh `profile` của mình trong kho) hoặc `{ source: 'google' }`; `DELETE /me/avatar`.
  `imageId` nhận chuỗi bất kỳ (không ép uuid) để đường link ngoài kho nhận đúng `IMAGE_NOT_IN_STORAGE` như spec.
- Đăng nhập Google ghi `google_picture_url` (thêm `picture` vào `GoogleIdentity`); tài khoản **tạo bằng Google** mặc
  định dùng ảnh Google (như hệ cũ). `{ source: 'google' }` khi tài khoản chưa nối Google → `IMAGE_NOT_IN_STORAGE`.
- Đổi ảnh: ảnh cũ thành `released_at`, lượt đối chiếu dọn. Xoá mềm tài khoản: ảnh giữ nguyên (spec).

### 9. Dọn ảnh (pg-boss, `media.jobs.ts`)

- `media.purge-unconfirmed` mỗi 6 giờ (`0 */6 * * *`): xoá dòng còn nhãn quá `media.unconfirmedHours`, **rồi** xoá
  vật trong kho. Xoá kho hỏng thì vật thành mồ côi, lượt đối chiếu vét — không bao giờ có dòng trỏ tới vật đã mất.
- `media.reconcile` ngày 1 hằng tháng (`30 3 1 * *`): (a) dòng `released_at`; (b) vật trong kho không có dòng, cũ hơn hạn
  quyền tải; (c) dòng đã thấy trong kho mà vật mất → `media.image.missing`. Kho và bảng cùng xếp theo mã (khoá
  `img/<uuid>`), nên mỗi trang kho so với đúng khoảng mã đó trong bảng. Chủ `profile` không cần hỏi "chủ còn
  không": chủ chính là người tải lên, FK `uploader_id` xoá dòng theo tài khoản, tệp còn lại thành mồ côi cho (b).
  Chủ `listing` không có FK tới bảng của `listing` → `add-listings` thêm bước hỏi cổng của `listing`. Có trần thời gian mỗi lượt; hết trần thì log
  "mới làm được một phần" kèm số đã làm (TK 26 luật 2), lượt sau làm tiếp.
- Mỗi lượt đối chiếu xét ít nhất một trang rồi mới kiểm trần thời gian (10 phút), nên lượt nào cũng tiến; dở thì
  xếp `media.reconcile-continue` kèm mã dừng.
- Tạm giữ bằng chứng (TK 25) và xoá ảnh ngay khi chủ bị xoá hẳn (`deleteByOwner`) **chưa làm**: đợt này chưa dữ
  liệu nào bị tạm giữ, chưa chủ nào bị xoá hẳn qua code. `add-data-retention` thêm bộ lọc tạm giữ vào hai lượt dọn;
  `add-listings` / `add-data-retention` thêm `deleteByOwner` cùng chỗ gọi. Tới lúc đó lượt đối chiếu là lưới an
  toàn.
- Bước khởi động của `media` tạo bucket khi còn thiếu — **chỉ ngoài production**: ở production bucket do hạ tầng
  dựng, và khoá API R2 chỉ cần quyền trên tệp.

### 10. Con số mới (TK 28, nhóm "Ảnh")

`media.maxImageBytes` 5 242 880 · `media.uploadGrantMinutes` 15 · `media.uploadGrantsPerHour` 120 ·
`media.unconfirmedHours` 48 · `media.viewUrlMinutes` 60.

### 11. Route (tiền tố `/api/v1`) và mã lỗi

| Route                 | Ai                              | Mô tả                                         |
| --------------------- | ------------------------------- | --------------------------------------------- |
| `POST /media/uploads` | đã đăng nhập, email đã xác nhận | Xin quyền tải một ảnh cho một chủ của mình    |
| `PUT /me/avatar`      | đã đăng nhập                    | Đặt ảnh đại diện (ảnh trong kho / ảnh Google) |
| `DELETE /me/avatar`   | đã đăng nhập                    | Bỏ ảnh đại diện                               |

Mã lỗi mới: `IMAGE_NOT_IN_STORAGE` (400), `UPLOAD_LIMIT` (429).

### 12. Hạ tầng dev / test

- docker-compose: `storage` (RustFS, cổng 9100, volume) cho dev, `storage-test` (cổng 9110, tmpfs) cho test;
  `pnpm storage:up`, `pnpm storage:test:up`. CI: RustFS là service của job `test`.
- Test: `db-global-setup` tạo một bucket mỗi worker (như DB nhân bản), xoá khi lượt chạy xong; `db-worker-setup`
  xoá sạch bucket đầu mỗi file. Test HTTP tải thật bằng `fetch` lên URL đã ký. Test dọn ảnh đẩy `storageClock` của
  `media` tới trước để tệp vừa tải trông như đã cũ.
- App trên điện thoại thật cần với tới kho dev: `STORAGE_URL` dev dùng IP máy trong mạng LAN thay `localhost` — ghi
  trong `.env.development.example`.

### Sửa TK đi kèm (làm cùng change, sau khi duyệt)

- TK 25: định dạng, dung lượng, kho riêng tư tới khi tin hiện, ảnh không dùng lại giữa các chủ, chuyển lên sàn
  chung thì sao chép ảnh.
- TK 28: nhóm "Ảnh" với năm con số mục 10.
- TK 30: lời gọi đồng bộ thứ tư (mục 6).
- CLAUDE.md: Stack (kho ảnh đã chọn, `STORAGE_URL`, RustFS), luật 12 (bốn chỗ gọi đồng bộ), thư mục
  `src/lib/storage.ts`.

## Risks / Trade-offs

- **R2 với `If-None-Match` trên URL có ký**: R2 nhận header điều kiện khi ghi; test cổng chỉ chạy trên RustFS →
  kiểm lại một lần trên R2 thật lúc dựng môi trường staging (task cuối), trước khi chạy thật.
- **Đường xem có ký không qua CDN**: mỗi lượt xem đi thẳng tới R2. Đủ cho đợt đầu; tải nặng thì đổi
  `storage.viewUrl` sang tên miền riêng có CDN — một hàm.
- **`head` trong request lưu**: một lượt mạng mỗi ảnh mới, chỉ lần đầu (sau đó đọc `uploaded_at`).
- **Không HEIC**: ảnh nén hỏng trên iPhone không tải được — chấp nhận, app báo lỗi rõ; nhận HEIC thì Android và web
  không xem được.
- **Đối chiếu liệt kê cả kho**: tính phí theo lượt liệt kê (1 000 khoá / lượt) — hằng tháng, rẻ.

## Migration Plan

Hai migration: `init_media` (bảng `images`, CHECK, index) và `account_avatar` (đổi tên cột, hai cột mới, CHECK).
`avatar_url` chưa từng có dữ liệu nên đổi tên không mất gì. Ảnh Cloudinary của hệ cũ: change chuyển dữ liệu riêng.

## Đã chốt (11/10/2026)

| #   | Câu hỏi | Chốt                                                                                             |
| --- | ------- | ------------------------------------------------------------------------------------------------ |
| 1   | Kho ảnh | Chuẩn S3: Cloudflare R2 production, RustFS 1.0.1 cho dev và test                                 |
| 2   | Cài gói | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`; image `rustfs/rustfs:1.0.1`               |
| 3   | Phạm vi | Ảnh đại diện làm thật trong change này; scenario chỉ nói về nháp chuyển sang `add-listings`      |
| 4   | Sửa TK  | TK 30 thêm lời gọi đồng bộ thứ tư; TK 28 thêm nhóm "Ảnh"; TK 25 thêm luật ảnh — duyệt, code ngay |
