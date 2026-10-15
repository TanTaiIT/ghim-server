# Việc đang dở — calendar-ghim

> Cập nhật 15/10/2026. Một chỗ để nhìn lại những gì đã bắt đầu, đã hoãn, hay đang chờ quyết. Làm xong việc nào thì
> **xoá dòng đó** (git giữ lịch sử); có việc mới bị gác lại thì thêm vào đúng mục. Mỗi dòng ghi **nguồn** để mở ra đọc
> chi tiết — file này chỉ tóm tắt, không thay TK, change hay spec.

## 1. Đang chờ quyết hoặc chờ duyệt

| Việc                                 | Tình trạng                                                                                                                                                                                                                                | Bước tiếp                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Change `notify-missing-images`       | Đã code (15/10/2026): ảnh mất khỏi kho → báo người đăng (N38) / chủ tài khoản (N39). Unit test xanh, chạy thật trên Neon + Cloudinary dev đúng. Còn task 3.1: test DB `tests/notification-media.db.test.ts` chưa chạy                     | CI xanh → `/opsx:archive notify-missing-images`. Nguồn: `openspec/changes/notify-missing-images/`  |
| PR nháp nhánh `add-listings`         | Chưa mở, nên CI chưa chạy test cần Postgres + RustFS. Máy này không có Docker: các test `*.http.test.ts`, `*.db.test.ts` mới thêm (ca 503 trong `tests/avatar.http.test.ts`, `tests/notification-media.db.test.ts`) **chưa chạy lần nào** | Mở https://github.com/TanTaiIT/ghim-server/pull/new/add-listings, xem CI                           |
| Thư mục Cloudinary dev dùng chung    | `ghim-server-dev` dùng chung giữa các máy dev mà mỗi máy một DB: lượt đối chiếu kho của máy này coi ảnh máy kia là "mồ côi" và xoá — 15/10/2026 đã xoá 2 tệp như thế. Máy kia chạy đối chiếu cũng sẽ xoá ảnh của máy này                  | Mỗi máy một thư mục (vd `?folder=ghim-server-dev-<tên máy>`) trong `.env.development`              |
| Tách module `region` khỏi `category` | Đã đề xuất: dữ liệu xã phường (`category/data/regions.json`, API `/regions/...`) dùng ở nhiều nơi nên đáng là module riêng                                                                                                                | Quyết làm hay không; làm thì là refactor, không cần change                                         |
| Skill `/debug`                       | Muốn: đặt breakpoint xong gõ `/debug` là tự vào chế độ debug. Chưa chốt kiểu (mở launch config của VS Code, hay chạy `node --inspect` nền rồi gắn vào)                                                                                    | Chọn kiểu rồi viết skill                                                                           |
| Ý tưởng "quản lý hệ thống"           | Bạn mở đầu "điều gì làm một luồng business đi trật hướng khỏi hệ thống" nhưng chưa gửi phần ý tưởng                                                                                                                                       | Gửi ý tưởng để bàn                                                                                 |
| Kiểm ảnh nhạy cảm (NSFW)             | Gác lại 15/10/2026. Ứng viên `nsfwjs` (mô hình tự chạy, ảnh không rời hệ thống) — rủi ro: chỉ bắt khiêu dâm; `@tensorflow/tfjs-node` không cập nhật từ 01/2025, chưa chắc cài được trên Node 24 Windows; ngưỡng chưa chốt                 | Khi làm: chạy thử trong thư mục tạm (cài, đo tốc độ, chấm ảnh mẫu) rồi viết `add-image-moderation` |

## 2. Change OpenSpec còn lại — theo thứ tự TK 29

Nguồn: CLAUDE.md mục **Thứ tự change**, `openspec/changes/`. Mỗi change đã có proposal + specs; trả lời **Câu hỏi
mở** trong proposal trước khi `/opsx:apply`.

| Đợt | Change                 | Điều kiện / ghi chú                                                                           |
| --- | ---------------------- | --------------------------------------------------------------------------------------------- |
| 3   | `add-image-moderation` | Chờ chọn dịch vụ kiểm ảnh (mục 1) và rà soát pháp lý nếu gửi ảnh ra ngoài (TK 29 còn mở số 3) |
| 4   | `add-review-queues`    | Thay bản tạm `noOpenWork` trong `listing.ports.ts` (hiện không việc nào khoá nơi đăng)        |
| 4   | `add-reports`          | Sau `add-review-queues`                                                                       |
| 5   | `add-strikes`          |                                                                                               |
| 6   | `add-messaging`        | Rồi `add-notifications`; đẩy thông báo lên điện thoại làm khi app sẵn sàng                    |
| 7   | `add-data-retention`   | Xoá hẳn tin và ảnh theo hạn lưu (TK 25). Tới lúc đó tin xoá mềm vẫn giữ ảnh trong kho         |

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
- [ ] Đổi mật khẩu Neon `ghim_dev` (chuỗi kết nối đã gửi qua chat).
- [ ] App `ghim-app`: bỏ EXIF (vị trí GPS) khi nén ảnh — server không thấy ảnh nên không gỡ được (`docs/media.md` bước 1).

## 6. Môi trường dev trên máy này (không Docker)

Không phải việc dở — ghi để lần sau khỏi dò lại.

- DB: Neon `ghim_dev` (`.env.development`), đã `migrate deploy` tới `init_screening` (15/10/2026). Dữ liệu thử còn đó:
  tài khoản `debug.ghim2@example.com` (đã xác nhận email; ảnh đại diện **đã cố ý xoá tệp** để thử N39 — hộp thư có
  thông báo "Ảnh đại diện", đặt ảnh mới là hết), `smoke.weak@`, `smoke.weak3@example.com`,
  một tin nháp "Smoke test".
- Kho ảnh: Cloudinary thư mục `ghim-server-dev`. Quay lại S3 giả: hướng dẫn ngay trên dòng `STORAGE_URL`.
- Dịch vụ giả: `VueJS/.vscode/ghim-dev-stubs.cjs` — SMTP :1025 in thư (mã xác nhận email đọc ở đây), S3 giả :9100 (không
  còn dùng khi kho là Cloudinary). Nạp qua `NODE_OPTIONS` trong `.env.development`; F5 dùng `VueJS/.vscode/launch.json`.
- Kiểm tra chạy được ở đây: `typecheck`, `lint`, `format:check`, `test:unit`, `spec:validate`, `build`. Test cần
  Postgres + RustFS chỉ chạy trên CI.
