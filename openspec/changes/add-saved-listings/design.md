# Design

## Context

`listing` sở hữu bảng tin và luật duy nhất "ai thấy một tin" (`calc/visibility.calc.ts`: `canView` cho một tin,
`visibleWhere` cho danh sách, CLAUDE.md luật 25). Danh sách tin dùng phân trang con trỏ (`common/schemas/cursor.ts`,
design add-listings D6). Xoá tài khoản phát `identity.account.deleted`; `listing` đã nghe sự kiện đó để ẩn tin của
người bị xoá (`listing.events.ts`). `ghim-app` đang giữ "tin đã lưu" trong bộ nhớ app (`mockApi.getSavedIds`,
`setSaved`, `getSavedListings`).

## Goals / Non-Goals

**Goals**: lưu / bỏ lưu một tin; xem lại tin đã lưu đúng theo luật hiển thị; tô nút trái tim ở mọi thẻ tin bằng một lượt
đọc; dọn khi tài khoản bị xoá.

**Non-Goals**: số lượt lưu cho người đăng; báo cho người lưu khi tin đổi; lưu tìm kiếm; trần số tin đã lưu.

## Decisions

### 1. `listing` sở hữu bảng `saved_listings`

Một dòng mỗi cặp (người lưu, tin): `account_id uuid` → `accounts(id) ON DELETE CASCADE`, `listing_id uuid` →
`listings(id) ON DELETE CASCADE`, `saved_at timestamptz(3)`; khoá chính `(account_id, listing_id)` — lưu hai lần là một
dòng (`INSERT … ON CONFLICT DO NOTHING`). Chỉ mục `(account_id, saved_at DESC, listing_id DESC)` cho danh sách theo con
trỏ. Không CHECK nào: mọi cột bắt buộc, không có ràng buộc giữa các cột. Bảng thuộc `listing` vì quyết định "lưu được
không" là luật hiển thị của `listing`; khoá ngoại sang `accounts` như `listings.owner_id` đã có.

Lần lưu giữ nguyên khi tin thôi hiện (bán, hết hạn, tạm ẩn, xoá mềm): danh sách lọc lúc đọc, nên tin hiện lại thì tự có
lại — không cần nghe sự kiện nào của tin. Tin bị xoá cứng (dọn dữ liệu) kéo theo dòng lưu qua khoá ngoại.

### 2. Lưu theo luật đường link, xem theo luật bề mặt "hồ sơ"

- **Lưu** (`PUT`): đọc tin, `canView(listing, viewer, 'link')` như `GET /listings/:id` — không thấy là 404 y hệt tin
  không tồn tại, nên lưu không thành cách dò tin ẩn. Người đăng lưu được tin của chính mình (đường link của người đăng
  luôn mở) — vô hại, app không cần chặn.
- **Xem** (`GET`): `visibleWhere(viewer, 'profile')` — tin đang hiển thị, kể cả tin hạn chế (người lưu đã từng mở nó),
  tin "chỉ thành viên" chỉ khi còn là thành viên. Đây là bề mặt có sẵn nên test DB đối chiếu `visibleWhere` / `canView`
  không đổi.

Phương án bị loại: thêm bề mặt `saved` nhận cả tin đã bán / hết hạn kèm nhãn. Đúng ý "xem lại món mình để ý" hơn nhưng
phải sửa luật hiển thị dùng chung và bộ test đối chiếu của nó — để thành câu hỏi mở, làm bằng change sau nếu cần.

### 3. Phân trang con trỏ theo lúc lưu

Con trỏ `(saved_at, listing_id)` của dòng cuối trang, cùng mã hoá `encodeCursor` — trang sau lấy dòng có
`(saved_at, listing_id) < con trỏ`. Lọc hiển thị chạy trong cùng câu SQL (điều kiện trên quan hệ `listing`), nên một
trang luôn đủ `limit` tin hiện được nếu còn — không lọc sau khi đã cắt trang.

### 4. Mã các tin đã lưu không lọc hiển thị

`GET /me/saved-listings/ids` trả mã mọi dòng lưu của người đó, không lọc: thẻ tin nào app đang hiện thì người xem đã thấy
được tin đó, nên mã thừa của tin đang ẩn không làm sai nút nào và không lộ gì (đó là tin chính người đó đã lưu). Không có
trần số tin (Câu hỏi mở) nên danh sách mã không phân trang; một người lưu vài trăm tin vẫn là vài KB.

### 5. Xoá tài khoản

Listener `identity.account.deleted` có sẵn của `listing` xoá thêm mọi dòng lưu của tài khoản đó, cùng lượt ẩn tin. Xoá
tài khoản ở `identity` là ẩn danh hoá chứ không xoá dòng `accounts` (fix-audit-stuck-data), nên khoá ngoại không tự
dọn — phải xoá qua sự kiện.

## Risks / Trade-offs

- **Không trần số tin đã lưu**: một tài khoản có thể lưu rất nhiều tin. Mỗi dòng nhỏ và chỉ chủ tài khoản đọc; rate limit
  chung chặn lượt ghi dồn. Thêm trần là một khoá bảng con số khi cần.
- **Danh sách mã không lọc**: app hiện trái tim đỏ cho tin đã lưu mà người đó không còn thấy — không có thẻ nào như vậy để
  hiện, nên không sai trên màn hình.

## Migration Plan

Một migration tạo bảng, không mất dữ liệu, không SQL viết tay. Deploy server rồi app `npm run api:sync`. Lần lưu cũ
trong bộ nhớ app (dữ liệu mẫu) không chuyển — đó là tin mẫu, không có trên server.
