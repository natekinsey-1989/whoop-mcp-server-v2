// Token storage
export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
}

// Whoop API response types
export interface WhoopCycleScore {
  strain: number | null;
  kilojoule: number | null;
  average_heart_rate: number | null;
  max_heart_rate: number | null;
}

export interface WhoopCycle {
  id: number;
  start: string;
  end: string | null;
  score_state: string;
  score: WhoopCycleScore | null;
}

export interface WhoopRecoveryScore {
  recovery_score: number;
  resting_heart_rate: number;
  hrv_rmssd_milli: number;
  spo2_percentage: number;
  skin_temp_celsius: number;
  user_calibrating: boolean;
}

export interface WhoopRecovery {
  cycle_id: number;
  sleep_id: number;
  created_at: string;
  updated_at: string;
  score_state: string;
  score: WhoopRecoveryScore | null;
}

export interface WhoopSleepStageSummary {
  total_in_bed_time_milli: number;
  total_awake_time_milli: number;
  total_no_data_time_milli: number;
  total_light_sleep_time_milli: number;
  total_slow_wave_sleep_time_milli: number;
  total_rem_sleep_time_milli: number;
  sleep_cycle_count: number;
  disturbance_count: number;
}

export interface WhoopSleepScore {
  stage_summary: WhoopSleepStageSummary;
  sleep_needed: {
    baseline_milli: number;
    need_from_sleep_debt_milli: number;
    need_from_recent_strain_milli: number;
    need_from_recent_nap_milli: number;
  };
  respiratory_rate: number;
  sleep_performance_percentage: number;
  sleep_consistency_percentage: number;
  sleep_efficiency_percentage: number;
}

export interface WhoopSleep {
  id: number;
  start: string;
  end: string;
  nap: boolean;
  score_state: string;
  score: WhoopSleepScore | null;
}

export interface WhoopWorkoutScore {
  strain: number;
  average_heart_rate: number;
  max_heart_rate: number;
  min_heart_rate: number | null;  // added
  kilojoule: number;
  percent_recorded: number;
  distance_meter: number | null;
  altitude_gain_meter: number | null;
  zone_duration: {
    zone_zero_milli: number | null;
    zone_one_milli: number | null;
    zone_two_milli: number | null;
    zone_three_milli: number | null;
    zone_four_milli: number | null;
    zone_five_milli: number | null;
  };
}

export interface WhoopWorkout {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_id: number;
  score_state: string;
  score: WhoopWorkoutScore | null;
}

export interface WhoopProfile {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface WhoopBodyMeasurement {
  height_meter: number;
  weight_kilogram: number;
  max_heart_rate: number;
}

// Sport ID → name lookup map
export type WhoopSportMap = Record<number, string>;

// Cached data shape written to disk daily
export interface WhoopDailyCache {
  cached_at: string; // ISO timestamp
  cycle: WhoopCycle | null;
  recovery: WhoopRecovery | null;
  sleep: WhoopSleep | null;
  workouts: WhoopWorkout[];
  profile: WhoopProfile | null;
  body: WhoopBodyMeasurement | null;
  sport_map: WhoopSportMap; // added
}

// Paginated API list response
export interface WhoopListResponse<T> {
  records: T[];
  next_token: string | null;
}
