# Việc đang dở — calendar-ghim

> Cập nhật 16/10/2026, sau khi archive `fix-audit-trust-media-low` (rà soát 15/10/2026 xong cả 48 mục). Một chỗ để nhìn lại những gì đã
> bắt đầu, đã hoãn, hay đang chờ quyết. Làm xong việc nào thì **xoá dòng đó** (git giữ lịch sử); có việc mới bị gác lại
> thì thêm vào đúng mục. Mỗi dòng ghi **nguồn** để mở ra đọc chi tiết — file này chỉ tóm tắt, không thay TK, change hay
> spec.

## 0. Ưu tiên: sửa lỗi rà soát 15/10/2026 — trước mọi tính năng mới

Rà soát đọc code mọi module đã làm tìm ra 48 mục: 11 mức cao, 24 trung bình, 13 thấp. Chi tiết, chỗ trong code, kịch bản
và hướng sửa ở **`docs/RA-SOAT-15-10-2026.md`** (đánh dấu từng mục khi sửa xong). Chốt 15/10/2026: sửa hết trước khi làm
`add-reports` hay tính năng nào khác.

| Đợt | Mục                          | Nội dung                                                                                                                      |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1 ✔ | C3, C4, C5, C6, T10          | Bảo mật: chiếm tài khoản qua Google, master tự xoá / khoá, đăng ký lại lớp thứ hai, master qua app nhóm, trần / sàn cấu hình  |
| 2 ✔ | C1, C2, C7, C8, C9, C10, C11 | Dữ liệu kẹt hay mất: bên nghe đối chiếu trạng thái hiện tại, kiểm ảnh bị bỏ, lý do ẩn bám theo, việc mất, xoá cứng dây chuyền |
| 3 ✔ | T1–T24                       | Mức trung bình — xong (A1, A2, A3, B, C)                                                                                      |
| 4 ✔ | L1–L13                       | Mức thấp — xong (phần 1 tài khoản, phần 2 nhóm, phần 3 mức tin cậy + ảnh; L13 chuyển `add-data-retention`)                    |

Mục nào đổi hành vi so với spec đang chạy thì đi qua một change OpenSpec (proposal có câu hỏi mở → bạn duyệt → code);
mục code lệch spec thì sửa kèm test.

**Đang dừng ở (16/10/2026):** người dùng giao tech lead chọn phương án. Đã xong và đã push (nhánh
`add-listings`), mỗi phần một change đã archive, một commit:

- đợt 1 — `fix-audit-security` (C3, C4, C5, C6, T10);
- đợt 2 — `fix-audit-stuck-data` (C7, C8, C9, C10, T13), `fix-audit-image-checks` (C2, T20, L8, C11),
  `fix-audit-listeners` (C1);
- đợt 3 phần C — `fix-audit-screening-trust` (T21–T24, cặp tin sạch của `trust`);
- đợt 3 phần B — `fix-audit-review` (T1–T9, L11);
- đợt 3 phần A1 — `fix-audit-identity` (T11 ân hạn 30 giây, T12 đổi email đòi mật khẩu + mã, báo email cũ, thu phiên
  khác). **Phá vỡ API**: body `POST /me/email-change` thêm `currentPassword` (bắt buộc), `totpCode` (tuỳ);
- đợt 3 phần A2 — `fix-audit-listing` (T14, T15, T16);
- đợt 3 phần A3 — `fix-audit-group` (T17 gỡ cấm khi nhận làm chủ, T18 một thứ tự khoá + P2034 → 409, T19 danh sách
  lời mời / người bị cấm, lời mời "mù" — migration `group_invitations_blind`). Thêm API: `GET /groups/:groupId/invitations`,
  `GET /groups/:groupId/bans`. Test HTTP / DB chạy trên CI khi mở PR;
- đợt 4 phần 1 — `fix-audit-identity-low` (L1 mở khoá trả về trạng thái lúc khoá — migration `account_status_before_lock`, L2
  không tự xử việc của mình + duyệt giấy tờ có điều kiện, L3 trần phiên trong một transaction, L12 mở khoá phát `flag_cleared`);
