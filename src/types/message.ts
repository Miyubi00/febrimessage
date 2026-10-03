import type { MessageAttachmentRow, MessageRow } from './database';

/** A stored message plus everything the UI needs to render it. */
export interface MessageWithMeta {
  message: MessageRow;
  attachments: MessageAttachmentRow[];
  /** Admin reply (child message) when present. */
  reply: MessageRow | null;
  replyAttachments: MessageAttachmentRow[];
  /** Sender public IP (admin inbox only — always null on the public page). */
  senderIp: string | null;
}

/** One row of the public thread list. */
export interface PublicThread {
  id: string;
  senderLabel: string;
  isAnonymous: boolean;
  content: string;
  createdAt: string;
  attachments: MessageAttachmentRow[];
  reply: {
    id: string;
    content: string;
    createdAt: string;
    attachments: MessageAttachmentRow[];
  } | null;
}

/** Result returned by the `upload-message-attachment` Edge Function. */
export interface PendingAttachment {
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
}

/** Client-side attachment staged in the composer before the message is sent. */
export interface StagedAttachment {
  id: string;
  file: File;
  /** Object URL used for the local preview. */
  previewUrl: string;
  progress: number;
  status: 'idle' | 'uploading' | 'uploaded' | 'error';
  error: string | null;
  /** Set once the server stored the file and returned its path. */
  remote: PendingAttachment | null;
}

/** Payload sent to the `submit-message` Edge Function. */
export interface SubmitMessageInput {
  /** Target profile id (single-user app — no username routing). */
  profileId: string;
  senderName: string;
  isAnonymous: boolean;
  content: string;
  honeypot: string;
  captchaToken?: string;
  attachmentPaths: string[];
}

/** Result returned by the `submit-message` Edge Function. */
export interface SubmitMessageResult {
  id: string;
  created_at: string;
  status: string;
}

export interface AdminReplyInput {
  messageId: string;
  content: string;
}

export interface DeleteMessageResult {
  deleted: boolean;
  removedFiles: number;
}

export type MessageFilterStatus = 'all' | 'unread' | 'read' | 'spam' | 'hidden';
export type MessageSort = 'newest' | 'oldest';

export interface AdminMessageQuery {
  profileId: string;
  search: string;
  status: MessageFilterStatus;
  anonymousOnly: boolean;
  withImageOnly: boolean;
  sort: MessageSort;
  page: number;
  pageSize: number;
}

export interface AdminMessagePage {
  items: MessageWithMeta[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}

/** Error shape shared by every Edge Function response. */
export interface ApiErrorBody {
  error: string;
  message: string;
  retryAfter?: number;
}
