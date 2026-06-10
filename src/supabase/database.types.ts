// Generated Supabase Database types — do NOT edit by hand.
// Regenerate with the Supabase MCP generate_typescript_types tool (or
// supabase gen types typescript) after schema migrations, and commit
// the diff alongside the migration that caused it.
// Source of truth: the live project schema (Debt #2).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      booking_capacity_audit: {
        Row: {
          auth_uid: string | null
          booking_date: string
          booking_id: string
          created_at: string
          id: string
          is_staff: boolean | null
          op: string
          session_replication_role: string | null
          size: string | null
          slot: string
          staff_capacity_override: boolean | null
          status: string | null
          v_enforce: boolean | null
          v_max_seats: number | null
          v_override: boolean | null
          v_seats_needed: number | null
          v_seats_used_array: number[] | null
          v_used: number | null
        }
        Insert: {
          auth_uid?: string | null
          booking_date: string
          booking_id: string
          created_at?: string
          id?: string
          is_staff?: boolean | null
          op: string
          session_replication_role?: string | null
          size?: string | null
          slot: string
          staff_capacity_override?: boolean | null
          status?: string | null
          v_enforce?: boolean | null
          v_max_seats?: number | null
          v_override?: boolean | null
          v_seats_needed?: number | null
          v_seats_used_array?: number[] | null
          v_used?: number | null
        }
        Update: {
          auth_uid?: string | null
          booking_date?: string
          booking_id?: string
          created_at?: string
          id?: string
          is_staff?: boolean | null
          op?: string
          session_replication_role?: string | null
          size?: string | null
          slot?: string
          staff_capacity_override?: boolean | null
          status?: string | null
          v_enforce?: boolean | null
          v_max_seats?: number | null
          v_override?: boolean | null
          v_seats_needed?: number | null
          v_seats_used_array?: number[] | null
          v_used?: number | null
        }
        Relationships: []
      }
      booking_events: {
        Row: {
          booking_date: string | null
          booking_id: string | null
          cancel_reason: string | null
          customer_name: string | null
          dog_breed: string | null
          dog_name: string | null
          event_type: string
          id: string
          occurred_at: string
          previous_booking_date: string | null
          previous_slot: string | null
          service: string | null
          slot: string | null
        }
        Insert: {
          booking_date?: string | null
          booking_id?: string | null
          cancel_reason?: string | null
          customer_name?: string | null
          dog_breed?: string | null
          dog_name?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          previous_booking_date?: string | null
          previous_slot?: string | null
          service?: string | null
          slot?: string | null
        }
        Update: {
          booking_date?: string | null
          booking_id?: string | null
          cancel_reason?: string | null
          customer_name?: string | null
          dog_breed?: string | null
          dog_name?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          previous_booking_date?: string | null
          previous_slot?: string | null
          service?: string | null
          slot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          addons: string[] | null
          booking_date: string
          breed_snapshot: string | null
          cancel_reason: string | null
          chain_id: string | null
          confirmed: boolean | null
          created_at: string | null
          deposit_amount: number | null
          dog_id: string
          dog_name_snapshot: string | null
          group_id: string | null
          id: string
          notes: string | null
          owner_name_snapshot: string | null
          payment: string | null
          pickup_by_id: string | null
          reminder_confirmed_at: string | null
          service: string
          size: string
          slot: string
          source: string | null
          staff_capacity_override: boolean
          staff_capacity_override_at: string | null
          staff_capacity_override_by: string | null
          status: string
          updated_at: string | null
          whatsapp_conversation_id: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          addons?: string[] | null
          booking_date: string
          breed_snapshot?: string | null
          cancel_reason?: string | null
          chain_id?: string | null
          confirmed?: boolean | null
          created_at?: string | null
          deposit_amount?: number | null
          dog_id: string
          dog_name_snapshot?: string | null
          group_id?: string | null
          id?: string
          notes?: string | null
          owner_name_snapshot?: string | null
          payment?: string | null
          pickup_by_id?: string | null
          reminder_confirmed_at?: string | null
          service: string
          size: string
          slot: string
          source?: string | null
          staff_capacity_override?: boolean
          staff_capacity_override_at?: string | null
          staff_capacity_override_by?: string | null
          status?: string
          updated_at?: string | null
          whatsapp_conversation_id?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          addons?: string[] | null
          booking_date?: string
          breed_snapshot?: string | null
          cancel_reason?: string | null
          chain_id?: string | null
          confirmed?: boolean | null
          created_at?: string | null
          deposit_amount?: number | null
          dog_id?: string
          dog_name_snapshot?: string | null
          group_id?: string | null
          id?: string
          notes?: string | null
          owner_name_snapshot?: string | null
          payment?: string | null
          pickup_by_id?: string | null
          reminder_confirmed_at?: string | null
          service?: string
          size?: string
          slot?: string
          source?: string | null
          staff_capacity_override?: boolean
          staff_capacity_override_at?: string | null
          staff_capacity_override_by?: string | null
          status?: string
          updated_at?: string | null
          whatsapp_conversation_id?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_pickup_by_id_fkey"
            columns: ["pickup_by_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_whatsapp_conversation_id_fkey"
            columns: ["whatsapp_conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_whatsapp_message_id_fkey"
            columns: ["whatsapp_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_feed_tokens: {
        Row: {
          created_at: string | null
          expires_at: string | null
          feed_type: string
          human_id: string | null
          id: string
          is_active: boolean | null
          last_accessed: string | null
          staff_user_id: string | null
          token: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          feed_type: string
          human_id?: string | null
          id?: string
          is_active?: boolean | null
          last_accessed?: string | null
          staff_user_id?: string | null
          token: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          feed_type?: string
          human_id?: string | null
          id?: string
          is_active?: boolean | null
          last_accessed?: string | null
          staff_user_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_feed_tokens_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_phone_lookup_attempts: {
        Row: {
          attempted_at: string
          ip: string
        }
        Insert: {
          attempted_at?: string
          ip: string
        }
        Update: {
          attempted_at?: string
          ip?: string
        }
        Relationships: []
      }
      dashboard_summary_cache: {
        Row: {
          awaiting_count: number
          computed_against: string
          key: string
          summary: string
          updated_at: string
        }
        Insert: {
          awaiting_count?: number
          computed_against: string
          key: string
          summary: string
          updated_at?: string
        }
        Update: {
          awaiting_count?: number
          computed_against?: string
          key?: string
          summary?: string
          updated_at?: string
        }
        Relationships: []
      }
      data_access_log: {
        Row: {
          action: string
          created_at: string | null
          detail: string | null
          id: string
          record_id: string | null
          staff_user_id: string
          table_name: string
        }
        Insert: {
          action: string
          created_at?: string | null
          detail?: string | null
          id?: string
          record_id?: string | null
          staff_user_id: string
          table_name: string
        }
        Update: {
          action?: string
          created_at?: string | null
          detail?: string | null
          id?: string
          record_id?: string | null
          staff_user_id?: string
          table_name?: string
        }
        Relationships: []
      }
      day_settings: {
        Row: {
          extra_slots: string[] | null
          id: string
          is_open: boolean | null
          overrides: Json | null
          setting_date: string
          updated_at: string | null
        }
        Insert: {
          extra_slots?: string[] | null
          id?: string
          is_open?: boolean | null
          overrides?: Json | null
          setting_date: string
          updated_at?: string | null
        }
        Update: {
          extra_slots?: string[] | null
          id?: string
          is_open?: boolean | null
          overrides?: Json | null
          setting_date?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      dogs: {
        Row: {
          age: string | null
          alerts: string[] | null
          archived_at: string | null
          breed: string | null
          colour: string | null
          created_at: string | null
          custom_price: number | null
          dob: string | null
          groom_notes: string | null
          human_id: string
          id: string
          microchip: string | null
          name: string
          neutered: boolean | null
          sex: string | null
          size: string | null
          updated_at: string | null
          vet: string | null
        }
        Insert: {
          age?: string | null
          alerts?: string[] | null
          archived_at?: string | null
          breed?: string | null
          colour?: string | null
          created_at?: string | null
          custom_price?: number | null
          dob?: string | null
          groom_notes?: string | null
          human_id: string
          id?: string
          microchip?: string | null
          name: string
          neutered?: boolean | null
          sex?: string | null
          size?: string | null
          updated_at?: string | null
          vet?: string | null
        }
        Update: {
          age?: string | null
          alerts?: string[] | null
          archived_at?: string | null
          breed?: string | null
          colour?: string | null
          created_at?: string | null
          custom_price?: number | null
          dob?: string | null
          groom_notes?: string | null
          human_id?: string
          id?: string
          microchip?: string | null
          name?: string
          neutered?: boolean | null
          sex?: string | null
          size?: string | null
          updated_at?: string | null
          vet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dogs_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      groom_photos: {
        Row: {
          booking_id: string | null
          created_at: string | null
          dog_id: string
          id: string
          notes: string | null
          storage_path: string
          taken_at: string
          updated_at: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          dog_id: string
          id?: string
          notes?: string | null
          storage_path: string
          taken_at?: string
          updated_at?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          dog_id?: string
          id?: string
          notes?: string | null
          storage_path?: string
          taken_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groom_photos_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groom_photos_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      human_trusted_contacts: {
        Row: {
          created_at: string | null
          human_id: string
          relationship: string | null
          trusted_id: string
        }
        Insert: {
          created_at?: string | null
          human_id: string
          relationship?: string | null
          trusted_id: string
        }
        Update: {
          created_at?: string | null
          human_id?: string
          relationship?: string | null
          trusted_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "human_trusted_contacts_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_trusted_contacts_trusted_id_fkey"
            columns: ["trusted_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      humans: {
        Row: {
          address: string | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          created_at: string | null
          customer_notes: string
          customer_user_id: string | null
          email: string | null
          email_opted_out: boolean
          email_opted_out_at: string | null
          email_opted_out_reason: string | null
          fb: string | null
          history_flag: string | null
          id: string
          insta: string | null
          name: string
          notes: string | null
          phone: string | null
          phone_normalised: string | null
          policies_accepted_at: string | null
          policies_version: string | null
          postcode: string | null
          preferred_channel: string | null
          reminder_channels: Json | null
          reminder_hours: number | null
          signup_submitted_at: string | null
          sms: boolean | null
          sms_opted_out: boolean
          sms_opted_out_at: string | null
          sms_opted_out_reason: string | null
          source: string | null
          surname: string | null
          tiktok: string | null
          updated_at: string | null
          whatsapp: boolean | null
          whatsapp_opted_out: boolean
          whatsapp_opted_out_at: string | null
          whatsapp_opted_out_reason: string | null
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          created_at?: string | null
          customer_notes?: string
          customer_user_id?: string | null
          email?: string | null
          email_opted_out?: boolean
          email_opted_out_at?: string | null
          email_opted_out_reason?: string | null
          fb?: string | null
          history_flag?: string | null
          id?: string
          insta?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          phone_normalised?: string | null
          policies_accepted_at?: string | null
          policies_version?: string | null
          postcode?: string | null
          preferred_channel?: string | null
          reminder_channels?: Json | null
          reminder_hours?: number | null
          signup_submitted_at?: string | null
          sms?: boolean | null
          sms_opted_out?: boolean
          sms_opted_out_at?: string | null
          sms_opted_out_reason?: string | null
          source?: string | null
          surname?: string | null
          tiktok?: string | null
          updated_at?: string | null
          whatsapp?: boolean | null
          whatsapp_opted_out?: boolean
          whatsapp_opted_out_at?: string | null
          whatsapp_opted_out_reason?: string | null
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          created_at?: string | null
          customer_notes?: string
          customer_user_id?: string | null
          email?: string | null
          email_opted_out?: boolean
          email_opted_out_at?: string | null
          email_opted_out_reason?: string | null
          fb?: string | null
          history_flag?: string | null
          id?: string
          insta?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          phone_normalised?: string | null
          policies_accepted_at?: string | null
          policies_version?: string | null
          postcode?: string | null
          preferred_channel?: string | null
          reminder_channels?: Json | null
          reminder_hours?: number | null
          signup_submitted_at?: string | null
          sms?: boolean | null
          sms_opted_out?: boolean
          sms_opted_out_at?: string | null
          sms_opted_out_reason?: string | null
          source?: string | null
          surname?: string | null
          tiktok?: string | null
          updated_at?: string | null
          whatsapp?: boolean | null
          whatsapp_opted_out?: boolean
          whatsapp_opted_out_at?: string | null
          whatsapp_opted_out_reason?: string | null
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          booking_id: string | null
          channel: string
          created_at: string | null
          error_message: string | null
          group_id: string | null
          human_id: string | null
          id: string
          sent_at: string | null
          status: string
          trigger_type: string
        }
        Insert: {
          booking_id?: string | null
          channel: string
          created_at?: string | null
          error_message?: string | null
          group_id?: string | null
          human_id?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          trigger_type: string
        }
        Update: {
          booking_id?: string | null
          channel?: string
          created_at?: string | null
          error_message?: string | null
          group_id?: string | null
          human_id?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_config: {
        Row: {
          default_pickup_offset: number | null
          enforce_capacity: boolean | null
          enforce_server_capacity: boolean | null
          id: string
          large_dog_slots: Json
          pricing: Json
          settings: Json
          updated_at: string | null
          whatsapp_provider: string
        }
        Insert: {
          default_pickup_offset?: number | null
          enforce_capacity?: boolean | null
          enforce_server_capacity?: boolean | null
          id?: string
          large_dog_slots?: Json
          pricing?: Json
          settings?: Json
          updated_at?: string | null
          whatsapp_provider?: string
        }
        Update: {
          default_pickup_offset?: number | null
          enforce_capacity?: boolean | null
          enforce_server_capacity?: boolean | null
          id?: string
          large_dog_slots?: Json
          pricing?: Json
          settings?: Json
          updated_at?: string | null
          whatsapp_provider?: string
        }
        Relationships: []
      }
      salon_todos: {
        Row: {
          created_at: string
          done: boolean
          human_id: string | null
          id: string
          kind: string
          sort_order: number
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          human_id?: string | null
          id?: string
          kind?: string
          sort_order?: number
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          human_id?: string | null
          id?: string
          kind?: string
          sort_order?: number
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salon_todos_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          phone: string | null
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          created_at: string | null
          human_id: string
          id: string
          target_date: string
        }
        Insert: {
          created_at?: string | null
          human_id: string
          id?: string
          target_date: string
        }
        Update: {
          created_at?: string | null
          human_id?: string
          id?: string
          target_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_booking_actions: {
        Row: {
          action: string
          applied_at: string | null
          applied_booking_id: string | null
          conversation_id: string
          created_at: string
          customer_confirm_expires_at: string | null
          customer_confirm_message_id: string | null
          decided_at: string | null
          decided_by: string | null
          draft_id: string | null
          error_message: string | null
          id: string
          payload: Json
          rejection_reason: string | null
          state: string
          target_booking_id: string | null
          updated_at: string
        }
        Insert: {
          action: string
          applied_at?: string | null
          applied_booking_id?: string | null
          conversation_id: string
          created_at?: string
          customer_confirm_expires_at?: string | null
          customer_confirm_message_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          draft_id?: string | null
          error_message?: string | null
          id?: string
          payload: Json
          rejection_reason?: string | null
          state?: string
          target_booking_id?: string | null
          updated_at?: string
        }
        Update: {
          action?: string
          applied_at?: string | null
          applied_booking_id?: string | null
          conversation_id?: string
          created_at?: string
          customer_confirm_expires_at?: string | null
          customer_confirm_message_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          draft_id?: string | null
          error_message?: string | null
          id?: string
          payload?: Json
          rejection_reason?: string | null
          state?: string
          target_booking_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_booking_actions_applied_booking_id_fkey"
            columns: ["applied_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_actions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_actions_target_booking_id_fkey"
            columns: ["target_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          agent_state: Json
          auto_send_enabled: boolean
          autonomous_booking_enabled: boolean
          channel: string
          closed_at: string | null
          closed_by: string | null
          closure_reason: string | null
          closure_suggested_at: string | null
          closure_suggested_reason: string | null
          created_at: string
          human_id: string | null
          id: string
          last_customer_text: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          lead_payload: Json | null
          lead_status: string | null
          locale: string
          notes: string | null
          phone_e164: string
          snoozed_until: string | null
          state: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          agent_state?: Json
          auto_send_enabled?: boolean
          autonomous_booking_enabled?: boolean
          channel?: string
          closed_at?: string | null
          closed_by?: string | null
          closure_reason?: string | null
          closure_suggested_at?: string | null
          closure_suggested_reason?: string | null
          created_at?: string
          human_id?: string | null
          id?: string
          last_customer_text?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          lead_payload?: Json | null
          lead_status?: string | null
          locale?: string
          notes?: string | null
          phone_e164: string
          snoozed_until?: string | null
          state?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          agent_state?: Json
          auto_send_enabled?: boolean
          autonomous_booking_enabled?: boolean
          channel?: string
          closed_at?: string | null
          closed_by?: string | null
          closure_reason?: string | null
          closure_suggested_at?: string | null
          closure_suggested_reason?: string | null
          created_at?: string
          human_id?: string | null
          id?: string
          last_customer_text?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          lead_payload?: Json | null
          lead_status?: string | null
          locale?: string
          notes?: string | null
          phone_e164?: string
          snoozed_until?: string | null
          state?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_drafts: {
        Row: {
          auto_send_eligible: boolean
          confidence: number
          conversation_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          edited_text: string | null
          handoff_required: boolean
          id: string
          intent: string
          model: string | null
          proposed_text: string
          rejected_reason: string | null
          requires_approval: boolean
          risk_level: string
          state: string
          tokens_input: number | null
          tokens_output: number | null
          tool_calls: Json | null
          trigger_message_id: string | null
          updated_at: string
        }
        Insert: {
          auto_send_eligible?: boolean
          confidence: number
          conversation_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          edited_text?: string | null
          handoff_required?: boolean
          id?: string
          intent: string
          model?: string | null
          proposed_text: string
          rejected_reason?: string | null
          requires_approval?: boolean
          risk_level?: string
          state?: string
          tokens_input?: number | null
          tokens_output?: number | null
          tool_calls?: Json | null
          trigger_message_id?: string | null
          updated_at?: string
        }
        Update: {
          auto_send_eligible?: boolean
          confidence?: number
          conversation_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          edited_text?: string | null
          handoff_required?: boolean
          id?: string
          intent?: string
          model?: string | null
          proposed_text?: string
          rejected_reason?: string | null
          requires_approval?: boolean
          risk_level?: string
          state?: string
          tokens_input?: number | null
          tokens_output?: number | null
          tool_calls?: Json | null
          trigger_message_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_drafts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_drafts_trigger_message_id_fkey"
            columns: ["trigger_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_events: {
        Row: {
          error_message: string | null
          event_type: string | null
          id: string
          meta_message_id: string | null
          payload: Json
          phone_e164: string | null
          processed_at: string | null
          processing_status: string
          received_at: string
          signature: string | null
          signature_valid: boolean
        }
        Insert: {
          error_message?: string | null
          event_type?: string | null
          id?: string
          meta_message_id?: string | null
          payload: Json
          phone_e164?: string | null
          processed_at?: string | null
          processing_status?: string
          received_at?: string
          signature?: string | null
          signature_valid: boolean
        }
        Update: {
          error_message?: string | null
          event_type?: string | null
          id?: string
          meta_message_id?: string | null
          payload?: Json
          phone_e164?: string | null
          processed_at?: string | null
          processing_status?: string
          received_at?: string
          signature?: string | null
          signature_valid?: boolean
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          channel: string
          content: string | null
          conversation_id: string
          delivered_at: string | null
          direction: string
          error_message: string | null
          event_id: string | null
          id: string
          in_reply_to_meta_id: string | null
          meta_message_id: string | null
          raw: Json | null
          reaction_emoji: string | null
          read_at: string | null
          role: string
          sent_at: string
          status: string
        }
        Insert: {
          channel?: string
          content?: string | null
          conversation_id: string
          delivered_at?: string | null
          direction: string
          error_message?: string | null
          event_id?: string | null
          id?: string
          in_reply_to_meta_id?: string | null
          meta_message_id?: string | null
          raw?: Json | null
          reaction_emoji?: string | null
          read_at?: string | null
          role: string
          sent_at?: string
          status?: string
        }
        Update: {
          channel?: string
          content?: string | null
          conversation_id?: string
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          event_id?: string | null
          id?: string
          in_reply_to_meta_id?: string | null
          meta_message_id?: string | null
          raw?: Json | null
          reaction_emoji?: string | null
          read_at?: string | null
          role?: string
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_events"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          category: string
          components: Json
          created_at: string
          id: string
          language: string
          meta_id: string | null
          name: string
          rejection_reason: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          category: string
          components: Json
          created_at?: string
          id?: string
          language?: string
          meta_id?: string | null
          name: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          category?: string
          components?: Json
          created_at?: string
          id?: string
          language?: string
          meta_id?: string | null
          name?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_slots: { Args: never; Returns: string[] }
      add_customer_trusted_human: {
        Args: {
          p_name: string
          p_phone: string
          p_relationship?: string
          p_surname: string
        }
        Returns: {
          id: string
          name: string
          phone: string
          relationship: string
          surname: string
        }[]
      }
      apply_whatsapp_booking_action: {
        Args: { p_action_id: string }
        Returns: string
      }
      approve_customer_signup: {
        Args: { p_human_id: string }
        Returns: undefined
      }
      booking_event_party: {
        Args: { p_booking: Database["public"]["Tables"]["bookings"]["Row"] }
        Returns: {
          customer_name: string
          dog_breed: string
          dog_name: string
        }[]
      }
      create_customer_booking_group: {
        Args: { p_booking_date: string; p_bookings: Json }
        Returns: {
          id: string
        }[]
      }
      create_pending_customer: {
        Args: never
        Returns: {
          id: string
        }[]
      }
      customer_phone_login_state: {
        Args: { p_phone: string }
        Returns: {
          has_password: boolean
          on_file: boolean
        }[]
      }
      customer_phone_lookup_attempts_cleanup: {
        Args: never
        Returns: undefined
      }
      customer_phone_lookup_rate_limit: {
        Args: {
          p_ip: string
          p_max_attempts?: number
          p_window_seconds?: number
        }
        Returns: boolean
      }
      customer_phone_on_file: { Args: { p_phone: string }; Returns: boolean }
      get_large_dog_day_availability: {
        Args: { p_from: string; p_to: string }
        Returns: {
          booking_date: string
          has_capacity: boolean
        }[]
      }
      get_max_seats_for_slot: {
        Args: { p_seats_used: number[]; p_slot_index: number }
        Returns: number
      }
      get_my_role: { Args: never; Returns: string }
      get_open_days: {
        Args: { p_end: string; p_start: string }
        Returns: {
          is_open: boolean
          setting_date: string
        }[]
      }
      get_or_create_calendar_feed_token: {
        Args: { p_feed_type: string }
        Returns: string
      }
      get_seats_needed: {
        Args: { p_size: string; p_slot: string }
        Returns: number
      }
      get_seats_used: {
        Args: { p_date: string; p_exclude_id?: string; p_slot: string }
        Returns: number
      }
      get_slot_occupancy: {
        Args: { p_date: string }
        Returns: {
          size: string
          slot: string
        }[]
      }
      get_small_medium_availability: {
        Args: { p_from: string; p_to: string }
        Returns: {
          booking_date: string
          slot: string
        }[]
      }
      get_supabase_url: { Args: never; Returns: string }
      get_webhook_secret: { Args: never; Returns: string }
      has_large_dog: {
        Args: { p_date: string; p_exclude_id?: string; p_slot: string }
        Returns: boolean
      }
      increment_conversation_unread: {
        Args: { conversation_id: string }
        Returns: undefined
      }
      is_large_dog_slot: { Args: { p_slot: string }; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      large_dog_can_fit_on_day: { Args: { p_date: string }; Returns: boolean }
      large_dog_can_share: { Args: { p_slot: string }; Returns: boolean }
      link_customer_to_human: {
        Args: never
        Returns: {
          address: string
          customer_user_id: string
          email: string
          fb: string
          has_password: boolean
          id: string
          insta: string
          name: string
          phone: string
          sms: boolean
          surname: string
          tiktok: string
          whatsapp: boolean
        }[]
      }
      link_or_create_customer_human: {
        Args: { p_email?: string; p_name?: string; p_phone: string }
        Returns: Json
      }
      mark_reminder_confirmed: {
        Args: { p_human_id: string }
        Returns: string[]
      }
      mark_whatsapp_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      merge_humans: {
        Args: { p_loser: string; p_winner: string }
        Returns: undefined
      }
      prune_abandoned_signups: { Args: never; Returns: number }
      reject_customer_signup: {
        Args: { p_human_id: string; p_reason?: string }
        Returns: undefined
      }
      replace_trusted_contacts: {
        Args: { p_contacts?: Json; p_human_id: string }
        Returns: undefined
      }
      revoke_calendar_feed_token: {
        Args: { p_feed_type: string }
        Returns: undefined
      }
      search_dogs_directory: {
        Args: {
          p_alert?: boolean
          p_incomplete?: boolean
          p_letter?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_size?: string
          p_sort?: string
        }
        Returns: Json
      }
      search_humans_directory: {
        Args: {
          p_flagged?: boolean
          p_letter?: string
          p_limit?: number
          p_no_dogs?: boolean
          p_no_phone?: boolean
          p_offset?: number
          p_pending?: boolean
          p_search?: string
          p_sort?: string
          p_whatsapp?: boolean
        }
        Returns: Json
      }
      submit_customer_signup: {
        Args: { p_dogs: Json; p_owner: Json }
        Returns: undefined
      }
      suggest_conversation_closures: {
        Args: never
        Returns: {
          conversation_id: string
          reason: string
        }[]
      }
      update_customer_dog: {
        Args: {
          p_breed?: string
          p_dob?: string
          p_dog_id: string
          p_name: string
          p_size?: string
        }
        Returns: {
          breed: string
          dob: string
          human_id: string
          id: string
          name: string
          size: string
        }[]
      }
      validate_booking_calendar: {
        Args: { p_booking_date: string; p_slot: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

