# Proposal

## Why

Màn chat của app Ghim (`ghim-app`) có chấm "đang online" của người kia. TK không có luật nào về trạng thái hoạt động,
và server không lưu gì về nó. Lộ ra khi nối app với server ngày 18/10/2026; người dùng chốt làm cùng ngày.

Trạng thái hoạt động là dữ liệu cá nhân: nó cho người lạ biết một người thức, ngủ, dùng app lúc nào. Change này làm ở
mức hẹp nhất đủ cho màn chat, theo thứ tự luật của TK phần 4 (an toàn pháp lý và người dùng biết vì sao đứng trước sự
tiện lợi):

- Chỉ **bên kia của một hội thoại về tin** thấy — không có trên hồ sơ công khai, bảng tin hay danh sách thành viên nhóm;
  có chặn giữa hai người thì không bên nào thấy.
- Người dùng **tắt được**, và tắt là **hai chiều**: không ai thấy của mình, mình cũng không thấy của ai — không ai rình
  được người khác mà giấu mình.
- "Lần cuối hoạt động" chỉ hiện trong **7 ngày** gần nhất (giá trị khởi đầu, đề xuất — chờ người dùng duyệt), làm tròn
  tới phút; xa hơn thì không hiện gì.

Cam kết TK 27 liên quan: **31** (dữ liệu cá nhân có hạn lưu — mốc hoạt động bị xoá khi xoá tài khoản), **33** (số ngày
là một con số master chỉnh được). Thuộc đợt 6 của TK 29 (nhắn tin).

## What Changes

- Hội thoại về tin cho biết **người kia đang hoạt động không** (đang có kết nối realtime) và **lần cuối hoạt động**.
- Hồ sơ của tôi có công tắc **hiện trạng thái hoạt động** (mặc định bật), sửa qua route sửa hồ sơ hiện có.
- Bảng con số thêm số ngày "lần cuối hoạt động" còn hiện (7 ngày, giá trị khởi đầu); TK 24 và TK 28 thêm luật này (sửa
  trong cùng lượt với change này).

**Cố ý chưa làm**:

- Đẩy realtime khi người kia vừa online hay vừa thoát — app đọc lại khi mở hội thoại và khi có tin mới; đẩy theo từng
  lượt nối / ngắt là quạt ra mọi người từng nhắn với mình, đáng làm khi đo thấy cần.
- Trạng thái hoạt động trong hội thoại với một đội (`add-team-conversations`) — đội không phải một người, còn người dùng
  không nên bị quản trị nhóm hay staff theo dõi giờ giấc.
- "Đang gõ…", "đã xem" từng tin nhắn.

## Capabilities

### New Capabilities

- `messaging/activity-status`: ai thấy trạng thái hoạt động của ai trong hội thoại, đang hoạt động, lần cuối hoạt động,
  công tắc hai chiều.

### Modified Capabilities

- `identity/profile`: thêm "Công tắc hiện trạng thái hoạt động".

## Impact

- **Code**: kênh realtime (biết một tài khoản đang có kết nối không; báo lúc kết nối cuối cùng của tài khoản đóng),
  `identity` (mốc hoạt động, công tắc, xoá khi xoá tài khoản), `messaging` (DTO hội thoại), bảng con số.
- **API**: hội thoại có thêm `counterpart.activity`; `GET /me` và `PATCH /me` có thêm `showActivity`.
- **Migration**: hai cột của bảng tài khoản, một khoá bảng con số; không mất dữ liệu.
- **Tài liệu**: TK 24, TK 28, `docs/messaging.md`, CLAUDE.md.
- **Client**: `ghim-app` vẽ chấm hoạt động và công tắc trong cài đặt — việc của repo app.
