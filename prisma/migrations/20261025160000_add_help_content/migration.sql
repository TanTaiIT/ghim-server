-- CreateTable
CREATE TABLE "help_topics" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "faqs" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "help_topics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "help_topics_position_idx" ON "help_topics"("position");


-- ── NỘI DUNG KHỞI ĐẦU viết tay ───────────────────────────────────────────────────────────────────
-- Bốn chủ đề lấy từ dữ liệu mẫu của ghim-app, sửa cho đúng TK: phần lớn tin máy cho qua ngay (TK 13), xác minh giấy tờ
-- không cho huy hiệu nào (TK 7), đẩy tin còn hoãn (TK 29) nên bỏ chủ đề đó. Master sửa tiếp trên bàn vận hành.
INSERT INTO "help_topics" ("label", "position", "faqs", "updated_at") VALUES
('Đăng tin', 0, $json$[
  {"q": "Làm sao để đăng tin?", "a": "Bấm nút + ở giữa thanh điều hướng, thêm ảnh, nhập tiêu đề, giá và mô tả rồi bấm Đăng tin. Máy duyệt xem tin trong vài giây: phần lớn tin hiện ngay, một số tin chờ người duyệt xem thêm."},
  {"q": "Vì sao tin chưa hiện?", "a": "Tin đang chờ người duyệt khi máy thấy cần xem thêm, thường trong 24 giờ. Tin bị từ chối thì bạn nhận thông báo kèm lý do để sửa rồi gửi lại."},
  {"q": "Tin hết hạn thì làm sao?", "a": "Tin hiện 30 ngày rồi hết hạn. Bạn gia hạn được trong 7 ngày cuối hoặc sau khi tin hết hạn, ở Cá nhân › Đang đăng."}
]$json$, now()),
('Cảnh cáo & khiếu nại', 1, $json$[
  {"q": "Cảnh cáo là gì?", "a": "Cảnh cáo được ghi khi tin hoặc tài khoản của bạn vi phạm quy định sàn. Người duyệt ghi, kèm điều quy định bị vi phạm; máy không bao giờ tự ghi cảnh cáo. Bị từ chối vì sai sót (thiếu ảnh, sai danh mục…) thì không phải cảnh cáo."},
  {"q": "Cảnh cáo ảnh hưởng gì tới tôi?", "a": "Mỗi cảnh cáo có điểm vi phạm: cảnh cáo 1 điểm, cảnh cáo nặng 2 điểm. Khi còn điểm, tin mới chỉ hiển thị hạn chế; đủ 3 điểm thì tạm dừng đăng tin mới cho tới khi điểm giảm. Thông báo cảnh cáo cho biết con số đang áp dụng."},
  {"q": "Bao lâu thì cảnh cáo hết?", "a": "Cảnh cáo tự hết hạn — thường 90 ngày, cảnh cáo nặng 180 ngày. Hết hạn thì điểm tự giảm và hạn chế tự gỡ. Ngày hết hạn có trong thông báo cảnh cáo."},
  {"q": "Không đồng ý thì sao?", "a": "Mỗi cảnh cáo được khiếu nại một lần, trong 14 ngày kể từ khi nhận. Một người khác người đã ghi cảnh cáo sẽ xét lại; được chấp nhận thì cảnh cáo được xoá và tin bị gỡ được khôi phục."},
  {"q": "Vi phạm nghiêm trọng là gì?", "a": "Hàng cấm hoặc lừa đảo đã xác nhận. Tài khoản bị khoá ngay và chờ quản trị viên quyết; khiếu nại qua đội hỗ trợ trong 30 ngày."}
]$json$, now()),
('Tài khoản & xác minh', 2, $json$[
  {"q": "Xác minh giấy tờ để làm gì?", "a": "Xác minh là tự nguyện: vào Cá nhân › Xác minh tài khoản để nộp CCCD. Kết quả chỉ bạn xem được, không đổi việc đăng tin, mức tin cậy hay hạn mức nào."},
  {"q": "Quên mật khẩu?", "a": "Ở màn hình đăng nhập, chọn Quên mật khẩu và nhập email để nhận mã đặt lại."}
]$json$, now()),
('Báo cáo lừa đảo', 3, $json$[
  {"q": "Nhận biết lừa đảo thế nào?", "a": "Cẩn thận khi bị đòi đặt cọc trước, giá rẻ bất thường hoặc bị rủ chuyển sang ứng dụng khác. Ghim không bao giờ yêu cầu chuyển khoản qua tin nhắn."},
  {"q": "Báo cáo một tin đăng?", "a": "Mở tin đăng, bấm biểu tượng lá cờ ở góc trên và chọn lý do. Đội kiểm duyệt sẽ xem xét; người bị báo không biết ai báo."}
]$json$, now());
