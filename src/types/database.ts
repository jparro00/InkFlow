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
          facebook: string | null;
          dob: string | null;
          channel: 'Facebook' | 'Instagram' | 'Phone' | null;
          tags: string[];
          notes: Json;
          profile_pic: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          created_at?: string;
          name: string;
          display_name?: string | null;
          phone?: string | null;
          instagram?: string | null;
          facebook?: string | null;
          dob?: string | null;
          channel?: 'Facebook' | 'Instagram' | 'Phone' | null;
          tags?: string[];
          notes?: Json;
          profile_pic?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          name?: string;
          display_name?: string | null;
          phone?: string | null;
          instagram?: string | null;
          facebook?: string | null;
          dob?: string | null;
          channel?: 'Facebook' | 'Instagram' | 'Phone' | null;
          tags?: string[];
          notes?: Json;
          profile_pic?: string | null;
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
          end_date: string;
          duration: number;
          is_all_day: boolean;
          blocks_availability: boolean;
          type: string;
          estimate: number | null;
          status: string;
          rescheduled: boolean;
          notes: string | null;
          quick_booking_raw: string | null;
          title: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          created_at?: string;
          client_id?: string | null;
          date: string;
          end_date: string;
          duration: number;
          is_all_day?: boolean;
          blocks_availability?: boolean;
          type: string;
          estimate?: number | null;
          status?: string;
          rescheduled?: boolean;
          notes?: string | null;
          quick_booking_raw?: string | null;
          title?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          client_id?: string | null;
          date?: string;
          end_date?: string;
          duration?: number;
          is_all_day?: boolean;
          blocks_availability?: boolean;
          type?: string;
          estimate?: number | null;
          status?: string;
          rescheduled?: boolean;
          notes?: string | null;
          quick_booking_raw?: string | null;
          title?: string | null;
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
          storage_backend: 'supabase' | 'r2';
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
          storage_backend?: 'supabase' | 'r2';
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
          storage_backend?: 'supabase' | 'r2';
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
          storage_backend: 'supabase' | 'r2';
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
          storage_backend?: 'supabase' | 'r2';
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
          storage_backend?: 'supabase' | 'r2';
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
      feedback: {
        Row: {
          id: string;
          user_id: string;
          feedback: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          feedback: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          feedback?: string;
          created_at?: string;
        };
        Relationships: [];
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
      messages: {
        Row: {
          mid: string;
          conversation_id: string;
          sender_id: string;
          sender_name: string | null;
          recipient_id: string;
          platform: string;
          text: string | null;
          attachments: Json | null;
          created_at: string;
          is_echo: boolean;
          user_id: string;
        };
        Insert: {
          mid: string;
          conversation_id: string;
          sender_id: string;
          sender_name?: string | null;
          recipient_id: string;
          platform: string;
          text?: string | null;
          attachments?: Json | null;
          created_at: string;
          is_echo?: boolean;
          user_id: string;
        };
        Update: {
          mid?: string;
          conversation_id?: string;
          sender_id?: string;
          sender_name?: string | null;
          recipient_id?: string;
          platform?: string;
          text?: string | null;
          attachments?: Json | null;
          created_at?: string;
          is_echo?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_reads: {
        Row: {
          user_id: string;
          conversation_id: string;
          last_read_mid: string;
        };
        Insert: {
          user_id: string;
          conversation_id: string;
          last_read_mid: string;
        };
        Update: {
          user_id?: string;
          conversation_id?: string;
          last_read_mid?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_reads_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_map: {
        Row: {
          conversation_id: string;
          graph_conversation_id: string;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          graph_conversation_id: string;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          graph_conversation_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_map_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      participant_profiles: {
        Row: {
          psid: string;
          user_id: string;
          name: string | null;
          profile_pic: string | null;
          profile_pic_backend: 'supabase' | 'r2';
          platform: string | null;
          updated_at: string;
        };
        Insert: {
          psid: string;
          user_id: string;
          name?: string | null;
          profile_pic?: string | null;
          profile_pic_backend?: 'supabase' | 'r2';
          platform?: string | null;
          updated_at?: string;
        };
        Update: {
          psid?: string;
          user_id?: string;
          name?: string | null;
          profile_pic?: string | null;
          profile_pic_backend?: 'supabase' | 'r2';
          platform?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'participant_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_settings: {
        Row: {
          user_id: string;
          anthropic_key: string | null;
          has_api_key: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          anthropic_key?: string | null;
          has_api_key?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          anthropic_key?: string | null;
          has_api_key?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      device_trusts: {
        Row: {
          id: string;
          user_id: string;
          device_id: string;
          device_name: string | null;
          created_at: string;
          last_used: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          device_id: string;
          device_name?: string | null;
          created_at?: string;
          last_used?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          device_id?: string;
          device_name?: string | null;
          created_at?: string;
          last_used?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'device_trusts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      verification_codes: {
        Row: {
          id: string;
          user_id: string;
          code: string;
          expires_at: string;
          used: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          code: string;
          expires_at: string;
          used?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          code?: string;
          expires_at?: string;
          used?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'verification_codes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      consent_submissions: {
        Row: {
          id: string;
          user_id: string;
          status: 'submitted' | 'approved_pending' | 'finalized';
          license_image_key: string | null;
          license_first_name: string | null;
          license_last_name: string | null;
          license_dob: string | null;
          license_number: string | null;
          license_address: string | null;
          license_state: string | null;
          license_expiry: string | null;
          license_raw_data: Json | null;
          form_data: Json;
          signature_image_key: string | null;
          pdf_key: string | null;
          pdf_sha256: string | null;
          booking_id: string | null;
          payment_type: string | null;
          payment_amount: number | null;
          payment_tip: number | null;
          tattoo_location: string | null;
          tattoo_description: string | null;
          submitted_at: string;
          approved_at: string | null;
          finalized_at: string | null;
          client_ip: string | null;
          client_user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: 'submitted' | 'approved_pending' | 'finalized';
          license_image_key?: string | null;
          license_first_name?: string | null;
          license_last_name?: string | null;
          license_dob?: string | null;
          license_number?: string | null;
          license_address?: string | null;
          license_state?: string | null;
          license_expiry?: string | null;
          license_raw_data?: Json | null;
          form_data?: Json;
          signature_image_key?: string | null;
          pdf_key?: string | null;
          pdf_sha256?: string | null;
          booking_id?: string | null;
          payment_type?: string | null;
          payment_amount?: number | null;
          payment_tip?: number | null;
          tattoo_location?: string | null;
          tattoo_description?: string | null;
          submitted_at?: string;
          approved_at?: string | null;
          finalized_at?: string | null;
          client_ip?: string | null;
          client_user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: 'submitted' | 'approved_pending' | 'finalized';
          license_image_key?: string | null;
          license_first_name?: string | null;
          license_last_name?: string | null;
          license_dob?: string | null;
          license_number?: string | null;
          license_address?: string | null;
          license_state?: string | null;
          license_expiry?: string | null;
          license_raw_data?: Json | null;
          form_data?: Json;
          signature_image_key?: string | null;
          pdf_key?: string | null;
          pdf_sha256?: string | null;
          booking_id?: string | null;
          payment_type?: string | null;
          payment_amount?: number | null;
          payment_tip?: number | null;
          tattoo_location?: string | null;
          tattoo_description?: string | null;
          submitted_at?: string;
          approved_at?: string | null;
          finalized_at?: string | null;
          client_ip?: string | null;
          client_user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'consent_submissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'consent_submissions_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
        ];
      };
      studio_profiles: {
        Row: {
          user_id: string;
          studio_name: string | null;
          logo_svg: string | null;
          accent_color: string | null;
          bg_color: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          studio_name?: string | null;
          logo_svg?: string | null;
          accent_color?: string | null;
          bg_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          studio_name?: string | null;
          logo_svg?: string | null;
          accent_color?: string | null;
          bg_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'studio_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
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
