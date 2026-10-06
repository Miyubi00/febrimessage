import type { MessageAttachmentRow, MessageRow, MessageVisibility } from './database';

/** A stored message plus everything the UI needs to render it. */
export interface MessageWithMeta {
  message: MessageRow;
  attachments: MessageAttachmentRow[];
  /** Full conversation in chronological order (admin + sender turns). */
  replies: ThreadReply[];
  /** Sender public IP (admin inbox only — always null on the public page). */
  senderIp: string | null;
}

/** One reply in a thread with its attachments. */
export interface ThreadReply {
  reply: MessageRow;
  attachments: MessageAttachmentRow[];
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
  attachmentPaths: string[];
}

/** Result returned by the `submit-message` Edge Function. */
export interface SubmitMessageResult {
  id: string;
  created_at: string;
  status: string;
  /**
   * Raw private access token, returned exactly once (spec 44/45). Shown only in
   * the in-memory success panel — never persisted anywhere on the client.
   */
  private_token: string | null;
}

export interface AdminReplyInput {
  messageId: string;
  content: string;
  /** Thread-wide visibility chosen at reply time (spec 49–51). Defaults to public. */
  visibility?: MessageVisibility;
}

export interface DeleteMessageResult {
  deleted: boolean;
  removedFiles: number;
}

export type MessageFilterStatus = 'all' | 'unread' | 'read';
export type MessageSort = 'newest' | 'oldest';
/** Inbox visibility filter (server-side, tri-state). */
export type MessageVisibilityFilter = 'all' | 'public' | 'private';

export interface AdminMessageQuery {
  profileId: string;
  search: string;
  status: MessageFilterStatus;
  visibility: MessageVisibilityFilter;
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

/* ------------------------------------------------------------------ */
/* Private thread (spec 43–67)                                         */
/* ------------------------------------------------------------------ */

/** Sanitised thread returned by the `get-private-message` Edge Function. */
export interface PrivateAttachmentView {
  /** Short-lived signed URL (5 min), resolved server-side after token check. */
  url: string;
  fileName: string;
  mimeType: string;
}

export interface PrivateThreadReply {
  content: string;
  createdAt: string;
  author: 'admin' | 'sender';
  attachments: PrivateAttachmentView[];
}

export interface PrivateThread {
  id: string;
  visibility: MessageVisibility;
  profile: {
    displayName: string;
    username: string;
    avatarUrl: string | null;
    theme: string;
  };
  message: {
    content: string;
    senderName: string;
    isAnonymous: boolean;
    createdAt: string;
  };
  /** Whole conversation, oldest first. */
  replies: PrivateThreadReply[];
  attachments: PrivateAttachmentView[];
  /** Masked subscribed address (`k***@gmail.com`) or null — never the real one. */
  subscribedEmail: string | null;
}

/** Revoke/rotate state of a thread's private link (hash/token never exposed). */
export interface PrivateLinkStatus {
  hasToken: boolean;
  createdAt: string | null;
  revokedAt: string | null;
}

/** Error shape shared by every Edge Function response. */
export interface ApiErrorBody {
  error: string;
  message: string;
  retryAfter?: number;
}
