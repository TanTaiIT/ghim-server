# Design

> **Đã duyệt 15/10/2026.** Người dùng giao tech lead chọn phương án ("commit và làm tiếp"), theo tiêu chí chạy ổn với
> lượng lớn người dùng.

## Context

- Nguồn: `docs/RA-SOAT-15-10-2026.md` mục C2, T20, L8, C11, đọc lại code ngày 15/10/2026.
- `screening` sở hữu lượt máy duyệt, dòng kiểm ảnh và bảng đánh dấu mới; `listing` sở hữu tin và lý do hạn chế. Tác
  động chéo đi qua outbox như cũ.

## Decisions

### 1. Mọi ảnh của lượt đều được xếp kiểm (C2)

`scheduleChecks` (bên nghe `listing.listing.submitted`) không còn dừng khi lượt đã kết luận:

- thêm dòng `pending` cho ảnh chưa có dòng;
- xếp việc kiểm cho mọi ảnh của lượt mà dòng còn `pending` và **chưa xếp, hay đã xếp quá thời gian chờ ảnh** (mục 2).

Việc kiểm ghi kết quả có điều kiện `status = 'pending'`. Hai việc trùng cho cùng một ảnh thì việc sau không ghi đè, và
không kết luận lại lần nữa.

Kết quả về muộn vẫn chỉ ghi vào dòng kiểm ảnh: lượt đã kết luận không mở lại (spec machine-decision "Kết quả ảnh về
muộn"). Ảnh có kết quả là ứng viên so trùng cho mọi tin gửi sau.

### 2. `queued_at`: xếp lại ảnh kẹt, không dồn việc trùng (T20)

Cột mới `image_checks.queued_at` (nullable) ghi lần xếp việc kiểm gần nhất.

- **Xếp** = một câu `UPDATE … SET queued_at = now WHERE status = 'pending' AND (queued_at IS NULL OR queued_at <
hạn) RETURNING image_id`. Chỉ ảnh được trả về mới được gửi việc, nên nhiều tiến trình, bên nghe chạy lại, hay lượt
  rà chồng nhau không gửi trùng trong một khoảng chờ.
- **Gửi việc hỏng** → trả `queued_at` về trống cho đúng các ảnh đó rồi ném. Lượt thử lại của bên nghe xếp lại ngay,
  không phải chờ lưới an toàn.
- **Lưới an toàn mỗi 5 phút** xếp lại ảnh `pending` có `queued_at` trống hay cũ hơn thời gian chờ ảnh, tối đa 500 ảnh
  mỗi lượt. Dòng có sẵn trước bản sửa mang `queued_at` trống, nên được xếp dần theo trần đó.
- Partial index `(queued_at) WHERE status = 'pending'` cho lượt quét này.

### 3. Lưới an toàn hạn chế một lần mỗi phiên bản (C2)

Với mỗi lô tin đang hiển thị có ảnh chưa có kết quả:

1. Ảnh chưa có dòng thì thêm `pending` (chủ là người đăng tin) rồi xếp như mục 2.
2. Ghi dấu vào bảng mới `screening_unchecked_marks (listing_id, listing_version)`: khoá chính hai cột, không khoá
   ngoại chéo module.
3. Phát `screening.listing.restricted` chỉ cho dòng vừa ghi được (`createManyAndReturn skipDuplicates`), trong cùng
   transaction.

Vì vậy mỗi phiên bản tin bị hạn chế vì lý do này tối đa một lần. Người duyệt cho đạt (`confirmLive`, không đổi phiên
bản) là cuối cùng. Người đăng sửa tin thì có phiên bản mới; lượt gửi mới tự xếp kiểm ảnh, nên lưới an toàn hiếm khi
gặp lại.

### 4. Sự kiện hạn chế mang phiên bản (L8)

- `screening.listing.restricted` mang thêm `listingVersion`. Ở bên nghe nó là trường tuỳ chọn, để sự kiện còn nằm
  trong outbox từ trước bản sửa vẫn đọc được.
- `restrictByMachine(listingId, version?)` chỉ áp khi tin còn đúng phiên bản đó; tập trạng thái áp được giữ như cũ.
- Bên nghe của `review` vẫn chỉ sinh việc cho tin đang hiển thị, như cũ.

### 5. Quét lại lần hai sau khi bật cụm chắc (C11)

- `jobs.send` nhận thêm `startAfter`. pg-boss có sẵn tuỳ chọn này; bản giả của test ghi lại nó.
- Bật thật cụm mức chắc gửi hai việc `rescan-phrase`:
  - ngay sau commit, như cũ;
  - `startAfter` = bây giờ + thời gian chờ ảnh + 10 phút (một chu kỳ rà 5 phút cộng độ trễ outbox).
- **Cả hai lượt quét bỏ qua tin đã từng có lượt `recall` vì chính cụm đó** (cụm nằm trong `hits` của lượt `recall`).
  Tin bị rút về rồi được người duyệt cho đạt đã sang phiên bản mới, nên chống trùng theo phiên bản không đủ; bỏ qua
  theo cụm giữ cho lượt cho đạt của người là cuối cùng. Tin sửa sau đó qua máy với luật hiện hành, nên không cần quét
  lại.
- Chọn quét lần hai thay vì so lại luật lúc kết luận: phủ được cả tin đã kết luận trước khi bật mà kết quả tới tin
  sau lượt quét đầu, không thêm truy vấn vào đường gửi tin, và dùng lại đường quét đã có test.

## Migration

`fix_audit_image_checks`, do Prisma sinh, không có SQL viết tay:

- `ALTER TABLE image_checks ADD COLUMN queued_at timestamptz(3)` (nullable, không mặc định);
- `CREATE INDEX image_checks_pending_queued_idx ON image_checks (queued_at) WHERE status = 'pending'`;
- `CREATE TABLE screening_unchecked_marks (listing_id uuid, listing_version int, marked_at timestamptz(3),
PRIMARY KEY (listing_id, listing_version))`.

Không mất dữ liệu.

## Risks / Trade-offs

- **Lượt rà đầu sau khi triển khai** xếp lại mọi ảnh `pending` tồn đọng, mỗi lượt tối đa 500. Mỗi việc đọc tới 5 MB
  và băm, 4 việc song song mỗi tiến trình; hàng việc tự giãn.
- **Hai việc kiểm cùng ảnh** vẫn có thể chạy khi một lượt xếp lại trúng lúc việc cũ đang chạy chậm. Việc sau không ghi
  đè (mục 1), nên chỉ tốn công đọc ảnh.
- **Tin đã được người cho đạt khi ảnh chưa có kết quả** (khe vài giây) không tự bị xét lại: proposal "Cố ý chưa làm".
