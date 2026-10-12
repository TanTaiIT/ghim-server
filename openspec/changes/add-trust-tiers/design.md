# Design

> **Đã duyệt 12/10/2026**: 11 câu trả lời ở mục 2 và T1–T5 ở bảng cuối file. Thiết kế chung với `add-listings`
> (đã duyệt cùng ngày) và `add-screening`; code sau `add-listings`, trước `add-screening`.

## Context

- `add-listings` (design đã duyệt) để sẵn chỗ cắm `ListingTrustPort { tierOf, assertCanSubmit }` với bản tạm (T0 ở
  production và test, dev mặc định T1, không chặn hạn mức), bảng `listing_submissions` (mỗi lượt gửi một dòng có
  `kind`), sự kiện `listing.state.changed`, và bên nghe `trust.tier.raised` gỡ lý do "tài khoản mới".
- Bảng con số đã có `trust.t{1,2,3}Min{Days,CleanListings}`, `trust.maxCleanPer7Days` 3,
  `trust.soldCountsCleanAfterDays` 2, `quota.liveListingsT{0..3}`, `quota.submitsPerHourT{0..3}`,
  `quota.outsiderLiveListingsPerGroup` 2.
- `identity` lưu `created_at`, chưa có mốc xác nhận email; tài khoản chưa xác nhận bị dọn sau
  `identity.unverifiedPurgeDays` (7).
- `group` có một hàm `roleEligibility` cho mọi đường nhận vai (`group.shared.ts`), trả 409
  `GROUP_ROLE_INELIGIBLE` — design `add-groups` đã ghi "đợt 2 thêm T1 trở lên" vào chính hàm này.
- "Báo cáo đúng" (đợt 4) và "người nhắn hỏi mua" (đợt 6) chưa có: tới lúc đó mọi tin thoả điều kiện báo cáo, và
  không tin nào sạch theo lối "đã bán" (proposal).
- Việc theo lịch dùng pg-boss — câu "phải chọn cơ chế việc nền" của proposal đã xong từ đợt 1.

## Goals / Non-Goals

**Goals**

- Đủ mọi requirement của `trust/trust-tiers`, `trust/quotas`, `trust/seller-dashboard`, `group/group-roles`.
- Mức là hàm thuần của dữ kiện và phiên bản bảng con số (luật 18): tính lại hai lần ra cùng kết quả, có test.
- Hạn mức đúng cả khi hai lượt gửi chạy song song.
- `trust` không đọc bảng của `listing`: hỏi qua cổng của `listing`, nghe sự kiện của nó.

**Non-Goals** (giữ như proposal): gậy, khiếu nại, ân xá (`add-strikes`); số hội thoại mới mỗi ngày
(`add-messaging`); thông báo lên / xuống mức (`add-notifications`); máy dùng mức (`add-screening`).

## Decisions

### 1. Module `trust` mới

`trust.module.ts`, `trust.service.ts`, `tier.calc.ts` (mức, tin sạch, cửa sổ 7 ngày), `quota.calc.ts`,
`trust.repository.ts`, `trust.events.ts`, `trust.jobs.ts`, `trust.routes.ts` (bảng uy tín), `trust.schema.ts`. Dựng
sau `listing` trong `buildApp`; hai cổng nối chéo (`listing` → `trust`, `trust` → `listing`) gắn sau khi dựng cả hai,
như `PublicListingCounter` của `group`.

### 2. Trả lời 11 câu hỏi mở của proposal (đề xuất)

