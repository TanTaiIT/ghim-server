# Tasks

**Đã duyệt 17/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. Dữ liệu

- [x] 1.1 Migration enum (file riêng): `review_reason` + `appeal`, `serious_strike`, `permanent_review`; `review_outcome` +
      `violation`; `listing_restriction` + `strike_wave`; `account_flag_kind` + `device_of_struck_account`; `code_purpose` +
      `locked_appeal`
- [x] 1.2 Migration bảng: `rule_articles`, `strikes`, `strike_appeals`, `strike_comments`; `review_tasks.strike_id`,
      `review_decisions.strike_id` / `issued_strike_id`; `account_flags.related_strike_id`; CHECK kèm `///`
- [x] 1.3 Con số `trust.t3NoStrikeDays`; luật máy `shared_device_strike`

## 2. `trust` — gậy

- [x] 2.1 `calc/strike.calc.ts`: hiệu lực, điểm, mốc hết khoá đăng tin, cửa sổ khiếu nại, điều kiện T3
- [x] 2.2 `strike.repository.ts`, `strike.service.ts`: ra gậy (tx), kế thừa, đổi email, chặn email, hết hạn (job), ân xá,
      khiếu nại (app, kênh hỗ trợ), quyết khiếu nại / gậy nghiêm trọng / xem lại, gỡ khoá vĩnh viễn, nhận xét, quy định sàn,
      cộng ngày; sự kiện `trust.strike.*`, `trust.appeal.*`
- [x] 2.3 Mức: trần T1, điều kiện T3; bảng uy tín; `assertCanSubmit` khoá đăng tin; route `/me/strikes`,
      `/support/serious-appeal`, `/ops/trust/*`

## 3. Các module nghe `trust`

- [x] 3.1 `review`: việc về gậy (hàng 2, định tuyến), quyết định `violation` + `strike`, báo cáo đúng kèm gậy, khiếu nại /
      gậy nghiêm trọng / xem lại, quá hạn khiếu nại, chi tiết việc (gậy, lời khiếu nại, nhận xét, lịch sử gậy người bán)
- [x] 3.2 `listing`: `violation` + `faultReason`, `LISTING_UNDER_VIOLATION`, `LISTING_DELETE_BLOCKED`, `strike` lúc lên
      bảng, `strike_wave` theo điểm, `appealWin` khi gậy bị huỷ, cộng ngày
- [x] 3.3 `identity`: sự kiện tạo tài khoản / đổi email, `EMAIL_BANNED`, khoá / mở khoá vì gậy, `LOCKED_BY_STRIKE`, chặn tự
      xoá, đánh dấu máy có gậy, `sharedWithStruck`, mã `locked_appeal`
- [x] 3.4 `screening`: hàng "có gậy", dấu hiệu `shared_device_strike`
- [x] 3.5 `platform`: treo vì gậy, trả khi huỷ · `group`: mất vai, chủ nhóm gậy nặng → thiếu chủ, trả chủ

## 4. Test (mỗi scenario một ca)

- [x] 4.1 `strike-issue.http.test.ts`: ba loại, chỉ từ quyết định (máy, cổng cứng, sai sót, nhóm gỡ, báo cáo bác, chung máy),
      điểm tự giảm, khoá đăng tin, nhật ký, tin vi phạm không sửa / xoá, lịch sử gậy ở chi tiết việc
- [x] 4.2 `strike-appeal.http.test.ts`: khiếu nại, người xét, hạn 7 ngày, thắng, thua, ân xá
- [x] 4.3 `strike-serious.http.test.ts`: khoá ngay, kênh hỗ trợ, chỉ master, nhận xét, khoá vĩnh viễn, xem lại, hạ, huỷ,
      không tự mở, `EMAIL_BANNED`, `LOCKED_BY_STRIKE`
- [x] 4.4 `strike-effects.http.test.ts`: hạn chế tin (`strike`, `strike_wave`), máy (hàng có gậy, dấu hiệu máy), mức (trần
      T1, T3, huỷ), bảng uy tín, email (kế thừa, đổi email), xoá tài khoản, dấu thiết bị, quyền staff, vai nhóm
- [x] 4.5 `strike.calc.test.ts`

## 5. Tài liệu và kiểm tra tích hợp

- [x] 5.1 `docs/strikes.md` (app, bàn vận hành), `docs/review.md`, CLAUDE.md, `docs/VIEC-DANG-DO.md`, `tests/README.md`
- [x] 5.2 `pnpm run check`, `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
