import { createServerFn } from "@tanstack/react-start";

/** Full system health report (scraper, scan, auto list, core data). */
export const getSystemHealth = createServerFn({ method: "POST" }).handler(async () => {
  const { buildHealthReport } = await import("@/lib/health.server");
  return buildHealthReport();
});
