# Proposal

## Why

Đợt 3 phần C của lượt sửa lỗi rà soát ngày 15/10/2026 (`docs/RA-SOAT-15-10-2026.md`). Mọi mục đã được đọc lại code ở
HEAD 52b3344:

- **T21 — ảnh kiểm lỗi tạm thời không bao giờ được kiểm lại.**
  - Kho không trả lời trong vài phút là đủ để ảnh thành `error` vĩnh viễn: mọi lượt gửi sau dùng ảnh đó đều bị giữ cho
    người, và ảnh không bao giờ thành ứng viên so trùng.
  - Lỗi tạm (kho) và lỗi thật (tệp mất, không giải mã được) đang không phân biệt được.
- **T22 — bật cụm "chắc chắn" theo đường khác không quét lại tin đang hiện.**
  - Không quét: nâng một cụm đang bật lên mức chắc, hay bỏ ngoại lệ.
  - Lượt quét lỗi thì bấm bật lại cũng không làm gì.
- **T23 — mức tin cậy tính từ dữ kiện cũ.**
  - Ba lượt đọc ngoài transaction, so-và-ghi theo dấu băm: chỉ bắt được dòng kết quả đổi, không bắt được dữ kiện cũ
    hơn dòng.
  - Lượt hằng ngày chạy song song với một lượt gỡ vì vi phạm ghi lại mức cũ; ở T3 thì không lượt nào tính lại nữa.
- **T24 — kết luận lượt máy duyệt trong transaction mà đọc ngoài transaction.**
  - Mỗi lượt gửi giữ một kết nối và xin thêm 2 × số ảnh kết nối nữa. Pool 10 kết nối thì 10 lượt gửi đồng thời là kẹt,
    hết 5 giây thì mọi lượt trả 500.
  - Lỗi lúc kết luận làm hỏng cả lượt gửi thay vì "giữ cho người".
- **Cặp "tin sạch" của `trust`** (phần còn lại của C1): lượt gỡ vì vi phạm được xử lại sau khiếu nại thắng làm tin
  mất tư cách tin sạch, và mức tụt mãi.

Sửa lỗi, không thuộc đợt nào của TK 29. Người dùng giao tech lead chọn phương án theo tiêu chí chạy ổn với lượng lớn
người dùng (15/10/2026).

## What Changes

- **T21**: kết quả lỗi mang loại `transient` (kho không trả lời sau mọi lượt thử) hay `permanent` (tệp mất, không đọc
  được). Lượt gửi sau dùng ảnh lỗi tạm thì đưa ảnh về `pending` ngay trong lượt mở, chờ kết quả mới. Lưới an toàn
  không tự kiểm lại: nó không biết tin nào cần.
- **T22**: nâng cụm đang bật lên mức chắc, hay thu hẹp ngoại lệ của cụm mức chắc đang bật, gửi hai lượt quét như lúc
  bật. Bấm bật lại cụm mức chắc đang bật cũng gửi lại hai lượt quét. Lượt quét bỏ qua tin đã rút vì cụm, nên gửi lặp
  vô hại.
- **T23**: mọi lượt tính mức của một tài khoản chạy dưới khoá advisory theo tài khoản, đọc dữ kiện và ghi kết quả
  trong cùng một transaction.
- **T24**:
  - mọi lượt đọc khi kết luận đi qua `tx` của lượt;
  - phần đọc chạy trong một savepoint — lỗi thì quay về savepoint và kết luận "giữ cho người, lỗi";
  - lưới an toàn và lượt kết luận khi ảnh về chạy lần lượt thay vì song song không giới hạn.
- **Cặp tin sạch**: vô hiệu chỉ khi tin hiện đang bị gỡ / từ chối vì vi phạm; khôi phục tư cách chỉ khi tin không còn
  ở trạng thái đó. Đọc qua cổng mới `stateOf` của `listing`.

**Cố ý chưa làm**:

- Cặp báo cáo đúng / báo cáo bị huỷ (`voidByReport`, `restoreAfterReport`): việc của `add-reports`.
- Ảnh lớn hơn trần cỡ vẫn tính là lỗi tạm. Bước xác nhận ảnh đã chặn ảnh sai cỡ, nên ca này gần như không có.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `screening/image-checks`: thêm "Lỗi tạm thời của kho được kiểm lại ở lượt gửi sau".
- `screening/machine-decision`: "Lỗi khi chấm thì giữ cho người" — thêm ca lỗi lúc kết luận.
- `screening/banned-phrases`: thêm "Đổi cụm mức chắc đang bật cũng quét lại".
- `trust/trust-tiers`: thêm "Tư cách tin sạch theo trạng thái hiện tại của tin", "Các lượt tính mức của một tài khoản
  chạy lần lượt".

## Impact

- **Code**:
  - `screening`: kiểm ảnh, kết luận, cụm từ, lưới an toàn, repository;
  - `trust`: tính mức, bên nghe, repository;
  - `listing`: cổng `stateOf`.
- **Migration**: enum `image_check_error_kind`, cột `image_checks.error_kind`, CHECK `(status = 'error') = (error_kind
IS NOT NULL)`. Dòng `error` có sẵn được gán `transient`, nên mỗi dòng được kiểm lại một lần ở lượt gửi sau. Không
  mất dữ liệu.
