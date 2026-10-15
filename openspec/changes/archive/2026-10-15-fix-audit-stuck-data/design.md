# Design

> **Đã duyệt 15/10/2026.** Người dùng giao tech lead chọn phương án ("tiến hành các bước tốt nhất tiếp theo"), theo tiêu
> chí chạy ổn với lượng lớn người dùng.

## Context

- Nguồn: `docs/RA-SOAT-15-10-2026.md` mục C7, C8, C9, C10, T13. Mỗi mục đã được đọc lại code ngày 15/10/2026.
- Module sở hữu:
  - `listing` sở hữu tin và lý do tạm ẩn;
  - `review` sở hữu việc;
  - `identity` sở hữu tài khoản;
  - `group` sở hữu nhóm.

  Không module nào ghi vào bảng của module khác.

## Decisions

### 1. Lý do tạm ẩn trên mọi đường ghi tin (C7)

Ba hàm thuần mới trong `listing/calc/hide.calc.ts`, dùng chung cho mọi đường:

- `reasonsAfterRecheck(reasons)` — bỏ mọi lý do của nhóm (`left_group`, `removed_from_group`, `group_banned`,
  `group_locked`) và `category_disabled`. Dùng cho **gửi nháp** và **gia hạn**:
  - Hai đường này đã kiểm lại nơi đăng dưới khoá nhóm (`lockPlacement`: khoá, cấm, thành viên, người ngoài).
  - Bước 4 của lượt gửi cũng đã từ chối danh mục đang tắt (`CATEGORY_DISABLED`; chỉ đường sửa được giữ danh mục đang
    tắt).
  - Vậy lý do nào còn đúng thì lượt gửi đã bị từ chối trước khi ghi. Còn lý do của tài khoản (khoá, xoá) thì người đó
    không gửi được.
- `reasonsAfterRewrite(reasons, { groupChanged, categoryEnabledNow })` — dùng cho **lưu nháp**, đường không kiểm lại
  nơi đăng:
  - đổi nhóm (kể cả lên sàn chung) thì bỏ lý do của nhóm;
  - đổi sang danh mục đang bật thì bỏ `category_disabled`.

  Đường sửa (đã đúng) cũng chuyển sang dùng hàm này; hành vi không đổi.

- `placementsHiddenOnLeave(allowOutsiders)` — mục 2.

Thêm vào các đường ghi:

- **Tin đã rời nhóm hẳn** (`group_closed`, `group_privatized`, `detached_by_group`):
  - rút về nháp → 409 `LISTING_DETACHED`. Kiểm hai lần: trước khi ghi, và trên dòng đã khoá (`before`), vì nhóm có
    thể đóng giữa lượt đọc và lượt ghi;
  - lưu nháp hay gửi một nháp như thế (dòng cũ trước bản sửa) → 409 `LISTING_DETACHED`;
  - xoá vẫn được.

  Một hàm lỗi chung `listingDetached()` thay ba chỗ đang viết lại câu.

- **Gia hạn kèm đổi nơi đăng (nhóm, mức) khi `openWork.blocksPlacement`** → 409 `PLACEMENT_LOCKED`, cùng luật với
  đường sửa.

Không migration. Dòng cũ đang kẹt là:

- nháp mang lý do của nhóm đã đổi;
- tin sàn chung còn mang lý do nhóm.

Chúng được gỡ ở lượt gửi kế tiếp. Nháp đã rời nhóm hẳn chỉ còn xoá được (chuyển lên sàn chung không nhận nháp).

### 2. Lượt rời chỉ huỷ việc của tin bị ẩn (C8)

- `placementsHiddenOnLeave(allowOutsiders)` trả `['members_only']` khi nhóm nhận tin người ngoài, ngược lại
  `['members_only', 'group_public']`. `addAndRemove` của `hide.calc.ts` dùng chính nó, nên `listing` và `review` cùng
  một luật.
- `pendingInGroup(accountId, groupId, leave?)` của `listing` nhận thêm thông tin lượt rời:
  - `left` / `removed` → lọc theo `placementsHiddenOnLeave(leave.allowOutsiders)`;
  - `banned` / `account_deleted` → mọi tin, vì cấm và xoá ẩn mọi mức.

  Không truyền `leave` thì như cũ (dùng cho lượt vào lại).

- Bên nghe `group.member.left` của `review` đọc thêm `reason` và `allowOutsiders` có sẵn trong payload, rồi truyền vào.
- Lọc theo nơi đăng là tất định:
  - nơi đăng của tin chờ duyệt bị khoá (`PLACEMENT_LOCKED`), rút về nháp thì việc bị huỷ;
  - không phải đọc `hideReasons`, thứ có thể chưa kịp đổi vì hai bên nghe không theo thứ tự nào.

