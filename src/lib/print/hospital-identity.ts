export type HospitalIdentity = {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

/**
 * Used when settings have not been filled in yet, so a printed document never
 * comes out of the printer with a blank letterhead. Matches the hospital's
 * printed stationery.
 */
export const HOSPITAL_IDENTITY_FALLBACK: HospitalIdentity = {
  name: "Meenakshi Hospital",
  tagline: "Care • Healing • Hope.",
  address: "1st Street, Ramnagar, Pattinamkathan, Ramanathapuram, PIN: 623503",
  phone: "+91 78128 33761",
  email: "meenakshihospitalrmd@gmail.com",
};
