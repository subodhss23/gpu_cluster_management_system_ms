# Instructions — Install, Run & Deploy Helios

## 1. What you need
- **Node.js ≥ 18.17** and npm (check with `node -v && npm -v`).
- No database, no Docker. Seeds live in `src/data/*.json`; runtime state in browser localStorage.
- No env vars required — except optionally `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` for analytics (§9).

## 2. Run locally (60 seconds)
```bash
cd gpu_management_system
npm install        # ~40s, installs next/react/recharts/lucide/tailwind
npm run dev        # → http://localhost:3000
```
Open the URL. Telemetry ticks every 2.5s (green LIVE pill + `T+… SIM` clock in the topbar).
Crank the speed selector (1×–3.6k×) to make walltime fly; toggle Sun/Moon for light mode.

## 3. Production build check (what Vercel runs)
```bash
npm run build
npm start          # serves the optimized build on :3000
```

## 4. Deploy to Vercel (2 paths)
**A — Dashboard (recommended):** push this folder to GitHub → vercel.com → *Add New Project* →
Import → Framework preset **Next.js** → Deploy. No env vars. Done.

**B — CLI:**
```bash
npm i -g vercel
cd gpu_management_system
vercel            # preview deploy
vercel --prod     # production deploy
```

## 5. First-run tour (acceptance script, ~5 minutes)
1. **Overview `/`:** confirm 480 GPUs, heatmap ticking, alerts rail; note the live status-bar footer counts.
2. **Clusters `/clusters`:** *New cluster* → name `nebula-rnd`, 32×H100 → Provision → gear icon → **Configure** (rename, change power cap, add an L40S row to the GPU mix) → open its detail → Delete it.
3. **Cluster detail `/clusters/helios-prod`:** create a partition (e.g. `ml-batch`, 16 GPUs max), drag its priority, toggle it down/up.
4. **Nodes `/nodes`:** click any green cell → inspector shows clocks/MIG/ECC → drag power cap → Apply → enable MIG, carve 2 slices → switch to **Configure** tab → add a label, set node power cap.
5. **Scheduler `/scheduler`:** pick user Ava, app fine-tune, 8 GPUs / 0.5 slice, partition `compute`, submit → lands in `/workloads` **queued**, then auto-starts next tick with pinned GPUs.
6. **Workloads `/workloads`:** watch progress derive from elapsed/walltime; open Logs on `llama3-8b-rlhf` (failed) → Checkpoints tab → Resume one; Cancel a queued job (quota refunds in `/users`).
7. **Lifecycle:** set speed to **3.6k×**, wait ~30s — jobs complete, GPUs release, timeline records it.
8. **Policies `/policies`:** drag a team weight, toggle preemption → revisit `/scheduler` to see limits/verdict change.
9. **Blueprints `/blueprints`:** snapshot `helios-prod` → Launch as `helios-clone` → check `/clusters`.
10. **Serving/Billing/Alerts/Monitoring/Diagnostics:** scale an endpoint ±, start a canary at 10% then promote it, check team burn + CSV export, lower a thermal threshold and watch it fire, filter timeline to `error`, ask the agent “Why did job-7010 fail?”, run DCGM diagnostics.
11. **Topbar:** theme toggle → Export JSON (fleet snapshot) → Reset (restores seeds).
12. **Topology `/topology`:** scroll the 100k table (only ~35 rows in DOM), search `helios-prod-r03`, click a fabric pod to filter by region.
13. **Spot + PXE:** on a cluster detail, **Reclaim 2** in the spot pool (lowest-priority jobs preempt to queued); launch a spot job from `/scheduler` and watch the 0.3× cost; on `/nodes`, hit **reimage** on a node and watch it walk discovery → ready.

## 6. Edit the synthetic data
All files in `src/data/` are plain JSON — edit and refresh:
| File | Controls |
|---|---|
| `clusters.json` | Fleet size, regions, schedulers, GPU mix, fabric, caps |
| `jobs.json` | Queue contents, resources, logs text |
| `users.json` | Teams, roles, quotas, priorities |
| `endpoints.json` | Serving models, engines, RPS/p99 + autoscale policies |
| `activity.json` | Timeline events |
| `alert-rules.json` | Alert thresholds, scopes, severities, cooldowns |
| `gpu-catalog.json` | Specs + $/hr per model |

To add a GPU model: append to `gpu-catalog.json` + reference it in a cluster's `gpuMix`.
Current browser-state key is `helios-fleet-v2` in `src/lib/store.tsx` (bumped when the node
schema grew). To reset everyone's browser state after seed edits, bump it again
(e.g. `helios-fleet-v3`) — old saves are ignored, fresh seeds regenerate.

## 7. Troubleshooting
| Symptom | Fix |
|---|---|
| `npm install` fails on Apple Silicon | `node -v` ≥ 18, then `rm -rf node_modules package-lock.json && npm install` |
| Port 3000 busy | `npm run dev -- -p 3001` |
| Blank charts | Hard-refresh (recharts measures container width on mount) |
| Stale demo data | Topbar → Reset, or DevTools → Application → clear localStorage |
| TypeScript error on build | `npx tsc --noEmit` points at the file; strict mode is on |
| Jobs never start | Check free GPUs on the scheduler page; raise speed (1× advances 7 sim-seconds per tick) or free capacity by cancelling a big job |
| Theme stuck after code changes | Clear `helios-theme` in localStorage; the boot script otherwise wins before paint |

## 8. Project layout (10-second orientation)
`src/app/` 15 pages · `src/components/` shell + status footer + charts + ClusterEditor ·
`src/lib/` types / sim / store / finops / checkpoints / theme / analytics / utils ·
`src/data/` 7 seeds · `prd.md / technical_design.md / design_document.md / features.md` specs.

## 9. Product analytics (PostHog — optional, off by default)
```bash
cp .env.example .env        # then fill in your project token and restart dev
```
- Without `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` every `track()` is a silent no-op — the app is identical.
- With a token: init uses `defaults: "2026-05-30"`, SPA `$pageview` per route + ~25 explicit operator events
  (`job_submitted`, `cluster_created`, `endpoint_scaled`, `alert_acknowledged`, `mig_toggled`,
  `blueprint_launched`, `sim_speed_changed`, …). Tick-loop internals are deliberately *not*
  tracked (too noisy).
- Every event carries `app=gpu_management_system_app1_ms`, so a single PostHog project can filter
  this app apart from your others (`where app = gpu_management_system_app1_ms`). Only synthetic
  fleet IDs and counts are sent — no real user data exists in this simulator.
- **Where to put the token:** enter it manually in the Vercel dashboard
  (Project → Settings → Environment Variables → `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`), never in a
  file you might commit. `.env` is gitignored here, but the dashboard is still the safer habit.
  For local dev, use `.env.local` (also ignored) — never commit a real key to GitHub.
- **If a token ever leaks** (chat, screenshot, committed file): it is not a password — `phc_` keys
  are public client keys by design and ship inside your page's JavaScript where anyone can read
  them. But anyone holding one can spam events into your project and burn quota, so rotate it:
  PostHog → Project Settings → delete the key, create a new one. Consider also setting Allowed
  domains to just your Vercel URL + localhost.
