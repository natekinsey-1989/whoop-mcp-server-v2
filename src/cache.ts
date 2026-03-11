import { writeFileSync, readFileSync, existsSync } from "fs";
import type { WhoopDailyCache } from "./types.js";
import {
  fetchLatestCycle,
  fetchLatestRecovery,
  fetchLatestSleep,
  fetchRecentWorkouts,
  fetchProfile,
  fetchBodyMeasurement,
} from "./whoop.js";

const CACHE_FILE = "/tmp/whoop_cache.json";

let memoryCache: WhoopDailyCache | null = null;

export function readCache(): WhoopDailyCache | null {
  if (memoryCache) return memoryCache;

  if (existsSync(CACHE_FILE)) {
    try {
      const raw = readFileSync(CACHE_FILE, "utf8");
      memoryCache = JSON.parse(raw) as WhoopDailyCache;
      return memoryCache;
    } catch {
      return null;
    }
  }

  return null;
}

export function writeCache(data: WhoopDailyCache): void {
  memoryCache = data;
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf8");
  console.log("[cache] Written at", data.cached_at);
}

export async function refreshCache(): Promise<WhoopDailyCache> {
  console.log("[cache] Refreshing from Whoop API...");

  const [cycle, recovery, sleep, workouts, profile, body] = await Promise.all([
    fetchLatestCycle(),
    fetchLatestRecovery(),
    fetchLatestSleep(),
    fetchRecentWorkouts(5),
    fetchProfile(),
    fetchBodyMeasurement(),
  ]);

  const data: WhoopDailyCache = {
    cached_at: new Date().toISOString(),
    cycle,
    recovery,
    sleep,
    workouts,
    profile,
    body,
  };

  writeCache(data);
  console.log("[cache] Refresh complete");
  return data;
}
