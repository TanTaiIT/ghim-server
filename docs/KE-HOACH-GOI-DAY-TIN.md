# Kế hoạch gói đẩy tin, tin nổi bật — chuẩn bị trước khi có người dùng thật

> Viết 17/10/2026 theo yêu cầu chủ dự án. TK 29 xếp "Gói đẩy tin, tin nổi bật" và "Ví Xu, phí đăng tin" vào phần **hoãn
> lại** nhưng đòi **giữ chỗ trong dữ liệu ngay từ đầu** (TK 30: `rankAt`, `featuredUntil`, phí bằng 0). Bản này nói ba
> điều: hệ cũ đã làm gì, hệ mới hôm nay đứng ở đâu, và làm gì **ngay bây giờ** — lúc đổi dữ liệu còn rẻ vì chưa có
> người dùng thật — để ngày bật chỉ là một change bình thường, không phải chuyển đổi dữ liệu hay phát hành lại app.
> Mọi con số ở đây là **đề xuất**, chưa phải quyết định; TK chưa có phần cho tính năng này — câu hỏi cần chốt ở mục 7.

## 1. Tính năng là gì, và ba luật không được phá

**Gói đẩy tin** = người đăng trả Xu để tin của mình được nhiều người thấy hơn trong một thời gian. Ba hiệu ứng hệ cũ đã
có và nên giữ nguyên tên để dữ liệu, app cũ và mới nói cùng một thứ:

| Hiệu ứng        | Làm gì                                                                   | Hết khi                          |
| --------------- | ------------------------------------------------------------------------ | -------------------------------- |
| `rank_to_top`   | đưa tin lên đầu bảng tin như vừa lên bảng (đổi vị trí xếp hạng)          | tức thì, tin trôi dần như thường |
| `featured`      | tin vào dải "Tin nổi bật" (tối đa N thẻ) trên bảng tin / danh mục / nhóm | hết `featuredUntil`              |
| `extend_expiry` | cộng thêm ngày hiển thị                                                  | — (cân nhắc bỏ, xem mục 7.3)     |

Ba luật của TK mà gói đẩy **không được** phá, và cách giữ:

1. **Không gì tự mở tin cho người mua** (TK 26 luật 3, nguyên tắc 2). Mua gói không thay đổi trạng thái, cờ tạm ẩn hay
   lý do hạn chế của tin: tin đang chờ duyệt, bị gỡ, tạm ẩn hay hiển thị hạn chế **không mua được** gói (409), và gói
   đang chạy trên một tin vừa bị gỡ / tạm ẩn chỉ nằm im — tin hiện lại thì hiệu ứng còn hạn mới có tác dụng.
2. **Vị trí trên bảng tin không đổi khi sửa hay gia hạn** (TK 19), tin trùng của chính mình kế thừa vị trí tin cũ (TK 14).
   Đẩy tin là **đường duy nhất** đổi vị trí, có trả phí và có thời gian chờ; "xoá rồi đăng lại để đẩy" vẫn bị chặn như
   hôm nay.
3. **Máy không phạt, người dùng biết vì sao** (TK 4). Từ chối mua phải nói lý do (chưa đủ mức, tin đang hạn chế, còn
   thời gian chờ, thiếu Xu); mọi lượt trừ Xu có dòng sổ cái người dùng tự đọc được.

## 2. Hệ cũ đã làm gì (`docs/VueSer`, `docs/market`)

Đáng giữ lại nguyên hình — đã chạy thật, đã đo:

- **Catalog gói** `ListingProduct { code, name, description, effect, durationDays, cooldownHours, price {amount, currency:
'xu'} | null, enabled, order }` — master soạn, áp toàn sàn. `price null` = chưa mở bán.
- **Mua gói** `POST /listings/{id}/bump`: 400 tin không ở trạng thái hiện trên bảng, 403 "không đủ hạng để đẩy tin ở trục
  của tin này" (gác theo mức tin cậy), 404 tin không thuộc phạm vi.
- **Ví Xu là sổ cái, không phải con số** (`docs/market/docs/rules/xu-wallet.decision.md`): `wallets { balance = cache }`,
  `xu_transactions { amount ±, type ∈ topup · post_fee · product_purchase · refund · promo_grant · admin_adjust,
balanceAfter, refs, idempotencyKey unique }`; append-only, sai thì ghi dòng ngược dấu; **Xu một chiều** (nạp vào, không
  đổi ngược ra tiền — ngoài phạm vi giấy phép trung gian thanh toán); Xu không có hạn sử dụng.
