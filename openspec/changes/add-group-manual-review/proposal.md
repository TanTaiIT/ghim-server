# Proposal

## Why

Khách hàng muốn một công tắc để tin của nhóm hoặc qua máy duyệt tự động như hiện nay, hoặc bắt buộc người duyệt. Người
dùng chốt ngày 26/10/2026:

1. Chỉ thêm công tắc cho **nhóm**; sàn chung giữ nguyên như hiện tại.
2. Công tắc chỉ áp cho **tin gửi mới và tin gửi lại**; sửa tin đang hiện vẫn chỉ qua máy (máy vẫn chấm bản sửa như nay).
3. Đây là cài đặt của nhóm nên áp cho **mọi tài khoản**, kể cả mức tin cậy cao — người đăng chờ quản trị nhóm duyệt.
4. Tắt công tắc thì tin **đang chờ vẫn giữ nguyên** cho người duyệt.

Câu hỏi chốt cùng ngày: **chủ nhóm** bật/tắt trong cài đặt nhóm; người duyệt **theo chuỗi duyệt của nhóm** đang có (điều
hành đơn vị → điều hành cả nhóm → chủ nhóm, người đăng bị loại, hết người thì staff danh mục → master); danh mục đặt "tin
nhóm bị giữ do sàn duyệt" thì tin giữ vì công tắc **vẫn về quản trị nhóm** — lần giữ của chính máy (điểm, cổng cứng, lỗi…)
vẫn theo cài đặt danh mục như nay.

Không thuộc đợt nào của TK 29. Không đụng cam kết nào ở TK 27: máy vẫn không từ chối ai, không phạt ai (cam kết 5).

## What Changes

- Nhóm có cài đặt `manualReview` (mặc định tắt): `PATCH /api/v1/groups/:id/settings` nhận `manualReview`, chỉ chủ nhóm (và
  master như mọi cài đặt khác); hồ sơ nhóm trả `manualReview` cho mọi người xem được hồ sơ đầy đủ.
- Lượt gửi `submit` và `resubmit` từ trạng thái khác "đang hiển thị" vào nhóm bật công tắc: máy vẫn chấm đủ như mọi lượt,
  kết luận cho qua (đầy đủ hay hạn chế) thì đổi thành **giữ cho người** với lý do mới `group_manual`. Lý do giữ của chính
  máy ghi nguyên. Gia hạn, sửa tin đang hiện, chuyển lên sàn chung không đổi.
- Câu báo cho người đăng: "Nhóm duyệt mọi tin trước khi hiện — tin đang chờ quản trị nhóm, thường trong N giờ"; không bao
  giờ là câu chung ba phần (máy đã cho qua, luật gian lận trúng nhẹ không lộ ra).
- Việc hàng 0 ghi cờ `groupManual` (đọc lại từ lượt máy mỗi lần thêm lý do máy giữ) → luôn đi chuỗi của nhóm. DTO việc
  có `groupManual`; cho đạt việc đó không cần "máy đúng" / "máy quá tay", nhật ký không ghi nhận định và luật trúng nhẹ (để
  tỉ lệ "máy quá tay" theo luật không bị lệch).
- `group_manual` không tính vào "bị giữ nhiều", không tính dò cổng cứng.

**Cố ý không làm**: công tắc cho sàn chung hay theo danh mục; duyệt tay cả bản sửa tin đang hiện; thả tin đang chờ khi tắt
công tắc; tách hạn xử riêng cho việc vì công tắc (dùng hạn hàng 0).

## Capabilities

### New Capabilities

- `group/manual-review`: công tắc duyệt tay mọi tin của nhóm — ai bật, lượt gửi nào chịu, máy kết luận thế nào, ai duyệt.

### Modified Capabilities

- `review/queues`: việc hàng 0 giữ vì công tắc của nhóm luôn vào chuỗi của nhóm.
- `review/decisions`: cho đạt việc giữ vì công tắc không cần nhận định về máy.
- `screening/explanations`: tin giữ vì công tắc có câu chờ riêng.

## Impact

- **Code**: `group` (cài đặt, hồ sơ), `listing` (lượt gửi đọc công tắc, truyền `groupManual` sang `screening`), `screening`
  (kết luận, câu báo, enum), `review` (cờ trên việc, định tuyến, quyết định, DTO).
- **API**: thân cài đặt nhóm thêm `manualReview`; hồ sơ nhóm và việc duyệt thêm `manualReview` / `groupManual`; enum
  `cause` của lượt máy thêm `group_manual`. Không breaking.
- **Migration**: hai file — thêm giá trị enum `screening_cause` riêng một file; cột `groups.manual_review`,
  `review_tasks.group_manual` (mặc định `false`). Không mất dữ liệu.
- **Tài liệu**: TK 9 (cài đặt nhóm), TK 13 (máy duyệt), TK 16, 17 (ai duyệt, nhận định về máy); CLAUDE.md thứ tự change.
