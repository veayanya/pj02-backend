import "dotenv/config";
import express from "express";
import cors from "cors";
import pdfRouter from "./routes/pdf.js";

const app = express();
const port = process.env.PORT || 4000;

// CORS_ORIGIN bisa berisi beberapa origin dipisah koma, dan boleh pakai "*"
// sebagai wildcard di dalam satu origin (mis. "https://myapp-*.vercel.app")
// supaya semua URL preview deployment Vercel (yang hash-nya berubah tiap
// deploy) tetap diizinkan tanpa perlu update env variable setiap saat.
const rawOrigins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const allowAll = rawOrigins.includes("*");

function wildcardToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // escape karakter regex selain '*'
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

const originMatchers = rawOrigins
  .filter((o) => o !== "*")
  .map((pattern) => (pattern.includes("*") ? wildcardToRegExp(pattern) : pattern));

function isOriginAllowed(origin) {
  if (allowAll) return true;
  if (!origin) return true; // request tanpa header Origin (mis. curl, server-to-server)
  return originMatchers.some((matcher) =>
    matcher instanceof RegExp ? matcher.test(origin) : matcher === origin
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin "${origin}" tidak diizinkan oleh CORS_ORIGIN.`));
      }
    },
  })
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "ilovepdf-clone-backend" });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", pdfRouter);

// Error handler terakhir (termasuk error dari multer, mis. file terlalu besar)
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Ukuran file melebihi batas maksimum." });
  }
  res.status(err?.status || 500).json({ error: err?.message || "Terjadi kesalahan pada server." });
});

app.listen(port, () => {
  console.log(`Backend berjalan di http://localhost:${port}`);
});
