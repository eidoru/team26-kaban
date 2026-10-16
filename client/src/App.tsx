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
const GroupPage = lazy(() => import("./pages/group/GroupPage").then((m) => ({ default: m.GroupPage })));
const EditGroupPage = lazy(() =>
  import("./pages/group/EditGroupPage").then((m) => ({ default: m.EditGroupPage })),
);
const LaunchReviewPage = lazy(() =>
  import("./pages/group/LaunchReviewPage").then((m) => ({ default: m.LaunchReviewPage })),
);
const ActivityPage = lazy(() => import("./pages/group/ActivityPage").then((m) => ({ default: m.ActivityPage })));
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
              <Route path="/groups/new" element={<CreateGroupPage />} />
              <Route path="/groups/:id" element={<GroupPage />} />
              <Route path="/groups/:id/edit" element={<EditGroupPage />} />
              <Route path="/groups/:id/launch" element={<LaunchReviewPage />} />
              <Route path="/groups/:id/activity" element={<ActivityPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
