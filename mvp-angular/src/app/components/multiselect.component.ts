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
      <button type="button" class="ms-btn" (click)="open = !open">
        <span class="ms-sum">{{ summary }}</span><span class="ms-caret">▾</span>
      </button>
      <div *ngIf="open" class="ms-back" (click)="open = false"></div>
      <div *ngIf="open" class="ms-panel">
        <input *ngIf="search" class="ms-search" placeholder="Search…" [(ngModel)]="q" (click)="$event.stopPropagation()" />
        <div class="ms-actions"><a (click)="selectAll()">Select all</a><a (click)="clear()">Clear</a></div>
        <div class="ms-list">
          <label class="ms-row" *ngFor="let o of filtered">
            <input type="checkbox" [checked]="isOn(o)" (change)="toggle(o)" />
            <span class="ms-name">{{ o }}</span>
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
  @Output() selectedChange = new EventEmitter<string[]>();
  open = false;
  q = "";

  get filtered(): string[] { const t = this.q.toLowerCase().trim(); const base = t ? this.options.filter((o) => o.toLowerCase().includes(t)) : this.options; return [...base].sort((a, b) => a.localeCompare(b)); }
  get summary(): string {
    if (!this.selected.length) return this.allLabel;
    if (this.selected.length <= 2) return this.selected.join(", ");
    return this.selected.length + " selected";
  }
  isOn(o: string): boolean { return this.selected.includes(o); }
  private emit(arr: string[]): void { this.selectedChange.emit(arr); }
  toggle(o: string): void { const arr = [...this.selected]; const i = arr.indexOf(o); i >= 0 ? arr.splice(i, 1) : arr.push(o); this.emit(arr); }
  only(o: string): void { this.emit([o]); }
  selectAll(): void { this.emit([...this.options]); }
  clear(): void { this.emit([]); }
}
