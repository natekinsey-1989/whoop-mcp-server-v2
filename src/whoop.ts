import { getValidAccessToken } from "./token.js";
import type {
  WhoopCycle,
  WhoopRecovery,
  WhoopSleep,
  WhoopWorkout,
  WhoopProfile,
  WhoopBodyMeasurement,
  WhoopListResponse,
} from "./types.js";

const BASE = "https://api.prod.whoop.com/developer/v2";

async function get<T>(path: string): Promise<T> {
  const token = await getValidAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whoop API error ${res.status} on ${path}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchLatestCycle(): Promise<WhoopCycle | null> {
  const data = await get<WhoopListResponse<WhoopCycle>>("/cycle?limit=1");
  return data.records[0] ?? null;
}

export async function fetchLatestRecovery(): Promise<WhoopRecovery | null> {
  const data = await get<WhoopListResponse<WhoopRecovery>>("/recovery?limit=1");
  return data.records[0] ?? null;
}

export async function fetchLatestSleep(): Promise<WhoopSleep | null> {
  const data = await get<WhoopListResponse<WhoopSleep>>("/activity/sleep?limit=1");
  return data.records[0] ?? null;
}

export async function fetchRecentWorkouts(limit = 5): Promise<WhoopWorkout[]> {
  const data = await get<WhoopListResponse<WhoopWorkout>>(`/activity/workout?limit=${limit}`);
  return data.records;
}

export async function fetchProfile(): Promise<WhoopProfile> {
  return get<WhoopProfile>("/user/profile/basic");
}

export async function fetchBodyMeasurement(): Promise<WhoopBodyMeasurement> {
  return get<WhoopBodyMeasurement>("/user/measurement/body");
}
