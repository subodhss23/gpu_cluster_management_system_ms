"use client";
import { useFleet } from "@/lib/store";
import { fmtNum } from "@/lib/utils";

export default function Footer() {
  const { clusters, gpus, jobs } = useFleet();
  const running = jobs.filter((j) => j.status === "running").length;
  const queued = jobs.filter((j) => j.status === "queued").length;
  return (
    <footer className="border-t border-line px-6 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-nv live-dot" />
          <span className="font-mono font-semibold text-nv">HELIOS</span>
          <span className="text-zinc-400">GPU Management System · v0.3</span>
        </span>
        <span className="hidden font-mono sm:inline">·</span>
        <span className="font-mono">
          {clusters.length} clusters · {fmtNum(clusters.reduce((a, c) => a + c.totalGPUs, 0))} GPUs · {fmtNum(gpus.length)} live · {running} running / {queued} queued
        </span>
        <span className="ml-auto hidden font-mono md:inline">simulated telemetry · no hardware touched · Built in California by Subodh</span>
      </div>
    </footer>
  );
}
