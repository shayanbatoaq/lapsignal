"use client";

import {
  Activity,
  BarChart3,
  ChevronLeft,
  CircleGauge,
  Columns3,
  Radio,
  Settings,
  Sparkles,
  TimerReset
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";

const navigation = [
  { href: "/app", label: "Overview", icon: CircleGauge },
  { href: "/app/live", label: "Live session", icon: Radio },
  { href: "/app/sessions", label: "Sessions", icon: TimerReset },
  { href: "/app/compare", label: "Compare", icon: Columns3 },
  { href: "/app/coach", label: "Coach", icon: Sparkles },
  { href: "/app/progress", label: "Progress", icon: BarChart3 },
  { href: "/app/settings", label: "Settings", icon: Settings }
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const title = navigation.find((item) => pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href)))?.label ?? "Session detail";
  return (
    <div className={`app-shell ${collapsed ? "nav-collapsed" : ""}`}>
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="sidebar-head">
          <Logo compact={collapsed} href="/app" />
          <button className="icon-button collapse-button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
            <ChevronLeft size={16} className={collapsed ? "rotate" : ""} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {navigation.map((item) => {
            const active = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={active ? "nav-link active" : "nav-link"} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined}>
                <item.icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="collector-mini"><span className="status-dot idle" /> <span>Collector idle</span></div>
          <small>v0.1.0-alpha.1 · build 1</small>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="topbar">
          <div><p className="eyebrow">LapSignal workspace</p><h1>{title}</h1></div>
          <div className="topbar-status">
            <span className="status-chip"><Activity size={14} /> Demo data</span>
            <span className="status-chip muted"><span className="status-dot idle" /> Collector offline</span>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.slice(0, 5).map((item) => {
          const active = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-label={item.label} aria-current={active ? "page" : undefined}>
              <item.icon size={20} /><span>{item.label.replace(" session", "")}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
