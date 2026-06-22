import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

/**
 * Reusable checkbox dropdown. Empty selection == "all" by convention
 * (the data layer treats an empty filter array as no restriction).
 */
@Component({
  selector: "app-multiselect",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ms">
      <label *ngIf="label">{{ label }}</label>
      <button type="button" class="ms-btn" [disabled]="disabled" [style.opacity]="disabled ? 0.55 : 1" [style.cursor]="disabled ? 'not-allowed' : 'pointer'" [title]="disabled ? 'Mapping to Redshift pending — dev team to wire dealer → buying-group' : ''" (click)="open = !open">
        <span class="ms-sum">{{ summary }}</span><span class="ms-caret">▾</span>
      </button>
      <div *ngIf="open" class="ms-back" (click)="open = false"></div>
      <div *ngIf="open" class="ms-panel">
        <input *ngIf="search" class="ms-search" placeholder="Search…" [(ngModel)]="q" (click)="$event.stopPropagation()" />
        <div class="ms-actions"><a (click)="selectAll()">Select all</a><a (click)="clear()">Clear</a></div>
        <div class="ms-list">
          <label class="ms-row" *ngFor="let o of filtered">
            <input type="checkbox" [checked]="isOn(o)" (change)="toggle(o)" />
            <span class="ms-name">{{ labels[o] || o }}</span>
            <a class="ms-only" (click)="only(o); $event.preventDefault(); $event.stopPropagation()">only</a>
          </label>
          <div *ngIf="!filtered.length" class="muted" style="padding:8px 6px">No matches.</div>
        </div>
      </div>
    </div>
  `,
})
export class MultiSelectComponent {
  @Input() label = "";
  @Input() options: string[] = [];
  @Input() selected: string[] = [];
  @Input() allLabel = "All";
  @Input() search = true;
  @Input() sort = true; // when false, preserve the caller's option order (e.g. pipeline-ordered statuses)
  @Input() disabled = false; // greyed-out placeholder (e.g. a filter whose data isn't mapped yet)
  @Input() labels: Record<string, string> = {}; // optional value -> display label (value still emitted raw)
  @Output() selectedChange = new EventEmitter<string[]>();
  open = false;
  q = "";

  private lbl(o: string): string { return this.labels[o] || o; }
  get filtered(): string[] { const t = this.q.toLowerCase().trim(); const base = t ? this.options.filter((o) => this.lbl(o).toLowerCase().includes(t)) : this.options; return this.sort ? [...base].sort((a, b) => this.lbl(a).localeCompare(this.lbl(b))) : [...base]; }
  get summary(): string {
    if (!this.selected.length) return this.allLabel;
    if (this.selected.length <= 2) return this.selected.map((s) => this.lbl(s)).join(", ");
    return this.selected.length + " selected";
  }
  isOn(o: string): boolean { return this.selected.includes(o); }
  private emit(arr: string[]): void { this.selectedChange.emit(arr); }
  toggle(o: string): void { const arr = [...this.selected]; const i = arr.indexOf(o); i >= 0 ? arr.splice(i, 1) : arr.push(o); this.emit(arr); }
  only(o: string): void { this.emit([o]); }
  selectAll(): void { this.emit([...this.options]); }
  clear(): void { this.emit([]); }
}
