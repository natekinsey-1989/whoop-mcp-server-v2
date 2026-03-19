import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readCache, refreshCache } from "./cache.js";
import type { WhoopSportMap } from "./types.js";

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "N/A";
  return n.toFixed(decimals);
}

function msToHours(ms: number | null | undefined): number | null {
  if (ms == null) return null;
  return ms / 3600000;
}

function cacheAge(cachedAt: string): string {
  const mins = Math.round((Date.now() - new Date(cachedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

// ─── Time formatting helpers ──────────────────────────────────────────────────

// Parse ISO timestamp and timezone_offset (+HH:MM or -HH:MM) into local HHMM
function toLocalHHMM(iso: string, tzOffset: string): string {
  try {
    const utcMs = new Date(iso).getTime();
    // Parse offset: "+05:30" or "-05:00"
    const match = tzOffset.match(/^([+-])(\d{2}):(\d{2})$/);
    if (!match) return "----";
    const sign = match[1] === "+" ? 1 : -1;
    const offsetMs = sign * (parseInt(match[2]) * 60 + parseInt(match[3])) * 60000;
    const localMs = utcMs + offsetMs;
    const d = new Date(localMs);
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${hh}${mm}`;
  } catch {
    return "----";
  }
}

function durationMin(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

// ─── Sport name lookup ────────────────────────────────────────────────────────
function sportName(sportId: number, map: WhoopSportMap): string {
  return map[sportId] ?? `Unknown (${sportId})`;
}

export function registerTools(server: McpServer): void {

  // ─── Overview ───────────────────────────────────────────────────────────────
  server.registerTool(
    "whoop_overview",
    {
      title: "Whoop Daily Overview",
      description: `Returns a summary of today's Whoop data: recovery score, HRV, RHR, day strain, sleep performance, and sleep hours. Data is cached daily at 6am ET. Use this as the starting point before diving into specific metrics.

Returns:
  - recovery_score: 0-100 (green >67, yellow 34-66, red <34)
  - hrv_ms: heart rate variability in milliseconds (higher = better)
  - rhr_bpm: resting heart rate
  - day_strain: 0-21 scale
  - sleep_performance_pct: 0-100%
  - total_sleep_hrs: hours of sleep
  - cached_at: when data was last synced`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const cache = readCache();
      if (!cache) {
        return {
          content: [{ type: "text", text: "No cached data. Run whoop_sync first or wait for the 6am cron." }],
          isError: true,
        };
      }

      const { cycle, recovery, sleep } = cache;
      const totalSleepHrs = msToHours(
        (sleep?.score?.stage_summary?.total_in_bed_time_milli ?? 0) -
        (sleep?.score?.stage_summary?.total_awake_time_milli ?? 0)
      );

      const lines = [
        "WHOOP DAILY OVERVIEW",
        "====================",
        "Cached: " + cacheAge(cache.cached_at),
        "",
        "RECOVERY",
        "  Score:  " + fmt(recovery?.score?.recovery_score, 0) + "%",
        "  HRV:    " + fmt(recovery?.score?.hrv_rmssd_milli) + " ms",
        "  RHR:    " + fmt(recovery?.score?.resting_heart_rate, 0) + " bpm",
        "  SpO2:   " + fmt(recovery?.score?.spo2_percentage) + "%",
        "",
        "STRAIN",
        "  Day Strain: " + fmt(cycle?.score?.strain),
        "  Kilojoules: " + fmt(cycle?.score?.kilojoule, 0) + " kJ",
        "  Avg HR:     " + fmt(cycle?.score?.average_heart_rate, 0) + " bpm",
        "",
        "SLEEP",
        "  Performance:  " + fmt(sleep?.score?.sleep_performance_percentage, 0) + "%",
        "  Total Sleep:  " + fmt(totalSleepHrs) + " hrs",
        "  Resp Rate:    " + fmt(sleep?.score?.respiratory_rate) + " rpm",
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          cached_at: cache.cached_at,
          recovery_score: recovery?.score?.recovery_score ?? null,
          hrv_ms: recovery?.score?.hrv_rmssd_milli ?? null,
          rhr_bpm: recovery?.score?.resting_heart_rate ?? null,
          spo2_pct: recovery?.score?.spo2_percentage ?? null,
          day_strain: cycle?.score?.strain ?? null,
          kilojoule: cycle?.score?.kilojoule ?? null,
          sleep_performance_pct: sleep?.score?.sleep_performance_percentage ?? null,
          total_sleep_hrs: totalSleepHrs,
          respiratory_rate: sleep?.score?.respiratory_rate ?? null,
        },
      };
    }
  );

  // ─── Recovery ───────────────────────────────────────────────────────────────
  server.registerTool(
    "whoop_recovery",
    {
      title: "Whoop Recovery Detail",
      description: `Full recovery data from the most recent Whoop recovery record: HRV, RHR, SpO2, skin temperature, and recovery score with state.

Returns all recovery metrics plus calibration status. HRV (RMSSD) is the primary signal — track trends over 7-30 days rather than single values.`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const cache = readCache();
      if (!cache?.recovery) {
        return { content: [{ type: "text", text: "No recovery data cached." }], isError: true };
      }

      const r = cache.recovery;
      const s = r.score;

      const lines = [
        "WHOOP RECOVERY DETAIL",
        "=====================",
        "Cached: " + cacheAge(cache.cached_at),
        "Status: " + r.score_state,
        "",
        "  Recovery Score: " + fmt(s?.recovery_score, 0) + "%",
        "  HRV (RMSSD):    " + fmt(s?.hrv_rmssd_milli) + " ms",
        "  Resting HR:     " + fmt(s?.resting_heart_rate, 0) + " bpm",
        "  SpO2:           " + fmt(s?.spo2_percentage) + "%",
        "  Skin Temp:      " + fmt(s?.skin_temp_celsius) + " C",
        "  Calibrating:    " + (s?.user_calibrating ? "yes" : "no"),
        "",
        "Recorded: " + r.created_at,
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          cached_at: cache.cached_at,
          score_state: r.score_state,
          recovery_score: s?.recovery_score ?? null,
          hrv_rmssd_milli: s?.hrv_rmssd_milli ?? null,
          resting_heart_rate: s?.resting_heart_rate ?? null,
          spo2_percentage: s?.spo2_percentage ?? null,
          skin_temp_celsius: s?.skin_temp_celsius ?? null,
          user_calibrating: s?.user_calibrating ?? null,
        },
      };
    }
  );

  // ─── Sleep ──────────────────────────────────────────────────────────────────
  server.registerTool(
    "whoop_sleep",
    {
      title: "Whoop Sleep Detail",
      description: `Full sleep breakdown: total sleep, REM, slow-wave (deep), light sleep, awake time, sleep performance %, efficiency %, consistency %, and respiratory rate.

Stage targets: REM >20% of total, SWS >15% of total. Performance <85% suggests insufficient sleep for training load.`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const cache = readCache();
      if (!cache?.sleep) {
        return { content: [{ type: "text", text: "No sleep data cached." }], isError: true };
      }

      const sl = cache.sleep;
      const s = sl.score;
      const st = s?.stage_summary;

      const totalSleepMs = (st?.total_in_bed_time_milli ?? 0) - (st?.total_awake_time_milli ?? 0);
      const totalSleepHrs = msToHours(totalSleepMs);

      const lines = [
        "WHOOP SLEEP DETAIL",
        "==================",
        "Cached: " + cacheAge(cache.cached_at),
        (sl.nap ? "Type: Nap" : "Type: Main sleep"),
        "Period: " + sl.start.split("T")[0] + " -> " + sl.end.split("T")[0],
        "",
        "SCORES",
        "  Performance:  " + fmt(s?.sleep_performance_percentage, 0) + "%",
        "  Efficiency:   " + fmt(s?.sleep_efficiency_percentage) + "%",
        "  Consistency:  " + fmt(s?.sleep_consistency_percentage, 0) + "%",
        "  Resp Rate:    " + fmt(s?.respiratory_rate) + " rpm",
        "",
        "STAGES",
        "  Total Sleep:  " + fmt(totalSleepHrs) + " hrs",
        "  REM:          " + fmt(msToHours(st?.total_rem_sleep_time_milli)) + " hrs",
        "  Deep (SWS):   " + fmt(msToHours(st?.total_slow_wave_sleep_time_milli)) + " hrs",
        "  Light:        " + fmt(msToHours(st?.total_light_sleep_time_milli)) + " hrs",
        "  Awake:        " + fmt(msToHours(st?.total_awake_time_milli)) + " hrs",
        "  Cycles:       " + (st?.sleep_cycle_count ?? "N/A"),
        "  Disturbances: " + (st?.disturbance_count ?? "N/A"),
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          cached_at: cache.cached_at,
          nap: sl.nap,
          sleep_performance_pct: s?.sleep_performance_percentage ?? null,
          sleep_efficiency_pct: s?.sleep_efficiency_percentage ?? null,
          sleep_consistency_pct: s?.sleep_consistency_percentage ?? null,
          respiratory_rate: s?.respiratory_rate ?? null,
          total_sleep_hrs: totalSleepHrs,
          rem_hrs: msToHours(st?.total_rem_sleep_time_milli),
          sws_hrs: msToHours(st?.total_slow_wave_sleep_time_milli),
          light_hrs: msToHours(st?.total_light_sleep_time_milli),
          awake_hrs: msToHours(st?.total_awake_time_milli),
        },
      };
    }
  );

  // ─── Strain ─────────────────────────────────────────────────────────────────
  server.registerTool(
    "whoop_strain",
    {
      title: "Whoop Strain & Workouts",
      description: `Day strain score plus details on recent workouts (up to 5): sport name, start/end time, duration, strain, HR range (min/avg/max), kilojoules, and distance.

Strain scale: 0-10 light, 10-14 moderate, 14-18 hard, 18-21 all out. Compare against recovery score to assess training readiness.
Incomplete records (missing score data) are included and flagged with a warning.`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const cache = readCache();
      if (!cache) {
        return { content: [{ type: "text", text: "No strain data cached." }], isError: true };
      }

      const { cycle, workouts } = cache;
      // Fall back to empty map if cache predates sport_map addition
      const smap: WhoopSportMap = cache.sport_map ?? {};

      const workoutLines = workouts.length === 0
        ? ["  No workouts recorded"]
        : workouts.map((w, i) => {
            const name = sportName(w.sport_id, smap);
            const tz = w.timezone_offset ?? "+00:00";
            const startTime = toLocalHHMM(w.start, tz);
            const endTime = toLocalHHMM(w.end, tz);
            const dur = durationMin(w.start, w.end);
            const header = `  ${i + 1}. ${w.start.split("T")[0]} | ${name} | ${startTime}-${endTime} (${dur} min)`;

            if (!w.score) {
              return [
                header + " | ⚠ incomplete record",
                "     Strain: — | Avg HR: — | Max HR: — | Min HR: —",
                "     Energy: —",
              ].join("\n");
            }

            const sc = w.score;
            const minHR = sc.min_heart_rate != null ? fmt(sc.min_heart_rate, 0) : "—";

            const z = sc.zone_duration;
            const zones = z ? [
              "z1=" + fmt(msToHours(z.zone_one_milli)) + "h",
              "z2=" + fmt(msToHours(z.zone_two_milli)) + "h",
              "z3=" + fmt(msToHours(z.zone_three_milli)) + "h",
              "z4=" + fmt(msToHours(z.zone_four_milli)) + "h",
              "z5=" + fmt(msToHours(z.zone_five_milli)) + "h",
            ].join(" ") : "";

            return [
              header,
              `     Strain: ${fmt(sc.strain)} | Avg HR: ${fmt(sc.average_heart_rate, 0)} | Max HR: ${fmt(sc.max_heart_rate, 0)} | Min HR: ${minHR}`,
              `     Energy: ${fmt(sc.kilojoule, 0)} kJ` + (sc.distance_meter ? ` | Dist: ${fmt(sc.distance_meter / 1000)} km` : ""),
              zones ? `     HR Zones: ${zones}` : "",
            ].filter(Boolean).join("\n");
          });

      const lines = [
        "WHOOP STRAIN & WORKOUTS",
        "=======================",
        "Cached: " + cacheAge(cache.cached_at),
        "",
        "DAY STRAIN",
        "  Strain:     " + fmt(cycle?.score?.strain),
        "  Kilojoules: " + fmt(cycle?.score?.kilojoule, 0) + " kJ",
        "  Avg HR:     " + fmt(cycle?.score?.average_heart_rate, 0) + " bpm",
        "",
        "WORKOUTS (" + workouts.length + ")",
        ...workoutLines,
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          cached_at: cache.cached_at,
          day_strain: cycle?.score?.strain ?? null,
          kilojoule: cycle?.score?.kilojoule ?? null,
          workouts: workouts.map(w => {
            const tz = w.timezone_offset ?? "+00:00";
            return {
              date: w.start.split("T")[0],
              start_time: toLocalHHMM(w.start, tz),
              end_time: toLocalHHMM(w.end, tz),
              duration_min: durationMin(w.start, w.end),
              sport_id: w.sport_id,
              sport_name: sportName(w.sport_id, smap),
              incomplete: !w.score,
              strain: w.score?.strain ?? null,
              avg_hr: w.score?.average_heart_rate ?? null,
              max_hr: w.score?.max_heart_rate ?? null,
              min_hr: w.score?.min_heart_rate ?? null,
              kilojoule: w.score?.kilojoule ?? null,
              distance_km: w.score?.distance_meter ? w.score.distance_meter / 1000 : null,
            };
          }),
        },
      };
    }
  );

  // ─── Profile ────────────────────────────────────────────────────────────────
  server.registerTool(
    "whoop_profile",
    {
      title: "Whoop Profile & Body Metrics",
      description: "User profile (name, email) and body measurements (height, weight, max heart rate). Useful for context when interpreting other metrics.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const cache = readCache();
      if (!cache?.profile) {
        return { content: [{ type: "text", text: "No profile data cached." }], isError: true };
      }

      const { profile, body } = cache;

      const lines = [
        "WHOOP PROFILE",
        "=============",
        "Cached: " + cacheAge(cache.cached_at),
        "",
        "  Name:   " + profile.first_name + " " + profile.last_name,
        "  Email:  " + profile.email,
        "  ID:     " + profile.user_id,
        "",
        "BODY MEASUREMENTS",
        "  Height:  " + (body ? fmt(body.height_meter * 100, 0) + " cm" : "N/A"),
        "  Weight:  " + (body ? fmt(body.weight_kilogram) + " kg" : "N/A"),
        "  Max HR:  " + (body ? fmt(body.max_heart_rate, 0) + " bpm" : "N/A"),
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          cached_at: cache.cached_at,
          user_id: profile.user_id,
          name: profile.first_name + " " + profile.last_name,
          email: profile.email,
          height_cm: body ? body.height_meter * 100 : null,
          weight_kg: body?.weight_kilogram ?? null,
          max_hr: body?.max_heart_rate ?? null,
        },
      };
    }
  );

  // ─── Sync (manual trigger) ──────────────────────────────────────────────────
  server.registerTool(
    "whoop_sync",
    {
      title: "Force Whoop Data Sync",
      description: "Manually triggers a fresh pull from the Whoop API and updates the cache. Use this if the daily cron hasn't run yet or you want live data before 6am. Returns a summary of what was cached.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async () => {
      try {
        const cache = await refreshCache();
        return {
          content: [{ type: "text", text: "Sync complete. Cached at: " + cache.cached_at }],
          structuredContent: { cached_at: cache.cached_at, success: true },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: "Sync failed: " + msg }],
          isError: true,
        };
      }
    }
  );
}
