import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Splash } from "./Splash";

export function GuestRoute() {
  const { user, loading } = useAuth();

  if (loading) return <Splash />;

  if (user) {
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
}
