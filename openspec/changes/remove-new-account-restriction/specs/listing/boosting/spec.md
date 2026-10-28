## MODIFIED Requirements

### Requirement: Chỉ đẩy tin đang hiển thị đầy đủ

Đẩy lên đầu và đặt nổi bật SHALL chỉ áp cho tin đang hiển thị ở mức đầy đủ, không tạm ẩn. Tin khác MUST bị từ chối
409 `BOOST_NOT_ALLOWED` với câu nói rõ vì sao (đang kiểm, chờ duyệt, bị gỡ, tạm ẩn, hiển thị hạn chế, đã bán, hết hạn).
Đẩy tin MUST NOT đổi trạng thái, cờ tạm ẩn, lý do hạn chế hay ngày hết hạn của tin (TK 27 cam kết 20).

#### Scenario: Tin chờ duyệt

- **WHEN** master đặt nổi bật một tin đang chờ người duyệt
- **THEN** server trả 409 `BOOST_NOT_ALLOWED` với câu "Tin đang chờ duyệt", tin vẫn chờ duyệt

#### Scenario: Tin hiển thị hạn chế

- **WHEN** staff đẩy lên đầu một tin trong danh mục mình đang hiển thị hạn chế vì lý do "máy"
- **THEN** server trả 409 `BOOST_NOT_ALLOWED` với câu nói tin đang hiển thị hạn chế, lý do hạn chế giữ nguyên

#### Scenario: Tin tạm ẩn

- **WHEN** chủ nhóm đẩy một tin của nhóm đang tạm ẩn vì nhiều người báo cáo
- **THEN** server trả 409 `BOOST_NOT_ALLOWED`

#### Scenario: Tin đã bán

- **WHEN** master đẩy lên đầu một tin đã bán
- **THEN** server trả 409 `BOOST_NOT_ALLOWED` với câu "Tin đã bán"

#### Scenario: Ngày hết hạn không đổi

- **WHEN** master đẩy lên đầu một tin còn 5 ngày hiển thị
- **THEN** tin vẫn còn 5 ngày hiển thị, trạng thái vẫn là đang hiển thị

#### Scenario: Tin của người đăng T0

- **WHEN** master đặt nổi bật một tin sàn chung của người đăng ở mức T0 mà máy đã cho qua đầy đủ
- **THEN** tin được đặt nổi bật như tin của mức khác
