# Proposal

## Why

TK phần 5 đòi người nhận vai chủ nhóm hay điều hành viên ở mức T1 trở lên (đủ 7 ngày tuổi + 1 tin sạch). Trên thực tế
master giao chủ cho một nhóm mới lập thường giao cho người vừa đăng ký — người đại diện trường, công ty — và họ bấm
đồng ý thì nhận 409 `TRUST_TIER_TOO_LOW`, nhóm kẹt ở "chờ giao chủ" cả tuần. Chủ dự án chốt 03/11/2026: **có người giao
thì nhận được**, áp cho cả ba đường nhận vai. Người giao (master, chủ nhóm) đã là người chọn và chịu trách nhiệm cho lựa
chọn đó; lớp bảo vệ còn lại vẫn đủ: tài khoản bị khoá, đã xoá, đang bị cấm hay có gậy nặng vẫn không nhận được vai
(`requireEligible`, requirement "Gậy nặng làm tạm mất vai trong nhóm").

## What Changes

- **Bỏ kiểm mức khi nhận vai**: bấm đồng ý lời giao chủ của master, bấm đồng ý lời chuyển nhượng của chủ cũ, và được bổ
  nhiệm điều hành viên không còn hỏi mức tin cậy. Mã lỗi `TRUST_TIER_TOO_LOW` không còn trả từ các route của nhóm (vẫn
  dùng cho mua gói đẩy tin, không đổi).
- **Bỏ requirement "Tụt mức không làm mất vai đang giữ"**: không còn mức nào xét lúc nhận thì câu "tụt mức không bãi
  vai" không còn gì để nói — vai chỉ mất theo các đường đã có (khoá, gậy nặng, xoá tài khoản).
- `GroupTrustPort` bỏ `tierOf`; `app.ts` thôi nối mức cho module nhóm.
- TK phần 5: câu "Giữ vai cần mức T1 trở lên và không có cảnh cáo nặng" bỏ vế mức.

**Cố ý không làm**: không đổi hạn mức T0 (tin sống, lượt gửi) cho chủ nhóm — vai không cộng hạn mức, như trước.

## Capabilities

### Modified Capabilities

- `group/group-roles`: requirement "Nhận vai chủ nhóm hay điều hành viên cần mức T1 trở lên" thay bằng "Nhận vai không
  xét mức tin cậy"; bỏ "Tụt mức không làm mất vai đang giữ".

## Impact

- Server: `group/group.shared.ts` (bỏ `requireTrustedForRole`, `GroupTrustPort.tierOf`), `group/group.admin.service.ts`
  (hai chỗ gọi), `app.ts` (nối port); tests `trust-roles.http.test.ts` (viết lại: T0 nhận được cả ba vai),
  `group-roles.http.test.ts` (bỏ `seedTier` chỉ có để qua luật mức).
- App: không đổi API; không có câu nào về mức khi nhận vai. `src/api/generated` sinh lại không đổi gì (mã lỗi không nằm
  trong schema).
- Docs: TK phần 5.
