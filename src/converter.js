/**
 * Mesin inti konversi dokumen.
 *
 * Mode yang didukung:
 *   pdf-to-docx | pdf-to-html | pdf-to-epub
 *   docx-to-pdf | docx-to-html | docx-to-epub
 *   pptx-to-pdf | pptx-to-html
 *   html-to-pdf | html-to-docx
 *   epub-to-pdf | epub-to-docx
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, readdir, rename } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getBinaries } from "./binaries.js";

const execAsync = promisify(exec);

/* ===================================================================
   Peta MIME & Matriks Format
   =================================================================== */

export const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  epub: "application/epub+zip",
  html: "text/html",
};

export const SUPPORTED = {
  pdf: ["docx", "html", "epub"],
  docx: ["pdf", "html", "epub"],
  pptx: ["pdf", "html"],
  html: ["pdf", "docx"],
  epub: ["pdf", "docx"],
};

/* ===================================================================
   Fungsi bantu
   =================================================================== */

export function parseMode(mode) {
  const match = mode.match(/^(\w+)-to-(\w+)$/);
  if (!match) return null;
  const [, from, to] = match;
  if (!SUPPORTED[from]?.includes(to)) return null;
  return { from, to };
}

async function extractPdfPagesText(buffer) {
  try {
    const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const pdf = await pdfjs.getDocument({ data }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str ?? "").join(" ");
      pages.push(text);
    }
    return pages;
  } catch (err) {
    console.error("extractPdfPagesText error:", err);
    return [];
  }
}

async function pdfHasText(buffer) {
  const pages = await extractPdfPagesText(buffer);
  const totalLength = pages.reduce((sum, p) => sum + p.trim().length, 0);
  return totalLength > 100;
}

/** Ubah tiap halaman PDF jadi gambar dengan pdftoppm, lalu OCR paralel per batch */
async function ocrPdf(inputPath, tmpDir, bin) {
  if (!bin.pdftoppm) throw new Error("Poppler (pdftoppm) tidak terpasang di server ini.");
  if (!bin.tesseract) throw new Error("Tesseract OCR tidak terpasang di server ini.");

  const imgPrefix = path.join(tmpDir, "page");

  await execAsync(`${bin.pdftoppm} -r 300 -png "${inputPath}" "${imgPrefix}"`, { timeout: 120_000 });

  const files = await readdir(tmpDir);
  const images = files
    .filter((f) => f.startsWith("page") && f.endsWith(".png"))
    .sort()
    .map((f) => path.join(tmpDir, f));

  if (images.length === 0) {
    throw new Error("pdftoppm tidak menghasilkan gambar — apakah poppler sudah terpasang?");
  }

  const BATCH = 4;
  let fullText = "";

  for (let i = 0; i < images.length; i += BATCH) {
    const batch = images.slice(i, i + BATCH);
    const texts = await Promise.all(
      batch.map(async (img) => {
        const ocrBase = img.replace(/\.png$/, "_ocr");
        await execAsync(`${bin.tesseract} "${img}" "${ocrBase}" -l eng`, { timeout: 60_000 });
        const txtPath = `${ocrBase}.txt`;
        return existsSync(txtPath) ? readFile(txtPath, "utf-8") : "";
      })
    );
    fullText += texts.join("\n\n");
  }

  if (!fullText.trim()) throw new Error("Tesseract tidak menghasilkan teks");

  const combined = path.join(tmpDir, "ocr_combined.txt");
  await writeFile(combined, fullText, "utf-8");
  return combined;
}

function cleanUnicodeText(str) {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[—–‑−]/g, "-")
    .replace(/[•◦▪▸]/g, "* ")
    .replace(/…/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/©/g, "(c)")
    .replace(/®/g, "(r)")
    .replace(/™/g, "(tm)")
    .replace(/°/g, " deg ")
    .replace(/[^\x20-\x7E\t\r\n]/g, "");
}