- đợt 4 phần 2 — `fix-audit-group-low` (L3 chủ bị xoá → thiếu chủ, L4 chuyển xong sang riêng tư rồi mới thiếu chủ, L5 huỷ kèm
  theo phát sự kiện, L6 `GROUP_MODE_CONFLICT` + khoá ngoại thông báo → đơn vị — migration `group_announcement_unit_fk`);
- đợt 4 phần 3 — `fix-audit-trust-media-low` (L7 đọc mức trong transaction, L9 T3 còn tin sạch chưa tính thì tính lại, L10
  sự kiện mới `media.images.deleted` → `screening` dọn dấu ảnh; L13 chuyển vào proposal `add-data-retention`).

CI đã chạy hết qua PR #3, #5, #6 (16/10/2026, xanh). Production còn cần `pnpm db:deploy:prod` cho ba migration
`group_invitations_blind`, `account_status_before_lock`, `group_announcement_unit_fk` trước khi bật bản mới.

Phần hoãn cuối của rà soát — thông báo nhóm theo trạng thái hiện tại (N3, N6, N10–N14, N26–N28) — xong ở
`fix-stale-group-notices` (16/10/2026). **Làm tiếp:** `add-reports`.

## 1. Đang chờ quyết hoặc chờ duyệt

| Việc                                       | Tình trạng                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Bước tiếp                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| PR nhánh `add-listings`                    | Đã mở; CI xanh 15/10/2026 (lượt 38719075637: check + 2069 test + `db:drift`). `add-review-queues`, `notify-missing-images` đã archive cùng ngày                                                                                                                                                                                                                                                                                                                              | Duyệt rồi merge vào `main`                                                                                                                  |
| Bốn điểm chốt lúc code `add-review-queues` | Agent tự chốt vì TK, spec chưa nói rõ (ghi "đổi lúc code" trong design): (1) quyết định kiểm vai trước, kiểm việc giữ sau — người bị bãi nhiệm nhận 403 như spec; (2) gỡ khỏi nhóm trực tiếp: chủ nhóm, điều hành cả nhóm, điều hành đơn vị của tin, không theo chuỗi chuyển tiếp; (3) việc ở hàng master từ lúc sinh (danh mục chưa có staff) không "chuyển" khi quá hạn, mốc nhắc 72 giờ tính từ lúc sinh; (4) sáu lý do mẫu khởi đầu chèn ở bước khởi động khi bảng trống | Bạn xác nhận. Điểm nào muốn đổi thì một change nhỏ. Nguồn: `openspec/changes/archive/2026-10-15-add-review-queues/design.md` mục 2, 5, 6, 9 |
| Thư mục Cloudinary dev dùng chung          | Máy này đã dùng thư mục riêng `ghim-server-dev-pc13` (15/10/2026). `ghim-server-dev` còn ảnh của máy kia — lượt đối chiếu của máy này đã lỡ xoá 2 tệp ở đó trước khi đổi                                                                                                                                                                                                                                                                                                     | Máy khác cũng dùng thư mục riêng: `?folder=ghim-server-dev-<tên máy>` trong `.env.development`                                              |
| Ghi dấu máy lúc đăng nhập của staff        | Luật "không xử việc của tài khoản dùng chung máy" chỉ biết hai tài khoản chung máy qua lượt **đăng tin** (`device_posts`). Staff chưa từng đăng tin từ máy mình thì tài khoản phụ của họ lọt                                                                                                                                                                                                                                                                                 | Change nhỏ: ghi dấu máy lúc staff, điều hành viên đăng nhập. Nguồn: design `add-review-queues` Risks, proposal câu 2                        |
| Tách module `region` khỏi `category`       | Đã đề xuất: dữ liệu xã phường (`category/data/regions.json`, API `/regions/...`) dùng ở nhiều nơi nên đáng là module riêng                                                                                                                                                                                                                                                                                                                                                   | Quyết làm hay không; làm thì là refactor, không cần change                                                                                  |
| Skill `/debug`                             | Muốn: đặt breakpoint xong gõ `/debug` là tự vào chế độ debug. Chưa chốt kiểu (mở launch config của VS Code, hay chạy `node --inspect` nền rồi gắn vào)                                                                                                                                                                                                                                                                                                                       | Chọn kiểu rồi viết skill                                                                                                                    |
| Ý tưởng "quản lý hệ thống"                 | Bạn mở đầu "điều gì làm một luồng business đi trật hướng khỏi hệ thống" nhưng chưa gửi phần ý tưởng                                                                                                                                                                                                                                                                                                                                                                          | Gửi ý tưởng để bàn                                                                                                                          |
| Kiểm ảnh nhạy cảm (NSFW)                   | Gác lại 15/10/2026. Ứng viên `nsfwjs` (mô hình tự chạy, ảnh không rời hệ thống) — rủi ro: chỉ bắt khiêu dâm; `@tensorflow/tfjs-node` không cập nhật từ 01/2025, chưa chắc cài được trên Node 24 Windows; ngưỡng chưa chốt                                                                                                                                                                                                                                                    | Khi làm: chạy thử trong thư mục tạm (cài, đo tốc độ, chấm ảnh mẫu) rồi viết `add-image-moderation`                                          |

