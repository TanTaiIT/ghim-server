# Proposal

## Why

Đợt 4 phần 3 — phần cuối — của lượt sửa lỗi rà soát ngày 15/10/2026 (`docs/RA-SOAT-15-10-2026.md`). Đọc lại ở 52d3c34,
chưa mục nào được sửa:

- **L7** — lượt đưa tin lên bảng (máy cho qua, người duyệt duyệt) đọc mức tin cậy TRƯỚC transaction. Người đăng lên T1
  đúng lúc đó: bên nghe "đổi mức" của `listing` chạy khi tin còn đang kiểm nên không gỡ gì, rồi lượt lên bảng ghi lý do
  "tài khoản mới" theo mức T0 đã cũ — lý do bám mãi, trái spec `listing/visibility` "Lý do tài khoản mới".
- **L9** — lượt tính lại hằng ngày bỏ qua tài khoản T3: số tin sạch người duyệt thấy (TK 17) và bảng uy tín hiện của
  tài khoản T3 đứng yên ở lần tính cuối, kể cả khi có tin mới sạch hay tin đang dời tới lượt được tính.
- **L10** — dấu ảnh của `screening` (`image_checks`) không bao giờ dọn: ảnh đã xoá hẳn khỏi kho vẫn là ứng viên "ảnh
  trùng" cho tin của người khác — dính cổng cứng vì một ảnh không còn tồn tại.
- **L13** — khoá ngoại `RESTRICT` từ tin tới nhóm, danh mục: chỉ chạm tới khi có lượt xoá hẳn nhóm / danh mục, tức
  `add-data-retention`. Chuyển vào phần "Chuyển từ rà soát" của proposal đó, không sửa ở đây.

Sửa lỗi, không thuộc đợt nào của TK 29. Người dùng giao tech lead chọn phương án (15/10/2026, nhắc lại 16/10/2026).

## What Changes

- **L7**: `trust` có thêm cửa đọc mức trong transaction của bên gọi, sau khoá CHUNG theo người — cùng khoá mà lượt tính
  mức giữ RIÊNG. Lượt lên bảng của `listing` đọc mức qua cửa đó: lượt tính mức đang chạy thì chờ nó xong và thấy mức
  mới; lượt tính mức tới sau thì chờ lượt lên bảng commit, rồi sự kiện đổi mức gỡ lý do trên tin đã lên bảng.
- **L9**: tài khoản T3 vào lượt tính lại hằng ngày khi còn tin sạch chưa được tính (số đã tính nhỏ hơn số tin sạch còn
  hiệu lực); đã tính đủ thì vẫn bỏ qua như cũ.
- **L10**: `media` phát `media.images.deleted` (`{ imageIds }`) cùng transaction với mỗi lượt xoá hẳn dòng ảnh;
  `screening` nghe và xoá dấu ảnh của các ảnh đó.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `listing/visibility`: thêm "Lên T1 đúng lúc tin đang lên bảng".
- `trust/trust-tiers`: thêm "Tài khoản T3 vẫn được tính lại khi còn tin sạch chưa tính".
- `screening/image-checks`: thêm "Ảnh đã xoá hẳn không còn để so trùng".

## Impact

- **Code**: `trust` (cửa `tierIn`, khoá chung; tập tài khoản tính lại hằng ngày), `listing` (lượt lên bảng đọc mức
  trong transaction; cổng `ListingTrustPort.tierIn`), `media` (ba lượt xoá dòng ảnh phát sự kiện), `screening` (bên
  nghe xoá dấu ảnh).
- **Migration**: không.
- **API**: không đổi.
- **Sự kiện**: mới `media.images.deleted` `{ imageIds: string[] }`, mỗi lô xoá một sự kiện; `screening` nghe.
- **Ngoài phạm vi**: xoá hẳn tài khoản kéo ảnh theo khoá ngoại không phát sự kiện — ghi vào `add-data-retention` cùng
  L13.
