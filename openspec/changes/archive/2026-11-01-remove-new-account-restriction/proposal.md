# Proposal

## Why

TK nguyên tắc 8 và cam kết 15 nói tài khoản T0 không có tin nào hiển thị đầy đủ ở nơi công khai: tin máy cho qua vẫn
mang lý do hạn chế "tài khoản mới" tới khi người đăng lên T1 (đủ 7 ngày tuổi + 1 tin sạch, mức tính lại mỗi ngày). Trên
thực tế người đăng mới nào cũng chờ **7–10 ngày** mới thấy tin mình trên bảng tin, và sàn mới mở thì bảng tin trống vì ai
cũng T0 — thấy rõ khi thử trên Render 28/10/2026 (bốn tin live, không tin nào lên bảng tin). Chủ dự án chốt 28/10/2026:
**máy cho qua thì tin lên**; T0 chỉ còn ý nghĩa hạn mức và hậu kiểm. Lớp chống tài khoản rác mất đi được bù bằng ba lớp
còn lại của TK phần 7 (dấu thiết bị, cảnh cáo theo email, chặn email dùng một lần) cùng hạn mức T0 (3 lượt gửi/giờ, 10
tin đang hiện) và lấy mẫu hậu kiểm 20% tin của T0–T1 (`postcheck.newAccountSamplePercent`), vốn đã có.

## What Changes

- **Bỏ lý do hạn chế "tài khoản mới"**: lên bảng không còn tính mức tin cậy của người đăng vào lý do hạn chế; chỉ còn
  "máy", "cảnh cáo", "làn sóng cảnh cáo". Lên T1 không còn gỡ gì trên tin; thu hẹp về "chỉ thành viên" không còn gỡ lý
  do này.
- **Gỡ lý do đang có**: một migration xoá `new_account` khỏi mọi tin đang mang nó — tin của T0 đang hiển thị hạn chế
  chuyển sang đầy đủ ngay lần deploy (không chờ job mức tin cậy). Giá trị enum giữ trong DB (Postgres không bỏ giá trị
  enum); code không ghi lại nữa.
- **Tín hiệu máy duyệt `new_account` giữ nguyên** (trọng số 10, "Tài khoản mới", `screening.newAccountDays`): nó cộng
  điểm rủi ro cùng các tín hiệu khác, khác với lý do hạn chế áp vô điều kiện.
- **Ma trận máy duyệt cho T0**: dải Thấp ra "hiện đầy đủ" ở mọi nơi đăng (trước: "hiện hạn chế" ở nơi công khai, chỉ để
  `listing` gắn lý do "tài khoản mới"); dải Vừa vẫn giữ cho người — T0 vẫn chặt hơn T1.
- Bảng uy tín, màn Tin của tôi, thông báo: không còn câu "hiển thị hạn chế vì tài khoản mới"; khi lên T1 không còn
  thông báo tin được mở (N-mức giữ câu về mức).
- TK: nguyên tắc 8 bỏ; cam kết 15 đổi thành "T0 chịu hạn mức thấp nhất và hậu kiểm dày hơn, không bị hạn chế hiển thị";
  phần 7 "bốn lớp" → ba lớp; bảng lý do hạn chế phần 15 bỏ dòng "Tài khoản mới".

**Cố ý không làm**: rút ngắn thời gian lên T1 hay cho master "xác nhận người bán" — đã cân nhắc 28/10/2026, chủ dự án
chọn bỏ hẳn hạn chế thay vì giữ nó với lối thoát.

## Capabilities

### Modified Capabilities

- `listing/visibility`: bỏ requirement "Lý do tài khoản mới"; requirement "Hạn chế khi còn ít nhất một lý do" chỉ còn
  "máy" và "cảnh cáo" làm ví dụ hai lý do độc lập.
- `listing/boosting`: scenario "Tin hiển thị hạn chế" đổi lý do sang "máy".
- `review/decisions`: "đạt" cho tin máy giữ của T0 → hiển thị đầy đủ; scenario T0 đổi theo.
- `trust/seller-dashboard`: scenario "Tin của tài khoản mới" / "Lên T1" đổi sang lý do "máy" / hậu kiểm cho đạt.
- `screening/risk-scoring`: "Ma trận cho mức T0" — dải Thấp hiện đầy đủ ở mọi nơi đăng.

## Impact

- Server: `listing/system/system.service.ts` (`restrictionsGoingLive` bỏ nhánh T0), `listing/system/cascade.service.ts`
  (bỏ `onTierRaised`, nhánh thu hẹp nhóm không đụng `new_account`), `listing/posting/edit.calc.ts` +
  `posting.service.ts` (bỏ `dropNewAccount`), `listing.events.ts` (bỏ móc mức lên), `listing.shared.ts` (thứ tự lý do),
  `cli/smoke-posting.ts`; migration dữ liệu; ~20 file test.
- App: không gọi API nào đổi; nhãn lý do `new_account` trong `src/api/ops.ts` giữ cho tín hiệu máy duyệt.
- Docs: TK (nguyên tắc 8, phần 7, phần 15, cam kết 15), `docs/screening.md`, `docs/KE-HOACH-GOI-DAY-TIN.md` (lý do chọn
  T1 cho gói — vẫn đúng vì gói cần mức, nhưng câu "T0 đang hạn chế" bỏ), `docs/VIEC-DANG-DO.md` (khói đăng tin), CLAUDE.md.
