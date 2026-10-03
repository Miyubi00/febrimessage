import { Download, Link2, Loader2, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { generateStoryImage, type StoryArtwork } from '@/lib/storyImage';
import type { Profile } from '@/types/profile';

/** Share button + story artwork modal (NGL-style 1080×1920 portrait). */
export function StoryShare({ profile }: { profile: Profile }): JSX.Element {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [artwork, setArtwork] = useState<StoryArtwork | null>(null);
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);

  const profileUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/`;

  useEffect(() => {
    if (!open) return;
    setArtwork(null);
    setFailed(false);
    setGenerating(true);
    generateStoryImage(profile, window.location.origin)
      .then((result) => setArtwork(result))
      .catch(() => setFailed(true))
      .finally(() => setGenerating(false));
  }, [open, profile]);

  const download = (): void => {
    if (!artwork) return;
    const url = URL.createObjectURL(artwork.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = artwork.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    push({ title: 'Gambar tersimpan', description: 'Upload ke IG Story lalu tempel link profil.', variant: 'success' });
  };

  const share = async (): Promise<void> => {
    if (!artwork) return;
    try {
      const file = new File([artwork.blob], artwork.fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Kirim aku pesan anonim!', text: profileUrl });
        return;
      }
      download();
    } catch (caught) {
      // User dismissed the share sheet — not an error.
      if (caught instanceof Error && caught.name === 'AbortError') return;
      download();
    }
  };

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      push({ title: 'Link tersalin', description: 'Tempel sebagai stiker tautan di Story.', variant: 'success' });
    } catch {
      push({ title: 'Gagal menyalin', description: 'Salin manual dari address bar ya.', variant: 'error' });
    }
  };

  return (
    <>
      <Button
        type="button"
        size="lg"
        fullWidth
        onClick={() => setOpen(true)}
        leftIcon={<Share2 className="h-4 w-4" aria-hidden="true" />}
      >
        Bagikan ke Story
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Bagikan ke Story"
        description="Gambar 1080 × 1920 siap upload — lalu tempel link profil sebagai stiker tautan."
        size="md"
      >
        {generating ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-ink-soft">
            <Loader2 className="h-5 w-5 animate-spin text-pastel-500" aria-hidden="true" />
            Membuat gambar…
          </p>
        ) : null}

        {failed ? (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-ink">Gagal membuat gambar.</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() => {
                setFailed(false);
                setGenerating(true);
                generateStoryImage(profile, window.location.origin)
                  .then((result) => setArtwork(result))
                  .catch(() => setFailed(true))
                  .finally(() => setGenerating(false));
              }}
            >
              Coba lagi
            </Button>
          </div>
        ) : null}

        {artwork ? (
          <div>
            <img
              src={artwork.dataUrl}
              alt="Pratinjau gambar story profil"
              className="mx-auto max-h-[52dvh] w-auto rounded-3xl border border-pastel-200 shadow-card"
            />

            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-4 flex w-full items-center gap-2 truncate rounded-2xl border border-pastel-200 bg-white/80 px-4 py-2.5 text-left text-xs text-ink-soft transition hover:border-pastel-400"
              title="Salin link profil"
            >
              <Link2 className="h-3.5 w-3.5 shrink-0 text-pastel-600" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{profileUrl}</span>
              <span className="shrink-0 font-bold text-pastel-700">Salin</span>
            </button>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={download}
                leftIcon={<Download className="h-4 w-4" aria-hidden="true" />}
              >
                Unduh
              </Button>
              <Button
                type="button"
                onClick={() => void share()}
                leftIcon={<Share2 className="h-4 w-4" aria-hidden="true" />}
              >
                Bagikan
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
