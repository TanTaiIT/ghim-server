# Proposal

## Why

Chạy khói luồng đăng tin trên dev ngày 16/10/2026 (`pnpm smoke:posting`, Neon + Cloudinary thật): A đăng một ảnh,
B — tài khoản khác — đăng đúng ảnh đó. Tin của B bị giữ vì cổng cứng "ảnh trùng", đúng. Rồi A chỉ sửa giá tin của
mình: tin của A **cũng bị giữ** vì "ảnh trùng" với bản của B.

Máy so mỗi ảnh với ảnh của mọi tài khoản khác đã kiểm, không xét ai đăng trước — spec `screening/image-checks` chỉ nói
"so trùng với ảnh của mọi tài khoản khác". Hệ quả: kẻ chép ảnh làm tin của chủ ảnh bị giữ mỗi lần chủ sửa nội dung,
gia hạn hay gửi lại; bản chép đang chờ duyệt hay đã bị từ chối vẫn được tính. Người duyệt cũng thấy chủ ảnh có "ảnh
trùng với tin của B" như thể chủ ảnh mới là người chép.

Người dùng chọn hướng "người đăng trước thắng" (16/10/2026, hướng (a) ở `docs/VIEC-DANG-DO.md` mục 1).

## What Changes

- Ảnh chỉ bị coi là trùng với ảnh của tài khoản khác **đã kiểm xong trước nó**. Ảnh kiểm xong sau — kể cả bản chép —
  không làm tin của chủ ảnh dính cổng "ảnh trùng".
- Dữ kiện "ảnh trùng" người duyệt thấy (`duplicateMatches`) theo cùng luật: người duyệt tin của kẻ chép vẫn thấy tin
  gốc; người duyệt tin gốc không thấy bản chép như một "ảnh trùng".
- Không đổi: ảnh của chính người đăng không tính; danh sách trắng ảnh mẫu của hãng; ngưỡng khoảng cách.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `screening/image-checks`: sửa "Ảnh trùng với tin của tài khoản khác là cổng cứng" — chỉ so với ảnh đã kiểm xong
  trước, thêm scenario "Chủ ảnh sửa tin sau khi bị chép".

## Impact

- **Code**: `screening` — `duplicateCandidates` nhận mốc của ảnh đang xét; lượt kết luận (`conclusion.ts`) và dữ kiện
  cho người duyệt (`facts.service.ts`) truyền mốc đó.
- **Migration**: không — dùng `image_checks.checked_at` đã có.
- **API**: không đổi hình dạng. Tin của chủ ảnh không còn bị giữ vì bản chép đăng sau.
- **Dữ liệu cũ**: không sửa. Tin đang chờ duyệt vì một bản chép đăng sau vẫn chờ người duyệt quyết; lần gửi kế tiếp
  theo luật mới.
- **Test**: `pnpm smoke:posting` thêm bước "A sửa tin sau khi B chép ảnh: vẫn qua".
