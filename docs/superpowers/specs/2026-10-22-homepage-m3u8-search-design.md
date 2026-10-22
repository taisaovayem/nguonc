# Trang chủ tìm và sao chép M3U8

## Mục tiêu

Cung cấp một trang web tối giản tại `GET /` để người dùng tìm phim từ NguồnC và lấy URL HLS `.m3u8` dùng trong player bên ngoài. Trang không phát video, không có tài khoản và không lưu lịch sử.

## Phạm vi

- Trang ban đầu chỉ có tiêu đề ngắn và ô tìm kiếm trống.
- Người dùng nhập từ khóa rồi gửi tìm kiếm.
- Trang hiện các phim phù hợp, gồm tên, poster nếu có, năm và nhãn phim lẻ/phim bộ.
- Chọn phim lẻ sẽ resolve các nguồn phát và hiện URL `.m3u8` kèm nút sao chép.
- Chọn phim bộ sẽ hiện tập trước; chọn một tập mới resolve các nguồn phát cho tập đó.
- Mỗi nguồn phát giữ tên server để người dùng phân biệt.

Ngoài phạm vi: danh sách phim mới, phân trang, phát trong trình duyệt, đăng nhập, yêu thích, phân tích sử dụng, hoặc dependency/frontend build mới.

## Kiến trúc

Tạo `HomepageController` trả một HTML document tự chứa cho route `/`. HTML chứa CSS nhẹ và JavaScript trình duyệt; không cần template engine hay bundle riêng.

JavaScript gọi các endpoint đã có của ứng dụng:

1. `catalog/movie/nguonc-latest/search=<query>.json` và `catalog/series/nguonc-latest/search=<query>.json` để tìm cả phim lẻ lẫn phim bộ.
2. `meta/<type>/<id>.json` để lấy chi tiết cùng danh sách videos/tập khi người dùng chọn phim.
3. `stream/movie/<id>.json` cho phim lẻ hoặc `stream/series/<id>:<episode-slug>.json` cho một tập.

Controller không thêm API riêng và không gọi trực tiếp upstream. Tất cả cache, resolve embed và proxy HLS vẫn đi qua các service/route hiện hữu.

## Trải nghiệm và trạng thái

- Gửi form bằng Enter hoặc nút Tìm.
- Trong lúc gọi API, vùng nội dung hiện thông báo tải.
- Không có kết quả, metadata không hợp lệ, hoặc không có stream sẽ hiện thông báo tiếng Việt ngắn gọn.
- Khi một URL được resolve, render URL trong ô chỉ-đọc và nút `Sao chép`. Nút dùng Clipboard API; nếu API không khả dụng, chọn nội dung để người dùng tự sao chép.
- Kết quả cũ bị thay thế bởi thao tác mới. JavaScript dùng mã yêu cầu tăng dần để bỏ qua phản hồi đến muộn.
- URL M3U8 là session tạm thời; giao diện nhắc người dùng dán và phát sớm vì URL có thể hết hạn.

## An toàn hiển thị

Nội dung nhận từ API được gán bằng `textContent`; không nội suy tên phim hay dữ liệu upstream vào `innerHTML`. Poster được gán vào thuộc tính `src` sau khi kiểm tra URL `http:`/`https:`. Chỉ URL stream bắt đầu bằng `http:` hoặc `https:` mới được hiển thị/copy.

## Kiểm thử

- Unit test controller: `GET /` trả 200, HTML, có form tìm kiếm và các route API mà client dùng.
- Giữ nguyên bộ test hiện có cho Stremio và HLS.
- Sau triển khai: chạy `yarn test`, `yarn test:e2e`, `yarn build`, và kiểm tra thủ công form qua `app.inject` hoặc server local.

## Tiêu chí hoàn thành

Từ `/`, người dùng có thể tìm một phim lẻ, chọn nguồn và copy URL `.m3u8`; với phim bộ, người dùng phải chọn tập trước khi thấy các URL để copy. Không có dependency sản phẩm mới và các endpoint Stremio hiện có không đổi hành vi.
