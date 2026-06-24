import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { AuthService } from "../core/auth.service";
import { VendorAdminService } from "../core/vendor-admin.service";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-wrap">
      <aside class="login-aside">
        <div>
          <img *ngIf="!logoFailed" src="https://portal.io/assets/images/logo-index.png" (error)="logoFailed = true" alt="Portal" style="max-width:120px;margin-bottom:22px" />
          <div *ngIf="logoFailed" style="font-weight:800;font-size:22px;margin-bottom:22px">Portal<span style="color:var(--accent)">.</span></div>
          <div class="lead">Vendor Services</div>
          <div class="sub">The performance data behind every Portal proposal — for your brand.</div>
        </div>
        <div class="sub" style="opacity:.7">MVP prototype · sample data</div>
      </aside>
      <main class="login-main">
        <div class="login-card">
          <h2>Sign in</h2>
          <p class="muted" style="margin:6px 0 22px">Access your brand's performance on the Portal network.</p>
          <form (ngSubmit)="submit()">
            <div class="field"><label for="email">Work email</label><input id="email" name="email" type="email" [(ngModel)]="email" placeholder="you@brand.com" autocomplete="username" required /></div>
            <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" [(ngModel)]="password" placeholder="********" autocomplete="current-password" /></div>
            <div class="err" *ngIf="error">{{ error }}</div>
            <div *ngIf="notice" style="color:var(--positive);font-size:13px;margin-bottom:12px">{{ notice }}</div>
            <button class="pbtn primary" type="submit" style="width:100%;justify-content:center;padding:11px">Sign in</button>
          </form>
          <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:12.5px">
            <a (click)="forgot()" style="color:var(--accent);cursor:pointer">Forgot password?</a>
            <a (click)="emailCode()" style="color:var(--accent);cursor:pointer">Email me a login code</a>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin:18px 0;color:var(--text-muted);font-size:11px"><span style="flex:1;height:1px;background:var(--border)"></span>NEW TO PORTAL<span style="flex:1;height:1px;background:var(--border)"></span></div>
          <button type="button" (click)="goSignup()" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--accent);background:transparent;color:var(--accent);font-weight:700;cursor:pointer">Create a free account</button>
          <div class="demo">
            <div class="muted" style="font-size:12px;margin-bottom:8px">Demo accounts — password <code (click)="password = 'demo'">demo</code> (click to fill):</div>
            <div class="row" *ngFor="let d of demo"><span class="muted">{{ d.name }}<span *ngIf="d.role === 'admin'" class="tag" style="margin-left:6px;background:#eceef3;color:#4b4f57">Portal admin</span><span *ngIf="d.status && d.status !== 'active'" class="sub-badge" [ngClass]="d.status" style="margin-left:6px">{{ d.status }}</span></span><code (click)="fill(d.email)">{{ d.email }}</code></div>
          </div>
        </div>
      </main>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private vs = inject(VendorAdminService);
  email = "";
  password = "";
  error = "";
  notice = "";
  logoFailed = false;
  demo = this.buildDemo();
  private buildDemo(): { name: string; email: string; role: string; status: string }[] {
    const out: { name: string; email: string; role: string; status: string }[] = [];
    for (const u of this.auth.demoUsers) if (u.role === "admin") out.push({ name: u.name, email: u.email, role: u.role, status: "" });
    for (const id of ["origin", "sonos", "klipsch", "luma"]) {
      const u = this.auth.demoUsers.find((x) => x.vendorId === id);
      if (u) out.push({ name: u.name, email: u.email, role: u.role, status: this.vs.statusOf(u.email) });
    }
    return out;
  }

  private validEmail(): boolean { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.email.trim()); }
  fill(email: string): void { this.email = email; this.password = "demo"; this.error = ""; this.notice = ""; }
  goSignup(): void { this.router.navigateByUrl("/signup"); }
  async submit(): Promise<void> {
    const s = await this.auth.login(this.email, this.password);
    if (!s) { this.error = "Invalid email or password."; this.notice = ""; return; }
    const next = this.route.snapshot.queryParamMap.get("next");
    this.router.navigateByUrl(next || "/"); // everyone lands on Home (the hub); they pick a dashboard from there
  }
  forgot(): void {
    if (!this.validEmail()) { this.error = "Enter a valid email address first."; this.notice = ""; return; }
    this.error = ""; this.notice = "Password reset link sent to " + this.email.trim() + ".";
  }
  emailCode(): void {
    if (!this.validEmail()) { this.error = "Enter a valid email to receive a login code."; this.notice = ""; return; }
    this.error = ""; this.notice = "A 6-digit login code was emailed to " + this.email.trim() + ".";
  }
}
