"use client";
import Link from "next/link";
import { useState } from "react";
import { Pause, Play, RotateCcw, Download, Menu, Sun, Moon, Gauge } from "lucide-react";
import { useFleet } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { track } from "@/lib/analytics";
import { downloadJson } from "@/lib/utils";

const SPEEDS = [1, 60, 720, 3600];

function simClock(h: number): string {
  if (h < 48) return `T+${h.toFixed(1)}h`;
  return `T+${Math.floor(h / 24)}d ${(h % 24).toFixed(0)}h`;
}

const MOBILE_NAV = [
  { href: "/", label: "Overview" },
  { href: "/clusters", label: "Clusters" },
  { href: "/nodes", label: "GPUs" },
  { href: "/workloads", label: "Jobs" },
  { href: "/scheduler", label: "Launch" },
  { href: "/policies", label: "Policies" },
  { href: "/blueprints", label: "Prints" },
  { href: "/serving", label: "Serving" },
  { href: "/users", label: "Users" },
  { href: "/billing", label: "Billing" },
  { href: "/monitoring", label: "Monitor" },
  { href: "/topology", label: "Topo" },
  { href: "/alerts", label: "Alerts" },
  { href: "/diagnostics", label: "Diag" }
];

export default function Topbar() {
  const { live, toggleLive, resetDemo, clusters, jobs, gpus, simSpeed, simHours, setSimSpeed } = useFleet();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [now] = useState(() => new Date().toUTCString().slice(0, 22));

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-void/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
        <button className="rounded-lg border border-line p-2 lg:hidden" onClick={() => setOpen(!open)} aria-label="menu">
          <Menu className="h-4 w-4" />
        </button>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`absolute h-full w-full rounded-full ${live ? "bg-nv live-dot" : "bg-zinc-600"}`} />
          </span>
          <span className="font-mono text-xs tracking-widest text-zinc-400">{live ? "LIVE · DCGM STREAM" : "PAUSED"} · {now} UTC · <span className="text-nv">{simClock(simHours)} SIM</span></span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-0.5 rounded-lg border border-line bg-panel2 p-0.5 md:flex" title="Simulation speed — walltime advances this many × faster than real time">
            <Gauge className="mx-1 h-3.5 w-3.5 text-zinc-500" />
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => setSimSpeed(s)} className={`rounded-md px-2 py-1 font-mono text-[11px] ${simSpeed === s ? "bg-nv font-bold text-black" : "text-zinc-400 hover:text-white"}`}>
                {s >= 1000 ? `${s / 1000}k×` : `${s}×`}
              </button>
            ))}
          </div>
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs font-medium hover:border-nv/60"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle light / dark mode"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5 text-nv" /> : <Moon className="h-3.5 w-3.5 text-nv" />}
            <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          <button
            onClick={toggleLive}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs font-medium hover:border-nv/60"
            title="Pause / resume synthetic telemetry"
          >
            {live ? <Pause className="h-3.5 w-3.5 text-nv" /> : <Play className="h-3.5 w-3.5 text-nv" />}
            {live ? "Pause" : "Resume"}
          </button>
          <button
            onClick={() => { downloadJson("helios-fleet-export.json", { clusters, jobs, exportedAt: new Date().toISOString(), gpuSample: gpus.slice(0, 25) }); track("fleet_exported", { jobs: jobs.length }); }}
            className="hidden items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs font-medium hover:border-nv/60 sm:flex"
          >
            <Download className="h-3.5 w-3.5 text-nv" /> Export JSON
          </button>
          <button
            onClick={() => { if (confirm("Reset demo to seed JSON state?")) { resetDemo(); track("demo_reset", {}); } }}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs font-medium hover:border-rose/60"
          >
            <RotateCcw className="h-3.5 w-3.5 text-rose" /> Reset
          </button>
        </div>
      </div>
      {open && (
        <nav className="grid grid-cols-3 gap-1 border-t border-line p-2 lg:hidden">
          {MOBILE_NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-lg bg-panel2 px-3 py-2 text-center text-xs text-zinc-300">
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
