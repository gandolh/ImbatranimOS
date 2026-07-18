/**
 * A small curated list of IANA zones for the world-clock picker. Deliberately
 * NOT exhaustive (the `Intl` tz database has 400+ entries) — this is a
 * "pick a major city" list, not a full zone browser. Formatting itself uses
 * `Intl.DateTimeFormat({ timeZone })` directly (see format.ts), so any valid
 * IANA identifier would work — this list just curates the picker options.
 */
export type TimeZoneOption = {
  value: string
  label: string
}

export const CURATED_TIMEZONES: TimeZoneOption[] = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'America/Denver', label: 'Denver' },
  { value: 'America/Chicago', label: 'Chicago' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Sao_Paulo', label: 'São Paulo' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Athens', label: 'Athens' },
  { value: 'Europe/Moscow', label: 'Moscow' },
  { value: 'Africa/Cairo', label: 'Cairo' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Kolkata', label: 'Mumbai / New Delhi' },
  { value: 'Asia/Dhaka', label: 'Dhaka' },
  { value: 'Asia/Bangkok', label: 'Bangkok' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Shanghai', label: 'Beijing / Shanghai' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Seoul', label: 'Seoul' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
]

export function timeZoneLabel(timeZone: string): string {
  return CURATED_TIMEZONES.find((z) => z.value === timeZone)?.label ?? timeZone
}
