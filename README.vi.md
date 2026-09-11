<p align="center">
  <img src="public/icons/icon-192.png" alt="" width="96" height="96">
</p>

<h1 align="center">Spinecast</h1>

<p align="center">Thư viện EPUB riêng tư, chạy trọn trên Cloudflare.</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="docs/DEVELOPMENT.vi.md">Hướng dẫn dev và deploy</a>
</p>

---

Spinecast là thư viện và trình đọc EPUB dành cho một nhóm nhỏ được mời. Mỗi người tự tải sách của mình lên, đọc trên trình duyệt ở điện thoại hay máy tính, và giữ đồng bộ vị trí đọc, đánh dấu, highlight cùng thống kê với máy đọc sách KOReader hoặc CrossPoint thông qua một server crosspoint-sync bên ngoài. Thư viện của mỗi người cũng được phát ra dưới dạng catalog OPDS, nên chính máy đọc sách đó có thể duyệt và tải sách về trực tiếp.

Toàn bộ ứng dụng nằm trên một Cloudflare Worker duy nhất: không có server phải trông, không có hoá đơn băng thông cho file sách.

## Chức năng chính

**Tài khoản**
- Chỉ vào bằng mã mời. Admin tạo mã ở Quản trị › Lời mời; mã sống bảy ngày, chưa dùng thì thu hồi được, và danh sách cho biết tài khoản nào đã dùng mã nào.
- Đăng nhập bằng email và mật khẩu, hoặc bằng **passkey** (Face ID, Touch ID, khoá bảo mật) không cần nhập gì. Mật khẩu không bị thay thế, nó vẫn là đường recovery.
- Tự đổi mật khẩu ở Cài đặt › Tài khoản. Phải nhập mật khẩu hiện tại trước, và ngay trong form đó có thể đăng xuất mọi thiết bị khác.
- Không có chức năng tự đặt lại mật khẩu và không gửi email nào. Thay vào đó admin cấp một link dùng một lần, sống 24 giờ và chỉ hiện ra một lần; dùng link là mọi session cũ của tài khoản đó chết và bạn được đăng nhập luôn.
- Mỗi trình duyệt đăng nhập thành một thiết bị riêng, xem và đặt tên được ở Cài đặt › Thiết bị. Xoá một thiết bị là session nó tạo ra hết hiệu lực ở request kế tiếp.

**Sách và trình đọc**
- Tải file `.epub` lên (tối đa 100 MB), tự bóc metadata và ảnh bìa.
- Xem dạng lưới hoặc danh sách, tìm theo tên sách hay tác giả, sắp xếp theo mới đọc, tên sách, tác giả hoặc ngày thêm. Chế độ chọn cho chia sẻ, bỏ chia sẻ và xoá hàng loạt.
- Trình đọc dựng trên foliate-js: lật trang hoặc cuộn, đổi cỡ chữ, giãn dòng, lề, phông và tông màu (sáng / giấy / tối), mục lục, tìm trong sách.
- Highlight bốn màu kèm ghi chú, và đánh dấu trang.
- Hai tài khoản tải lên cùng một file thì chỉ có một object trong R2. Object đó được đếm tham chiếu, nên xoá sách chỉ thực sự giải phóng chỗ khi cuốn cuối cùng trỏ vào nó biến mất.

**Đồng bộ với máy đọc sách**
- Tiến độ đọc đi cả hai chiều với crosspoint-sync, mang theo cả vị trí xpath của KOReader nên web và thiết bị mở ra đúng một đoạn văn.
- Đánh dấu và highlight dùng delta sync có tombstone, nên xoá ở một nơi thì mất ở mọi nơi.
- Hai hash tài liệu của KOReader (partial-binary và tên file) được tính ngay lúc tải lên, để thiết bị và web thống nhất đâu là cùng một cuốn.
- Mỗi người tự cấu hình server crosspoint-sync của mình (URL, tên đăng nhập, mật khẩu) ở Cài đặt sau khi đăng nhập. **Spinecast là client của server đó, không tự triển khai API sync.**

**Thống kê đọc**
- Thời gian đọc, số phiên, số trang đã lật, số sách đọc xong, chuỗi ngày đọc liên tiếp.
- Lịch 12 tháng mỗi ô một ngày, cùng phân bố theo giờ trong ngày và theo ngày trong tuần.
- Múi giờ lấy một lần từ trình duyệt rồi lưu theo tài khoản, nên mốc "hôm nay" không nhảy khi bạn đi nước khác.

**OPDS hai chiều**
- *Phát ra*: mỗi người có hai catalog, một riêng tư chứa toàn bộ sách và một công khai chỉ chứa sách bạn chủ động chia sẻ, mỗi cái một token riêng.
- *Nhận vào*: tab Nguồn lưu các catalog OPDS bên ngoài, duyệt trực tiếp và tải sách về thư viện của mình.
- Token được lưu mã hoá chứ không băm, nên Cài đặt › Chia sẻ OPDS xem lại được token cũ thay vì bắt tạo lại. Catalog công khai còn copy được một link chia sẻ, mở thẳng tab Nguồn của người nhận với URL và token đã điền sẵn.

