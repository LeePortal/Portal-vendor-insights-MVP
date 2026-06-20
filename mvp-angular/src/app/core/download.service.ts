import { Injectable, inject } from "@angular/core";
import { AuthService } from "./auth.service";
import { ActivityService } from "./activity.service";

export interface PendingDownload { kind: "csv" | "pdf"; filename: string; build?: () => string; }
export interface DownloadLog { ts: number; user: string; ip: string; filename: string; kind: string; }

const LS = "pvi_downloads";

/**
 * Global download gate. EVERY downloaded file routes through request() -> a
 * confirmation modal (rendered in AppShell) -> confirm(), which performs the
 * download and logs it (time + IP + user). IP is captured server-side in
 * production; here it is a placeholder.
 */
@Injectable({ providedIn: "root" })
export class DownloadService {
  private auth = inject(AuthService);
  private activity = inject(ActivityService);
  pending: PendingDownload | null = null;
  log: DownloadLog[] = this.load();

  private load(): DownloadLog[] { try { const r = localStorage.getItem(LS); return r ? JSON.parse(r) : []; } catch { return []; } }
  private persist(): void { try { localStorage.setItem(LS, JSON.stringify(this.log.slice(0, 500))); } catch { /* ignore */ } }

  request(d: PendingDownload): void { this.pending = d; }
  cancel(): void { this.pending = null; }

  confirm(): void {
    const p = this.pending;
    if (!p) return;
    const s = this.auth.session();
    if (p.kind === "csv" && p.build) {
      const blob = new Blob([p.build()], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = p.filename;
      a.click();
      URL.revokeObjectURL(url);
    } else if (p.kind === "pdf") {
      window.print();
    }
    this.log.unshift({ ts: Date.now(), user: s ? s.email : "unknown", ip: "(captured server-side)", filename: p.filename, kind: p.kind });
    this.persist();
    this.activity.log({
      vendorId: s && s.vendorId ? s.vendorId : "portal",
      vendorName: s && s.role === "admin" ? "Portal" : s ? s.name : "",
      userEmail: s ? s.email : "",
      type: p.kind === "pdf" ? "report_pull" : "csv_export",
      target: p.filename,
    });
    this.pending = null;
  }

  downloadsFor(email: string): DownloadLog[] { return this.log.filter((d) => d.user.toLowerCase() === email.toLowerCase()); }
}
