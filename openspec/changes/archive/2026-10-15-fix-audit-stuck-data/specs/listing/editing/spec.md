## MODIFIED Requirements

### Requirement: Không đổi nơi đăng khi đang có việc chờ

Nơi đăng — mở rộng, thu hẹp hay đổi nhóm — MUST NOT đổi khi tin đang chờ duyệt, đang bị báo cáo hay đang hậu
kiểm, để không ai chuyển tin đi chỗ khác cho thoát việc đang chờ (TK 27 cam kết 19). Các phần sửa khác vẫn làm
được.

#### Scenario: Thu hẹp tin đang chờ duyệt

- **WHEN** người đăng thu hẹp nơi đăng của một tin đang chờ duyệt
- **THEN** response có HTTP 409 `PLACEMENT_LOCKED` và nơi đăng không đổi

#### Scenario: Mở rộng tin đang bị báo cáo

- **WHEN** người đăng mở rộng nơi đăng của một tin đang hiển thị có báo cáo chưa xử
- **THEN** response có HTTP 409 `PLACEMENT_LOCKED` và nơi đăng không đổi

#### Scenario: Sửa giá tin đang chờ duyệt

- **WHEN** người đăng sửa giá, không đổi nơi đăng, của một tin đang chờ duyệt
- **THEN** sửa được nhận và tin chuyển sang đang kiểm

#### Scenario: Gia hạn kèm đổi nơi đăng khi đang hậu kiểm

- **WHEN** người đăng gia hạn sớm một tin đang hậu kiểm kèm đổi nơi đăng
- **THEN** response có HTTP 409 `PLACEMENT_LOCKED` và tin không đổi

### Requirement: Tin đã rời nhóm hẳn không sửa được

Tin đã rời nhóm hẳn — nhóm đã đóng, tin người ngoài rời nhóm vì nhóm sang riêng tư, tin bị gỡ khỏi nhóm — MUST NOT
sửa được nữa. Người đăng chỉ chuyển được tin đó lên sàn chung thành một tin mới (listing/suspension) hoặc xoá nó,
để mỗi món đồ chỉ lên sàn chung một lần (chốt 12/10/2026).

#### Scenario: Sửa nơi đăng tin của nhóm đã đóng

- **WHEN** người đăng đổi nơi đăng một tin của nhóm đã đóng lên sàn chung, có đủ tỉnh và phường
- **THEN** response có HTTP 409 `LISTING_DETACHED` và tin không đổi

#### Scenario: Xoá tin đã rời nhóm

- **WHEN** người đăng xoá một tin bị gỡ khỏi nhóm
- **THEN** tin bị xoá

#### Scenario: Rút về nháp tin đã rời nhóm

- **WHEN** người đăng rút về nháp một tin chờ duyệt của nhóm đã đóng
- **THEN** response có HTTP 409 `LISTING_DETACHED` và tin vẫn chờ duyệt
