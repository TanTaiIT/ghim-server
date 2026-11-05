# Design

## Context

Module `group` sở hữu bảng `groups`; bảng này hiện không mang vị trí. Tỉnh/thành là dữ liệu tham
chiếu dùng chung ở bảng `provinces` (khoá `code`), đã có sẵn và được `listings` (`province_code`,
`ward_code`) lẫn `accounts` (`home_province_code`) trỏ tới. Mẫu gần nhất cho change này là
`accounts.home_province_code`: cột `Int?` nullable, FK → `provinces.code`, `ON DELETE SET NULL`.

Tìm nhóm công khai (`group.search`) hiện lọc theo tên không dấu; hồ sơ nhóm (`group.view`) trả cài
đặt nhóm. Bảng tin sàn chung chỉ có tin `marketplace` và KHÔNG hiện tin của nhóm — nên change này
thuần về **khám phá / lọc nhóm**, không đụng tới feed hay luồng đăng tin.

## Goals / Non-Goals

**Goals:**

- Nhóm mang một tỉnh/thành tuỳ chọn; lập nhóm đặt được, chủ nhóm / master đổi hoặc gỡ được về sau.
- Tìm nhóm công khai lọc được theo tỉnh/thành, kết hợp với tìm theo tên.
- Hồ sơ nhóm trả tỉnh/thành để app hiển thị và đổ vào bộ lọc.

**Non-Goals:**

- KHÔNG ràng buộc tin trong nhóm cùng tỉnh với nhóm; KHÔNG đụng luồng đăng tin, visibility, bảng
  tin sàn chung.
- KHÔNG thêm phường/xã cho nhóm (chỉ tỉnh/thành).
- KHÔNG bắt buộc nhóm có tỉnh (nullable).

## Decisions

### Bảng & cột (module `group` sở hữu)

- Thêm cột `groups.province_code Int?` (nullable), FK → `provinces.code`, `ON DELETE SET NULL` —
  mượn nguyên mẫu `accounts.home_province_code`.
- Prisma: `provinceCode Int? @map("province_code")` + quan hệ
  `province Province? @relation(fields: [provinceCode], references: [code], onDelete: SetNull)`;
  thêm quan hệ ngược `groups Group[]` vào model `Province`.
- **Không index** `province_code` ở bước đầu: bảng `groups` nhỏ và bộ lọc chính vẫn là tên; thêm
  `@@index([province_code])` sau nếu danh bạ nhóm lớn lên (ghi ở Risks).
- Province là dữ liệu tham chiếu, không bị xoá trong vận hành; `ON DELETE SET NULL` chỉ là lưới an
  toàn, đồng nhất với `accounts`.

### Migration

- Một migration thêm cột nullable + FK. **Không mất dữ liệu, không SQL viết tay.** Nhóm đang có giữ
  `province_code = NULL` (toàn quốc).
- Theo mục Migration của CLAUDE.md: đọc SQL Prisma sinh ra trước khi áp.

### API (module `group`)

- `POST /groups` (lập nhóm) và đường sửa cài đặt nhóm: thêm `provinceCode?: number` vào schema Zod.
  Đặt / đổi / gỡ tỉnh (gỡ = truyền `null`).
- `GET /groups` (tìm nhóm): thêm query `provinceCode?: number`. Có thì `group.search` thêm điều kiện
  `province_code = ?` vào WHERE hiện có (giữ nguyên lọc tên + loại trừ nhóm riêng tư). Không có thì
  WHERE như cũ.
- `GET /groups/:groupId` (hồ sơ nhóm): `groupViewSchema` + `group.view` trả thêm `province` (mã +
  tên, hoặc `null`).
- **Quyền**: đặt / đổi / gỡ tỉnh = chủ nhóm hoặc master (cùng tầng với sửa mô tả, kiểu bảng tin);
  điều hành viên → `403 FORBIDDEN`. Lập nhóm giữ nguyên luật "chỉ master".
- **Hợp lệ**: `provinceCode` không có thật → `400 VALIDATION_ERROR` (service kiểm tra tồn tại trước
  khi ghi; FK là lưới chặn cuối).

### Không cần outbox

Tỉnh/thành là thuộc tính cục bộ của `groups`, không sinh sự kiện, không tác động chéo module — nên
không đi qua outbox (CLAUDE.md luật 11, 12 chỉ áp cho tác động chéo).

## Risks / Trade-offs

- **Chưa index `province_code`**: bảng `groups` nhỏ nên quét theo tên + lọc tỉnh đủ nhanh; nếu danh
  bạ nhóm lớn lên thì thêm `@@index([province_code])` bằng một change nhỏ.
- **Nhóm không gắn tỉnh không lọt bộ lọc tỉnh** (theo spec): app cần nêu rõ "toàn quốc" để người
  dùng không tưởng nhóm biến mất.
- **Tỉnh nhóm tách rời tỉnh tin**: nhóm "Đà Nẵng" vẫn chứa được tin ở tỉnh khác (cố ý, Non-Goal) —
  nhãn khám phá, không phải ràng buộc nội dung.
- **Ngoài phạm vi TK 29 hiện tại**: TK chưa có mục tỉnh cho nhóm; chủ TK nên thêm một dòng vào TK 9
  khi duyệt. Change không tự sửa TK.

## DB constraint tests (ràng buộc chỉ DB trả lời được)

- FK `groups.province_code → provinces.code`: ghi nhóm với mã tỉnh không tồn tại bị DB từ chối (sau
  khi service đã trả `400` ở tầng trên) — test DB.
- `ON DELETE SET NULL`: xoá một tỉnh đang được nhóm trỏ tới làm `province_code` của nhóm thành
  `NULL`, nhóm vẫn còn — test DB (đồng nhất với `accounts.home_province_code`).
