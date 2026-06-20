"use client";

import { useState } from "react";

interface DemoAccount {
  email: string;
  label: string;
  kind: "admin" | "vendor";
}

export default function LoginForm({ demo, next }: { demo: DemoAccount[]; next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Sign-in failed.");
        setLoading(false);
        return;
      }
      window.location.href = next || "/";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  function fill(acc: DemoAccount) {
    setEmail(acc.email);
    setPassword("demo");
    setError("");
  }

  return (
    <div className="login-card">
      <div className="brand-logo-lg" style={{ marginBottom: 18 }}>P</div>
      <h2>Sign in to Vendor Insights</h2>
      <p className="note">Access your brand&apos;s performance on the Portal network.</p>

      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="email">Work email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@brand.com"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        {error && <div className="err">{error}</div>}
        <button className="btn dark" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", padding: "11px" }}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="demo-accounts">
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Demo accounts — password <code>demo</code> (click to fill):
        </div>
        {demo.map((d) => (
          <div className="row" key={d.email}>
            <span className="muted">
              {d.label} {d.kind === "admin" && <span className="badge gray">Portal admin</span>}
            </span>
            <code onClick={() => fill(d)}>{d.email}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
