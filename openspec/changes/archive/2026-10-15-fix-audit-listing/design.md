# Design

> **Đã duyệt 15/10/2026.** Người dùng giao tech lead chọn phương án ("tiếp giúp tôi"), theo tiêu chí chạy ổn với lượng
> lớn người dùng.

## Context

- Nguồn: `docs/RA-SOAT-15-10-2026.md` mục T14, T15, T16, đọc lại ở bf2faef.
- Lượt ghi của người đăng: đọc tin (`ownedBy`), gộp body thành `after`, rồi `repository.change` khoá dòng và kiểm phiên
  bản. Hệ thống hạ nơi đăng (`onPrivatizationStarted`), gỡ huy hiệu (`onBadgeRightsChanged`, `removeBadgeByGroup`) không
  tăng phiên bản — đó là chủ ý (không phải sửa của người đăng, không bắt người đăng tải lại).
- Bên nghe tắt danh mục / khoá tài khoản (`reconcile`) không đặt lý do cho nháp (`hide.calc`).

## Decisions

### 1. Giữ cột hệ thống theo dòng đã khoá (T14)

- `keepSystemColumns(read, after, locked)`: với `placement`, `groupId`, `badgeGroupId` — người đăng không đổi
  (`after.x === read.x`) thì lấy `locked.x`, có đổi thì lấy `after.x`. Áp sau `contentData(after)` ở lượt gửi
  (`submission.submit`), sửa không qua máy (`applyNow`), lưu nháp (`saveDraft`).
- Bỏ: tăng phiên bản khi hệ thống hạ / gỡ — mọi app đang mở tin nhận 409 `CONFLICT` vì một việc người đăng không làm;
  và 409 khi lệch — người đăng phải tải lại dù ô mình sửa không liên quan.
- Người đăng đổi nơi đăng thì `recheckPlacement` đã chạy luật nơi đăng trong khoá nhóm — không đổi.

### 2. Khoá dòng tài khoản, danh mục trong lượt gửi (T15)

- Cửa mới, nhận `tx` của `listing`:
  - `identity.lockAccountStatus(tx, accountId)` — `SELECT status FROM accounts … FOR SHARE`;
  - `categories.lockStatus(tx, categoryId)` — `SELECT status FROM categories … FOR SHARE`.
- `submission.assertStillPostable(tx, …)` gọi ở `before` của lượt gửi và của `createMoved`, sau khoá dòng tin và khoá
  nhóm. Tài khoản `locked` → 403 `ACCOUNT_LOCKED`, trạng thái khác `active` → 403; danh mục tắt và không phải sửa tại
  chỗ trong danh mục cũ → 409 `CATEGORY_DISABLED`.
- Vì sao đủ: lượt khoá / tắt là một `UPDATE` dòng đó. Commit trước lượt gửi thì lượt gửi đọc thấy và từ chối; tới sau
  thì `UPDATE` chờ lượt gửi commit, và bên nghe (chạy sau commit của lượt khoá / tắt) thấy tin đã ra khỏi nháp.
- Thứ tự khoá: dòng tin → khoá nhóm → tài khoản → danh mục → khoá của `trust`. Lượt khoá tài khoản và tắt danh mục chỉ
  giữ một dòng của mình, không vòng nào khép.
- `FOR SHARE` chặn `UPDATE` khác của dòng tài khoản (sửa hồ sơ) trong lúc lượt gửi chạy — vài chục mili giây, chấp nhận.

### 3. Tin sống không tạm ẩn (T16)

- `liveWhere`: `state ∈ {checking, pending, live}` và `hide_reasons` rỗng. Spec `trust/quotas` vốn nói "tin tạm ẩn
  MUST NOT được tính" — code đếm cả tin đang kiểm / chờ duyệt bị ẩn.
- Tin tạm ẩn hiện lại làm người đăng vượt trần thì như tin đang hiển thị: "Vượt trần không gỡ tin đang sống".
- Bỏ: rút tin chờ duyệt đã rời nhóm về nháp — tin đã rời nhóm hẳn không sửa được (spec editing), rút về nháp mở ra đường
  sửa đó.
