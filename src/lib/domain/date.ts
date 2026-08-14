export function formatHospitalDate(value: Date | string, withTime = false) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: process.env.APP_TIMEZONE ?? "Asia/Kolkata",
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
  }).format(new Date(value));
}

export function formatTokenNumber(value: number) {
  if (!Number.isInteger(value) || value < 1)
    throw new Error("Invalid token number.");
  return String(value);
}

export function calculateAge(dob: string, now = new Date()) {
  const birth = new Date(`${dob}T00:00:00Z`);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() &&
      now.getUTCDate() < birth.getUTCDate())
  )
    age -= 1;
  return Math.max(0, age);
}

export function minutesSince(value: string, now = new Date()) {
  return Math.max(
    0,
    Math.round((now.getTime() - new Date(value).getTime()) / 60000),
  );
}

export function ipDaysSince(value: string, now = new Date()) {
  return Math.max(1, Math.ceil((now.getTime() - new Date(value).getTime()) / 86400000));
}

export function isHospitalToday(value: Date | string, now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIMEZONE ?? "Asia/Kolkata" });
  return formatter.format(new Date(value)) === formatter.format(now);
}
