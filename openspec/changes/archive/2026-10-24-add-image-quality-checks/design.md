# Design

## Context

Lượt kiểm ảnh (`screening.check-image`, `run/image.service.ts`) đọc tệp từ kho, giải mã bằng `sharp` để băm dHash, rồi
ghi `image_checks`. Có hai cách dừng:

- tệp không giải mã được thì ghi `error`, `permanent`;
- kho không trả lời sau mọi lượt thử thì ghi `error`, `transient`.

Cả hai đều làm tin bị giữ với lý do `error`, và người đăng chỉ thấy câu chờ chung. Kết luận (`calc/decide.calc.ts`) xét
theo thứ tự: lỗi → cổng cứng → luôn duyệt tay → đánh dấu thiết bị → ma trận dải × mức tin cậy. Máy không bao giờ từ chối.

Người dùng chốt ngày 24/10/2026: bỏ kiểm nội dung ảnh, chỉ kiểm chất lượng. Ràng buộc là không thêm dịch vụ, không
thêm tải đáng kể. Gói web trên Render là 512 MB.

## Goals / Non-Goals

**Goals**:

- ảnh hỏng, quá nhỏ, mờ, quá tối, quá sáng đều được bắt;
- người đăng biết ảnh nào lỗi và sửa ra sao;
- ngưỡng chỉnh được và chạy thử được trước khi có tác dụng;
- không thêm gói, dịch vụ hay RAM đáng kể.

**Non-Goals**: kiểm nội dung ảnh; kiểm ảnh đại diện; kiểm lại tin đã hiện; app đo độ nét hay độ sáng.

## Decisions

### 1. Đo trong cùng lần giải mã với dHash

Cổng `ImageHasher.dhash(bytes)` đổi thành `ImageInspector.inspect(bytes)`, trả `{ dhash, width, height, sharpness,
brightness }`. Một lần `sharp(bytes).rotate()`, rồi tách nhánh bằng `clone()`:

- **Cỡ**: `metadata().autoOrient` — rộng và cao sau khi xoay theo EXIF. Cạnh ngắn là số nhỏ hơn.
- **Độ sáng**: thu ảnh xám về cạnh dài 512 px, lấy trung bình buffer xám (thang 0–255).
- **Độ nét**: phương sai sau toán tử Laplace (kernel 3×3 `0,1,0,1,-4,1,0,1,0`) trên cùng ảnh xám 512 px.
  - `convolve` đặt `scale: 1` (mặc định là tổng kernel, mà tổng của Laplace là 0) và `offset: 128` để giá trị âm không
    bị cắt về 0.
  - Phương sai tính trên buffer sau `convolve`, không bằng `stats()`: `stats()` của `sharp` đọc ảnh đầu vào, bỏ qua
    `convolve` trong pipeline — đo bằng nó ra phương sai độ sáng của chính ảnh (đã gặp lúc làm task 2.3).
  - Thu về 512 px trước khi đo, để ngưỡng không phụ thuộc cỡ ảnh gốc.
- **dHash**: như cũ (9×8 xám).

Đo ngày 24/10/2026 (task 2.3) trên máy dev, `sharp` 0.35:

- ảnh 1440×1920 từ camera ảo của máy ảo Android: trung vị 37 ms mỗi lần đo (20 lần);
- ảnh 4000×3000 cỡ điện thoại thật: 105 ms.

Không thêm gói; `sharp` đã nạp sẵn nên RAM chỉ thêm buffer xám 512 px của ảnh đang đo.

Phương án bị loại: đo ở lúc tải lên (`media.resolve`). Cách đó phải tải ảnh về ngay trong request, làm chậm request và
tốn thêm một lần đọc kho; lượt kiểm bất đồng bộ đã đọc ảnh rồi.

### 2. Lưu số đo, so ngưỡng của lượt gửi lúc kết luận

`image_checks` thêm `width`, `height` (int), `sharpness`, `brightness` (float), cho phép trống. Kết quả ảnh dùng chung cho
mọi lượt chứa ảnh đó. Ngưỡng đọc lúc chấm chữ và ghi vào `text_result.imageQuality`, như `imageMaxDistance` của so trùng:
kết luận lúc ảnh về vẫn theo đúng các số của lượt gửi (design `add-screening` mục 5). Lượt kết luận (`run/conclusion.ts`)
so số đo với các số đó:

