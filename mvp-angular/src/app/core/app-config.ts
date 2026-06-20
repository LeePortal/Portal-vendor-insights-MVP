/** Runtime data source for Brand Performance Overview.
 *  'synthetic' = in-browser generator (default; offline/demo).
 *  'api'       = fetch tenant-scoped aggregates from the backend (Redshift via /api). */
export const DATA_MODE: "synthetic" | "api" = "synthetic";
/** Base URL of the backend API when DATA_MODE === 'api' (e.g. "" for same-origin Vercel functions). */
export const API_BASE_URL = "";
