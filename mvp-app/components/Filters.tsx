"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, REGIONS } from "@/lib/data/seed";

const DEFAULT_START = "2025-07";
const DEFAULT_END = "2026-06";

export default function Filters({ vendors }: { vendors?: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const start = (params.get("start") || "").slice(0, 7) || DEFAULT_START;
  const end = (params.get("end") || "").slice(0, 7) || DEFAULT_END;
  const regions = (params.get("regions") || "").split(",").filter(Boolean);
  const categories = (params.get("categories") || "").split(",").filter(Boolean);
  const agg = params.get("agg") === "quarterly" ? "quarterly" : "monthly";
  const vendor = params.get("vendor") || vendors?.[0]?.id || "";

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`${pathname}?${sp.toString()}`);
  }

  function toggleIn(key: "regions" | "categories", value: string, current: string[]) {
    const set = new Set(current);
    set.has(value) ? set.delete(value) : set.add(value);
    update({ [key]: [...set].join(",") });
  }

  return (
    <div className="filterbar">
      {vendors && vendors.length > 0 && (
        <div className="filter">
          <label>Brand (admin)</label>
          <select className="control" value={vendor} onChange={(e) => update({ vendor: e.target.value })}>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="filter">
        <label>From</label>
        <input
          className="control"
          type="month"
          value={start}
          min="2024-07"
          max={end}
          onChange={(e) => update({ start: `${e.target.value}-01` })}
        />
      </div>
      <div className="filter">
        <label>To</label>
        <input
          className="control"
          type="month"
          value={end}
          min={start}
          max="2026-06"
          onChange={(e) => update({ end: `${e.target.value}-28` })}
        />
      </div>

      <div className="filter">
        <label>Aggregation</label>
        <div className="toggle-group">
          <button className={agg === "monthly" ? "on" : ""} onClick={() => update({ agg: "monthly" })}>
            Monthly
          </button>
          <button className={agg === "quarterly" ? "on" : ""} onClick={() => update({ agg: "quarterly" })}>
            Quarterly
          </button>
        </div>
      </div>

      <div className="filter" style={{ minWidth: 220 }}>
        <label>Regions</label>
        <div className="chips">
          {REGIONS.map((r) => (
            <span key={r} className={`chip ${regions.includes(r) ? "on" : ""}`} onClick={() => toggleIn("regions", r, regions)}>
              {r}
            </span>
          ))}
        </div>
      </div>

      <div className="filter" style={{ minWidth: 260 }}>
        <label>Categories</label>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <span
              key={c}
              className={`chip ${categories.includes(c) ? "on" : ""}`}
              onClick={() => toggleIn("categories", c, categories)}
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="filter-spacer" />
      <button
        className="btn"
        onClick={() => router.push(pathname + (vendor && vendors ? `?vendor=${vendor}` : ""))}
        title="Reset filters"
      >
        Reset
      </button>
    </div>
  );
}