**Quản trị**
- Tổng quan: có bao nhiêu người dùng, bao nhiêu sách, bao nhiêu file đang lưu và tổng dung lượng, kèm phần rác - dòng file không còn sách nào trỏ tới, hoặc object R2 không có dòng nào. Lúc dọn, từng ứng viên được kiểm lại ngay trước khi xoá, nên một lượt upload chạy song song với lần quét không bị xoá nhầm.
- Người dùng: đổi vai trò, khoá và mở khoá, cấp link reset, hoặc xoá tài khoản cùng toàn bộ sách của nó. Xoá thì phải gõ lại đúng email, còn đổi vai trò, khoá và xoá đều từ chối tác động lên chính tài khoản đang đăng nhập. Khoá sẽ tăng session epoch, nên người bị khoá văng ra khỏi mọi nơi cùng lúc.
- Trang riêng của từng người liệt kê thiết bị và passkey của họ, thu hồi được cả hai. Thiết bị bị thu hồi sẽ bị đăng xuất ở request kế tiếp, kể cả chính cái bạn đang ngồi.
- Sách: một bảng nhìn theo dung lượng - tên file, chủ sở hữu, kích thước, file đó có đang dùng chung với tài khoản khác không, ngày thêm, mỗi lần 50 dòng. Cố tình không hiện tên sách; trang này để tìm chỗ nào đang chiếm dung lượng, không phải để ngó xem người khác đọc gì.

**Khác**
- Giao diện tiếng Việt và tiếng Anh, lần đầu theo ngôn ngữ trình duyệt rồi lưu theo tài khoản.
- Cài được như PWA. Vỏ ứng dụng chạy offline nhưng **đọc sách vẫn cần mạng** - chưa có offline reading.

## Chi tiết vài chức năng

<details>
<summary><b>OPDS: dùng catalog của mình trên máy đọc sách</b></summary>

Mỗi người có hai catalog, bảo vệ bằng HTTP Basic Auth. Tên đăng nhập bị bỏ qua, mật khẩu là token tạo ở Cài đặt › Chia sẻ OPDS:

- `https://<host>/o/<slug>/l` - toàn bộ sách của bạn
- `https://<host>/o/<slug>/p` - chỉ sách đã bật "Chia sẻ vào thư viện public"

Slug dài sáu ký tự để gõ hết URL trên bàn phím máy đọc sách cũng không mệt. Dạng cũ `https://<host>/opds/<userId>/<scope>` vẫn chạy, nên máy đọc đã cấu hình từ trước không bị gãy.

Trên KOReader: File manager › Search › OPDS catalog › add, dán URL, tên đăng nhập gì cũng được, mật khẩu là token. File tải về là file gốc, nên hash tài liệu KOReader tính ra khớp với cái Spinecast đã lưu lúc upload và tiến độ crosspoint-sync trùng khít.

Các route trong một catalog: `/` (navigation), `/all`, `/recent`, `/authors`, `/authors/books?author=`, `/search?q=`, `/opensearch.xml`, `/books/<id>.epub`, `/books/<id>/cover`. Mỗi trang 50 entry.
</details>

<details>
<summary><b>OPDS: thêm nguồn sách bên ngoài</b></summary>

Tab Nguồn lưu các catalog OPDS. Thêm bằng URL catalog kèm tên đăng nhập và mật khẩu nếu cần; URL được thử một lần lúc lưu, nên địa chỉ hay mật khẩu sai là báo lỗi ngay. Duyệt là đi thẳng vào feed, không cache gì và không tải trước gì. "Thêm" lấy đúng file mà catalog trả ra, byte cho byte, nên hash KOReader khớp và tiến độ crosspoint-sync trùng khít y như sách tự upload. Cuốn đã tải từ catalog đó hiện "Đã có" thay cho nút tải.

Ảnh bìa đi qua cùng một proxy và được phát lại từ origin của Spinecast. Chỉ nhận `image/jpeg`, `image/png`, `image/gif` và `image/webp`; bìa SVG bị từ chối có chủ ý, vì phát SVG từ origin của chính mình là một lối XSS.

Thông tin đăng nhập bị loại bỏ ở mọi redirect rời khỏi origin của catalog. Một catalog lưu dạng `http://` mà redirect sang `https://` và cần đăng nhập sẽ lỗi ngay lúc lưu, không phải vì mật khẩu sai mà vì nó không bao giờ tới được origin `https://` cùng mật khẩu đó. Lưu thẳng URL `https://`.

