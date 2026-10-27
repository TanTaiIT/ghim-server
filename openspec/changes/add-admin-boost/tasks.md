# Tasks

Duyệt 27/10/2026 (người dùng chọn "Làm riêng, miễn phí", "Cả hai hiệu ứng", "Chủ nhóm và điều hành", "Chờ 24 giờ mỗi
tin", người quản trị "Được" đẩy tin của mình, thông báo "Chưa, để change sau").

## 1. Dữ liệu và con số

- [x] 1.1 Kiểm `DATABASE_URL` của `.env.development` trỏ DB dev (tên kết thúc `_dev`) trước mọi lệnh migration — ngày
      27/10/2026 nó đang trỏ DB production trên Render; sai thì dừng, báo người dùng
- [x] 1.2 `schema.prisma`: `Listing.lastBumpedAt` (`last_bumped_at`, null); `pnpm db:migrate --name add_admin_boost`,
      đọc SQL sinh ra (đúng một `ADD COLUMN`); kiểm bằng `pnpm db:drift`
- [x] 1.3 `config-keys.ts`: nhóm "Đẩy tin" — `promotion.bumpCooldownHours` 24 (min 0), `promotion.featuredMaxDays` 30
      (max 365), `promotion.featuredStripSize` 6 (max 50); kiểm khoá mới đọc được khi bảng con số hiện hành chưa có
      chúng (test của `platform` / runtime config)

## 2. Đẩy tin (`listing/boosting`)

- [x] 2.1 `listing/calc/boost.calc.ts`: `boostRole`, `boostBlock`, `bumpRetryAt` + unit test — đủ ca của spec: master,
      staff đúng / sai danh mục, grant treo, tin nhóm với staff, chủ nhóm, điều hành cả nhóm, điều hành đơn vị đúng / sai,
      nhóm không cho điều hành, tin sàn mang huy hiệu nhóm, từng trạng thái và cờ của `boostBlock`, thời gian chờ 0
- [x] 2.2 Cổng: `ListingPrivilegePort` (`platform.staffGrant`), `ListingGroupPort` thêm `reviewersOf`; nối trong
      `buildApp` — kiểm `pnpm run typecheck`
- [x] 2.3 Repository: `applyBoost(tx, …)` một câu `UPDATE` không đổi `version`, `updated_at`; test DB: đẩy lên đầu đổi
      `rank_at` + `last_bumped_at`, giữ `first_live_at`, `version`, `updated_at`, `listings_rank_check` không vỡ
- [x] 2.4 `listing/boost/boost.service.ts` + `boost.routes.ts`: `GET`/`POST /listings/:listingId/boost`,
      `DELETE /listings/:listingId/featured`; một transaction khoá dòng tin, `appendAudit` cùng transaction; lỗi 403
      `FORBIDDEN`, 404 `NOT_FOUND`, 409 `BOOST_NOT_ALLOWED`, 429 `BOOST_COOLDOWN` (`details.retryAt`), 400 số ngày
- [x] 2.5 Test HTTP `tests/admin-boost.http.test.ts` (app.inject): mọi scenario của spec `listing/boosting` — phạm vi
      theo vai, tin không đầy đủ, đẩy lại sau 2 giờ / đủ 24 giờ, hai lượt song song chỉ một thành công, nổi bật không vướng
      chờ, số ngày 0 / 31, rút ngắn, bỏ nổi bật (kể cả tin đang chờ duyệt, tin không nổi bật), lượt sửa của người đăng
      không vấp `LISTING_CHANGED`, ngày hết hạn không đổi, dòng nhật ký (có / không có), hỏi trước quyền đẩy

## 3. Dải nổi bật và vị trí (`listing/visibility`)

- [x] 3.1 `read.service` + `read.routes`: `GET /listings/featured?categoryId=`, `GET /groups/:groupId/listings/featured`
      (`visibleWhere` của đúng bảng tin, `featuredUntil > now`, xếp hạn gần hết trước, trần `promotion.featuredStripSize`)
- [x] 3.2 `toDto` / `toOwnDto`: `featuredUntil` null khi hạn đã qua
- [x] 3.3 Test HTTP: scenario của "Dải tin nổi bật", "Hạn nổi bật của một tin", và hai scenario mới của "Vị trí trên bảng
      tin" (đẩy lên đầu + con trỏ cũ, gia hạn không đẩy); test DB so `visibleWhere` với `canView` vẫn xanh

## 4. Tài liệu

- [x] 4.1 TK 6 (dòng "Đẩy tin lên đầu, đặt nổi bật" cho điều hành viên, chủ nhóm, staff, master), TK 14 + 19 (đẩy tin là
      thao tác duy nhất đổi vị trí), TK 28 (ba con số nhóm "Đẩy tin"), TK 29 (đẩy tin của người quản trị đã làm; gói trả Xu
      vẫn hoãn) + xuất lại PDF
- [x] 4.2 `docs/KE-HOACH-GOI-DAY-TIN.md`: thêm mục đẩy tin của người quản trị đi trước gói trả Xu, `last_bumped_at` đã có,
      `add-promotions` phải viết lại delta `listing/visibility`
- [x] 4.3 CLAUDE.md: mục `listing` (đẩy tin, luật phạm vi viết hai chỗ với `review`), thứ tự change thêm `add-admin-boost`
      trước `add-wallet`; `docs/VIEC-DANG-DO.md` mục 8 bỏ dòng "Đẩy tin" phần người quản trị

## 5. `ghim-app`

- [x] 5.1 `npm run api:sync`; hàm trong `client.ts` (dải nổi bật) và `ops.ts` hay module api mới (hỏi / đẩy / bỏ nổi bật),
      hook trong `src/queries/**`, query key trong `keys.ts`; test api theo mẫu `*.test.ts` đang có
- [x] 5.2 Nút "Đẩy tin" ở tin cho người có quyền (master, staff, quản trị nhóm — hỏi `GET …/boost`): đẩy lên đầu (hiện mốc
      đẩy lại khi đang chờ), nổi bật N ngày, bỏ nổi bật; lỗi qua toast
- [x] 5.3 Dải "Tin nổi bật" ở trang chủ, trang danh mục, trang nhóm (ẩn khi rỗng); bỏ nút "Đẩy tin" báo "sẽ có" ở màn
      người đăng nếu nó gây hiểu nhầm với đẩy tin của người quản trị
- [x] 5.4 Thử trên ba máy ảo Android (thay cho web — người dùng chốt thử trên máy ảo): chủ nhóm đặt nổi bật 3 ngày →
      dải của nhóm có tin, đẩy lên đầu → tin đứng đầu bảng tin nhóm, đẩy lại ngay → bảng chọn và toast nói mốc; master đặt
      nổi bật tin sàn → dải trang chủ có tin; thành viên thường không thấy nút. Vai staff phủ bằng test HTTP

## 6. Kiểm tra tích hợp

- [x] 6.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift`, `pnpm run spec:validate` (ghim-server); `npm run check`
      (ghim-app)

## Workflow follow-up

- Archive bằng `/opsx:archive add-admin-boost` sau khi gộp vào `main`.
