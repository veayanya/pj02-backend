import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

/**
 * Cari lokasi binary converter: env var override -> path instalasi umum
 * (ramah Windows, dipakai untuk lokal/dev) -> pencarian di PATH (which/where).
 * Di image Docker yang dipakai Render, LibreOffice/Pandoc/Tesseract/Poppler
 * sudah di-install lewat apt, jadi pencarian PATH inilah yang sebenarnya berhasil.
 */
function findBinary(name, candidates) {
  const envKey = `${name.toUpperCase()}_PATH`;
  const envVal = process.env[envKey];
  if (envVal && existsSync(envVal)) return `"${envVal}"`;

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return `"${candidate}"`;
  }

  try {
    const isWin = process.platform === "win32";
    const checkCmd = isWin ? `where.exe ${name}` : `which ${name}`;
    execSync(checkCmd, { stdio: "ignore" });
    return name;
  } catch {
    return null;
  }
}

export function getBinaries() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const cwd = process.cwd();

  return {
    libreoffice: findBinary("soffice", [
      path.join(cwd, "bin", "soffice.exe"),
      path.join(cwd, "bin", "LibreOffice", "program", "soffice.exe"),
      path.join(programFiles, "LibreOffice", "program", "soffice.exe"),
      path.join(programFilesX86, "LibreOffice", "program", "soffice.exe"),
    ]),
    pandoc: findBinary("pandoc", [
      path.join(cwd, "bin", "pandoc.exe"),
      path.join(programFiles, "Pandoc", "pandoc.exe"),
      path.join(programFilesX86, "Pandoc", "pandoc.exe"),
      path.join(localAppData, "Pandoc", "pandoc.exe"),
    ]),
    tesseract: findBinary("tesseract", [
      path.join(cwd, "bin", "tesseract.exe"),
      path.join(programFiles, "Tesseract-OCR", "tesseract.exe"),
      path.join(programFilesX86, "Tesseract-OCR", "tesseract.exe"),
    ]),
    pdftoppm: findBinary("pdftoppm", [
      path.join(cwd, "bin", "pdftoppm.exe"),
      path.join(programFiles, "poppler", "bin", "pdftoppm.exe"),
      path.join(programFiles, "poppler", "Library", "bin", "pdftoppm.exe"),
      path.join(localAppData, "poppler", "bin", "pdftoppm.exe"),
    ]),
    pdftotext: findBinary("pdftotext", [
      path.join(cwd, "bin", "pdftotext.exe"),
      path.join(programFiles, "poppler", "bin", "pdftotext.exe"),
      path.join(programFiles, "poppler", "Library", "bin", "pdftotext.exe"),
      path.join(localAppData, "poppler", "bin", "pdftotext.exe"),
    ]),
  };
}
