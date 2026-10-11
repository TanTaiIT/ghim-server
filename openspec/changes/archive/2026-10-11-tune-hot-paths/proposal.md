# Proposal

## Why

Rà soát lần hai ngày 11/10/2026 sau ba module đầu đo được tải DB trên đường xác thực lớn hơn cần: mỗi request
có đăng nhập chạy hai câu SQL để biết "người này là ai", mỗi request bàn vận hành chạy thêm bốn câu để đọc
quyền staff — sáu câu trước khi handler làm việc gì. Prisma 7 chạy `include` thành các câu riêng (đo bằng log
truy vấn), nên đổi sang `include` không bớt được câu nào. Đây là đường mọi module sau sẽ đi qua (TK 30: mọi
module hỏi `identity` "người này là ai", bàn vận hành nằm trong từng module), nên sửa trước `add-groups`.

Kèm theo: việc dọn phiên hằng đêm quét cả bảng `sessions`, và một index của danh sách miền email dùng một lần
trùng khoá chính, chỉ làm chậm lượt nạp và cập nhật hằng tuần.

Đợt: hạ tầng giữa đợt 1, trước `add-groups` (TK 29). Không đổi hành vi nào người dùng thấy.

## What Changes

- "Người này là ai" là MỘT câu SQL (phiên JOIN tài khoản) thay vì hai.
- `PrivilegeSource` còn một phương thức `staffGrant` trả cả gói quyền trong MỘT câu SQL; guard và `identity`
  kiểm phạm vi trong bộ nhớ. Request bàn vận hành từ sáu câu SQL xuống hai.
- Mỗi lượt đăng nhập hỏi "có phải staff" đúng một lần (trước là hai lần khi tài khoản đã bật hai lớp).
- Một helper `actorOf` ở `common/auth` thay năm bản chép trong các file route.
- Migration `tune_hot_path_indexes`: hai index cho việc dọn phiên, bỏ index trùng khoá chính của
  `disposable_domains`.

**Cố ý chưa làm** (rà soát xếp "làm khi tới lúc"): kho đếm rate limit dùng chung khi chạy nhiều tiến trình;
phân trang con trỏ cho nhật ký (cùng `add-listings`); tách `identity.repository.ts` (570 dòng). Header cache
cho route công khai và thu quyền staff khi xoá tài khoản đổi hành vi — change riêng có spec.

## Capabilities

### New Capabilities

_(không có — change không đổi hành vi, `skip_specs: true`)_

### Modified Capabilities

_(không có)_

## Impact

- `src/common/auth/{privilege-source,auth.plugin,actor}.ts`, `identity.repository.ts`, `identity.shared.ts`,
  `identity.auth.service.ts`, `platform.repository.ts`, `platform.service.ts`, năm file route.
- Migration `tune_hot_path_indexes` (không mất dữ liệu). Không đổi API, không thêm package.
