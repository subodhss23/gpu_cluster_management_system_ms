"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, BarChart, Bar as RBar } from "recharts";
import type { SimGpu } from "@/lib/types";
import { useTheme } from "@/lib/theme";
import { cx } from "@/lib/utils";

function useChartTheme() {
  const { theme } = useTheme();
  const light = theme === "light";
  return {
    grid: light ? "#e4e4e7" : "#1c1e20",
    tick: light ? "#71717a" : "#71717a",
    tooltip: light
      ? { backgroundColor: "#ffffff", border: "1px solid #e4e4e7", borderRadius: 10, fontSize: 12, color: "#27272a" }
      : { backgroundColor: "#121315", border: "1px solid #232527", borderRadius: 10, fontSize: 12, color: "#e7e9ea" }
  };
}

export function FleetArea({ data, dataKey = "util", color = "#76B900", unit = "%" }: { data: any[]; dataKey?: string; color?: string; unit?: string }) {
  const t = useChartTheme();
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={t.grid} strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fill: t.tick, fontSize: 10 }} axisLine={false} tickLine={false} interval={7} />
          <YAxis tick={{ fill: t.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={t.tooltip} formatter={(v: any) => [`${v}${unit}`, dataKey]} />
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#g-${dataKey})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const PIE_COLORS = ["#76B900", "#22D3EE", "#A78BFA", "#F5A623", "#FB7185", "#9CA3AF"];

export function ModelDonut({ data }: { data: { name: string; value: number }[] }) {
  const t = useChartTheme();
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3} strokeWidth={0}>
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={t.tooltip} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MiniBars({ data, height = "h-56" }: { data: { name: string; gpus: number }[]; height?: string }) {
  const t = useChartTheme();
  return (
    <div className={`${height} w-full`}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid stroke={t.grid} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fill: t.tick, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-18} dy={8} height={52} />
          <YAxis tick={{ fill: t.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={t.tooltip} />
          <RBar dataKey="gpus" fill="#76B900" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function gpuCellColor(u: number, status: string): string {
  if (status === "down") return "bg-rose/80";
  if (status === "throttled") return "bg-amberx/90";
  if (u >= 90) return "bg-nv";
  if (u >= 60) return "bg-nv/70";
  if (u >= 25) return "bg-nv/40";
  if (u > 2) return "bg-nv/20";
  return "bg-zinc-800";
}

export function GpuHeatmap({ gpus, onPick, compact }: { gpus: SimGpu[]; onPick?: (g: SimGpu) => void; compact?: boolean }) {
  const cell = compact ? "h-5 w-5 rounded" : "h-7 w-7 rounded-md";
  return (
    <div className="flex flex-wrap gap-1.5">
      {gpus.map((g) => (
        <button
          key={g.id}
          title={`${g.id} · ${g.model} · ${g.utilPct}% · ${g.tempC}°C · ${g.powerW}W`}
          onClick={() => onPick?.(g)}
          className={cx(cell, "ring-1 ring-black/40 transition hover:scale-110 hover:ring-nv", gpuCellColor(g.utilPct, g.status))}
        />
      ))}
    </div>
  );
}
