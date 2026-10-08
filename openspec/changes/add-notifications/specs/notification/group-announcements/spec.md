## Purpose

Cho chủ nhóm và điều hành viên nói một lời tới cả nhóm, và báo thành viên khi bảng tin nhóm có tin mới (TK 24).

## ADDED Requirements

### Requirement: Chủ nhóm và điều hành viên gửi thông báo cho cả nhóm

Chủ nhóm và điều hành viên SHALL gửi được một thông báo tới mọi thành viên hiện tại của nhóm, thuộc nhóm thông
báo "thông báo của nhóm". Người không đang giữ vai chủ nhóm hay điều hành viên trong nhóm đó MUST NOT gửi được.

#### Scenario: Chủ nhóm gửi thông báo

- **WHEN** chủ nhóm gửi một thông báo cho nhóm của mình
- **THEN** response có HTTP 201 và mọi thành viên hiện tại của nhóm nhận thông báo thuộc nhóm "thông báo của
  nhóm"

#### Scenario: Điều hành viên cấp cả nhóm gửi thông báo

- **WHEN** một điều hành viên phụ trách cả nhóm gửi một thông báo cho nhóm
- **THEN** response có HTTP 201 và mọi thành viên hiện tại của nhóm nhận thông báo đó

#### Scenario: Thành viên thường

- **WHEN** một thành viên không giữ vai nào gửi thông báo cho nhóm
- **THEN** response có HTTP 403 `FORBIDDEN` và không ai nhận thông báo

#### Scenario: Điều hành viên đang tạm mất vai

- **WHEN** một điều hành viên đang tạm mất vai vì gậy nặng gửi thông báo cho nhóm
- **THEN** response có HTTP 403 `FORBIDDEN` và không ai nhận thông báo

#### Scenario: Nội dung rỗng

- **WHEN** chủ nhóm gửi một thông báo không có nội dung
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không ai nhận thông báo

#### Scenario: Người đã rời hay bị cấm khỏi nhóm

- **WHEN** chủ nhóm gửi thông báo sau khi một người đã rời nhóm và một người khác đã bị cấm khỏi nhóm
- **THEN** cả hai người đó không nhận thông báo

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
