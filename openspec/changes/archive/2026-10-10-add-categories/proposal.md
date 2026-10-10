# Proposal

## Why

Mọi tin đăng thuộc một danh mục, và danh mục mang những cài đặt mà máy duyệt cần: trần giá (vượt trần thì
luôn giữ cho người), giá tham chiếu (nhận ra giá bất thường, đồ cho tặng đáng ngờ), mức rủi ro (mức cao chỉ
cộng điểm rủi ro), luôn duyệt tay (mọi tin giữ cho người, mọi mức tin cậy) và ai duyệt tin nhóm bị giữ (nhóm
hay sàn). Danh mục còn quyết định người đăng phải điền gì và người mua lọc theo gì, qua mẫu thông tin. TK 11 chốt: danh mục do master quản, bật tắt chứ không xoá; staff phụ trách soạn mẫu, master phát hành; tên một mục không bao giờ đổi sau khi phát hành. Tin đăng còn cần khu vực hành chính sau sáp nhập để
ghi nơi bán và để người mua tìm đồ gần mình.

Đợt 1 theo TK 29 ("danh mục"). Không cam kết nào ở TK 27 nằm trọn trong change này; nó đáp ứng một phần
**33** (trần giá, giá tham chiếu, mức rủi ro master chỉnh được mà không phát hành lại phần mềm) và dựng nền
cho các cam kết của máy duyệt (TK 13: giá vượt trần, danh mục luôn duyệt tay; TK 14: danh mục rủi ro cao), của
hàng chờ (TK 12, 16: tin nhóm bị giữ do nhóm hay sàn duyệt) và của tin đăng (TK 19: tin giữ mẫu thông tin lúc
đăng; **17**: đổi thông tin theo mẫu thì qua máy lại).

## What Changes

- Danh mục phẳng: chỉ master tạo và sửa cài đặt (trần giá và giá tham chiếu tuỳ chọn, mức rủi ro thấp / vừa /
  cao, luôn duyệt tay bật / tắt, tin nhóm bị giữ do nhóm hay sàn duyệt — mặc định nhóm); ba cài đặt về giữ tin
  tách riêng, đổi cái này không đổi cái kia; kiểm giá trị cài đặt; mỗi lần đổi là một phiên bản cài đặt mới;
  bật, tắt, không xoá; cài đặt cho máy duyệt không công khai.
- Mẫu thông tin: staff phụ trách danh mục hoặc master soạn một bản nháp chung; chỉ master phát hành hoặc bỏ
  nháp; mỗi lần phát hành là một phiên bản mới, phiên bản cũ không đổi và đọc được theo số; mục có tên, nhãn,
  kiểu, cờ bắt buộc; tên mục không đổi, nhãn đổi được, bản sau bỏ được mục.
- Đọc công khai danh sách danh mục đang bật và mẫu hiện hành.
- Khu vực: 34 tỉnh, thành và 3.321 phường, xã sau sáp nhập theo mã chính thức; mỗi phường thuộc đúng một tỉnh;
  tìm bỏ dấu và bằng tên cũ.

**Cố ý chưa làm trong change này** (làm ở change sau, đúng đợt có đủ phần phụ thuộc):

- Giá vượt trần là cổng cứng; danh mục luôn duyệt tay giữ mọi tin cho người ở mọi mức tin cậy; mức rủi ro cao
  cộng 20 điểm (dấu hiệu "danh mục rủi ro cao"); giá tham chiếu dùng cho dấu hiệu "giá bất thường" và "giá 0 ở
  danh mục giá trị cao"; máy suy ra sai danh mục; kết quả máy ghi phiên bản cài đặt danh mục đã dùng →
  `add-screening`.
- Staff xử tin danh mục luôn duyệt tay trong 24 giờ; tin nhóm bị giữ đi điều hành viên hay staff danh mục theo
  cài đặt "ai duyệt", mỗi tin vẫn vào đúng một hàng chờ; đổi "ai duyệt" chỉ áp cho tin bị giữ sau đó; người xử
  tin sàn chọn theo danh mục, không theo khu vực → `add-review-queues`.
- Tắt danh mục: tin trong danh mục tạm ẩn, không chiếm hạn mức, không mất ngày; không ai đăng mới; người đăng
  đổi tin sang danh mục khác và tin qua máy lại → `add-listings`.
