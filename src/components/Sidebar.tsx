"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Boxes, Cpu, Layers, Rocket, ServerCog, Users, Activity, Stethoscope, Zap, DollarSign, BellRing, SlidersHorizontal, LayoutTemplate, Network } from "lucide-react";
import { cx } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Fleet Overview", icon: LayoutDashboard },
  { href: "/clusters", label: "Clusters", icon: Boxes },
  { href: "/blueprints", label: "Blueprints", icon: LayoutTemplate },
  { href: "/nodes", label: "Nodes & GPUs", icon: Cpu },
  { href: "/workloads", label: "Workloads", icon: Layers },
  { href: "/scheduler", label: "Launch Job", icon: Rocket },
  { href: "/policies", label: "Policies", icon: SlidersHorizontal },
  { href: "/serving", label: "AI Serving", icon: ServerCog },
  { href: "/users", label: "Users & Quotas", icon: Users },
  { href: "/billing", label: "Cost & Billing", icon: DollarSign },
  { href: "/monitoring", label: "Monitoring", icon: Activity },
  { href: "/topology", label: "Topology 100k", icon: Network },  { href: "/alerts", label: "Alerts", icon: BellRing },
  { href: "/diagnostics", label: "Diagnostics", icon: Stethoscope }
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-panel lg:flex">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-nv shadow-glow">
          <Zap className="h-5 w-5 text-black" strokeWidth={2.5} />
        </div>
        <div>
          <div className="font-mono text-sm font-bold tracking-widest text-white">HELIOS</div>
          <div className="text-[11px] text-zinc-500">GPU Mgmt System · v0.1</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                active ? "bg-panel3 text-white shadow-card ring-1 ring-nv/40" : "text-zinc-400 hover:bg-panel3 hover:text-white"
              )}
            >
              <Icon className={cx("h-4 w-4", active ? "text-nv" : "text-zinc-500")} />
              {n.label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-nv live-dot" />}
            </Link>
          );
        })}
      </nav>
      <div className="m-3 rounded-xl border border-line bg-panel2 p-3 text-xs">
        <div className="mb-1 font-mono font-semibold text-nv">SIMULATION MODE</div>
        <p className="leading-relaxed text-zinc-400">Synthetic DCGM telemetry ticks every 2.5s. No real GPUs touched.</p>
        <div className="mt-2 flex items-center gap-2 text-zinc-500">
          <span className="h-2 w-2 rounded-full bg-nv live-dot" /> Slurm · K8s · MIG · vLLM
        </div>
      </div>
    </aside>
  );
}
