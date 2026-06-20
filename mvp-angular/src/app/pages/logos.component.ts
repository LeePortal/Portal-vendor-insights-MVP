import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { DataService } from "../core/data.service";
import { VendorAdminService } from "../core/vendor-admin.service";

@Component({
  selector: "app-logos",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:center">
      <div><h1>Brand logos</h1><p>Logos are stitched into each brand's dashboards and PDF reports. Only brands with an active subscription appear here.</p></div>
      <span class="badge-sample">SAMPLE DATA</span>
    </div>

    <div class="pcard" *ngIf="brands.length">
      <div class="bd">
        <div class="grid c4">
          <div *ngFor="let b of brands" style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;align-items:center;gap:8px">
            <div class="logo-preview"><img *ngIf="logo(b.id) as l" [src]="l" [alt]="b.name" /><span *ngIf="!logo(b.id)">{{ b.name.charAt(0) }}</span></div>
            <div style="font-weight:600;font-size:13px;text-align:center">{{ b.name }}</div>
            <label class="pbtn" style="cursor:pointer;font-size:12px">{{ logo(b.id) ? "Replace" : "Upload" }}<input type="file" accept="image/*" (change)="onLogo(b.id, $event)" hidden /></label>
            <button *ngIf="logo(b.id)" class="pbtn" style="font-size:11px;padding:4px 8px" (click)="clear(b.id)">Remove</button>
          </div>
        </div>
      </div>
    </div>
    <div class="pcard" *ngIf="!brands.length"><div class="bd muted">No brands with an active subscription yet. Logos appear here once a brand is active.</div></div>
  `,
})
export class LogosComponent {
  private data = inject(DataService);
  private va = inject(VendorAdminService);
  get brands() { return this.va.activeBrandIds().map((id) => this.data.getVendor(id)).filter(Boolean) as { id: string; name: string }[]; }
  logo(id: string): string | undefined { return this.va.getLogo(id); }
  clear(id: string): void { this.va.clearLogo(id); }
  onLogo(brandId: string, ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.va.setLogo(brandId, reader.result as string);
    reader.readAsDataURL(file);
  }
}
