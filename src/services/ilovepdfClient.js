import jwt from "jsonwebtoken";

const API_VERSION = "v1";
const START_SERVER = "https://api.ilovepdf.com";
const LIBRARY_VERSION = "node.ilovepdf-clone.1.0.0";
const JWT_EXPIRE_SECONDS = 3600;

/**
 * Membuat error dengan status HTTP & detail body dari iLovePDF,
 * supaya bisa diteruskan apa adanya ke frontend.
 */
class IlovepdfApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = "IlovepdfApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * Membuat JWT lokal yang ditandatangani dengan secret key,
 * persis seperti perilaku library resmi (self-signed, server-side).
 */
function signLocalJwt(secretKey, publicKey) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "",
    aud: "",
    iat: now,
    nbf: now,
    exp: now + JWT_EXPIRE_SECONDS,
    jti: publicKey,
  };
  return jwt.sign(payload, secretKey, { algorithm: "HS256" });
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractFilenameFromDisposition(disposition) {
  if (!disposition) return null;
  let match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (match) {
    try {
      return decodeURIComponent(match[1].replace(/"/g, ""));
    } catch {
      return match[1];
    }
  }
  match = /filename="?([^";]+)"?/i.exec(disposition);
  return match ? match[1] : null;
}

/**
 * Menjalankan satu alur task iLovePDF lengkap: start -> upload -> process -> download.
 *
 * @param {Object} params
 * @param {string} params.tool - slug tool iLovePDF, mis. "compress"
 * @param {string} params.publicKey
 * @param {string} params.secretKey
 * @param {Array<{buffer: Buffer, originalname: string}>} [params.files]
 * @param {string} [params.sourceUrl] - dipakai untuk tool berbasis URL (htmlpdf)
 * @param {Object} [params.options] - opsi khusus tool, dikirim apa adanya ke /process
 * @returns {Promise<{isJson: boolean, jsonResult?: any, buffer?: Buffer, filename?: string, contentType?: string}>}
 */
export async function runIlovepdfTask({
  tool,
  publicKey,
  secretKey,
  files = [],
  sourceUrl,
  options = {},
}) {
  if (!publicKey || !secretKey) {
    throw new IlovepdfApiError(
      "ILOVEPDF_PUBLIC_KEY dan ILOVEPDF_SECRET_KEY belum diatur di server.",
      400
    );
  }

  const token = signLocalJwt(secretKey, publicKey);
  const authHeaders = { Authorization: `Bearer ${token}` };

  // 1. START: minta worker server + task id
  const startRes = await fetch(
    `${START_SERVER}/${API_VERSION}/start/${tool}?v=${encodeURIComponent(LIBRARY_VERSION)}`,
    { headers: authHeaders }
  );
  const startBody = await parseJsonSafe(startRes);
  if (!startRes.ok || !startBody?.server || !startBody?.task) {
    throw new IlovepdfApiError(
      startBody?.error?.message || "Gagal memulai task di iLovePDF.",
      startRes.status || 500,
      startBody
    );
  }

  const server = `https://${startBody.server}`;
  const task = startBody.task;

  // 2. UPLOAD: file biner (multipart) dan/atau URL (form-encoded)
  const uploadedFiles = [];

  for (const file of files) {
    const form = new FormData();
    form.append("task", task);
    form.append("v", LIBRARY_VERSION);
    form.append("file", new Blob([file.buffer]), file.originalname);

    const upRes = await fetch(`${server}/${API_VERSION}/upload`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });
    const upBody = await parseJsonSafe(upRes);
    if (!upRes.ok || !upBody?.server_filename) {
      throw new IlovepdfApiError(
        upBody?.error?.message || `Gagal mengunggah file "${file.originalname}".`,
        upRes.status || 500,
        upBody
      );
    }
    uploadedFiles.push({
      server_filename: upBody.server_filename,
      filename: file.originalname,
    });
  }

  if (sourceUrl) {
    const body = new URLSearchParams({
      cloud_file: sourceUrl,
      task,
      v: LIBRARY_VERSION,
    });
    const upRes = await fetch(`${server}/${API_VERSION}/upload`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const upBody = await parseJsonSafe(upRes);
    if (!upRes.ok || !upBody?.server_filename) {
      throw new IlovepdfApiError(
        upBody?.error?.message || "Gagal mengunggah dari URL.",
        upRes.status || 500,
        upBody
      );
    }
    uploadedFiles.push({
      server_filename: upBody.server_filename,
      filename: upBody.filename || "source",
    });
  }

  if (uploadedFiles.length === 0) {
    throw new IlovepdfApiError("Tidak ada file atau URL yang diunggah.", 400);
  }

  // 3. PROCESS: eksekusi tool dengan opsi yang diberikan
  const processPayload = {
    tool,
    task,
    files: uploadedFiles,
    ...options,
  };

  const procRes = await fetch(
    `${server}/${API_VERSION}/process?v=${encodeURIComponent(LIBRARY_VERSION)}`,
    {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(processPayload),
    }
  );
  const procBody = await parseJsonSafe(procRes);
  if (!procRes.ok) {
    throw new IlovepdfApiError(
      procBody?.error?.message || "Gagal memproses file di iLovePDF.",
      procRes.status || 500,
      procBody
    );
  }

  // 4. DOWNLOAD: ambil hasil biner. Sebagian tool (validatepdfa, formsdetect,
  //    extract) tidak menghasilkan file biner melainkan data JSON langsung
  //    dari /process ATAU dari /download — kita tangani keduanya.
  const dlRes = await fetch(
    `${server}/${API_VERSION}/download/${task}?v=${encodeURIComponent(LIBRARY_VERSION)}`,
    { headers: authHeaders }
  );

  if (!dlRes.ok) {
    // Tidak ada file untuk diunduh -> kembalikan hasil JSON dari /process saja.
    return { isJson: true, jsonResult: procBody };
  }

  const contentType = dlRes.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const jsonResult = await parseJsonSafe(dlRes);
    return { isJson: true, jsonResult: jsonResult ?? procBody };
  }

  const arrayBuffer = await dlRes.arrayBuffer();
  const disposition = dlRes.headers.get("content-disposition") || "";
  const filename = extractFilenameFromDisposition(disposition) || `${tool}-output`;

  return {
    isJson: false,
    buffer: Buffer.from(arrayBuffer),
    filename,
    contentType: contentType || "application/octet-stream",
  };
}

export { IlovepdfApiError };
