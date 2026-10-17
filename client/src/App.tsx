import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { GuestRoute } from "./components/GuestRoute";
import { LandingPage } from "./pages/LandingPage";
import { Splash } from "./components/Splash";

const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const NotificationsPage = lazy(() =>
  import("./pages/NotificationsPage").then((m) => ({ default: m.NotificationsPage })),
);
const CreateGroupPage = lazy(() =>
  import("./pages/create/CreateGroupPage").then((m) => ({ default: m.CreateGroupPage })),
);
const GroupShell = lazy(() => import("./pages/group/GroupShell").then((m) => ({ default: m.GroupShell })));
const GroupPage = lazy(() => import("./pages/group/GroupPage").then((m) => ({ default: m.GroupPage })));
const MoneyRecordsPage = lazy(() =>
  import("./pages/group/MoneyRecordsPage").then((m) => ({ default: m.MoneyRecordsPage })),
);
const EditGroupPage = lazy(() =>
  import("./pages/group/EditGroupPage").then((m) => ({ default: m.EditGroupPage })),
);
const ActivityPage = lazy(() => import("./pages/group/ActivityPage").then((m) => ({ default: m.ActivityPage })));
const HistoryPage = lazy(() => import("./pages/group/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const InvitePage = lazy(() => import("./pages/join/InvitePage").then((m) => ({ default: m.InvitePage })));
const ClaimPage = lazy(() => import("./pages/join/ClaimPage").then((m) => ({ default: m.ClaimPage })));

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/claim/:token" element={<ClaimPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/home" element={<HomePage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/money" element={<Navigate to="/home" replace />} />
              {/* Old "Owed to you" address, kept for bookmarks and older notifications. */}
              <Route path="/manager/obligations" element={<Navigate to="/home" replace />} />
              <Route path="/groups/new" element={<CreateGroupPage />} />
              {/* One paluwagan: the shell loads it and, once launched, adds the view navigation. */}
              <Route path="/groups/:id" element={<GroupShell />}>
                <Route index element={<GroupPage view="dashboard" />} />
                <Route path="schedule" element={<GroupPage view="schedule" />} />
                <Route path="members" element={<GroupPage view="members" />} />
                <Route path="debts" element={<GroupPage view="debts" />} />
                <Route path="money" element={<MoneyRecordsPage />} />
                <Route path="activity" element={<ActivityPage />} />
                <Route path="history" element={<HistoryPage />} />
              </Route>
              <Route path="/groups/:id/edit" element={<EditGroupPage />} />
              {/* The review step is gone (R-DEC-28); launching happens on the group page. */}
              <Route path="/groups/:id/launch" element={<Navigate to=".." relative="path" replace />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
