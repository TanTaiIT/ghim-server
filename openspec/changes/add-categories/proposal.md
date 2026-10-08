# Proposal

## Why

Mọi tin đăng thuộc một danh mục, và danh mục mang những cài đặt mà máy duyệt cần: trần giá (vượt trần thì
luôn giữ cho người), giá tham chiếu (nhận ra giá bất thường, đồ cho tặng đáng ngờ), mức rủi ro (mức cao chỉ
cộng điểm rủi ro), luôn duyệt tay (mọi tin giữ cho người, mọi mức tin cậy) và ai duyệt tin nhóm bị giữ (nhóm
hay sàn). Danh mục còn quyết định người đăng phải điền gì và người mua lọc theo gì, qua mẫu thông tin. TK 11 chốt: danh mục do master quản, bật tắt chứ không xoá; staff phụ trách soạn mẫu, master phát
hành; tên một mục không bao giờ đổi sau khi phát hành. Tin đăng còn cần khu vực hành chính sau sáp nhập để
ghi nơi bán và để người mua tìm đồ gần mình.

Đợt 1 theo TK 29 ("danh mục"). Không cam kết nào ở TK 27 nằm trọn trong change này; nó đáp ứng một phần
**33** (trần giá, giá tham chiếu, mức rủi ro master chỉnh được mà không phát hành lại phần mềm) và dựng nền
cho các cam kết của máy duyệt (TK 13: giá vượt trần, danh mục luôn duyệt tay; TK 14: danh mục rủi ro cao), của
hàng chờ (TK 12, 16: tin nhóm bị giữ do nhóm hay sàn duyệt) và của tin đăng (TK 19: tin giữ mẫu thông tin lúc
đăng; **17**: đổi thông tin theo mẫu thì qua máy lại).

## What Changes

- Danh mục: chỉ master tạo và sửa cài đặt (trần giá, giá tham chiếu, mức rủi ro thấp / vừa / cao, luôn duyệt tay
  bật / tắt, tin nhóm bị giữ do nhóm hay sàn duyệt — mặc định nhóm); ba cài đặt về giữ tin tách riêng, đổi cái
  này không đổi cái kia; kiểm giá trị cài đặt; bật, tắt, không xoá.
- Mẫu thông tin: staff phụ trách danh mục hoặc master soạn bản nháp; chỉ master phát hành; mỗi lần phát hành
  là một phiên bản mới, phiên bản cũ không đổi và đọc được theo số; tên mục không đổi, nhãn đổi được.
- Đọc công khai danh sách danh mục đang bật và mẫu hiện hành.
- Khu vực: 34 tỉnh, thành và 3.321 phường, xã sau sáp nhập; mỗi phường thuộc đúng một tỉnh; tìm được bằng tên
  cũ.

**Cố ý chưa làm trong change này** (làm ở change sau, đúng đợt có đủ phần phụ thuộc):

- Giá vượt trần là cổng cứng; danh mục luôn duyệt tay giữ mọi tin cho người ở mọi mức tin cậy; mức rủi ro cao
  cộng 20 điểm (dấu hiệu "danh mục rủi ro cao"); giá tham chiếu dùng cho dấu hiệu "giá bất thường" và "giá 0 ở
  danh mục giá trị cao"; máy suy ra sai danh mục → `add-screening`.
- Staff xử tin danh mục luôn duyệt tay trong 24 giờ; tin nhóm bị giữ đi điều hành viên hay staff danh mục theo
  cài đặt "ai duyệt", mỗi tin vẫn vào đúng một hàng chờ; người xử tin sàn chọn theo danh mục, không theo khu vực
  → `add-review-queues`.
- Tắt danh mục: tin trong danh mục tạm ẩn, không chiếm hạn mức, không mất ngày; không ai đăng mới; người đăng
  đổi tin sang danh mục khác và tin qua máy lại → `add-listings`.
- Tin giữ nguyên phiên bản mẫu lúc đăng; người đăng điền theo mẫu; người mua lọc theo mẫu và theo khu vực →
  `add-listings`.
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
  danh mục của `add-platform-roles` cần danh mục tồn tại — vòng phụ thuộc trong đợt 1 (xem câu hỏi mở của
  `add-platform-roles`).
- **Phải chọn trước khi làm**: nguồn dữ liệu khu vực hành chính sau sáp nhập kèm bảng đối chiếu tên cũ → đơn
  vị mới (34 tỉnh, thành; 3.321 phường, xã), và cách nạp, cập nhật khi có thay đổi hành chính.
- **Câu hỏi mở** — TK không nói, cần người dùng chốt trước khi viết design:
  - Danh mục có cấp cha / con không (vd Điện thoại › Phụ kiện)? Tên danh mục đổi được không?
  - Trần giá, giá tham chiếu, mức rủi ro, luôn duyệt tay có nằm trong bảng con số có phiên bản (cam kết 33: mỗi
    kết quả máy ghi lại bộ con số đã dùng), hay danh mục có phiên bản cài đặt riêng?
  - Trần giá có bắt buộc không (danh mục không có trần)? Giá tham chiếu có phải nhỏ hơn trần giá?
  - Trần giá, giá tham chiếu, mức rủi ro có công khai cho app không, hay chỉ bàn vận hành thấy (nguyên tắc 8:
    không dạy cách lách)?
  - Mẫu thông tin: kiểu mục (chữ, số, chọn một, chọn nhiều), mục bắt buộc; bản sau có bỏ được một mục không;
    tên đã dùng có được dùng lại cho mục khác không?
  - Đổi nhãn đi qua phiên bản mới thì tin đăng theo phiên bản cũ hiện nhãn cũ hay nhãn mới?
  - Nhiều staff cùng danh mục: một bản nháp chung hay mỗi người một bản? Master có từ chối bản nháp không?
  - Tìm khu vực có bỏ dấu, gõ sai chính tả được không? Danh mục ban đầu (TK 11 chỉ có ví dụ) do ai nhập?
  - TK 29 câu hỏi mở 1: danh mục luôn duyệt tay giữ 100% tin — đủ staff không, hay hạ về chỉ giữ tin của T0–T1?
  - Luôn duyệt tay mặc định bật hay tắt khi master tạo danh mục không nêu (TK 11 chỉ nêu mặc định cho "ai duyệt
    tin nhóm bị giữ")? Gợi ý: tắt.
  - Master đổi "ai duyệt tin nhóm bị giữ" khi danh mục đang có tin nhóm chờ duyệt: việc đang mở chuyển hàng chờ
    ngay, hay chỉ áp cho tin bị giữ sau đó?
