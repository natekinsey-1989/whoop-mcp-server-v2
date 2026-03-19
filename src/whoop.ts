import { getValidAccessToken } from "./token.js";
import type {
  WhoopCycle,
  WhoopRecovery,
  WhoopSleep,
  WhoopWorkout,
  WhoopProfile,
  WhoopBodyMeasurement,
  WhoopListResponse,
  WhoopSportMap,
} from "./types.js";

const BASE = "https://api.prod.whoop.com/developer/v2";
const BASE_V1 = "https://api.prod.whoop.com/developer/v1";

// ─── Hardcoded fallback sport map ─────────────────────────────────────────────
// Covers all known IDs observed in practice. Unknown IDs fall back to
// "Unknown (ID)" at render time.
const FALLBACK_SPORT_MAP: WhoopSportMap = {
  [-1]: "Activity",
  0: "Running",
  1: "Cycling",
  16: "Baseball",
  17: "Basketball",
  18: "Rowing",
  19: "Fencing",
  20: "Field Hockey",
  21: "Football",
  22: "Golf",
  24: "Ice Hockey",
  25: "Lacrosse",
  27: "Rugby",
  28: "Sailing",
  29: "Skiing",
  30: "Soccer",
  31: "Softball",
  32: "Squash",
  33: "Swimming",
  34: "Tennis",
  35: "Track & Field",
  36: "Volleyball",
  37: "Water Polo",
  38: "Wrestling",
  39: "Boxing",
  42: "Dance",
  43: "Pilates",
  44: "Yoga",
  45: "Weightlifting",
  47: "Cross Country Skiing",
  48: "Functional Fitness",
  49: "Duathlon",
  51: "Gymnastics",
  52: "Hiking",
  53: "Horseback Riding",
  55: "Kayaking",
  56: "Martial Arts",
  57: "Mountain Biking",
  59: "Powerlifting",
  60: "Rock Climbing",
  61: "Paddleboarding",
  62: "Triathlon",
  63: "Running",
  64: "Skiing",
  65: "Snowboarding",
  66: "Squash",
  67: "Stairmaster",
  68: "Surfing",
  69: "Swimming",
  70: "Tennis",
  71: "Strength Training",
  73: "Walking",
  74: "Water Sports",
  75: "Yoga",
  76: "Weightlifting",
  93: "Spinning",
  98: "Lap Swimming",
  104: "HIIT",
  119: "Cycling",
  123: "Strength Training",
  126: "HIIT",
  230: "Functional Fitness",
  233: "Functional Fitness",
};

async function get<T>(path: string, baseUrl = BASE): Promise<T> {
  const token = await getValidAccessToken();
  const res = await fetch(`${baseUrl}${path}`, {
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

// ─── Sport map: try API first, fall back to hardcoded table ──────────────────
export async function fetchSportMap(): Promise<WhoopSportMap> {
  try {
    // Attempt undocumented v1 sport list endpoint
    const data = await get<{ records: { id: number; name: string }[] }>(
      "/sport",
      BASE_V1
    );
    if (Array.isArray(data.records) && data.records.length > 0) {
      const map: WhoopSportMap = {};
      for (const s of data.records) {
        if (typeof s.id === "number" && typeof s.name === "string") {
          map[s.id] = s.name;
        }
      }
      console.log(`[whoop] Sport map fetched from API: ${Object.keys(map).length} sports`);
      return map;
    }
  } catch (err) {
    console.log("[whoop] Sport API unavailable, using hardcoded map:", err instanceof Error ? err.message : String(err));
  }
  return FALLBACK_SPORT_MAP;
}
