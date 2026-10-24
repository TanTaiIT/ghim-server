# Tasks

## 1. Gỡ kiểm nội dung ảnh

- [x] 1.1 Xoá `openspec/changes/add-image-moderation/`. Sửa CLAUDE.md (thứ tự change, mục screening), README,
      `docs/VIEC-DANG-DO.md`, `docs/screening.md`: bỏ mọi chỗ nhắc kiểm ảnh nhạy cảm, ghi chốt 24/10/2026

## 2. Đo ảnh

- [x] 2.1 `screening.shared`: cổng `ImageHasher` thành `ImageInspector.inspect(bytes)` trả dHash, rộng, cao, độ nét, độ
      sáng (design mục 1); `run/image-hash.ts` dùng một lần giải mã `sharp` với `clone()`; `convolve` đặt `offset: 128`
- [x] 2.2 Test đơn vị phép đo trên ảnh dựng bằng `sharp` trong test: ảnh xoay EXIF 90° (rộng / cao đổi chỗ), ảnh đen,
      ảnh trắng, ảnh ô cờ sắc và cùng ảnh đó làm mờ (độ nét giảm rõ), ảnh trong suốt
- [x] 2.3 Đo thời gian `inspect` trên 20 ảnh thật cỡ điện thoại, và độ nét của ảnh dev rõ / mờ. Ghi số vào design mục 1 và
      mục 6, chốt lại `screening.imageMinSharpness` khởi đầu nếu 50 lệch xa

## 3. Dữ liệu và bộ luật

- [x] 3.1 `schema.prisma`: `image_checks.width`, `height`, `sharpness`, `brightness` trống được; enum `ScreeningCause` thêm
      `image_quality`, `ScreeningRuleKind` thêm `quality`. Migration sinh bằng `prisma migrate diff`, **đọc SQL**, thêm CHECK,
      áp vào DB dev
- [x] 3.2 Bốn khoá bảng con số với khoảng hợp lệ và ràng buộc tối đa > tối thiểu (design mục 6). Test: ngoài khoảng và
      tối đa ≤ tối thiểu bị từ chối
- [x] 3.3 `screening.rules.ts`: `QUALITY_CODES`, `isQuality`; trọng số 0; thêm vào `FIXABLE_CODES`. `INITIAL_RULES` đặt sẵn chạy thử cho bốn luật để
      `ensureRules` chèn ở chế độ đó (design mục 3). Test bàn vận hành: tắt được luật chất lượng, và
      trọng số của nó không đổi điểm của tin.
- [x] 3.4 `image.service.checkImage` ghi số đo cùng dHash; `finishImageCheck` nhận số đo

## 4. Kết luận và giải thích

- [x] 4.1 `run/conclusion.ts` gom số đo của ảnh trong lượt, so ngưỡng ghi trong `text_result.imageQuality` lúc chấm chữ,
      thêm lượt trúng chất lượng kèm `refs`.
      Ảnh `error` `permanent` thành lượt trúng `image_unreadable` ở chế độ bật, không còn là `failure` (design mục 2, 4)
- [x] 4.2 `decide`: thứ tự lỗi → cổng cứng → `image_quality` → luôn duyệt tay → thiết bị → ma trận (design mục 5).
      Test đơn vị thứ tự, và `HELD_MANY_CAUSES` không đổi
- [x] 4.3 `explanation.calc`: `Explanation.images` mang vị trí ảnh của mỗi lỗi ảnh, `fixable` giữ dạng danh sách mã nên câu
      cũ đọc như trước. Thêm năm câu (design mục 5)
- [x] 4.4 Test HTTP mọi scenario của delta `screening/image-checks`, `screening/hard-gates` ("Ba tin ảnh mờ trong một
      ngày"), `screening/explanations` (dùng ảnh thật dựng bằng `sharp` qua kho test)

## 5. Phiếu tải ảnh

- [x] 5.1 `uploadGrantSchema` thêm `minShortSide`, `media.requestUpload` đọc từ bảng con số. Test HTTP hai scenario của
      delta `media/image-storage`

## 6. TK và tài liệu

- [x] 6.1 TK 13 (bỏ cổng "ảnh nhạy cảm", thêm luật chất lượng ảnh, không tính dò), TK 14 (bốn luật mới), TK 25 (ảnh: kiểm
      trùng và chất lượng, không kiểm nội dung), TK 26 (bảng việc tự làm), TK 27 (cam kết về ảnh), TK 28 (bốn con số), TK 29
      (bỏ mục còn mở và thứ tự xây "kiểm ảnh nhạy cảm"), TK 30. Ghi chốt 24/10/2026, sinh lại PDF TK
- [x] 6.2 `docs/screening.md` (luật chất lượng, ngưỡng, câu giải thích), `docs/media.md` (`minShortSide`),
      `docs/VIEC-DANG-DO.md` (việc của `ghim-app`)

## 7. Kiểm tra tích hợp

- [x] 7.1 `pnpm run check` (gồm test DB), `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`

## Workflow follow-up

- Archive bằng `/opsx:archive add-image-quality-checks` sau khi nhóm 7 xanh. Lúc archive, sửa tay mục Purpose của
  `screening/image-checks` (bỏ câu "nội dung nhạy cảm thêm ở `add-image-moderation`").
- `ghim-app` (sau khi server deploy):
  - `npm run api:sync`;
  - kiểm ảnh mở được và cạnh ngắn ≥ `minShortSide` trước khi tải lên;
  - hiện câu giải thích theo `fixes` trên tin bị giữ.
- Master bật "ảnh quá nhỏ" sau deploy; ba luật còn lại sau khi xem lượt trúng chạy thử.
