## ADDED Requirements

### Requirement: Có gậy còn hiệu lực thì mức tối đa là T1

Người đang có gậy còn hiệu lực SHALL có mức tin cậy không cao hơn T1, dù đủ điều kiện của mức cao hơn. Mức
SHALL được tính lại ngay khi người đó nhận gậy, và tính lại trong ngày gậy hết hạn.

#### Scenario: Người T2 nhận gậy

- **WHEN** người bán đang ở T2 nhận gậy thường đầu tiên
- **THEN** mức của người đó về T1 ngay

#### Scenario: Người T0 nhận gậy

- **WHEN** người dùng đang ở T0 nhận một gậy
- **THEN** mức vẫn là T0

#### Scenario: Đủ điều kiện T2 khi đang có gậy

- **WHEN** người đang có gậy đủ 30 ngày tuổi và có 5 tin sạch
- **THEN** mức vẫn là T1

#### Scenario: Gậy cuối cùng hết hạn

- **WHEN** gậy cuối cùng của người bán hết hạn và người đó vẫn đủ điều kiện T2
- **THEN** mức được tính lại về T2 trong ngày gậy hết hạn

### Requirement: T3 cần không nhận gậy nào trong 90 ngày gần nhất

Mức T3 SHALL chỉ dành cho người không nhận gậy nào trong 90 ngày gần nhất (giá trị khởi đầu), tính cả gậy đã
hết hạn.

#### Scenario: Gậy đã hết hạn nhưng còn trong 90 ngày

- **WHEN** bảng con số đặt hạn gậy thường là 60 ngày, và một người đủ tuổi và đủ tin sạch của T3 có một gậy
  thường nhận cách đây 70 ngày, đã hết hạn
- **THEN** mức của người đó là T2

#### Scenario: Gậy đã quá 90 ngày

- **WHEN** gậy thường đó tròn 90 ngày kể từ khi nhận
- **THEN** mức được tính lại thành T3

### Requirement: Gậy bị huỷ coi như chưa từng có

Gậy bị huỷ vì khiếu nại thắng hay ân xá MUST NOT được tính vào trần T1 hay điều kiện của T3, và mức SHALL được
tính lại ngay khi gậy bị huỷ.

#### Scenario: Thắng khiếu nại

- **WHEN** người vốn đủ điều kiện T3 nhận một gậy, về T1, rồi khiếu nại thắng
- **THEN** mức được tính lại về T3 ngay, không chờ 90 ngày

#### Scenario: Ân xá

- **WHEN** master ân xá gậy duy nhất của một người đủ điều kiện T2
- **THEN** mức được tính lại về T2 ngay
