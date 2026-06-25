import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { AuthService } from "../core/auth.service";
import { VendorAdminService, VUser, Company } from "../core/vendor-admin.service";
import { API_BASE_URL } from "../core/app-config";

interface ConnectedApp { tokenId: string; name: string; createdAt: number; lastAt: number; revoking?: boolean; }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head"><h1>My profile</h1><p>Manage your sign-in details{{ company ? " and invite teammates to " + company : "" }}.</p></div>

    <div class="grid c2" style="align-items:start">
      <div class="pcard"><div class="hd"><div class="t">Account</div><div class="s">{{ session.name }} · {{ company || (isAdmin ? "Portal admin" : "—") }}</div></div>
        <div class="bd">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Email address</div>
          <div style="display:flex;gap:8px;margin-bottom:4px">
            <input class="minput" style="flex:1" type="email" [(ngModel)]="emailEdit" />
            <button class="pbtn primary" (click)="saveEmail()">Save</button>
          </div>
          <div *ngIf="emailErr" style="color:var(--negative);font-size:11px">{{ emailErr }}</div>
          <div *ngIf="emailMsg" style="color:var(--positive);font-size:11px">{{ emailMsg }}</div>

          <div style="border-top:1px solid var(--border);margin:16px 0"></div>

          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Change password</div>
          <input class="minput" style="width:100%;margin-bottom:6px" type="password" placeholder="New password" [(ngModel)]="newPw" />
          <input class="minput" style="width:100%;margin-bottom:6px" type="password" placeholder="Confirm new password" [(ngModel)]="confirmPw" />
          <div style="display:flex;align-items:center;gap:10px">
            <button class="pbtn" (click)="changePw()">Update password</button>
            <span *ngIf="pwErr" style="color:var(--negative);font-size:11px">{{ pwErr }}</span>
            <span *ngIf="pwMsg" style="color:var(--positive);font-size:11px">{{ pwMsg }}</span>
          </div>
        </div>
      </div>

      <div class="pcard" *ngIf="company"><div class="hd"><div class="t">Invite a teammate</div><div class="s">New users inherit {{ company }}'s default access — no extra setup</div></div>
        <div class="bd">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <input class="minput" style="flex:1;min-width:120px" placeholder="First name" [(ngModel)]="inv.firstName" />
            <input class="minput" style="flex:1;min-width:120px" placeholder="Last name" [(ngModel)]="inv.lastName" />
          </div>
          <input class="minput" style="width:100%;margin-bottom:8px" type="email" placeholder="Work email" [(ngModel)]="inv.email" />
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Inherited brands</div>
          <div class="chips" style="margin-bottom:10px"><span class="chip on" *ngFor="let b of comp?.brands">{{ b }}</span></div>
          <div style="display:flex;align-items:center;gap:10px">
            <button class="pbtn primary" (click)="invite()" [disabled]="!validInvite">Send invite</button>
            <span *ngIf="inviteErr" style="color:var(--negative);font-size:11px">{{ inviteErr }}</span>
            <span *ngIf="inviteMsg" style="color:var(--positive);font-size:11px">{{ inviteMsg }}</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:10px">They receive a confirmation email to verify and set a password (account-setup flow flagged for the dev team).</div>
        </div>
      </div>
    </div>

    <div class="pcard" style="margin-top:16px">
      <div class="hd"><div class="t">AI assistant access</div><div class="s">Let an AI assistant (like Claude) query Portal Market Insights on your behalf</div></div>
      <div class="bd">
        <div *ngIf="loadingApps" style="font-size:12px;color:var(--text-muted)">Loading…</div>
        <div *ngIf="!loadingApps && !mcpEnabled" style="font-size:13px;color:var(--text-muted)">AI assistant access isn't enabled for your account. Contact your Portal administrator to turn it on.</div>
        <ng-container *ngIf="!loadingApps && mcpEnabled">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Connection URL — add this as a connector in your AI assistant</div>
          <div style="display:flex;gap:8px;margin-bottom:6px">
            <input #urlInput class="minput" style="flex:1;font-family:monospace;font-size:12px" [value]="mcpUrl" readonly />
            <button class="pbtn" (click)="copyUrl(urlInput)">{{ copied ? "Copied" : "Copy" }}</button>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:16px">You'll be asked to sign in and approve access. The assistant can read Market Insights data but never individual dealer identities, and it can't change anything. Revoke access here any time.</div>

          <div style="border-top:1px solid var(--border);margin:16px 0"></div>

          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Connected assistants</div>
          <div *ngIf="!apps.length" style="font-size:12px;color:var(--text-muted)">No assistants connected yet.</div>
          <div *ngFor="let a of apps" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-weight:600;font-size:13px">{{ a.name }}</div>
              <div style="font-size:11px;color:var(--text-muted)">Connected {{ fmt(a.createdAt) }}<span *ngIf="a.lastAt"> · last used {{ fmt(a.lastAt) }}</span></div>
            </div>
            <button class="pbtn" (click)="revoke(a)" [disabled]="a.revoking">{{ a.revoking ? "Revoking…" : "Revoke" }}</button>
          </div>
        </ng-container>
      </div>
    </div>
  `,
})
export class ProfileComponent implements OnInit {
  private auth = inject(AuthService);
  private vs = inject(VendorAdminService);
  private http = inject(HttpClient);

  session = this.auth.session()!;
  isAdmin = this.session.role === "admin";
  me: VUser | undefined = this.vs.getUser(this.session.email);
  company = this.me?.companyName || "";
  comp: Company | undefined = this.company ? this.vs.getCompany(this.company) : undefined;

  emailEdit = this.session.email;
  emailErr = ""; emailMsg = "";
  newPw = ""; confirmPw = ""; pwErr = ""; pwMsg = "";
  inv = { firstName: "", lastName: "", email: "" };
  inviteErr = ""; inviteMsg = "";

  mcpUrl = API_BASE_URL + "/api/mcp";
  apps: ConnectedApp[] = [];
  loadingApps = true;
  copied = false;
  mcpEnabled = false;   // does this account have AI-assistant access? (set OFF by default, toggled by an admin)

  get validInvite(): boolean { return EMAIL_RE.test(this.inv.email.trim()); }

  async ngOnInit(): Promise<void> { await this.loadApps(); }

  /** Load the caller's connected AI assistants (active refresh tokens) from the OAuth store. */
  async loadApps(): Promise<void> {
    const t = this.auth.token();
    if (!t) { this.loadingApps = false; return; }
    this.loadingApps = true;
    try {
      const r = await firstValueFrom(this.http.get<{ mcpUrl?: string; mcpEnabled?: boolean; apps?: ConnectedApp[] }>(
        API_BASE_URL + "/api/oauth?action=connections", { headers: { Authorization: "Bearer " + t } }));
      if (r?.mcpUrl) this.mcpUrl = r.mcpUrl;
      this.mcpEnabled = !!r?.mcpEnabled;
      this.apps = (r?.apps || []).map((a) => ({ ...a }));
    } catch { /* leave list empty on error */ }
    this.loadingApps = false;
  }

  copyUrl(input: HTMLInputElement): void {
    try { void navigator.clipboard.writeText(this.mcpUrl); }
    catch { input.select(); try { document.execCommand("copy"); } catch { /* ignore */ } }
    this.copied = true;
    setTimeout(() => (this.copied = false), 1500);
  }

  async revoke(a: ConnectedApp): Promise<void> {
    const t = this.auth.token();
    if (!t) return;
    a.revoking = true;
    try {
      await firstValueFrom(this.http.post(API_BASE_URL + "/api/oauth?action=revoke-app",
        { tokenId: a.tokenId }, { headers: { Authorization: "Bearer " + t } }));
      this.apps = this.apps.filter((x) => x.tokenId !== a.tokenId);
    } catch { a.revoking = false; }
  }

  fmt(ms: number): string {
    if (!ms) return "—";
    return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  saveEmail(): void {
    this.emailMsg = ""; this.emailErr = "";
    const email = this.emailEdit.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { this.emailErr = "Enter a valid email address."; return; }
    if (email !== this.session.email.toLowerCase() && this.vs.getUser(email)) { this.emailErr = "That email is already in use."; return; }
    if (this.me) { this.vs.updateUser(this.session.email, { email }); this.me = this.vs.getUser(email); }
    const next = this.auth.updateSession({ email });
    if (next) this.session = next;
    this.emailEdit = email;
    this.emailMsg = "Email updated.";
  }
  changePw(): void {
    this.pwMsg = ""; this.pwErr = "";
    if (this.newPw.length < 6) { this.pwErr = "Use at least 6 characters."; return; }
    if (this.newPw !== this.confirmPw) { this.pwErr = "Passwords don't match."; return; }
    this.newPw = ""; this.confirmPw = "";
    this.pwMsg = "Password updated (demo).";
  }
  invite(): void {
    this.inviteErr = ""; this.inviteMsg = "";
    const email = this.inv.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { this.inviteErr = "Enter a valid email address."; return; }
    if (this.vs.getUser(email)) { this.inviteErr = "A user with that email already exists."; return; }
    const c = this.comp;
    if (!c) { this.inviteErr = "Company not found."; return; }
    this.vs.addUser({ firstName: this.inv.firstName, lastName: this.inv.lastName, email, companyName: this.company, brands: [...c.brands], perms: { ...c.perms } });
    this.inviteMsg = "Invited " + email + " to " + this.company + ".";
    this.inv = { firstName: "", lastName: "", email: "" };
  }
}