## 2. Change OpenSpec còn lại — theo thứ tự TK 29

Nguồn: CLAUDE.md mục **Thứ tự change**, `openspec/changes/`. Mỗi change đã có proposal + specs; trả lời **Câu hỏi
mở** trong proposal trước khi `/opsx:apply`. Cột ghi chú kể cả phần `add-review-queues` cố ý để lại cho change sau
(proposal của nó, mục "Không làm").

| Đợt | Change                 | Điều kiện / ghi chú                                                                                                                                                          |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | `add-image-moderation` | Chờ chọn dịch vụ kiểm ảnh (mục 1) và rà soát pháp lý nếu gửi ảnh ra ngoài (TK 29 còn mở số 3)                                                                                |
| 4   | `add-reports`          | Sau khi sửa xong lỗi rà soát (mục 0). Thêm hàng 1 (lý do `report`) vào hàng chờ; điểm báo cáo và báo cáo liên quan trong màn xử việc                                         |
| 5   | `add-strikes`          | Kết quả "vi phạm" (gậy) cho người duyệt; xác nhận việc hàng 4 kèm gậy; hàng 2 khiếu nại (lý do `appeal`, hạn 7 ngày); lịch sử gậy của người bán trong màn xử việc và nhật ký |
| 6   | `add-messaging`        | Rồi `add-notifications`: đẩy lên điện thoại khi app sẵn sàng. Báo người đăng kết quả duyệt tin đã làm ở `notify-listing-decisions` (archive 16/10/2026)                      |
| 7   | `add-data-retention`   | Xoá hẳn tin và ảnh theo hạn lưu (TK 25). Tới lúc đó tin xoá mềm vẫn giữ ảnh trong kho                                                                                        |

## 3. Chuyển kho ảnh Cloudinary → Cloudflare R2

Cloudinary chỉ dùng tạm (change `use-cloudinary-storage`, archive 15/10/2026). Ngày chuyển:

- [ ] Kiểm trên R2 thật: quyền tải `PUT` kèm `If-None-Match: *` dùng lại lần hai phải bị từ chối (412) — Backblaze B2
      bị loại vì trả 501 đúng ở chỗ này (proposal `use-cloudinary-storage`).
- [ ] Bộ nối S3 (`src/lib/storage/s3.storage.ts`) có hạn giờ và ném `StorageUnavailableError` như bộ nối Cloudinary —
      hiện **chưa có**, phải làm trước khi R2 lên production (không thì kho chậm thành 500 thay vì 503).
- [ ] Đổi `STORAGE_URL` sang `https://<key>:<secret>@<account>.r2.cloudflarestorage.com/<bucket>` (production, dev).
- [ ] Chép ảnh đã có trên Cloudinary (`ghim-server/img/*`) sang R2 cùng khoá `img/<mã ảnh>`, nếu đã có ảnh thật.
- [ ] Gỡ Cloudinary: nhánh trong `create-storage.ts`, `cloudinary.storage.ts`, dạng `cloudinary://` trong
      `src/config/storage-url.ts`, `tests/cloudinary-storage.test.ts`; sửa `docs/media.md`, CLAUDE.md, `.env.*.example`.
