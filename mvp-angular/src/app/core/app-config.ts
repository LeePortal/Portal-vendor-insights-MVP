/** Runtime data source for Brand Performance Overview.
 *  'synthetic' = in-browser generator (default; offline/demo).
 *  'api'       = fetch tenant-scoped aggregates from the backend (Redshift via /api). */
export const DATA_MODE: "synthetic" | "api" = "api";
/** Base URL of the backend API when DATA_MODE === 'api'. Absolute (Vercel) so it works from any
 *  host (Vercel, GitHub Pages, localhost); the function sends CORS headers. Use "" for same-origin. */
export const API_BASE_URL = "https://portal-vendor-insights-mvp.vercel.app";