- **Chính sách đã quyết**: tin bị từ chối khi duyệt → hoàn; tin bị gỡ sau khi lên bảng → không hoàn; chỉ trừ khi tin thật
  sự vào bảng / hàng chờ; tặng Xu khai trương (`promo_grant`) đúng ngày bật phí.
- **Nạp tiền** (VietQR) đã dựng rồi **gỡ có chủ ý** vì chưa có nhu cầu; bài học khi dựng lại ghi ở ADR trên (tiền tố mã
  đối soát, sandbox `dev.vietqr.org`, `transType D` là tiền ra, cộng theo số tiền thật nhận).
- Dải "Tin nổi bật" ở app cũ: tối đa 6 thẻ (`MAX_FEATURED`), "dải để lướt, không phải bảng tin thứ hai".
- Việc nền "tự động đẩy tin theo lịch cho người bán chuyên nghiệp" từng có trong luật hệ cũ — **chưa** nên mang sang (mục 7.6).

## 3. Hệ mới hôm nay đứng ở đâu

- Vị trí trên bảng tin = `listings.first_live_at` (đặt một lần khi lên bảng lần đầu; tin trùng của chính mình kế thừa qua
  `rankAsListingId`); ba index bảng tin / danh mục / nhóm xếp `first_live_at desc, id desc`; con trỏ trang theo cặp
  (`firstLiveAt`, `id`). Nghĩa là **chưa có cột vị trí riêng** — `first_live_at` đang kiêm `rankAt` của TK 30.
- Chưa có `featured_until`, chưa có khái niệm phí (response gửi tin không có `fee`), chưa có ví. TK 30 đòi giữ chỗ ba thứ
  này "ngay từ đầu" — là khoảng trống duy nhất của hệ mới so với TK.
- Đã có sẵn mọi hạ tầng gói đẩy cần: bảng con số có phiên bản (`platform`), nhật ký bất biến cho thao tác master, outbox
  - ma trận thông báo, việc nền có sổ `job_runs`, hạn lưu + tạm giữ bằng chứng, mức tin cậy (`trust.tierOf`), `listing_submissions`
    (dữ kiện định giá: ai đăng bao nhiêu, danh mục nào — thay `posting-stats` của hệ cũ).

## 4. Thiết kế đề xuất khi bật

### 4.1 Hai module mới, hai chủ dữ liệu

| Module      | Sở hữu                                                                                                                                    | Không làm                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `wallet`    | `wallets`, `wallet_transactions` (sổ cái Xu), `wallet.apply(tx, …)` là **đường ghi duy nhất**                                             | không biết gói là gì; sau này nhận thêm `payments` (nạp) |
| `promotion` | `promotion_products` (catalog), `promotion_purchases` (lượt mua: tin, gói chụp lại, giá, dòng sổ cái, `appliedAt`, `expiresAt`, `status`) | không đổi cột của tin                                    |

`listing` vẫn là chủ duy nhất của `rank_at`, `featured_until` (TK 30 "chỉ Tin đăng đổi trạng thái tin"): `promotion` gọi
cổng `listing.applyPromotion(tx, { listingId, version, effect, until })` **trong cùng transaction** với lượt trừ Xu — ghi có
điều kiện theo phiên bản tin, tin đổi giữa chừng thì cả lượt quay lui, Xu không mất. Thứ tự dựng: `wallet` → `listing`
(đã có) → `promotion` (sau `trust`, trước `notification`).

### 4.2 Dữ liệu

- `listings.rank_at` (NOT NULL khi đã lên bảng; = `first_live_at` lúc lên bảng, `rank_to_top` đặt = bây giờ), ba index bảng
  tin chuyển sang `rank_at`; `first_live_at` giữ nguyên nghĩa "lần đầu lên bảng" cho `trust`, N31, hạn lưu.
- `listings.featured_until` + index từng phần `WHERE featured_until IS NOT NULL`; `listings.last_bumped_at` cho thời gian chờ.
- `promotion_products`: như hệ cũ, thêm `scope` (`marketplace` · `group` · `both`) và `min_tier`.
- `promotion_purchases`: `listing_id`, `account_id`, `product_code` + bản chụp (`effect`, `duration_days`, `price`), `wallet_transaction_id`,
  `applied_at`, `expires_at`, `refunded_at`, `status` (`applied` · `expired` · `refunded`), `idempotency_key` unique.
- `wallets (account_id PK, balance)`, `wallet_transactions (account_id, amount, type, balance_after, refs jsonb, note, idempotency_key unique, created_at)`;
  CHECK `balance >= 0`; trừ Xu bằng `UPDATE … SET balance = balance - x WHERE balance >= x` trong transaction.

### 4.3 Luật mua gói

