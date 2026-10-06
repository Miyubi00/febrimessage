import { Send } from 'lucide-react';
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
      <div role="radiogroup" aria-label="Reply visibility" className="mb-3 grid grid-cols-2 gap-2">
        {(
          [
            { value: 'public', label: 'Public' },
            { value: 'private', label: 'Private' },
          ] as const
        ).map((option) => {
          const active = visibility === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-xs font-bold transition ${
                active
                  ? 'border-pastel-400 bg-pastel-50 text-ink shadow-soft'
                  : 'border-pastel-100 text-ink-muted hover:border-pastel-300'
              }`}
            >
              <input
                type="radio"
                name={`reply-visibility-${messageId}`}
                value={option.value}
                checked={active}
                onChange={() => setVisibility(option.value)}
                className="h-4 w-4 shrink-0 accent-pastel-500"
              />
              {option.label}
            </label>
          );
        })}
      </div>

      <Textarea
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