# Design

> Duyệt 24/10/2026. Ba câu hỏi sản phẩm chốt cùng ngày (proposal, mục **Đã chốt**).

## Context

`GET /api/v1/listings` (`read.service.feed`) dựng `Prisma.ListingWhereInput` từ từ khoá, danh mục, tỉnh, phường, giá rồi
ghép với `visibleWhere` (ai thấy, mức hiển thị) và xếp theo vị trí trên bảng tin, phân trang bằng con trỏ. Thông tin theo
mẫu nằm ở `listings.attributes` (JSONB): mục chọn một là chuỗi, mục chọn nhiều là mảng chuỗi, mục số là số, mục chữ là
chuỗi. Tên mục không đổi sau khi phát hành và không dùng lại cho mục khác kiểu (TK 11), nên lọc theo tên mục là an toàn
qua các phiên bản mẫu. `category` có sẵn `currentTemplate(id)`.

## Goals / Non-Goals

**Goals**: lọc theo mục chọn một, chọn nhiều, số của mẫu hiện hành; báo lỗi rõ khi bộ lọc sai; không đổi luật hiển thị
hay thứ tự.

**Non-Goals**: sắp xếp; lọc mục chữ; lọc trong bảng tin nhóm, gợi ý; chỉ mục DB mới (xem Risks).

## Decisions

### 1. Một tham số `attrs` dạng JSON

`GET /listings?categoryId=…&attrs=<JSON>`, JSON là object tên mục → bộ lọc:

```json
{
  "hang": ["Apple", "Samsung"],
  "mau": ["den", "bac"],
  "nam_san_xuat": { "min": 2018, "max": 2020 }
}
```

Mục chọn (một hay nhiều) nhận mảng giá trị, 1–20 phần tử; mục số nhận `{ min?, max? }`, ít nhất một đầu, `min ≤ max`.

Phương án bị loại: mỗi mục một tham số (`attr.hang=Apple`). Tên tham số đổi theo danh mục, nên schema Zod và Swagger không
khai được; JSON thì một tham số, một schema, kiểm hình dạng ở tầng HTTP còn kiểm theo mẫu ở service.

### 2. Kiểm theo mẫu hiện hành ở service

`attrs` có mà thiếu `categoryId` → 400. Có danh mục thì đọc `currentTemplate(categoryId)` (một lượt đọc theo khoá) và kiểm
từng mục: phải có trong mẫu, không phải mục chữ, kiểu bộ lọc khớp kiểu mục, giá trị mục chọn nằm trong `options`. Lỗi đầu
tiên → 400 `VALIDATION_ERROR` kèm `details: { field: '<tên mục>' }`. Phép kiểm và phép dựng điều kiện là hàm thuần
(`calc/attribute-filter.calc.ts`) để unit test không cần DB.

### 3. Điều kiện Prisma trên JSONB

Mỗi mục một điều kiện, các mục ghép AND:

| Kiểu mục   | Điều kiện                                                                     |
| ---------- | ----------------------------------------------------------------------------- |
| chọn một   | `OR` của `attributes: { path: [tên], equals: giá trị }`                       |
| chọn nhiều | `OR` của `attributes: { path: [tên], array_contains: [giá trị] }`             |
| số         | `attributes: { path: [tên], gte: min }` và / hoặc `{ path: [tên], lte: max }` |

Tin không có mục đó thì `path` trả rỗng, không khớp điều kiện nào → tự loại (câu chốt 3). Không cần SQL viết tay.

### 4. Không thêm chỉ mục DB lúc này

Bộ lọc luôn đi cùng `categoryId`; truy vấn đã thu hẹp theo danh mục, trạng thái và vị trí trước khi xét JSON. Thêm GIN trên
`attributes` khi đo thấy chậm (Risks).

### 5. App

Màn tìm kiếm của `ghim-app` (`SearchFilterBar`) có thêm nút "Thông tin" khi đã chọn danh mục:

- mở một bảng liệt kê mục chọn (ô chọn nhiều giá trị) và mục số (hai ô từ, tới) của mẫu danh mục — mẫu app đã đọc sẵn
  cho màn đăng tin;
- đổi danh mục thì xoá bộ lọc "Thông tin";
- số bộ lọc đang bật cộng vào nhãn "Bộ lọc · N".

## Risks / Trade-offs

- **Lọc JSON không có chỉ mục**: ổn khi mỗi danh mục còn vài nghìn tin đang hiện. Khi đo thấy chậm thì thêm chỉ mục GIN
  `jsonb_path_ops` trên `attributes` — đổi điều kiện mục số sang `@?` / `jsonb_path_exists` cho tận dụng được chỉ mục.
- **Mẫu đổi giữa hai lượt tìm**: app gửi bộ lọc theo mẫu đã đọc; mục bị bỏ ở bản mẫu mới thì server trả 400 nêu mục đó, app
  đọc lại mẫu và bỏ bộ lọc đó.

## Migration Plan

Không migration. Deploy server rồi app `npm run api:sync`.
