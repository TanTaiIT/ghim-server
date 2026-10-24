# Việc đang dở — calendar-ghim

> Cập nhật 22/10/2026, sau khi archive `add-price-offers`, `add-team-conversations`, `add-activity-status` và quét lại
> code tìm việc dở (rà soát 15/10/2026 đã xong cả 48 mục — `docs/RA-SOAT-15-10-2026.md`). Một chỗ để nhìn lại những gì đã
> bắt đầu, đã hoãn, hay đang chờ quyết. Làm xong việc nào thì **xoá dòng đó** (git giữ lịch sử); có việc mới bị gác lại
> thì thêm vào đúng mục. Mỗi dòng ghi **nguồn** để mở ra đọc chi tiết — file này chỉ tóm tắt, không thay TK, change hay
> spec.

## 1. Đang chờ quyết hoặc chờ duyệt

| Việc                                       | Tình trạng                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Bước tiếp                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Bốn điểm chốt lúc code `add-review-queues` | Agent tự chốt vì TK, spec chưa nói rõ (ghi "đổi lúc code" trong design): (1) quyết định kiểm vai trước, kiểm việc giữ sau — người bị bãi nhiệm nhận 403 như spec; (2) gỡ khỏi nhóm trực tiếp: chủ nhóm, điều hành cả nhóm, điều hành đơn vị của tin, không theo chuỗi chuyển tiếp; (3) việc ở hàng master từ lúc sinh (danh mục chưa có staff) không "chuyển" khi quá hạn, mốc nhắc 72 giờ tính từ lúc sinh; (4) sáu lý do mẫu khởi đầu chèn ở bước khởi động khi bảng trống | Bạn xác nhận. Điểm nào muốn đổi thì một change nhỏ. Nguồn: `openspec/changes/archive/2026-10-15-add-review-queues/design.md` mục 2, 5, 6, 9 |
| Thư mục Cloudinary dev dùng chung          | Máy này đã dùng thư mục riêng `ghim-server-dev-pc13` (15/10/2026). `ghim-server-dev` còn ảnh của máy kia — lượt đối chiếu của máy này đã lỡ xoá 2 tệp ở đó trước khi đổi                                                                                                                                                                                                                                                                                                     | Máy khác cũng dùng thư mục riêng: `?folder=ghim-server-dev-<tên máy>` trong `.env.development`                                              |
| Skill `/debug`                             | Muốn: đặt breakpoint xong gõ `/debug` là tự vào chế độ debug. Chưa chốt kiểu (mở launch config của VS Code, hay chạy `node --inspect` nền rồi gắn vào)                                                                                                                                                                                                                                                                                                                       | Chọn kiểu rồi viết skill                                                                                                                    |
| Ý tưởng "quản lý hệ thống"                 | Bạn mở đầu "điều gì làm một luồng business đi trật hướng khỏi hệ thống" nhưng chưa gửi phần ý tưởng                                                                                                                                                                                                                                                                                                                                                                          | Gửi ý tưởng để bàn                                                                                                                          |
| Gói đẩy tin, ví Xu                         | Kế hoạch 17/10/2026 ở `docs/KE-HOACH-GOI-DAY-TIN.md`. Bước 0 (`prepare-promotions`) đã archive cùng ngày: `rank_at`, `featured_until`, `quota.fee` 0 Xu. Proposal `add-wallet`, `add-promotions` nằm chờ trong `openspec/changes/`                                                                                                                                                                                                                                           | Chốt 8 câu hỏi mục 7 của kế hoạch và duyệt phụ lục A (bản nháp TK) rồi làm bước 1                                                           |

## 2. Change OpenSpec còn lại — theo thứ tự TK 29

Nguồn: CLAUDE.md mục **Thứ tự change**, `openspec/changes/`. Mỗi change đã có proposal + specs; trả lời **Câu hỏi
mở** trong proposal trước khi `/opsx:apply`. Cột ghi chú kể cả phần `add-review-queues` cố ý để lại cho change sau
(proposal của nó, mục "Không làm").

