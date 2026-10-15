# Proposal

## Why

Đợt 2 phần B của lượt sửa lỗi rà soát ngày 15/10/2026 (`docs/RA-SOAT-15-10-2026.md`). Mọi mục đã được đọc lại code:

- **C2 — ảnh không bao giờ được kiểm, nên tin đã duyệt bị hạn chế lại mỗi 5 phút, mãi mãi.**
  - Chấm chữ lỗi hay quá 2 giây thì lượt gửi kết luận "giữ" ngay, và việc kiểm ảnh bị bỏ vì lượt đã kết luận.
  - Người duyệt cho đạt thì lưới an toàn (mỗi 5 phút) thấy "ảnh chưa kiểm": tin bị hạn chế "máy" và có việc hàng 3.
    Người duyệt cho đạt lần nữa, rồi 5 phút sau lại lặp.
  - Hệ quả phụ: ảnh của những tin đó không bao giờ thành ứng viên so trùng, nên luật trùng ảnh không bắt được ai dùng
    lại chúng.
- **T20 — dòng kiểm ảnh mồ côi.** Dòng `pending` được ghi trước khi gửi việc. Gửi việc hỏng thì lượt thử lại thấy dòng
  đã có, nên không gửi nữa: ảnh `pending` mãi, và mọi lượt dùng ảnh đó đều bị giữ vì quá giờ.
- **L8 — sự kiện hạn chế không mang phiên bản.** Sự kiện của lưới an toàn tới trễ hạn chế cả nội dung mà máy đã cho
  qua lại.
- **C11 — bật cụm từ "chắc chắn" bỏ sót tin đang kiểm.** Lượt quét lại chỉ xét tin đang hiển thị. Tin đang chờ kết quả
  ảnh lúc bật được chấm theo luật cũ, rồi lên hiển thị sau khi lượt quét đã chạy qua.

Sửa lỗi, không thuộc đợt nào của TK 29. Người dùng giao tech lead chọn phương án theo tiêu chí chạy ổn với lượng lớn
người dùng (15/10/2026).

## What Changes

- **Mọi ảnh của lượt gửi đều được kiểm**, kể cả lượt đã kết luận sớm. Kết quả về muộn vẫn không tự đưa tin lên bảng,
  như cũ.
- **Ảnh chờ kiểm quá thời gian chờ ảnh được xếp kiểm lại**, mỗi ảnh tối đa một lần mỗi khoảng chờ. Lưới an toàn làm
  việc này mỗi 5 phút, có trần mỗi lượt. Gửi việc kiểm hỏng thì lượt thử lại gửi lại ngay.
- **Lưới an toàn hạn chế "máy" vì thiếu kết quả ảnh tối đa một lần mỗi phiên bản tin**, và xếp kiểm các ảnh đó. Người
  duyệt cho đạt thì không bị hạn chế lại.
- **Sự kiện hạn chế mang phiên bản tin**; tin đã đổi phiên bản thì sự kiện cũ trượt qua.
- **Bật thật cụm mức chắc thì quét thêm một lần**, sau thời gian chờ ảnh cộng một chu kỳ rà. Cả hai lượt quét bỏ qua tin
  đã từng bị rút về vì chính cụm đó, để lượt cho đạt của người duyệt là cuối cùng.

**Cố ý chưa làm**:

- Tin đã được người duyệt cho đạt khi ảnh của nó chưa có kết quả thì không bị xét lại tự động khi ảnh về muộn và trùng.
  Sau bản sửa, khe này chỉ còn vài giây, trong khi người duyệt mất hàng giờ; ảnh đó vẫn thành ứng viên trùng cho tin
  sau, và hậu kiểm lấy mẫu vẫn chạy.
- T21 (ảnh lỗi tạm thời không kiểm lại), T22 (bật cụm "chắc chắn" theo đường khác), T24, L10: đợt 3, 4.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `screening/image-checks`: thêm "Mọi ảnh của lượt gửi đều được kiểm".
- `screening/machine-decision`: "Tin đang hiện mà thiếu kết quả ảnh thì chuyển sang hạn chế" — xếp kiểm, một lần mỗi
  phiên bản.
- `screening/banned-phrases`: thêm "Quét lại lần hai sau thời gian chờ ảnh".

## Impact

- **Code**:
  - `screening`: kiểm ảnh, lưới an toàn, quét lại cụm từ, repository;
  - `listing`: hạn chế theo phiên bản, dữ kiện tin đang hiện;
  - `src/lib/jobs.ts`: `send` nhận `startAfter`.
- **Migration**:
  - `image_checks.queued_at` (nullable, kèm partial index cho dòng `pending`);
  - bảng mới `screening_unchecked_marks`.

  Không mất dữ liệu. Dòng `pending` có sẵn mang `queued_at` trống, nên lượt rà đầu tiên xếp kiểm lại chúng (có trần
  mỗi lượt).
