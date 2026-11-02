import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { Avatar } from "../components/Avatar";
import { ProfileRatings } from "../components/StarRating";
import { useAuth } from "../context/useAuth";
import { ui } from "../lib/ui";

/** "Oct 2026" */
const memberSince = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "Asia/Manila" });

/**
 * R-DEC-43: anyone's public profile, for any signed-in user: name, when they joined and their two
 * ratings. Nothing private (no email, contact or money).
 */
export function UserProfilePage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { data: profile, error, isPending } = useQuery({ queryKey: ["user", id], queryFn: () => api.userProfile(id) });

  if (isPending) {
    return (
      <div className={`${ui.page} max-w-2xl space-y-4`}>
        <div className={`${ui.skeleton} h-28`} />
        <div className={`${ui.skeleton} h-32`} />
      </div>
    );
  }
  if (error || !profile) {
    return (
      <div className={`${ui.page} max-w-2xl`}>
        <div className={ui.emptyState}>
          <h1 className="font-heading text-xl font-bold text-ink-900">
            {error instanceof ApiError && error.status === 404 ? "No such user" : "Couldn't load this profile"}
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className={`${ui.page} max-w-2xl space-y-4`}>
      <div className="relative overflow-hidden rounded-3xl bg-brand-700 p-6 text-white shadow-card sm:p-8">
        <div aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-600" />
        <div className="relative flex items-center gap-4">
          <Avatar name={profile.displayName} size="lg" className="ring-4 ring-white/30" />
          <div className="min-w-0">
            <h1 className="font-heading truncate text-2xl font-bold">{profile.displayName}</h1>
            <p className="text-sm text-brand-100">On Kaban since {memberSince(profile.memberSince)}</p>
          </div>
        </div>
      </div>
      <section aria-label="Ratings">
        <ProfileRatings profile={profile} />
      </section>
      {user?.id === profile.id && (
        <p className="text-center">
          <Link to="/profile" className={ui.link}>
            Edit your profile
          </Link>
        </p>
      )}
    </div>
  );
}
