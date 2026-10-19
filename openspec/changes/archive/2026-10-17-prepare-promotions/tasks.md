# Tasks

**Đã duyệt 17/10/2026** — bước 0 của `docs/KE-HOACH-GOI-DAY-TIN.md`.

## 1. Dữ liệu

- [x] 1.1 `listings.rank_at`, `listings.featured_until`; bốn index bảng tin sang `rank_at`, index từng phần nổi bật; CHECK
      `listings_rank_check`; migration `prepare_promotions` chép `rank_at = first_live_at`; `///` ở model

## 2. Code

- [x] 2.1 `ListingClock.rankAt`, `nextClock` đặt cùng `firstLiveAt`; `rankAsListingId` kế thừa `rankAt`; `orderBy`, `afterCursor`,
      `liveKey` theo `rankAt`
- [x] 2.2 DTO `featuredUntil`; `calc/fee.calc.ts`, `ListingFactsService.postingFee`, `quota.fee` ở bảng uy tín

## 3. Test

- [x] 3.1 `listing-helpers.liveListing` chép `rankAt`; `listing.db.test.ts` CHECK `listings_rank_check`; `display-period.calc.test`
      có `rankAt`; `screening-decision` kiểm `rankAt` kế thừa; `trust-dashboard` có `quota.fee`
- [x] 3.2 `listing-rank.http.test.ts`: thứ tự bảng tin theo vị trí, trang kế tiếp, `featuredUntil` null, phí 0 Xu

## 4. Tài liệu và kiểm tra

- [x] 4.1 `docs/KE-HOACH-GOI-DAY-TIN.md` (bước 0 xong, phụ lục bản nháp TK), proposal `add-wallet`, `add-promotions` nằm chờ,
      CLAUDE.md, `docs/VIEC-DANG-DO.md`, `tests/README.md`
- [x] 4.2 `pnpm run check`, `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
