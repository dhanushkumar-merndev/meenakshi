export const APP_ROLES = [
  "admin",
  "reception",
  "op",
  "doctor",
  "ip",
  "pharmacy",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type Profile = {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
  status: "active" | "inactive";
  doctorId: string | null;
};

export type NavItem = {
  title: string;
  href: string;
  icon: string;
};

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  data?: Record<string, string | number | boolean | null>;
};