| #   | Câu hỏi                                                   | Đề xuất                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tin sạch vượt 3 tin / 7 ngày: dời hay bỏ                  | **Dời**: tin vẫn sạch, được tính từ lúc cửa sổ có chỗ. Tin thứ tư cùng ngày với ba tin trước được tính sau đúng 7 ngày. Hàm thuần trên danh sách mốc, không lưu "đã tính" — nên tính lại hai lần ra cùng kết quả.                                                                     |
| 2   | Tin bị gỡ vì vi phạm rồi được khôi phục / khiếu nại thắng | **Có lại** tư cách tin sạch, với mốc cũ. Chỉ tin **đang** ở trạng thái bị gỡ / bị từ chối vì vi phạm mới không sạch.                                                                                                                                                                  |
| 3   | "Hiển thị ít nhất 7 ngày": cộng dồn hay liền mạch, tạm ẩn | **Cộng dồn** thời gian tin ở trạng thái đang hiển thị **và không tạm ẩn** (đầy đủ hay hạn chế đều được). Tạm ẩn không tính, kể cả lý do mà ngày hiển thị vẫn trôi (khoá tài khoản, tự rời nhóm): ngày hiển thị là quyền của người đăng, tin sạch là bằng chứng người mua đã thấy tin. |
| 4   | Tin sạch còn tính sau khi tin bị xoá / dọn                | **Còn**. `trust` giữ dữ kiện "tin X thành sạch lúc D, qua lối nào" — không chứa nội dung tin — nên mức người bán lâu năm không tụt khi tin cũ bị dọn.                                                                                                                                 |
| 5   | "Người nhắn hỏi mua" có tính tài khoản dùng chung máy     | **Không tính** tài khoản dùng chung thiết bị với người bán (TK 8). Áp ở `add-messaging` khi có "người nhắn"; `identity` thêm `sharesDevice(a, b)`.                                                                                                                                    |
| 6   | Tuổi tài khoản tính từ lúc tạo hay lúc xác nhận email     | **Từ lúc tạo**. Tài khoản chưa xác nhận bị dọn sau 7 ngày, nên chênh lệch tối đa 7 ngày; T1 vẫn cần một tin hiện đủ 7 ngày, mà tin chỉ gửi được sau khi xác nhận. Không phải thêm cột `email_verified_at`.                                                                            |
| 7   | Chủ nhóm / điều hành viên tụt dưới T1                     | **Giữ vai**. TK 10 chỉ cho mất vai khi gậy nặng hoặc bị khoá; tụt mức là hệ quả tính lại, không phải án. Chỉ chặn **nhận** vai mới khi dưới T1 (đúng spec group-roles).                                                                                                               |
| 8   | "Chờ tin được duyệt" là cách giải phóng chỗ?              | **Không** — tin được duyệt vẫn là tin sống. Câu báo hết chỗ nêu ba cách: đánh dấu đã bán, xoá, hoặc **rút tin chờ duyệt về nháp**. Sửa câu của TK 20.                                                                                                                                 |
| 9   | Bảng con số mới: tính lại ngay hay sau                    | **Lượt hằng ngày kế tiếp** tính lại mọi tài khoản có kết quả ghi theo phiên bản cũ; trong lúc đó mọi lần tính do chuyện mới (gửi tin, đã bán, bị gỡ) dùng phiên bản mới ngay. Không tính lại hàng loạt trong request của master.                                                      |
| 10  | "Hiển thị 7 ngày" vào bảng con số                         | **Có**: `trust.cleanShownDays` 7 (cam kết 33).                                                                                                                                                                                                                                        |
| 11  | Thời gian chờ trên bảng uy tín                            | **`add-screening`** thêm vào `trust/seller-dashboard` (bên tạo ra thời gian chờ).                                                                                                                                                                                                     |

### 3. Dữ liệu — `trust` sở hữu 3 bảng

| Bảng                   | Cột chính                                                                                                            | Ràng buộc                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `trust_clean_listings` | `listing_id`, `account_id`, `via` (`shown` / `sold`), `clean_at`, `voided_at`, `void_cause` (`violation` / `report`) | PK `listing_id` — mỗi tin sạch tối đa một lần (spec); CHECK `voided_at` ⇔ `void_cause`; `clean_at` trống = dòng chỉ mang dấu void (mục 13) |
| `trust_tiers`          | `account_id`, `tier`, `counted_clean`, `facts_hash`, `config_version`, `computed_at`                                 | PK `account_id`                                                                                                                            |
| `trust_tier_changes`   | `account_id`, `from_tier`, `to_tier`, `facts_hash`, `config_version`, `at`                                           | Index (`account_id`, `at`)                                                                                                                 |

