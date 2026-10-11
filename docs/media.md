# Tải ảnh và ảnh đại diện — hướng dẫn cho app

App tải ảnh **thẳng vào kho** (chuẩn S3: Cloudflare R2 ở production, RustFS khi dev) bằng một quyền tải do server
cấp cho đúng một ảnh. Ảnh không đi qua server, và app không giữ bí mật nào của kho.

Hợp đồng đầy đủ: `openspec/specs/media/` (`image-storage`, `image-cleanup`) và `openspec/specs/identity/profile/`;
thiết kế ở `openspec/changes/archive/2026-10-11-add-media/design.md`. Luật nghiệp vụ ở TK 25.

## Ba bước

1. **Nén trên máy** (TK 25): JPEG, PNG hoặc WebP, tối đa 5 MB. **Không gửi HEIC** — server từ chối, và Android /
   web không xem được. Nén hỏng thì báo lỗi cho người dùng, đừng tải ảnh gốc.
2. **Xin quyền tải** cho đúng chủ của ảnh:

   ```http
   POST /api/v1/media/uploads
   Authorization: Bearer <access token>

   { "ownerKind": "profile", "ownerId": "<mã tài khoản của mình>", "contentType": "image/jpeg", "byteSize": 482113 }
   ```

   → 201

   ```json
   {
     "imageId": "0199…",
     "upload": {
       "method": "PUT",
       "url": "https://…",
       "headers": { "Content-Type": "image/jpeg", "If-None-Match": "*" },
       "expiresAt": "…"
     }
   }
   ```

3. **Tải lên**: `PUT` đúng `upload.url`, gửi **đúng nguyên văn** `upload.headers`, thân là tệp đã nén có **đúng
   `byteSize` byte** (HTTP client tự đặt `Content-Length`). Chữ ký phủ cả ba thứ: sai loại, sai cỡ, thiếu header →
   kho trả 403. Quyền tải sống 15 phút và chỉ dùng **một lần**: tải lần hai cùng URL → 412.

Xong bước 3 ảnh mới **nằm trong kho**, mang nhãn "chưa xác nhận". Nó chỉ thành ảnh thật khi chủ của nó được **lưu**
cùng ảnh (bước 4). Ảnh không được lưu trong 48 giờ thì bị dọn.

## Bước 4 — lưu chủ cùng ảnh

Ảnh đại diện:

```http
PUT /api/v1/me/avatar      { "imageId": "0199…" }   ← ảnh vừa tải cho hồ sơ của mình
PUT /api/v1/me/avatar      { "source": "google" }   ← ảnh của tài khoản Google đã nối
DELETE /api/v1/me/avatar                            ← bỏ ảnh
```

Cả ba trả `GET /me` mới. Tin đăng (`add-listings`) dùng cùng cách: xin tải với `ownerKind: "listing"` và mã nháp, rồi
lưu nháp kèm các `imageId`.

## Hiện ảnh

`avatarUrl` (và mọi đường ảnh server trả về) là **đường xem có hạn**, sống 1–2 giờ, cùng một ảnh trong cùng một giờ
ra cùng một URL nên cache theo URL là đúng. Đừng lưu URL lâu dài — tải lại hồ sơ khi URL hết hạn (kho trả 403). Ảnh
Google là link `googleusercontent.com`, dùng thẳng.

## Mã lỗi

| Lúc              | HTTP · mã                  | Nghĩa                                                                                       |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| Xin quyền tải    | 400 `VALIDATION_ERROR`     | Không phải JPEG / PNG / WebP, hoặc quá 5 MB (câu báo có trần)                               |
| Xin quyền tải    | 404 `NOT_FOUND`            | Chủ không phải của mình (hay không tồn tại — server không phân biệt)                        |
| Xin quyền tải    | 429 `UPLOAD_LIMIT`         | Quá 120 lượt xin trong một giờ                                                              |
| Tải lên kho      | 403 · 412                  | Sai header / cỡ / quyền quá hạn · URL đã dùng rồi — xin quyền mới                           |
| Lưu chủ cùng ảnh | 400 `IMAGE_NOT_IN_STORAGE` | Ảnh chưa tải xong, của người khác, tải cho chủ khác, đã bị dọn, hay là đường link ngoài kho |

Mọi con số trên là giá trị khởi đầu của bảng con số (TK 28, nhóm "Ảnh"); master chỉnh được, app đừng chép cứng —
đọc câu báo lỗi.