- master chỉnh ngưỡng thì có tác dụng từ lượt gửi kế tiếp, không phải kiểm lại ảnh;
- lượt mở trước change này không có `imageQuality`, nên không xét chất lượng ảnh;
- ảnh kiểm trước change này có số đo trống, nên không trúng luật nào (spec "Ảnh kiểm trước change này").

Phương án bị loại: ghi sẵn "trúng / không" lúc kiểm. Đổi ngưỡng sẽ không có tác dụng với ảnh đã kiểm, và dữ liệu để chỉnh
ngưỡng sau chạy thử cũng mất.

### 3. Bốn luật chất lượng là loại luật thứ ba

`screening.rules.ts` thêm `QUALITY_CODES`: `image_unreadable` (mục 4) và bốn luật `image_too_small`, `image_blurry`,
`image_too_dark`, `image_too_bright`. Enum `screening_rule_kind` thêm `quality`. Luật chất lượng khác hai loại luật hiện
có:

| Loại           | Trúng thì     | Tắt được | Tính dò, "bị giữ nhiều" | Trọng số      |
| -------------- | ------------- | -------- | ----------------------- | ------------- |
| Dấu hiệu       | cộng điểm     | có       | không                   | có            |
| Cổng cứng      | giữ cho người | không    | có                      | 0, không dùng |
| **Chất lượng** | giữ cho người | **có**   | **không**               | 0, không dùng |

- Bàn vận hành chỉnh chế độ như mọi luật, theo `screening/rule-management`. Trọng số của luật chất lượng không được dùng,
  như cổng cứng hôm nay: `scoreOf` chỉ cộng dấu hiệu.
