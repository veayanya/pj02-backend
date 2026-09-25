/**
 * Job diproses paralel hingga maksimal MAX_CONCURRENT. Setiap job
 * punya id, status, dan payload hasil/error. Frontend melakukan polling
 * ke GET /api/convert?id=<jobId> untuk cek status.
 */

const MAX_CONCURRENT = 4; // konversi paralel
const JOB_TTL_MS = 5 * 60_000; // 5 menit — hapus otomatis job yang sudah selesai

const jobs = new Map();
let running = 0;

const queue = [];

function next() {
  if (running >= MAX_CONCURRENT || queue.length === 0) return;
  const run = queue.shift();
  running++;
  run();
}

/** Masukkan tugas konversi ke antrean. Langsung kembalikan job id. */
export function enqueue(id, task) {
  const job = { id, status: "queued", createdAt: Date.now() };
  jobs.set(id, job);

  const run = async () => {
    job.status = "processing";
    try {
      const { filename, mimeType, result } = await task();
      job.status = "done";
      job.filename = filename;
      job.mimeType = mimeType;
      job.result = result;
    } catch (err) {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
    } finally {
      running--;
      schedulePurge(id);
      next();
    }
  };

  queue.push(run);
  next();

  return id;
}

export function getJob(id) {
  return jobs.get(id);
}

function schedulePurge(id) {
  setTimeout(() => jobs.delete(id), JOB_TTL_MS);
}
