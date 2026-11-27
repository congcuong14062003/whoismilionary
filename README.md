# AI LÀ TRIỆU PHÚ – TikTok LIVE Edition

Game hỏi đáp tiếng Việt cho màn hình livestream dọc. Người xem bình luận A, B, C hoặc D; server tiếp nhận sự kiện, chấm điểm và cập nhật màn hình qua Server-Sent Events (SSE). Có sẵn 100 câu hỏi và công cụ mô phỏng 10–1.000 người chơi.

## Chạy nhanh

Kết nối LIVE trực tiếp yêu cầu Node.js 22 trở lên và `npm install`. Lệnh `npm start` sẽ tìm một bản Node phù hợp trên máy; nếu chưa có, cài Node.js 22/24 hoặc đặt `LIVE_NODE_BINARY` tới đường dẫn `node.exe` phù hợp.

1. Sao chép `.env.example` thành `.env` và đặt `COMMENT_WEBHOOK_SECRET`; trên máy này file `.env` đã được tạo.
2. Trên Windows, click đúp [PLAY_QUIZ.bat](PLAY_QUIZ.bat) để cài thư viện nếu thiếu, chạy máy chủ và mở trang quản trị. Giữ cửa sổ đó mở trong lúc live; nhấn Ctrl+C để dừng. Có thể dùng `npm start` trong terminal như trước.
3. Mở `http://127.0.0.1:8093/admin`; trang quản trị mở trực tiếp, không cần mật khẩu.
4. Đặt thời gian trả lời, hiện đáp án và tổng kết trong **Cấu hình buổi live**. Nút **Bắt đầu ván** tự lưu các thông số đó. Khi kênh TikTok đã bắt đầu LIVE, nhập `@username` người phát rồi nhấn **Kết nối** một lần. Chờ trạng thái **Đã kết nối LIVE** trước khi nhấn **Bắt đầu ván**.
5. Thêm Browser Source trong OBS/TikTok LIVE Studio: `http://127.0.0.1:8093/live`, khung 1080 × 1920. `/overlay` có nền trong suốt.
6. Sau buổi live, nhấn **Ngắt**. Có thể dùng **10 người** để kiểm thử khi chưa phát live.

Dữ liệu lưu tại `data/state.json`; game tiếp tục theo mốc thời gian đã lưu khi khởi động lại. Server nghe trên mọi giao diện mạng (`HOST=0.0.0.0`). Điện thoại cùng mạng mở `http://<IP-máy-tính>:8093/live`; trên máy hiện tại, địa chỉ Ethernet là `http://192.168.100.113:8093/live`. Nếu IP máy thay đổi, dùng `ipconfig` để lấy địa chỉ IPv4 mới. Windows Firewall cần cho phép kết nối TCP cổng 8093 từ mạng nội bộ.

## Nguồn comment TikTok

Luồng kết nối và nhận comment theo `D:\live-tiktok`: nhập tên kênh, bấm **Kết nối**, theo dõi trạng thái, số bình luận thật và bình luận gần nhất. `D:\quiz-live` chỉ có SSE để phát câu hỏi, không có mã lấy comment. Các nguồn comment của game:

