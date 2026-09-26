'use client';

import type { ProfileDto } from '@cardroom/shared';
import { createContext, useContext, type ReactNode } from 'react';

const ProfileContext = createContext<ProfileDto | null>(null);

export function ProfileProvider({ profile, children }: { profile: ProfileDto; children: ReactNode }) {
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileDto {
  const profile = useContext(ProfileContext);
  if (!profile) throw new Error('useProfile must be used inside <ProfileProvider>');
  return profile;
}
