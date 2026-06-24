import { Routes } from "@angular/router";
import { authGuard, adminGuard } from "./core/auth.guard";

export const routes: Routes = [
  { path: "login", loadComponent: () => import("./pages/login.component").then((m) => m.LoginComponent) },
  {
    path: "",
    canActivate: [authGuard],
    loadComponent: () => import("./app-shell.component").then((m) => m.AppShellComponent),
    children: [
      { path: "", loadComponent: () => import("./pages/home.component").then((m) => m.HomeComponent) },
      { path: "dashboards", loadComponent: () => import("./pages/dashboards.component").then((m) => m.DashboardsComponent) },
      { path: "dashboards/overview", loadComponent: () => import("./pages/dashboard.component").then((m) => m.DashboardComponent) },
      { path: "dashboards/builder", canActivate: [adminGuard], loadComponent: () => import("./pages/dashboard-builder.component").then((m) => m.DashboardBuilderComponent) },
      { path: "dashboards/custom/:id", canActivate: [adminGuard], loadComponent: () => import("./pages/custom-dashboard.component").then((m) => m.CustomDashboardComponent) },
      { path: "dashboards/:id", redirectTo: "dashboards/overview", pathMatch: "full" },
      { path: "admin", canActivate: [adminGuard], loadComponent: () => import("./pages/admin.component").then((m) => m.AdminComponent) },
      { path: "admin/vendors", canActivate: [adminGuard], loadComponent: () => import("./pages/vendor-admin.component").then((m) => m.VendorAdminComponent) },
      { path: "admin/vendors/company/:name", canActivate: [adminGuard], loadComponent: () => import("./pages/vendor-landing.component").then((m) => m.VendorLandingComponent) },
      { path: "admin/vendors/user/:email", canActivate: [adminGuard], loadComponent: () => import("./pages/user-detail.component").then((m) => m.UserDetailComponent) },
      { path: "admin/premium/campaign/:id", canActivate: [adminGuard], loadComponent: () => import("./pages/campaign-landing.component").then((m) => m.CampaignLandingComponent) },
      { path: "admin/premium/mapping", canActivate: [adminGuard], loadComponent: () => import("./pages/premium-mapping.component").then((m) => m.PremiumMappingComponent) },
      { path: "profile", loadComponent: () => import("./pages/profile.component").then((m) => m.ProfileComponent) },
      { path: "premium", data: { title: "Premium Placement", subtitle: "Your Spotlight advertising performance.", group: "Premium Placement" }, loadComponent: () => import("./pages/premium-overview.component").then((m) => m.PremiumOverviewComponent) },
      { path: "reports/:id", canActivate: [adminGuard], loadComponent: () => import("./pages/report-view.component").then((m) => m.ReportViewComponent) },
    ],
  },
  { path: "**", redirectTo: "" },
];
