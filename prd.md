# PRD — Helios GPU Management System (Simulator)

**Version:** 0.4.0 · **Date:** 2026-10-02 · **Owner:** Helios Platform Team
**Status:** Phases 1–3 built, plus waves 2 (FinOps/serving/alerts), 3 (deep config), 4 (real scheduler lifecycle). Remaining roadmap at the bottom.

## 1. Problem
Teams running LLM training + inference juggle five different tools: BCM-style provisioning,
Slurm queues, Run:AI fractional shares, GPUStack serving, and DCGM health — with no single
pane of glass. Real hardware is expensive to learn on, so onboarding, capacity planning and
failure drills need a **safe, visual, zero-hardware simulator** that still feels operationally real.

## 2. Goals
1. Simulate an enterprise GPU factory (multi-region → single node → single GPU) in the browser.
2. Let any user **choose a GPU/cluster, request resources (GPU/CPU/RAM/NET/storage), launch,
   monitor, and tear down** workloads from a professional dashboard.
3. Persist everything to human-editable **JSON seed files** + localStorage (no DB, Vercel-safe).
4. Look and feel like NVIDIA BCM / Grafana / Run:AI — dark ops console, live charts, heatmaps.

## 3. Non-goals (v0.1)
- No real provisioning, drivers, Slurm daemons or DCGM calls. All telemetry is synthetic.
- No auth / multi-tenancy enforcement (roles are display + quota math only).
- No backend. API routes intentionally omitted so `vercel deploy` works from this repo as-is.

## 4. Personas
| Persona | Needs |
|---|---|
| ML Researcher (Ava, Marcus) | Queue large Slurm jobs, watch loss/progress, survive XID failures |
| Inference Engineer (Priya, Diego) | Keep vLLM/SGLang p99 low, autoscale replicas |
| Platform Admin (Zara) | Provision clusters, cap power, drain bad nodes, manage quotas |
| Intern / Viewer (Tom) | Grab a 0.25 fractional slice without breaking prod |

## 5. Phased scope (agreed order)

### Phase 1 — Multi-cluster + regions ✅ BUILT
- Fleet overview: KPIs, utilization stream, model mix, per-cluster capacity, live heatmap, alerts.
- Clusters page: 4 seed clusters (helios-prod H100×128, atlas-train A100×256, vulcan-infer L40S/A6000×64, edge-dev mixed×32) across us-west / us-east / eu-central.
- Create cluster wizard (name/region/scheduler/GPU model/count/fabric/storage) + decommission (cancels jobs, drops endpoints).
- Regions are first-class (filtering, capacity bars, fabric notes).

### Phase 2 — Single-cluster deep dive ✅ BUILT
- Cluster detail (`/clusters/[id]`): nodes sampled, hottest GPUs, jobs on cluster, power-cap bar, **partitions/QOS editor**, **Configure modal** (rename, mix, caps, stack).
- Nodes & GPUs inventory (`/nodes`): search/filter, heatmap → GPU inspector (util/mem/temp/power/clocks/MIG/ECC/throttle), per-GPU power caps, **MIG slice manager**, node drain/undrain, **Configure tab** (labels, taints, GRES, power cap, job slots).
- **Remaining (Phase 2b):** full node table virtualization (100k-node scale), per-node PXE state machine, IB topology map.

### Phase 3 — Full AI Factory + serving ✅ BUILT
- Workloads queue (`/workloads`): Slurm + K8s unified table, progress bars, logs viewer, **checkpoints browser with resume**, cancel/requeue, pinned-placement readout.
- Launch wizard (`/scheduler`): user/app → cluster **+ partition** → GPU/CPU/MEM/NET/storage sliders (policy-clamped) + fractional (1 / 0.5 / 0.25) + walltime, quota check, queue-position estimate, sbatch/kubectl preview. Submissions queue; the **scheduler loop starts them on free capacity**.
- AI Serving (`/serving`): GPUStack endpoints (vLLM, SGLang, TensorRT-LLM) with RPS/p99/tok-s, replica/load bars, **autoscale policies enforced live**, deploy wizard, routing topology strip.
- Users & quotas (`/users`, live accounting), FinOps (`/billing`: metered spend, budgets, chargeback CSV), Monitoring (`/monitoring`), Alerts (`/alerts`: 5-metric rules engine), Diagnostics (`/diagnostics`), Policies (`/policies`: limits, engines, team weights, queue preview), Blueprints (`/blueprints`: templates + JSON import/export).
- **Remaining (Phase 3b):** spot/preempt simulation, canary deploys.

## 6. Functional requirements (acceptance — all passing)
- [x] User can view 480 GPUs / 65 nodes / 3 regions from one dashboard.
- [x] User can create, configure (mix, caps, stack, partitions), and delete clusters with cascade.
- [x] User can pick any sampled GPU and read util/mem/temp/power/clocks/MIG/ECC/job; carve MIG slices; cap power.
- [x] User can launch a job with explicit GPU/CPU/Mem/Net/Storage + fractional share + partition; it queues, then the scheduler loop starts it on free capacity with pinned GPUs.
- [x] Jobs complete at walltime (GPUs + quota released); user quotas move live on submit/cancel/retry/complete; sim speed 1×–3.6k× makes this observable.
- [x] User can cancel / requeue / resume-from-checkpoint; decommissioning cancels jobs.
- [x] Telemetry ticks (2.5s), pause/resume + speed + light/dark work; Export JSON downloads snapshot; Reset restores seeds.
- [x] `npm run build` passes; Vercel serves all 17 routes with zero env vars.

## 7. UX requirements
Dark-first ops theme (void `#060607`, NVIDIA `#76B900`) **plus a full light mode** (persisted, no-flash, theme-aware charts), Inter + JetBrains Mono, cards with top-glow hairline,
live-dot affordances, heatmap legend, empty states, mobile nav drawer. Every number carries a unit.
Dense dashboard rows cap their height (72-cell heatmap, 3-alert rail) so cards stay even.
No page without a primary action (Launch / Provision / Run diagnostics / Create rule).

## 7. UX requirements
Dark ops theme (void `#060607`, NVIDIA `#76B900`), Inter + JetBrains Mono, cards with top-glow hairline,
live-dot affordances, heatmap legend, empty states, mobile nav drawer. Every number carries a unit.
No page without a primary action (Launch / Provision / Run diagnostics).

## 8. Metrics (simulated success)
Time-to-first-job < 90s from landing; 100% of core flows work offline after first load;
Lighthouse perf ≥ 85; zero env vars required.

## 9. Risks
- Sampling confusion (only ~8 GPU nodes/cluster materialized): mitigated by labeling "sampled" everywhere and keeping aggregates from `clusters.json`.
- Recharts bundle weight: acceptable for dashboard; code-split per route by App Router.
- Users mistaking sim for real infra: persistent "SIMULATION MODE" badge + footer disclaimer.
