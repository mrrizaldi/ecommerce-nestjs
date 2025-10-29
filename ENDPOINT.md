# 📦 Rekomendasi Endpoint Inti – MVP E-Commerce API

Fokus pada **performa**, **keamanan**, dan **skalabilitas**. Endpoint inti ini mencakup seluruh alur penting — mulai dari autentikasi hingga observability — dengan pendekatan modular ala **NestJS + Fastify**.

---

## 🔐 Auth & User

| Method   | Endpoint         | Deskripsi                                                                                                                        |
| -------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **POST** | `/auth/register` | Registrasi user baru dengan validasi email dan password. Password di-hash menggunakan **bcrypt + salt**. Kirim email verifikasi. |
| **POST** | `/auth/login`    | Autentikasi dan generate **JWT** + refresh token.                                                                                |
| **GET**  | `/users/me`      | Mengambil profil user yang sedang login. Dilindungi dengan **JWT Guard**.                                                        |
| **PUT**  | `/users/me`      | Update profil user. Gunakan **DTO**, **ValidationPipe**, dan sanitasi input untuk mencegah XSS.                                  |

---

## 🛍️ Produk

| Method     | Endpoint              | Deskripsi                                                                                                                                                    |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GET**    | `/products`           | Menampilkan daftar produk dengan **filter kategori, harga, dan pencarian**. Gunakan **query params**, **pagination**, dan caching **(cache-aside pattern)**. |
| **GET**    | `/products/:id`       | Menampilkan detail produk. Cache hasil per produk.                                                                                                           |
| **POST**   | `/admin/products`     | [Admin] Tambah produk baru. Butuh otorisasi role admin.                                                                                                      |
| **PUT**    | `/admin/products/:id` | [Admin] Update data produk.                                                                                                                                  |
| **DELETE** | `/admin/products/:id` | [Admin] Hapus produk.                                                                                                                                        |

---

## 🛒 Keranjang (Cart)

| Method     | Endpoint          | Deskripsi                                                                                       |
| ---------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| **POST**   | `/cart/items`     | Tambah item ke keranjang. Pastikan stok tersedia. Gunakan **idempotency key** agar tidak dobel. |
| **GET**    | `/cart`           | Lihat isi keranjang. Simpan data di **Redis** untuk performa cepat.                             |
| **DELETE** | `/cart/items/:id` | Hapus item dari keranjang.                                                                      |

---

## 💳 Checkout & Order

| Method   | Endpoint             | Deskripsi                                                                                                                                |
| -------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **POST** | `/orders`            | Buat pesanan baru. Validasi alamat, stok, dan total harga. Terapkan **idempotency key**. Simpan order dalam status `PENDING_PAYMENT`.    |
| **POST** | `/payments/callback` | Callback dari gateway pembayaran. **Idempotent**, memperbarui status order, dan men-trigger pengurangan stok dalam transaksi terisolasi. |
| **GET**  | `/orders/:orderId`   | Lihat detail pesanan. Hanya pemilik pesanan yang dapat mengakses.                                                                        |
| **GET**  | `/orders`            | Menampilkan daftar pesanan user dengan filter status.                                                                                    |

---

## 🧾 Admin & Inventory

| Method  | Endpoint                   | Deskripsi                                                                                        |
| ------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| **GET** | `/admin/orders`            | [Admin] Lihat semua order dengan filter status.                                                  |
| **PUT** | `/admin/orders/:id/status` | [Admin] Update status order (e.g. `PACKED`, `SHIPPED`). Validasi transisi status agar konsisten. |

---

## 📊 Observability

| Method      | Endpoint      | Deskripsi                                                                                |
| ----------- | ------------- | ---------------------------------------------------------------------------------------- |
| **GET**     | `/health`     | Endpoint untuk health check (liveness & readiness).                                      |
| **Metrics** | _(Integrasi)_ | Ekspor metrik ke **Grafana/Prometheus**: `request_count`, `response_time`, `error_rate`. |

---

## ✨ Catatan Teknis

- Gunakan **ValidationPipe** + **DTO** untuk input sanitization.
- Implementasikan **rate limiting** (`@nestjs/throttler`) – contoh: 100 request / 60s per IP.
- Gunakan **@fastify/helmet** untuk header keamanan (CSP, X-Frame-Options, dll).
- Pastikan operasi sensitif (checkout, payment, refund) **idempotent**.
- Gunakan **Redis cache** dan **PgBouncer** untuk efisiensi koneksi database.
- Observability terintegrasi dengan **Pino logger**, **Prometheus**, dan **Grafana**.

---

> Endpoint ini mencakup _core user management & orders_ sesuai gist task, di-refactor dengan gaya NestJS modern yang memanfaatkan validasi, keamanan, caching, dan idempotensi.  
> Fitur lanjutan seperti **wishlist**, **rekomendasi produk**, **ulasan**, dan **notifikasi** dapat ditambahkan pada fase berikutnya.
