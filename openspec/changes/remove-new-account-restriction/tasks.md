# Tasks

## 1. Server

- [x] 1.1 `listing/system/system.service.ts`: `restrictionsGoingLive` bỏ nhánh `new_account` (không đọc mức nữa — xem
      JSDoc "mũi tên lên bảng cần mức" và bỏ việc đọc mức trong transaction nếu không còn ai dùng)
- [x] 1.2 `listing/system/cascade.service.ts`: bỏ `onTierRaised`; nhánh nhóm chuyển riêng tư không đụng `new_account`;
      `listing.events.ts` bỏ móc mức T0 → T1; port/interface liên quan
- [x] 1.3 `listing/posting/edit.calc.ts` + `posting.service.ts`: bỏ `dropNewAccount`
- [x] 1.4 `listing.schema.ts` `LISTING_RESTRICTIONS`, `listing.shared.ts` `RESTRICTION_ORDER`: bỏ `new_account`; enum
      Prisma giữ giá trị kèm comment "đã bỏ 28/10/2026"
- [x] 1.5 Migration `remove_new_account_restriction`: `array_remove` trên mọi tin đang mang lý do
- [x] 1.6 `cli/smoke-posting.ts`: kỳ vọng tin A hiển thị đầy đủ
- [x] 1.8 `screening/calc/decide.calc.ts`: T0 dải Thấp → `pass_full` ở mọi nơi đăng (spec `screening/risk-scoring`);
      `docs/screening.md` bảng kết quả; trust `tierIn`/`holdTier` không còn ai gọi → bỏ
- [x] 1.7 Tests: `visibility.calc`, `listing-visibility.http`, `listing-lifecycle.http`, `edit.calc`,
      `review-decisions.http`, `trust-tiers.http`, `trust-dashboard.http`, `strike-effects.http`, `admin-boost.http`,
      `boost.calc`, `screening-decision.http`, `retention-*`, `listing.repository.db` — sửa kỳ vọng, xoá test chỉ
      chứng minh lý do đã bỏ; `signals.calc`/`score.calc`/`screening-rules` giữ (tín hiệu máy)

## 2. Docs

- [x] 2.1 TK: nguyên tắc 8 (bỏ, đánh số lại hay ghi "bỏ 28/10/2026"), phần 7 "bốn lớp" → ba, bảng lý do hạn chế phần 15
      bỏ dòng "Tài khoản mới", cam kết 15 viết lại, ghi chú "vì sao có mức hạn chế" sửa câu về tài khoản mới hàng loạt
- [x] 2.2 `docs/screening.md` bảng trạng thái; `docs/KE-HOACH-GOI-DAY-TIN.md` câu "T0 đang hạn chế"; `docs/VIEC-DANG-DO.md`
      mục khói đăng tin; CLAUDE.md thứ tự change
- [x] 2.3 Spec delta của change này

## 3. App

- [x] 3.1 Không đổi API (đã rà: app không có câu nào về "tài khoản mới" ngoài nhãn tín hiệu máy duyệt). Kiểm nhãn/câu nào trong app nói "hạn chế vì tài khoản mới" (Tin của tôi, bảng uy tín) — hiện
      app đọc lý do từ server nên chỉ cần test snapshot nếu có

## 4. Kiểm tra

- [x] 4.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift`, `pnpm run spec:validate`
- [ ] 4.2 Deploy Render: migration gỡ lý do trên tin đang có; máy ảo trỏ Render thấy tin của Người thử 10 trên home
