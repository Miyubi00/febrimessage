import {
  Camera,
  Image as ImageIcon,
  Loader2,
  Palette,
  Pencil,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { AVATAR_OUTPUT, BANNER_OUTPUT, ImageCropDialog } from '@/components/forms/ImagePicker';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { toFriendlyMessage } from '@/lib/errors';
import { removeProfileAsset, uploadProfileAsset } from '@/lib/uploads';
import {
  ACCEPT_IMAGE_ATTR,
  DESCRIPTION_MAX,
  DISPLAY_NAME_MAX,
  MAX_ATTACHMENT_BYTES,
  MAX_BACKGROUND_BYTES,
  PRONOUNS_MAX,
  USERNAME_MAX,
  assertImageFile,
  storagePathFromPublicUrl,
  validateDescription,
  validateDiscordUrl,
  validateDisplayName,
  validatePronouns,
  validateRobloxUrl,
  validateUsername,
} from '@/lib/validation';
import { isUsernameTaken, updateProfile } from '@/services/profileService';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { THEME_OPTIONS, profileToDraft, type Profile, type ProfileDraft } from '@/types/profile';
import { DiscordGlyph, RobloxGlyph } from '@/components/profile/ProfileHeader';
import { VerifiedBadge } from '@/components/ui/Avatar';

interface ProfileEditorProps {
  profile: Profile;
  /** Used to claim an unowned profile on first save. */
  adminId: string | null;
  onSaved: (profile: Profile) => void;
}

interface UploadState {
  progress: number;
  url: string | null;
  path: string | null;
  error: string | null;
  loading: boolean;
}

const EMPTY_UPLOAD: UploadState = { progress: 0, url: null, path: null, error: null, loading: false };

type PhotoBucket = 'avatars' | 'backgrounds';

interface CropTarget {
  bucket: PhotoBucket;
  file: File;
  url: string;
}

interface TextFields {
  displayName: string;
  username: string;
  pronouns: string;
  description: string;
  discordUrl: string;
  robloxUrl: string;
}

function textFieldsOf(draft: ProfileDraft): TextFields {
  return {
    displayName: draft.displayName,
    username: draft.username,
    pronouns: draft.pronouns,
    description: draft.description,
    discordUrl: draft.discordUrl,
    robloxUrl: draft.robloxUrl,
  };
}

/** Profile editor: public-like preview card + "Edit Profil" modal for text fields. */
export function ProfileEditor({ profile, adminId, onSaved }: ProfileEditorProps): JSX.Element {
  const { push } = useToast();

  const [draft, setDraft] = useState<ProfileDraft>(() => profileToDraft(profile));
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDraft, setModalDraft] = useState<TextFields>(() => textFieldsOf(profileToDraft(profile)));
  const [modalErrors, setModalErrors] = useState<Record<string, string | null>>({});

  const [avatar, setAvatar] = useState<UploadState>(EMPTY_UPLOAD);
  const [background, setBackground] = useState<UploadState>(EMPTY_UPLOAD);
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);
  /** Which photo's action menu is open (chooser modal). */
  const [photoMenu, setPhotoMenu] = useState<PhotoBucket | null>(null);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Old objects that should be removed *after* the DB update succeeds.
  const stalePaths = useRef<Array<{ bucket: PhotoBucket; path: string }>>([]);

  useEffect(() => {
    setDraft(profileToDraft(profile));
  }, [profile]);

  // Never leak the crop object URL.
  useEffect(() => {
    return () => {
      if (cropTarget) URL.revokeObjectURL(cropTarget.url);
    };
  }, [cropTarget]);

  const previewAvatar = avatar.url ?? draft.avatarUrl;
  const previewBackground = background.url ?? draft.backgroundUrl;
  const photoError = background.error ?? avatar.error;

  // Unsaved edits: any draft text/photo change, or a picked photo that hasn't
  // been uploaded yet. Saving resets the draft + upload states, clearing this.
  const dirty = useMemo(() => {
    if (cropTarget) return true;
    if (avatar.path || background.path) return true;
    return JSON.stringify(draft) !== JSON.stringify(profileToDraft(profile));
  }, [draft, profile, avatar.path, background.path, cropTarget]);
  const guard = useUnsavedChangesGuard(dirty && !saving);

  const hasDiscord = draft.discordUrl.trim() !== '';
  const hasRoblox = draft.robloxUrl.trim() !== '';

  const cropIsAvatar = cropTarget?.bucket === 'avatars';
  const cropOutput = cropIsAvatar ? AVATAR_OUTPUT : BANNER_OUTPUT;

  const update = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const openEditorModal = (): void => {
    setModalDraft(textFieldsOf(draft));
    setModalErrors({});
    setModalOpen(true);
  };

  const updateModal = <K extends keyof TextFields>(key: K, value: TextFields[K]): void => {
    setModalDraft((current) => ({ ...current, [key]: value }));
    setModalErrors((current) => ({ ...current, [key]: null }));
  };

  /** Validate the modal form, then apply it to the preview (persist happens via header Simpan). */
  const applyModal = (): void => {
    const nextErrors: Record<string, string | null> = {
      displayName: validateDisplayName(modalDraft.displayName),
      username: validateUsername(modalDraft.username),
      pronouns: validatePronouns(modalDraft.pronouns),
      description: validateDescription(modalDraft.description),
      discordUrl: validateDiscordUrl(modalDraft.discordUrl),
      robloxUrl: validateRobloxUrl(modalDraft.robloxUrl),
    };
    setModalErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setDraft((current) => ({
      ...current,
      ...modalDraft,
      username: modalDraft.username.trim().toLowerCase(),
    }));
    setModalOpen(false);
    push({
      title: 'Diterapkan ke preview',
      description: 'Klik "Simpan" untuk mempublikasikan.',
      variant: 'info',
    });
  };

  const handleUpload = async (
    bucket: PhotoBucket,
    file: File,
    setState: (state: UploadState) => void,
  ): Promise<void> => {
    setState({ progress: 0, url: null, path: null, error: null, loading: true });
    try {
      const uploaded = await uploadProfileAsset(bucket, file, (progress) =>
        setState({ progress, url: null, path: null, error: null, loading: true }),
      );

      const previous = bucket === 'avatars' ? profile.avatar_url : profile.background_url;
      const previousPath = storagePathFromPublicUrl(previous, bucket);
      if (previousPath) stalePaths.current.push({ bucket, path: previousPath });

      setState({ progress: 100, url: uploaded.publicUrl, path: uploaded.path, error: null, loading: false });

      if (bucket === 'avatars') update('avatarUrl', uploaded.publicUrl);
      else update('backgroundUrl', uploaded.publicUrl);

      push({ title: 'Upload selesai', description: 'Jangan lupa klik "Simpan".', variant: 'success' });
    } catch (caught) {
      const message = toFriendlyMessage(caught, 'Gagal mengunggah file.');
      setState({ progress: 0, url: null, path: null, error: message, loading: false });
      push({ title: 'Upload gagal', description: message, variant: 'error' });
    }
  };

  /** Remove the current photo (the old file is deleted after Simpan succeeds). */
  const handleClear = (bucket: PhotoBucket): void => {
    const previous = bucket === 'avatars' ? profile.avatar_url : profile.background_url;
    const previousPath = storagePathFromPublicUrl(previous, bucket);
    if (previousPath) stalePaths.current.push({ bucket, path: previousPath });

    if (bucket === 'avatars') {
      update('avatarUrl', null);
      setAvatar(EMPTY_UPLOAD);
    } else {
      update('backgroundUrl', null);
      setBackground(EMPTY_UPLOAD);
    }
  };

  /** From the chooser modal: open the file picker for this photo. */
  const pickPhoto = (bucket: PhotoBucket): void => {
    setPhotoMenu(null);
    const input = bucket === 'avatars' ? avatarInputRef.current : coverInputRef.current;
    input?.click();
  };

  /** From the chooser modal: delete this photo. */
  const deletePhoto = (bucket: PhotoBucket): void => {
    handleClear(bucket);
    setPhotoMenu(null);
  };

  /** Validate a freshly picked file, then either upload (GIF) or open the crop dialog. */
  const preparePhoto = async (bucket: PhotoBucket, files: FileList | null): Promise<void> => {
    const file = files?.[0];
    if (!file) return;
    const setState = bucket === 'avatars' ? setAvatar : setBackground;
    const maxBytes = bucket === 'backgrounds' ? MAX_BACKGROUND_BYTES : MAX_ATTACHMENT_BYTES;

    const validationError = await assertImageFile(file, maxBytes);
    if (validationError) {
      setState({ progress: 0, url: null, path: null, error: validationError, loading: false });
      return;
    }

    // GIFs skip the crop step so animation is preserved.
    if (file.type === 'image/gif') {
      void handleUpload(bucket, file, setState);
      return;
    }

    const url = URL.createObjectURL(file);
    setCropTarget((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return { bucket, file, url };
    });
  };

  const closeCrop = (): void => {
    if (cropTarget) URL.revokeObjectURL(cropTarget.url);
    setCropTarget(null);
  };

  const confirmCrop = async (cropped: File): Promise<void> => {
    const target = cropTarget;
    if (!target) return;
    const maxBytes = target.bucket === 'backgrounds' ? MAX_BACKGROUND_BYTES : MAX_ATTACHMENT_BYTES;
    const setState = target.bucket === 'avatars' ? setAvatar : setBackground;

    if (cropped.size > maxBytes) {
      URL.revokeObjectURL(target.url);
      setCropTarget(null);
      setState({
        progress: 0,
        url: null,
        path: null,
        error: `Hasil crop masih lebih dari ${Math.round(maxBytes / (1024 * 1024))}MB. Coba gambar lain.`,
        loading: false,
      });
      return;
    }

    URL.revokeObjectURL(target.url);
    setCropTarget(null);
    void handleUpload(target.bucket, cropped, setState);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (saving) return;

    // Safety net — text fields are validated in the modal, but re-check here.
    const nextErrors: Record<string, string | null> = {
      displayName: validateDisplayName(draft.displayName),
      username: validateUsername(draft.username),
      description: validateDescription(draft.description),
      pronouns: validatePronouns(draft.pronouns),
      discordUrl: validateDiscordUrl(draft.discordUrl),
      robloxUrl: validateRobloxUrl(draft.robloxUrl),
    };
    if (Object.values(nextErrors).some(Boolean)) {
      setModalDraft(textFieldsOf(draft));
      setModalErrors({
        displayName: nextErrors.displayName,
        username: nextErrors.username,
        pronouns: nextErrors.pronouns,
        description: nextErrors.description,
        discordUrl: nextErrors.discordUrl,
        robloxUrl: nextErrors.robloxUrl,
      });
      setModalOpen(true);
      return;
    }

    setSaving(true);
    try {
      const taken = await isUsernameTaken(draft.username, profile.id);
      if (taken) {
        setModalDraft(textFieldsOf(draft));
        setModalErrors({ username: 'Username sudah dipakai.' });
        setModalOpen(true);
        return;
      }

      const saved = await updateProfile(
        profile.id,
        draft,
        profile.owner_id ? undefined : (adminId ?? undefined),
      );

      // Only now that the DB points at the new files do we delete the old ones,
      // which keeps orphaned storage objects to a minimum.
      await Promise.all(
        stalePaths.current.map(({ bucket, path }) => removeProfileAsset(bucket, path)),
      );
      stalePaths.current = [];

      setAvatar(EMPTY_UPLOAD);
      setBackground(EMPTY_UPLOAD);
      setDraft(profileToDraft(saved));
      onSaved(saved);
      push({
        title: 'Perubahan tersimpan',
        description: 'Halaman publik sudah diperbarui.',
        variant: 'success',
      });
    } catch (caught) {
      push({
        title: 'Gagal menyimpan perubahan',
        description: toFriendlyMessage(caught, 'Coba lagi sebentar lagi.'),
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      className={`mx-auto w-full max-w-2xl space-y-4${guard.shaking ? ' animate-shake' : ''}`}
      noValidate
    >
      <header>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
          Profile Settings
        </h1>
        <p className="text-sm text-ink-muted">
          Ubah tampilan halaman publik{' '}
          <span className="font-semibold">@{profile.username}</span>.
        </p>
      </header>

      <Card padding="none" className="overflow-hidden">
        {/* Cover */}
        <div className="relative aspect-[16/7] w-full overflow-hidden bg-gradient-to-br from-pastel-200 to-lavender-light">
          {previewBackground ? (
            <img
              src={previewBackground}
              alt=""
              className="h-full w-full object-cover"
              aria-hidden="true"
            />
          ) : null}
          {background.loading ? (
            <span className="absolute inset-0 flex items-center justify-center bg-white/50">
              <Loader2 className="h-6 w-6 animate-spin text-pastel-600" aria-hidden="true" />
            </span>
          ) : null}
          <div className="absolute right-3 top-3 flex gap-2">
            <button
              type="button"
              onClick={() => setPhotoMenu('backgrounds')}
              disabled={background.loading}
              className="flex items-center gap-1.5 rounded-full bg-ink/70 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-ink/85 disabled:opacity-50"
            >
              <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Ubah Cover
            </button>
          </div>
        </div>

        <div className="px-5 pb-5 sm:px-7 sm:pb-7">
          {/* Avatar */}
          <div className="relative -mt-14 h-24 w-24 sm:-mt-16 sm:h-28 sm:w-28">
            <span className="pastel-glow flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white ring-4 ring-white">
              {previewAvatar ? (
                <img
                  src={previewAvatar}
                  alt="Preview avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-pastel-700">
                  {draft.displayName.slice(0, 1).toUpperCase() || '?'}
                </span>
              )}
              {avatar.loading ? (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/60">
                  <Loader2 className="h-5 w-5 animate-spin text-pastel-600" aria-hidden="true" />
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => setPhotoMenu('avatars')}
              disabled={avatar.loading}
              aria-label="Ubah avatar"
              title="Ubah avatar"
              className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-pastel-100 text-pastel-700 shadow-soft ring-2 ring-white transition hover:bg-pastel-200/70 disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {photoError ? (
            <p role="alert" className="mt-2 text-xs font-medium text-rose-500">
              {photoError}
            </p>
          ) : null}

          {/* Name + Edit Profil */}
          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-[28px]">
                <span className="truncate">{draft.displayName || 'Display name'}</span>
                {draft.isVerified ? <VerifiedBadge title="Profil terverifikasi" /> : null}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                <span className="font-semibold text-ink-soft">@{draft.username || 'username'}</span>
                {draft.pronouns.trim() ? <span> • {draft.pronouns}</span> : null}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={openEditorModal}
              leftIcon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
              className="shrink-0 border-transparent bg-pastel-100 text-pastel-700 hover:border-transparent hover:bg-pastel-200/70"
            >
              Edit Profil
            </Button>
          </div>

          {/* Social icons (display only — edited inside the modal). */}
          {hasDiscord || hasRoblox ? (
            <div className="mt-2.5 flex items-center gap-1.5" aria-label="Pratinjau tautan sosial">
              {hasDiscord ? (
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#5B7CE0] text-white"
                  title="Discord"
                >
                  <DiscordGlyph className="h-3 w-3" />
                </span>
              ) : null}
              {hasRoblox ? (
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#2A5CFF] text-white"
                  title="Roblox"
                >
                  <RobloxGlyph className="h-3 w-3" />
                </span>
              ) : null}
            </div>
          ) : null}

          {draft.description.trim() ? (
            <p className="mt-2.5 max-w-prose whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">
              {draft.description}
            </p>
          ) : null}

          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-pastel-100/80 px-3 py-1 text-xs font-semibold text-pastel-800">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Anonymous message box
          </p>

          {/* Theme + verified */}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-pastel-100 pt-4">
            <span className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
              <Palette className="h-4 w-4 text-ink-muted" aria-hidden="true" />
              Tema
            </span>
            <select
              value={draft.theme}
              onChange={(event) => update('theme', event.target.value)}
              aria-label="Theme"
              className="h-9 rounded-xl border border-pastel-200 bg-white/90 px-2 text-xs font-medium text-ink focus:border-pastel-500 focus:outline-none focus:ring-4 focus:ring-pastel-200/80"
            >
              {THEME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Checkbox
              name="isVerified"
              label="Badge terverifikasi"
              checked={draft.isVerified}
              onChange={(event) => update('isVerified', event.target.checked)}
            />
          </div>
        </div>

        <input
          ref={coverInputRef}
          type="file"
          accept={ACCEPT_IMAGE_ATTR}
          className="sr-only"
          aria-label="Pilih file background"
          onChange={(event) => {
            void preparePhoto('backgrounds', event.target.files);
            event.target.value = '';
          }}
        />
        <input
          ref={avatarInputRef}
          type="file"
          accept={ACCEPT_IMAGE_ATTR}
          className="sr-only"
          aria-label="Pilih file avatar"
          onChange={(event) => {
            void preparePhoto('avatars', event.target.files);
            event.target.value = '';
          }}
        />
      </Card>

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={saving}
        loadingText="Menyimpan…"
        leftIcon={<Save className="h-4 w-4" aria-hidden="true" />}
      >
        Simpan Perubahan
      </Button>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Edit Profil"
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              onClick={applyModal}
              leftIcon={<Save className="h-4 w-4" aria-hidden="true" />}
            >
              Simpan
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nama Pengguna"
            name="modalDisplayName"
            placeholder="Miyubi0_0"
            maxLength={DISPLAY_NAME_MAX}
            value={modalDraft.displayName}
            onChange={(event) => updateModal('displayName', event.target.value)}
            error={modalErrors.displayName}
            counter={{ current: modalDraft.displayName.length, max: DISPLAY_NAME_MAX }}
          />
          <Input
            label="Username"
            name="modalUsername"
            placeholder="miyubio_o"
            maxLength={USERNAME_MAX}
            value={modalDraft.username}
            onChange={(event) => updateModal('username', event.target.value.toLowerCase())}
            error={modalErrors.username}
            counter={{ current: modalDraft.username.length, max: USERNAME_MAX }}
          />
          <Input
            label="Pronouns (opsional)"
            name="modalPronouns"
            placeholder="They/Was"
            maxLength={PRONOUNS_MAX}
            value={modalDraft.pronouns}
            onChange={(event) => updateModal('pronouns', event.target.value)}
            error={modalErrors.pronouns}
            counter={{ current: modalDraft.pronouns.length, max: PRONOUNS_MAX }}
          />
          <Textarea
            label="Bio"
            name="modalDescription"
            placeholder="Ceritakan singkat tentang kamu…"
            maxLength={DESCRIPTION_MAX}
            value={modalDraft.description}
            onChange={(event) => updateModal('description', event.target.value)}
            error={modalErrors.description}
            counter={{ current: modalDraft.description.length, max: DESCRIPTION_MAX }}
          />
          <Input
            label="Discord URL"
            name="modalDiscordUrl"
            placeholder="https://discord.com/users/..."
            value={modalDraft.discordUrl}
            onChange={(event) => updateModal('discordUrl', event.target.value)}
            error={modalErrors.discordUrl}
            leftIcon={<DiscordGlyph className="h-4 w-4" />}
          />
          <Input
            label="Roblox URL"
            name="modalRobloxUrl"
            placeholder="https://www.roblox.com/users/..."
            value={modalDraft.robloxUrl}
            onChange={(event) => updateModal('robloxUrl', event.target.value)}
            error={modalErrors.robloxUrl}
            leftIcon={<RobloxGlyph className="h-4 w-4" />}
          />
        </div>
      </Modal>

      <Modal
        open={photoMenu !== null}
        onClose={() => setPhotoMenu(null)}
        title={photoMenu === 'avatars' ? 'Foto Profil' : 'Foto Cover'}
        size="sm"
        footer={
          <Button type="button" variant="secondary" onClick={() => setPhotoMenu(null)}>
            Batal
          </Button>
        }
      >
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => photoMenu && pickPhoto(photoMenu)}
            className="flex w-full items-center gap-3 rounded-2xl border border-pastel-200 bg-white/80 px-4 py-3 text-left transition hover:border-pastel-400 hover:bg-pastel-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-pastel-100 text-pastel-700">
              <Upload className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-bold text-ink">Ganti foto</span>
              <span className="block text-xs text-ink-muted">Pilih dari perangkat, lalu atur crop.</span>
            </span>
          </button>
          {(photoMenu === 'avatars' ? previewAvatar : previewBackground) ? (
            <button
              type="button"
              onClick={() => photoMenu && deletePhoto(photoMenu)}
              className="flex w-full items-center gap-3 rounded-2xl border border-pastel-200 bg-white/80 px-4 py-3 text-left transition hover:border-rose-300 hover:bg-rose-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-500">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-bold text-ink">Hapus foto</span>
                <span className="block text-xs text-ink-muted">Kembali ke tampilan default.</span>
              </span>
            </button>
          ) : null}
        </div>
      </Modal>

      <ImageCropDialog
        open={cropTarget !== null}
        imageUrl={cropTarget?.url ?? ''}
        fileName={cropTarget?.file.name ?? 'image'}
        fileType={cropTarget?.file.type ?? 'image/jpeg'}
        aspectRatio={cropIsAvatar ? 1 : 16 / 7}
        outputWidth={cropOutput.width}
        outputHeight={cropOutput.height}
        circular={cropIsAvatar ?? false}
        title={cropIsAvatar ? 'Atur foto profil' : 'Atur foto banner'}
        onCancel={closeCrop}
        onConfirm={(file) => void confirmCrop(file)}
      />

      <ConfirmDialog
        open={guard.blocked}
        title="Perubahan belum disimpan"
        description="Simpan dulu sebelum pindah halaman, atau buang perubahan ini?"
        confirmLabel="Buang perubahan"
        cancelLabel="Tetap di sini"
        destructive
        onConfirm={guard.discard}
        onCancel={guard.stay}
      />
    </form>
  );
}
