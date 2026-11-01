# Design

## Context

Lý do hạn chế của tin là mảng `restrictions` (`machine · new_account · strike · strike_wave`), mỗi lý do đặt và gỡ độc
lập. `new_account` được đặt ở một chỗ duy nhất — `restrictionsGoingLive` (`listing/system/system.service.ts`) khi tin lên
bảng ở nơi công khai mà người đăng T0 — và gỡ ở ba chỗ: `cascade.onTierRaised` (móc sự kiện mức tin cậy T0 → T1 trong
`listing.events.ts`), thu hẹp về "chỉ thành viên" (`edit.calc.dropNewAccount` → `posting.service`), và nhánh "nhóm
chuyển riêng tư" trong `cascade`. Máy duyệt có **tín hiệu** cùng tên (`screening.rules` `new_account`, trọng số 10) —
khác bản chất: tín hiệu cộng vào điểm rủi ro, lý do hạn chế áp vô điều kiện.

## Decisions

1. **Bỏ lý do, giữ tín hiệu.** Chủ dự án chốt "máy cho qua thì tin lên": thứ bị bỏ là hạn chế vô điều kiện theo mức,
   không phải khả năng máy cân nhắc tuổi tài khoản. Tín hiệu `new_account` của máy duyệt giữ nguyên trọng số, nhãn và
   con số `screening.newAccountDays`; luật ở bàn vận hành không đổi.
2. **Giữ giá trị enum `new_account` ở DB lẫn schema response, chỉ bỏ chỗ ghi.** Postgres không xoá được giá trị
   enum; Prisma vẫn sinh kiểu có `new_account`, nên `LISTING_RESTRICTIONS` (schema response) giữ giá trị để DTO gán
   thẳng `row.restrictions` không phải lọc ở mọi chỗ — migration bảo đảm không còn dòng nào mang nó. `RESTRICTION_ORDER`
   bỏ giá trị; `withRestriction(..., 'new_account', ...)` không còn gọi ở đâu. Comment trên enum và hằng ghi "đã bỏ
   28/10/2026 (remove-new-account-restriction)".
   Kéo theo: `trust.tierIn` / `repository.holdTier` (đọc mức trong transaction lên bảng, rà soát L7) chỉ tồn tại cho lý
   do này → bỏ; `ListingTrustPort.tierOf` giữ vì `app.ts` nối mức cho các module khác qua đó.
   Ma trận máy duyệt T0: dải Thấp `pass_full` ở mọi nơi đăng — `pass_limited` của T0 trước đây chỉ là cách báo cho
   `listing` gắn lý do, nay không còn nghĩa; dải Vừa vẫn giữ cho người.
3. **Migration dữ liệu một dòng** `UPDATE listings SET restrictions = array_remove(restrictions, 'new_account') WHERE
'new_account' = ANY(restrictions)` — chạy trong `prisma migrate deploy` lúc deploy nên tin T0 đang hạn chế hiện đầy đủ
   ngay, không chờ job 00:30. Không phát sự kiện `listing.state.changed` (trạng thái không đổi) — bảng uy tín và Tin của
   tôi đọc `restrictions` trực tiếp nên tự đúng ở lần tải sau.
4. **Bỏ `onTierRaised` và móc mức lên trong `listing.events.ts`** thay vì để hàm rỗng: không còn việc gì cho `listing`
   làm khi mức đổi. `trust` vẫn phát sự kiện mức cho thông báo N-mức.
5. **`dropNewAccount` bỏ khỏi `edit.calc`**: thu hẹp về "chỉ thành viên" không còn đụng lý do nào — nhánh sửa tin bớt
   một trường hợp đặc biệt.
6. **Không đụng `promotion.minTier` (T1).** Gói đẩy tin vẫn từ T1 — lý do trong kế hoạch là "T0 không lên bảng tin nên
   mua vô nghĩa" không còn, nhưng T1 vẫn là ngưỡng hợp lý để Xu không rơi vào tài khoản vừa lập; muốn hạ thì sửa con
   số, không cần change.

## Risks

- Kẻ bị gậy lập email mới đăng được tin lên thẳng bảng tin trước khi ai báo cáo: chấp nhận có chủ ý. Bù: dấu thiết bị
  (tài khoản thứ 2+ trên máy có tài khoản bị khoá → máy giữ), hạn mức T0 (3 lượt gửi/giờ, 10 tin đang hiện, hội thoại
  10/ngày), hậu kiểm lấy mẫu 20% tin của T0–T1, tín hiệu `new_account` + `burst` + `held_many` cộng điểm.
- Test: ~20 file có fixture "tin của T0 mang `new_account`" — sửa kỳ vọng sang hiển thị đầy đủ; test nào chỉ tồn tại để
  chứng minh lý do này (lên T1 gỡ, thu hẹp gỡ) thì xoá.
