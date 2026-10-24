# Proposal

## Why

TK 13 và TK 25 hứa kiểm nội dung nhạy cảm của mọi ảnh trước khi tin hiện. Change `add-image-moderation` (tách khỏi
`add-screening` ngày 12/10/2026) để ngỏ việc chọn dịch vụ. Ngày 24/10/2026, sau khi cân nhắc mọi hướng, người dùng chốt
**không kiểm nội dung ảnh**:

- dịch vụ ngoài (Google Vision, AWS Rekognition, Sightengine) là bên thứ ba và tốn tiền theo lượt;
- mô hình tự chạy (onnxruntime, NSFWJS) thêm 100–250 MB RAM trên gói web 512 MB;
- máy free riêng thêm một dịch vụ phải vận hành;
- kiểm trên điện thoại thì người gọi API thẳng lách được.

Thay vào đó, máy kiểm **chất lượng** ảnh: ảnh hỏng, quá nhỏ, mờ, quá tối, quá sáng. Ảnh như vậy làm tin khó bán, và người
đăng tự sửa được ngay. Phép đo chạy trong lượt kiểm ảnh đang có: lượt đó đã giải mã ảnh bằng `sharp` để băm dHash, nên
không thêm thư viện, dịch vụ hay RAM đáng kể. Kiểm ảnh trùng giữ nguyên.

Ảnh xấu về nội dung từ nay chỉ bị chặn khi luật chữ hoặc điểm rủi ro giữ tin lại, khi có người báo cáo, hoặc khi người
duyệt thấy. TK 29 đã ghi đúng điều này cho giai đoạn chưa có dịch vụ; giờ nó thành luật lâu dài.

## What Changes

- **Bỏ** kiểm nội dung nhạy cảm của ảnh: xoá change `add-image-moderation` (chưa có code). TK bỏ cổng cứng "ảnh nhạy cảm"
  và mục còn mở "dịch vụ kiểm ảnh nhạy cảm".
- Lượt kiểm ảnh đo thêm cỡ ảnh, độ nét, độ sáng của từng ảnh trong tin, cùng lần giải mã với dHash.
- **Ảnh hỏng** (kho có tệp nhưng không giải mã được): tin vẫn giữ cho người như hôm nay, nhưng người đăng thấy rõ ảnh nào
  hỏng và cách sửa, thay cho câu chờ chung. Kho không trả lời vẫn là lỗi của máy như cũ.
- **Bốn luật chất lượng ảnh** trong bộ luật của máy:
  - ảnh quá nhỏ: cạnh ngắn dưới ngưỡng;
  - ảnh mờ;
  - ảnh quá tối;
  - ảnh quá sáng.

  Luật bật thì tin trúng bị giữ cho người. Mỗi luật bật, chạy thử hoặc tắt được, và bắt đầu ở chế độ chạy thử như mọi luật
  mới. Ngưỡng nằm trong bảng con số, master chỉnh được.

- Giữ vì chất lượng ảnh **không tính là dò** và không đếm vào "bị giữ nhiều". Đây là lỗi tự sửa được, không phải dấu
  hiệu gian lận.
- Người đăng thấy câu giải thích từng ảnh: ảnh thứ mấy, lỗi gì, sửa thế nào.
- Phiếu tải ảnh trả thêm cạnh ngắn tối thiểu, để app chặn ảnh quá nhỏ trước khi tải lên.

**Cố ý không làm**:

- Kiểm nội dung ảnh dưới mọi hình thức. Người dùng chốt 24/10/2026; mở lại thì cần change mới.
- Kiểm chất lượng ảnh đại diện: ảnh Google chỉ cỡ 96 px, mà ảnh đại diện không qua máy duyệt.
- Kiểm lại ảnh của tin đã hiện trước change này: luật chỉ áp cho lượt gửi mới.
- App đo độ nét hay độ sáng: phải đọc từng điểm ảnh trên điện thoại. App chỉ kiểm mở được và cỡ ảnh; phần còn lại server
  làm.

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `screening/image-checks`: thêm requirement "Ảnh hỏng giữ cho người kèm cách sửa", "Đo chất lượng từng ảnh", "Luật
  chất lượng ảnh bật thì giữ cho người", "Ngưỡng chất lượng ảnh trong bảng con số".
- `screening/hard-gates`:
  - "Tin dính cổng cứng luôn giữ cho người" bỏ câu cổng "ảnh nhạy cảm";
  - "Chỉ cổng cứng mới tính là dò" thêm giữ vì chất lượng ảnh.
- `screening/explanations`:
  - "Lỗi tự sửa được thì giải thích cách sửa" thêm lỗi chất lượng ảnh;
  - "Tin bị giữ luôn báo đang chờ người duyệt": kịch bản lỗi của máy chỉ còn lúc kho không trả lời.
- `media/image-storage`: thêm requirement "Phiếu tải ảnh cho biết cạnh ngắn tối thiểu".

## Impact

- **Code**:
  - `screening`: cổng băm ảnh thành cổng đo ảnh, trả dHash cùng cỡ, độ nét, độ sáng;
  - thêm bốn mã luật và lý do giữ mới;
  - kết luận so số đo với ngưỡng hiện hành;
  - thêm câu giải thích.
  - `media`: phiếu tải ảnh trả cạnh ngắn tối thiểu.
- **API**: phiếu tải ảnh (`POST /media/uploads`) thêm `minShortSide`. Bàn vận hành thấy bốn luật mới và lý do giữ mới.
  Không breaking.
- **Migration** (không mất dữ liệu):
  - `image_checks` thêm `width`, `height`, `sharpness`, `brightness` (cho phép trống);
  - enum `screening_cause` thêm `image_quality`, enum `screening_rule_kind` thêm `quality`;
  - CHECK: bốn số đo cùng trống hoặc cùng có.

  Bốn dòng luật do bước khởi động `ensureRules` chèn ở chế độ chạy thử. Bốn khoá bảng con số lấy giá trị khởi đầu từ sổ
  `config-keys.ts`, không cần migration.

- **Tải server**: thêm vài phép tính trên ảnh xám 512 px mà `sharp` đã giải mã. Không thêm gói, không thêm RAM đáng kể.
- **Tài liệu** (sửa cùng lượt code):
  - TK 13 (cổng cứng, luật chất lượng), TK 14 (danh sách luật), TK 25 (ảnh), TK 26 (bảng việc tự làm);
  - TK 27 (cam kết về ảnh), TK 28 (bốn con số), TK 29 (bỏ mục còn mở và thứ tự xây "kiểm ảnh nhạy cảm"), TK 30;
  - `docs/screening.md`, `docs/VIEC-DANG-DO.md`, CLAUDE.md, README.
- **Client** `ghim-app`: trước khi tải lên, kiểm ảnh mở được và cạnh ngắn ≥ `minShortSide`; hiện câu giải thích chất lượng
  ảnh trên tin bị giữ. Làm ở repo app sau khi server deploy.
