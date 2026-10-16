# Design

> **Đã duyệt 16/10/2026.** Người dùng giao tech lead chọn phương án ("giải quyết những vấn đề ở đợt 4 luôn"), theo tiêu
> chí chạy ổn với lượng lớn người dùng.

## Context

- Nguồn: `docs/RA-SOAT-15-10-2026.md` mục L7, L9, L10, L13, đọc lại ở 52d3c34.
- Lượt tính mức của `trust` chạy trong `withAccountLock` — khoá advisory riêng `trust-tier:<accountId>`
  (fix-audit-screening-trust, T23) — và phát `trust.tier.changed` cùng transaction.
- `listing` gỡ lý do "tài khoản mới" ở bên nghe `trust.tier.changed` (`onTierRaised`), chỉ trên tin đang mang lý do đó.
- `image_checks` không có khoá ngoại tới `images` (không FK chéo module); `media` xoá dòng ảnh ở ba lượt dọn: ảnh chưa
  xác nhận quá hạn, ảnh đã bỏ, ảnh của tin đã xoá hẳn.

## Decisions

### 1. Đọc mức trong transaction (L7)

- `TrustRepository.holdTier(tx, accountId)`: `pg_advisory_xact_lock_shared` trên cùng khoá `trust-tier:` rồi đọc
  `trust_tiers` bằng `tx`. Khoá chung không chặn nhau giữa các lượt lên bảng; chỉ chờ / bị chờ bởi lượt tính mức.
- `TrustTierService.tierIn(tx, accountId)`, `ListingTrustPort.tierIn` — `decide` của `listing/system` đọc mức trong
  `before(tx, locked)` của `repository.change` (sau khoá dòng tin), bỏ lượt đọc tin trước transaction. Chỉ mũi tên
  lên bảng (máy cho qua, người duyệt đạt / khôi phục, khiếu nại thắng) đọc mức; gỡ, từ chối, giữ không chờ khoá đó
  (sửa 16/10/2026 sau CI: lượt gỡ chờ lượt tính mức đang dừng trong test T23 tới quá hạn transaction).
- Thứ tự khoá: dòng tin `FOR UPDATE` → khoá chung `trust-tier:`. Lượt tính mức giữ khoá riêng và chỉ đọc dữ kiện tin
  (không khoá dòng tin) — không có vòng chờ.
- Bỏ: bên nghe đổi mức quét lại cả tin đang kiểm — vẫn còn khe giữa lượt quét và lượt lên bảng.

### 2. Tập tính lại hằng ngày (L9)

- `recomputeCandidates` giữ điều kiện cũ và thêm: `t.counted_clean < count(tin sạch còn hiệu lực của người đó)` —
  T3 còn tin chưa tính (mới sạch, hay đang dời vì trần 7 ngày) thì vào tập; đủ rồi thì ra. Truy vấn con đi theo chỉ mục
  `trust_clean_listings(account_id)`, chỉ chạy cho dòng T3 đúng phiên bản bảng con số.
- Bỏ: tính lại mọi T3 mỗi ngày — tốn mà phần lớn không đổi.

### 3. Dấu ảnh đi theo ảnh (L10)

- `media`: `deleteUnconfirmedBefore`, `deleteReleased`, `deleteByOwners` chạy trong transaction và phát
  `media.images.deleted` `{ imageIds }` khi xoá được dòng nào (một sự kiện mỗi lô ≤ 500 mã).
- `screening`: bên nghe kiểm payload bằng zod, gọi `onImagesDeleted` → `deleteImageChecks` (mọi trạng thái). Lượt còn
  chờ ảnh đó chỉ là lượt của phiên bản cũ (ảnh bị bỏ khi chủ lưu bản mới, hay tin đã xoá hẳn); lưới an toàn kết luận khi
  hết chờ. Nhận trùng vô hại.
- Bỏ: lượt quét định kỳ đối chiếu `image_checks` với `media` — quét cả bảng mỗi lần, lớn dần theo số ảnh.
- Bỏ: lọc trong `duplicateCandidates` bằng cách hỏi `media` từng ứng viên — thêm một lượt gọi chéo module vào đường
  chấm của mỗi lượt gửi.

### 4. L13 không sửa ở đây

- Khoá ngoại `RESTRICT` chỉ chặn lượt xoá hẳn nhóm / danh mục, mà lượt đó chưa có. Ghi vào proposal
  `add-data-retention` (phần "Chuyển từ rà soát"), cùng khe "xoá hẳn tài khoản kéo ảnh theo khoá ngoại không phát
  sự kiện".

## Risks / Trade-offs

- Lượt tính mức của một người chờ các lượt lên bảng đang giữ khoá chung của người đó (vài mili giây mỗi lượt).
- Dấu ảnh của ảnh đã xoá mất luôn — ảnh lừa đảo bị xoá hẳn thì lần đăng lại sau đó không còn bị bắt là "ảnh trùng".
  Ảnh chỉ bị xoá hẳn khi chủ đã bỏ ảnh hay tin đã xoá hẳn (theo hạn lưu); tin vi phạm còn giữ trong hạn lưu.