- Tin giữ nguyên phiên bản mẫu lúc đăng (hiện nhãn của phiên bản đó); người đăng điền theo mẫu; người mua lọc
  theo mẫu và theo khu vực → `add-listings`.
- Tin sàn chung bắt buộc có tỉnh và phường; giá là số nguyên từ 0 trở lên, 0 là cho tặng, app hiện "Miễn phí"
  → `add-listings` (`listing/placement`).
- Quyền staff theo danh mục — đã có ở `platform/staff-permissions` (`add-platform-roles`).

## Capabilities

### New Capabilities

- `category/category-catalog`: danh mục, cài đặt cho máy duyệt, bật tắt không xoá, mẫu thông tin có phiên bản
  (soạn, phát hành, tên mục không đổi), đọc công khai.
- `category/regions`: danh sách tỉnh, thành và phường, xã sau sáp nhập, tìm bằng tên cũ.

### Modified Capabilities

Không có.

## Impact

- Module `category` (mới). Bàn vận hành dùng quản lý danh mục và mẫu; app đọc danh mục, mẫu, khu vực.
- Phụ thuộc `add-platform-roles`: ai là master, staff nào phụ trách danh mục nào. Ngược lại, quyền staff theo
  danh mục của `add-platform-roles` cần danh mục tồn tại — hai change làm chung một lượt apply, archive
  `add-platform-roles` trước rồi `add-categories`.
- **Nguồn dữ liệu khu vực đã chọn** (10/10/2026): mã và tên lấy từ `provinces.open-api.vn/api/v2` (34 tỉnh,
  3.321 phường, mã số chính thức, tên khớp 100% bảng `vnProvince.ts` / `vnWard.ts` của hệ thống cũ ở
  `docs/market`); tên cũ và tên gọi tắt cấp tỉnh lấy từ `vnProvince.ts` (`formerNames`, `aliases`, do người
  biên soạn tay). Gộp thành một file dữ liệu trong repo bằng script sinh; cập nhật địa giới = chạy lại script.
  **Khoảng trống**: tên cũ cấp phường chưa có nguồn — cột có sẵn, bổ sung dần; scenario "tên cũ chia cho nhiều
  phường mới" kiểm bằng dữ liệu dựng trong test cho tới khi có dữ liệu thật.
- **Câu hỏi mở đã chốt** (10/10/2026, người dùng chốt phần in đậm, phần còn lại uỷ quyền cho agent và ghi ở TK
  11):
  - **Danh mục không có cấp cha / con**; tên danh mục đổi được, mã không đổi.
  - Trần giá, giá tham chiếu, mức rủi ro, luôn duyệt tay nằm trong phiên bản cài đặt của từng danh mục, không
    trong bảng con số chung; kết quả máy ghi `(danh mục, phiên bản cài đặt)` đã dùng.
  - Trần giá và giá tham chiếu tuỳ chọn; đặt cả hai thì giá tham chiếu không vượt trần.
  - Cài đặt cho máy duyệt không công khai (nguyên tắc 8): app chỉ thấy tên và mẫu.
  - Mục của mẫu: kiểu chữ / số / chọn một / chọn nhiều, cờ bắt buộc, chọn thì phải có lựa chọn; bản sau bỏ được
    mục; tên đã phát hành không dùng lại cho mục kiểu khác.
  - Tin theo phiên bản cũ hiện nhãn của phiên bản đó (tin giữ phiên bản lúc đăng).
  - Một bản nháp chung mỗi danh mục; mọi staff phụ trách và master cùng sửa với khoá lạc quan theo số bản nháp;
    master phát hành hoặc bỏ nháp (bỏ là từ chối).
  - Tìm khu vực bỏ dấu, không phân biệt hoa thường, không sửa chính tả. Danh mục ban đầu do master nhập qua bàn
    vận hành, không có sẵn.
  - TK 29 câu hỏi mở 1 giữ nguyên 100% cho tới khi chạy thật; luôn duyệt tay mặc định tắt; mức rủi ro mặc định
    thấp.
  - Đổi "ai duyệt tin nhóm bị giữ" chỉ áp cho tin bị giữ sau đó — ghi vào `add-review-queues`.
