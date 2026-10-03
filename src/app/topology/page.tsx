"use client";
import { useMemo, useRef, useState } from "react";
import { Search, Network } from "lucide-react";
import { useFleet } from "@/lib/store";
import { generateTopologyRows, type TopoNode } from "@/lib/sim";
import { fmtNum, pct } from "@/lib/utils";
import { Card, SectionTitle, Badge, Bar } from "@/components/cards";

const ROW_H = 36;
const OVERSCAN = 12;

const STATUS_ORDER: TopoNode["status"][] = ["allocated", "idle", "provisioning", "drain", "degraded", "down"];

function worstOf(statuses: TopoNode["status"][]): string {
  if (statuses.includes("down")) return "#FB7185";
  if (statuses.includes("degraded")) return "#F5A623";
  if (statuses.includes("drain") || statuses.includes("provisioning")) return "#22D3EE";
  return "#76B900";
}

export default function TopologyPage() {
  const { clusters } = useFleet();
  const [q, setQ] = useState("");
  const [clusterF, setClusterF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [regionF, setRegionF] = useState("all");
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => generateTopologyRows(clusters), [clusters]);
  const filtered = useMemo(() => all.filter(
    (r) =>
      (clusterF === "all" || r.clusterId === clusterF) &&
      (statusF === "all" || r.status === statusF) &&
      (regionF === "all" || r.region === regionF) &&
      (!q || r.hostname.toLowerCase().includes(q.toLowerCase()))
  ), [all, q, clusterF, statusF, regionF]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of filtered) m[r.status] = (m[r.status] ?? 0) + 1;
    return m;
  }, [filtered]);
  const avgUtil = filtered.length ? filtered.reduce((a, r) => a + r.util, 0) / filtered.length : 0;

  const regions = useMemo(() => Array.from(new Set(all.map((r) => r.region))), [all]);
  const perRegion = useMemo(() => regions.map((rg) => {
    const rs = all.filter((r) => r.region === rg);
    return { region: rg, count: rs.length, color: worstOf(rs.map((r) => r.status)) };
  }), [all, regions]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleCount = Math.ceil(480 / ROW_H) + OVERSCAN * 2;
  const window = filtered.slice(start, start + visibleCount);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Fabric topology — 100k-node scale"
        hint={`${fmtNum(filtered.length)} of ${fmtNum(all.length)} nodes · windowed rendering (only ~${window.length} rows in the DOM) · click a pod to filter`}
        right={<span className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-500"><Network className="h-3.5 w-3.5 text-nv" />fat-tree · NDR</span>}
      />

      <Card>
        <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-500">
          <span>CORE → AGG → LEAF → HOSTS</span>
          <span className="ml-auto">click a pod to filter the table · hover for counts</span>
        </div>
        <svg viewBox="0 0 1200 400" className="w-full" role="img" aria-label="InfiniBand fat-tree topology">
          {perRegion.map((p, pi) => {
            const cx = 150 + pi * 300;
            const selected = regionF === p.region;
            return (
              <g key={p.region} onClick={() => setRegionF(selected ? "all" : p.region)} className="cursor-pointer">
                <title>{p.region}: {fmtNum(p.count)} nodes — click to {selected ? "clear" : "filter"}</title>
                <rect x={cx - 130} y={8} width={260} height={384} rx={14} fill={selected ? "rgba(118,185,0,0.07)" : "transparent"} stroke={selected ? "#76B900" : "#232527"} strokeWidth={selected ? 2 : 1} />
                <rect x={cx - 70} y={28} width={140} height={34} rx={8} fill="#1A1C1E" stroke="#76B900" strokeWidth={1.5} />
                <text x={cx} y={49} textAnchor="middle" fill="#e7e9ea" fontSize={12} fontFamily="monospace">agg-{p.region}</text>
                {[0, 1, 2, 3].map((li) => {
                  const lx = cx - 105 + li * 70;
                  const leafCount = Math.round(p.count / 4);
                  return (
                    <g key={li}>
                      <line x1={cx} y1={62} x2={lx} y2={120} stroke="#2a2d30" strokeWidth={2} />
                      <rect x={lx - 28} y={120} width={56} height={40} rx={8} fill="#121315" stroke={p.color} strokeWidth={2} />
                      <text x={lx} y={137} textAnchor="middle" fill="#e7e9ea" fontSize={10} fontFamily="monospace">leaf-{li + 1}</text>
                      <text x={lx} y={150} textAnchor="middle" fill="#9CA3AF" fontSize={9} fontFamily="monospace">{fmtNum(leafCount)}</text>
                      <line x1={lx} y1={160} x2={lx} y2={210} stroke="#2a2d30" strokeWidth={1.5} strokeDasharray="4 3" />
                      <rect x={lx - 28} y={210} width={56} height={52} rx={8} fill="rgba(118,185,0,0.06)" stroke="#232527" />
                      <text x={lx} y={228} textAnchor="middle" fill="#76B900" fontSize={11} fontWeight="bold" fontFamily="monospace">{fmtNum(leafCount)}</text>
                      <text x={lx} y={243} textAnchor="middle" fill="#71717a" fontSize={9} fontFamily="monospace">hosts</text>
                      <text x={lx} y={255} textAnchor="middle" fill="#71717a" fontSize={9} fontFamily="monospace">8×GPU</text>
                    </g>
                  );
                })}
                <text x={cx} y={300} textAnchor="middle" fill="#e7e9ea" fontSize={13} fontWeight="bold" fontFamily="monospace">{p.region}</text>
                <text x={cx} y={320} textAnchor="middle" fill={p.color} fontSize={11} fontFamily="monospace">{fmtNum(p.count)} nodes</text>
                <text x={cx} y={340} textAnchor="middle" fill="#71717a" fontSize={10} fontFamily="monospace">2× spine · 200Gb/s · adaptive routing</text>
                {selected && <text x={cx} y={365} textAnchor="middle" fill="#76B900" fontSize={11} fontFamily="monospace">● filtering</text>}
              </g>
            );
          })}
          <rect x={560} y={368} width={80} height={24} rx={6} fill="#1A1C1E" stroke="#76B900" />
          <text x={600} y={384} textAnchor="middle" fill="#e7e9ea" fontSize={10} fontFamily="monospace">core ×2</text>
        </svg>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-nv" />healthy fabric</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-cyanx" />drain / provisioning in pod</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amberx" />degraded links</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-rose" />node down</span>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-line bg-black/40 px-3 py-2">
            <Search className="h-4 w-4 text-zinc-500" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setScrollTop(0); scrollRef.current?.scrollTo({ top: 0 }); }} placeholder="Search 100k hostnames (e.g. helios-prod-r03)…" className="w-full bg-transparent font-mono text-sm text-white outline-none placeholder:text-zinc-600" />
          </div>
          <select value={clusterF} onChange={(e) => setClusterF(e.target.value)} className="rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white">
            <option value="all">All clusters</option>
            {clusters.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
          </select>
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white">
            <option value="all">Any status</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {regionF !== "all" && <button onClick={() => setRegionF("all")} className="rounded-lg border border-nv/50 bg-nv/10 px-3 py-2 font-mono text-xs text-nv">region: {regionF} ✕</button>}
          <span className="ml-auto self-center font-mono text-xs text-zinc-500">{fmtNum(filtered.length)} rows · avg {avgUtil.toFixed(0)}% util</span>
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {STATUS_ORDER.map((s) => (
            <button key={s} onClick={() => setStatusF(statusF === s ? "all" : s)} className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${statusF === s ? "border-nv bg-nv/15 text-nv" : "border-line text-zinc-500"}`}>
              {s} · {fmtNum(counts[s] ?? 0)} ({pct(counts[s] ?? 0, Math.max(1, filtered.length))}%)
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="grid grid-cols-[1.6fr_1fr_0.7fr_0.7fr_0.8fr_1.2fr_0.6fr_0.7fr_0.6fr] gap-2 border-b border-line bg-panel3 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            <span>Hostname</span><span>Cluster</span><span>Role</span><span>Status</span><span className="text-right">GPUs</span><span>Util</span><span className="text-right">Temp</span><span className="text-right">Power</span><span className="text-right">Up</span>
          </div>
          <div ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="h-[480px] overflow-auto">
            <div style={{ height: filtered.length * ROW_H, position: "relative" }}>
              {window.map((r, i) => {
                const top = (start + i) * ROW_H;
                return (
                  <div key={r.id} style={{ top, height: ROW_H }} className="absolute inset-x-0 grid grid-cols-[1.6fr_1fr_0.7fr_0.7fr_0.8fr_1.2fr_0.6fr_0.7fr_0.6fr] items-center gap-2 border-b border-line/50 px-3 font-mono text-[11px]">
                    <span className="truncate text-zinc-200">{r.hostname}</span>
                    <span className="truncate text-zinc-500">{r.clusterId}</span>
                    <span className="text-zinc-500">{r.role === "gpu-compute" ? "gpu" : r.role}</span>
                    <span><Badge status={r.status === "allocated" ? "running" : r.status === "degraded" ? "degraded" : r.status === "down" ? "down" : "info"}>{r.status}</Badge></span>
                    <span className="text-right text-zinc-300">{r.gpus}</span>
                    <span className="flex items-center gap-1.5"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/50"><span className={`block h-full rounded-full ${r.util > 90 ? "bg-nv" : r.util > 50 ? "bg-nv/70" : "bg-nv/30"}`} style={{ width: `${r.util}%` }} /></span><span className="w-9 text-right text-zinc-400">{r.util.toFixed(0)}%</span></span>
                    <span className={`text-right ${r.temp > 83 ? "text-amberx" : "text-zinc-400"}`}>{r.temp.toFixed(0)}°</span>
                    <span className="text-right text-zinc-400">{fmtNum(r.power)}W</span>
                    <span className="text-right text-zinc-500">{r.uptimeDays}d</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-2 font-mono text-[10px] text-zinc-600">rows {fmtNum(start + 1)}–{fmtNum(Math.min(filtered.length, start + window.length))} of {fmtNum(filtered.length)} · deterministic seed 100k · $ sinfo -N -o "%N %T %C %m" at this scale</div>
      </Card>
    </div>
  );
}
