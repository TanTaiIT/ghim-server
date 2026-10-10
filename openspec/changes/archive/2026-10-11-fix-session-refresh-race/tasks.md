# Tasks

## 1. Xoay token có điều kiện

- [x] 1.1 `identity.repository.ts`: `rotateRefreshToken({ sessionId, expectedHash, nextHash, at, expiresAt })` ghi có điều kiện `refresh_token_hash = expected AND revoked_at IS NULL`, trả `boolean`; cùng hình dạng trong `tests/fakes/identity-repository.fake.ts`; xác minh test DB: hai lượt xoay cùng lúc từ một token chỉ một lượt ghi được, phiên đã thu hồi thì không lượt nào ghi
- [x] 1.2 `identity.service.ts` `refresh` dùng `rotateRefreshToken`; thua → 409 `REFRESH_CONFLICT` và không đi nhánh thu hồi; xác minh unit test hai lượt `refresh` song song trên repository giả: một thành công, một `REFRESH_CONFLICT`, token của lượt thành công làm mới tiếp được; gửi lại token cũ sau đó → `SESSION_REVOKED`

## 2. Route và hợp đồng client

- [x] 2.1 `POST /auth/refresh` khai response 409, mô tả hợp đồng client (gom lượt làm mới; nhận 409 thì chờ, không gửi lại token cũ; web gửi lại một lần) trong Swagger; xác minh `tests/session-refresh.http.test.ts` đủ bốn scenario của requirement "Làm mới phiên", và `/docs/json` có 409 cho route này
- [x] 2.2 `tests/README.md` thêm ba file test mới (`session-refresh.test.ts`, `session-refresh.http.test.ts`, `session-refresh.db.test.ts`); xác minh `pnpm run format:check`

## 3. Kiểm tra tích hợp

- [x] 3.1 `pnpm run check`, `pnpm test:db`, `pnpm db:drift`, `pnpm run build` xanh

## Workflow follow-up

- Archive sau khi người dùng duyệt kết quả (`/opsx:archive fix-session-refresh-race`), rồi
  `pnpm exec prettier --write openspec` và `pnpm run spec:validate`.
