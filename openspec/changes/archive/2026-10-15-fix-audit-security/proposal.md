# Proposal

## Why

Rà soát ngày 15/10/2026 (`docs/RA-SOAT-15-10-2026.md`) đọc lại code của mọi module đã archive và tìm ra năm lỗ hổng
bảo mật. Đây là đợt 1 của phần sửa lỗi, phải xong trước mọi tính năng mới (chốt 15/10/2026):

- **C3 — chiếm tài khoản từ trước qua Google.** Kẻ xấu đăng ký trước bằng email của nạn nhân kèm mật khẩu của mình
  và giữ phiên. Nạn nhân đăng nhập Google bằng email đó trong 7 ngày thì vào đúng dòng ấy, mà phiên và mật khẩu của
  kẻ xấu vẫn dùng được. TK 7 coi email Google là đã xác nhận, nhưng chưa nói đăng ký dở của người khác thì sao.
- **C4 — master tự xoá, tự khoá được mình.** Hệ thống mất master vĩnh viễn: việc chuyển cấp và thông báo N40–N42
  không tới ai, còn công cụ tạo master báo "đã có master". TK 5 nói "không có luồng thay hay bỏ master trong app".
- **C5 — thiết lập lại lớp thứ hai không cần mã cũ.** Một phiên chỉ qua mật khẩu (token bị lộ, hay phiên mở trước khi
  được cấp quyền staff) tự đặt được ứng dụng tạo mã mới rồi vào bàn vận hành. TK 5 nói chỉ đội kỹ thuật đặt lại lớp
  thứ hai.
- **C6 — master quyết việc qua thao tác của nhóm mà không cần lớp thứ hai.** Thao tác hàng chờ của nhóm chỉ đòi đăng
  nhập, nhưng lại coi người gọi là master. TK 5 nói master không vào nhóm, và bàn vận hành đòi hai lớp.
- **T10 — con số trong bảng không có trần hay sàn.** Master gõ nhầm một con số là đủ làm hệ thống hỏng:
  - `0` ngày phiên rảnh khoá cả master ra ngoài;
  - `0` lượt đăng nhập mỗi phút chặn mọi lượt đăng nhập;
  - hệ số giá bất thường `0` làm job thống kê giá chết mỗi đêm;
  - phân vị giá trên 50 vi phạm ràng buộc của DB;
  - độ lệch ảnh trùng trên 4 âm thầm không tìm được ảnh trùng nào.

  TK 28 chỉ cho giá trị khởi đầu, không cho khoảng hợp lệ.

Sửa lỗi, không thuộc đợt nào của TK 29. Bốn quyết định do người dùng chốt ngày 15/10/2026, mỗi mục chọn phương án đề
xuất:

| Mục | Chốt                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C3  | Xoá hẳn đăng ký chưa xác nhận rồi tạo tài khoản mới, thay vì nối Google vào dòng cũ. Nối vào dòng cũ thì phải nhớ gỡ từng thứ kẻ xấu để lại: phiên, máy, tên, ảnh. |
| C4  | Chặn cả xoá lẫn khoá tài khoản master; công cụ tạo master giữ nguyên, vì không còn đường nào làm master mất hoạt động.                                             |
| C5  | Lớp thứ hai đã bật thì từ chối thiết lập lại qua app; đổi ứng dụng tạo mã thì đội kỹ thuật đặt lại bằng công cụ. Không cần migration.                              |
| C6  | Ở thao tác hàng chờ của nhóm chỉ tính vai trong nhóm; quyền master chỉ dùng ở bàn vận hành.                                                                        |

## What Changes

- **Google gặp đăng ký chưa xác nhận** (C3): đăng ký dở bị xoá hẳn, như job dọn đăng ký quá 7 ngày đã làm; phiên của
  nó bị cắt ngay. Google tạo tài khoản mới đã xác nhận.
- **Master không bị xoá hay khoá** (C4):
  - tự xoá, hay xoá bằng email cùng mật khẩu → 409 `ACCOUNT_DELETE_BLOCKED`;
  - khoá tài khoản master → 409 `CONFLICT`.
- **Lớp thứ hai đã bật không thiết lập lại được qua app** (C5) → 409 `TWO_FACTOR_ENABLED`. `pnpm cli:reset-2fa` vẫn là
  đường đặt lại, cho mọi tài khoản.
- **Thao tác hàng chờ của nhóm không mang quyền master** (C6):
  - xem hay nhận việc → 404 `NOT_FOUND`;
  - xem hàng chờ của nhóm → 403 `FORBIDDEN` (như mọi người không có vai trong nhóm).

  Master vẫn thấy và xử mọi việc, kể cả việc của nhóm, ở bàn vận hành.

- **Mỗi con số trong bảng có khoảng hợp lệ** (T10), cộng các ràng buộc giữa hai con số. Đổi ra ngoài khoảng → 400
  `VALIDATION_ERROR`, không phiên bản nào được tạo. Khoảng của từng con số xem design mục 5.
- TK 7 thêm một dòng cho C3. C4, C5, C6 đã có ở TK 5; code chỉ làm cho đúng.

**Cố ý chưa làm**: các mục khác của rà soát. Đợt 2 (C1, C2, C7–C11) và đợt 3–4 (T, L) đi change riêng hoặc sửa kèm
test, theo `docs/VIEC-DANG-DO.md` mục 0.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `identity/registration`: "Đăng ký và đăng nhập bằng Google" — email chỉ có đăng ký chưa xác nhận.
- `identity/sessions`: "Đăng nhập hai lớp cho master và staff" — đã bật thì không thiết lập lại qua app.
- `platform/master-accounts`: thêm "Master không bị xoá hay khoá".
- `platform/config-versions`: "Con số mới phải hợp lệ" — khoảng của từng con số; thêm "Các con số giữ ràng buộc
  giữa nhau".
- `review/queues`: thêm "Quyền master với việc chỉ dùng ở bàn vận hành".

## Impact

- Code thay đổi:
  - `identity`: đăng nhập Google, xoá mềm, khoá tài khoản, thiết lập lớp thứ hai;
  - `review`: tìm việc theo phạm vi;
  - `src/common/config/config-keys.ts`: khoảng của từng khoá, kiểm chéo khoá.
- Không migration, không thêm thư viện, không đổi cấu trúc response.
- App: thêm ba mã lỗi app có thể gặp — `ACCOUNT_DELETE_BLOCKED` khi master xoá tài khoản (bàn vận hành), 409
  `TWO_FACTOR_ENABLED`, và 400 khi master đổi con số ra ngoài khoảng.