- Chỉ tin `live`, **hiển thị đầy đủ** (không lý do hạn chế), không tạm ẩn, của chính mình, chưa trong thời gian chờ của
  gói đó; người mua không đang **tạm khoá đăng tin** (3 điểm gậy). Mức tối thiểu theo `product.min_tier` (đề xuất T1 —
  T0 đang hạn chế "tài khoản mới" nên không lên bảng tin, mua cũng vô nghĩa).
- `rank_to_top` trong nhóm: chỉ xếp lại trong bảng tin **của nhóm đó**; tin sàn chung chỉ trên sàn chung.
- Sửa tin sau khi mua: qua máy lại như thường; máy giữ thì tin biến khỏi bảng và **đồng hồ gói vẫn chạy** (người đăng tự
  gây ra, như luật ngày hiển thị). Tin bị gỡ vì vi phạm: không hoàn. Tin bị từ chối lúc máy giữ sau khi sửa: không hoàn
  (đã hưởng dịch vụ trước đó). Khiếu nại thắng / ân xá: hoàn phần ngày chưa hưởng (mục 7.4).
- Mỗi lượt mua một dòng sổ cái `product_purchase` kèm `refs { listingId, purchaseId, productCode }`; hoàn là `refund` ngược
  dấu trỏ về cùng `purchaseId`.
- Master soạn gói qua bàn vận hành — mọi thay đổi vào nhật ký; master cấp / trừ Xu tay (`admin_adjust`, bắt buộc lý do +
  `idempotencyKey`, nhật ký) — đây là đường "nạp" duy nhất của giai đoạn 1.

### 4.4 Hiện ra sao

- Bảng tin, danh mục, nhóm: xếp theo `rank_at`; dải "Tin nổi bật" riêng ở đầu (tối đa `promotion.featuredStripSize`, đề xuất
  6; tin nổi bật hết `featured_until` tự rơi khỏi dải — việc theo lịch mỗi giờ dọn cột và báo người đăng). Tin nổi bật vẫn
  chịu mọi luật "ai thấy một tin" (TK 19): hạn chế hay tạm ẩn thì không vào dải.
- DTO tin thêm `featuredUntil` (null = không), `promotion` cho chủ tin (gói đang chạy, hết lúc nào, còn chờ bao lâu).
- Thông báo (ma trận `promotion`): N49 "đã đẩy / đã nổi bật tới …", N50 "tin nổi bật hết hạn", N51 "ví biến động" (nhóm
  "ví Xu" — hệ cũ đã có nhóm này, TK 24 hiện có chín nhóm, cần thêm nhóm thứ mười khi bật).

### 4.5 Con số (bảng con số có phiên bản, nhóm "Đẩy tin")

`promotion.featuredStripSize` 6 · `promotion.bumpCooldownHours` 24 · `promotion.minTier` 1 · `promotion.maxBumpsPerDay` 3 ·
`promotion.refundOnAppealWin` true. Giá và thời hạn từng gói nằm trong catalog, không trong bảng con số.

### 4.6 Hạn lưu, nhật ký, vận hành

- Sổ cái Xu và lượt mua là **chứng từ**: giữ theo luật kế toán (Việt Nam: tối thiểu 10 năm cho chứng từ) — không theo hạn
  lưu tài khoản 90 ngày; khi xoá hẳn hồ sơ, `account_id` trong sổ cái giữ nguyên (tài khoản ẩn danh vẫn còn dòng). Cần
  luật sư xác nhận cùng rà soát pháp lý đang mở (TK 29 mục 2).
- Catalog, cấp Xu tay, hoàn Xu: `appendAudit` cùng transaction. Bàn vận hành: doanh thu Xu theo ngày / gói / danh mục,
  số dư tổng (phải = tổng sổ cái — việc đối chiếu hằng đêm, lệch thì báo master).

## 5. Làm ngay bây giờ — change `prepare-promotions` (nhỏ, không đổi hành vi người dùng thấy)

Mục tiêu: ngày bật chỉ thêm module, không chuyển đổi dữ liệu, không phát hành lại app vì đổi hợp đồng API.

1. `listings.rank_at` (backfill = `first_live_at`), ba index bảng tin chuyển sang `rank_at`, con trỏ trang theo `rankAt`;
   `rankAsListingId` đặt `rank_at` của tin cũ; `first_live_at` giữ nguyên nghĩa cũ. Test bảng tin không đổi kết quả.