- Bốn dòng luật được `ensureRules` chèn lúc khởi động ở chế độ **chạy thử**, bằng một phiên bản luật mới ("Luật mới chạy
  thử trước"). `INITIAL_RULES` đặt sẵn chế độ chạy thử cho chúng, nên DB mới tinh (phiên bản 1, mọi luật khác bật) cũng
  không bật chúng.
- Bốn mã thêm vào `FIXABLE_CODES` để có câu giải thích (mục 5).
- Mỗi lượt trúng mang `refs` là mã các ảnh trúng, theo thứ tự ảnh của tin.

### 4. Ảnh hỏng không phải luật

Ảnh `error`, `permanent` thôi là lỗi của máy:

- lượt kết luận coi nó như một lượt trúng mã `image_unreadable`, `refs` là mã ảnh;
- mã này không có dòng trong bảng luật, và `ruleFor` luôn trả chế độ bật cho nó: không chỉnh, không chạy thử, không tắt
  được (spec "Ảnh hỏng…").

Ảnh `error`, `transient` (kho không trả lời) vẫn là lỗi của máy như cũ.

### 5. Kết luận và câu giải thích

Enum `screening_cause` thêm `image_quality`. Thứ tự trong `decide`:

lỗi của máy → cổng cứng → **chất lượng ảnh** → luôn duyệt tay → đánh dấu thiết bị → ma trận.

- Chất lượng ảnh đứng sau cổng cứng: tin vừa dùng ảnh của người khác vừa mờ vẫn tính là dò.
- Chất lượng ảnh đứng trước luôn duyệt tay, để lý do ghi lại là thứ người đăng tự sửa được.
- `HELD_MANY_CAUSES` giữ nguyên `['score', 'gate']`.
- Lượt dò chỉ đếm cổng cứng nên tự loại `image_quality`; test vẫn khẳng định điều này.

`Explanation` thêm `images?: { [mã lỗi ảnh]: number[] }`: vị trí (từ 1) các ảnh trúng mỗi lỗi ảnh, lấy theo `imageIds` của
lượt. `fixable` giữ nguyên là danh sách mã, nên câu lưu trước change này vẫn đọc được như cũ. Câu khởi đầu
(`IMAGE_FIX_MESSAGES`; `{n}` là "Ảnh 2" hay "Ảnh 1, 3"):

| Mã                 | Câu                                                                           |
| ------------------ | ----------------------------------------------------------------------------- |
| `image_unreadable` | Ảnh {n} không mở được. Xoá ảnh đó rồi tải ảnh khác.                           |
| `image_too_small`  | Ảnh {n} quá nhỏ. Thay bằng ảnh chụp rõ hơn.                                   |
| `image_blurry`     | Ảnh {n} bị mờ. Chụp lại, giữ yên máy và đủ sáng.                              |
| `image_too_dark`   | Ảnh {n} quá tối. Chụp lại ở nơi đủ sáng.                                      |
| `image_too_bright` | Ảnh {n} quá sáng, gần như trắng xoá. Chụp lại, tránh đèn chiếu thẳng vào máy. |

Câu không nêu con số ngưỡng: app đã có `minShortSide` từ phiếu tải ảnh (mục 7).

### 6. Bốn con số

| Khoá                           | Khởi đầu | Khoảng hợp lệ | Ghi chú                                                    |
| ------------------------------ | -------- | ------------- | ---------------------------------------------------------- |
| `screening.imageMinShortSide`  | 480      | 100–2000      | điểm ảnh, cạnh ngắn sau khi xoay theo EXIF                 |
| `screening.imageMinSharpness`  | 20       | 0–5000        | phương sai Laplace trên ảnh xám 512 px; chỉnh sau chạy thử |
| `screening.imageMinBrightness` | 25       | 0–255         | trung bình kênh xám                                        |
| `screening.imageMaxBrightness` | 235      | 0–255         | phải lớn hơn độ sáng tối thiểu                             |

- Ràng buộc "tối đa > tối thiểu" kiểm ở chỗ ghi bảng con số, như các cặp khoá khác.
- Độ nét 20 chốt sau khi đo (task 2.3). Ảnh camera ảo là cảnh khối phẳng, ít chi tiết — gần với ảnh đồ vật nền trơn:
  - ảnh gốc: 71–77;
  - làm mờ nhẹ (Gauss sigma 1,5): 46–50;
  - mờ rõ (sigma 3): 17–19;
  - mờ nặng (sigma 6): 4.

  50 (số tạm lúc soạn) sẽ bắt nhầm ảnh nền trơn hơi mờ. 20 chỉ bắt ảnh mờ rõ. Ba luật mờ, tối, sáng bắt đầu chạy thử nên
  master chỉnh lại theo lượt trúng thật trước khi bật.

### 7. Phiếu tải ảnh trả cạnh ngắn tối thiểu

`uploadGrantSchema` thêm `minShortSide: number`, đọc từ bảng con số mỗi lần cấp phiếu. App đọc từ đây thay vì tự giữ một
hằng số, để master đổi ngưỡng thì app đổi theo.

Cạnh ngắn tối thiểu không phải dấu hiệu gian lận. Nói ra không giúp ai lách máy, nên không vướng nguyên tắc "cài đặt máy
duyệt không công khai" (TK 11). Độ nét và độ sáng không trả ra, vì app không đo được.

## Risks / Trade-offs

- **Bắt nhầm ảnh đẹp có chủ ý**: ảnh nền trơn, đồ một màu, chụp tối giản bị coi là mờ; đồ đen trên nền đen bị coi là quá
  tối. Ba luật này bắt đầu chạy thử. Bàn vận hành đo tỉ lệ máy quá tay theo từng luật (`screening/rule-management`), nên
  master chỉ bật khi tỉ lệ đó thấp. Người duyệt vẫn cho qua được mọi tin bị giữ.
- **Ảnh nội dung xấu lọt qua**: chấp nhận theo quyết định 24/10/2026. Lưới đỡ là luật chữ (cụm từ cấm), điểm rủi ro, báo
  cáo và người duyệt.
- **Lượt kết luận đọc thêm cột**: bốn cột trên cùng dòng `image_checks` đã đọc, không thêm truy vấn.

## Migration Plan

1. Migration `add_image_quality_checks`:
   - thêm bốn cột trống vào `image_checks`, kèm CHECK bốn số đo cùng trống hoặc cùng có;
   - thêm `image_quality` vào enum `screening_cause`, `quality` vào enum `screening_rule_kind`.
2. Deploy. Bước khởi động `ensureRules` chèn bốn dòng luật ở chế độ chạy thử (phiên bản luật mới). Bốn khoá bảng con số
   lấy giá trị khởi đầu từ sổ `config-keys.ts`. Ảnh cũ có số đo trống nên không ai bị giữ thêm. Ảnh mới có số đo, luật
   chạy thử chỉ ghi lại.
3. Master xem lượt trúng chạy thử trên bàn vận hành, bật "ảnh quá nhỏ" trước, ba luật còn lại sau khi chỉnh ngưỡng.
4. App: kiểm `minShortSide` trước khi tải lên; hiện câu giải thích ảnh.

Rollback: tắt bốn luật trên bàn vận hành, không cần deploy lại. Ảnh hỏng quay về lỗi của máy thì phải revert code; cột và
enum để nguyên, vô hại.
