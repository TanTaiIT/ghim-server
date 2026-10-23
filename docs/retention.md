# Hạn lưu và dọn dữ liệu — hướng dẫn cho bàn vận hành

> Change `add-data-retention` (đợt 7, TK 25, 26). Mọi con số dưới đây là **giá trị khởi đầu**, nằm trong bảng con số
> có phiên bản (nhóm "Hạn lưu", khoá `retention.*`; tài khoản đã xoá dùng `identity.deletedEmailHoldDays`, dữ liệu
> thiết bị dùng `device.dataRetentionDays`) — master chỉnh ở `/ops/config`, không cần deploy. Rà soát pháp lý (TK 29 còn
> mở số 2) có thể đổi mọi số.

## Lượt dọn

| Việc                     | Khi nào           | Làm                                                                                                               |
| ------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ops.retention`          | 03:45 hằng ngày   | mọi bước của bảng dưới, theo thứ tự; trần 10 phút, chạm trần thì ghi "mới làm được một phần" và xếp lượt làm tiếp |
| `ops.retention-continue` | ngay sau lượt dở  | làm tiếp từ bước đã dừng, không làm lại phần đã xong                                                              |
| `ops.purge-drafts`       | phút 20 mỗi 6 giờ | chỉ bước bản nháp (TK 26)                                                                                         |
| `outbox.purge-published` | 04:30 hằng ngày   | sự kiện outbox đã phát quá 30 ngày (tên giữ từ trước; sự kiện chưa phát không bao giờ bị xoá)                     |

Lượt dọn **không bao giờ** đặt tin thành hiển thị hay gỡ lý do tạm ẩn (TK 26 luật 3): chỉ `DELETE` và đặt `deleted_at`.

## Hạn lưu (TK 25)

Mốc "lần sửa cuối" là `updated_at` của tin — đặt / gỡ lý do tạm ẩn cũng chạm cột này, nên tin chỉ có thể được giữ **lâu
hơn**, không bao giờ bị xoá sớm. "Xoá hẳn" = xoá dòng tin (kéo theo lượt gửi, việc đã đóng, ứng viên mẫu) rồi ảnh của tin
qua `media` (dòng ảnh phát `media.images.deleted` để `screening` bỏ dấu ảnh, tệp xoá khỏi kho). Quyết định của người
duyệt, gậy, báo cáo không có khoá ngoại sang tin nên **còn nguyên**, chỉ mang mã tin.

| Dữ liệu                                                              | Giữ                                                                                                  | Rồi sao                                                                                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bản nháp                                                             | 7 ngày từ lần sửa cuối                                                                               | xoá hẳn kèm ảnh                                                                                                                                                                                 |
| Tin từ chối / gỡ vì sai sót; tin bị gỡ khỏi nhóm, nhóm sang riêng tư | 90 ngày từ lần sửa cuối                                                                              | xoá hẳn kèm ảnh                                                                                                                                                                                 |
| Tin từ chối / gỡ vì vi phạm                                          | gậy thường / nặng: tới lúc gậy đóng (hết hạn, huỷ, hạ) + 30 ngày; khoá vĩnh viễn: 2 năm từ ngày khoá | xoá hẳn kèm ảnh, **quyết định còn**                                                                                                                                                             |
| Tin người đăng tự xoá                                                | 30 ngày                                                                                              | xoá hẳn                                                                                                                                                                                         |
| Tin đã bán                                                           | 180 ngày (từ lần sửa cuối)                                                                           | xoá hẳn kèm ảnh                                                                                                                                                                                 |
| Tin hết hạn                                                          | 1 năm từ lúc hết hạn; **nhắc trước 7 ngày** (N48, nhóm "tin đăng của bạn", một lần mỗi hạn)          | xoá hẳn kèm ảnh; gia hạn sau khi nhắc thì thôi                                                                                                                                                  |
| Tin của nhóm đã đóng                                                 | 90 ngày từ lúc đóng                                                                                  | tin xoá mềm rồi xoá hẳn; thành viên, cấm, đơn, lời mời, danh sách lớp, lời giao chủ, thông báo nhóm xoá; **dòng nhóm giữ**                                                                      |
| Tài khoản đã xoá                                                     | 90 ngày                                                                                              | tin xoá mềm rồi xoá hẳn, ảnh đại diện xoá, hồ sơ giấy tờ xoá, hồ sơ ẩn danh (email, tên, mật khẩu…); **dòng tài khoản và dấu băm email giữ** (lịch sử chống gian lận); hội thoại theo hạn riêng |
| Dấu băm email kèm gậy                                                | 2 năm sau khi gậy đóng (cùng lúc ẩn danh hoá gậy)                                                    | bỏ khỏi gậy                                                                                                                                                                                     |
| Dấu băm email của khoá vĩnh viễn                                     | tới khi master gỡ khoá                                                                               | lượt kế tiếp sau gỡ: bỏ                                                                                                                                                                         |
| Dữ liệu thiết bị                                                     | 180 ngày                                                                                             | xoá lượt ghi dấu máy, đánh dấu đã gỡ; `ip` của phiên mở trước mốc = null (phiên vẫn dùng)                                                                                                       |
| Hội thoại                                                            | tới khi cả hai bên xoá (xoá tài khoản tính là đã xoá), hoặc 1 năm không ai hoạt động                 | xoá hẳn kèm tin nhắn                                                                                                                                                                            |
| Thông báo                                                            | 90 ngày từ lần cập nhật cuối                                                                         | xoá                                                                                                                                                                                             |
| Kết quả máy                                                          | 180 ngày                                                                                             | gộp vào `screening_run_stats` (tháng × phiên bản luật × phiên bản bảng con số × kết quả × nguyên nhân × dải × mã luật, dòng `*` = tổng) rồi xoá; dấu "ảnh chưa kiểm" cùng mốc xoá               |
| Gậy                                                                  | 2 năm sau khi đóng; khoá vĩnh viễn: **sau khi gỡ** (xem dưới)                                        | ẩn danh hoá                                                                                                                                                                                     |
| Quyết định, nhật ký thao tác                                         | mãi                                                                                                  | không lượt nào xoá; chỉ ẩn danh hoá phần dính gậy                                                                                                                                               |
| Sổ việc nền `job_runs`                                               | 90 ngày                                                                                              | xoá                                                                                                                                                                                             |

## Tạm giữ bằng chứng

Dữ liệu dính tới một **báo cáo**, **gậy** hay **khiếu nại** đang mở — hoặc đóng chưa quá 30 ngày (`retention.evidenceHoldDays`)
— không bị xoá hẳn dù hạn lưu đã qua hay các bên đã tự xoá. Mốc đóng: báo cáo = lúc người quyết; gậy = hết hạn, huỷ, hạ
(nghiêm trọng chờ master và khoá vĩnh viễn là **đang mở** tới khi gỡ); khiếu nại chờ = đang mở.

- **Tin** được giữ khi: có báo cáo về tin; có báo cáo **về người đăng** (giữ mọi tin và hội thoại của người đó); gậy
  của tin đang mở / mới đóng.
- **Hội thoại** được giữ khi: gửi kèm một báo cáo; báo cáo về tin của nó; báo cáo về một trong hai bên; gậy của tin của nó.
- **Hồ sơ tài khoản đã xoá** được giữ (không ẩn danh, không xoá ảnh đại diện) khi có báo cáo về người đó hay về tin của
  người đó; tin của họ vẫn xoá mềm ngay và xoá hẳn từng tin theo luật giữ của tin.

Tạm giữ chỉ chặn việc xoá hẳn: tin đã xoá vẫn 404 với người mua, hội thoại đã xoá không hiện lại ở phía đã xoá.

## Ẩn danh hoá gậy

Gậy đóng quá 2 năm (`retention.strikeAnonymizeYears`): `strikes.account_id` thành **mã giả** (UUID từ HMAC với khoá
`IDENTITY_HASH_KEY` — cùng người cùng mã, không dò ngược), `email_hashes` rỗng, lời khiếu nại xoá; quyết định về gậy đó
(`review_decisions`) và dòng nhật ký về gậy đó / khoá vì gậy đó (`audit_log`) cũng chỉ còn mã giả — một transaction, trigger
`audit_log_immutable` chỉ mở cho đúng hai cột `target_id`, `details` khi transaction đặt `ghim.anonymize = 'on'`.
Khoá vĩnh viễn **chưa gỡ thì chưa ẩn danh**: lượt xem lại 2 năm và lệnh gỡ khoá cần nối gậy ↔ tài khoản; dấu băm email
giữ để email còn bị chặn đăng ký. Gỡ khoá rồi thì lượt kế tiếp bỏ dấu băm và ẩn danh hoá.

## Bàn vận hành — `/api/v1/ops/jobs/runs` (master)

`GET /ops/jobs/runs?name=&limit=` — các lượt việc theo lịch gần nhất, mới trước: `name`, `status` (`done` · `partial` =
mới làm được một phần, lượt sau làm tiếp · `failed` = ném, pg-boss thử lại), `startedAt`, `finishedAt`, `summary` (số
dòng từng bước, `next` = bước lượt làm tiếp bắt đầu), `error`. Mọi việc **theo lịch** của mọi module vào sổ này
(`media.reconcile` chạm trần cũng ghi `partial`); việc theo sự kiện (kiểm ảnh, đẩy thông báo) không — lô nhỏ, hàng trăm
lượt mỗi giờ.
