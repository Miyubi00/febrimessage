import { AppError, logDevError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { ProfileUpdate } from '@/types/database';
import type { Profile } from '@/types/profile';
import { profileToDraft } from '@/types/profile';

/** Fetch the single public profile (the oldest row) — there is only one owner. */
export async function fetchDefaultProfile(): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    logDevError('profileService.fetchDefaultProfile', error);
    throw new AppError('Gagal memuat profil.', 'PROFILE_FETCH_FAILED');
  }
  return data;
}

export async function fetchProfileById(id: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) {
    logDevError('profileService.fetchProfileById', error);
    throw new AppError('Gagal memuat profil.', 'PROFILE_FETCH_FAILED');
  }
  return data;
}

/** True when another profile already uses this username. */
export async function isUsernameTaken(username: string, exceptProfileId?: string): Promise<boolean> {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', normalized)
    .limit(2);

  if (error) {
    logDevError('profileService.isUsernameTaken', error);
    return false;
  }

  return (data ?? []).some((row) => row.id !== exceptProfileId);
}

export async function fetchProfileForAdmin(userId: string): Promise<Profile | null> {
  // 1. A profile explicitly owned by this admin wins.
  const { data: owned, error: ownedError } = await supabase
    .from('profiles')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownedError) logDevError('profileService.fetchProfileForAdmin.owned', ownedError);
  if (owned) return owned;

  // 2. Otherwise fall back to the (single) seeded profile so a fresh install is
  //    immediately editable, then it gets claimed on the first save.
  const { data: fallback, error: fallbackError } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallbackError) {
    logDevError('profileService.fetchProfileForAdmin.fallback', fallbackError);
    throw new AppError('Gagal memuat profil.', 'PROFILE_FETCH_FAILED');
  }
  return fallback;
}

/** Persist profile-draft changes (admin only — enforced by RLS). */
export async function updateProfile(
  profileId: string,
  draft: {
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
  },
  /** When set, a profile without an owner claims this admin on save. */
  claimOwnerId?: string,
): Promise<Profile> {
  const patch: ProfileUpdate = {
    username: draft.username.trim().toLowerCase(),
    display_name: draft.displayName.trim(),
    description: draft.description.trim() || null,
    pronouns: draft.pronouns.trim() || null,
    avatar_url: draft.avatarUrl,
    background_url: draft.backgroundUrl,
    discord_url: draft.discordUrl.trim() || null,
    roblox_url: draft.robloxUrl.trim() || null,
    is_verified: draft.isVerified,
    theme: draft.theme,
  };

  if (claimOwnerId) patch.owner_id = claimOwnerId;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', profileId)
    .select('*')
    .single();

  if (error || !data) {
    logDevError('profileService.updateProfile', error);
    if (error?.code === '23505' || /duplicate/i.test(error?.message ?? '')) {
      throw new AppError('Username sudah dipakai. Pilih username lain.', 'USERNAME_TAKEN');
    }
    throw new AppError('Gagal menyimpan perubahan. Coba lagi.', 'PROFILE_UPDATE_FAILED');
  }

  return data;
}

export function toDraft(profile: Profile) {
  return profileToDraft(profile);
}