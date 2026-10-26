# Máy duyệt — hướng dẫn cho app

Mỗi lượt gửi tin (gửi nháp, gửi lại sau sửa, gia hạn, chuyển lên sàn chung) đi qua máy duyệt. Máy chỉ có ba kết
quả: **hiện đầy đủ**, **hiện hạn chế**, **giữ cho người duyệt**. Máy không từ chối tin, không trả tin về nháp, không
ra gậy. App không gọi máy trực tiếp — chỉ đọc kết quả trên tin của mình và trên bảng uy tín.

Hợp đồng đầy đủ: `openspec/specs/screening/`; thiết kế ở
`openspec/changes/archive/2026-10-13-add-screening/design.md`. Luật nghiệp vụ ở TK 13, TK 14.

## Tin vừa gửi đứng ở "đang kiểm"

`POST /api/v1/listings/{id}/submit` trả `200` với `state: "checking"`. Máy chấm chữ ngay trong lượt gửi, còn ảnh
được kiểm qua hàng việc nền — tin chỉ lên bảng khi đã có kết quả cho chữ **và mọi ảnh** (thường vài giây). Đọc lại
tin (`GET /api/v1/listings/{id}`) hay nghe thông báo để biết kết quả:

| `state`   | `restrictions` | Ý nghĩa                                             |
| --------- | -------------- | --------------------------------------------------- |
| `live`    | `[]`           | Hiện đầy đủ                                         |
| `live`    | có `machine`   | Hiện hạn chế vì máy chưa chắc — người duyệt xem sau |
| `live`    | `new_account`  | Hiện hạn chế vì tài khoản mới (T0), không do máy    |
| `pending` | —              | Máy giữ cho người duyệt                             |

Quá 5 phút chưa đủ kết quả ảnh thì tin chuyển sang chờ người duyệt — app không cần làm gì.

## Ảnh: so trùng và chất lượng, không kiểm nội dung

Mỗi ảnh được đo một lần (dHash để so trùng, cùng cỡ, độ nét, độ sáng). Máy **không kiểm nội dung ảnh** (chốt
24/10/2026). Ảnh hỏng (không mở được) luôn làm tin bị giữ. Bốn luật chất lượng — quá nhỏ, mờ, quá tối, quá sáng — giữ tin
cho người khi master bật, chạy thử hay tắt được trên bàn vận hành (chung, hay riêng từng danh mục), và không tính là dò
cổng cứng. Ngưỡng nằm trong bảng
con số (`screening.imageMinShortSide` 480, `imageMinSharpness` 20, `imageMinBrightness` 25, `imageMaxBrightness` 235).

App chặn ảnh quá nhỏ **trước khi tải lên**: phiếu tải ảnh (`POST /api/v1/media/uploads`) trả `minShortSide` — cạnh
ngắn của ảnh (sau khi xoay theo EXIF) dưới số này thì báo người dùng chọn ảnh khác, không tải. Độ nét, độ sáng chỉ server
đo; tin trúng thì `machineNotice.fixes` nói ảnh nào cần thay.

Ảnh **tin nhắn** (add-message-images) qua cùng bốn luật chất lượng và ngưỡng, nhưng đo ngay lúc gửi và chỉ theo chế độ
chung của luật (không theo danh mục): luật đang bật thì ảnh trúng làm tin nhắn không gửi được — `400
MESSAGE_IMAGE_REJECTED` với đúng câu sửa ở dưới ("Ảnh 2 quá nhỏ…"); ảnh hỏng luôn bị chặn; luật chạy thử như không có.
Không so trùng ảnh tin nhắn. Chi tiết ở `docs/messaging.md`.

## Câu báo trên tin của mình: `machineNotice`

Tin của chính người đăng (`GET /api/v1/listings/{id}`, danh sách tin của mình) có trường `machineNotice`, `null` khi
không có gì để báo:

```json
{
  "kind": "fraud",
  "message": "Tin cần kiểm tra an toàn thêm",
  "estimatedWait": "Thường trong 24 giờ",
  "lookupCode": "S7KQ2M9XA",
  "fixes": [
    {
      "code": "abnormal_price",
      "message": "Giá của tin lệch xa mức thường thấy trong danh mục này. Kiểm tra lại đơn vị (đồng) và số 0."
    }
  ]
}
```

- `kind: "plain"` — tin chờ người duyệt; hiện `message` ("Tin đang chờ người duyệt, thường trong 24 giờ").
- `kind: "fraud"` — câu chung ba phần: hiện `message`, `estimatedWait`, và nút **Liên hệ hỗ trợ** kèm `lookupCode`.
  Người đăng đọc mã cho hỗ trợ; app **không** tự đoán lý do — máy cố ý không nói.
- `kind: "limited"` — tin đang hiện hạn chế; chỉ có `fixes`.
- `fixes` — lỗi người đăng tự sửa được, mỗi lỗi một câu kèm việc làm ngay. `code` để app gắn nút (vd `price_over_cap`,
  `abnormal_price` → mở ô giá; `wrong_category` → mở chọn danh mục; `off_platform_contact` → nhắc thêm số điện thoại vào
  hồ sơ thay vì ghi trong mô tả). Hiện `message` như server gửi, không dịch lại.
