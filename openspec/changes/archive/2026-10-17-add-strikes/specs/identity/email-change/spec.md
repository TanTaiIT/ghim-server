## ADDED Requirements

### Requirement: Gậy đang có đi theo cả email cũ lẫn email mới

Khi người đang có gậy còn hiệu lực đổi email, mọi gậy đó SHALL gắn với cả email cũ lẫn email mới: tài khoản nào
về sau được tạo bằng email cũ hay email mới (so sau chuẩn hoá) đều kế thừa những gậy còn hiệu lực ấy.

#### Scenario: Người đổi email vẫn mang gậy

- **WHEN** người dùng A đang có một gậy thường đổi email từ `an@ghim.vn` sang `an2@ghim.vn`
- **THEN** A vẫn mang gậy đó với điểm và ngày hết hạn không đổi

#### Scenario: Lập tài khoản bằng email cũ

- **WHEN** sau khi A đổi email, khách tạo tài khoản mới bằng `an@ghim.vn` trong lúc gậy của A còn hiệu lực
- **THEN** tài khoản mới mang gậy thường của A với đúng ngày hết hạn

#### Scenario: Gậy đã hết hạn

- **WHEN** gậy của A đã hết hạn trước khi khách tạo tài khoản mới bằng `an@ghim.vn`
- **THEN** tài khoản mới không có gậy nào
