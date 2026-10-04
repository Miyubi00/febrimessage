import { AlertTriangle, Send } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { toFriendlyMessage } from '@/lib/errors';
import { REPLY_MAX, countChars, sanitizeMultiline, validateMessageContent } from '@/lib/validation';
import { replyToMessage } from '@/services/adminService';
import type { MessageRow, MessageVisibility } from '@/types/database';

interface ReplyFormProps {
  messageId: string;
  /** Current thread visibility — used as the default choice. */
  defaultVisibility?: MessageVisibility;
  onReplied: (reply: MessageRow) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Admin reply composer. The reply is stored with `parent_id = messageId`, which
 * is what turns it into a thread server-side. Visibility is thread-wide
 * (spec 49–51): it is set on the root and inherited by the reply.
 */
export function ReplyForm({
  messageId,
  defaultVisibility = 'public',
  onReplied,
  onCancel,
  autoFocus = false,
  className,
}: ReplyFormProps): JSX.Element {
  const { push } = useToast();
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<MessageVisibility>(defaultVisibility);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    const validationError = validateMessageContent(content, REPLY_MAX);
    setError(validationError);
    if (validationError) return;

    setSubmitting(true);
    try {
      const reply = await replyToMessage({
        messageId,
        content: sanitizeMultiline(content),
        visibility,
      });
      setContent('');
      push({ title: 'Balasan terkirim', variant: 'success' });
      onReplied(reply);
    } catch (caught) {
      push({
        title: 'Gagal mengirim balasan',
        description: toFriendlyMessage(caught, 'Coba lagi sebentar lagi.'),
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={className}>
      <fieldset className="mb-3 rounded-3xl border border-pastel-200 bg-white/70 p-3">
        <legend className="px-2 text-xs font-bold text-ink-soft">Reply visibility</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-2xl border p-3 transition ${
              visibility === 'public'
                ? 'border-pastel-400 bg-pastel-50 shadow-soft'
                : 'border-pastel-100 hover:border-pastel-300'
            }`}
          >
            <input
              type="radio"
              name={`reply-visibility-${messageId}`}
              value="public"
              checked={visibility === 'public'}
              onChange={() => setVisibility('public')}
              className="mt-0.5 h-4 w-4 shrink-0 accent-pastel-500"
            />
            <span>
              <span className="block text-xs font-bold text-ink">Public</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-muted">
                Pesan + balasan dapat dilihat semua orang.
              </span>
            </span>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-2xl border p-3 transition ${
              visibility === 'private'
                ? 'border-pastel-400 bg-pastel-50 shadow-soft'
                : 'border-pastel-100 hover:border-pastel-300'
            }`}
          >
            <input
              type="radio"
              name={`reply-visibility-${messageId}`}
              value="private"
              checked={visibility === 'private'}
              onChange={() => setVisibility('private')}
              className="mt-0.5 h-4 w-4 shrink-0 accent-pastel-500"
            />
            <span>
              <span className="block text-xs font-bold text-ink">Private — hanya pengirim</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-muted">
                Hanya pembuka link private yang bisa melihat.
              </span>
            </span>
          </label>
        </div>
        {visibility === 'private' ? (
          <p className="mt-2 flex items-start gap-1.5 rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Pesan asli akan otomatis menjadi private dan tidak akan muncul di halaman publik.
          </p>
        ) : null}
      </fieldset>

      <Textarea
        label="Tulis balasan..."
        name={`reply-${messageId}`}
        placeholder="Tulis balasan..."
        maxLength={REPLY_MAX}
        value={content}
        autoFocus={autoFocus}
        onChange={(event) => {
          setContent(event.target.value);
          if (error) setError(null);
        }}
        counter={{ current: countChars(content), max: REPLY_MAX }}
        error={error}
        className="min-h-[96px]"
      />

      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            Batal
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={() => void handleSubmit()}
          loading={submitting}
          loadingText="Mengirim…"
          leftIcon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          Balas
        </Button>
      </div>
    </div>
  );
}