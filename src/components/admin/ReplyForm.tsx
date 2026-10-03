import { Send } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { toFriendlyMessage } from '@/lib/errors';
import { REPLY_MAX, countChars, sanitizeMultiline, validateMessageContent } from '@/lib/validation';
import { replyToMessage } from '@/services/adminService';
import type { MessageRow } from '@/types/database';

interface ReplyFormProps {
  messageId: string;
  onReplied: (reply: MessageRow) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Admin reply composer. The reply is stored with `parent_id = messageId`, which
 * is what turns it into a thread server-side.
 */
export function ReplyForm({
  messageId,
  onReplied,
  onCancel,
  autoFocus = false,
  className,
}: ReplyFormProps): JSX.Element {
  const { push } = useToast();
  const [content, setContent] = useState('');
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