# Máy duyệt — hướng dẫn cho app

Mỗi lượt gửi tin (gửi nháp, gửi lại sau sửa, gia hạn, chuyển lên sàn chung) đi qua máy duyệt. Máy chỉ có ba kết
quả: **hiện đầy đủ**, **hiện hạn chế**, **giữ cho người duyệt**. Máy không từ chối tin, không trả tin về nháp, không
ra gậy. App không gọi máy trực tiếp — chỉ đọc kết quả trên tin của mình và trên bảng uy tín.

Hợp đồng đầy đủ: `openspec/changes/add-screening/specs/` (sau khi archive: `openspec/specs/screening/`); thiết kế ở
`openspec/changes/add-screening/design.md`. Luật nghiệp vụ ở TK 13, TK 14.

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
    "message": "Tạm thời chưa gửi được tin mới — gửi lại từ 14:30",
    "details": { "retryAt": "2026-10-14T07:30:00.000Z" }
  }
}
```

Hiện `message`, giữ nháp nguyên vẹn, mở lại nút Đăng từ `details.retryAt`. Bảng uy tín (`GET /api/v1/me/trust`) có
`cooldownUntil` (ISO, `null` khi không chờ) để hiện trước khi người dùng bấm Đăng.

## Tên hiển thị bị lọc: `nameHidden`

Tên hiển thị chứa cụm từ cấm mức chắc thì người khác thấy **"Người dùng Ghim"** ở mọi chỗ hiện tên. Chủ tài khoản vẫn
thấy tên mình: `GET /api/v1/me` có `nameHidden: true` — app nhắc đổi tên (`PATCH /api/v1/me`).