- `trust_clean_listings` là **dữ kiện**, không phải điểm: một dòng = "tin X thành sạch lúc D". Gỡ vì vi phạm hay
  báo cáo đúng thì đặt `voided_at`; khôi phục, khiếu nại thắng, báo cáo bị huỷ thì xoá `voided_at` (câu 2). Không
  FK sang `listings` (câu 4: dữ kiện sống lâu hơn tin).
- `trust_tiers` là **kết quả** của lần tính gần nhất, giữ để: trả nhanh `tierOf`, biết khi nào mức đổi (phát sự
  kiện, ghi `trust_tier_changes`), và biết tài khoản nào còn tính theo phiên bản cũ (câu 9). Tài khoản chưa có
  dòng = T0.
- `facts_hash` = SHA-256 của dữ kiện đã chuẩn hoá + phiên bản bảng con số (luật 18). Tính lại ra cùng `tier` và
  cùng `facts_hash` thì không ghi gì (spec "Tính lại khi không có gì mới").

### 4. Mức — `tier.calc.ts`

```ts
computeTier({ accountCreatedAt, cleanAt: Date[] /* chưa void */, now, config }) →
  { tier, countedClean, next: { tier, missingDays, missingClean } | null }
```

- **Cửa sổ 7 ngày, dời** (câu 1): xếp `cleanAt` tăng dần; mốc được tính của từng tin = mốc của nó, nhưng nếu đã có
  `maxCleanPer7Days` mốc được tính trong 7 ngày trước đó thì dời tới (mốc được tính thứ `max` gần nhất + 7 ngày).
  `countedClean` = số mốc được tính `<= now`. Hàm thuần, chỉ phụ thuộc đầu vào.
- **Mức** = mức cao nhất mà `now - accountCreatedAt >= tNMinDays` và `countedClean >= tNMinCleanListings`. Điều
  kiện gậy (T2, T3, trần T1 khi có gậy) thêm ở `add-strikes` vào đúng hàm này.
- `next` cho bảng uy tín: số ngày tuổi và số tin sạch còn thiếu tới mức kế tiếp, theo cùng phiên bản bảng con số.
- Unit test: mọi scenario của spec trust-tiers, thêm năm tin cùng ngày qua ba ngày liền, dời qua nhiều cửa sổ, và
  "tính hai lần cùng kết quả" bằng chạy lại trên cùng đầu vào.

### 5. Tin sạch — ai phát hiện, lúc nào

| Lối            | Phát hiện                                                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hiện đủ 7 ngày | Lượt hằng ngày (mục 7) hỏi `listing.shownCandidates({ minShownMs, since })`: tin có tổng thời gian **được thấy** ≥ `trust.cleanShownDays`, và được thấy trong 48 giờ qua (lượt lỡ một ngày vẫn bắt kịp). `trust` bỏ tin đã có dòng. Mốc sạch = lúc lượt phát hiện. |
| Đã bán         | Nghe `listing.state.changed` sang `sold`: được thấy ≥ `trust.soldCountsCleanAfterDays` và có người nhắn hỏi mua (cổng `BuyerInterest` — `add-messaging` nối; tới đó luôn sai). Mốc = lúc bán; tính lại mức ngay (spec).                                            |
| Mất tư cách    | `listing.state.changed` sang `removed` / `rejected` với `fault = violation` → đặt `voided_at`; sang `live` từ hai trạng thái đó (khôi phục, khiếu nại thắng) → xoá `voided_at`. Báo cáo đúng / bị huỷ: `add-reports`. Tính lại mức ngay.                           |

