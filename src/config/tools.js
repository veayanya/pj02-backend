/**
 * Daftar tool iLovePDF yang didukung backend ini.
 * `key` HARUS sama persis dengan slug "tool" resmi di API iLovePDF,
 * karena dipakai langsung sebagai path /start/{tool} dan field "tool"
 * saat memanggil endpoint /process.
 *
 * inputType:
 *  - "file"     : perlu upload satu atau lebih file lewat multipart/form-data
 *  - "url"      : perlu URL sumber (dipakai htmlpdf, konversi dari halaman web)
 *
 * multiple: apakah tool ini menerima lebih dari satu file sekaligus
 *           (merge & imagepdf memang didesain iLovePDF untuk multi-file).
 *
 * resultKind:
 *  - "file" : hasil proses selalu berupa file yang bisa diunduh
 *  - "auto" : hasil bisa berupa file ATAU JSON (mis. validatepdfa, formsdetect,
 *             extract) -> backend akan otomatis mendeteksi dari response.
 */

export const TOOLS = [
  { key: "merge", label: "Gabung PDF", inputType: "file", multiple: true, accept: ".pdf", resultKind: "file" },
  { key: "split", label: "Pisah PDF", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "splitsmart", label: "Pisah PDF (Smart/AI)", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "compress", label: "Kompres PDF", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "rotate", label: "Putar PDF", inputType: "file", multiple: true, accept: ".pdf", resultKind: "file" },
  { key: "watermark", label: "Beri Watermark", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "pagenumber", label: "Nomor Halaman", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "unlock", label: "Buka Kunci PDF", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "protect", label: "Kunci PDF (Password)", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "repair", label: "Perbaiki PDF", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "pdfjpg", label: "PDF ke JPG", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "imagepdf", label: "Gambar ke PDF", inputType: "file", multiple: true, accept: ".jpg,.jpeg,.png,.gif,.bmp,.tiff,.tif,.webp", resultKind: "file" },
  { key: "officepdf", label: "Office ke PDF", inputType: "file", multiple: false, accept: ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt", resultKind: "file" },
  { key: "htmlpdf", label: "Website (HTML) ke PDF", inputType: "url", multiple: false, resultKind: "file" },
  { key: "pdfa", label: "Konversi ke PDF/A", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "validatepdfa", label: "Validasi PDF/A", inputType: "file", multiple: false, accept: ".pdf", resultKind: "auto" },
  { key: "pdfocr", label: "OCR PDF (Bisa dicari)", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "extract", label: "Ekstrak Teks PDF", inputType: "file", multiple: false, accept: ".pdf", resultKind: "auto" },
  { key: "pdfmarkdown", label: "PDF ke Markdown", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "translate", label: "Terjemahkan PDF", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "summarize", label: "Ringkas PDF", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "formsdetect", label: "Deteksi Form PDF", inputType: "file", multiple: false, accept: ".pdf", resultKind: "auto" },
  { key: "editpdf", label: "Edit PDF (lanjutan)", inputType: "file", multiple: false, accept: ".pdf", resultKind: "file" },
  { key: "sign", label: "Tanda Tangan PDF (lanjutan)", inputType: "file", multiple: false, accept: ".pdf", resultKind: "auto" },
];

export const TOOL_KEYS = TOOLS.map((t) => t.key);

export function getToolConfig(key) {
  return TOOLS.find((t) => t.key === key);
}
