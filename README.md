# Konversin — Backend (Node.js + Express)

Backend Konversin ini membungkus alur pemrosesan PDF (auth JWT lokal → start →
upload → process → download) lewat satu endpoint generik, dipakai oleh frontend
Vue.js yang ada di repo terpisah. Di balik layar, pemrosesan file dilakukan lewat
API pihak ketiga (iLovePDF).

Deploy target: **Render**.

## 1. Dapatkan kredensial API pemrosesan PDF

Daftar gratis di https://developer.ilovepdf.com lalu buat project untuk mendapatkan
**public key** & **secret key**. Kredensial ini dipakai backend Konversin untuk
memproses file di baliknya.

## 2. Jalankan lokal

```bash
cp .env.example .env
# isi ILOVEPDF_PUBLIC_KEY & ILOVEPDF_SECRET_KEY di .env
npm install
npm run dev
# jalan di http://localhost:4000
```

## 3. Deploy ke Render

1. Push repo ini ke Git (GitHub/GitLab/dst).
2. Di Render: **New → Web Service**, hubungkan repo ini.
3. Build command: `npm install` — Start command: `npm start`.
4. Set environment variables di dashboard Render:
   - `ILOVEPDF_PUBLIC_KEY`
   - `ILOVEPDF_SECRET_KEY`
   - `CORS_ORIGIN` → domain frontend Vercel kamu, mis. `https://konversin.vercel.app`
     (boleh lebih dari satu domain, pisahkan dengan koma)
   - `MAX_FILE_SIZE_MB` (opsional, default 50)
5. Atau pakai `render.yaml` yang sudah disediakan lewat fitur **Render Blueprint**.
6. Setelah deploy, catat URL backend (mis. `https://konversin-backend.onrender.com`)
   — URL ini yang diisi ke `VITE_API_URL` di repo frontend.

## Struktur

```
src/
  config/tools.js            daftar 24 tool + tipe input (file/url) + accept extension
  services/ilovepdfClient.js inti pemrosesan: JWT lokal, start, upload, process, download
  routes/pdf.js               endpoint POST /api/pdf/:tool
  server.js                   entry point Express
render.yaml
```

## Endpoint

- `GET /api/health` — cek server hidup
- `GET /api/tools` — daftar tool yang didukung
- `POST /api/pdf/:tool` — jalankan satu tool (multipart/form-data: `files`,
  `sourceUrl` opsional, `options` JSON string opsional)

## Catatan

- Tool `validatepdfa`, `extract`, `formsdetect`, `sign` bisa mengembalikan **JSON**
  (bukan file) — backend otomatis mendeteksi ini dari response API pemrosesan.
- `editpdf` & `sign` butuh struktur data kompleks (`elements`/`signers`) sesuai
  dokumentasi API pemrosesan PDF yang dipakai — diteruskan apa adanya dari field
  `options`.
- Ukuran file dibatasi `MAX_FILE_SIZE_MB` (default 50 MB).
- Render plan gratis bisa "tidur" saat idle → request pertama setelah lama nganggur
  akan terasa lambat (cold start).