- `MockAdapter`: sinh comment kiểm thử; trạng thái luôn ghi rõ là mô phỏng.
- `DirectLiveAdapter`: kết nối bằng `@username` qua thư viện [TikTok LIVE Connector](https://github.com/zerodytrash/TikTok-Live-Connector), nhận comment và tự thử kết nối lại sau 15 giây khi mất mạng hoặc kênh chưa live. Trạng thái chỉ hiện **Đã kết nối LIVE** sau khi thư viện xác nhận vào phòng.
- `WebhookAdapter`: nhận sự kiện từ bridge hoặc nhà cung cấp được phép sử dụng.

Trong `/admin` → **Kết nối bình luận TikTok**, nhập TikTok ID / `@username` của người phát rồi nhấn **Kết nối**. Nếu kênh chưa live hoặc mạng lỗi, trạng thái báo rõ và tự thử lại. Trang quản trị hiển thị bộ đếm bình luận thật, bình luận gần nhất và độ trễ ước tính. Nút **Bắt đầu ván** chỉ điều khiển câu hỏi, không mở kết nối comment.

Thư viện này **không phải API chính thức của TikTok** và phụ thuộc dịch vụ ký kết nối Euler Stream. TikTok có thể thay đổi giao thức; nếu kết nối lỗi, sử dụng webhook của nhà cung cấp mà anh được phép dùng. Không đưa cookie hoặc tài khoản TikTok vào ứng dụng.

Bridge gửi `POST /api/comment-webhook` cùng header `X-Webhook-Secret: <COMMENT_WEBHOOK_SECRET>` và JSON:

```json
{
  "streamerUsername": "tenkenh",
  "userId": "tiktok-user-id",
  "username": "username",
  "nickname": "Tên hiển thị",
  "avatar": "https://...",
  "comment": "Đáp án A",
  "timestamp": 1730000000000,
  "eventId": "id-duy-nhat-cua-su-kien"
}
```

`streamerUsername` phải trùng ID đã cấu hình trong trang quản trị. `timestamp` là milliseconds Unix. Chỉ nhận bình luận trong khoảng mở câu hỏi. Mỗi `userId` được tính câu trả lời hợp lệ đầu tiên mỗi câu; `eventId` giúp loại sự kiện lặp. Bridge nên đặt sau mạng riêng hoặc proxy TLS, giữ secret ở server và dùng ID sự kiện ổn định.

## Luật game

Mỗi ván 15 câu, mặc định 20 giây trả lời, 3 giây hồi hộp, 6 giây hiện đáp án và 15 giây tổng kết top 3. Trang quản trị đặt riêng ba khoảng thời gian; đặt tổng kết bằng 0 để bỏ qua. Thời gian hiện đáp án áp dụng từ lần công bố kế tiếp. Hết ván hiển thị top 3 và bắt đầu ván mới khi bật tự động. Đúng được 100 điểm và tối đa 100 điểm tốc độ; chuỗi 3/5/10 câu đúng được cộng 50/150/500 điểm. Sai hoặc bỏ câu làm đứt chuỗi. Bằng điểm thì ưu tiên tổng thời gian trả lời đúng thấp hơn. Mốc tiền là **mô phỏng, không phải tiền thật**.

Khi tắt **Tự chuyển câu**, game chờ sau lúc hiện đáp án. Đồng hồ hiển thị `—`; bấm **Chuyển câu** để mở câu tiếp theo. Số giây trả lời áp dụng khi mở câu mới.

## Đường dẫn và API

| Đường dẫn | Chức năng |
| --- | --- |
| `/live` | Màn hình game dọc |
| `/overlay` | Overlay trong suốt |
| `/admin` | Điều khiển, cấu hình, mô phỏng, duyệt câu hỏi |
| `/leaderboard` | Xếp hạng ván hiện tại |
| `/questions` | Trang quản trị, phần ngân hàng câu hỏi |
| `/demo` | Hướng dẫn và xem thử |
| `GET /api/state` | Snapshot công khai, đáp án chỉ mở sau công bố |
| `GET /api/events` | SSE snapshot realtime |
| `POST /api/comment-webhook` | Sự kiện comment qua secret |
| `/api/admin/*` | API quản trị trên server nội bộ |

API quản trị: `live-connect` (nhận `username` và kết nối trong một lệnh), `live-disconnect`, `control` (start, pause, resume, stop, next, lock, reveal, reset-scores, new-season), `settings`, `lifeline`, `simulate`, `comment`, `questions`, `import`, `export.json`, `export.csv`, `history`, `players`. SSE dùng sự kiện mặc định `message` chứa snapshot như `GET /api/state`.

## Docker

Đặt `COMMENT_WEBHOOK_SECRET` trong `.env`, sau đó chạy `docker compose up --build -d`. Docker Compose mở cổng 8093 trên các giao diện mạng để điện thoại cùng mạng truy cập. Dữ liệu được lưu trong volume `game-data`.

## Kiểm tra

Chạy `npm test` để kiểm tra xử lý comment, tính điểm, giới hạn thời gian, tạm dừng và khôi phục trạng thái.

## Giới hạn của bản MVP

Ứng dụng dùng Node HTTP, SSE và tệp JSON. Chưa có PostgreSQL/Redis, React hoặc giọng đọc AI từ dịch vụ bên ngoài. Tùy chọn giọng đọc dùng Web Speech API của trình duyệt, chất lượng tùy máy phát. Trợ giúp “Hỏi AI” hiện tạo gợi ý từ lời giải có sẵn. Ngân hàng 100 câu mẫu cần được biên tập trước khi phát sóng lâu dài. Kết nối LIVE trực tiếp chưa thể kiểm chứng với kênh của anh cho đến khi kênh đang live.

## Thêm câu hỏi trong lúc live

Bấm **＋ Nhập thêm câu hỏi** cạnh các nút điều khiển, chọn file JSON. Hệ thống báo số câu mới, số câu trùng đã bỏ qua và tổng ngân hàng. Câu đang phát, thời gian trả lời và điểm được giữ; câu mới được chọn ở các lượt tiếp theo theo độ khó. Có sẵn bộ question-bank/CAU_HOI_BO_SUNG_500.json không trùng bộ 2.000 câu trước. File cần một mảng câu hỏi hoặc đối tượng có questions; giới hạn yêu cầu import là 8 MB. Câu không ghi approved được phép dùng ngay; đặt approved:false để chờ duyệt. Game ưu tiên câu chưa xuất hiện trong lịch sử lưu (tối đa 10.000 lượt); sau đó chọn câu được hỏi lâu nhất.
