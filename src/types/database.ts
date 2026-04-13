export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          name: string;
          display_name: string | null;
          phone: string | null;
          instagram: string | null;
          facebook_id: string | null;
          email: string | null;
          dob: string | null;
          channel: 'Facebook' | 'Instagram' | 'Phone' | null;
          tags: string[];
          notes: Json;
        };
        Insert: {
          id?: string;
          user_id?: string;
          created_at?: string;
          name: string;
          display_name?: string | null;
          phone?: string | null;
          instagram?: string | null;
          facebook_id?: string | null;
          email?: string | null;
          dob?: string | null;
          channel?: 'Facebook' | 'Instagram' | 'Phone' | null;
          tags?: string[];
          notes?: Json;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          name?: string;
          display_name?: string | null;
          phone?: string | null;
          instagram?: string | null;
          facebook_id?: string | null;
          email?: string | null;
          dob?: string | null;
          channel?: 'Facebook' | 'Instagram' | 'Phone' | null;
          tags?: string[];
          notes?: Json;
        };
      };
      bookings: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          client_id: string | null;
          date: string;
          duration: number;
          type: string;
          estimate: number | null;
          status: string;
          rescheduled: boolean;
          notes: string | null;
          quick_booking_raw: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          created_at?: string;
          client_id?: string | null;
          date: string;
          duration: number;
          type: string;
          estimate?: number | null;
          status?: string;
          rescheduled?: boolean;
          notes?: string | null;
          quick_booking_raw?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          client_id?: string | null;
          date?: string;
          duration?: number;
          type?: string;
          estimate?: number | null;
          status?: string;
          rescheduled?: boolean;
          notes?: string | null;
          quick_booking_raw?: string | null;
        };
      };
      booking_images: {
        Row: {
          id: string;
          user_id: string;
          booking_id: string;
          created_at: string;
          filename: string;
          mime_type: string;
          size_bytes: number;
          width: number;
          height: number;
          sync_status: string;
          remote_path: string | null;
        };
        Insert: {
          id: string;
          user_id?: string;
          booking_id: string;
          created_at?: string;
          filename: string;
          mime_type: string;
          size_bytes: number;
          width: number;
          height: number;
          sync_status?: string;
          remote_path?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          booking_id?: string;
          created_at?: string;
          filename?: string;
          mime_type?: string;
          size_bytes?: number;
          width?: number;
          height?: number;
          sync_status?: string;
          remote_path?: string | null;
        };
      };
      documents: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          client_id: string;
          booking_id: string | null;
          type: string;
          label: string | null;
          storage_path: string;
          is_sensitive: boolean;
          mime_type: string | null;
          size_bytes: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          created_at?: string;
          client_id: string;
          booking_id?: string | null;
          type: string;
          label?: string | null;
          storage_path: string;
          is_sensitive?: boolean;
          mime_type?: string | null;
          size_bytes?: number | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          client_id?: string;
          booking_id?: string | null;
          type?: string;
          label?: string | null;
          storage_path?: string;
          is_sensitive?: boolean;
          mime_type?: string | null;
          size_bytes?: number | null;
          notes?: string | null;
        };
      };
      age_verification_logs: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          client_id: string;
          verified_at: string;
          verified_by: string;
          document_deleted: boolean;
          notes: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          created_at?: string;
          client_id: string;
          verified_at: string;
          verified_by: string;
          document_deleted?: boolean;
          notes?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          client_id?: string;
          verified_at?: string;
          verified_by?: string;
          document_deleted?: boolean;
          notes?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
