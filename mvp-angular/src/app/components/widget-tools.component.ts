import { Component, EventEmitter, Input, Output, inject, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";

/**
 * Per-widget toolbar (download + expand) shown on each analytical widget on the vendor dashboard.
 *  - Download ▸ PNG: a literal snapshot of the widget exactly as rendered (html2canvas, lazy-loaded).
 *  - Download ▸ Data (CSV): handled by the parent via (csvOut) — same CSV style as the main export.
 *  - Expand: pops the enclosing card into a large centered overlay; click the backdrop (or ✕) to restore.
 * Self-contained: it locates its own enclosing `.pcard` via the DOM, so one tag per widget is enough.
 */
@Component({
  selector: "app-widget-tools",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wtools" (click)="$event.stopPropagation()">
      <div class="wt-wrap">
        <button class="wt-btn" title="Download" type="button" (click)="menu = !menu">⤓</button>
        <div class="wt-menu" *ngIf="menu">
          <button type="button" (click)="downloadPng()">Download PNG</button>
          <button type="button" (click)="csvOut.emit(); menu = false">Download data (CSV)</button>
        </div>
      </div>
      <button class="wt-btn" [title]="expanded ? 'Close' : 'Expand'" type="button" (click)="toggleExpand()">{{ expanded ? "✕" : "⤢" }}</button>
    </div>
  `,
  styles: [`
    .wtools { position: absolute; top: 10px; right: 12px; z-index: 4; display: flex; gap: 4px; opacity: .5; transition: opacity .15s; }
    :host-context(.pcard:hover) .wtools, :host-context(.widget-expanded) .wtools { opacity: 1; }
    .wt-wrap { position: relative; }
    .wt-btn { border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); border-radius: 6px; width: 26px; height: 26px; font-size: 13px; line-height: 1; cursor: pointer; }
    .wt-btn:hover { color: var(--text); border-color: var(--text-muted); }
    .wt-menu { position: absolute; top: 30px; right: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.14); padding: 4px; min-width: 156px; z-index: 5; }
    .wt-menu button { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 7px 10px; font-size: 12px; border-radius: 6px; color: var(--text); cursor: pointer; }
    .wt-menu button:hover { background: var(--surface-2); }
  `],
})
export class WidgetToolsComponent {
  @Input() filename = "widget";
  @Output() csvOut = new EventEmitter<void>();
  menu = false;
  expanded = false;
  private host = inject(ElementRef);
  private backdrop: HTMLElement | null = null;

  private card(): HTMLElement | null { return (this.host.nativeElement as HTMLElement).closest(".pcard"); }

  /** Snapshot the rendered widget as a PNG (html2canvas is lazy-loaded so it never bloats the main bundle). */
  async downloadPng(): Promise<void> {
    this.menu = false;
    const card = this.card();
    if (!card) return;
    const mod: any = await import("html2canvas");
    const h2c = mod.default || mod;
    const bg = getComputedStyle(document.body).getPropertyValue("--surface").trim() || "#ffffff";
    const canvas = await h2c(card, {
      backgroundColor: bg,
      scale: 1,            // screen-resolution snapshot; scale:2 quadrupled the pixel work
      imageTimeout: 1200,  // html2canvas waits up to 15s by default for images/fonts — that was the freeze
      useCORS: true,
      logging: false,
      ignoreElements: (el: Element) => !!(el.classList && el.classList.contains("wtools")) || el.tagName === "APP-WIDGET-TOOLS",
    });
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = this.filename + ".png";
    a.click();
  }

  toggleExpand(): void {
    const card = this.card();
    if (!card) return;
    if (this.expanded) return this.collapse();
    const back = document.createElement("div");
    back.className = "widget-backdrop";
    back.addEventListener("click", () => this.collapse());
    document.body.appendChild(back);
    this.backdrop = back;
    card.classList.add("widget-expanded");
    this.expanded = true;
  }

  private collapse(): void {
    const card = this.card();
    if (card) card.classList.remove("widget-expanded");
    if (this.backdrop) { this.backdrop.remove(); this.backdrop = null; }
    this.expanded = false;
  }
}