- [ ] Spec `media/image-storage`: bỏ các câu "khi kho là Cloudinary" (một change nhỏ).
- Tự hết khi lên R2 — không cần làm gì thêm:
  - đường xem lại có hạn 60 phút (`media.viewUrlMinutes`); trên Cloudinary link ảnh không hết hạn;
  - **ảnh của tin đã xoá hay bị gỡ vì vi phạm hết xem được qua link cũ** — trên Cloudinary vẫn xem được tới khi ảnh bị
    xoá hẳn (bạn chọn chờ R2, 15/10/2026);
  - quyền tải lại hạn 15 phút (Cloudinary 1 giờ); ảnh sai cỡ bị kho chặn ngay chứ không đợi bước xác nhận.

## 4. TK 29 — còn mở, cần chốt trước khi chạy thật

Nguồn: `docs/THIET-KE-HE-THONG.md` phần 29.

1. Danh mục luôn duyệt tay giữ 100% tin — đủ staff không?
2. Rà soát pháp lý — dấu băm email, dấu thiết bị, bảng lưu trữ (TK 25), giữ hội thoại làm bằng chứng.
3. Dịch vụ kiểm ảnh nhạy cảm (mục 1, mục 2).

Phần **Hoãn lại** của TK 29 (ví Xu, đẩy tin, đánh giá người bán, lưu tin, xác thực số điện thoại, đọc chữ trong ảnh,
DeviceCheck) là quyết định sản phẩm, không phải việc dở — xem ở đó.

## 5. Bảo mật và vận hành

- [ ] Tạo lại khoá Cloudinary "moderation" (API secret đã gửi qua chat 15/10/2026), dán vào `.env.development`; nếu hệ
      cũ `docs/Vue` dùng chung tài khoản thì sửa cả bên đó.
- [ ] Neon: xoá project cũ `us-east-1` (chuỗi cũ còn ở dòng comment trong `.env.development` — xoá luôn dòng đó), rồi
      reset mật khẩu `neondb_owner` của project Singapore (chuỗi kết nối đã gửi qua chat 15/10/2026) và cập nhật
      `DATABASE_URL`.
- [ ] App `ghim-app`: bỏ EXIF (vị trí GPS) khi nén ảnh — server không thấy ảnh nên không gỡ được (`docs/media.md` bước 1).
- [ ] CI: đã nâng lên `actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v6` (chạy Node 24) ngày
      15/10/2026 — xem lượt CI kế tiếp còn xanh và hết cảnh báo Node 20 thì xoá dòng này.
- [ ] CI: `runs-on: ubuntu-latest` chuyển sang Ubuntu 26 từ **19/10/2026** — xem lượt CI đầu tiên sau ngày đó (Postgres,
      RustFS trong container); hỏng thì ghim `ubuntu-24.04`. Nguồn: cảnh báo của cùng lượt CI.

## 6. Theo dõi khi có người dùng thật

Không hỏng gì lúc này — là giới hạn đã biết của `add-review-queues`, cần nhìn lại khi số liệu lớn lên. Nguồn: design
`add-review-queues` mục Risks.

- **Hàng chờ tính người xử lúc đọc**, một lượt đọc tối đa 2000 việc mở (`OPEN_TASKS_CAP`, `review.repository.ts`): hàng
  chờ, bảng tồn, lượt nhắc master và cảnh báo sắp chạm hạn không thấy việc vượt trần. Việc mở thường xuyên trên vài trăm
  thì lưu bậc xử vào việc và tính lại theo sự kiện.
- **Lấy mẫu hậu kiểm** xét tối đa 500 tin mới lên bảng mỗi giờ (`CANDIDATE_BATCH`, `schedule.service.ts`); hơn thế thì
  ứng viên dồn sang giờ sau — nâng trần hay chạy dày hơn.
- **Ảnh trùng không lưu "trùng với tin nào"**: màn xử việc tính lại, có thể khác lúc máy chấm nếu ảnh kia đã bị xoá.
- **Sáu lý do mẫu khởi đầu nằm ở hai chỗ**: migration `init_review` (không sửa được) và `DEFAULT_REASON_TEMPLATES`
  (`review.schema.ts`). DB mới vẫn nhận câu của migration trước, nên đổi câu khởi đầu thì làm bằng migration mới.

