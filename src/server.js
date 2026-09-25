import express from "express";
import cors from "cors";
import multer from "multer";
import { randomUUID } from "crypto";
import { mkdir, writeFile, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";

import { getBinaries } from "./binaries.js";
import { convertFile, parseMode } from "./converter.js";
import { enqueue, getJob } from "./convertQueue.js";

const PORT = process.env.PORT || 8080;
const VERSION = "1.0.0";

const app = express();

// CORS — batasi ke FRONTEND_ORIGIN saat production, izinkan semua saat dev.
const allowedOrigin = process.env.FRONTEND_ORIGIN;
app.use(
  cors({
    origin: allowedOrigin ? allowedOrigin.split(",").map((s) => s.trim()) : true,
  })
);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/* ===================================================================
   GET /api/health — dipakai frontend untuk deteksi backend hidup
   =================================================================== */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: VERSION });
});

/* ===================================================================
   GET /api/system — info ketersediaan tool konversi
   =================================================================== */
app.get("/api/system", (req, res) => {
  const binaries = getBinaries();
  res.json({
    status: "ok",
    tools: {
      libreoffice: {
        available: true,
        isNative: binaries.libreoffice !== null,
        engine: binaries.libreoffice ? "LibreOffice Native" : "JS Engine (mammoth + pdf-lib)",
        path: binaries.libreoffice ?? "Built-in JS Fallback",
        installUrl: "https://www.libreoffice.org",
      },
      pandoc: {
        available: true,
        isNative: binaries.pandoc !== null,
        engine: binaries.pandoc ? "Pandoc Native" : "JS Engine (mammoth)",
        path: binaries.pandoc ?? "Built-in JS Fallback",
        installUrl: "https://pandoc.org",
      },
      pdftoppm: {
        available: true,
        isNative: binaries.pdftoppm !== null,
        engine: binaries.pdftoppm ? "Poppler Native" : "JS Engine (pdfjs-dist)",
        path: binaries.pdftoppm ?? "Built-in JS Fallback",
        installUrl: "https://github.com/oschwartz10612/poppler-windows/releases",
      },
      tesseract: {
        available: true,
        isNative: binaries.tesseract !== null,
        engine: binaries.tesseract ? "Tesseract OCR Native" : "JS Text Parser",
        path: binaries.tesseract ?? "Built-in Text Engine",
        installUrl: "https://github.com/UB-Mannheim/tesseract/wiki",
      },
    },
  });
});

/* ===================================================================
   POST /api/convert — masukkan job ke antrean, langsung balas jobIds
   =================================================================== */
app.post("/api/convert", upload.array("file"), async (req, res) => {
  try {
    const rawFiles = req.files || [];
    const mode = req.body?.mode;

    if (!rawFiles.length || !mode) {
      return res.status(400).json({ error: "File atau mode konversi belum diisi" });
    }

    const parsed = parseMode(mode);
    if (!parsed) {
      return res.status(400).json({ error: `Mode "${mode}" tidak didukung. Contoh yang valid: "pdf-to-docx"` });
    }

    const jobIds = rawFiles.map((file) => {
      const id = randomUUID();
      const name = file.originalname;
      const buffer = file.buffer;

      enqueue(id, async () => {
        const tmpDir = path.join(os.tmpdir(), `convert-${id}`);
        await mkdir(tmpDir, { recursive: true });

        try {
          const inputPath = path.join(tmpDir, name);
          await writeFile(inputPath, buffer);

          const { outputPath, outputName, mimeType } = await convertFile(
            inputPath,
            buffer,
            name,
            parsed.from,
            parsed.to,
            tmpDir
          );

          const result = await readFile(outputPath);
          return { filename: outputName, mimeType, result };
        } finally {
          await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
      });

      return id;
    });

    res.json({ jobIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan yang tidak diketahui";
    res.status(500).json({ error: message });
  }
});

/* ===================================================================
   GET /api/convert?id=... — polling status atau unduh file hasil
   =================================================================== */
app.get("/api/convert", (req, res) => {
  const id = req.query.id;

  if (!id) {
    return res.status(400).json({ error: "ID job belum diisi" });
  }

  const job = getJob(id);

  if (!job) {
    return res.status(404).json({ error: "Job tidak ditemukan — mungkin sudah kedaluwarsa (batas 5 menit)" });
  }

  if (job.status === "queued" || job.status === "processing") {
    return res.json({ id, status: job.status });
  }

  if (job.status === "error") {
    return res.status(500).json({ id, status: "error", error: job.error });
  }

  // status === "done" — kirim file hasil konversi
  const safeFilename = job.filename.replace(/"/g, '\\"');
  const encodedFilename = encodeURIComponent(job.filename);
  res.set({
    "Content-Type": job.mimeType,
    "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
    "Content-Length": job.result.length,
  });
  res.status(200).send(job.result);
});

app.listen(PORT, () => {
  console.log(`Backend Konversin berjalan di port ${PORT}`);
});
