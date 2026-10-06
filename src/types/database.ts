/**
 * Hand-maintained Supabase database types (same shape as
 * `supabase gen types typescript`). Keep in sync with `supabase/migrations/*`.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MessageStatus = 'unread' | 'read' | 'deleted';
/** Who wrote a message row: the profile owner or the original sender. */
export type MessageAuthor = 'admin' | 'sender';
export type MessageVisibility = 'public' | 'private';
export type AdminRole = 'admin' | 'superadmin';
export type AllowedImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface Database {
  public: {
    Tables: {
      admin_profiles: {
        Row: { id: string; role: AdminRole; created_at: string };
        Insert: { id: string; role?: AdminRole; created_at?: string };
        Update: { id?: string; role?: AdminRole; created_at?: string };
        Relationships: [];
      };
      app_settings: {
        Row: { key: string; value: string; updated_at: string };
        Insert: { key: string; value?: string; updated_at?: string };
        Update: { key?: string; value?: string; updated_at?: string };
        Relationships: [];
      };
      message_meta: {
        Row: { message_id: string; sender_ip: string | null; created_at: string };
        Insert: { message_id: string; sender_ip?: string | null; created_at?: string };
        Update: { message_id?: string; sender_ip?: string | null; created_at?: string };
        Relationships: [];
      };
      message_attachments: {
        Row: {
          id: string;
          message_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          storage_path?: string;
          file_name?: string;
          mime_type?: string;
          file_size?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          profile_id: string;
          sender_name: string | null;
          is_anonymous: boolean;
          content: string;
          status: MessageStatus;
          /** Thread visibility (root owns it; replies always inherit it). */
          visibility: MessageVisibility;
          /** Legacy mirror of `visibility`, kept in sync by a DB trigger. */
          is_public: boolean;
          parent_id: string | null;
          /** Set on replies: points at the root message of the thread. */
          root_message_id: string | null;
          /** 'sender' for roots + sender follow-ups, 'admin' for owner replies. */
          author: MessageAuthor;
          ip_hash: string | null;
          user_agent_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          sender_name?: string | null;
          is_anonymous?: boolean;
          content: string;
          status?: MessageStatus;
          visibility?: MessageVisibility;
          is_public?: boolean;
          parent_id?: string | null;
          root_message_id?: string | null;
          author?: MessageAuthor;
          ip_hash?: string | null;
          user_agent_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          sender_name?: string | null;
          is_anonymous?: boolean;
          content?: string;
          status?: MessageStatus;
          visibility?: MessageVisibility;
          is_public?: boolean;
          parent_id?: string | null;
          root_message_id?: string | null;
          author?: MessageAuthor;
          ip_hash?: string | null;
          user_agent_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          owner_id: string | null;
          username: string;
          display_name: string;
          description: string | null;
          pronouns: string | null;
          avatar_url: string | null;
          background_url: string | null;
          discord_url: string | null;
          website_url: string | null;
          roblox_url: string | null;
          theme: string;
          is_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          username: string;
          display_name: string;
          description?: string | null;
          pronouns?: string | null;
          avatar_url?: string | null;
          background_url?: string | null;
          discord_url?: string | null;
          website_url?: string | null;
          roblox_url?: string | null;
          theme?: string;
          is_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string | null;
          username?: string;
          display_name?: string;
          description?: string | null;
          pronouns?: string | null;
          avatar_url?: string | null;
          background_url?: string | null;
          discord_url?: string | null;
          website_url?: string | null;
          roblox_url?: string | null;
          theme?: string;
          is_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          id: string;
          ip_hash: string;
          action: string;
          window_start: string;
          request_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ip_hash: string;
          action: string;
          window_start: string;
          request_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ip_hash?: string;
          action?: string;
          window_start?: string;
          request_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      set_thread_visibility: {
        Args: { p_message_id: string; p_visibility: string };
        Returns: string;
      };
      admin_private_link_status: {
        Args: { p_message_id: string };
        Returns: Array<{
          has_token: boolean;
          created_at: string | null;
          revoked_at: string | null;
        }>;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type ProfileRow = Tables<'profiles'>;
export type MessageRow = Tables<'messages'>;
export type MessageAttachmentRow = Tables<'message_attachments'>;
export type AdminProfileRow = Tables<'admin_profiles'>;
export type ProfileUpdate = TablesUpdate<'profiles'>;
export type MessageUpdate = TablesUpdate<'messages'>;