## 7. Môi trường dev trên máy này (không Docker)

Không phải việc dở — ghi để lần sau khỏi dò lại.

- DB: Neon Singapore (`ap-southeast-1`), database `ghim_dev`, host trực tiếp không `-pooler` (chuyển 15/10/2026). Đo:
  ~26 ms một truy vấn, chấm chữ ~135 ms (us-east-1 cũ: ~250 ms, chấm chữ quá hạn 2 s nên mọi tin bị giữ). Dữ liệu
  thử: tài khoản `debug.ghim2@example.com` (đã xác nhận email, mức T0 nên tin hiện hạn chế `new_account`), danh mục
  "Danh mục thử — kiểm luồng đăng tin", một tin đã bán.
- Kho ảnh: Cloudinary thư mục `ghim-server-dev-pc13` của riêng máy này. Quay lại S3 giả: hướng dẫn ngay trên dòng
  `STORAGE_URL`.
- Dịch vụ giả: `VueJS/.vscode/ghim-dev-stubs.cjs` — SMTP :1025 in thư (mã xác nhận email đọc ở đây) và ghi nối vào
  `<thư mục tạm>/ghim-dev-mail.log`, S3 giả :9100 (không còn dùng khi kho là Cloudinary). Nạp qua `NODE_OPTIONS` trong
  `.env.development`; F5 dùng `VueJS/.vscode/launch.json`.
- Chạy khói luồng đăng tin: bật server (`pnpm dev`) rồi `pnpm smoke:posting` (`src/cli/smoke-posting.ts`). Hai tài khoản mới
  qua đúng API của app: A đăng một ảnh ngẫu nhiên → lên bảng, hạn chế "tài khoản mới", đúng các chỗ hiển thị của tin hạn
  chế; A bật "giao tận nơi" (không qua máy), sửa giá (qua máy lại); B đăng đúng ảnh đó → máy giữ vì ảnh trùng, khách
  nhận 404, hàng chờ có việc, B nhận thông báo "tin đang chờ người duyệt" (N43); A sửa giá lần nữa vẫn qua (người đăng trước thắng — change `duplicate-image-first-wins`); B đánh dấu đã bán tin
  của A → 403, A đánh dấu đã bán, B rút tin về nháp. Tự kiểm 22 điều
  (đọc DB chỉ để đối chiếu), thoát 1 khi lệch. Mã email đọc từ mailpit, không có thì từ tệp thư của stub. Mỗi lượt để lại 2 tài khoản
  `khoi.*@example.com`, 2 tin, 2 ảnh trên Neon / Cloudinary dev. Lượt 16/10/2026: ~52 s — tải ảnh lên Cloudinary ~1,7 s,
  máy quyết 7–13 s sau khi gửi, việc vào hàng chờ ~10 s sau đó (bộ phát outbox quét mỗi 10 s).
- Kiểm tra chạy được ở đây: `typecheck`, `lint`, `format:check`, `test:unit`, `spec:validate`, `build`, `db:drift`
  (chỉ đọc, so Neon dev với schema). Test cần Postgres + RustFS: máy có Docker Desktop nhưng không tự bật — bật app
  rồi `docker compose up -d --wait postgres-test storage-test`, sau đó `pnpm run check` chạy đủ (16/10/2026). CI chỉ
  chạy khi có pull request (hoặc push lên `main`, `develop`).
- Đọc kết quả CI khi máy không có `gh`: repo công khai nên API đọc không cần đăng nhập —
  `api.github.com/repos/TanTaiIT/ghim-server/actions/runs?branch=<nhánh>` (lượt chạy), `/actions/runs/<id>/jobs` (job),
  `/check-runs/<id job>/annotations` (test hỏng). Mỗi bước hiện tối đa 10 lỗi; trần 60 lượt gọi mỗi giờ. Log đầy đủ
  cần đăng nhập — chụp màn hình.
- VS Code báo lỗi kiểu Prisma (không thấy `reviewTask`…) sau khi đổi schema: language server dùng client cũ — chạy
  "TypeScript: Restart TS Server". `pnpm run typecheck` mới là chuẩn.
