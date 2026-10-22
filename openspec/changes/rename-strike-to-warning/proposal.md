# Proposal

## Why

Thử các thông báo của `add-trust-notices` trên app ngày 22/10/2026, người dùng thấy chữ **"gậy"** lạ lẫm: người mới
không đoán được "nhận một gậy" là bị ghi vi phạm, có hạn, khiếu nại được. TK 4 nguyên tắc 4 ("người dùng biết vì
sao") và nguyên tắc 8 ("luôn biết mình đang ở đâu") chỉ giữ được khi người dùng hiểu chữ đó. Người dùng chốt cùng ngày:
gọi là **"cảnh cáo"** — cách YouTube, Facebook bản tiếng Việt gọi lỗi vi phạm, người dùng đã quen — và đổi ở **mọi chữ
hiển thị** (người dùng, bàn vận hành của staff / master) **cùng TK**, để staff nói chuyện với người dùng không phải dịch
qua lại.

Đợt: sửa chữ cho đợt 5–6 (gậy, thông báo), không đổi luật nào.

## What Changes

- Chữ người dùng và bàn vận hành đọc đổi theo một bảng đối chiếu (design mục 1): gậy → cảnh cáo, gậy nặng → cảnh cáo
  nặng, gậy nghiêm trọng → vi phạm nghiêm trọng, điểm gậy → điểm vi phạm, ra gậy → ghi cảnh cáo, huỷ gậy → xoá cảnh
  cáo, nhóm thông báo "mức tin cậy và gậy" → "mức tin cậy và cảnh cáo".
- Câu lỗi của server (xoá tài khoản bị chặn, tạm mất vai trong nhóm, tạm khoá đăng tin, khiếu nại, tin là hồ sơ vi
  phạm…), câu thông báo N49–N58 và nhãn trên bàn vận hành trong `ghim-app`.
- Thông báo nhận cảnh cáo (N49) nói thêm một câu cho người mới: đủ bao nhiêu điểm vi phạm thì tạm dừng đăng tin mới.
- TK đổi chữ trong toàn bộ văn bản, phần 21 thành "Cảnh cáo", phần 22 "Khiếu nại, ân xá, vi phạm nghiêm trọng"; từ
  điển TK thêm dòng "Cảnh cáo — trong spec và code gọi là gậy / `strike`". PDF sinh lại.
- App: mục Trợ giúp thêm bài "Cảnh cáo là gì?".

**Cố ý không đổi**: tên trong code (`strike`, `STRIKE_*`, mã lỗi như `STRIKE_NOT_PENDING`), tên bảng, sự kiện
(`trust.strike.*`), `type` của thông báo (`trust.strike.issued`…) — app đã dựa vào chúng; spec giữ "gậy" làm thuật ngữ
kỹ thuật như code, trừ câu trích nguyên văn người dùng đọc; tài liệu cho lập trình viên (`docs/*.md`, Swagger) giữ thuật
ngữ kỹ thuật kèm ghi chú chữ hiển thị.

## Capabilities

### New Capabilities

(không có)

### Modified Capabilities

- `identity/account-deletion`: lý do của 409 `ACCOUNT_DELETE_BLOCKED` khi đang có cảnh cáo nặng đổi chữ.

Câu thông báo N49–N58 nằm trong delta `notification/trust-notices` của change `add-trust-notices` (chưa archive) — sửa
thẳng ở đó trong cùng lượt.

## Impact

- `ghim-server`: chuỗi trong `group`, `identity`, `listing`, `platform`, `review`, `screening`, `trust`, `notification`;
  test kiểm câu chữ. Không đổi API, mã lỗi, `type`, bảng, sự kiện.
- `ghim-app`: nhãn bàn vận hành (`app/ops/**`), bài Trợ giúp.
- TK (+ PDF), CLAUDE.md (ghi chú thuật ngữ), `docs/strikes.md`, `docs/realtime.md`.
- Không migration.
