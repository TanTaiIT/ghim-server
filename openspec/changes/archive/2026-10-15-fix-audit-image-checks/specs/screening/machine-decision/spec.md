## MODIFIED Requirements

### Requirement: Tin đang hiện mà thiếu kết quả ảnh thì chuyển sang hạn chế

Lượt rà mỗi 5 phút SHALL tìm tin đang hiển thị có ảnh chưa có kết quả kiểm và chuyển tin đó sang hiển thị
hạn chế với lý do "máy" (chốt 12/10/2026) — lưới an toàn cho trường hợp lẽ ra không xảy ra (cam kết 4) — và xếp kiểm các ảnh đó. Mỗi phiên bản
tin MUST chỉ bị chuyển một lần vì lý do này: người duyệt đã cho đạt thì lượt rà sau không hạn chế lại (chốt
15/10/2026).

#### Scenario: Tin hiện đầy đủ thiếu kết quả ảnh

- **WHEN** lượt rà thấy một tin đang hiện đầy đủ có một ảnh chưa có kết quả kiểm
- **THEN** tin chuyển sang hiển thị hạn chế với lý do "máy"

#### Scenario: Tin đủ kết quả

- **WHEN** lượt rà gặp một tin đang hiện đầy đủ đã có kết quả cho mọi ảnh
- **THEN** tin giữ nguyên mức hiển thị đầy đủ

#### Scenario: Người duyệt đã cho đạt

- **WHEN** lượt rà đã chuyển một tin sang hạn chế vì thiếu kết quả ảnh, người duyệt cho đạt, và ở lượt rà kế tiếp ảnh vẫn chưa có kết quả
- **THEN** tin giữ mức hiển thị đầy đủ và không có việc mới nào về tin đó
