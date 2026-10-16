# Design

> **Đã duyệt 16/10/2026.** Người dùng chọn đề xuất của cả năm câu hỏi mở ("5 câu ở trên thì làm theo đề xuất của bạn
> đi") — xem proposal, mục "Đã chốt".

## Context

- `notification` áp ma trận cho sự kiện outbox: `listing.state.changed` đã có dòng N31 (tin mới trong nhóm); `review.*`
  có N40–N42 cho master. Thông báo có `body` (câu hiện khi nhắc) và `detail` (chỉ xem trong app) — lý do khoá nhóm đã
  đi qua `detail` (spec `notification/group-notices` "Câu nhắc không lộ điều riêng").
- `listing.state.changed` mang mũi tên (`hold`, `recall`, `approve`, `reject`, `remove`, `restore`…) và `fault`, không
  mang lý do mẫu hay bên quyết. Bên quyết (vai, nhóm) và lý do mẫu chỉ `review` biết, lúc ghi nhật ký quyết định —
  trong transaction đổi tin (hook `after` của cổng `listing`).
- Câu giải thích của máy cho người đăng: `screening` dựng từ lượt kết luận gần nhất (`notices`) — câu chung ba phần
  với dấu hiệu gian lận, thời gian chờ ước tính, mã tra cứu, các điều tự sửa được.

## Decisions

### 1. Quyết định của người: `review` phát `review.listing.decided`

- `review` (chủ của loại quyết định này, TK 30) thêm sự kiện vào **cùng transaction** với nhật ký quyết định: quyết
  định không áp được (409 `LISTING_CHANGED`, việc đã đóng) thì cuộn lại, không có sự kiện, không thông báo.
- Phát cho: cho đạt tin **chờ duyệt** (`approved`), từ chối (`rejected`), gỡ (`removed`), khôi phục (`restored`) — qua
  việc lẫn thao tác trực tiếp. Không phát cho: cho đạt tin đang hiện (hậu kiểm), gỡ khỏi nhóm (đã có N33 qua
  `listing.detached`), bác việc nhóm chuyển lên (tin không đổi).
- Payload `{ decisionId, listingId, ownerId, outcome, fault, reason, groupId }`: `reason` = câu lý do mẫu (không phải
  dữ liệu cá nhân); `groupId` chỉ có khi người quyết là chủ nhóm hay điều hành viên — để ký "Quản trị nhóm".
- Bỏ: thêm lý do, bên quyết vào `listing.state.changed` — `listing` không biết ai quyết, và sự kiện đó đã có bốn bên
  nghe.

### 2. Máy giữ, máy rút về: dòng mới trên `listing.state.changed`

- Bên nghe sẵn có của N31 xử thêm mũi tên `hold` (N43) và `recall` (N44): người nhận là người đăng trong payload.
- Nội dung trong app lấy câu của `screening` qua cổng mới của ma trận (`machineNotice`): câu chính, thời gian chờ, các
  điều tự sửa được, mã tra cứu (khi có). Không có câu (lượt không ghi giải thích) thì thông báo vẫn đi, không `detail`.
- Không nhắc lại khi tin vẫn chờ: chỉ một thông báo mỗi lượt giữ — lượt giữ là một sự kiện.

### 3. Câu và người ký

- N45 (`review.listing.decided`): tiêu đề là người ký — "Quản trị nhóm «tên nhóm»" khi có `groupId`, không thì "Ghim";
  `body` chỉ nói kết quả kèm tiêu đề tin; `detail` của từ chối, gỡ: "Lý do: … Sửa tin rồi gửi lại …".
- N43, N44: tiêu đề là tiêu đề tin; `body` "Tin «…» đang chờ người duyệt xem." / "… tạm ngừng hiển thị để chờ người duyệt
  xem lại."; `detail` là câu của máy.
- Mọi dòng: nhóm "tin đăng của bạn", có nhắc, `personal` (chuyện về chính tin của mình — tắt tiếng nhóm không chặn
  nhắc, như N32–N35), không gộp.
- Không nêu tên người duyệt ở đâu cả: payload không mang mã người quyết.

### 4. Không đổi

- Máy cho qua ngay, mũi tên của người đăng: không dòng nào. Kết quả "vi phạm" (gậy) chưa có ở bàn duyệt — `fault`
  khác `mistake` chỉ nêu lý do, câu riêng để `add-strikes`.

## Risks / Trade-offs

- Mỗi tin bị giữ thêm một thông báo; đăng dồn bị giữ nhiều tin thì nhiều thông báo — không gộp vì mỗi tin một việc
  riêng của người đăng.
- Thông báo tới sau bộ phát outbox (quét mỗi 10 giây, có thể hai chặng) — như mọi thông báo khác.
- Không migration; sự kiện mới chỉ `notification` nghe.
