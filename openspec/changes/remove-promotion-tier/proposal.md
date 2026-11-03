# Proposal

## Why

Gói đẩy tin trả Xu (add-promotions, TK 19) có mức tin cậy tối thiểu cho từng gói, bộ khởi đầu đặt T1 (con số
`promotion.minTier`). Lên T1 cần 7 ngày tuổi và một tin sạch, nên người đăng mới xin được Xu từ Hỗ trợ Ghim rồi vẫn nhận
"Cần mức T1 để dùng gói này" cả tuần. Chủ dự án chốt 03/11/2026: yêu cầu mức gây khó cho người dùng — **bỏ hẳn mức tối
thiểu của gói**, cùng tinh thần với `remove-new-account-restriction` và `remove-role-trust-tier`.

Lớp bảo vệ còn lại vẫn đủ: Xu không mua bằng tiền mà do master cấp tay; tin phải đang hiển thị đầy đủ (máy hay người đã
cho qua); người đang tạm khoá đăng tin vì gậy không mua được; trần 3 lượt mỗi người mỗi ngày và thời gian chờ giữa hai lần
mua cùng gói cho một tin giữ nguyên.

## What Changes

- **Bỏ điều kiện mức khi mua**: `purchaseBlock` không còn lý do `TRUST_TIER_TOO_LOW`; route mua gói không trả mã đó nữa.
  Danh sách gói của người đăng không còn câu "Cần mức T1".
- **Bỏ trường `minTier` của gói**: khỏi bảng `promotion_products` (migration bỏ cột `min_tier`), khỏi DTO bàn vận hành và
  DTO người đăng, khỏi body tạo/sửa gói (body `.strict()` — client cũ gửi `minTier` nhận 400, app cập nhật cùng đợt).
- **Bỏ con số `promotion.minTier`** khỏi sổ đăng ký bảng con số.
- **Bảng con số tự bỏ khoá đã gỡ**: phiên bản hiện hành mang khoá không còn trong sổ đăng ký thì lúc khởi động hệ thống
  tạo phiên bản kế không có khoá đó (đối xứng với luật "thêm con số mới" đã có); master đổi con số cũng không mang khoá đã
  gỡ sang phiên bản mới. Không có tiền lệ gỡ khoá trước đây — đây là lần đầu.
- App: màn tạo gói bỏ ô chọn mức; danh sách gói bỏ nhãn mức; SDK sinh lại.
- TK phần 19 + bảng con số phần 28; `docs/KE-HOACH-GOI-DAY-TIN.md`.

**Cố ý không làm**: không đụng mức tin cậy ở chỗ khác (hạn mức đăng tin, hậu kiểm, ngưỡng báo cáo tạm ẩn) — chủ dự án chỉ
chốt cho gói đẩy tin.

## Capabilities

### Modified Capabilities

- `promotion/catalog`: "Master soạn gói" và "Bộ gói khởi đầu" bỏ mức tối thiểu (MODIFIED); "Người đăng thấy gói mua
  được" thay bằng "Người đăng thấy gói, không xét mức tin cậy" (REMOVED + ADDED — OpenSpec không cho MODIFIED bỏ scenario
  "Chưa đủ mức").
- `promotion/purchase`: "Chỉ tin đang hiển thị đầy đủ mua được gói" thay bằng "Tin hiển thị đầy đủ mua được gói, không
  xét mức tin cậy" (REMOVED + ADDED, cùng lý do); scenario T0 mua được.
- `platform/config-versions`: "Phiên bản cũ không đổi và tra lại được" thêm luật và scenario "Phần mềm gỡ một con số".

## Impact

- Server: `promotion/calc/purchase.calc.ts`, `calc/catalog.calc.ts` (bỏ `tierAt`), `promotion.schema.ts`,
  `promotion.service.ts`, `promotion.repository.ts`, `promotion.ports.ts` (bỏ `tierOf`), `promotion.routes.ts`,
  `common/config/config-keys.ts`, `platform/platform.service.ts` (`registryValues`), `prisma/schema.prisma` + migration
  `remove_promotion_tier`; tests `purchase.calc`, `promotion.http`, `promotion.db`, `platform.service`.
- App: `app/ops/promotions.tsx`, `app/ops/promotions/new.tsx`, `src/api/ops-admin.ts`, `src/api/promotion.ts` (+ test),
  `src/api/generated/**` (sinh lại bằng `npm run api:sync`).
- Dữ liệu trên Render: bảng con số đang mang `promotion.minTier` — lần khởi động đầu sau deploy tạo phiên bản mới bỏ khoá.
