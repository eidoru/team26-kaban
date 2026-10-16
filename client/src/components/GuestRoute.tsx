import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { pendingDestination } from "../lib/pendingInvite";
import { Splash } from "./Splash";

export function GuestRoute() {
  const { user, loading } = useAuth();

  if (loading) return <Splash />;

  if (user) {
    // Someone who just signed in from an invite or claim link goes back to it, not home.
    return <Navigate to={pendingDestination() ?? "/home"} replace />;
  }

  return <Outlet />;
}
