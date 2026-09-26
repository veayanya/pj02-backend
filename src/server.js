import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { writeFile } from "fs/promises";
import { convertFile, parseMode, MIME } from "./converter.js";
import { getBinaries } from "./binaries.js";

const app = express();
const port = process.env.PORT || 4000;

const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB || 50);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSizeMb * 1024 * 1024 },
});

// CORS
const rawOrigins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const allowAll = rawOrigins.includes("*");

function wildcardToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

const originMatchers = rawOrigins
  .filter((o) => o !== "*")
  .map((pattern) => (pattern.includes("*") ? wildcardToRegExp(pattern) : pattern));

function isOriginAllowed(origin) {
  if (allowAll) return true;
  if (!origin) return true;
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

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "konversin-backend" });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// System info (engine availability)
app.get("/api/system", (_req, res) => {
  const bin = getBinaries();
  const tools = {
    libreoffice: { isNative: !!bin.libreoffice },
    pandoc: { isNative: !!bin.pandoc },
    pdftotext: { isNative: !!bin.pdftotext },
    pdftoppm: { isNative: !!bin.pdftoppm },
    tesseract: { isNative: !!bin.tesseract },
  };
  res.json({ tools });
});

// POST /api/convert
// multipart/form-data: file(s), mode (e.g. "pdf-to-docx")
app.post("/api/convert", upload.array("file"), async (req, res) => {
  const { mode } = req.body;
  const parsed = parseMode(mode);

  if (!parsed) {
    return res.status(400).json({ error: `Mode konversi "${mode}" tidak dikenal atau tidak didukung.` });
  }

  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ error: "Tidak ada file yang diunggah." });
  }

  const tmpDir = await mkdtemp(path.join(tmpdir(), "konversin-"));

  try {
    const jobIds = [];

    for (const file of files) {
      const inputPath = path.join(tmpDir, file.originalname);
      await writeFile(inputPath, file.buffer);

      const result = await convertFile(
        inputPath,
        file.buffer,
        file.originalname,
        parsed.from,
        parsed.to,
        tmpDir
      );

      // Return file immediately (single job per file, synchronous)
      const outputBuffer = await readFile(result.outputPath);
      res.setHeader("Content-Type", result.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(result.outputName)}"`
      );
      return res.send(outputBuffer);
    }
  } catch (err) {
    console.error("Conversion error:", err);
    return res.status(500).json({ error: err.message || "Terjadi kesalahan saat konversi." });
  } finally {
    rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Ukuran file melebihi batas maksimum." });
  }
  res.status(err?.status || 500).json({ error: err?.message || "Terjadi kesalahan pada server." });
});

app.listen(port, () => {
  console.log(`Konversin backend berjalan di http://localhost:${port}`);
});
