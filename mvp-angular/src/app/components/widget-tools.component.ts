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
    // html-to-image renders the node via the browser's native foreignObject path in one pass, instead of
    // re-parsing every document stylesheet in JS the way html2canvas does (that reparse was the ~20s hang).
    const mod: any = await import("html-to-image");
    const bg = getComputedStyle(document.body).getPropertyValue("--surface").trim() || "#ffffff";
    const dataUrl: string = await mod.toPng(card, {
      backgroundColor: bg,
      pixelRatio: 1,       // screen-resolution snapshot
      skipFonts: true,     // don't fetch/embed @font-face (another big slowdown); uses already-loaded fonts
      filter: (n: any) => !(n && n.classList && n.classList.contains && n.classList.contains("wtools")) && !(n && n.tagName === "APP-WIDGET-TOOLS"),
    });
    const a = document.createElement("a");
    a.href = dataUrl;
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
