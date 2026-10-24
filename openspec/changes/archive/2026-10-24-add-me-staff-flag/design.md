# Design

## Context

Hồ sơ của tôi (`meSchema`) có `role` (`user` / `master`) nhưng không nói gì về quyền staff: quyền staff là dữ liệu của
`platform`, `identity` chỉ hỏi qua cổng `PrivilegeSource.staffGrant` (trần phiên lúc đăng nhập dùng cổng này). Trước
`remove-two-factor`, app suy ra staff từ `twoFactorEnabled`; trường đó đã bỏ.

## Goals / Non-Goals

**Goals**: app biết tài khoản đang đăng nhập có vào được bàn vận hành không, chỉ bằng hồ sơ của tôi.

**Non-Goals**: phạm vi, danh mục, lý do treo; hồ sơ công khai; thay đổi luật quyền.

## Decisions

### 1. Một cờ đúng / sai, không trả gói quyền

`staff: boolean`. Gói đầy đủ (`scopes`, `categoryIds`, `status`) đã có ở danh sách staff của master; app chưa dùng phạm
vi để ẩn tab, và mỗi trường thêm vào hồ sơ là một hợp đồng phải giữ. Khi app cần ẩn tab theo phạm vi thì mở change
riêng, thêm trường — không breaking.

### 2. Quyền đang treo tính là sai

Quyền treo "vẫn là quyền staff" chỉ với trần 3 phiên lúc đăng nhập; ở bàn vận hành nó không cho làm gì
(`STAFF_PERMISSION_SUSPENDED`). Cờ trả lời câu "có lối vào không", nên treo → sai: staff vừa nhận gậy không thấy lối vào
dẫn tới toàn lỗi 403. Master trả lại quyền thì lần đọc hồ sơ sau thấy đúng.

### 3. Hỏi qua `PrivilegeSource`, ở mọi route trả hồ sơ của tôi

Mặt service tài khoản đã có một hàm dựng hồ sơ dùng chung cho `getMe`, `updateMe`, `setAvatar`, `clearAvatar`; thêm lời
gọi `privilegeSource.staffGrant(account.id)` ở đó để bốn route trả cùng một hình. Giá: một lượt đọc theo khoá chính mỗi
lần đọc hồ sơ — cùng cỡ với lượt kiểm tên bị lọc đang có. Master không đi qua cổng (vai `master` là cột của
`accounts`); cờ của master là kết quả cổng trả, thực tế là sai — app dùng `role` cho master.

## Risks / Trade-offs

- Cờ chỉ đúng tại lúc đọc: quyền bị thu hay treo sau đó thì app còn thấy lối vào tới lần đọc hồ sơ sau. Không sao —
  server vẫn chặn ở từng route `/ops/*`, và màn bàn vận hành hiện lỗi của server.

## Migration Plan

Không có migration. Deploy server trước, rồi app `npm run api:sync`.
