# Design

## Context

Phiên do `identity` sở hữu (bảng `sessions`, design `add-identity` mục 4): DB giữ SHA-256 của token làm mới
hiện hành (`refresh_token_hash`) và của token vừa thay (`prev_refresh_token_hash`). `refresh` hiện đọc phiên
theo băm token, rồi ghi đè băm mới **không điều kiện**. Hai lượt cùng lúc với token T đều đọc thấy T là hiện
hành, đều ghi; lượt ghi sau thắng, lượt ghi trước trả về cho client một token không khớp gì trong DB. Lượt
làm mới kế tiếp của client đó nhận 401 dù phiên sống; nếu client gửi lại T thì T lúc này là
`prev_refresh_token_hash` → bị coi là dùng lại → phiên bị thu hồi.

## Goals / Non-Goals

**Goals**: đúng một lượt thắng mỗi token; lượt thua biết mình thua và không làm hỏng phiên; hợp đồng client
viết thành requirement.

**Non-Goals**: cửa sổ ân hạn cho token cũ (proposal); đổi cách lưu token; đổi luật phát hiện dùng lại.

## Decisions

### 1. Xoay token là lượt ghi có điều kiện

Repository thêm `rotateRefreshToken({ sessionId, expectedHash, nextHash, at, expiresAt }): Promise<boolean>`:

```sql
UPDATE sessions
   SET refresh_token_hash = :next, prev_refresh_token_hash = :expected,
       last_active_at = :at, expires_at = :expiresAt
 WHERE id = :sessionId AND refresh_token_hash = :expected AND revoked_at IS NULL
```

(viết bằng `updateMany` của Prisma, đếm dòng). `false` = lượt khác vừa xoay trước hoặc phiên vừa bị thu hồi.
Postgres khoá dòng khi UPDATE: lượt sau chờ lượt trước commit rồi đánh giá lại điều kiện trên giá trị mới, nên
đúng một lượt khớp. Bản giả làm đúng như vậy (không có `await` giữa so và ghi).

`refresh` trong service: đọc phiên như cũ (để phân biệt "không có", "đã thu hồi", "hết hạn", "tài khoản bị
khoá"), rồi gọi `rotateRefreshToken`; `false` → 409 `REFRESH_CONFLICT`, **không** gọi nhánh thu hồi.

_Thay thế đã cân nhắc:_ khoá dòng `SELECT … FOR UPDATE` cho cả lượt — lượt sau chờ xong thì thấy T đã thành
token cũ, theo luật phải thu hồi phiên: tệ hơn hiện tại. Cửa sổ ân hạn N giây cho `prev_refresh_token_hash` —
thêm một con số phải vào TK 28, và vẫn cần lượt ghi có điều kiện để không mất token.

### 2. Lượt thua: 409 `REFRESH_CONFLICT`, không phải 401

401 nói với client "đăng nhập lại" — đúng điều change này muốn tránh. 409 nói "phiên vẫn còn, lượt của bạn
đến sau". Thông điệp: "Phiên vừa được làm mới bởi một lượt khác của thiết bị này — dùng kết quả của lượt đó".

### 3. Hợp đồng client nằm trong tài liệu route

Mô tả Swagger của `POST /auth/refresh`:

- App: gom mọi lượt làm mới thành một (một promise dùng chung); nhận 409 `REFRESH_CONFLICT` thì chờ lượt đang
  chạy và dùng token của nó; **không** gửi lại token cũ — gửi lại là "dùng lại token" và thu hồi phiên.
- Web (cookie): lượt thắng đã đặt cookie mới cho mọi tab; tab nhận 409 gửi lại một lần là thành công.

### Dữ liệu

Không đổi bảng, không migration.

### Mã lỗi mới

409 `REFRESH_CONFLICT`.

## Risks / Trade-offs

- [Client chưa gom lượt làm mới, nhận 409 rồi gửi lại token cũ] → Phiên bị thu hồi, như luật hiện hành; hợp
  đồng ghi rõ trong Swagger. Số đo thật cho thấy còn nhiều thì xét cửa sổ ân hạn (proposal).
- [Lượt thua đã kiểm "tài khoản bị khoá" trước khi thua] → Vô hại: lượt thắng cũng kiểm; khoá chen giữa thì
  phiên đã bị thu hồi, `revoked_at IS NULL` trong điều kiện làm lượt ghi trả `false` và lượt kế tiếp nhận 401.

## Migration Plan

Không có thay đổi dữ liệu. Triển khai là thay code; client cũ không gom lượt làm mới vẫn chạy như trước,
chỉ nhận 409 thay cho 200-với-token-hỏng.

## Open Questions

_(không có)_
