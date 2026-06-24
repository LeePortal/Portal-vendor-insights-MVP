import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { AuthService } from "../core/auth.service";

/**
 * Public self-serve signup. Anyone with the Portal web address can create a free account here. On
 * success the account is created server-side (flagged free-signup) and the user is signed in and
 * dropped on the Home hub (which renders the teaser view for free accounts).
 *
 * Email verification is a placeholder for now — the real "verify your email before access" step is
 * wired by devs later; this screen notes it but proceeds straight through for the MVP.
 */
@Component({
  selector: "app-signup",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="login-wrap">
      <aside class="login-aside">
        <div>
          <img *ngIf="!logoFailed" src="https://portal.io/assets/images/logo-index.png" (error)="logoFailed = true" alt="Portal" style="max-width:120px;margin-bottom:22px" />
          <div *ngIf="logoFailed" style="font-weight:800;font-size:22px;margin-bottom:22px">Portal<span style="color:var(--accent)">.</span></div>
          <div class="lead">Vendor Services</div>
          <div class="sub">See how products are selling across the Portal network. Create a free account to explore.</div>
        </div>
        <div class="sub" style="opacity:.7">MVP prototype · sample data</div>
      </aside>
      <main class="login-main">
        <div class="login-card">
          <h2>Create your account</h2>
          <p class="muted" style="margin:6px 0 22px">Free to explore the Portal network. No subscription required.</p>
          <form (ngSubmit)="submit()">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="field"><label for="first">First name</label><input id="first" name="first" [(ngModel)]="firstName" autocomplete="given-name" required /></div>
              <div class="field"><label for="last">Last name</label><input id="last" name="last" [(ngModel)]="lastName" autocomplete="family-name" required /></div>
            </div>
            <div class="field"><label for="company">Company</label><input id="company" name="company" [(ngModel)]="company" autocomplete="organization" required /></div>
            <div class="field"><label for="email">Work email</label><input id="email" name="email" type="email" [(ngModel)]="email" placeholder="you@company.com" autocomplete="email" required /></div>
            <div class="err" *ngIf="error">{{ error }}</div>
            <button class="pbtn primary" type="submit" [disabled]="busy" style="width:100%;justify-content:center;padding:11px">{{ busy ? "Creating account…" : "Create free account" }}</button>
          </form>
          <p class="muted" style="font-size:12px;margin-top:12px"><span style="color:var(--accent)">&#9993;</span> We'll email you a verification link to confirm your address. <span style="opacity:.7">(Verification is added by the team later — for now you'll go straight in.)</span></p>
          <div style="margin-top:14px;font-size:12.5px">Already have an account? <a routerLink="/login" style="color:var(--accent);cursor:pointer">Sign in</a></div>
        </div>
      </main>
    </div>
  `,
})
export class SignupComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  firstName = "";
  lastName = "";
  company = "";
  email = "";
  error = "";
  busy = false;
  logoFailed = false;

  private validEmail(): boolean { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.email.trim()); }

  async submit(): Promise<void> {
    this.error = "";
    if (!this.firstName.trim() || !this.lastName.trim()) { this.error = "Enter your first and last name."; return; }
    if (!this.company.trim()) { this.error = "Enter your company."; return; }
    if (!this.validEmail()) { this.error = "Enter a valid email address."; return; }
    this.busy = true;
    const r = await this.auth.signup({ firstName: this.firstName, lastName: this.lastName, company: this.company, email: this.email });
    this.busy = false;
    if (r.ok) { this.router.navigateByUrl("/"); return; }
    this.error = r.error;
  }
}