2. `listings.featured_until` (luôn null), DTO tin thêm `featuredUntil: null` — app dựng dải nổi bật từ đầu, hôm nay rỗng.
3. Hợp đồng phí: `POST /listings/:id/submit` và `GET /me/listings/quota` trả `fee: { amount: 0, currency: 'xu' }`; app hiện
   "Miễn phí" ngay bây giờ (TK 29). Luật phí thuần một chỗ (`listing/calc/fee.calc.ts`, trả 0) để ngày bật chỉ đổi hàm.
4. Thêm nhóm thông báo `wallet` vào enum `notification_category` ngay (enum ADD VALUE là migration riêng; thêm sau khi có
   dữ liệu cũng được nhưng tiện hơn khi làm cùng lượt), chưa có dòng ma trận nào.
5. TK: đề xuất phần mới "Gói đẩy tin và ví Xu" (nội dung mục 1, 4 ở đây, rút gọn) để chủ TK duyệt — tôi viết bản nháp,
   không tự sửa TK.
6. OpenSpec: proposal `add-wallet` và `add-promotions` kèm spec delta và câu hỏi mở — để trong `openspec/changes/` như
   các change đợt 1–7 từng nằm chờ.

Ước lượng: change nhỏ nửa ngày (mục 1–4), bản nháp TK + hai proposal nửa ngày.

## 6. Lộ trình bật

| Bước | Khi nào                          | Gồm                                                                                                                                                                                                                |
| ---- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | ngay bây giờ                     | mục 5                                                                                                                                                                                                              |
| 1    | có người dùng thật, muốn thử gói | `add-wallet` (sổ cái, master cấp Xu, ví trong app), `add-promotions` (catalog, mua gói, hiệu ứng, dải nổi bật, N49–N51) — **không nạp tiền**: Xu do master tặng (`promo_grant`), đủ để đo người dùng có dùng không |
| 2    | quyết thu tiền                   | `add-topup` (VietQR theo bài học hệ cũ, đối soát, hoàn), điều khoản sử dụng (Xu một chiều), kế toán / hoá đơn                                                                                                      |
| 3    | (tuỳ)                            | phí đăng tin bằng Xu (`fee > 0`, hoàn khi bị từ chối, N tin miễn phí mỗi tháng) — cùng hạ tầng, chỉ đổi luật phí                                                                                                   |

## 7. Câu hỏi cần chủ dự án chốt trước bước 1

1. **Giá và thời hạn khởi đầu** của từng gói (hệ cũ để master gõ; cần bộ khởi đầu để khởi động bảng).
2. **Mức tối thiểu** được mua gói: T1 (đề xuất) hay T0 cũng mua được nhưng tin vẫn hạn chế.
3. **Giữ `extend_expiry` không**: TK 19 đã cho gia hạn miễn phí và tin hết hạn gia hạn được; bán "thêm ngày" chỉ có nghĩa
   nếu gia hạn sau này tính phí. Đề xuất: bỏ ở bước 1.
4. **Hoàn Xu khi nào**: khiếu nại thắng / ân xá có hoàn phần chưa hưởng không (đề xuất có); tin bị gỡ vì sai sót (sửa được)
   trong lúc gói chạy — không hoàn (đề xuất).
5. **Đẩy tin trong nhóm**: cho phép không, chủ nhóm có được tắt cho nhóm mình không (đề xuất: cho phép, chủ nhóm tắt được
   trong cài đặt nhóm; Xu vẫn về sàn, nhóm không chia).
6. **"Tự động đẩy theo lịch" cho người bán chuyên** (hệ cũ có): bỏ ở bước 1 — là một gói thuê bao, cần luật riêng.
7. **Dải nổi bật hiện ở đâu**: đầu bảng tin sàn chung, đầu từng danh mục, đầu bảng tin nhóm (đề xuất cả ba, mỗi chỗ tối đa
   6, xoay vòng theo `featured_until` gần hết trước để ai cũng được lên đầu một lúc).
8. **Pháp lý**: Xu một chiều và điều khoản; thời hạn giữ sổ cái; hoá đơn khi nạp — gộp vào rà soát pháp lý đang mở.

## 8. Rủi ro đã thấy

- Đổi index bảng tin sang `rank_at` trên bảng có dữ liệu thật là đổi index lớn nhất của hệ — làm ở bước 0 khi bảng còn
  trống là lý do chính của bản kế hoạch này.
- Xu là tiền: mọi đường ghi phải qua một hàm có `idempotencyKey`; app gọi lại sau mất mạng không được trừ hai lần; test
  song song hai lượt mua cùng tin, cùng ví.
- Gói đẩy là động cơ cho kẻ lập nhiều tài khoản mua chéo: mức tối thiểu T1 + thời gian chờ + trần mỗi ngày chặn phần lớn;
  phần còn lại là việc của máy duyệt như mọi tin.
