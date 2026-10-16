# Design

> **Đã duyệt 15/10/2026.** Người dùng giao tech lead chọn phương án theo tiêu chí chạy ổn với lượng lớn người dùng:
> giữ cả bốn quyết định C3–C6; T10 theo mục 5 — sàn 1, trần thời lượng 100 năm, ba khoá nhạy cảm và hai khoá gộp
> thông báo không nhận `0`, mã nhóm tối thiểu 6 ký tự, khoảng hợp lệ chỉ báo qua câu lỗi.

## Context

- Nguồn: `docs/RA-SOAT-15-10-2026.md` mục C3, C4, C5, C6, T10, mỗi mục đã được đọc lại code để xác nhận.
- Bốn quyết định chính sách được người dùng chốt ngày 15/10/2026 (proposal, bảng "Chốt"). T10 không cần chốt chính
  sách: khoảng hợp lệ lấy từ chỗ code và DB thật sự hỏng (mục 5), không đổi giá trị khởi đầu nào của TK 28.
- Không migration, không thêm thư viện. Mọi thay đổi nằm trong module đang sở hữu dữ liệu: `identity` (tài khoản,
  phiên, lớp thứ hai), `review` (việc), `platform` (bảng con số).

## Decisions

### 1. Google gặp đăng ký chưa xác nhận (C3)

Chỗ: `identity/auth/auth.service.ts`, `loginWithGoogle`. Hiện tại `claimEmail` trả dòng đang sống, và dòng
`pending_verification` được nối Google rồi chuyển `active`, giữ nguyên mật khẩu, phiên, máy đã đăng ký.

Sửa: dòng trả về đang `pending_verification` thì **xoá hẳn**, rồi đi tiếp như email chưa có tài khoản (tạo mới,
phát `identity.account.verified`).

- Xoá có điều kiện `status = 'pending_verification'` trong cùng câu lệnh. Dòng vừa được xác nhận giữa chừng thì không
  bị xoá: đọc lại và đi nhánh "email đã có tài khoản" như cũ.
- Đây cũng là cách job dọn đăng ký quá 7 ngày đang xoá: cùng các dòng con xoá theo, không có sự kiện nào. Tài khoản
  chưa xác nhận chưa đăng tin, chưa vào nhóm được (`requireVerifiedEmail`). Thứ nó
  có thể để lại là ảnh đại diện, giấy tờ đã gửi, máy đã đăng ký: các dòng này xoá theo khoá ngoại; tệp ảnh trong kho do
  lượt đối chiếu kho dọn, như sau job dọn.
- Phiên bị xoá theo dòng, nên socket đang mở được cắt ngay qua `sessionsRevoked.account`. Lượt gọi tiếp bằng token cũ
  nhận 401 `SESSION_REVOKED`, vì không còn phiên nào.

### 2. Master không bị xoá hay khoá (C4)

- `softDelete` (`identity/identity.shared.ts`) dùng chung cho tự xoá trong app và xoá bằng email cùng mật khẩu. Thêm:
  `account.role === 'master'` → 409 `ACCOUNT_DELETE_BLOCKED` "Tài khoản master không xoá được". Mã này đã có, dùng cho
  tài khoản đang bị khoá và chủ nhóm.
- `lockAccount` (`identity/ops/ops.service.ts`): đích là master → 409 `CONFLICT` "Không khoá được tài khoản master".
  Chỉ master khoá được tài khoản, nên thực tế đây là ca master tự khoá mình. Kiểm theo vai của đích, không theo "chính
  mình", vì luật là master không bao giờ bị khoá.
- `findMaster` và công cụ tạo master giữ nguyên (người dùng chọn): sau thay đổi này không còn đường nào làm master mất
  hoạt động.

### 3. Lớp thứ hai đã bật không thiết lập lại được qua app (C5)

`setupTwoFactor` (`identity/account/account.service.ts`) hiện đặt bí mật mới và `totpEnabledAt = null` ngay. Ngay lúc
đó đăng nhập chỉ còn cần mật khẩu, và lượt thiết lập kế tiếp không cần mã nào.

Sửa: `totpEnabledAt` đã có → 409 `TWO_FACTOR_ENABLED` "Lớp thứ hai đã bật — đổi ứng dụng tạo mã thì liên hệ đội kỹ
thuật". Không đụng gì tới bí mật đang dùng.

- Thiết lập lần đầu không đổi: bí mật mới, chờ xác nhận bằng mã đầu tiên.
- Thiết lập lại sau `pnpm cli:reset-2fa` cũng không đổi: công cụ đã gỡ `totpEnabledAt` và thu mọi phiên.

### 4. Thao tác hàng chờ của nhóm không mang quyền master (C6)

`locateTask` (`review/review.shared.ts`) dựng `viewer` cho bề mặt nhóm với `isMaster: actor.role === 'master'`. Từ đó:

- `canHandle` cho master qua mọi việc của nhóm;
- `roleOn` (`review/desk/decision.service.ts`) trả `'master'`.

Trong khi đó route của nhóm chỉ có `authenticate` + `requireVerifiedEmail`, không đòi lớp thứ hai.

