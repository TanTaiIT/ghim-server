# Tasks

> Đã duyệt 11/10/2026 cùng `design.md` (bảng "Đã chốt").

## 0. Hợp đồng

- [x] 0.1 Sửa proposal và delta spec theo design mục 3: scenario của `media/image-storage` và `media/image-cleanup`
      viết theo chủ ảnh, minh hoạ bằng ảnh đại diện; thêm requirement "Đặt ảnh đại diện" vào `identity/profile`
      (MODIFIED); chuyển scenario chỉ nói về nháp sang `listing/drafts` và `listing/deletion` của `add-listings`. Sửa
      TK 25, 28, 30 theo design mục "Sửa TK đi kèm"; xác minh `pnpm run spec:validate` xanh và không luật nào của hai
      spec cũ bị rơi (đối chiếu từng scenario cũ → chỗ mới)

## 1. Hạ tầng kho

- [x] 1.1 Cài `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`; docker-compose thêm `storage` (RustFS 1.0.1,
      volume) và `storage-test` (tmpfs), script `pnpm storage:up`; xác minh `pnpm install --frozen-lockfile` sạch, hai
      container healthy
- [x] 1.2 `STORAGE_URL` ở `src/config/env.ts` (bắt buộc ngoài test, phân tích `s3://…`, từ chối thiếu bucket / khoá);
      `src/lib/storage.ts`: ký URL tải lên (kèm `Content-Type`, `Content-Length`, `If-None-Match: *`), ký
      đường xem làm tròn lên mốc giờ, `head`, `deleteMany`, `list` theo trang; xác minh unit test phân tích chuỗi kết
      nối và làm tròn hạn
- [x] 1.3 Test cổng trên container thật (`tests/storage.test.ts`): tải bằng URL có ký; tải lần hai cùng URL → 412 và
      ruột không đổi; sai `Content-Length` hay `Content-Type` → bị từ chối; URL quá hạn → bị từ chối; đường xem mở
      được, quá hạn thì không. `db-global-setup` tạo một bucket mỗi worker và xoá khi xong. Không qua → đổi sang
      SeaweedFS, không nới thiết kế

## 2. Dữ liệu

- [x] 2.1 Migration `init_media`: bảng `images`, CHECK (`confirmed_at` cần `uploaded_at`, `released_at` cần
      `confirmed_at`, `byte_size > 0`), index theo chủ, partial index ảnh còn nhãn; xác minh `tests/media.db.test.ts`
      mỗi CHECK (23514) và `pnpm db:drift`
- [x] 2.2 Migration `account_avatar`: đổi `avatar_url` → `google_picture_url`, thêm `avatar_image_id`,
      `avatar_from_google`, CHECK không cùng lúc hai nguồn và nguồn Google cần ảnh Google; xác minh test DB và
      `pnpm db:drift`

## 3. Module `media`

- [x] 3.1 Con số nhóm "Ảnh" ở `config-keys.ts` (design mục 10); xác minh `tests/config-keys.test.ts` (13 nhóm)
- [x] 3.2 `media.repository.ts` + `media.service.ts`: xin tải (cổng chủ theo loại, trần lượt, ba định dạng, trần
      dung lượng), `resolve` (ngoài transaction, `head` lần đầu), `attach(tx)` (khoá dòng, gỡ nhãn, đánh dấu ảnh bị
      bỏ); xác minh `tests/media.db.test.ts`: `attach` đua với lượt dọn → ảnh vừa gỡ nhãn
      không bị xoá; `resolve` trả cùng một lỗi cho mã lạ, chủ khác, người khác, chưa tải xong, đường link
- [x] 3.3 Route `POST /media/uploads`, Swagger khai mã lỗi, `media.module.ts` nối vào `buildApp`, `Repositories`,
      `AppServices`, `tests/test-app.ts`; xác minh `tests/media.http.test.ts` mọi scenario của `media/image-storage`,
      tải thật lên kho test bằng URL trả về

## 4. Ảnh đại diện (`identity`)

- [x] 4.1 `GoogleIdentity.picture`; đăng nhập Google ghi `google_picture_url`; tài khoản tạo bằng Google mặc định dùng
      ảnh Google; xác minh `tests/google.http.test.ts`
- [x] 4.2 `PUT /me/avatar`, `DELETE /me/avatar` qua `resolve` / `attach`; `GET /me` và hồ sơ công khai trả
      `avatarUrl` là đường xem có ký hay link Google; xác minh `tests/avatar.http.test.ts` mọi scenario ảnh đại diện
      (ảnh trong kho, ảnh Google, link ngoài 400, ảnh của người khác 400, lưu hỏng giữ nhãn, đổi ảnh thì ảnh cũ bị
      đánh dấu bỏ), đường xem tải được ảnh thật

## 5. Dọn ảnh

- [x] 5.1 `media.purge-unconfirmed` mỗi 6 giờ: xoá dòng rồi xoá vật; xác minh test với đồng hồ cố định: 47 giờ còn, 49
      giờ mất cả dòng lẫn vật, ảnh đã gỡ nhãn không mất, chạy lại không làm gì thêm
- [x] 5.2 `media.reconcile` hằng tháng: ảnh bị bỏ, chủ không còn, vật mồ côi, vật mất → `media.image.missing`; bộ lọc
      tạm giữ (rỗng); trần thời gian → log "mới làm được một phần"; xác minh test trên kho thật từng nhánh, và ảnh
      còn nhãn chưa quá 48 giờ không bị đụng

## 6. Tài liệu và kiểm tra tích hợp

- [x] 6.1 `docs/media.md` cho đội app (xin tải, ba header phải gửi, định dạng / dung lượng, mã lỗi, đường xem có hạn);
      CLAUDE.md (Stack, luật 12, `src/lib/storage.ts`, module `media`), README, `tests/README.md`,
      `.env.development.example` / `.env.production.example`; xác minh `pnpm run format:check`
- [x] 6.2 `pnpm run check`, `pnpm db:drift`, `pnpm run build` xanh; bản build với env dev và RustFS: xin tải → tải
      bằng URL → đặt ảnh đại diện → hồ sơ trả đường xem mở được ảnh; ghi vào danh sách việc trước khi chạy thật: kiểm
      `If-None-Match` trên R2 thật
