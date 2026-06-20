import { DEMO_USERS } from "@/lib/auth";
import LoginForm from "./login-form";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = searchParams?.next || "/";

  const demo = [
    ...DEMO_USERS.filter((u) => u.role === "admin").map((u) => ({
      email: u.email,
      label: u.name,
      kind: "admin" as const,
    })),
    ...DEMO_USERS.filter((u) => u.role === "vendor")
      .slice(0, 3)
      .map((u) => ({ email: u.email, label: u.name, kind: "vendor" as const })),
  ];

  return (
    <div className="login-wrap">
      <aside className="login-aside">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="brand-logo-lg">P</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Portal · Vendor Insights</div>
        </div>
        <div>
          <div className="lead">The performance data behind every Portal proposal — for your brand.</div>
          <div className="sub">
            Secure, self-serve dashboards showing how your products sell across thousands of professional AV, security
            and IT integrators.
          </div>
          <div className="stat">Trusted by 2,500+ installation pros · $1B+ in jobs won every year</div>
        </div>
        <div className="stat" style={{ opacity: 0.7 }}>
          MVP prototype · sample data · gated access simulation
        </div>
      </aside>
      <main className="login-main">
        <LoginForm demo={demo} next={next} />
      </main>
    </div>
  );
}
