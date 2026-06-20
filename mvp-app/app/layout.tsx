import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Portal Vendor Insights",
  description:
    "Vendor reporting platform for Portal.io - a Periscope replacement prototype with gated, tenant-scoped dashboards and Portal admin activity tracking.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300;0,400;0,600;0,700;0,800;1,400&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
