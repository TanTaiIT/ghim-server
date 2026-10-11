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
- Ảnh đại diện: đặt, đổi, bỏ bằng ảnh trong kho hay ảnh Google; tài khoản tạo bằng Google mặc định dùng ảnh Google.
  Hồ sơ là chủ ảnh đầu tiên chạy thật; tin nối vào ở `add-listings` qua cùng cổng (design mục 3).

**Cố ý chưa làm trong change này** (làm ở change sau, đúng đợt có đủ phần phụ thuộc):

- Thu nhỏ, nén ảnh trước khi tải; ảnh gốc không rời điện thoại — việc của app, không phải hành vi backend.
- Tối đa 6 ảnh mỗi tin, ảnh đầu là ảnh bìa → `add-listings` (`listing/drafts`). Đổi ảnh hay đổi thứ tự ảnh
  thì tin qua máy lại → `add-listings` (`listing/editing`).
- Kiểm ảnh trùng với kho của mọi tài khoản, kiểm nội dung nhạy cảm, danh sách trắng ảnh mẫu của hãng, ảnh
  quá 5 phút chưa có kết quả thì giữ cho người → `add-screening` (`screening/image-checks`). Ảnh đại diện qua
  kiểm ảnh → `add-screening` (thêm vào `identity/profile`).
- Luật ảnh riêng của nháp và tin — xin tải cho nháp, lưu nháp chỉ nhận ảnh của chính nháp, ảnh Google không dùng
  cho tin, xoá hẳn nháp kéo ảnh, ảnh bỏ khỏi nháp → `add-listings` (`listing/drafts`, `listing/deletion`); chuyển
  sang ngày 11/10/2026 để change này archive được với test của chính nó (design mục 3).
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

- `identity/profile`: thêm requirement "Ảnh đại diện" (đặt, đổi, bỏ; ảnh Google; hồ sơ công khai hiện ảnh bằng
  đường xem có hạn).

## Impact

- Module `media` (mới), đợt 2 — bảng module trong CLAUDE.md đã ghi đúng đợt.
- Phụ thuộc `add-identity` (người dùng đăng nhập, hồ sơ, đăng nhập Google). Nháp là của `add-listings` — cùng
  đợt 2, archive sau change này; `add-listings` gắn ảnh vào nháp theo luật ở đây.
- Kho ảnh chuẩn S3 (chốt 11/10/2026): Cloudflare R2 ở production, RustFS trong container cho dev và test; gói
  `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`; một biến `STORAGE_URL`. Việc theo lịch chạy trên pg-boss
  đã có.
- Sửa TK đi kèm: TK 25 (định dạng, dung lượng, kho riêng tư, ảnh không dùng lại giữa các chủ), TK 28 (nhóm con số
  "Ảnh"), TK 30 (chủ ảnh gọi Ảnh xác nhận ảnh trong cùng giao dịch lưu — lời gọi đồng bộ thứ tư).
- Câu hỏi mở của bản proposal đầu đã chốt ngày 11/10/2026 — xem design mục 2 và bảng "Đã chốt".
