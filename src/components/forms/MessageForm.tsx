import { ImagePlus, Mail, Send, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { AttachmentPreviews } from '@/components/forms/AttachmentPreviews';
import { CaptchaField } from '@/components/forms/CaptchaField';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { retryAfterOf, toFriendlyMessage } from '@/lib/errors';
import { uploadPendingAttachment } from '@/lib/uploads';
import { formatRetryAfter, cn } from '@/lib/utils';
import {
  ACCEPT_IMAGE_ATTR,
  MAX_ATTACHMENTS,
  MESSAGE_MAX,
  SENDER_NAME_MAX,
  countChars,
  sanitizeMultiline,
  sanitizeText,
  validateMessageContent,
  validateSenderName,
} from '@/lib/validation';
import { submitMessage } from '@/services/messageService';
import type { StagedAttachment } from '@/types/message';
import type { Profile } from '@/types/profile';

interface MessageFormProps {
  profile: Profile;
  /** Called after a successful submission (used to refresh the message list). */
  onSent?: () => void;
  className?: string;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Anonymous message composer.
 *
 * The browser never writes to the database: images are validated + stored by the
 * `upload-message-attachment` Edge Function and the message itself is created by
 * `submit-message`, which applies rate limiting and anti-spam checks.
 */
export function MessageForm({ profile, onSent, className }: MessageFormProps): JSX.Element {
  const { push } = useToast();

  const [senderName, setSenderName] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [content, setContent] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [senderError, setSenderError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - clock) / 1000));
  const coolingDown = cooldownSeconds > 0;
  const uploading = attachments.some((item) => item.status === 'uploading');

  // Ticking clock so the cooldown label counts down smoothly.
  useEffect(() => {
    if (!coolingDown) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [coolingDown]);

  const contentCount = useMemo(() => countChars(content), [content]);
  const nameCount = useMemo(() => countChars(senderName), [senderName]);

  const handleCaptchaToken = useCallback((token: string) => setCaptchaToken(token), []);

  const handleFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;

    const slots = MAX_ATTACHMENTS - attachments.length;
    if (slots <= 0) {
      push({
        title: `Maksimal ${MAX_ATTACHMENTS} gambar`,
        description: 'Hapus salah satu lampiran dulu ya.',
        variant: 'info',
      });
      return;
    }

    const chosen = Array.from(files).slice(0, slots);

    for (const file of chosen) {
      const id = newId();
      const previewUrl = URL.createObjectURL(file);
      setAttachments((previous) => [
        ...previous,
        { id, file, previewUrl, progress: 0, status: 'uploading', error: null, remote: null },
      ]);

      try {
        const remote = await uploadPendingAttachment(file, (percent) => {
          setAttachments((previous) =>
            previous.map((item) => (item.id === id ? { ...item, progress: percent } : item)),
          );
        });

        setAttachments((previous) =>
          previous.map((item) =>
            item.id === id ? { ...item, status: 'uploaded', progress: 100, remote } : item,
          ),
        );
      } catch (caught) {
        const message = toFriendlyMessage(caught, 'Gagal mengunggah gambar. Coba lagi.');
        setAttachments((previous) =>
          previous.map((item) =>
            item.id === id ? { ...item, status: 'error', error: message } : item,
          ),
        );

        const retryAfter = retryAfterOf(caught);
        if (retryAfter) setCooldownUntil(Date.now() + retryAfter * 1000);

        push({ title: 'Upload gagal', description: message, variant: 'error' });
      }
    }
  };

  const removeAttachment = (id: string): void => {
    setAttachments((previous) => {
      const target = previous.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return previous.filter((item) => item.id !== id);
    });
  };

  const resetForm = (): void => {
    setSenderName('');
    setContent('');
    setIsAnonymous(false);
    setSenderError(null);
    setContentError(null);
    setCaptchaToken('');
    setCaptchaResetKey((key) => key + 1);
    setAttachments((previous) => {
      previous.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting || coolingDown) return;

    const nextSenderError = validateSenderName(senderName, isAnonymous);
    const nextContentError = validateMessageContent(content, MESSAGE_MAX);
    setSenderError(nextSenderError);
    setContentError(nextContentError);
    if (nextSenderError || nextContentError) return;

    // Honeypot: hidden from humans, irresistible to bots.
    if (honeypot.trim()) {
      push({ title: 'Pesan tidak terkirim', description: 'Coba lagi sebentar lagi.', variant: 'error' });
      return;
    }

    if (uploading) {
      push({ title: 'Tunggu sebentar', description: 'Gambar masih diunggah.', variant: 'info' });
      return;
    }

    const paths = attachments
      .filter((item) => item.status === 'uploaded' && item.remote)
      .map((item) => item.remote?.storage_path ?? '')
      .filter(Boolean);

    setSubmitting(true);

    try {
      await submitMessage({
        profileId: profile.id,
        senderName: sanitizeText(senderName),
        isAnonymous,
        content: sanitizeMultiline(content),
        honeypot,
        captchaToken,
        attachmentPaths: paths,
      });

      push({
        title: 'Pesan berhasil dikirim!',
        description: 'Terima kasih, pesanmu sudah masuk 💙',
        variant: 'success',
      });
      resetForm();
      onSent?.();
    } catch (caught) {
      const retryAfter = retryAfterOf(caught);
      if (retryAfter) {
        setCooldownUntil(Date.now() + retryAfter * 1000);
        push({
          title: 'Terlalu banyak pesan dikirim',
          description: `Coba lagi dalam ${formatRetryAfter(retryAfter)}.`,
          variant: 'error',
        });
      } else {
        push({
          title: 'Gagal mengirim pesan',
          description: toFriendlyMessage(caught, 'Coba lagi sebentar lagi.'),
          variant: 'error',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('surface-soft relative p-5 sm:p-6', className)}
      noValidate
    >
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pastel-100 text-pastel-700">
          <Mail className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="section-title">Send Message?</h2>
          <p className="truncate text-sm text-ink-muted">Kirim pesan untuk @{profile.username}</p>
        </div>
      </header>

      {/* Honeypot — hidden from humans, filled by bots. */}
      <div className="pointer-events-none absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="message-honeypot">Website</label>
        <input
          id="message-honeypot"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
      </div>

      <div className="mt-5 space-y-4">
        <Input
          label="Nama anda"
          name="senderName"
          placeholder="Nama anda"
          autoComplete="off"
          maxLength={SENDER_NAME_MAX}
          leftIcon={<User className="h-4 w-4" aria-hidden="true" />}
          value={isAnonymous ? '' : senderName}
          disabled={isAnonymous}
          onChange={(event) => {
            setSenderName(event.target.value);
            if (senderError) setSenderError(null);
          }}
          counter={{ current: isAnonymous ? 0 : nameCount, max: SENDER_NAME_MAX }}
          error={senderError}
        />

        <Checkbox
          name="isAnonymous"
          label="Kirim sebagai anonim"
          checked={isAnonymous}
          onChange={(event) => {
            setIsAnonymous(event.target.checked);
            setSenderError(null);
          }}
        />

        <Textarea
          label="Pesan"
          name="content"
          placeholder="Tulis pesan..."
          maxLength={MESSAGE_MAX}
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            if (contentError) setContentError(null);
          }}
          counter={{ current: contentCount, max: MESSAGE_MAX }}
          error={contentError}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_IMAGE_ATTR}
          multiple
          className="sr-only"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = '';
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= MAX_ATTACHMENTS || submitting}
          >
            Tambahkan foto
          </Button>
          <span className="hint-text">
            {attachments.length}/{MAX_ATTACHMENTS} gambar • maks 5MB
          </span>
        </div>

        <AttachmentPreviews items={attachments} onRemove={removeAttachment} />

        <CaptchaField onToken={handleCaptchaToken} resetKey={captchaResetKey} />

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={submitting}
          loadingText="Mengirim..."
          disabled={coolingDown}
          leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
        >
          {coolingDown ? `Coba lagi dalam ${formatRetryAfter(cooldownSeconds)}` : 'Kirim'}
        </Button>
      </div>
    </form>
  );
}