Sửa: bề mặt nhóm luôn `isMaster: false`. Master không vào nhóm nào (TK 5), nên không có vai trong nhóm:

- xem hay nhận việc → không được xử → 404 `NOT_FOUND`, đúng đường `refused` sẵn có;
- xem hàng chờ của nhóm đã trả 403 vì `groupQueue` chỉ nhận chủ nhóm và điều hành viên.

Master vẫn thấy mọi việc, kể cả việc của nhóm, ở bàn vận hành: `opsQueue` của master không lọc. Quyết ở đó ghi vai
`master`, sau guard đòi lớp thứ hai.

### 5. Khoảng hợp lệ của bảng con số (T10)

Nguồn: rà từng khoá ngày 15/10/2026 — khoá được đọc ở đâu, `0` làm gì, trần nào do code hay DB ép. Mỗi khoá trong sổ
đăng ký (`src/common/config/config-keys.ts`) có thêm `min` và `max`. `configValueIssue` kiểm khoảng; một hàm mới kiểm
các ràng buộc giữa khoá trên **cả bộ con số sau khi ghép thay đổi**. `changeConfig` gọi nó trước khi ghi, nên đổi một
khoá mà làm lệch khoá khác chưa đổi cũng bị chặn.

**Mặc định**:

| Loại                          | `min` | `max`                                                   |
| ----------------------------- | ----- | ------------------------------------------------------- |
| số nguyên                     | 1     | 2 147 483 647 (cột `INTEGER`, trần của `setTimeout`)    |
| phần trăm                     | 0     | 100                                                     |
| thời lượng (ngày, giờ, phút…) | 1     | 100 năm theo đơn vị đó, không quá trần số nguyên ở trên |

Lý do của `min` 1: với đa số khoá, `0` không phải "tắt" mà là hỏng. Ví dụ:

- phiên, mã xác nhận, quyền tải hết hạn ngay lúc cấp;
- hạn mức 0 chặn hết;
- hạn xử 0 đẩy mọi việc lên master phút sau;
- `0` lượt mỗi phút trả 429 cho mọi lượt đăng nhập;
- chia cho 0 làm job thống kê giá chết.

Trần 100 năm chặn lượt gõ thừa số 0. Nhiều số 0 hơn nữa thì mốc thời gian vượt khoảng của `Date` hay của Postgres, và
job đổ.

**Khoá nhận `0`**: `0` có nghĩa "tắt / không chờ / không cần", và code chạy đúng với nó.

- `identity.deviceWindowDays` (tắt luật giới hạn máy).
- `trust`:
  - `t1MinDays`, `t2MinDays`, `t3MinDays`;
  - `t1MinCleanListings`, `t2MinCleanListings`, `t3MinCleanListings`;
  - `soldCountsCleanAfterDays`.
- `quota.outsiderLiveListingsPerGroup`.
- `screening`:
  - `highValueReferencePriceFrom`, `hardGateCooldownHours`, `bannedPhraseTrialDays`, `newAccountDays`;
  - `abnormalPricePercentile`, `priceWindowDays`, `ownDuplicateDays`, `heldManyDays`, `imageDuplicateMaxDistance`.
- `review.remindMasterHours`.
- `listing`: `remindBeforeDays`, `renewWindowDays`, `moveToMarketplaceDays`.
- `group`: `reapplyWaitDays`, `ownerlessMaxDays`, `announcementsPerDay`.
- `report.autoHideMinTier` (là bậc T0–T3).

Các khoá chống gian lận trong danh sách trên (giới hạn máy, các tín hiệu của máy duyệt, độ lệch ảnh trùng) nhận `0`:
tắt chúng là quyết định của master, có nhật ký, và hệ thống vẫn chạy đúng.

Cố ý **không** nhận `0`, dù code không hỏng:

| Khoá                                                             | `0` sẽ làm gì                                                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `device.dataRetentionDays`                                       | Tắt luật "không xử việc của tài khoản dùng chung máy"                                                          |
| `identity.deletedEmailHoldDays`                                  | Email của tài khoản vừa xoá đăng ký lại được ngay, dòng cũ bị xoá cứng dây chuyền (C9 xảy ra tức thì)          |
| `identity.resendCooldownSeconds`                                 | Gửi lại mã không cần chờ: một người làm được hàng nghìn thư mỗi giờ, kéo theo uy tín miền gửi                  |
| `identity.emailChangeIntervalDays`                               | Đổi email không giới hạn, trong khi đổi email chưa đòi xác thực lại (T12)                                      |
| `notification.collapseAlertMinutes`, `groupListingsAlertMinutes` | Mỗi lượt gộp đều đẩy thông báo: nhóm lớn có tin mới liên tục thì mọi thành viên nhận một lượt đẩy cho từng tin |

**Khoảng riêng**: code hay DB ép, trừ sàn của `group.codeLength`.

