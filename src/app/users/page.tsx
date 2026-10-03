"use client";
import { Shield } from "lucide-react";
import { useFleet } from "@/lib/store";
import { pct } from "@/lib/utils";
import { Card, SectionTitle, Badge, Bar } from "@/components/cards";

export default function UsersPage() {
  const { users, jobs } = useFleet();
  return (
    <div className="space-y-6">
      <SectionTitle title="Users & quotas" hint="Teams, priorities and GPU/CPU/memory budgets. Launch-page submissions are checked against these quotas." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {users.map((u) => {
          const uj = jobs.filter((j) => j.user === u.name);
          return (
            <Card key={u.id}>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-panel3 font-mono text-sm font-bold text-nv ring-1 ring-line">{u.name.split(" ").map((w) => w[0]).join("")}</div>
                <div><div className="text-sm font-semibold text-white">{u.name}</div><div className="font-mono text-[11px] text-zinc-500">{u.team} · pri {u.priority}</div></div>
                <span className="ml-auto"><Badge status={u.role === "viewer" ? "info" : u.role === "admin" ? "success" : "warn"}>{u.role}</Badge></span>
              </div>
              <div className="mt-3 space-y-2 text-xs">
                {[["GPUs", u.usedGPUs, u.quotaGPUs], ["CPU", u.usedCpuCores, u.quotaCpuCores], ["MEM GB", u.usedMemGB, u.quotaMemGB]].map(([l, used, q]) => (
                  <div key={l as string}><div className="mb-1 flex justify-between font-mono text-[11px]"><span className="text-zinc-500">{l}</span><span className="text-zinc-300">{used}/{q} · {pct(used as number, q as number)}%</span></div><Bar value={pct(used as number, q as number)} color={pct(used as number, q as number) > 90 ? "bg-amberx" : "bg-nv"} /></div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-1 font-mono text-[11px] text-zinc-500"><Shield className="h-3 w-3" />{u.activeJobs} active · {uj.length} in current slice · {u.email}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
