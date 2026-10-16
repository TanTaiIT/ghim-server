## ADDED Requirements

### Requirement: Tài khoản T3 vẫn được tính lại khi còn tin sạch chưa tính

Lượt tính lại hằng ngày SHALL tính lại tài khoản T3 còn tin sạch chưa được tính — tin mới sạch, hay tin đang dời vì trần
tin sạch trong 7 ngày — để số tin sạch đang được tính theo kịp. Tài khoản T3 mà mọi tin sạch đã được tính thì lượt đó
MAY bỏ qua.

#### Scenario: T3 có tin sạch mới

- **WHEN** tài khoản T3 có hai tin sạch còn hiệu lực mà lần tính gần nhất mới tính một
- **THEN** lượt tính lại hằng ngày tính lại tài khoản đó

#### Scenario: T3 đã tính đủ

- **WHEN** tài khoản T3 có một tin sạch còn hiệu lực và lần tính gần nhất đã tính tin đó, theo bảng con số hiện hành
- **THEN** lượt tính lại hằng ngày bỏ qua tài khoản đó