"Được thấy" = trạng thái đang hiển thị và không tạm ẩn (câu 3). `listing` giữ hai cột cho việc này — `shown_ms`
(tổng các khoảng đã đóng) và `shown_since` (khoảng đang mở) — cập nhật trong cùng hàm thuần với đồng hồ ngày
hiển thị, ở mọi lượt đổi trạng thái hay lý do tạm ẩn. Đây là phần thêm vào design `add-listings` (mục "Sửa đi
kèm"); `trust` không chép logic trạng thái sang phía mình.

Mốc sạch lấy theo lúc phát hiện (không phải phút tin vượt mốc): chỉ lệch trong ngày, chỉ ảnh hưởng thứ tự trong
cửa sổ 7 ngày, và giữ cho dữ kiện đã ghi không đổi khi tính lại.

### 6. Hạn mức — `quota.calc.ts`, chạy trong transaction gửi của `listing`

`assertCanSubmit(tx, { accountId, listingId, kind, fromState, groupId, outsider })`:

1. `pg_advisory_xact_lock` theo người (`trust:submit:<accountId>`) — hai lượt gửi song song của một người xếp hàng,
   nên cùng đếm 9 rồi cùng thành 11 không xảy ra. Khoá nằm trong transaction của `listing`, nhả khi commit.
2. Đọc qua cổng `ListingQuotaFacts` (của `listing`, cùng `tx`): số tin sống, số lượt gửi trong một giờ gần nhất
   (`listing_submissions`), số tin sống của người này trong nhóm nếu là người ngoài.
3. `quotaDecision(...)` thuần:
   - Tăng số tin sống — `submit`, `move`, `renew_expired`, gửi lại từ bị từ chối / bị gỡ: cần `live < cap` →
     409 `LISTING_QUOTA_EXCEEDED`.
   - `renew_early`: cần `live <= cap` (không chiếm thêm chỗ, nhưng đang vượt trần thì không gia hạn).
   - Sửa tin đang hiển thị / chờ duyệt phải qua máy: không xét trần.
   - Mọi `kind`: nhịp gửi `submitsInLastHour < perHour` → 429 `SUBMISSION_RATE_LIMITED` kèm `retryAt` = lượt sớm
     nhất trong cửa sổ + 1 giờ.
   - Người ngoài vào nhóm: `outsiderLiveInGroup < quota.outsiderLiveListingsPerGroup` → 409
     `OUTSIDER_QUOTA_EXCEEDED`.
4. 409 `LISTING_QUOTA_EXCEEDED` kèm `details.occupying` (mã, tiêu đề, trạng thái từng tin sống) và `details.howTo`
   (đã bán, xoá, rút tin chờ duyệt về nháp — câu 8).

"Tin sống" do `listing` đếm (`countLive`: đang kiểm, chờ duyệt, đang hiển thị không tạm ẩn, chưa xoá) — định nghĩa
nằm một chỗ, cạnh dữ liệu. Lượt bị từ chối không thêm dòng `listing_submissions` (transaction quay lui), nên không
bị đếm (spec).

Thứ tự trong mục 5 của design `add-listings`: hạn mức (bước 6) chạy sau kiểm trường và nơi đăng, nên một lượt sai
cả hai trả lỗi trường trước — người dùng sửa được ngay mà không phải đoán.

### 7. Khi nào tính lại

| Lúc                                             | Tính lại cho                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Có / mất tin sạch do bán, gỡ, khôi phục (mục 5) | Người đăng, ngay trong bên nghe                                                                                                                                                                   |
| `trust.recompute-daily`, 00:30 Asia/Ho_Chi_Minh | Tài khoản có tin vừa sạch theo lối 7 ngày; tài khoản vừa chạm mốc tuổi của một mức trong ngày (`created_at + tNMinDays`); tin sạch vừa ra khỏi hàng dời; tài khoản có `config_version` cũ (câu 9) |
| `tierOf(accountId)` khi chưa có dòng            | Không tính: trả T0                                                                                                                                                                                |

Mức đổi → ghi `trust_tiers`, `trust_tier_changes` và phát `trust.tier.changed { accountId, from, to,
configVersion }` trong cùng transaction. `listing` nghe: từ T0 lên T1 trở lên → gỡ "tài khoản mới" khỏi mọi tin
(đổi tên sự kiện so với design `add-listings` — một sự kiện cho cả lên lẫn xuống; tụt về T0 không đặt lại lý do
lên tin đang hiện, vì TK 15 chỉ đặt lúc tin lên bảng).

`tierOf` đọc `trust_tiers` (một dòng). Không tính lại trong request đọc: mức phải đứng yên giữa hai lần có chuyện,
và bảng uy tín phải khớp với mức `listing` dùng.

### 8. Vai trong nhóm

`group` nhận cổng `GroupTrustPort.tierOf` (nối sau khi dựng `trust`), `roleEligibility` thêm điều kiện "T1 trở
lên" → 409 `TRUST_TIER_TOO_LOW` (mã riêng của spec, không gộp vào `GROUP_ROLE_INELIGIBLE`). Xét tại lúc nhận
vai: bổ nhiệm điều hành viên, bấm đồng ý lời giao chủ (spec). Tụt mức không bãi vai (câu 7).

### 9. Bảng uy tín — `GET /me/trust`

Một response, không tính gì mới: mức và `next` (từ lần tính gần nhất, cùng phiên bản bảng con số); hạn mức (tin
sống / trần, lượt gửi còn lại, `nextSubmissionAt`); tin đang hạn chế kèm lý do và tin đang chờ người duyệt (cổng
`ListingDashboardFacts` của `listing`). Câu cho tin chờ duyệt lấy từ cổng `HoldExplanation` của `screening`: bản tạm
trả "đang chờ người duyệt" cho mọi tin; `add-screening` trả câu chung ba phần cho tin giữ vì dấu hiệu gian lận và
thêm thời gian chờ (câu 11).

### 10. Sự kiện

| Phát                 | Payload                              | Ai nghe                                      |
| -------------------- | ------------------------------------ | -------------------------------------------- |
| `trust.tier.changed` | `accountId, from, to, configVersion` | listing (2), notification (6), screening (3) |

| Nghe                                                                                | Làm gì                                                                                   |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `listing.state.changed` (`sold`, `removed`, `rejected`, khôi phục, khiếu nại thắng) | Mục 5, tính lại ngay                                                                     |
| `identity.account.deleted`                                                          | Xoá `trust_tiers` của tài khoản; dữ kiện tin sạch đi theo hạn lưu (`add-data-retention`) |

### 11. Route

`GET /me/trust` (đăng nhập; khách 401). Không có route ghi: mức chỉ đổi do tính lại (spec). Bàn vận hành xem mức
của một người ở `add-review-queues` (người duyệt cần thấy mức).

### 12. Mã lỗi, con số mới

Mã lỗi (spec): `LISTING_QUOTA_EXCEEDED`, `SUBMISSION_RATE_LIMITED` (429), `OUTSIDER_QUOTA_EXCEEDED`,
`TRUST_TIER_TOO_LOW`. Con số: `trust.cleanShownDays` 7 (câu 10).

### 13. Tranh chấp đồng thời

| Tình huống                                   | Cơ chế                                                                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hai lượt gửi song song ở 9/10 tin            | Khoá theo người trong `assertCanSubmit`, đếm sau khoá                                                                                                                                                                                                               |
| Bên nghe tính lại đua với lượt hằng ngày     | Ghi `trust_tiers` có điều kiện `facts_hash` cũ; lượt thua tính lại trên dữ kiện mới                                                                                                                                                                                 |
| Một tin vừa sạch theo lối 7 ngày vừa bán     | PK `listing_id` của `trust_clean_listings`; lượt sau `ON CONFLICT DO NOTHING`                                                                                                                                                                                       |
| Bị gỡ vì vi phạm đua với lượt phát hiện sạch | Cả hai ghi bằng upsert trên PK: bên nghe đặt `voided_at` (thêm dòng có `clean_at` trống nếu chưa có), lượt phát hiện chỉ điền `clean_at` khi đang trống. Thứ tự nào cũng ra một dòng vừa có mốc vừa bị void; mức chỉ đếm dòng có `clean_at` và không có `voided_at` |

### Sửa đi kèm (làm cùng change, sau khi duyệt)

- **Delta spec**: `trust/trust-tiers` thêm câu 1 (dời), 2 (có lại), 3 (cộng dồn, tạm ẩn không tính), 4 (còn sau
  khi xoá), 6 (tuổi từ lúc tạo), 9 (bảng con số mới); `trust/quotas` thêm "rút về nháp" vào cách giải phóng chỗ
  (câu 8); `group/group-roles` thêm "tụt mức không mất vai" (câu 7).
- **Design `add-listings`**: thêm `shown_ms`, `shown_since` (mục 5); `listing.state.changed` mang `fault`; cổng
  `ListingQuotaFacts`, `ListingDashboardFacts`, `shownCandidates`; đổi `trust.tier.raised` → `trust.tier.changed`.
- **TK 20**: câu 1, 2, 3, 4, 6, 7, 8 (bỏ "chờ tin được duyệt" khỏi cách giải phóng chỗ), 9. **TK 28**:
  `trust.cleanShownDays` 7. **TK 5**: tụt mức không mất vai (câu 7).
- `config-keys.ts`: `trust.cleanShownDays`.

## Risks / Trade-offs

- **Lượt hằng ngày trễ thì lên mức trễ**: tin vừa đủ 7 ngày lúc 01:00 phải chờ tới 00:30 hôm sau. Spec đã nói "lượt
  tính lại hằng ngày"; lối đã bán tính ngay.
- **Hạn mức khoá theo người**: mọi lượt gửi của một người xếp hàng trong vài mili giây của transaction gửi. Một
  người không gửi hàng trăm tin một lúc (nhịp gửi tối đa 20 / giờ), nên không thành nút thắt.
- **`trust` gọi `listing` trong transaction của `listing`**: hai module nối chéo qua cổng. Không vòng import nhờ cổng
  khai ở module dùng và `buildApp` nối; test dựng `trust` với cổng giả.
- **Tuổi từ lúc tạo** (câu 6) cho kẻ nuôi tài khoản tối đa 7 ngày tuổi "miễn phí"; chặn được bằng thêm
  `email_verified_at` vào `identity` nếu cần — một migration nhỏ, không đổi luật.

## Migration Plan

Một migration `init_trust` (3 bảng, 2 enum, CHECK). Migration nhỏ trong `listing`: `shown_ms`, `shown_since` (tin
có sẵn tính từ `first_live_at` nếu đang hiển thị không tạm ẩn — chỉ có dữ liệu dev). Lùi: revert code, drop bảng;
`listing` quay về bản tạm của `ListingTrustPort`.

## Đã duyệt (12/10/2026)

| #      | Đề xuất                                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| Q1–Q11 | Trả lời 11 câu hỏi mở theo mục 2                                                                                     |
| T1     | Tin sạch là dữ kiện ghi một lần, mức là kết quả tính lại; mốc sạch = lúc phát hiện (mục 5)                           |
| T2     | `listing` giữ "thời gian được thấy" (`shown_ms`, `shown_since`); `trust` hỏi qua cổng                                |
| T3     | Hạn mức khoá theo người trong transaction gửi; lỗi trường trả trước lỗi hạn mức                                      |
| T4     | Một sự kiện `trust.tier.changed` thay `trust.tier.raised`; tụt về T0 không đặt lại "tài khoản mới" lên tin đang hiện |
| T5     | `tierOf` đọc kết quả đã lưu, không tính lại trong request đọc                                                        |
