import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { GuestRoute } from "./components/GuestRoute";
import { LandingPage } from "./pages/LandingPage";

const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const CreateGroupPage = lazy(() =>
  import("./pages/CreateGroupPage").then((m) => ({ default: m.CreateGroupPage })),
);
const GroupLobbyPage = lazy(() =>
  import("./pages/GroupLobbyPage").then((m) => ({ default: m.GroupLobbyPage })),
);
const NotificationsPage = lazy(() =>
  import("./pages/NotificationsPage").then((m) => ({ default: m.NotificationsPage })),
);
const ManagerObligationsPage = lazy(() =>
  import("./pages/ManagerObligationsPage").then((m) => ({ default: m.ManagerObligationsPage })),
);
const InviteLandingPage = lazy(() =>
  import("./pages/InvitePages").then((m) => ({ default: m.InviteLandingPage })),
);
const ClaimLandingPage = lazy(() =>
  import("./pages/InvitePages").then((m) => ({ default: m.ClaimLandingPage })),
);

function PageFallback() {
  return <p className="text-slate-500">Loading…</p>;
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route path="/invite/:token" element={<InviteLandingPage />} />
          <Route path="/claim/:token" element={<ClaimLandingPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/home" element={<HomePage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/groups/new" element={<CreateGroupPage />} />
              <Route path="/groups/:id" element={<GroupLobbyPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/manager/obligations" element={<ManagerObligationsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
