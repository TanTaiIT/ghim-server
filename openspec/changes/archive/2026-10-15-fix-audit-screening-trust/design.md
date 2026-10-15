# Design

> **Đã duyệt 15/10/2026.** Người dùng giao tech lead chọn phương án ("tiếp giúp tôi"), theo tiêu chí chạy ổn với lượng
> lớn người dùng.

## Context

- Nguồn: `docs/RA-SOAT-15-10-2026.md` mục T21, T22, T23, T24 và phần còn lại của C1 (cặp tin sạch), đọc lại ở
  52b3344.
- `screening` sở hữu lượt máy duyệt và dòng kiểm ảnh; `trust` sở hữu dữ kiện tin sạch và kết quả mức; `listing` sở hữu
  tin. Ba điểm tech lead chốt: proposal và các mục dưới.

## Decisions

### 1. Lỗi tạm và lỗi thật của việc kiểm ảnh (T21)

- Cột mới `image_checks.error_kind` (`transient` / `permanent`), có đúng khi `status = 'error'` (CHECK).
  - `transient`: `readImage` vẫn ném sau `IMAGE_CHECK_RETRIES` lượt.
  - `permanent`: kho trả "không có tệp", hay tệp không giải mã được.
- `retryTransient(tx, imageIds)` đưa dòng lỗi tạm về `pending`: bỏ loại lỗi, số lượt, `queued_at`, giờ kiểm. Câu lệnh
  có điều kiện `status = 'error' AND error_kind = 'transient'`.
- `openRun` gọi nó trong transaction của lượt gửi, **trước** khi kết luận. Lượt mới vì thế chờ ảnh như ảnh chưa kiểm,
  và sau commit `scheduleChecks` xếp việc (`queued_at` trống).
  - Gọi ở `scheduleChecks` thì đã muộn: lượt đã kết luận "giữ, lỗi".
- Lưới an toàn không đưa lỗi về `pending`. Làm thế thì nó tự hạn chế lại tin đang hiện mà người duyệt đã cho đạt.
- Migration gán `transient` cho mọi dòng `error` có sẵn: mỗi dòng được kiểm lại một lần, dòng lỗi thật lại lỗi ngay.

### 2. Quét lại khi đổi cụm mức chắc đang bật (T22)

`sendRescans(id, now)` gửi hai việc quét: ngay, và sau thời gian chờ ảnh + `RESCAN_SETTLE_MINUTES`. Ba đường dùng nó:

| Đường                | Gửi khi                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------- |
| bật thật             | cụm mức chắc (như cũ)                                                                        |
| bật một cụm đang bật | cụm mức chắc — làm lại lượt quét đã lỡ; không tạo phiên bản luật mới                         |
| PATCH cụm            | sau khi ghi, cụm mức chắc + đang bật, và trước đó chưa phải mức chắc hay ngoại lệ bị thu hẹp |

- PATCH đọc cụm trước khi ghi.
- Nới ngoại lệ, hạ xuống mức mơ hồ, hay cụm đang chạy thử thì không quét.
- Gửi lặp vô hại: lượt quét đọc lại cụm lúc chạy, `recalledFor` bỏ qua tin đã rút vì cụm, và lượt `recall` duy nhất
  theo (tin, phiên bản).

### 3. Tính mức dưới khoá theo tài khoản (T23)

- `trust.repository.withAccountLock(accountId, work)`: một transaction mở bằng
  `pg_advisory_xact_lock(hashtextextended('trust-tier:' || id, 0))`. Khoá này khác khoá `trust-submit:` của hạn mức.
- `recompute` đọc kết quả hiện có và tin sạch còn hiệu lực bằng `tx`, tính, rồi ghi trong cùng transaction. So-và-ghi
  theo dấu băm vẫn còn, nhưng dưới khoá không còn đua; bỏ vòng thử lại.
- Dữ kiện tin sạch (thêm, vô hiệu, khôi phục) ghi ngoài khoá. Mỗi lượt ghi dữ kiện kéo theo một lượt tính chạy sau nó,
  nên lượt tính sau cùng luôn thấy dữ kiện mới nhất.

### 4. Kết luận trong transaction của lượt (T24)

- `duplicateCandidates`, `whitelistCandidates`, `ruleVersion` nhận `tx`; `rules.at(version, tx)` truyền xuống. Ảnh
  được so lần lượt trên kết nối của transaction, không `Promise.all` xin thêm kết nối.
- Phần đọc của lượt kết luận (kết quả ảnh, ảnh trùng, bộ luật) chạy trong `repository.guarded(tx, work)`:
  - `SAVEPOINT` trước khi đọc, `RELEASE` khi xong, `ROLLBACK TO SAVEPOINT` khi lỗi.
  - Lỗi thì ghi cảnh báo, rồi kết luận "giữ cho người" nguyên nhân `error` với bộ luật phiên bản 0 (có sẵn trong bộ
    nhớ, không đọc DB).
  - Lượt gửi vẫn được nhận (spec machine-decision).
- `safetyNet` và `concludeWaiting` kết luận lần lượt (`sequentially`) thay vì mở song song một transaction cho mỗi
  lượt.

### 5. Cặp tin sạch theo trạng thái hiện tại (phần còn lại của C1)

- Cổng mới `ListingFactsService.stateOf(listingId)` → `{ state, fault }` hay `null`.
- Bên nghe `listing.state.changed` của `trust` giữ hai lối kích hoạt cũ, nhưng chỉ ghi khi trạng thái hiện tại còn
  đúng:
  - vô hiệu khi tin **đang** bị gỡ / từ chối vì vi phạm;
  - khôi phục khi tin còn và **không** ở trạng thái đó.
- Giữ hành vi hiện tại: sửa tin sau khi bị gỡ vì vi phạm không trả lại tư cách; chỉ khôi phục hay khiếu nại thắng mới
  trả.

## Migration

`fix_audit_image_retry`: Prisma sinh enum và cột, phần SQL viết tay gồm backfill và CHECK.

```sql
UPDATE "image_checks" SET "error_kind" = 'transient' WHERE "status" = 'error';
ALTER TABLE "image_checks" ADD CONSTRAINT "image_checks_error_kind_check"
  CHECK (("status" = 'error') = ("error_kind" IS NOT NULL));
```

## Risks / Trade-offs

- **Savepoint với Prisma** (driver adapter `pg`): transaction tương tác giữ một kết nối, nên `SAVEPOINT` / `ROLLBACK TO`
  đi đúng kết nối. Có test DB giữ điều đó.
- **Khoá theo tài khoản** làm các lượt tính của cùng một người xếp hàng. Lượt tính ngắn, và người khác nhau không chặn
  nhau.
- **Ảnh lỗi tạm có sẵn** đều được kiểm lại một lần ở lượt gửi sau: thêm việc kiểm, không đổi kết quả của tin đang hiện.
