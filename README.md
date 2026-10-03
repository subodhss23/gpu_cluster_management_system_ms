<div align="center">

# ⚡ HELIOS — GPU Management System

### *Run a 480-GPU AI factory from your browser. No GPUs required.*

**Provision clusters · Slice GPUs · Schedule Slurm & K8s jobs · Serve LLMs · Watch DCGM telemetry stream —**
**all simulated, all live, all in one dark ops console.**

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Charts](https://img.shields.io/badge/Recharts-live-76B900)](https://recharts.org/)
[![Data](https://img.shields.io/badge/seeds-human_editable_JSON-orange)](./src/data/)
[![Deploy](https://img.shields.io/badge/deploy-Vercel-black?logo=vercel)](https://vercel.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](./README.md)

[🚀 Quickstart](#-run-it-in-60-seconds) · [🎬 90-second tour](#-the-90-second-tour) · [✨ Features](#-whats-inside) · [🗺 Roadmap](#-roadmap)

</div>

---

## 🤔 What is this?

**Helios** is a love letter to everyone who has ever stared at `squeue`, a Grafana dashboard, and a cloud bill at 2 AM and thought: *"there has to be one place for all of this."*

It simulates an **enterprise GPU factory** of the kind NVIDIA Base Command Manager, Run:AI, and GPUStack operate in production — 4 clusters, 3 regions, 480 GPUs, Slurm + Kubernetes queues, MIG slicing, vLLM serving, DCGM health streams, FinOps billing — as a **fully interactive Next.js app** with zero backend. Every number ticks, every queue moves, every alert fires. And you can't break anything, because the hardware is gloriously fake.

> Perfect for: **learning GPU ops** without a $3M cluster · **demoing** scheduling/serving ideas · **prototyping** dashboards before wiring real APIs · **interviewing** ("redesign this queue" is a great prompt).

---

## 🎬 The 90-second tour

| ⏱ | Do this | You'll see |
|---|---------|------------|
| 0:00 | Open `/` | Fleet console: 480 GPUs, live util stream, GPU heatmap ticking every 2.5s |
| 0:15 | `/scheduler` → launch an 8-GPU fine-tune as Ava | Quota check, free-GPU verdict, then your job queues in `/workloads` and auto-starts next tick |
| 0:35 | `/nodes` → click any glowing cell | Full DCGM inspector: clocks, MIG slices, ECC, throttle — then cap its power |
| 0:50 | `/diagnostics` → ask *"Why did job-7010 fail?"* | Ops agent traces the XID-79 failure + suggests the requeue command |
| 1:05 | `/alerts` → lower the thermal threshold | A live alert fires into the timeline within seconds |
| 1:20 | Topbar → **Export JSON**, then **Reset** | Your whole fleet as a file, then a fresh factory |

---

## ✨ What's inside

### 🖥 Fleet command
<table>
<tr><td>

- **Ops console** — KPIs (GPUs, util, power vs cap, RPS, storage, attention), live streams, model-mix donut
- **Live GPU heatmap** — sampled GPUs as cells (72 compact on the overview, full slice on `/nodes`), hover for vitals, click to inspect
- **Alert rail** — XID faults, thermal caps, autoscale events, queue pressure

</td></tr>
</table>

### 🏗 Clusters, partitions & blueprints
- **Create / configure / decommission** clusters (Slurm, K8s, hybrid) — editing the GPU mix *reshapes the fleet live*
- **Partitions & QOS** per cluster: priorities, limits, up/down state, account access — enforced by the launch wizard
- **Blueprints**: snapshot any cluster into a template, instantiate it, share as JSON, import a teammate's file

### 🎛 Nodes & GPUs
- DCGM inspector: util, memory, temp, power, SM/MEM clocks, ECC, throttle reasons
- **MIG slice manager**: carve up to 7 isolated slices on H100/A100/L40S
- Per-GPU power caps, per-node labels/taints/GRES/power caps, Slurm drain/undrain

### 🚀 Scheduling
- Launch wizard: user/app → cluster/partition → GPU/CPU/RAM/NET/storage + **fractional slices** (1 / 0.5 / 0.25)
- **Policy console**: walltime/GPU limits, fairshare, backfill, preemption, team weights — all binding, with live queue-order preview
- Unified queue with logs, **checkpoints** (resume any job from any step), cancel/requeue

### 🤖 AI serving & FinOps
- GPUStack endpoints (vLLM, SGLang, TensorRT-LLM) with RPS/p99/tok-s, **autoscale policies that act live**, deploy wizard
- **Billing**: metered $/GPU-hr spend, team budgets, chargeback CSV export
- **Alert rules engine** over temp/util/power/ECC/queue depth, evaluated every tick

### …and the details
- 🌗 Dark / light mode (persisted, no-flash, charts adapt) · 💾 Everything persists to localStorage · 📴 Works fully offline after first load · ♿ Keyboard-friendly, labeled statuses (never color-alone) · 📊 PostHog analytics, opt-in via one env key (inert otherwise)

---

## 🛠 Built with

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js 14** App Router | 14 pages, Vercel-deployable, zero config |
| Language | **TypeScript** (strict) | The sim engine deserves types |
| Styling | **Tailwind 3** + custom ops theme | NVIDIA-green dark console + light mode |
| Charts | **Recharts** | Theme-aware streams, donuts, bars |
| Icons | **Lucide** | 13-route sidebar without image assets |
| State | React context + `localStorage` | No DB, no env vars, no backend — ever |
| Data | Hand-written **JSON seeds** | Edit `src/data/*.json`, refresh, done |

**How the simulation works:** a seeded PRNG (`mulberry32`) generates a deterministic fleet from `clusters.json`; a 2.5s tick random-walks util/temp/power, advances sim-hours (1×–3.6k× speed), completes jobs at walltime, starts queued jobs on free capacity with GPU pinning, jitters serving traffic, fires autoscalers, and evaluates alert rules. Same story on every load — perfect for demos.

---

## 🏃 Run it in 60 seconds

```bash
cd gpu_management_system
npm install     # ~40s
npm run dev     # → http://localhost:3000
```

**Deploy to Vercel** — push to GitHub → vercel.com → *Add New Project → Import* (Next.js preset) → Deploy. That's it. No env vars, no database, no Docker.

> Full install / tour / troubleshooting guide → [`instructions.md`](./instructions.md)

---

## 📁 Repo map

```
src/app/            15 pages — overview · clusters · clusters/[id] · blueprints ·
                    nodes · workloads · scheduler · policies · serving · users ·
                    billing · monitoring · alerts · diagnostics (+ cluster-detail alias)
src/components/     Sidebar · Topbar · Footer (live status bar) · cards · charts · ClusterEditor
src/lib/            types · sim (fleet generator + live tick) · store (context +
                    localStorage) · finops (pricing) · checkpoints · theme · utils
src/data/           clusters · jobs · users · endpoints · activity · gpu-catalog · alert-rules
prd.md              requirements + phased roadmap
technical_design.md architecture · data model · sim engine · scale story
design_document.md  UX system · NVIDIA/Grafana mapping · visualization rules
features.md         full shipped-feature list + roadmap
instructions.md     install · deploy · tour · troubleshooting
```

**Make it yours:** edit anything in `src/data/*.json` and refresh. Add a GPU model to `gpu-catalog.json`, reference it in a cluster's `gpuMix`, and it flows through pricing, heatmaps, and the scheduler. Changed the seeds for everyone? Bump `LS_KEY` in `src/lib/store.tsx` so browsers pick up the fresh factory.

---

## 🗺 Roadmap

- [x] Multi-cluster + regions · single-cluster depth · AI factory + serving
- [x] FinOps billing · checkpoints · autoscale policies · alert rules · MIG manager
- [x] Deep config: cluster editor · partitions/QOS · node config · policy console · blueprints
- [x] Real lifecycle: capacity scheduler loop · walltime completion · sim-speed clock · live quotas · GPU pinning
- [x] Web scale: 100k virtualized topology + IB map · spot pools + preemption · canaries · PXE pipeline
- [ ] Vitest suite (sim determinism, tick bounds, quota math) + Playwright smoke tests

Ideas? Open an issue with the **shortest version** of your idea. Bonus points for sketching which JSON seed it would live in.

---

## ⚠️ One honest note

Every GPU, job, watt, and dollar here is **synthetic**. Helios is a simulator for learning, demoing, and designing — it provisions nothing and bills no one. If it teaches you something real about GPU operations, it's done its job.

<div align="center">

**Built for everyone who has ever waited on a queue.** 🟢

*MIT — take it, fork it, demo it, break it (you can't, it's fake hardware).*

</div>
