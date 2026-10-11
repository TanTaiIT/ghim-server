# Design

## Context

Không response nào của API đặt `Cache-Control`. Route công khai (`/categories*`, `/regions/*`) đọc DB ở mỗi
lần app mở; `GET /categories` dùng `CategoryRepository.list`, đọc cả dòng cài đặt hiện hành của từng danh mục
rồi bỏ đi. Route có dữ liệu cá nhân cũng không cấm giữ lại.

`identity` đã phát `identity.account.deleted` (cùng transaction với lượt xoá mềm) nhưng `platform` chỉ nghe
`identity.account.locked`.

## Goals / Non-Goals

**Goals**: route công khai cho giữ lại có hạn, đúng độ "tươi" mà TK chấp nhận; mặc định cấm giữ lại; xoá tài
khoản thu quyền staff qua outbox như khoá tài khoản treo quyền.

**Non-Goals**: ETag / kiểm lại 304; cache phía server; nhật ký cho lượt thu do hệ thống làm (giống lượt treo:
không có người làm, `audit_log.actor_role` chỉ có `user` / `master`).

## Decisions

### 1. Mặc định `no-store`, route công khai tự mở

Hook `onSend` trong `buildApp`: response chưa có `cache-control` thì đặt `no-store`. Helper dùng chung
`src/common/http/cache.ts`:

| Hằng              | Giá trị                               | Dùng cho                                            |
| ----------------- | ------------------------------------- | --------------------------------------------------- |
| `CACHE_REGIONS`   | `public, max-age=86400`               | `/regions/provinces`, `/…/wards`, `/regions/search` |
| `CACHE_CATALOG`   | `public, max-age=300`                 | `GET /categories`, `GET /categories/:id/template`   |
| `CACHE_IMMUTABLE` | `public, max-age=31536000, immutable` | `GET /categories/:id/template/versions/:version`    |

Handler chỉ đặt header **sau** khi service trả kết quả, nên mọi lỗi (404, 400) giữ `no-store` của hook. Hai
con số 5 phút và một ngày là hằng kỹ thuật trong code, không vào bảng con số TK 28: master không cần chỉnh
chúng, và đổi chúng không đổi luật nghiệp vụ nào ngoài độ trễ đã ghi trong spec.

_Thay thế đã cân nhắc:_ ETag theo phiên bản — vẫn phải đọc DB để biết phiên bản, chỉ tiết kiệm băng thông;
`private` thay `public` — chặn CDN, mất phần lợi lớn nhất.

### 2. Xoá tài khoản thu quyền staff

`platform.events.ts` nghe thêm `identity.account.deleted` → `PlatformService.revokeStaffForDeletion(accountId)`
→ `PlatformRepository.removeStaff(accountId)` (xoá dòng `staff_permissions`, grant theo danh mục đi theo
cascade; idempotent, không ghi nhật ký). Áp cho cả quyền đang treo. Tài khoản bị xoá hẳn sau 90 ngày thì
cascade của FK vốn đã dọn — lượt thu này chỉ đưa thời điểm đó về lúc xoá mềm.

### Mã lỗi mới

_(không có)_

### Dữ liệu

Không đổi bảng, không migration.

## Risks / Trade-offs

- [App thấy danh mục đã tắt thêm tối đa 5 phút] → Ghi trong spec `category/category-catalog`; lượt đăng tin vào danh mục đã tắt bị
  `listing` từ chối ở server (đợt 2), nên chậm hiển thị không thành lỗi dữ liệu.
- [`no-store` toàn cục làm mất cache vô tình của client] → Không có client nào dựa vào nó; route nào cần thì tự
  mở tường minh.

## Migration Plan

Triển khai code; không có thay đổi dữ liệu. Staff đã xoá tài khoản trước change này vẫn còn dòng quyền: một
lượt dọn tay khi triển khai (`DELETE FROM staff_permissions WHERE account_id IN (SELECT id FROM accounts WHERE
status = 'deleted')`) — DB dev hiện không có dòng nào như vậy.

## Open Questions

- 5 phút cho danh mục và mẫu hiện hành, một ngày cho khu vực: bạn xác nhận hai độ trễ này khi duyệt change.