| Khoá                                              | Khoảng   | Vì sao                                                                                                                                                                 |
| ------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity.accessTokenMinutes`                     | 1–35 791 | Realtime hẹn giờ cắt socket theo hạn token; quá 2³¹−1 ms thì `setTimeout` bắn sau 1 ms                                                                                 |
| `identity.passwordMinLength`, `passwordMaxLength` | 1–1024   | Schema request nhận mật khẩu tối đa 1024 ký tự                                                                                                                         |
| `screening.mediumBandFrom`, `highBandFrom`        | 1–1000   | Bằng khoảng của dải theo danh mục (bàn vận hành)                                                                                                                       |
| `screening.abnormalPricePercentile`               | 0–50     | Trên 50 thì cận dưới vượt cận trên, vi phạm CHECK của bảng thống kê giá                                                                                                |
| `screening.imageDuplicateMaxDistance`             | 0–4      | dHash chia 5 dải và tìm ứng viên bằng dải trùng: độ lệch 5 trở lên không bao giờ tìm thấy                                                                              |
| `listing.maxImages`                               | 1–50     | Schema request nhận tối đa 50 ảnh; tin gửi cần ít nhất 1 ảnh (CHECK)                                                                                                   |
| `group.codeLength`                                | 6–20     | Schema nhận mã tối đa 20 ký tự. Sàn 6 = giá trị khởi đầu: 32⁶ ≈ 1 tỉ mã, hàng triệu nhóm vẫn hiếm khi trùng (chỉ thử lại 5 lần) và khó dò — **chọn**, không do code ép |
| `group.announcementMaxLength`                     | 1–10 000 | Schema request nhận tối đa 10 000 ký tự                                                                                                                                |
| `media.uploadGrantMinutes`                        | 1–10 080 | Chữ ký S3 (SigV4) sống tối đa 7 ngày                                                                                                                                   |
| `media.viewUrlMinutes`                            | 1–5040   | Bộ nối S3 ký đường xem gấp đôi số phút, trần 7 ngày                                                                                                                    |
| `report.autoHideMinTier`                          | 0–3      | Bốn bậc T0–T3                                                                                                                                                          |

**Ràng buộc giữa khoá**: mỗi dòng là một chỗ code đã giả định.

| Ràng buộc                                                                    | Lệch thì                                                        |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `screening.mediumBandFrom` < `screening.highBandFrom`                        | Dải Vừa không bao giờ xảy ra (dải theo danh mục đã có luật này) |
| `identity.passwordMinLength` ≤ `identity.passwordMaxLength`                  | Mọi mật khẩu bị từ chối                                         |
| `trust.t1MinDays` ≤ `t2MinDays` ≤ `t3MinDays`, tương tự `t*MinCleanListings` | Tài khoản nhảy bậc                                              |
| `listing.remindBeforeDays` < `listing.visibleDays`                           | Tin vừa lên đã ở trong cửa sổ nhắc                              |
| `listing.renewWindowDays` < `listing.renewExtendDays` và < `visibleDays`     | Gia hạn nối nhau vô tận, hay gia hạn được ngay khi vừa lên      |
| `media.uploadGrantMinutes` ≤ `media.unconfirmedHours` × 60                   | Job dọn xoá ảnh khi quyền tải còn sống                          |
| `identity.resendCooldownSeconds` ≤ `identity.codeTtlMinutes` × 60            | Mã đã hết hạn mà vẫn phải chờ mới xin lại được                  |
| `identity.codeTtlMinutes` < `identity.unverifiedPurgeDays` × 1440            | Đăng ký bị dọn khi mã còn sống                                  |

Mọi giá trị khởi đầu của TK 28 nằm trong khoảng và thoả mọi ràng buộc; một unit test giữ điều đó.

Lỗi trả về 400 `VALIDATION_ERROR` như cũ, câu báo nêu tên con số và khoảng hợp lệ (vd "phải từ 1 tới 35 791"). Cấu
trúc response của bảng con số không đổi: khoảng hợp lệ chưa trả ra API, bàn vận hành đọc trong câu lỗi.

Kèm theo: câu lỗi đổi email đang ghi cứng "30 ngày". Nay nó đọc `identity.emailChangeIntervalDays`.

Khoá chưa ai đọc (`strike.*`, `report.*`, `quota.newConversationsPerDay*`, `review.reportHours`, `review.appealDays`)
dùng mặc định. Change dùng tới chúng chỉnh khoảng nếu cần.

## Risks / Trade-offs

- **Phiên bản đang chạy lệch khoảng mới**: master đã đặt một giá trị nay bị coi là sai. Phiên bản cũ vẫn chạy, không
  bị sửa; lượt đổi kế tiếp phải đưa nó về khoảng (câu lỗi nêu đúng khoá). Dev và production hiện vẫn ở giá trị khởi
  đầu, nên chưa có ca nào.
- **C3 xoá đăng ký dở**: người thật vừa đăng ký bằng mật khẩu, chưa nhập mã, rồi chuyển sang Google, sẽ mất mật khẩu đã
  đặt. Họ vẫn vào bằng Google, và muốn có mật khẩu thì đặt qua "quên mật khẩu". Cái giá này nhỏ so với lỗ chiếm tài khoản.
- **C5**: staff muốn đổi điện thoại phải nhờ đội kỹ thuật, đúng TK 5.
