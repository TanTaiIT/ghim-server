## MODIFIED Requirements

### Requirement: Đạt cho tin máy giữ

Kết quả "đạt" cho một việc máy giữ SHALL đưa tin lên bảng; tin hiển thị đầy đủ, trừ khi người đăng hay nơi
đăng còn một lý do hạn chế độc lập với lần giữ này, như "tài khoản mới". Quyết định SHALL ghi kèm nhận định
"máy đúng" hay "máy quá tay", trừ việc máy giữ chỉ vì nhóm bật "duyệt tay mọi tin" (`group/manual-review`): máy
đã cho qua nên quyết định MUST NOT đòi và MUST NOT ghi nhận định hay luật máy đã trúng.

#### Scenario: Tin của T2 bị giữ vì giá vượt trần

- **WHEN** staff cho đạt việc hàng 0 về tin sàn của tài khoản T2 bị giữ vì giá vượt trần danh mục
- **THEN** tin chuyển sang đang hiển thị ở mức đầy đủ

#### Scenario: Tin sàn của tài khoản T0

- **WHEN** staff cho đạt việc hàng 0 về tin sàn của tài khoản T0
- **THEN** tin chuyển sang đang hiển thị ở mức hạn chế với lý do "tài khoản mới"

#### Scenario: Tin dải Vừa bị giữ vì cổng cứng

- **WHEN** staff cho đạt việc hàng 0 về tin sàn của tài khoản T1, điểm rủi ro dải Vừa, bị giữ vì ảnh trùng
- **THEN** tin hiển thị đầy đủ, không mang lý do hạn chế "máy" và không có việc hàng 3 nào về tin đó (chốt
  15/10/2026)

#### Scenario: Nhận định về máy

- **WHEN** staff cho đạt một việc máy giữ
- **THEN** nhật ký quyết định ghi nhận định "máy đúng" hoặc "máy quá tay" cùng các luật máy đã trúng

#### Scenario: Thiếu nhận định về máy

- **WHEN** staff cho đạt một việc máy giữ mà không chọn "máy đúng" hay "máy quá tay"
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và tin không đổi

#### Scenario: Cho đạt tin nhóm duyệt tay

- **WHEN** chủ nhóm cho đạt một việc máy giữ chỉ vì nhóm bật "duyệt tay mọi tin", không chọn nhận định về máy
- **THEN** tin chuyển sang đang hiển thị và nhật ký quyết định không có nhận định về máy, không có luật máy đã trúng
