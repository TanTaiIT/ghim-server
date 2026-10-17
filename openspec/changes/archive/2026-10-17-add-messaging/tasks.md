# Tasks

**Đã duyệt 17/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. Dữ liệu

- [x] 1.1 `schema.prisma`: `Conversation`, `Message`, `AccountBlock`; `ReportEntry.conversationId`; quan hệ trên
      `Account`, `Listing`; migration kèm hai CHECK tay (`///` trên model) — `messaging.db.test.ts`: unique cặp, hai
      CHECK

## 2. `screening`, `review`, `trust` — cổng

- [x] 2.1 `screening.phraseVerdict(text)` cạnh `hiddenNames` — unit test qua `screening.repository`/service
- [x] 2.2 `review`: `reportFromConversation` (lượt báo mang `conversationId`), `relatedReportSchema.entries[].conversationId`,
      chi tiết việc `conversations[]` qua cổng `messaging.transcripts` — test ở `messaging-reports.http.test.ts`
- [x] 2.3 `trust`: nối `buyerInterest` sang `messaging.hasInquiry` (app.ts) — test ở `messaging-trust.http.test.ts`

## 3. Module `messaging`

- [x] 3.1 `messaging.repository.ts`, `messaging.schema.ts`, `messaging.shared.ts` (lỗi, `sideOf`), `messaging.outbox.ts`
- [x] 3.2 `conversation.service.ts`: mở (kiểm tra tin, chặn, hạn mức ngày, unique), danh sách / chi tiết / tin nhắn, gửi
      (bộ lọc cụm, bỏ ẩn bên nhận), đã đọc, xoá, `hasInquiry`, `transcripts`
- [x] 3.3 `block.service.ts`: chặn, gỡ chặn, danh sách; `report` từ hội thoại qua cổng `review`
- [x] 3.4 `messaging.routes.ts`, `messaging.events.ts` (`identity.account.deleted` → ẩn phía người xoá;
      `messaging.message.sent` → `message:new` realtime), `messaging.module.ts`; nối dây `app.ts`, `tests/test-app.ts`
- [x] 3.5 Test HTTP: `messaging-conversations.http.test.ts` (mở, ai được nhắn, tin xem được, tin của mình, gửi / đọc,
      tiếp tục sau khi tin đổi, hạn mức ngày, cụm cấm, người ngoài 404, realtime `message:new`),
      `messaging-blocking.http.test.ts`, `messaging-deletion.http.test.ts`, `messaging-reports.http.test.ts`,
      `messaging-trust.http.test.ts`

## 4. Tài liệu và kiểm tra tích hợp

- [x] 4.1 `docs/messaging.md`, `docs/realtime.md` (sự kiện `message:new`), `docs/review.md` (bản ghi hội thoại trong chi
      tiết việc), CLAUDE.md (trạng thái module, luật 12), `docs/VIEC-DANG-DO.md`, `tests/README.md`
- [x] 4.2 `pnpm run check`, `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
