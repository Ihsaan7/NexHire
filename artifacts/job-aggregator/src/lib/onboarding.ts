import type { Profile } from "@workspace/api-client-react";

export function isOnboardingComplete(profile: Profile | null | undefined): boolean {
  return Boolean(
    profile?.preferences?.experienceLevel?.trim() &&
    profile.preferences.sectors?.length,
  );
}