### 3. Ẩn danh tài khoản đã xoá thay vì xoá cứng (C9, T13)

**Migration** (SQL viết tay): nới `accounts_credential_check` cho dòng đã xoá. Dòng ẩn danh không còn mật khẩu hay mã
Google.

```sql
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_credential_check",
  ADD CONSTRAINT "accounts_credential_check"
    CHECK ("status" = 'deleted' OR "password_hash" IS NOT NULL OR "google_sub" IS NOT NULL);
```

Không đổi cột: `email`, `email_normalized` vẫn NOT NULL. Dòng ẩn danh mang dấu `deleted:<mã tài khoản>` ở cả hai cột:

- duy nhất theo cách dựng;
- không bao giờ trùng một email thật, vì mọi đường vào đều đòi email hợp lệ (có `@`).

**Repository**: `anonymizeDeletedAccount({ id, deletedBefore })` thay `purgeAccount`. Ghi có điều kiện
`status = 'deleted' AND deleted_at <= deletedBefore`, nên an toàn khi hai lượt đua và không đụng tài khoản còn trong
thời gian chờ.

| Bỏ (ghi đè hay về null)                                                                      | Giữ                                                          |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `email`, `email_normalized` → dấu `deleted:<id>`                                             | `id`, `email_hash`, `status`, `deleted_at`, `role`, ngày tạo |
| `display_name` → "Tài khoản đã xoá"                                                          | mọi dòng con: tin, việc, lượt máy duyệt, mức tin cậy,        |
| `password_hash`, `google_sub`, `google_picture_url`, `avatar_image_id`, `phone`, lớp thứ hai | dấu thiết bị, cờ, giấy tờ, phiên đã thu                      |
| `avatar_from_google` → `false`; mã xác nhận của tài khoản bị xoá                             |                                                              |

Phần giữ lại là lịch sử chống gian lận. Xoá thật là việc của `add-data-retention`, và lúc đó phải giữ dấu băm email
theo hạn "dấu băm email kèm gậy" của TK 25.

**`claimEmail`** gọi một hàm chung `releaseDeleted(account, at)`:

- trong thời gian chờ → 409 `EMAIL_PENDING_DELETION` kèm ngày;
- hết thời gian chờ → ẩn danh, và email tự do.

**Đăng nhập Google (T13)**: dòng tìm theo mã Google mà đã xoá thì cũng qua `releaseDeleted`.

- Trong thời gian chờ → 409. Google đã chứng minh người gọi là chủ email, nên báo ngày là đúng, không lộ gì cho người
  lạ.
- Hết thời gian chờ → dòng cũ được ẩn danh, nhả mã Google, rồi đi tiếp như email chưa có tài khoản: tạo mới.

`deleteUnverifiedAccount(s)` vẫn xoá cứng. Đăng ký chưa xác nhận chưa đăng tin được, nên không có lịch sử nào đáng giữ.

### 4. Nhóm thiếu chủ không bắt đầu chuyển sang riêng tư (C10)

- Trong `prepare` của `updateSettings` (chạy sau khi dòng nhóm đã khoá): kế hoạch là `going_private` mà nhóm đang
  `ownerless` → 409 `GROUP_OWNER_REQUIRED` "Nhóm đang thiếu chủ — giao chủ xong rồi mới chuyển sang riêng tư".
- Vì sao chặn chứ không cho chuyển rồi trả về thiếu chủ:
  - "Thiếu chủ" và "đang chuyển riêng tư" loại trừ nhau ở mọi chỗ khác: `markOwnerless` huỷ chuyển riêng tư đang dở,
    còn job 30 ngày, `restoreOwner`, `acceptOffer` đều không biết trạng thái ghép.
  - Riêng tư hoá đẩy tin người ngoài rời nhóm vĩnh viễn — không nên xảy ra khi nhóm không có chủ.
- Đổi chế độ áp ngay (nhóm không còn tin "nhóm công khai") vẫn làm được lúc thiếu chủ.

## Risks / Trade-offs

- **C7**: người đăng gửi lại một nháp vẫn bị chặn đúng lý do cũ (nhóm còn khoá, còn bị cấm) thì nhận lỗi của bước kiểm
  nơi đăng (`GROUP_LOCKED`, `GROUP_BANNED`…) thay vì tin lên rồi ẩn. Đó là hành vi đúng của lượt gửi.
- **C9**: dòng ẩn danh vẫn hiện "Tài khoản đã xoá" ở chỗ người duyệt xem lịch sử. Có chủ ý: lịch sử còn, danh tính thì
  không.
- **C10**: master muốn riêng tư hoá nhóm thiếu chủ phải giao chủ trước. Nhóm thiếu chủ tự khoá sau 30 ngày nếu không ai
  nhận.
