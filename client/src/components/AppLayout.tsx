import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, House, LogOut, UserRound, Wallet, type LucideIcon } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { prefetchRealtimeToken } from "../lib/homeQueries";
import { useNotificationsRealtime } from "../lib/useGroupRealtime";
import { navLinkClass, ui } from "../lib/ui";
import { Avatar } from "./Avatar";
import { KabanLogo } from "./KabanLogo";

type NavItem = { to: string; label: string; shortLabel: string; icon: LucideIcon; badge?: number };

function UnreadBadge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-danger-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function AccountMenu({ name, onLogout }: { name: string | undefined; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Close whenever the route changes (e.g. after picking "Profile").
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-ink-100"
      >
        <Avatar name={name} />
        <span className="hidden max-w-[10rem] truncate text-sm font-bold text-ink-900 sm:inline">{name}</span>
        <ChevronDown className="h-4 w-4 text-ink-500" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="animate-pop absolute right-0 top-12 z-50 w-52 origin-top-right rounded-2xl border border-ink-200 bg-white p-1.5 shadow-lift"
        >
          <Link
            to="/profile"
            role="menuitem"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-100"
          >
            <UserRound className="h-4 w-4" aria-hidden />
            Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-danger-700 hover:bg-danger-50"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notificationsData } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.getNotifications(),
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (user) prefetchRealtimeToken();
  }, [user]);

  useNotificationsRealtime({
    userId: user?.id,
    enabled: !!user,
    onUpdate: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["home-overview"] });
    },
  });

  async function handleLogout() {
    await logout();
    queryClient.clear();
    navigate("/login", { replace: true });
  }

  const unreadCount = notificationsData?.unreadCount ?? 0;
  const navItems: NavItem[] = [
    { to: "/home", label: "Home", shortLabel: "Home", icon: House },
    { to: "/notifications", label: "Notifications", shortLabel: "Alerts", icon: Bell, badge: unreadCount },
    { to: "/manager/obligations", label: "Owed to you", shortLabel: "Owed", icon: Wallet },
    { to: "/profile", label: "Profile", shortLabel: "Profile", icon: UserRound },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-cream">
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-cream/90 backdrop-blur">
        <div className={`mx-auto flex h-16 w-full min-w-0 ${ui.page} items-center justify-between gap-4 px-4 sm:px-6`}>
          <KabanLogo to="/home" />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {navItems
              .filter((item) => item.to !== "/profile")
              .map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => navLinkClass(isActive)}>
                  <item.icon className="h-4 w-4" aria-hidden />
                  {item.label}
                  <UnreadBadge count={item.badge ?? 0} />
                </NavLink>
              ))}
          </nav>
          <AccountMenu name={user?.displayName} onLogout={() => void handleLogout()} />
        </div>
      </header>

      <main className={`mx-auto min-w-0 px-4 pb-28 pt-8 sm:px-6 md:pb-12 md:pt-10 ${ui.page}`}>
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-4">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `relative flex flex-col items-center gap-0.5 px-1 pb-2 pt-2 text-[11px] font-bold transition-colors ${
                    isActive ? "text-brand-700" : "text-ink-500 hover:text-ink-700"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex rounded-full px-4 py-1 ${isActive ? "bg-brand-100" : ""}`}>
                      <item.icon className="h-5 w-5" aria-hidden />
                    </span>
                    {item.shortLabel}
                    <UnreadBadge count={item.badge ?? 0} className="absolute left-1/2 top-1 ml-2" />
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
