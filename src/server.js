import "dotenv/config";
import express from "express";
import cors from "cors";
import pdfRouter from "./routes/pdf.js";

const app = express();
const port = process.env.PORT || 4000;

const allowedOrigins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
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
