import type { ReactNode } from "react";

import type { RouteId } from "../App";
import type { NavItem } from "../state/appState";

type LayoutProps = {
  activeRoute: RouteId;
  navItems: NavItem[];
  children: ReactNode;
  onNavigate: (route: RouteId) => void;
};

export function Layout({ activeRoute, navItems, children, onNavigate }: LayoutProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark">UbU</span>
          <span className="brand-subtitle">Phase 1 Desktop</span>
        </div>
        <nav aria-label="Main navigation" className="nav-list">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeRoute ? "nav-item active" : "nav-item"}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="content-shell">{children}</main>
    </div>
  );
}
