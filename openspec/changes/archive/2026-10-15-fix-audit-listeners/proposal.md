# Proposal

## Why

Đợt 2 phần C của lượt sửa lỗi rà soát ngày 15/10/2026 (`docs/RA-SOAT-15-10-2026.md`), mục **C1 — sự kiện chạy lại áp
trạng thái cũ**. Đây là lỗi hệ thống, đã đọc lại code để xác nhận.

**Vì sao xảy ra.** Bộ phát outbox gọi lần lượt mọi bên nghe của một sự kiện. Một bên nghe ném lỗi thì **cả** sự kiện
lùi 10 giây – 1 giờ rồi chạy lại **mọi** bên nghe, trong khi sự kiện mới hơn đã được xử trước. Nhiều bên nghe áp theo
chiều của sự kiện ("khoá" thì ẩn, "mở" thì hiện) mà không đọc trạng thái hiện tại.

**Hậu quả, ví dụ:**

- **Nhóm ẩn mãi.** Khoá nhóm, bên nghe `review` lỗi một lần, lượt mở khoá được xử trước. Lượt chạy lại của "khoá" ẩn
  lại mọi tin của nhóm, mãi mãi — lý do này còn dừng cả đồng hồ hiển thị.
- **Cùng một lỗi ở mọi cặp** khoá / mở tài khoản, khoá / mở nhóm, cấm / gỡ cấm, rời / vào nhóm, tắt / bật danh mục.
  Tin của tài khoản bị khoá hiện lại; nhóm thành "thiếu chủ" dù chủ đang hoạt động rồi tự khoá sau 30 ngày; staff bị
  treo lại.
- **Không cần lỗi cũng xảy ra.** Chạy nhiều tiến trình phát cùng lúc thì hai sự kiện của một cặp có thể được xử song
  song theo thứ tự bất kỳ — đúng tình huống khi có lượng lớn người dùng.

Sửa lỗi, không thuộc đợt nào của TK 29. Người dùng giao tech lead chọn phương án theo tiêu chí chạy ổn với lượng lớn
người dùng (15/10/2026).

## What Changes

**Hướng chung.** Mỗi bên nghe của một cặp coi sự kiện chỉ là tín hiệu "có đổi". Chiều đổi (đặt hay gỡ) lấy từ trạng
thái **hiện tại** của tài khoản, nhóm, lệnh cấm, tư cách thành viên, danh mục.

**Theo module:**

- **`listing`**: đọc trạng thái hiện tại **trong transaction của từng lô, sau khi đã khoá dòng**. Hai bên nghe của một
  cặp chạy song song thì bên sau luôn thấy kết quả của bên trước. Áp cho:
  - tài khoản bị khoá;
  - nhóm bị tạm khoá;
  - bị cấm khỏi nhóm;
  - rời / vào nhóm;
  - danh mục bị tắt;
  - đơn vị con;
  - lý do "tài khoản mới" khi lên mức.
- **`group`**: chủ nhóm bị khoá chỉ làm nhóm thiếu chủ khi tài khoản đang bị khoá; trả nhóm cho chủ cũ chỉ khi chủ đang
  hoạt động.
- **`platform`**: chỉ treo quyền staff khi tài khoản đang bị khoá.
- **`review`**:
  - lượt rời nhóm chỉ huỷ việc khi người đó không còn là thành viên;
  - lượt vào lại / gỡ cấm chỉ sinh lại việc khi người đó đang là thành viên và không bị cấm;
  - khoá tài khoản chỉ trả việc khi tài khoản đang bị khoá.
- **Thông báo N32** đi theo đúng thay đổi thật: bên nghe xử lại mà tin không đổi thì không có thông báo.

**Cố ý chưa làm**, vào đợt 3:

- T5 (`listing.state.changed` tới trễ không kiểm phiên bản ở `review`);
- cặp vô hiệu / khôi phục "tin sạch" của `trust`;
- nội dung thông báo cũ của nhóm (N10–N14, N26–N28);
- ghi nhận từng bên nghe đã chạy ở bộ phát.

Bản sửa này đã đủ để thứ tự xử không đổi kết quả; ghi nhận từng bên nghe chỉ giảm số lần chạy lại.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `listing/suspension`: thêm "Tạm ẩn theo trạng thái hiện tại, không theo thứ tự xử".
- `group/group-roles`: thêm "Khoá, mở khoá chủ nhóm theo trạng thái hiện tại".
- `platform/staff-permissions`: thêm "Treo quyền staff theo trạng thái hiện tại".
- `review/queues`: thêm "Việc của tin trong nhóm theo tư cách thành viên hiện tại".

## Impact

- **Code**:
  - `listing`: bên nghe, `cascade`, `applyBatch` có bước đọc sau khi khoá;
  - `group`: hai cổng đọc mới `isBanned`, `memberUnit`; bên nghe khoá / mở khoá;
  - `platform`, `review`: bên nghe.
- **Hiệu năng**: khoá / mở khoá nhóm nay đi qua mọi tin của nhóm theo lô 500 ở cả hai chiều, nhưng chỉ ghi dòng đổi.
  Mỗi lô đọc lại trạng thái một lần.
- Không migration, không đổi response.
