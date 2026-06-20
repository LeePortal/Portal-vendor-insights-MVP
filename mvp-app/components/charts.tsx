"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCompact, fmtCurrency, fmtNumber } from "@/lib/format";

/* Portal brand palette (from the live app: orange primary, teal, green). */
const ORANGE = "#FF5000";
const PALETTE = ["#FF5000", "#00A2C1", "#42AD65", "#8C33E7", "#F38800", "#22C1B0", "#8E9197"];
const AXIS = { fontSize: 11, fill: "#AEB0B5" } as const;
const GRID = { stroke: "#E8E9ED", vertical: false } as const;
const TIP_STYLE = { borderRadius: 6, border: "1px solid #E8E9ED", fontSize: 12, boxShadow: "0 4px 14px rgba(0,0,0,0.1)" };

export function RevenueTrendChart({ data }: { data: { label: string; revenue: number; units: number }[] }) {
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ORANGE} stopOpacity={0.26} />
              <stop offset="100%" stopColor={ORANGE} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v) => fmtCompact(Number(v))} tick={AXIS} tickLine={false} axisLine={false} width={52} />
          <Tooltip
            cursor={{ fill: "rgba(255,80,0,0.06)" }}
            contentStyle={TIP_STYLE}
            formatter={(value: any, name: any) => [name === "Revenue" ? fmtCurrency(Number(value)) : fmtNumber(Number(value)), name]}
          />
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke={ORANGE} strokeWidth={2} fill="url(#revFill)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryBarChart({ data }: { data: { category: string; revenue: number }[] }) {
  return (
    <div style={{ width: "100%", height: Math.max(180, data.length * 38) }}>
      <ResponsiveContainer>
        <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#E8E9ED" horizontal={false} />
          <XAxis type="number" tickFormatter={(v) => fmtCompact(Number(v))} tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="category" tick={{ fontSize: 11.5, fill: "#8E9197" }} tickLine={false} axisLine={false} width={130} />
          <Tooltip cursor={{ fill: "rgba(255,80,0,0.06)" }} contentStyle={TIP_STYLE} formatter={(v: any) => [fmtCurrency(Number(v)), "Revenue"]} />
          <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]} barSize={18}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RegionBarChart({ data }: { data: { region: string; revenue: number }[] }) {
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="region" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v) => fmtCompact(Number(v))} tick={AXIS} tickLine={false} axisLine={false} width={52} />
          <Tooltip cursor={{ fill: "rgba(255,80,0,0.06)" }} contentStyle={TIP_STYLE} formatter={(v: any) => [fmtCurrency(Number(v)), "Revenue"]} />
          <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]} barSize={40}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ShareIndexChart({ data }: { data: { label: string; index: number; brandRevenue: number; categoryAvg: number }[] }) {
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={[0, "auto"]} />
          <Tooltip contentStyle={TIP_STYLE} formatter={(value: any, name: any) => [name === "Index vs category" ? `${Number(value)} (100 = parity)` : fmtCurrency(Number(value)), name]} />
          <ReferenceLine y={100} stroke="#AEB0B5" strokeDasharray="4 4" label={{ value: "Category avg", position: "right", fontSize: 10, fill: "#8E9197" }} />
          <Line type="monotone" dataKey="index" name="Index vs category" stroke={ORANGE} strokeWidth={2.5} dot={{ r: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AdminActivityChart({ data }: { data: { date: string; logins: number; minutes: number }[] }) {
  const short = data.map((d) => ({ ...d, label: d.date.slice(5) }));
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <ComposedChart data={short} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#AEB0B5" }} tickLine={false} axisLine={false} interval={Math.floor(short.length / 10)} />
          <YAxis yAxisId="l" tick={AXIS} tickLine={false} axisLine={false} width={32} />
          <YAxis yAxisId="r" orientation="right" tick={AXIS} tickLine={false} axisLine={false} width={40} />
          <Tooltip contentStyle={TIP_STYLE} />
          <Bar yAxisId="l" dataKey="logins" name="Logins" fill={ORANGE} radius={[3, 3, 0, 0]} barSize={10} />
          <Line yAxisId="r" type="monotone" dataKey="minutes" name="Minutes on site" stroke="#00A2C1" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopDashboardsBar({ data }: { data: { name: string; views: number }[] }) {
  return (
    <div style={{ width: "100%", height: Math.max(160, data.length * 42) }}>
      <ResponsiveContainer>
        <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#E8E9ED" horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11.5, fill: "#8E9197" }} tickLine={false} axisLine={false} width={170} />
          <Tooltip cursor={{ fill: "rgba(255,80,0,0.06)" }} contentStyle={TIP_STYLE} formatter={(v: any) => [fmtNumber(Number(v)), "Views"]} />
          <Bar dataKey="views" name="Views" radius={[0, 4, 4, 0]} barSize={18}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
