# Proposal

## Why

Rà soát ngày 15/10/2026 (`docs/RA-SOAT-15-10-2026.md`) xếp các mục làm dữ liệu kẹt hay mất vào đợt 2. Đợt này tách làm
ba change: phần A này, `fix-audit-image-checks` (C2, C11) và `fix-audit-listeners` (C1). Phần A gồm bốn mục, mỗi mục
đã được đọc lại code để xác nhận:

- **C7 — lý do ẩn bám theo tin qua nháp, ẩn vĩnh viễn.**
  - Rút về nháp giữ nguyên lý do. Lưu nháp đổi nơi đăng, nhóm, danh mục tự do mà không bỏ lý do của nhóm cũ. Gửi nháp
    và gia hạn cũng giữ nguyên.
  - Bên nghe chỉ gỡ lý do theo nhóm, danh mục **hiện tại** của tin. Vì vậy tin đã đổi khỏi nhóm X không bao giờ được
    gỡ "nhóm bị tạm khoá" của X.
  - Tin đã rời nhóm hẳn còn lách được luật "chỉ chuyển hoặc xoá" (listing/editing) bằng cách rút về nháp rồi sửa.
- **C8 — tin chờ duyệt mất việc khi người đăng rời nhóm đang nhận tin người ngoài.**
  - Lượt rời huỷ mọi việc máy giữ của người đó trong nhóm.
  - Tin "nhóm công khai" thì không bị ẩn: nó ở lại làm tin người ngoài (listing/suspension). Kết quả là tin chờ duyệt
    mãi, không ai thấy, mà vẫn chiếm hạn mức.
- **C9 — dùng lại email của tài khoản đã xoá quá 90 ngày thì xoá cứng cả dây chuyền.**
  - Dòng tài khoản bị xoá thật, kéo theo theo khoá ngoại: lượt máy duyệt, đổi mức tin cậy, dấu thiết bị, cờ, giấy tờ,
    tin, việc.
  - Mất cả dấu băm email, thứ TK 7 dùng để nối gậy qua lần đăng ký lại — đúng lúc người đó đăng ký lại.
  - Kèm **T13**: người dùng Google đã xoá không bao giờ quay lại được bằng Google, vì dòng cũ vẫn giữ mã Google.
- **C10 — nhóm thiếu chủ được master chuyển sang riêng tư thì thành "đang hoạt động" với chủ đang bị khoá.**
  - Job hạn 30 ngày thiếu chủ không còn thấy nhóm.

Sửa lỗi, không thuộc đợt nào của TK 29. Người dùng giao tech lead chọn phương án theo tiêu chí chạy ổn với lượng lớn
người dùng (15/10/2026).

## What Changes

- **C7**: tin đổi nơi đăng hay danh mục thì lý do cũ rơi theo, trên mọi đường ghi tin chứ không chỉ đường sửa:
  - **Gửi nháp và gia hạn**: bỏ mọi lý do của nhóm và "danh mục bị tắt". Hai đường này đã kiểm lại nhóm (khoá, cấm,
    thành viên, người ngoài) và danh mục, nên lý do nào còn đúng thì lượt gửi đã bị từ chối.
  - **Lưu nháp** (không có bước kiểm đó): bỏ lý do của nhóm khi đổi nhóm, bỏ "danh mục bị tắt" khi đổi sang danh mục
    đang bật.
  - **Tin đã rời nhóm hẳn**: không rút về nháp, không lưu nháp được → 409 `LISTING_DETACHED`.
  - **Gia hạn kèm đổi nơi đăng khi tin còn việc chờ** → 409 `PLACEMENT_LOCKED`, như đường sửa.
- **C8**: lượt rời chỉ huỷ việc của tin mà lượt rời thật sự làm ẩn. Tin "nhóm công khai" ở lại làm tin người ngoài thì
  giữ việc, điều hành nhóm xét như thường.
- **C9**: hết thời gian chờ mà email được dùng lại thì tài khoản cũ được **ẩn danh**, không xoá:
  - bỏ email, tên, ảnh, mật khẩu, mã Google, số điện thoại, lớp thứ hai;
  - giữ dòng, dấu băm email và mọi lịch sử chống gian lận.

  Xoá thật là việc của `add-data-retention` (TK 25).

- **T13**: người dùng Google đã xoá tài khoản đăng nhập lại bằng Google:
  - trong thời gian chờ → 409 `EMAIL_PENDING_DELETION` kèm ngày;
  - sau đó → Google tạo tài khoản mới.
- **C10**: nhóm đang thiếu chủ thì không bắt đầu chuyển sang riêng tư được khi còn tin "nhóm công khai" → 409
  `GROUP_OWNER_REQUIRED`. Đổi chế độ áp ngay (không còn tin "nhóm công khai") vẫn làm được.

**Cố ý chưa làm**: C1, C2, C11 (hai change sau); các mục đợt 3, 4.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `listing/lifecycle`: "Mũi tên của người đăng" — rút về trừ tin đã rời nhóm hẳn.
- `listing/suspension`: "Danh mục bị tắt", "Đổi nơi đăng ra khỏi nhóm thì lý do của nhóm rơi theo" — thêm ca qua nháp,
  qua gia hạn.
- `listing/editing`: "Không đổi nơi đăng khi đang có việc chờ" (gia hạn), "Tin đã rời nhóm hẳn không sửa được" (rút
  về nháp).
- `group/membership`: "Rời, bị gỡ hay bị cấm thì việc máy giữ trong nhóm của người đó bị huỷ" — chỉ việc của tin bị
  ẩn.
- `group/group-roles`: "Việc hằng ngày trong lúc thiếu chủ" — ngoại lệ chuyển sang riêng tư.
- `identity/account-deletion`: "Email của tài khoản đã xoá…" — ẩn danh thay vì xoá; thêm "Người dùng Google đã xoá
  tài khoản".

## Impact

- **Code**:
  - `listing`: posting, `hide.calc`, đọc tin chờ duyệt trong nhóm;
  - `review`: bên nghe rời nhóm;
  - `identity`: giữ email, đăng nhập Google, repository;
  - `group`: cài đặt nhóm.
- **Migration**: một file SQL viết tay. Nới CHECK `accounts_credential_check` cho dòng đã xoá (dòng ẩn danh không còn
  mật khẩu hay mã Google). Không đổi cột, không mất dữ liệu.
- **App**: thêm hai lỗi app có thể gặp — 409 `LISTING_DETACHED` khi rút về nháp, 409 `EMAIL_PENDING_DELETION` khi
  đăng nhập Google.
