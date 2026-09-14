# NguồnC Stremio Addon

NestJS addon cho Stremio, dùng API NguồnC để hiển thị phim mới cập nhật, tìm kiếm, metadata và URL phát trực tiếp đã resolve. Addon không proxy dữ liệu video.

Chỉ tự vận hành khi bạn có quyền sử dụng và phân phối nội dung cũng như truy cập các nguồn phát liên quan.

## Chạy local

```bash
yarn install
cp .env.example .env
yarn start:dev
```

Mở `http://localhost:3000/manifest.json` trong Stremio khi phát triển. Với server tự dùng, triển khai sau HTTPS và dán `https://<ten-mien>/manifest.json` vào Stremio. `GET /health` trả trạng thái dịch vụ.

Các biến quan trọng: `NGUONC_API_BASE_URL`, `EMBED_ALLOWED_HOSTS`, `REQUEST_TIMEOUT_MS` và các TTL cache trong `.env.example`. `PUBLIC_BASE_URL` ghi nhận URL HTTPS công khai để vận hành/deploy.

## Docker

```bash
docker build -t nguonc-stremio .
docker run --env-file .env --network web_network --name nguonc-stremio nguonc-stremio
```

Hoặc chạy bằng Docker Compose:

```bash
cp .env.example .env
docker compose up -d --build
```

Compose tham gia Docker network ngoài `web_network` mặc định. Network này phải được tạo sẵn trên server, ví dụ `docker network create web_network`; đổi `WEB_NETWORK` trong `.env` nếu hệ thống của bạn dùng tên khác.
Service không publish port ra host; reverse proxy cùng network có thể truy cập tại `http://nguonc-stremio:3000`.

Xem trạng thái bằng `docker compose ps`, log bằng `docker compose logs -f`, và dừng service bằng `docker compose down`.
Để render/kiểm tra cấu hình mà chưa tạo `.env`, dùng `ENV_FILE=.env.example docker compose config`.

## Kiểm thử

```bash
yarn test
yarn test:e2e
yarn build
```
