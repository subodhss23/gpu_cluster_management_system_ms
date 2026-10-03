"use client";

import posthog from "posthog-js";

let ready = false;

/** Initialize PostHog once. No-op unless a project token is set. */
export function initAnalytics(): boolean {
  if (ready || typeof window === "undefined") return ready;
  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return false;
  try {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      defaults: "2026-05-30"
    });
    posthog.register({
      app: "gpu_management_system_app1_ms"
    });
    ready = true;
  } catch {
    /* analytics must never break the app */
  }
  return ready;
}

/** Fire a custom event. Safe to call anywhere — no-ops when disabled. */
export function track(event: string, props?: Record<string, unknown>): void {
  try {
    if (ready) posthog.capture(event, props);
  } catch {
    /* ignore */
  }
}

export function isAnalyticsEnabled(): boolean {
  return ready;
}