Chỉ hỗ trợ OPDS 1.2 (Atom XML) với HTTP Basic auth tuỳ chọn. Catalog ở `localhost` hoặc trong dải IP nội bộ bị từ chối, cùng một giới hạn mà server sync đang có, nên không thêm được Calibre-web trong mạng nhà; catalog của chính Spinecast thì được.
</details>

<details>
<summary><b>Passkey</b></summary>

Thêm passkey ở Cài đặt › Passkey. Việc thêm đòi nhập lại mật khẩu tài khoản: passkey là một chìa khoá vĩnh viễn thêm vào tài khoản, nên một session bị mượn không được phép tự tạo ra nó. Khi đã có passkey, màn đăng nhập hiện "Đăng nhập bằng passkey" và vào được mà không nhập email lẫn mật khẩu.

**Passkey bị buộc theo hostname.** RP ID lấy từ chính request, nên passkey tạo ở `localhost` không dùng được trên production và ngược lại. Đó là WebAuthn hoạt động đúng spec.

Chỉ dùng authenticator ES256 với discoverable credential, cả loại gắn trong máy và loại rời. Không verify attestation, không có chuỗi chứng thư nào.
</details>

## Kiến trúc

Một Cloudflare Worker phục vụ cả ba thứ: API JSON bằng Hono ở `/api/*`, catalog OPDS ở `/o/*` (và dạng cũ `/opds/*`), và React SPA qua Static Assets. Các route chỉ dành cho admin nằm dưới `/api/admin/*` sau một lớp kiểm tra vai trò. D1 giữ người dùng, sách và trạng thái đồng bộ; R2 giữ file EPUB và ảnh bìa; KV giữ session, challenge WebAuthn và bộ đếm rate limit. Mọi lời gọi tới crosspoint-sync đều đi qua Worker, trình duyệt không bao giờ nói chuyện trực tiếp với server đó.

```
src/worker/      Hono app: routes, middleware, services, sync client, opds
src/web/         React SPA: pages, reader, hooks, components
src/shared/      DTO và type Position dùng chung cho hai phía
migrations/      D1 SQL migrations
docs/design/     Artboard giao diện, sinh bằng gen.mjs
vendor/          foliate-js (git submodule)
```

## Vì sao chọn Cloudflare

Vì cả tầng compute, SQL, object storage và KV đều nằm trên gói free, đủ cho một nhóm nhỏ mà không tốn gì, không có server phải giữ sống, và không mất phí egress khi tải file sách về. Nếu muốn tiến gần production hơn (nhiều người dùng, file lớn, không bị quota ngày) thì gói Workers Paid nới đúng những giới hạn đáng quan tâm, còn giá lưu trữ vẫn thấp.

Các giới hạn thực sự ảnh hưởng tới Spinecast, lấy từ developers.cloudflare.com ngày 2026-09-04:

| Tài nguyên | Free | Workers Paid |
|---|---|---|
| Request body (giới hạn upload) | 100 MB | 100 MB (Business: 200 MB, Enterprise: tới 5 GB) |
| Bộ nhớ Worker | 128 MB | 128 MB |
| CPU mỗi request | 10 ms | mặc định 30 s, tối đa 5 phút |
| Kích thước D1 | 500 MB (5 GB mỗi account) | 10 GB (1 TB mỗi account) |
| R2 lưu trữ | 10 GB-tháng free, sau đó $0.015/GB-tháng | như free |
| R2 operations | free 1M ghi, 10M đọc mỗi tháng | $4.50/M ghi, $0.36/M đọc |
| R2 egress | free | free |
| KV ghi | 1.000 mỗi ngày | không giới hạn |
| KV đọc | 100.000 mỗi ngày | không giới hạn |
| KV kích thước value | 25 MiB | 25 MiB |

Nghĩa là trong thực tế:

- **Mức 100 MB cho một file sách là giới hạn của nền tảng, không phải lựa chọn của app.** File lớn hơn cần account Business, hoặc phải tải trực tiếp lên R2 bằng presigned URL.
- **Trên gói free, 10 ms CPU là chật** cho việc đăng nhập (PBKDF2 100.000 vòng) và bóc tách một file EPUB lớn lúc upload. Nếu các request đó bắt đầu lỗi vì hết CPU thì cách sửa là lên gói Paid, không phải làm yếu hàm hash đi.
- **Mỗi lần đăng nhập, đăng nhập sai, hay thử token OPDS sai đều là một lần ghi KV.** 1.000 lần một ngày thoải mái cho vài người, nhưng không dành cho một site công khai.
- **10 GB R2 chứa khoảng 3.000 đến 10.000 file EPUB**, tuỳ sách nhiều ảnh hay không. D1 chỉ lưu metadata và trạng thái đồng bộ nên 500 MB là quá dư.

## Tài liệu khác

- [Hướng dẫn dev và deploy](docs/DEVELOPMENT.vi.md) - chạy local, chạy test, dựng hạ tầng Cloudflare, migration, deploy.
