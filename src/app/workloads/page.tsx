"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { XCircle, RotateCcw, Terminal, Save, History, Download, Play } from "lucide-react";
import { useFleet } from "@/lib/store";
import type { JobStatus } from "@/lib/types";
import { checkpointsFor } from "@/lib/checkpoints";
import { timeAgo, downloadJson } from "@/lib/utils";
import { Card, SectionTitle, Badge, Bar } from "@/components/cards";

const FILTERS: ("all" | JobStatus)[] = ["all", "running", "queued", "completed", "failed", "cancelled"];

export default function WorkloadsPage() {
  const { jobs, cancelJob, retryJob, launchJob } = useFleet();
  const [f, setF] = useState<(typeof FILTERS)[number]>("all");
  const [logId, setLogId] = useState<string | null>(null);
  const [tab, setTab] = useState<"logs" | "checkpoints">("logs");
  const rows = jobs.filter((j) => f === "all" || j.status === f);
  const log = jobs.find((j) => j.id === logId);
  const ckpts = useMemo(() => (log ? checkpointsFor(log) : { points: [], totalSteps: 0 }), [log, log?.progress]);

  const restore = (step: number, loss: number) => {
    if (!log) return;
    const frac = ckpts.totalSteps ? (step / ckpts.totalSteps) * 100 : 0;
    launchJob({
      ...log,
      id: `job-${7200 + jobs.length}`,
      name: `${log.name}-resume@${step}`,
      status: "queued",
      progress: Math.round(frac * 10) / 10,
      elapsedHrs: Math.round(log.elapsedHrs * (frac / 100) * 100) / 100,
      costAccrued: log.costAccrued,
      submittedAt: new Date().toISOString(),
      startedAt: null,
      gpuIds: [],
      logs: `RESTORED from ${log.name} step-${step} (loss ${loss}) — warming NCCL, resuming dataloader…`
    });
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Workloads — Slurm + Kubernetes queues"
        hint="Allocate GPU/CPU/memory/network/storage per job. Fractional shares (0.25) emulate Run:AI slicing."
        right={<Link href="/scheduler" className="rounded-lg bg-nv px-4 py-2 text-sm font-semibold text-black">+ Launch job</Link>}
      />
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((s) => (
          <button key={s} onClick={() => setF(s)} className={`rounded-full border px-3 py-1 font-mono text-xs uppercase ${f === s ? "border-nv bg-nv/15 text-nv" : "border-line text-zinc-500 hover:text-white"}`}>
            {s} ({s === "all" ? jobs.length : jobs.filter((j) => j.status === s).length})
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {rows.map((j) => (
            <Card key={j.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold text-white">{j.name}</span>
                <Badge status={j.status}>{j.status}</Badge>
                <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-zinc-400">{j.scheduler} · {j.framework}</span>
                <span className="ml-auto font-mono text-[11px] text-zinc-500">{j.id} · {timeAgo(j.submittedAt)}</span>
              </div>
              <div className="mt-2"><Bar value={j.progress} color={j.status === "failed" ? "bg-rose" : j.status === "queued" ? "bg-amberx" : "bg-nv"} /></div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-400 sm:grid-cols-4">
                <span>👤 {j.user} <span className="text-zinc-600">({j.team})</span></span>
                <span>🖥 {j.gpusRequested}×GPU{j.fractional ? ` (${j.fractional} slice)` : ""} · {j.cpuCores}c · {j.memGB}GB</span>
                <span>💾 {j.storageGB}GB · 🌐 {j.networkMbps}Mb/s</span>
                <span>⏱ {j.elapsedHrs.toFixed(1)}/{j.walltimeHrs}h · ${j.costAccrued.toLocaleString()}</span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-zinc-600">📍 {j.clusterId}{j.partition ? `:${j.partition}` : ""} · progress {j.progress.toFixed(1)}%{j.gpuIds.length > 0 && ` · pinned ${j.gpuIds.length} GPU${j.gpusRequested > 1 ? "s" : ""} → ${Array.from(new Set(j.gpuIds.map((g) => g.replace(/-gpu\d+$/, "")))).slice(0, 2).join(", ")}`}</div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => { setLogId(j.id); setTab("logs"); }} className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-zinc-300 hover:border-nv/60"><Terminal className="h-3.5 w-3.5" /> Logs</button>
                <button onClick={() => { setLogId(j.id); setTab("checkpoints"); }} className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-zinc-300 hover:border-cyanx/60"><Save className="h-3.5 w-3.5" /> Checkpoints</button>
                {(j.status === "running" || j.status === "queued") && <button onClick={() => cancelJob(j.id)} className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-rose hover:border-rose/60"><XCircle className="h-3.5 w-3.5" /> Cancel</button>}
                {(j.status === "failed" || j.status === "cancelled") && <button onClick={() => retryJob(j.id)} className="flex items-center gap-1 rounded-lg border border-nv/40 bg-nv/10 px-3 py-1.5 text-xs text-nv"><RotateCcw className="h-3.5 w-3.5" /> Requeue</button>}
              </div>
            </Card>
          ))}
          {rows.length === 0 && <Card>No jobs with status “{f}”.</Card>}
        </div>
        <div>
          <Card className="sticky top-20">
            <SectionTitle title={tab === "logs" ? "Job logs" : "Checkpoints"} hint={log ? `${log.id} · ${log.name}` : "Select Logs on any job"} />
            <div className="mb-3 flex gap-1.5">
              {(["logs", "checkpoints"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase ${tab === t ? "bg-nv/15 text-nv ring-1 ring-nv/40" : "text-zinc-500 hover:text-white"}`}>
                  {t === "logs" ? <Terminal className="h-3 w-3" /> : <Save className="h-3 w-3" />}{t}
                </button>
              ))}
            </div>
            {!log && <div className="font-mono text-xs text-zinc-500">$ squeue --all<br />$ scontrol show job &lt;id&gt;<br />$ kubectl logs -l app=…</div>}
            {log && tab === "logs" && (
              <div>
                <div className="mb-2 flex flex-wrap gap-1.5"><Badge status={log.status}>{log.status}</Badge><span className="font-mono text-[11px] text-zinc-500">{log.clusterId}</span></div>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-nv">{log.logs ?? "(no log lines yet — job is pending scheduler placement)"}</pre>
                <div className="mt-2 font-mono text-[11px] text-zinc-500">elapsed {log.elapsedHrs.toFixed(2)}h / walltime {log.walltimeHrs}h · accrued ${log.costAccrued.toLocaleString()}</div>
              </div>
            )}
            {log && tab === "checkpoints" && (
              <div>
                {ckpts.points.length === 0 && <div className="text-xs text-zinc-500">No checkpoints yet — queued jobs have nothing to resume from.</div>}
                <div className="max-h-96 space-y-2 overflow-auto">
                  {ckpts.points.map((c) => (
                    <div key={c.id} className="rounded-xl border border-line bg-black/30 p-3">
                      <div className="flex items-center gap-2">
                        <History className="h-3.5 w-3.5 shrink-0 text-cyanx" />
                        <span className="flex-1 font-mono text-xs font-semibold text-white">step {c.step.toLocaleString()} · ep {c.epoch}</span>
                        <span className="font-mono text-[11px] text-nv">loss {c.loss}</span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[10px] text-zinc-500">{c.path} · {c.sizeGB}GB</div>
                      <div className="mt-2 flex gap-1.5">
                        <button onClick={() => restore(c.step, c.loss)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-nv py-1.5 text-[11px] font-bold text-black"><Play className="h-3 w-3" /> Resume job</button>
                        <button onClick={() => downloadJson(`${c.id}-manifest.json`, c)} className="rounded-lg border border-line px-2.5 py-1.5 text-zinc-300" title="Download manifest"><Download className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
                {ckpts.points.length > 0 && <div className="mt-2 font-mono text-[10px] text-zinc-600">resume requeues at checkpoint progress · {ckpts.totalSteps.toLocaleString()} total steps</div>}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
