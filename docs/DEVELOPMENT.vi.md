# Spinecast: dev và deploy

[English](DEVELOPMENT.md) · [← README](../README.vi.md)

---

## Chạy local

```bash
git submodule update --init --recursive
npm install
npm run db:migrate:local
npm run dev
```

Bước submodule là bắt buộc: `npm run dev` sẽ lỗi nếu chưa checkout `vendor/foliate-js` (xem [Vendored foliate-js](#vendored-foliate-js)).

Cấu hình đồng bộ được mã hoá khi lưu, nên muốn lưu được ở local thì cần một file `.dev.vars` (đã gitignore) chứa `SYNC_ENC_KEY`:

```
SYNC_ENC_KEY=...
```

Sinh giá trị bằng `openssl rand -base64 32`, đúng cách tạo secret production ở [Dựng hạ tầng Cloudflare](#dựng-hạ-tầng-cloudflare).

`.dev.vars` bị gitignore nên **một git worktree mới sẽ không có nó**, và test e2e của OPDS sẽ chết trong `atob()` vì key không hợp lệ. Copy từ checkout chính sang.

Tạo một admin để đăng nhập ở local:

```bash
npm run admin:hash -- 'mật-khẩu-của-bạn'
# dán hash in ra vào scripts/seed-admin.sql (copy từ scripts/seed-admin.sql.example trước)
npx wrangler d1 execute spinecast --local --file scripts/seed-admin.sql
```

Admin tạo mã mời ở Cài đặt › Mã mời, những người khác đăng ký bằng mã đó.

## Test

```bash
npm test                          # worker (miniflare: D1, R2, KV thật) và web (jsdom)
npx playwright install chromium   # một lần, trước lần chạy test:e2e đầu tiên
npm run test:e2e                  # Playwright, 2 project: desktop và mobile
npm run typecheck                 # lint:strings + tsc cho cả worker và web
```

`scripts/e2e-seed.sh` tạo sẵn một admin để đăng nhập sau khi chạy e2e:

| Email | Mật khẩu |
|---|---|
| `admin@dev.local` | `123456` |

Tài khoản này chỉ dành cho local. `123456` ngắn hơn mức tối thiểu 8 ký tự mà `/api/auth/register` bắt buộc, nên **không ai đăng ký được mật khẩu này**; nó chạy được vì script ghi thẳng hash vào D1 và `/api/auth/login` không kiểm độ dài. Các user mà e2e tự đăng ký trong lúc chạy vẫn dùng mật khẩu dài hơn 8 ký tự.

Vài điều cần biết trước khi tin vào kết quả test:

- **`npm run test:e2e` tự dựng dev server qua `scripts/e2e-seed.sh`, và script đó xoá sạch state Wrangler local**, kể cả bộ đếm rate limit đăng nhập nằm trong KV. Nhưng `reuseExistingServer` của Playwright sẽ tái dùng dev server bạn đang chạy và **bỏ qua luôn bước seed** - chạy e2e nhiều lần trên cùng server đó thì rate limit đăng nhập sẽ trip. Tắt server đang chạy trước đã.
- **Project `worker` chia sẻ một database D1 cho cả một file test**, không bật `isolatedStorage`. Test nào seed một primary key thì phải random giá trị đó ra, như `createUser` vẫn làm; hardcode rồi dùng `on conflict do nothing` sẽ âm thầm đọc ra row của test trước.
- **Project `web` không có global cleanup của React Testing Library** và không cài `@testing-library/jest-dom`. Test nào mount nhiều lần phải tự gọi `cleanup()`; các matcher kiểu `toBeDisabled` không tồn tại, dùng thuộc tính DOM.
- **Câu hỏi về layout hay thứ tự CSS thì phải build và đo, đọc className không phải bằng chứng.** jsdom không có layout: `scrollWidth` luôn bằng 0 và thứ tự class không nói được cái nào thắng. Đã có hai bug thoát qua nhiều lượt review vì mọi người chỉ suy luận trên className.

## Dựng hạ tầng Cloudflare

```bash
npx wrangler d1 create spinecast
npx wrangler kv namespace create SESSIONS
npx wrangler r2 bucket create spinecast-books
```

Dán D1 database id và KV namespace id vừa nhận được vào `wrangler.jsonc`. Rồi đặt secret dùng để mã hoá thông tin đăng nhập crosspoint-sync:

```bash
npx wrangler secret put SYNC_ENC_KEY
# dán một giá trị từ: openssl rand -base64 32
```

## Deploy

**Chạy migration trước khi deploy worker**, không phải ngược lại. Migration chỉ thêm chứ không xoá, nên chạy trước là an toàn; nếu deploy code mới trước thì code đó sẽ truy vấn cột chưa tồn tại.

```bash
npm run db:migrate:remote
npx wrangler d1 execute spinecast --remote --file scripts/seed-admin.sql   # chỉ lần đầu
npm run deploy
```

### Migration

| File | Thêm gì |
|---|---|
| `0001_init.sql` | 11 bảng: users, invites, books, sync_settings, reading_progress, bookmarks, clippings, sync_cursors, reading_sessions, book_stats, global_stats |
| `0002_user_locale.sql` | `users.locale` cho i18n |
| `0003_opds.sql` | `books.shared` và bảng `opds_tokens` cho catalog phát ra |
| `0004_devices.sql` | bảng `devices`, cùng `reading_progress.device_id` và `observed_at` |
| `0005_bookmarks.sql` | `bookmarks.chapter` và index cho delta sync |
| `0006_clippings.sql` | `clippings.cfi` và index cho delta sync |
| `0007_reading_stats.sql` | `users.timezone`, `reading_sessions.device_id`, cờ `dirty` trên `book_stats` và `global_stats` |
| `0008_opds_catalogs.sql` | bảng `opds_catalogs` và cột provenance trên `books`, cho OPDS client |
| `0009_passkeys.sql` | bảng `passkeys` |

`0001` đã tạo sẵn `bookmarks`, `clippings` và ba bảng stats, nên các phase sau chỉ thêm cột chứ không tạo lại bảng. Đọc `0001_init.sql` trước khi viết migration mới.

Chưa có migration nào được chạy trên môi trường remote: chưa lần nào deploy thật từ các session phát triển này.

### Việc cần làm trước lần deploy thật đầu tiên

- **Passkey bị buộc theo hostname.** RP ID lấy từ chính request, nên passkey tạo ở `localhost` không dùng được trên production và ngược lại. Đó là WebAuthn hoạt động đúng spec, không phải bug, nhưng nghĩa là không thể thử passkey ở local rồi tin luôn cho production. Sau khi deploy phải tạo passkey mới trên thiết bị thật và kiểm lại. Hiện toàn bộ ceremony chỉ được verify bằng software authenticator và virtual authenticator của Chromium.
- **Chạy `docs/opds-koreader-check.md`** - checklist 7 mục đối chiếu với KOReader thật, chưa từng được chạy. Mục quan trọng nhất là tải một cuốn có tên file mang dấu tiếng Việt.
- **Rollback sau khi deploy sẽ đăng xuất tất cả những ai đăng nhập sau thời điểm deploy**, vì worker cũ đưa cả JSON session value cho `findUserById`. Session có từ trước lúc deploy vẫn sống, không mất dữ liệu.
- **Tab trình duyệt đang mở chạy JS cũ sẽ không gửi `observedAt`**, nên một khi thiết bị khác ghi giá trị thật thì các lần ghi của tab đó bị bỏ im lặng trong khi badge vẫn hiện "đã đồng bộ". Reload là hết.

## Chuỗi giao diện và i18n

`src/web/i18n/vi.ts` là nguồn sự thật; `src/web/i18n/en.ts` phải có đúng bộ key đó, TypeScript ép việc này. Thêm chuỗi thì thêm ở cả hai file.

`npm run lint:strings` (nằm trong `npm run typecheck`) fail nếu có chữ tiếng Việt lọt ra ngoài hai bảng i18n. Nó chỉ quét `.ts`/`.tsx` trong `src/worker`, `src/web`, `src/shared`, nên markdown và comment trong tài liệu không bị ảnh hưởng.

## Artboard giao diện

Giao diện là ràng buộc: phần triển khai phải khớp artboard trong `docs/design/mockups/`. Artboard sinh ra từ code, đừng sửa tay:

```bash
node docs/design/mockups/gen.mjs
```

Palette nằm trong hằng `T` của `gen.mjs` và phải **giống hệt** block `@theme` trong `src/web/styles.css`. `src/web/palette.test.ts` tính contrast từng cặp theo WCAG và kiểm luôn hai file có khớp nhau, nên thêm token mới thì phải thêm ở cả hai chỗ.

Hai token trông giống nhau nhưng làm hai việc khác nhau, đừng gộp lại:

- `border` #e4dccf là trang trí - divider và viền card, WCAG không đặt ngưỡng nào cho chúng.
- `control` #968a78 là viền của input hoặc nút chỉ có icon, những thứ mà cái hộp là dấu hiệu nhận biết duy nhất, và WCAG 1.4.11 đòi tối thiểu 3:1.

## Vendored foliate-js

Engine render EPUB (foliate-js) là git submodule ở `vendor/foliate-js`, ghim ở commit `78914ae`:

```bash
git submodule update --init --recursive
git -C vendor/foliate-js log -1   # kiểm commit đang ghim sau khi pull
```
