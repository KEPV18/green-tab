export interface StaticShift {
  date: string; // YYYY-MM-DD
  is_off_day: boolean;
  shift_start?: string; // HH:MM
  shift_end?: string; // HH:MM
  break1_time?: string; // HH:MM
  break1_duration?: number;
  break2_time?: string; // HH:MM
  break2_duration?: number;
  break3_time?: string; // HH:MM
  break3_duration?: number;
  notes?: string;
}

export interface DailyShift {
  id?: string;
  user_id: string;
  shift_date: string;
  shift_start: string | null;
  shift_end: string | null;
  break1_time: string | null;
  break1_duration: number;
  break2_time: string | null;
  break2_duration: number;
  break3_time: string | null;
  break3_duration: number;
  notes: string | null;
  is_off_day: boolean;
  is_site_day?: boolean | null;
  absence_type?: string | null;
  ot_hours_day?: number;
  ot_hours_night?: number;
  ot_hours_special?: number;
}

export interface PerformanceData {
  id: string;
  year: number;
  month: number;
  user_id: string;
  good: number;
  bad: number;
  karma_bad: number;
  genesys_good: number;
  genesys_bad: number;
  fcr: number;
  good_phone: number;
  good_chat: number;
  good_email: number;
  bad_phone: number;
  bad_chat: number;
  bad_email: number;
  off_days?: number[] | null;
  tickets?: any[];
}
