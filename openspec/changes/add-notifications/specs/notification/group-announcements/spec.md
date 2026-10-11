## ADDED Requirements

### Requirement: Báo thành viên khi có tin mới trên bảng tin nhóm

Khi một tin mới hiện trên bảng tin của một nhóm, các thành viên nhóm SHALL được báo bằng thông báo nhóm "tin mới
trong nhóm". Người đăng tin MUST NOT nhận thông báo về tin của chính mình. Tin không lên bảng tin nhóm MUST NOT
được báo.

#### Scenario: Tin mới hiện đầy đủ trong nhóm

- **WHEN** một tin mới hiện ở mức đầy đủ trên bảng tin của nhóm
- **THEN** các thành viên khác của nhóm được báo về tin đó bằng thông báo nhóm "tin mới trong nhóm"

#### Scenario: Người đăng không tự nhận thông báo

- **WHEN** tin của một thành viên vừa hiện trên bảng tin nhóm
- **THEN** người đăng không nhận thông báo "tin mới trong nhóm" về tin đó

#### Scenario: Tin hiển thị hạn chế

- **WHEN** một tin mới trong nhóm chỉ được hiển thị ở mức hạn chế
- **THEN** không thành viên nào được báo về tin đó

#### Scenario: Tin máy giữ rồi được duyệt

- **WHEN** một tin trong nhóm bị máy giữ cho người, rồi điều hành viên cho đạt và tin hiện đầy đủ trên bảng tin
  nhóm
- **THEN** thành viên được báo về tin đó lúc tin hiện, không được báo lúc tin còn chờ duyệt
