## ADDED Requirements

### Requirement: Phiếu tải ảnh cho biết cạnh ngắn tối thiểu

Phiếu tải ảnh SHALL kèm cạnh ngắn tối thiểu đang áp cho ảnh của tin (`screening/image-checks`), để client chặn ảnh quá
nhỏ trước khi tải lên. Phiếu tải ảnh đại diện SHALL kèm cùng con số, nhưng ảnh đại diện MUST NOT bị kiểm chất lượng.

#### Scenario: Xin tải ảnh cho tin

- **WHEN** người đăng xin tải một ảnh cho bản nháp của mình, cạnh ngắn tối thiểu đang là 480
- **THEN** phiếu tải ảnh cho biết cạnh ngắn tối thiểu 480

#### Scenario: Master đổi ngưỡng

- **WHEN** master đổi cạnh ngắn tối thiểu thành 600 rồi người đăng xin tải ảnh mới
- **THEN** phiếu tải ảnh cho biết cạnh ngắn tối thiểu 600
