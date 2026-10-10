# Proposal

## Why

Rà soát ngày 10/10/2026 sau ba module đầu (`identity`, `platform`, `category`) tìm ra bốn chỗ sẽ làm chậm hoặc
làm hỏng việc thêm chín module còn lại. Không chỗ nào đổi hành vi người dùng thấy; cả bốn là hạ tầng mà mọi
module sau dựa vào, nên sửa trước `add-groups` rẻ hơn sửa khi đã có mười module bám vào.

TK 30 (phụ lục cho đội lập trình) chốt tác động chéo đi qua outbox và module có ranh giới cứng; TK 26 chốt việc
hệ thống tự làm phải chạy được dù một bước lỗi. Cam kết ở TK 27 được bảo vệ gián tiếp: mọi cam kết dựa trên sự
kiện chéo module (treo quyền khi khoá — cam kết 28; sau này gậy, hàng chờ, thông báo) cần bộ phát không bị một
sự kiện hỏng chặn đứng.

Đợt: hạ tầng giữa đợt 1, trước `add-groups` (TK 29).

## What Changes

- **Bộ phát outbox chịu được sự kiện hỏng và nhiều tiến trình.** Hiện mỗi lượt lấy 100 sự kiện cũ nhất chưa
  phát, kể cả sự kiện lỗi mãi: 100 sự kiện hỏng là mọi sự kiện mới đứng chờ vô hạn; chạy hai tiến trình thì
  hai bộ phát xử cùng một sự kiện. Đổi thành: thử lại theo giờ hẹn tăng dần (sự kiện hỏng lùi về sau, không
  chặn sự kiện mới), cảnh báo khi một sự kiện thử quá nhiều lần, và nhận lô bằng khoá dòng có hạn giữ để nhiều
  tiến trình chạy cùng lúc không phát trùng. Vẫn không bỏ sự kiện nào.
- **Bản giả nói cùng thứ tiếng lỗi với bản thật.** Bản giả hiện ném một lớp lỗi tự chế mà error handler không
  nhận ra: cùng một lượt trùng khoá ra 409 ở production nhưng 500 trong test. Bản giả ném đúng lớp lỗi của
  Prisma; các ràng buộc quan trọng (unique, khoá lạc quan, tiêu mã một lần) có bộ test hợp đồng chạy cùng một
  bộ ca trên bản giả lẫn Postgres, để bản giả không lệch được mà không ai biết.
- **Tách service của `identity`.** File dài khoảng 1.240 dòng, gấp ba service khác. Tách theo đúng ba mối quan
  tâm mà route đã tách (khách và phiên, người đã đăng nhập, bàn vận hành), cộng một phần dùng chung (mã xác
  nhận, mở phiên, chuẩn hoá email). Interface `IdentityService` mà route và module khác thấy giữ nguyên.
- **Ghép module bằng danh sách, không bằng tay.** Mỗi module mới hiện thêm một trường vào `AppDeps`, một khối
  dựng trong `buildApp`, một dòng decorate, một bước khởi động trong `server.ts`, một lượt đăng ký bên nghe.
  Đổi thành: mỗi module tự khai một định nghĩa (route, bên nghe outbox, việc nền, bước khởi động); `buildApp`
  và `server.ts` lặp qua danh sách.

**Cố ý chưa làm** (rà soát xếp "làm khi có số đo"):

- Gộp truy vấn xác thực mỗi request (phiên + tài khoản + quyền staff): chờ số đo tải thật.
- Phân trang theo con trỏ cho nhật ký và helper con trỏ dùng chung: làm cùng change đầu tiên cần nó (bảng tin
  ở `add-listings`), dùng chung cho nhật ký.
- Thu quyền staff khi tài khoản bị xoá: đổi hành vi của `platform/staff-permissions`, cần change riêng có spec.

## Capabilities

### New Capabilities

_(không có — change không đổi hành vi, `skip_specs: true`)_

### Modified Capabilities

_(không có)_

## Impact

- `src/common/outbox/dispatcher.ts`, migration mới thêm hai cột vào `outbox_events` (không mất dữ liệu).
- `tests/fakes/*`, các file test hợp đồng mới.
- `src/modules/identity/identity.service.ts` tách thành nhiều file; `createIdentityService` giữ chữ ký.
- `src/app.ts`, `src/server.ts`, mỗi module thêm một file định nghĩa module; `tests/fakes/app.ts`.
- CLAUDE.md: cây thư mục, cách thêm một module mới, luật 12.
- Không đổi API, không thêm package.
