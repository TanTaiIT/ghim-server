# Design

## Context

Bảng tin và tìm kiếm của sàn chung đọc tin bằng `visibleWhere` (luật "ai thấy một tin", CLAUDE.md luật 25) cộng bộ lọc
danh mục, tỉnh, phường, giá và từ khoá trên cột `search_folded` (tiêu đề + mô tả đã bỏ dấu). Thông báo "tin mới trong
nhóm" (N31) đã có khuôn: dòng ma trận nghe sự kiện tin đổi trạng thái của `listing`, chỉ báo lần đầu tin hiện đầy đủ, gộp
dòng chưa đọc theo khoá với trần nhắc riêng.

## Goals / Non-Goals

**Goals**: lưu, xem, xoá lượt tìm; báo người lưu khi một tin mới khớp, gộp theo lượt tìm.

**Non-Goals**: lọc theo mẫu thông tin; tin trong nhóm; báo lại tin hiện lại; email; tự hết hạn.

## Decisions

### 1. Bảng `saved_searches` thuộc `listing`

| Cột                          | Ghi chú                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `id` uuid                    | `uuidv7()`                                                  |
| `account_id` uuid            | FK `accounts`, xoá theo                                     |
| `key` text                   | từ khoá đã bỏ dấu cùng bộ lọc, viết thành một chuỗi JSON    |
| `q` text, `q_folded` text    | từ khoá như người dùng gõ (để hiện), và đã bỏ dấu (để khớp) |
| `category_id` uuid null      | FK `categories`, xoá theo                                   |
| `province_code`, `ward_code` | int null                                                    |
| `price_min`, `price_max`     | bigint null                                                 |
| `created_at`                 | timestamptz(3)                                              |

- Unique `(account_id, key)`: lưu lại đúng lượt tìm không thêm dòng. Gộp cả bộ lọc vào một cột thay vì unique trên các cột
  nullable — Postgres coi hai NULL là khác nhau, còn `NULLS NOT DISTINCT` Prisma không khai được.
- Index `(account_id, created_at DESC)` cho danh sách.
- CHECK viết tay: `q_folded <> ''`; `price_min IS NULL OR price_max IS NULL OR price_min <= price_max`. Test DB cho cả
  unique lẫn hai CHECK.
- Migration: thêm bảng, thêm giá trị `saved_searches` vào enum `notification_category` (Prisma sinh `ALTER TYPE … ADD
VALUE`). Không mất dữ liệu.

### 2. Trần 10 lượt dưới khoá advisory

Đếm rồi ghi trong một transaction có `pg_advisory_xact_lock` theo tài khoản — như lượt xin tải ảnh của `media` — để hai
lượt lưu cùng lúc không thành 11. Đã có đúng lượt tìm thì trả lượt cũ trước khi đếm: lưu lại không bao giờ nhận 409.

### 3. Khớp ngược bằng SQL, luật hiển thị bằng `canView`

Khi tin lần đầu hiện, câu hỏi là "lượt tìm nào chứa tin này" — ngược với tìm kiếm. `position(q_folded IN $search_folded)

> 0`cộng mỗi bộ lọc`IS NULL OR =`/`<=`/`>=`trên đúng tin đó; Prisma không viết được vế cột-nằm-trong-tham-số nên là`$queryRaw`trong repository. Luật "ai thấy một tin" không viết lại trong SQL: service đọc tin và gọi`canView(listing, khách, 'feed')` trước — tin hạn chế, tin trong nhóm, tin đã thôi hiện lúc sự kiện tới nơi đều trả rỗng.
> Lượt tìm của người đăng bị loại trong SQL.

Quy mô: mỗi tin mới một lượt quét bảng lượt tìm (tối đa 10 mỗi người). Đủ cho giai đoạn đầu; khi bảng lớn thì thêm chỉ
mục trigram trên `q_folded` hoặc lọc trước theo danh mục — không đổi hợp đồng.

### 4. Báo qua ma trận của `notification`

Dòng mới trong ma trận tin đăng, cùng sự kiện với N31, cùng điều kiện "lần đầu, đầy đủ, không tạm ẩn" cộng "sàn chung".
`notification` hỏi `listing.savedSearchMatches` qua cổng (không đọc bảng của `listing`), mỗi người khớp một bản nháp:
nhóm `saved_searches`, gộp theo khoá `saved-search:<id>`, trần nhắc `notification.savedSearchAlertMinutes` (120 phút).
`data` mang mã lượt tìm và mã tin; app tra bộ lọc của lượt tìm trong danh sách đã lưu để mở màn tìm kiếm.

### 5. Xoá tài khoản

Bên nghe `identity.account.deleted` của `listing` đã bỏ tin đã lưu (`add-saved-listings`); cùng lượt bỏ lượt tìm đã lưu.

## Risks / Trade-offs

- Tin máy giữ rồi người duyệt cho qua vẫn được báo lúc hiện — như N31, vì "lần đầu hiện" tính lúc tin lên bảng.
- Đổi từ khoá thành bỏ dấu khiến "may" khớp "máy" và "mây" — đúng như tìm kiếm của sàn đang làm.
