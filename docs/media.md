# Tải ảnh và ảnh đại diện — hướng dẫn cho app

App tải ảnh **thẳng vào kho** bằng một quyền tải do server cấp cho đúng một ảnh. Ảnh không đi qua server, và app
không giữ bí mật nào của kho. Kho hiện là **Cloudinary** (dùng tạm, change `use-cloudinary-storage`); về sau là
Cloudflare R2, còn test chạy RustFS (chuẩn S3). App không cần biết kho nào — chỉ làm theo `upload.method` (bước 3).

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
       "method": "POST",
       "url": "https://api.cloudinary.com/v1_1/…/image/upload",
       "headers": {},
       "fields": { "api_key": "…", "public_id": "…", "signature": "…", "timestamp": "…", "…": "…" },
       "expiresAt": "…"
     }
   }
   ```

3. **Tải lên** theo `upload.method`:
   - `POST` (Cloudinary): gửi **biểu mẫu multipart** tới `upload.url` gồm **đúng nguyên văn** mọi cặp trong
     `upload.fields`, rồi tệp đã nén ở trường `file` (gửi sau cùng). Thừa, thiếu hay sửa một trường là chữ ký sai.
     Kho chỉ nhận JPEG / PNG / WebP; tải lại bằng quyền tải đã dùng không thay được ảnh. Cỡ ảnh phải **đúng
     `byteSize`** đã khai — kho không chặn, nhưng bước 4 từ chối ảnh lệch cỡ.
   - `PUT` (kho chuẩn S3): gửi thân là tệp đã nén có **đúng `byteSize` byte** tới `upload.url`, kèm **đúng nguyên văn**
     `upload.headers` (`fields` rỗng). Chữ ký phủ loại, cỡ và header: sai một thứ → kho trả 403; tải lần hai cùng URL
     → 412.

   Quyền tải dùng cho **một ảnh**, nên tải ngay sau khi xin (hạn 15 phút; Cloudinary nhận tới 1 giờ).

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

`avatarUrl` (và mọi đường ảnh server trả về) là **đường xem có chữ ký**; cùng một ảnh ra cùng một URL nên cache theo
URL là đúng. Với Cloudinary đường xem không hết hạn; với kho chuẩn S3 nó sống 1–2 giờ (kho trả 403 khi hết hạn). Đừng
lưu URL lâu dài — luôn lấy URL mới từ response, để chuyển kho không làm hỏng ảnh. Ảnh Google là link
`googleusercontent.com`, dùng thẳng.

## Mã lỗi

| Lúc              | HTTP · mã                  | Nghĩa                                                                                                               |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Xin quyền tải    | 400 `VALIDATION_ERROR`     | Không phải JPEG / PNG / WebP, hoặc quá 5 MB (câu báo có trần)                                                       |
| Xin quyền tải    | 404 `NOT_FOUND`            | Chủ không phải của mình (hay không tồn tại — server không phân biệt)                                                |
| Xin quyền tải    | 429 `UPLOAD_LIMIT`         | Quá 120 lượt xin trong một giờ                                                                                      |
| Tải lên kho      | 4xx                        | Chữ ký sai, quyền quá hạn, không phải ảnh, URL đã dùng rồi (kho S3) — xin quyền mới                                 |
| Lưu chủ cùng ảnh | 400 `IMAGE_NOT_IN_STORAGE` | Ảnh chưa tải xong, lệch cỡ / loại đã khai, của người khác, tải cho chủ khác, đã bị dọn, hay là đường link ngoài kho |

Mọi con số trên là giá trị khởi đầu của bảng con số (TK 28, nhóm "Ảnh"); master chỉnh được, app đừng chép cứng —
đọc câu báo lỗi.
