import type { JobCheckpoint, SimJob } from "./types";
import { seededRand } from "./sim";

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic checkpoints derived from job id + progress (NCCL-safe resume points). */
export function checkpointsFor(job: SimJob): { points: JobCheckpoint[]; totalSteps: number } {
  if (job.status === "queued") return { points: [], totalSteps: 0 };
  const rand = seededRand(hashStr(job.id));
  const totalSteps = 20000 + Math.floor(rand() * 60000);
  const doneSteps = Math.floor(totalSteps * (job.progress / 100));
  const every = Math.max(1, Math.floor(doneSteps / (3 + Math.floor(rand() * 3))));
  const out: JobCheckpoint[] = [];
  let step = every;
  let loss = 3.4 + rand();
  let idx = 1;
  while (step <= doneSteps && out.length < 6) {
    loss = Math.max(0.4, loss * (0.82 + rand() * 0.1));
    const sizeGB = Math.round((job.gpusRequested * (2 + rand() * 3) + 8) * 10) / 10;
    out.push({
      id: `${job.id}-ckpt${idx}`,
      step,
      epoch: Math.floor(step / Math.max(1, Math.floor(totalSteps / 100))),
      loss: Math.round(loss * 1000) / 1000,
      sizeGB,
      ts: new Date(Date.now() - (out.length + 1) * 36e5 * 5).toISOString(),
      path: `s3://helios/checkpoints/${job.name}/step-${step}/`
    });
    step += every;
    idx++;
  }
  return { points: out, totalSteps };
}