- `fixes` về ảnh (add-image-quality-checks) nói ảnh thứ mấy: `image_unreadable` (ảnh không mở được), `image_too_small`,
  `image_blurry`, `image_too_dark`, `image_too_bright` — vd "Ảnh 2 quá nhỏ. Thay bằng ảnh chụp rõ hơn." App gắn nút mở
  màn sửa ảnh của tin.

Tin chỉ hiện câu khi còn đúng trạng thái: câu của lần giữ nằm trên tin `pending`, câu hạn chế nằm trên tin `live` còn
bị hạn chế. Người đăng sửa và gửi lại thì máy chấm lại, câu cũ không còn.

## Thời gian chờ: 429 `SUBMISSION_COOLDOWN`

Tài khoản dính cổng cứng 3 lần trong 24 giờ thì tạm không gửi được **tin mới** (gửi nháp lần đầu, chuyển tin lên sàn
chung) trong 24 giờ. Sửa, gửi lại, gia hạn tin đang có vẫn được.

```json
{
  "success": false,
  "error": {
    "code": "SUBMISSION_COOLDOWN",
    "message": "Tạm thời chưa gửi được tin mới — gửi lại từ 14:30 ngày 14/10/2026",
    "details": { "retryAt": "2026-10-14T07:30:00.000Z" }
  }
}
```

Hiện `message`, giữ nháp nguyên vẹn, mở lại nút Đăng từ `details.retryAt`. Bảng uy tín (`GET /api/v1/me/trust`) có
`cooldownUntil` (ISO, `null` khi không chờ) để hiện trước khi người dùng bấm Đăng.

## Tên hiển thị bị lọc: `nameHidden`

Tên hiển thị chứa cụm từ cấm mức chắc thì người khác thấy **"Người dùng Ghim"** ở mọi chỗ hiện tên. Chủ tài khoản vẫn
thấy tên mình: `GET /api/v1/me` có `nameHidden: true` — app nhắc đổi tên (`PATCH /api/v1/me`).

## Bàn vận hành — `/api/v1/ops/screening`

Luật, dải, cụm từ cấm và số liệu chỉ master; danh sách trắng ảnh mọi staff; từ khoá danh mục master và staff của danh mục
đó; tra mã staff có việc `support`. Mỗi lần đổi luật, ghi đè, dải hay cụm tạo một phiên bản luật mới, có hiệu lực ở lượt
chấm kế tiếp, và vào nhật ký thao tác.

| Route                                                            | Việc                                                                                                                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /rules`                                                     | Phiên bản luật hiện hành: `rules[]` (`code`, `label`, `kind` `signal` / `gate` / `quality`, `weight`, `mode`), `overrides[]`, `bands[]`, `defaultBands`                 |
| `PATCH /rules/{code}`                                            | `{ weight?, mode? }` (ít nhất một) — `mode` là `on` / `trial` / `off`; cổng cứng không tắt được (`400 VALIDATION_ERROR`)                                                |
| `PUT /rules/{code}/categories/{categoryId}`, `DELETE` cùng đường | Ghi đè trọng số hay chế độ của một luật cho một danh mục; `DELETE` bỏ ghi đè, danh mục dùng lại giá trị chung                                                           |
| `PUT /bands/{categoryId}`                                        | `{ mediumFrom, highFrom }` — ngưỡng dải Vừa / Cao riêng cho một danh mục (`mediumFrom < highFrom`)                                                                      |
| `GET /phrases`, `POST /phrases`, `PATCH /phrases/{id}`           | Cụm từ cấm, mới nhất trước; thêm `{ text, level, exceptions? }` (`level` `certain` / `ambiguous`) bắt đầu ở chạy thử; sửa mức hay ngoại lệ                              |
| `POST /phrases/{id}/activate`, `POST /phrases/{id}/deactivate`   | Bật thật — chưa đủ ngày chạy thử thì bắt buộc `{ reason }`; cụm mức chắc thì quét lại tin đang hiển thị. Tắt — tin đang chờ vì cụm vẫn chờ                              |
| `GET /whitelist`, `POST /whitelist`, `DELETE /whitelist/{id}`    | Ảnh mẫu của hãng không tính là ảnh trùng; thêm `{ imageId }` của một ảnh trong kho; mỗi mục có `url` ảnh nguồn (`null` khi ảnh đã bị dọn — mục vẫn chặn trùng)          |
| `GET /categories/{categoryId}/keywords`, `PUT` cùng đường        | Bộ từ khoá suy ra danh mục (dấu hiệu "sai danh mục"): đọc bộ đang dùng (đã bỏ dấu như lúc so), `PUT { keywords }` thay cả bộ                                            |
| `GET /lookups/{code}`                                            | Lý do cụ thể của một lần giữ theo `lookupCode` cho hỗ trợ — luật, cụm, ảnh đã trúng, loại đánh dấu theo thiết bị; không có dấu thiết bị                                 |
| `GET /stats?months=`                                             | Số liệu theo tháng (mặc định 12, tối đa 24): số lượt, cho qua đầy đủ / hạn chế / giữ, dải Thấp / Vừa / Cao, 5 luật trúng nhiều nhất — cộng cả số đã gộp khi hết hạn lưu |
