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
        Relationships: [
          {
            foreignKeyName: 'clients_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'bookings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'booking_images_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_images_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'documents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'age_verification_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'age_verification_logs_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
