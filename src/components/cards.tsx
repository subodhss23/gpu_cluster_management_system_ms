import React from "react";
import { cx, STATUS_COLOR } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("glass rounded-2xl p-5 shadow-card", className)}>{children}</div>;
}

export function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-nv to-transparent opacity-70" />
      <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={cx("mt-1 font-mono text-2xl font-bold text-white", accent)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-400">{sub}</div>}
    </Card>
  );
}

export function Badge({ status, children }: { status: string; children?: React.ReactNode }) {
  const c = STATUS_COLOR[status] ?? "text-zinc-300";
  const dot = c.replace("text-", "bg-");
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border border-line bg-black/40 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider", c)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", dot)} />
      {children ?? status}
    </span>
  );
}

export function Bar({ value, color = "bg-nv" }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/60 ring-1 ring-line">
      <div className={cx("h-full rounded-full transition-all", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function SectionTitle({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export function Empty({ msg }: { msg: string }) {
  return <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-zinc-500">{msg}</div>;
}
