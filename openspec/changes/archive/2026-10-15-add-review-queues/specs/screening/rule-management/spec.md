## ADDED Requirements

### Requirement: Đo tỉ lệ máy quá tay theo từng luật

Hệ thống SHALL đo, theo từng luật của máy, tỉ lệ tin máy giữ có trúng luật đó mà người duyệt cho đạt, trên
số tin máy giữ có trúng luật đó đã có quyết định của người. Master SHALL xem được tỉ lệ này cùng số lượt "máy
quá tay" người duyệt đã ghi, để hạ trọng số luật quá tay (TK 13, TK 17).

#### Scenario: Tỉ lệ của một luật

- **WHEN** luật "liên hệ ngoài sàn" đã trúng ở 10 tin máy giữ có quyết định của người, và 7 tin trong số đó
  được cho đạt
- **THEN** master thấy tỉ lệ tin máy giữ mà người cho qua của luật này là 70%

#### Scenario: Việc chưa có quyết định không được tính

- **WHEN** một tin máy giữ có trúng luật "liên hệ ngoài sàn" còn đang chờ duyệt, hoặc việc về nó tự huỷ vì
  máy cho bản sửa qua
- **THEN** tin đó không được tính vào tỉ lệ của luật này
