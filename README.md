# Konversin Backend

API konversi dokumen (PDF, DOCX, PPTX, HTML, EPUB) untuk Konversin. Dibangun dengan
Express + Node.js, menjalankan LibreOffice, Pandoc, dan Tesseract OCR di server.

Ini adalah hasil pemisahan `app/api/*` dari proyek Next.js "Personal Doc Converter"
menjadi backend berdiri sendiri, supaya bisa di-deploy ke **Render** (yang mendukung
Docker + binary native), sementara frontend-nya (Vite+React) di-deploy ke **Vercel**.

## Endpoint

| Method | Path                  | Keterangan                                      |
|--------|-----------------------|--------------------------------------------------|
| GET    | `/api/health`         | Cek server hidup — dipakai frontend untuk badge  |
| GET    | `/api/system`         | Info tool yang terpasang (LibreOffice/Pandoc/dll)|
| POST   | `/api/convert`        | Upload file(s) + `mode`, balas `{ jobIds }`      |
| GET    | `/api/convert?id=...` | Poll status job / stream file hasil konversi     |

Mode yang didukung: `pdf-to-docx`, `pdf-to-html`, `pdf-to-epub`, `docx-to-pdf`,
`docx-to-html`, `docx-to-epub`, `pptx-to-pdf`, `pptx-to-html`, `html-to-pdf`,
`html-to-docx`, `epub-to-pdf`, `epub-to-docx`.

## Jalankan lokal

```bash
npm install
npm run dev
```

Butuh LibreOffice/Pandoc/Tesseract/Poppler terpasang di mesin lokal supaya semua
mode jalan optimal — kalau tidak ada, sebagian mode otomatis fallback ke mesin JS
murni (mammoth/pdf-lib/pdfjs-dist), tapi hasilnya lebih sederhana (teks saja).

## Deploy ke Render

1. Push folder ini ke repo GitHub sendiri (terpisah dari frontend).
2. Di Render: **New → Web Service → Build from a Dockerfile** (repo ini sudah
   punya `Dockerfile` yang meng-install LibreOffice + Pandoc + Tesseract + Poppler
   via apt), atau langsung **Deploy from render.yaml (Blueprint)**.
3. Set environment variable `FRONTEND_ORIGIN` ke URL frontend Vercel kamu, misalnya
   `https://konversin.vercel.app` (boleh beberapa origin dipisah koma).
4. Setelah deploy selesai, catat URL backend (mis. `https://konversin-backend.onrender.com`)
   — ini yang dipakai sebagai `VITE_API_URL` di frontend.

Free plan Render akan sleep saat idle, jadi request pertama setelah lama tidak
dipakai bisa terasa lambat (cold start) — ini wajar.
