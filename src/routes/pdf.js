import { Router } from "express";
import multer from "multer";
import { TOOLS, getToolConfig } from "../config/tools.js";
import { runIlovepdfTask, IlovepdfApiError } from "../services/ilovepdfClient.js";

const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB || 50);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSizeMb * 1024 * 1024 },
});

const router = Router();

// GET /api/tools -> daftar tool yang didukung (dipakai frontend bila perlu)
router.get("/tools", (_req, res) => {
  res.json({ tools: TOOLS });
});

// POST /api/pdf/:tool -> jalankan satu tool iLovePDF
// Body (multipart/form-data):
//   files       : satu atau lebih file (field "files")
//   sourceUrl   : (opsional) URL sumber, dipakai tool berbasis URL seperti htmlpdf
//   options     : (opsional) JSON string berisi opsi khusus tool
//   publicKey   : (opsional) override ILOVEPDF_PUBLIC_KEY dari server
//   secretKey   : (opsional) override ILOVEPDF_SECRET_KEY dari server
router.post("/pdf/:tool", upload.array("files"), async (req, res, next) => {
  const { tool } = req.params;
  const toolConfig = getToolConfig(tool);

  if (!toolConfig) {
    return res.status(404).json({ error: `Tool "${tool}" tidak dikenal.` });
  }

  try {
    let options = {};
    if (req.body.options) {
      try {
        options = JSON.parse(req.body.options);
      } catch {
        return res.status(400).json({ error: "Field 'options' harus berupa JSON yang valid." });
      }
    }

    const publicKey = req.body.publicKey || process.env.ILOVEPDF_PUBLIC_KEY;
    const secretKey = req.body.secretKey || process.env.ILOVEPDF_SECRET_KEY;

    const result = await runIlovepdfTask({
      tool,
      publicKey,
      secretKey,
      files: (req.files || []).map((f) => ({
        buffer: f.buffer,
        originalname: f.originalname,
      })),
      sourceUrl: req.body.sourceUrl || undefined,
      options,
    });

    if (result.isJson) {
      return res.json(result.jsonResult);
    }

    res.setHeader("Content-Type", result.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(result.filename)}"`
    );
    return res.send(result.buffer);
  } catch (err) {
    if (err instanceof IlovepdfApiError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    return next(err);
  }
});

export default router;
