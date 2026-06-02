import { useEffect } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { displayInitials } from "../lib/initials";
import { navLinkClass, ui } from "../lib/ui";

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notificationsData } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.getNotifications(),
    refetchInterval: 60_000,
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    void queryClient.prefetchQuery({
      queryKey: ["home-overview"],
      queryFn: () => api.getHomeOverview(),
    });
  }, [queryClient, user]);

  async function handleLogout() {
    await logout();
    queryClient.clear();
    navigate("/login", { replace: true });
  }

  const unreadCount = notificationsData?.unreadCount ?? 0;
  const initials = displayInitials(user?.displayName);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white">
        <div className={`mx-auto flex h-16 w-full min-w-0 ${ui.page} items-center justify-between gap-4 px-6`}>
          <Link
            to="/home"
            className="inline-flex shrink-0 items-center text-xl font-bold tracking-tight text-emerald-900"
          >
            Kaban
          </Link>
          <nav className="flex min-w-0 flex-wrap items-center justify-end gap-1 text-sm">
            <NavLink to="/home" className={({ isActive }) => navLinkClass(isActive)}>
              Home
            </NavLink>
            <NavLink to="/notifications" className={({ isActive }) => navLinkClass(isActive)}>
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-normal leading-none text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </NavLink>
            <NavLink to="/manager/obligations" className={({ isActive }) => navLinkClass(isActive)}>
              Owed to me
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => navLinkClass(isActive)}>
              Profile
            </NavLink>
            <span aria-hidden className="mx-2 inline-flex h-10 items-center text-slate-300">
              |
            </span>
            <span className="inline-flex h-10 min-w-0 items-center gap-2 text-slate-900">
              <span className={ui.avatarInitialsSm} aria-hidden>
                {initials}
              </span>
              <span className="max-w-[10rem] truncate">{user?.displayName}</span>
            </span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className={`ml-4 inline-flex h-10 items-center font-bold ${ui.btnGhost}`}
            >
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className={`mx-auto min-w-0 px-6 py-10 ${ui.page}`}>
        <Outlet />
      </main>
    </div>
  );
}
