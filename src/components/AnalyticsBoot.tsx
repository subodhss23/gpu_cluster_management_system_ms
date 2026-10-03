"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { initAnalytics, isAnalyticsEnabled } from "@/lib/analytics";

/** Boots PostHog (if keyed) and captures SPA $pageview on every route change. */
export function AnalyticsBoot() {
  const pathname = usePathname();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    try {
      posthog.capture("$pageview");
    } catch {
      /* never break navigation */
    }
  }, [pathname]);

  return null;
}
