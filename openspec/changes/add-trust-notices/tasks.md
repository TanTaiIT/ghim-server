# Tasks

**Đã duyệt 22/10/2026** — người dùng duyệt design và tasks sau khi chốt sáu câu hỏi mở (proposal, mục "Đã chốt").

## 1. `trust`: kết quả khiếu nại và gậy kế thừa thành sự kiện

- [x] 1.1 `trust.appeal.decided { appealId, strikeId, accountId, verdict }` trong `decideAppeal` cho cả `won` lẫn `lost`,
      cùng transaction với lượt ghi khiếu nại; `strike.cancelled { cause: 'appeal' }` giữ nguyên; xác minh test HTTP: staff
      bác khiếu nại → một sự kiện `lost`; staff chấp nhận → `won` kèm `strike.cancelled`; lượt tự thắng của lịch `review`
      sau 7 ngày (đồng hồ giả) → `won`; khiếu nại đã có kết quả trả 409 `APPEAL_DECIDED` và không thêm sự kiện
- [x] 1.2 `trust.strike.inherited { accountId, strikeIds }` một lần trong transaction kế thừa của `onAccountCreated`, cạnh
      các `strike.issued { inherited: true }` giữ nguyên; không phát khi không kế thừa gậy nào; xác minh test HTTP: đăng ký
      lại bằng email còn hai gậy hiệu lực → đúng một sự kiện mang hai mã; email không còn gậy hiệu lực → không sự kiện
- [x] 1.3 CLAUDE.md đoạn `trust` phần gậy: hai sự kiện mới và ai nghe; xác minh đọc lại cùng diff

## 2. `screening`: câu thời gian chờ có ngày

- [x] 2.1 `formatMomentVN(date)` ở `common/time` (`HH:mm ngày dd/mm/yyyy`, giờ Việt Nam); `submissionCooldown` dùng nó,
      giữ `code` và `details.retryAt`; xác minh unit test hàm định dạng (qua nửa đêm UTC vẫn đúng ngày Việt Nam) và test
      HTTP gửi tin trong lúc chờ: 429 `SUBMISSION_COOLDOWN`, `message` có ngày

## 3. `notification`: ma trận gậy và mức tin cậy (N49–N58)

- [x] 3.1 `MatrixContext` thêm `strike`, `standing`, `liveAccounts`; nối `trust.strikeDetail`, `trust.standingOf`,
      `identity.accountSummaries` trong `app.ts`; cập nhật ngữ cảnh giả của ba file test ma trận sẵn có; xác minh
      `pnpm run typecheck` và `test:unit` xanh
- [x] 3.2 `notification.trust-matrix.ts` — N49 nhận gậy (thường, nặng, nghiêm trọng; có / không tin; tin đã xoá hẳn; gậy
      đã huỷ lúc gửi thì không báo), N50 gậy kế thừa (bỏ qua `strike.issued` kế thừa); lọc người nhận qua `liveAccounts`;
      xác minh unit test `tests/notification-trust-matrix.test.ts`: câu nhắc không có điều luật hay ngày, `detail` có đủ
      điều, ngày hết hạn, hạn khiếu nại; không đọc `issuedBy`; tài khoản đã xoá → không bản nháp
- [x] 3.3 N51 kết quả khiếu nại, N52 huỷ gậy (`amnesty`, `serious_cancel`; bỏ qua `appeal`), N53 quyết gậy nghiêm trọng
      (`permanent`, `downgrade` kèm ngày hết hạn mới, hạ mà đã hết hạn; bỏ qua `cancel`, `kept`), N54 gỡ khoá vĩnh viễn;
      xác minh unit test từng dòng và từng ca bỏ qua
- [x] 3.4 N55 gậy hết hạn (không nhắc; "đã đăng tin lại được" khi gậy này gỡ khoá đăng tin, theo
      `strike.postingLockFromPoints`), N56 lên mức (không nhắc), N57 xuống mức (có nhắc); xác minh unit test: 3 điểm → 2
      điểm có câu đăng lại, 4 → 3 không có; `T1→T2` không nhắc, `T2→T1` có nhắc
- [x] 3.5 N58 thời gian chờ: khoá gộp `trust:cooldown`, câu theo `until` mới nhất, đúng từng chữ với `message` của 429
      (dùng chung `formatMomentVN`); xác minh unit test (câu khớp `submissionCooldown`, lần phát lại cập nhật câu)
- [x] 3.6 Đăng ký `TRUST_NOTICE_EVENTS` trong `notification.module.ts` và chuỗi `handleEvent`; thêm `vitest.unit.config.ts`,
      `tests/README.md`; xác minh test DB `notification-matrix.db.test.ts` (dòng N49–N58: loại, nhóm `trust_strikes`,
      nhắc / không) và test HTTP qua `deliverAll`: staff gỡ tin vì vi phạm → hộp thư người đăng có N49 với `detail`, bản
      đẩy giả không chứa điều luật; tắt nhóm "mức tin cậy và gậy" → vẫn có dòng, không nhắc; ân xá khi đang khiếu nại →
      đúng một thông báo
- [x] 3.7 CLAUDE.md đoạn `notification`: ma trận mới, ba cửa đọc mới, các sự kiện cố ý không báo

## 4. N36: tin trong nhóm bị máy giữ chờ duyệt

- [x] 4.1 `review.task.group_held { taskId, groupId }` trong transaction của `addReason`, chỉ khi việc chuyển vào hàng 0 và
      tin thuộc nhóm (không phải tin sàn); xác minh test HTTP: tin nhóm bị máy giữ → một sự kiện; thêm lý do máy giữ vào
      việc đã ở hàng 0 → không thêm; tin sàn → không; khởi động lại (`backfill`) → không phát lại
- [x] 4.2 Cửa đọc `review.groupHeldNotice(taskId)`: `null` khi việc đóng, rời hàng 0, hay người xử không ở cấp nhóm (danh
      mục do sàn duyệt, đã chuyển cấp); không thì người xử theo `routesFor` kèm số việc hàng 0 đang mở mỗi người xử được;
      xác minh test DB: điều hành lớp 10A nhận còn điều hành cả nhóm thì không; lớp 10A chỉ có người bị khoá → điều hành cả
      nhóm; chủ tin là điều hành viên → không có trong danh sách; danh mục do sàn duyệt → `null`
- [x] 4.3 Dòng N36 trong ma trận `review` của `notification`: mỗi người nhận một bản nháp, khoá `group:${groupId}:held`,
      câu theo số hiện tại, nhóm `your_groups`, `personal: false`; xác minh unit test và test HTTP: ba tin bị giữ trong 10
      phút → một dòng "3 tin chờ duyệt", một lần nhắc; xử hai việc rồi thêm một tin → dòng thành "2 tin"; câu không nêu lý
      do giữ hay tên người đăng
- [x] 4.4 CLAUDE.md đoạn `review` (sự kiện mới, cửa đọc cho `notification`) và luật "gọi đồng bộ" (cửa đọc mới, chỉ đọc);
      `docs/review.md` mục thông báo cho quản trị nhóm

## 5. Tài liệu cho app

- [x] 5.1 `docs/realtime.md` (loại thông báo mới, `data`, nhóm `trust_strikes`), `docs/strikes.md` (người dùng được báo
      những gì), `docs/VIEC-DANG-DO.md` (bỏ dòng `add-trust-notices` khi archive); sinh lại PDF của TK; xác minh
      `pnpm run format:check`

## 6. Kiểm tra tích hợp

- [x] 6.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift` (không migration nên không lệch), `pnpm run spec:validate`;
      test HTTP / DB trên CI khi mở PR
