import { Download, Image as ImageIcon, Loader2, Share2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { generateReplyStoryImage, type ReplyStoryArtwork } from '@/lib/replyStoryImage';
import type { Profile } from '@/types/profile';

interface ReplyStoryButtonProps {
  message: string;
  profile: Profile;
}

/**
 * Message sticker: small transparent PNG card with the message in big type,
 * ready to paste over an Instagram Story background.
 */
export function ReplyStoryButton({ message, profile }: ReplyStoryButtonProps): JSX.Element {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [artwork, setArtwork] = useState<ReplyStoryArtwork | null>(null);
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);

  const profileUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/`;

  const openModal = (): void => {
    setArtwork(null);
    setFailed(false);
    setOpen(true);
    setGenerating(true);
    generateReplyStoryImage(profile, message)
      .then((result) => setArtwork(result))
      .catch(() => setFailed(true))
      .finally(() => setGenerating(false));
  };

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
    push({ title: 'Gambar tersimpan', description: 'Tempel di atas background Story.', variant: 'success' });
  };

  const share = async (): Promise<void> => {
    if (!artwork) return;
    try {
      const file = new File([artwork.blob], artwork.fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Pesan anonim!', text: profileUrl });
        return;
      }
      download();
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return;
      download();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Buat stiker story"
        title="Buat stiker story"
        className="inline-flex items-center gap-1.5 rounded-2xl border border-pastel-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink-soft transition hover:border-pastel-400 hover:text-pastel-800"
      >
        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Story</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Stiker Pesan"
        description="PNG transparan — tempel di atas background Story."
        size="md"
      >
        {generating ? (
          <p className="flex items-center justify-center gap-2 py-12 text-sm font-semibold text-ink-soft">
            <Loader2 className="h-5 w-5 animate-spin text-pastel-500" aria-hidden="true" />
            Membuat gambar…
          </p>
        ) : null}

        {failed ? (
          <p className="py-8 text-center text-sm font-semibold text-rose-500">
            Gagal membuat gambar. Coba lagi.
          </p>
        ) : null}

        {artwork ? (
          <>
            <img
              src={artwork.dataUrl}
              alt="Pratinjau stiker pesan"
              className="mx-auto max-h-[46dvh] w-auto rounded-3xl border border-pastel-200 shadow-card"
            />
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
          </>
        ) : null}
      </Modal>
    </>
  );
}
