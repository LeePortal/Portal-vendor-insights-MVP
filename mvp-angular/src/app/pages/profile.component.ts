import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AuthService } from "../core/auth.service";
import { VendorAdminService, VUser, Company } from "../core/vendor-admin.service";

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
  `,
})
export class ProfileComponent {
  private auth = inject(AuthService);
  private vs = inject(VendorAdminService);

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

  get validInvite(): boolean { return EMAIL_RE.test(this.inv.email.trim()); }

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
