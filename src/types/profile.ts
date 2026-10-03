import type { ProfileRow } from './database';

export type Profile = ProfileRow;

/** Fields the admin profile editor can change. */
export interface ProfileDraft {
  username: string;
  displayName: string;
  description: string;
  pronouns: string;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  discordUrl: string;
  robloxUrl: string;
  isVerified: boolean;
  theme: string;
}

export function profileToDraft(profile: Profile): ProfileDraft {
  return {
    username: profile.username,
    displayName: profile.display_name,
    description: profile.description ?? '',
    pronouns: profile.pronouns ?? '',
    avatarUrl: profile.avatar_url,
    backgroundUrl: profile.background_url,
    discordUrl: profile.discord_url ?? '',
    robloxUrl: profile.roblox_url ?? '',
    isVerified: profile.is_verified,
    theme: profile.theme,
  };
}

export const THEME_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'pastel-blue', label: 'Pastel Blue (default)' },
  { value: 'sky', label: 'Sky' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'mint', label: 'Mint Mist' },
  { value: 'navy', label: 'Navy Dongker' },
];
