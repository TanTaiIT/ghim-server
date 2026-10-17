## ADDED Requirements

### Requirement: Hàng "có gậy" của ma trận quyết định

Khi người bán đang có gậy còn hiệu lực, máy SHALL dùng hàng "có gậy" thay cho hàng của mức tin cậy, ở mọi nơi
đăng: dải Thấp cho qua ở mức hạn chế; dải Vừa và dải Cao giữ cho người. Những trường hợp luôn giữ cho người
MUST vẫn được giữ như trước.

#### Scenario: Dải Thấp

- **WHEN** người bán T1 đang có 1 điểm gậy gửi một tin chấm 10 điểm
- **THEN** máy cho qua tin ở mức hạn chế

#### Scenario: Dải Vừa

- **WHEN** người bán T1 đang có 1 điểm gậy gửi một tin chấm 40 điểm
- **THEN** máy giữ tin cho người, trong khi cùng tin đó của một người T1 không có gậy được cho qua ở mức hạn chế

#### Scenario: Nhóm chỉ thành viên

- **WHEN** người bán T0 đang có gậy gửi một tin dải Thấp vào nhóm ở mức "chỉ thành viên"
- **THEN** máy cho qua tin ở mức hạn chế, không phải đầy đủ

#### Scenario: Gậy đã hết hạn

- **WHEN** gậy duy nhất của người bán T1 đã hết hạn và người đó gửi một tin chấm 40 điểm
- **THEN** máy dùng lại hàng T1: cho qua ở mức hạn chế, chờ hậu kiểm

### Requirement: Dấu hiệu dùng chung thiết bị với tài khoản có gậy

Tin của tài khoản dùng chung máy với một tài khoản đang có gậy còn hiệu lực, mà chưa thuộc diện luôn giữ theo
thiết bị, SHALL được cộng dấu hiệu "trùng thiết bị với tài khoản có gậy" 30 điểm (giá trị khởi đầu). Dấu hiệu
này MUST chỉ được cộng một lần cho một tin, dù máy có nhiều tài khoản đang có gậy hay bị khoá.

#### Scenario: Người nhà đã đăng tin từ trước

- **WHEN** tài khoản B đã đăng tin trên một máy trước khi tài khoản A trên cùng máy nhận gậy, rồi B gửi một tin
  không có dấu hiệu nào khác
- **THEN** tin của B được chấm 30 điểm và rơi vào dải Vừa

#### Scenario: Máy có hai tài khoản có gậy

- **WHEN** máy của B có hai tài khoản khác cùng đang có gậy và B gửi một tin
- **THEN** dấu hiệu này chỉ được cộng 30 điểm cho tin của B

#### Scenario: Gậy đã hết hạn

- **WHEN** gậy của A hết hạn và B gửi một tin mới
- **THEN** tin của B không còn dấu hiệu này
