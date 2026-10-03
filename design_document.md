# Design Document — Helios UX & Visual System

## 1. Design intent
A night-shift NOC that NVIDIA admins recognize instantly: near-black canvas, phosphor-green
primary, mono telemetry numerals, hairline cards, and motion that signals *liveness* without noise.
Every screen answers in 5 seconds: **how big is my fleet, is it healthy, what needs me?**

## 2. Inspiration mapping (from research brief)
| Source | What we borrowed |
|---|---|
| NVIDIA Base Command Manager | Cluster lifecycle language (provision → monitor → decommission), hybrid Slurm+K8s badges, power-cap bars |
| ClusterWareAI | Zero-touch wizard copy, conversational diagnostics agent, hardware-agnostic cards |
| Slurm | `squeue/sbatch/scontrol` vocabulary, queue positions, priorities, walltime, drain/undrain |
| Run:AI | Fractional GPU selector (1 / 0.5 / 0.25), quota-vs-use bars, per-team priorities |
| K8s + GPU Operator | Node roles, device-plugin/MIG fields, driver rollout event |
| GPUStack | Endpoint cards (engine badge, replicas, RPS/p99/tok-s), routing topology strip |
| NVIDIA DCGM | Inspector fields (util/mem/temp/power/SM/MEM clocks/ECC/XID/throttle), diag runner |
| Vultr Open Cluster Manager | Terraform+Ansible provisioning copy, Prometheus/PROMQL hints, Grafana-style streams |

## 3. Layout system
- **Shell:** fixed left sidebar (13 items, icon + label, active ring + live dot) + sticky topbar
  (live/paused pill, SIM clock, 1×–3.6k× speed control, Sun/Moon theme toggle, Export JSON, Reset)
  + max-w-1400 content + **live status-bar footer** (cluster/GPU/job counts update with the sim).
  Mobile collapses to a nav drawer.
- **Page grammar:** hero/strip → KPI row → 2 charts → inventory/queue → platform strip. No page
  exceeds 3 levels of hierarchy. Dense dashboard rows cap content height (72-cell heatmap,
  3-alert rail, h-44 charts) so sibling cards stay even.
- **Cards:** `glass` gradient, 1px `line` border, 16px radius, 8/32 shadow; accent hairline
  (`from-transparent via-nv`) on KPI cards only.
- **Overlays:** `ClusterEditor` modal (fixed, click-outside to dismiss); inspector uses inline
  Inspect/Configure tabs rather than drawers to preserve heatmap context.

## 4. Color & type
- Canvas `void #060607`, panels `#0C0D0E/#121315/#1A1C1E`, hairlines `#232527`.
- Primary NVIDIA `#76B900` (actions, busy, success) with glow `0 0 24px rgba(118,185,0,.35)`.
- Semantics: amber `#F5A623` (queue/provision/throttle), cyan `#22D3EE` (info/serving-meta),
  violet `#A78BFA` (memory/slices), rose `#FB7185` (down/failed).
- **Light mode** (`html.light` layer in `globals.css`): white cards `#fff/#fafafa/#f4f4f5`,
  hairlines `#e4e4e7`, darkened text ramp, legible brand tones (text-nv → `#4d7a00`,
  amber → `#b45309`, cyan → `#0e7490`, rose → `#e11d48`). Terminal `<pre>` blocks stay dark
  in both modes; charts swap grid/tooltip themes via `useTheme()`. Preference persists
  (`helios-theme`) with a pre-paint boot script — no flash.
- Sans: Inter (UI), Mono: JetBrains Mono fallback (every number, hostname, job id, CLI snippet).
- Status is **never color-alone**: every dot pairs with an uppercase mono label badge.

## 5. Data-visualization rules
- One X per chart (time `t`), units in tooltip + axis context; gradients at 45% → 2% opacity.
- Heatmap buckets: >90 solid nv, 60–90 nv/70, 25–60 nv/40, 2–25 nv/20, idle zinc-800,
  throttled amber, down rose — legend always adjacent. Overview uses 72 compact cells;
  full slices live on `/nodes`.
- Progress bars cap at 100, animate via `transition-all`; failed=rose, queued=amber.
- Donut/bars use a 6-color categorical set starting at nv; labels show count + share %.
- Timelines truncate long messages (`line-clamp-2`) with full text one click away; rails show
  "+N more" instead of stretching their cards.

## 6. Signature moments
1. Hero console with grid-bg + green nebula glow and three CTAs (Launch / Clusters / Diag).
2. Live heatmap whose cells jitter every 2.5s (pause-able, speed-able) and bind to real jobs.
3. GPU inspector: DCGM fields + power-limit slider + MIG slice grid + throttle callout.
4. Scheduler quota bars that flip rose when over-budget; verdicts quoting true free-GPU counts.
5. Cranking sim speed to 3.6k× and watching a queued job start, burn quota, complete, and free its GPUs.
6. Ops-agent chat with quick-prompt chips and a fake-but-plausible DCGM transcript.
7. Activity timeline with spine + severity dots (Grafana annotations feel).
8. Blueprint launch: name a cluster, hit Launch, watch it appear across fleet, nodes, and billing.

## 7. Accessibility & responsiveness
Contrast ≥ 4.5:1 for body text; charts get adjacent tabular readouts (model mix list,
top-power list); focus rings via `hover:ring-nv`; heatmap cells are real `<button>`s with
`title` tooltips; grid collapses 3→2→1 col under xl/md.

## 8. What "great" still means (remaining polish)
Node virtualization with sticky headers, IB fabric SVG map, named MIG geometries (1g/2g/3g/4g/7g),
spot/preempt pools, canary deploys, PXE state machine. Same tokens, no new palette.