async function convertDocxToHtmlJS(buffer, outputPath) {
  const result = await mammoth.convertToHtml({ buffer });
  const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Converted Document</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 850px;
      margin: 40px auto;
      padding: 0 24px;
      line-height: 1.7;
      color: #1a1a1a;
      background-color: #ffffff;
    }
    h1, h2, h3, h4, h5, h6 { color: #111827; margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
    p { margin-bottom: 1em; word-break: break-word; }
    img { max-width: 100%; height: auto; border-radius: 6px; margin: 1em 0; }
    table { border-collapse: collapse; width: 100%; margin: 1.5em 0; font-size: 14px; }
    th, td { border: 1px solid #e5e7eb; padding: 10px 14px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    blockquote { border-left: 4px solid #3b82f6; padding-left: 1rem; color: #4b5563; margin: 1em 0; }
  </style>
</head>
<body>
  ${result.value || "<p>Tidak ada konten teks yang ditemukan.</p>"}
</body>
</html>`;
  await writeFile(outputPath, htmlContent, "utf-8");
}

function wrapTextForPdf(font, txt, maxW, fontSize) {
  if (!txt.trim()) return [""];
  const words = txt.split(" ");
  const wrapped = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    let textWidth = 0;
    try {
      textWidth = font.widthOfTextAtSize(testLine, fontSize);
    } catch {
      textWidth = testLine.length * 6;
    }
    if (textWidth <= maxW) {
      currentLine = testLine;
    } else {
      if (currentLine) wrapped.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) wrapped.push(currentLine);
  return wrapped;
}

async function textToPdf(cleanText, outputPath) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const lineHeight = 14;
  const margin = 50;

  const lines = cleanText.split(/\r?\n/);
  let page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const maxWidth = width - margin * 2;
  let y = height - margin;

  for (const rawLine of lines) {
    const wrappedLines = wrapTextForPdf(font, rawLine, maxWidth, fontSize);
    for (const line of wrappedLines) {
      if (y < margin + lineHeight) {
        page = pdfDoc.addPage([595.28, 841.89]);
        y = height - margin;
      }
      if (line) {
        page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
      }
      y -= lineHeight;
    }
  }

  const pdfBytes = await pdfDoc.save();
  await writeFile(outputPath, Buffer.from(pdfBytes));
}

async function convertDocxToPdfJS(buffer, outputPath) {
  const result = await mammoth.extractRawText({ buffer });
  const rawText = result.value || "No text content found in document.";
  await textToPdf(cleanUnicodeText(rawText), outputPath);
}

async function convertHtmlToPdfJS(buffer, outputPath) {
  const htmlStr = buffer.toString("utf-8");
  const rawText = htmlStr
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "\n");

  const cleanText = cleanUnicodeText(rawText);
  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0).join("\n");
  await textToPdf(lines, outputPath);
}

/**
 * Konversi PDF -> DOCX bersih tanpa frame/text-box bertumpuk.
 * Mengalirkan teks paragraf demi paragraf sehingga dokumen Word rapi dan mudah dibaca.
 */
async function convertPdfToDocxClean(inputPath, buffer, outputPath, baseName, tmpDir, bin) {
  let extractedText = "";

  // 1. Coba ekstraksi teks dengan pdftotext -layout (menjaga kolom & struktur baris)
  if (bin.pdftotext) {
    const txtPath = path.join(tmpDir, `${baseName}_layout.txt`);
    try {
      await execAsync(`${bin.pdftotext} -layout "${inputPath}" "${txtPath}"`, { timeout: 30_000 });
      if (existsSync(txtPath)) {
        extractedText = await readFile(txtPath, "utf-8");
      }
    } catch (e) {
      console.log("pdftotext -layout failed:", e);
    }
  }

  // 2. Fallback ekstraksi teks dengan pdfjs-dist jika pdftotext tidak menghasilkan apa-apa
  if (!extractedText.trim()) {
    const pages = await extractPdfPagesText(buffer);
    extractedText = pages.join("\n\n--- Halaman Baru ---\n\n");
  }

  // 3. Jika dokumen berupa hasil scan (tidak ada teks terdeteksi), jalankan OCR (pdftoppm + tesseract)
  if (!extractedText.trim() || extractedText.trim().length < 30) {
    if (bin.pdftoppm && bin.tesseract) {
      try {
        const ocrTxtPath = await ocrPdf(inputPath, tmpDir, bin);
        if (existsSync(ocrTxtPath)) {
          extractedText = await readFile(ocrTxtPath, "utf-8");
        }
      } catch (e) {
        console.error("OCR pipeline failed:", e);
      }
    }
  }

  // 4. Susun teks menjadi dokumen HTML mengalir yang rapi tanpa frame/box bertumpuk
  const lines = extractedText.split(/\r?\n/);
  const formattedParagraphs = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      const escaped = trimmed
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      if (
        trimmed.length < 90 &&
        (trimmed.toUpperCase() === trimmed ||
          trimmed.startsWith("BAB ") ||
          trimmed.includes("BERITA ACARA") ||
          trimmed.includes("HASIL VERIFIKASI"))
      ) {
        return `<h2 style="font-size: 13pt; font-weight: bold; margin-top: 14pt; margin-bottom: 6pt; color: #111;">${escaped}</h2>`;
      }
      return `<p style="font-size: 11pt; line-height: 1.5; margin-bottom: 6pt; color: #222;">${escaped}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  const cleanHtmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${baseName}</title>
  <style>
    @page { size: A4; margin: 2cm; }
    body { font-family: "Arial", "Calibri", sans-serif; font-size: 11pt; line-height: 1.5; color: #111111; }
    h1, h2, h3 { color: #000000; font-weight: bold; }
    p { margin-bottom: 8px; word-wrap: break-word; }
  </style>
</head>
<body>
  ${formattedParagraphs || "<p>Tidak ada konten teks yang ditemukan dalam PDF.</p>"}
</body>
</html>`;

  const tmpHtmlPath = path.join(tmpDir, `${baseName}_clean.html`);
  await writeFile(tmpHtmlPath, cleanHtmlContent, "utf-8");

  // 5. Konversikan HTML mengalir tersebut ke DOCX menggunakan LibreOffice / Pandoc
  if (bin.libreoffice) {
    try {
      await execAsync(
        `${bin.libreoffice} --headless --convert-to docx:writer_docx_Export "${tmpHtmlPath}" --outdir "${tmpDir}"`,
        { timeout: 60_000 }
      );
      const generatedDocx = path.join(tmpDir, `${baseName}_clean.docx`);
      if (existsSync(generatedDocx)) {
        await rename(generatedDocx, outputPath);
        return;
      }
    } catch (e) {
      console.error("LibreOffice HTML -> DOCX conversion failed:", e);
    }
  }

  if (bin.pandoc && !existsSync(outputPath)) {
    try {
      await execAsync(`${bin.pandoc} "${tmpHtmlPath}" -o "${outputPath}"`, { timeout: 60_000 });
      return;
    } catch (e) {
      console.error("Pandoc HTML -> DOCX failed:", e);
    }
  }

  if (!existsSync(outputPath)) {
    await writeFile(outputPath, cleanHtmlContent, "utf-8");
  }
}

/* ===================================================================
   Konversi inti — satu file
   =================================================================== */

export async function convertFile(inputPath, buffer, originalName, from, to, tmpDir) {
  const lastDotIndex = originalName.lastIndexOf(".");
  const baseName = lastDotIndex > 0 ? originalName.substring(0, lastDotIndex) : originalName;
  const outputName = `${baseName}.${to.toLowerCase()}`;
  const outputPath = path.join(tmpDir, outputName);
  const mimeType = MIME[to] ?? "application/octet-stream";
  const bin = getBinaries();

  /* ---------- PDF → * ---------- */

  if (from === "pdf") {
    if (to === "docx") {
      await convertPdfToDocxClean(inputPath, buffer, outputPath, baseName, tmpDir, bin);
    } else if (to === "html") {
      if (bin.libreoffice) {
        try {
          await execAsync(
            `${bin.libreoffice} --headless --infilter="writer_pdf_import" --convert-to html "${inputPath}" --outdir "${tmpDir}"`,
            { timeout: 60_000 }
          );
        } catch (e) {
          console.error("LibreOffice PDF -> HTML failed:", e);
        }
      }

      if (!existsSync(outputPath)) {
        const pages = await extractPdfPagesText(buffer);
        const htmlDoc =
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${baseName}</title><style>body { font-family: system-ui, sans-serif; padding: 40px; line-height: 1.6; } .page { margin-bottom: 2rem; padding: 1.5rem; border: 1px solid #e5e7eb; border-radius: 8px; }</style></head><body>` +
          pages
            .map(
              (p, i) =>
                `<div class="page"><h2>Halaman ${i + 1}</h2><p>${p
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")
                  .replace(/\n/g, "<br>")}</p></div>`
            )
            .join("\n") +
          `</body></html>`;
        await writeFile(outputPath, htmlDoc, "utf-8");
      }
    } else if (to === "epub") {
      const tmpHtml = path.join(tmpDir, `${baseName}_tmp.html`);
      if (bin.libreoffice) {
        try {
          await execAsync(
            `${bin.libreoffice} --headless --infilter="writer_pdf_import" --convert-to html "${inputPath}" --outdir "${tmpDir}"`,
            { timeout: 60_000 }
          );
          const loHtml = path.join(tmpDir, `${baseName}.html`);
          if (existsSync(loHtml)) {
            await rename(loHtml, tmpHtml);
          }
        } catch (e) {
          console.error("LibreOffice PDF -> HTML (for EPUB) failed:", e);
        }
      }

      if (!existsSync(tmpHtml)) {
        const pages = await extractPdfPagesText(buffer);
        const htmlDoc =
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${baseName}</title></head><body>` +
          pages
            .map(
              (p, i) =>
                `<h2>Halaman ${i + 1}</h2><p>${p.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`
            )
            .join("\n") +
          `</body></html>`;
        await writeFile(tmpHtml, htmlDoc, "utf-8");
      }

      if (bin.pandoc) {
        await execAsync(`${bin.pandoc} "${tmpHtml}" -o "${outputPath}"`, { timeout: 60_000 });
      } else {
        await rename(tmpHtml, outputPath);
      }
    }
  }

  /* ---------- DOCX → * ---------- */

  else if (from === "docx") {
    if (to === "pdf") {
      if (bin.libreoffice) {
        try {
          await execAsync(`${bin.libreoffice} --headless --convert-to pdf:writer_pdf_Export "${inputPath}" --outdir "${tmpDir}"`, {
            timeout: 60_000,
          });
        } catch (e) {
          console.log("LibreOffice DOCX->PDF failed, using JS fallback:", e);
        }
      }
      if (!existsSync(outputPath)) {
        await convertDocxToPdfJS(buffer, outputPath);
      }
    } else if (to === "html") {
      if (bin.libreoffice) {
        try {
          await execAsync(`${bin.libreoffice} --headless --convert-to html "${inputPath}" --outdir "${tmpDir}"`, { timeout: 60_000 });
        } catch (e) {
          console.log("LibreOffice DOCX->HTML failed, trying Pandoc/JS:", e);
        }
      }
      if (!existsSync(outputPath) && bin.pandoc) {
        try {
          await execAsync(`${bin.pandoc} "${inputPath}" -o "${outputPath}" --standalone`, { timeout: 60_000 });
        } catch (e) {
          console.log("Pandoc DOCX->HTML failed, using JS fallback:", e);
        }
      }
      if (!existsSync(outputPath)) {
        await convertDocxToHtmlJS(buffer, outputPath);
      }
    } else if (to === "epub") {
      const tmpHtml = path.join(tmpDir, `${baseName}_tmp.html`);
      if (bin.libreoffice) {
        try {
          await execAsync(`${bin.libreoffice} --headless --convert-to html "${inputPath}" --outdir "${tmpDir}"`, { timeout: 60_000 });
          const loHtml = path.join(tmpDir, `${baseName}.html`);
          if (existsSync(loHtml)) {
            await rename(loHtml, tmpHtml);
          }
        } catch (e) {
          console.log("LibreOffice DOCX->HTML (for EPUB) failed:", e);
        }
      }
      if (existsSync(tmpHtml) && bin.pandoc) {
        await execAsync(`${bin.pandoc} "${tmpHtml}" -o "${outputPath}"`, { timeout: 60_000 });
      } else if (bin.pandoc) {
        await execAsync(`${bin.pandoc} "${inputPath}" -o "${outputPath}"`, { timeout: 60_000 });
      } else if (existsSync(tmpHtml)) {
        await rename(tmpHtml, outputPath);
      }
    }
  }

  /* ---------- PPTX → * ---------- */

  else if (from === "pptx") {
    if (to === "pdf") {
      if (!bin.libreoffice) {
        throw new Error("LibreOffice diperlukan untuk konversi PPTX → PDF. Silakan pasang LibreOffice (https://www.libreoffice.org).");
      }
      await execAsync(`${bin.libreoffice} --headless --convert-to pdf:impress_pdf_Export "${inputPath}" --outdir "${tmpDir}"`, {
        timeout: 60_000,
      });
    } else if (to === "html") {
      if (!bin.libreoffice) {
        throw new Error("LibreOffice diperlukan untuk konversi PPTX → HTML. Silakan pasang LibreOffice (https://www.libreoffice.org).");
      }
      await execAsync(`${bin.libreoffice} --headless --convert-to html "${inputPath}" --outdir "${tmpDir}"`, {
        timeout: 60_000,
      });
    }
  }

  /* ---------- HTML → * ---------- */

  else if (from === "html") {
    if (to === "pdf") {
      if (bin.libreoffice) {
        try {
          await execAsync(`${bin.libreoffice} --headless --convert-to pdf "${inputPath}" --outdir "${tmpDir}"`, {
            timeout: 60_000,
          });
        } catch (e) {
          console.log("LibreOffice HTML->PDF failed, using JS fallback:", e);
        }
      }
      if (!existsSync(outputPath)) {
        await convertHtmlToPdfJS(buffer, outputPath);
      }
    } else if (to === "docx") {
      if (bin.libreoffice) {
        try {
          await execAsync(`${bin.libreoffice} --headless --convert-to docx:writer_docx_Export "${inputPath}" --outdir "${tmpDir}"`, {
            timeout: 60_000,
          });
        } catch (e) {
          console.log("LibreOffice HTML->DOCX failed, trying Pandoc:", e);
        }
      }
      if (!existsSync(outputPath) && bin.pandoc) {
        await execAsync(`${bin.pandoc} "${inputPath}" -o "${outputPath}" --from html`, { timeout: 60_000 });
      } else if (!existsSync(outputPath)) {
        const content = buffer.toString("utf-8");
        await writeFile(outputPath, content, "utf-8");
      }
    }
  }

  /* ---------- EPUB → * ---------- */

  else if (from === "epub") {
    if (to === "pdf") {
      if (!bin.pandoc || !bin.libreoffice) {
        throw new Error("Pandoc dan LibreOffice diperlukan untuk konversi EPUB → PDF.");
      }
      const tmpDocx = path.join(tmpDir, `${baseName}_tmp.docx`);
      await execAsync(`${bin.pandoc} "${inputPath}" -o "${tmpDocx}"`, { timeout: 60_000 });
      await execAsync(`${bin.libreoffice} --headless --convert-to pdf:writer_pdf_Export "${tmpDocx}" --outdir "${tmpDir}"`, {
        timeout: 60_000,
      });
      const loOut = path.join(tmpDir, `${baseName}_tmp.pdf`);
      if (existsSync(loOut) && loOut !== outputPath) {
        await rename(loOut, outputPath);
      }
    } else if (to === "docx") {
      const tmpHtml = path.join(tmpDir, `${baseName}_tmp.html`);
      if (bin.pandoc) {
        try {
          await execAsync(`${bin.pandoc} "${inputPath}" -o "${tmpHtml}"`, { timeout: 60_000 });
        } catch (e) {}
      }
      if (existsSync(tmpHtml) && bin.libreoffice) {
        try {
          await execAsync(`${bin.libreoffice} --headless --convert-to docx:writer_docx_Export "${tmpHtml}" --outdir "${tmpDir}"`, {
            timeout: 60_000,
          });
          const loDocx = path.join(tmpDir, `${baseName}_tmp.docx`);
          if (existsSync(loDocx)) {
            await rename(loDocx, outputPath);
          }
        } catch (e) {}
      }
      if (!existsSync(outputPath) && bin.pandoc) {
        await execAsync(`${bin.pandoc} "${inputPath}" -o "${outputPath}"`, { timeout: 60_000 });
      }
    }
  }

  if (!existsSync(outputPath)) {
    throw new Error(`Gagal membuat file hasil untuk ${outputName}`);
  }

  return { outputPath, outputName, mimeType };
}
