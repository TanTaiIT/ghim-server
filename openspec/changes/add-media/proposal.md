# Proposal

## Why

Tin đăng cần ảnh ngay từ lúc soạn: TK 3 định nghĩa "Ảnh chọn trong lúc soạn thuộc về nháp", TK 12 bước 1 là
"Tạo nháp, tối đa 6 ảnh". TK 25 (mục "Ảnh") chốt cách giữ ảnh: chỉ nhận ảnh nằm trong kho của hệ thống — ảnh
để ở nơi người đăng kiểm soát thì họ đổi được ruột ảnh sau khi tin đã qua duyệt, và mỗi lượt xem là một lượt
máy chủ của họ biết ai đang xem. Ảnh có chủ ngay từ lúc chọn, mang nhãn "chưa xác nhận" tới khi chủ lưu thành
công, và được dọn để kho không đầy ảnh mồ côi.

**Đợt 2**, dù TK 29 xếp "Máy duyệt, kể cả kiểm ảnh" ở đợt 3: tin đăng của đợt 2 (`add-listings`) đã cần ảnh
trong nháp, nên phần tải và giữ ảnh phải có trước. Chỉ phần **kiểm** ảnh (trùng xuyên tài khoản, nhạy cảm,
danh sách trắng ảnh mẫu) nằm ở đợt 3, trong `add-screening`.

Cam kết ở TK 27 mà change này đáp ứng: một phần **30** (mọi ảnh hoặc có chủ, hoặc đang nằm trong diện dọn;
phần "mỗi tin tối đa 6 ảnh" do `add-listings`). Change này cũng là nền để cam kết **4** kiểm chứng được: kết
quả kiểm ảnh chỉ còn đúng khi ruột ảnh không đổi được sau khi kiểm.

## What Changes

- Người dùng xin tải ảnh cho một chủ của mình (tin, kể cả tin còn là nháp, hoặc hồ sơ) và tải thẳng vào kho
  của hệ thống; ảnh thuộc chủ đó ngay từ lúc tải.
- Ảnh đã tải không bị ghi đè; đổi ảnh là tải ảnh mới.
- Lưu nháp, tin hay hồ sơ chỉ nhận ảnh trong kho, do chính người lưu tải lên; ngoại lệ duy nhất là ảnh đại
  diện lấy từ tài khoản Google.
- Nhãn "chưa xác nhận" từ lúc tải, gỡ khi chủ lưu thành công.
- Dọn ảnh: ảnh còn nhãn quá 48 giờ; ảnh theo chủ khi chủ bị xoá hẳn; đối chiếu cả kho mỗi tháng để vét ảnh
  lọt lưới.

**Cố ý chưa làm trong change này** (làm ở change sau, đúng đợt có đủ phần phụ thuộc):

- Thu nhỏ, nén ảnh trước khi tải; ảnh gốc không rời điện thoại — việc của app, không phải hành vi backend.
- Tối đa 6 ảnh mỗi tin, ảnh đầu là ảnh bìa → `add-listings` (`listing/drafts`). Đổi ảnh hay đổi thứ tự ảnh
  thì tin qua máy lại → `add-listings` (`listing/editing`).
- Kiểm ảnh trùng với kho của mọi tài khoản, kiểm nội dung nhạy cảm, danh sách trắng ảnh mẫu của hãng, ảnh
  quá 5 phút chưa có kết quả thì giữ cho người → `add-screening` (`screening/image-checks`). Ảnh đại diện qua
  kiểm ảnh → `add-screening` (thêm vào `identity/profile`).
- Hạn lưu nháp và từng loại tin ("xoá hẳn kèm ảnh"), tài khoản đã xoá → `add-data-retention`
  (`ops/data-retention`). Ảnh dính báo cáo, gậy, khiếu nại đang mở không bị xoá hẳn → `add-data-retention`
  (`ops/evidence-hold`). Ba luật chung cho việc chạy nền — kể cả "lượt dọn ảnh chạy lâu không làm chậm việc
  đưa tin lên bảng" → `add-data-retention` (`ops/background-jobs`).

## Capabilities

### New Capabilities

- `media/image-storage`: xin tải và tải thẳng vào kho, ảnh có chủ từ lúc tải, không ghi đè, chỉ nhận ảnh
  trong kho (trừ ảnh đại diện Google), nhãn "chưa xác nhận".
- `media/image-cleanup`: xoá ảnh chưa xác nhận quá 48 giờ, dọn ảnh theo chủ, đối chiếu kho hằng tháng.

### Modified Capabilities

Không có.

## Impact

- Module `media` (mới). Bảng module trong CLAUDE.md đang ghi `media` ở đợt 3 — sửa thành đợt 2 trong cùng
  nhóm task làm ra module.
- Phụ thuộc `add-identity` (người dùng đăng nhập, hồ sơ, đăng nhập Google). Nháp là của `add-listings` — cùng
  đợt 2, archive sau change này; `add-listings` gắn ảnh vào nháp theo luật ở đây.
- **Phải chọn trước khi làm** (CLAUDE.md: hỏi trước khi thêm package / dịch vụ): kho ảnh và cách cấp quyền tải
  thẳng theo người; cơ chế việc chạy nền theo lịch (lượt dọn mỗi 6 giờ, đối chiếu mỗi tháng).
- **Câu hỏi mở** — TK không nói, cần người dùng chốt trước khi viết design:
  - Định dạng ảnh được nhận, dung lượng tối đa mỗi ảnh, hạn dùng của một quyền tải lên, số lượt xin tải tối
    đa — TK không có con số nào.
  - 48 giờ, lượt dọn 6 giờ (TK 26) và đối chiếu hằng tháng không có trong bảng con số TK 28, trong khi cam kết
    33 nói mọi con số master chỉnh được. Có đưa vào bảng con số có phiên bản không?
  - Ảnh trong kho có mở được bằng đường link trực tiếp trước khi tin hiện không. TK 13: "không có khoảng trống
    nào để ảnh xấu hiện công khai". Gợi ý: ảnh của nháp và tin chưa hiện chỉ người tải lên và người duyệt mở
    được.
  - Một ảnh đã tải cho nháp này có dùng lại được ở nháp khác không — TK chỉ nói ảnh "thuộc về bản nháp". Gợi
    ý: không; app tải lại ảnh (ảnh vẫn còn trên máy).
  - Tin được chuyển lên sàn chung "như một tin mới" khi nhóm đóng hay chuyển sang riêng tư (TK 9, TK 10): ảnh
    của tin cũ đi theo tin mới thế nào, khi ảnh thuộc về tin cũ.
  - Lượt đối chiếu thấy một tin trỏ tới ảnh không còn trong kho thì làm gì (TK 26 chỉ nói "vét ảnh lọt
    lưới").
