# Tasks

## 1. Dữ liệu

- [x] 1.1 `schema.prisma`: thêm `groups.provinceCode Int?` + quan hệ `province Province?` (FK
      `provinceCode → provinces.code`, `onDelete: SetNull`) và quan hệ ngược `groups Group[]` vào
      model `Province`. Migration thêm cột nullable + FK (đọc SQL sinh ra trước khi áp; không SQL
      viết tay, không mất dữ liệu). `pnpm db:drift`.
- [x] 1.2 Test DB ràng buộc: ghi nhóm với mã tỉnh không tồn tại bị FK từ chối; xoá tỉnh đang được
      nhóm trỏ tới ⇒ `province_code` của nhóm thành null, nhóm vẫn còn (`ON DELETE SET NULL`).

## 2. Lập & sửa tỉnh/thành của nhóm (module `group`)

- [x] 2.1 Schema Zod: `provinceCode` tuỳ chọn ở body lập nhóm và body sửa cài đặt (sửa cho nhận
      `null` để gỡ). `group.service`: đặt / đổi / gỡ tỉnh; kiểm tra tỉnh tồn tại trước khi ghi, không
      có thật thì `400 VALIDATION_ERROR`; quyền đặt/đổi/gỡ = chủ nhóm hoặc master, điều hành viên
      `403 FORBIDDEN`; lập nhóm giữ luật "chỉ master".
- [x] 2.2 Test HTTP (`app.inject`): lập nhóm kèm tỉnh ⇒ 201 và hồ sơ trả tỉnh; lập không tỉnh ⇒ 201
      không tỉnh; lập với tỉnh sai ⇒ 400; chủ nhóm đặt rồi gỡ tỉnh; điều hành viên đổi tỉnh ⇒ 403.

## 3. Tìm nhóm công khai theo tỉnh/thành (`group.search`)

- [x] 3.1 `GET /groups`: thêm query `provinceCode` tuỳ chọn vào `groupSearchQuerySchema`;
      `group.search` thêm điều kiện lọc theo `province_code` khi có, giữ nguyên lọc tên không dấu và
      loại trừ nhóm riêng tư.
- [x] 3.2 Test HTTP: lọc theo tỉnh chỉ trả nhóm công khai gắn đúng tỉnh; nhóm không gắn tỉnh không
      lọt lưới khi lọc; không truyền tỉnh ⇒ kết quả như cũ; lọc theo tỉnh không lộ nhóm riêng tư.

## 4. Hồ sơ nhóm trả tỉnh/thành (`group.view`)

- [x] 4.1 `groupProfileSchema` thêm `province` (mã + tên, hoặc `null`); `group.view` map tỉnh của
      nhóm (`provinceOf` ở `group.shared`).
- [x] 4.2 Test HTTP: hồ sơ nhóm có gắn tỉnh trả đúng tỉnh; nhóm không gắn trả `null`.

## 5. Tài liệu

- [x] 5.1 Cập nhật `CLAUDE.md` (module `group`): cột `province_code`, các route nhận/trả `province`.
      Ghi chú để chủ TK thêm một dòng tỉnh/thành cho nhóm vào TK 9 khi duyệt (change không tự sửa TK).

## 6. App `ghim-app`

- [x] 6.1 `npm run api:sync` (SDK regenerate: `provinceCode`/`province` cho nhóm); `client` +
      `queries`: `searchGroups(q, provinceCode)`, `getGroup` đọc `province`, `GroupSettingsPatch` +
      `NewGroup` nhận `provinceCode`.
- [x] 6.2 UI: bộ lọc tỉnh ở màn "Tìm nhóm" (`app/groups.tsx`); ô chọn tỉnh khi lập nhóm
      (`ops/group/new`) và sửa cài đặt nhóm (`group/manage/.../settings`, cho gỡ); hiển thị tỉnh ở
      hồ sơ nhóm (`GroupBoard` tab Giới thiệu). Chọn nhóm → mở bảng tin nhóm (sẵn có).

## 7. Kiểm tra tích hợp

- [ ] 7.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift`, `pnpm run spec:validate` (ghim-server);
      `npm run check` (ghim-app).