| Đợt | Change                     | Điều kiện / ghi chú                                                                                                                                                                                                                  |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3 ✔ | `add-image-quality-checks` | Thay `add-image-moderation` (bỏ 24/10/2026: không kiểm nội dung ảnh). Archive 24/10/2026 (PR #14). Master bật "ảnh quá nhỏ" sau deploy, ba luật mờ / tối / sáng sau khi xem lượt trúng chạy thử                                      |
| 4 ✔ | `add-reports`              | Archive 16/10/2026. Còn để cho change sau: báo cáo đúng kèm gậy (`add-strikes`), báo cáo từ hội thoại (`add-messaging`), giữ bằng chứng quá hạn lưu (`add-data-retention`)                                                           |
| 5 ✔ | `add-strikes`              | Archive 17/10/2026. Phần thông báo nhận gậy / kết quả khiếu nại đẩy sang `add-notifications` nhưng change đó đã thu hẹp còn tin nhắn và push — **rơi mất**, nay ở `add-trust-notices`. Hạn lưu hồ sơ gậy xong ở `add-data-retention` |
| 6 ✔ | `add-messaging`            | Archive 17/10/2026. Còn để cho change sau: xoá hẳn và tạm giữ hội thoại → `add-data-retention`                                                                                                                                       |
| 6 ✔ | `add-notifications`        | Archive 17/10/2026 (N47 tin nhắn, push Expo gắn phiên, không đẩy hội thoại đang mở). Chưa có app nên chưa có token thật — gửi push thật chưa thử trên máy                                                                            |
| 7 ✔ | `add-data-retention`       | Archive 17/10/2026. Hạn lưu TK 25, tạm giữ bằng chứng, sổ `job_runs`; khoá vĩnh viễn chỉ ẩn danh hoá sau khi gỡ (design câu 3)                                                                                                       |
| 6 ✔ | `add-price-offers`         | Archive 22/10/2026 (code vào `main` 18/10/2026). Người mua trả giá, người bán chấp nhận / từ chối, chấp nhận chỉ ghi nhận; hội thoại có ảnh bìa, giá, ảnh đại diện                                                                   |
| 6 ✔ | `add-team-conversations`   | Archive 22/10/2026. Hội thoại với Hỗ trợ Ghim và với quản trị một nhóm. Còn để cho change sau: báo cáo một hội thoại với đội (`messaging/block.service.ts`, `docs/messaging.md`)                                                     |
| 6 ✔ | `add-activity-status`      | Archive 22/10/2026. Chỉ bên kia của hội thoại về tin thấy, tắt hai chiều, lần cuối hoạt động trong 7 ngày                                                                                                                            |
| 6 ✔ | `add-trust-notices`        | Archive 24/10/2026 (PR #14). N49–N58: báo nhận gậy, gậy kế thừa, kết quả khiếu nại, ân xá / quyết gậy nghiêm trọng / gỡ khoá vĩnh viễn, gậy hết hạn, mức lên / xuống, thời gian chờ gửi tin; N36 báo quản trị nhóm có tin chờ duyệt  |

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
2. Rà soát pháp lý — dấu băm email, dấu thiết bị, bảng lưu trữ (TK 25), giữ hội thoại làm bằng chứng. Mọi con số đã là
   khoá `retention.*` chỉnh được không cần deploy (`docs/retention.md`). Dữ liệu cá nhân **chưa có hạn lưu** vì TK 25 không
   có dòng (design add-data-retention câu 8): báo cáo kể cả danh tính người báo, điểm tin cậy báo cáo, chặn người, thành
   viên nhóm đang hoạt động, tài khoản bỏ không lâu năm — chốt cùng luật sư rồi thêm bước vào `retention.service.ts`.
   TK 28 nên thêm các dòng `retention.*` (chủ TK sửa).
3. ~~Dịch vụ kiểm ảnh nhạy cảm~~ — chốt 24/10/2026: không kiểm nội dung ảnh (TK 29 còn mở số 3).

Phần **Hoãn lại** của TK 29 (ví Xu, đẩy tin, đánh giá người bán, lưu tin, xác thực số điện thoại, đọc chữ trong ảnh,
DeviceCheck) là quyết định sản phẩm, không phải việc dở — xem ở đó.

## 5. Bảo mật và vận hành

- [x] Production chạy migration `remove_two_factor` (xoá 3 cột) khi deploy — xong 24/10/2026 cùng `add_image_quality_checks` (PR #14); app bản bỏ 2FA lên `main` cùng ngày. `ghim-app` đã bỏ `TwoFactorGate`, ô mã ở
      màn đăng nhập và hàm gọi `/me/two-factor/*`, lấy lối vào bàn vận hành từ cờ `staff` của `/me` (23/10/2026, change
      `add-me-staff-flag`) — bản app đó cần server có cờ này.
- [ ] Tạo lại khoá Cloudinary "moderation" (API secret đã gửi qua chat 15/10/2026), dán vào `.env.development`; nếu hệ
      cũ `docs/Vue` dùng chung tài khoản thì sửa cả bên đó.
- [ ] Neon: xoá project cũ `us-east-1` (chuỗi cũ còn ở dòng comment trong `.env.development` — xoá luôn dòng đó), rồi
      reset mật khẩu `neondb_owner` của project Singapore (chuỗi kết nối đã gửi qua chat 15/10/2026) và cập nhật
      `DATABASE_URL`.
- [ ] CI: `runs-on: ubuntu-latest` chuyển dần sang Ubuntu 26 từ **19/10/2026** — lượt `main` cuối cùng (19/10/2026,
      `39284904930`) vẫn xanh cả ba job nhưng chưa chắc đã chạy trên 26; xem lượt kế tiếp (Postgres, RustFS trong
      container), hỏng thì ghim `ubuntu-24.04`. Nguồn: thông báo trong annotations của lượt CI.
- [ ] Production (Render) chưa có master nên bàn vận hành chưa dùng được ở đó — tạo theo README (bản free không có
      Shell: chạy `dist/cli/create-master.js` từ máy mình vào External Database URL).
- [ ] Push thật: tạo tài khoản Expo / EAS, khoá FCM + APNs khi app sẵn sàng, điền `EXPO_ACCESS_TOKEN` nếu bật Enhanced
      Security; rồi thử một lượt push với token thật trên máy.

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

## 8. App `ghim-app` còn chờ server

Lộ ra khi nối app với server (18–21/10/2026): app ẩn phần đó, đọc dữ liệu mẫu, hoặc ghi "Chưa có API". Việc nào thuộc
phần **Hoãn lại** của TK 29 thì là quyết định sản phẩm, ghi ra để biết app đang chờ gì.

| Việc                                                                          | Hiện trạng ở server                                                                                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tin đã lưu, tìm kiếm đã lưu                                                   | Chưa có — "lưu tin" nằm trong phần hoãn của TK 29; app vẫn đọc mock                                                                              |
| Đánh giá người bán, số giao dịch, thời gian phản hồi, lượt xem, tình trạng đồ | Chưa có trường nào — đánh giá người bán hoãn ở TK 29; app ẩn khi null                                                                            |
| Tìm kiếm: sắp xếp kết quả                                                     | Chỉ khớp chuỗi trên tiêu đề + mô tả; lọc danh mục / tỉnh / phường / giá và theo mẫu thông tin (`attrs`, change `add-listing-filters` 24/10/2026) |
| Bàn vận hành: số liệu theo ngày, danh sách / tìm người dùng, doanh thu        | Chỉ có `/ops/review/stats/*`, `/ops/jobs/runs`; khoá / mở khoá theo mã tài khoản                                                                 |
| Số liệu máy duyệt                                                             | `screening_run_stats` được ghi (`screening.repository.ts`) nhưng chưa route nào đọc                                                              |
| Ảnh trong tin nhắn, khu vực mặc định của người dùng                           | Chưa có                                                                                                                                          |

Dọn nhỏ (comment "tạm" đã lỗi thời, sửa khi chạm tới file): `trust/trust.shared.ts` (`noBuyerInterest`,
`genericHolds` chỉ còn test dùng), `category/category.service.ts` (`settingsOf` "sau này" — screening đã dùng),
`prisma/schema.prisma` (`ImageOwnerKind`: "chưa có chủ nào loại `listing`").
