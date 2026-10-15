# Proposal

## Why

TK 13 và TK 25 đòi mỗi ảnh — của tin và ảnh đại diện — được kiểm nội dung nhạy cảm trước khi hiện; ảnh nhạy cảm là
một cổng cứng. Việc này cần một dịch vụ hay mô hình nhận diện ảnh mà dự án chưa chọn. Ngày 12/10/2026 phần này được
tách khỏi `add-screening` để máy duyệt (chữ, điểm, ảnh trùng) làm trước, kiểm ảnh nhạy cảm làm khi chọn được dịch vụ.

Cam kết ở TK 27 mà change này hoàn tất: phần ảnh nhạy cảm của **4** (không tin nào hiện khi chưa có kết quả cho mọi
ảnh — `add-screening` đã bảo đảm cho kết quả so trùng).

## What Changes

- Mỗi ảnh của tin được kiểm nội dung nhạy cảm trong cùng lượt kiểm ảnh của `add-screening`; ảnh nhạy cảm là cổng
  cứng, với mọi hệ quả của cổng cứng (giữ cho người, đếm vào lượt dò, chạy thử được, không tắt được).
- Ảnh đại diện mới — kể cả ảnh lấy từ Google — được kiểm nhạy cảm (không kiểm trùng), chỉ hiện trên hồ sơ công khai
  khi đã có kết quả và không nhạy cảm.

## Capabilities

### Modified Capabilities

- `screening/image-checks` (tạo bởi `add-screening`; change này archive sau): ảnh nhạy cảm là cổng cứng.
- `identity/profile` (tạo bởi `add-identity`, sửa ở `add-screening`; change này archive sau): ảnh đại diện qua kiểm
  ảnh nhạy cảm.

## Impact

- Module `screening`: thêm bước kiểm nhạy cảm sau cổng `ImageAnalyzer`; cột kết quả nhạy cảm ở `image_checks`;
  cổng cứng "ảnh nhạy cảm" vào bộ luật. `identity` phát sự kiện đổi ảnh đại diện, hồ sơ công khai hỏi kết quả kiểm.
- Phụ thuộc: `add-screening` (lượt kiểm ảnh, cổng cứng, lưới an toàn), `add-media` (kho ảnh, đường xem có hạn).
- **Phải chọn trước khi làm** (CLAUDE.md: hỏi trước khi thêm gói / dịch vụ): dịch vụ kiểm ảnh. Đã cân nhắc ở design
  `add-screening` ngày 12/10/2026: Google Cloud Vision SafeSearch (REST, không thêm gói, tính theo lượt), AWS
  Rekognition, Sightengine, mô hình tự chạy (không gửi ảnh ra ngoài, gói nặng, kém chính xác). Dịch vụ ngoài nhận ảnh
  tin chưa duyệt — cần chốt cùng rà soát pháp lý (TK 29).
- Thứ tự: sau `add-screening`; TK 29 ghi là việc còn mở cần xong trước khi chạy thật.
- **Câu hỏi mở**: chọn dịch vụ; ngưỡng "nhạy cảm" của dịch vụ được chọn.
