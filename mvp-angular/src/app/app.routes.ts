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
      { path: "profile", loadComponent: () => import("./pages/profile.component").then((m) => m.ProfileComponent) },
      { path: "premium", data: { title: "Premium Placement", subtitle: "Advertiser performance and premium placement ROI. Coming soon.", group: "Premium Placement" }, loadComponent: () => import("./pages/placeholder.component").then((m) => m.PlaceholderComponent) },
      { path: "reports/:id", canActivate: [adminGuard], loadComponent: () => import("./pages/report-view.component").then((m) => m.ReportViewComponent) },
    ],
  },
  { path: "**", redirectTo: "" },
];
