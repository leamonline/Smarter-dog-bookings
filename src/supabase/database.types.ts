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
      ai_whatsapp_settings: {
        Row: {
          enabled: boolean
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
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
          v_daily_cap: number | null
          v_day_count: number | null
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
          v_daily_cap?: number | null
          v_day_count?: number | null
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
          v_daily_cap?: number | null
          v_day_count?: number | null
          v_enforce?: boolean | null
          v_max_seats?: number | null
          v_override?: boolean | null
          v_seats_needed?: number | null
          v_seats_used_array?: number[] | null
          v_used?: number | null
        }
        Relationships: []
      }
      booking_change_destination_reservations: {
        Row: {
          booking_date: string
          consumed_at: string | null
          created_at: string
          destination_hash: string
          human_id: string
          id: string
          proposal_revision: number
          purpose: string
          released_at: string | null
          request_id: string
          slot_assignments: Json
          source_visit_id: string
          state: string
        }
        Insert: {
          booking_date: string
          consumed_at?: string | null
          created_at?: string
          destination_hash: string
          human_id: string
          id?: string
          proposal_revision: number
          purpose: string
          released_at?: string | null
          request_id: string
          slot_assignments: Json
          source_visit_id: string
          state: string
        }
        Update: {
          booking_date?: string
          consumed_at?: string | null
          created_at?: string
          destination_hash?: string
          human_id?: string
          id?: string
          proposal_revision?: number
          purpose?: string
          released_at?: string | null
          request_id?: string
          slot_assignments?: Json
          source_visit_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_change_destination_re_request_id_human_id_source_v_fkey"
            columns: ["request_id", "human_id", "source_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_change_requests"
            referencedColumns: ["id", "human_id", "source_visit_id"]
          },
          {
            foreignKeyName: "booking_change_destination_reservations_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_change_requests: {
        Row: {
          channel: string
          customer_message: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          human_id: string
          id: string
          kind: string
          outcome_key: string | null
          proposed_visit_id: string | null
          provider_message_id: string | null
          reason_code: string
          received_at: string
          requested_at: string
          requested_booking_date: string | null
          requested_destination_hash: string | null
          requested_slot_assignments: Json | null
          review_id: string | null
          revision: number
          source_revision: number | null
          source_visit_id: string
          status: string
          target_booking_id: string | null
        }
        Insert: {
          channel: string
          customer_message?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          human_id: string
          id?: string
          kind: string
          outcome_key?: string | null
          proposed_visit_id?: string | null
          provider_message_id?: string | null
          reason_code: string
          received_at?: string
          requested_at: string
          requested_booking_date?: string | null
          requested_destination_hash?: string | null
          requested_slot_assignments?: Json | null
          review_id?: string | null
          revision?: number
          source_revision?: number | null
          source_visit_id: string
          status: string
          target_booking_id?: string | null
        }
        Update: {
          channel?: string
          customer_message?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          human_id?: string
          id?: string
          kind?: string
          outcome_key?: string | null
          proposed_visit_id?: string | null
          provider_message_id?: string | null
          reason_code?: string
          received_at?: string
          requested_at?: string
          requested_booking_date?: string | null
          requested_destination_hash?: string | null
          requested_slot_assignments?: Json | null
          review_id?: string | null
          revision?: number
          source_revision?: number | null
          source_visit_id?: string
          status?: string
          target_booking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_change_requests_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_change_requests_proposed_visit_id_fkey"
            columns: ["proposed_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_change_requests_proposed_visit_id_fkey"
            columns: ["proposed_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_change_requests_source_visit_id_fkey"
            columns: ["source_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_change_requests_source_visit_id_fkey"
            columns: ["source_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_change_requests_source_visit_id_human_id_fkey"
            columns: ["source_visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id", "human_id"]
          },
          {
            foreignKeyName: "booking_change_requests_source_visit_id_human_id_fkey"
            columns: ["source_visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id", "human_id"]
          },
          {
            foreignKeyName: "booking_change_requests_target_booking_id_fkey"
            columns: ["target_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_customer_contact_events: {
        Row: {
          channel: string
          contacted_at: string
          id: string
          idempotency_key: string
          provider_message_id: string | null
          recorded_at: string
          recorded_by: string | null
          visit_id: string
        }
        Insert: {
          channel: string
          contacted_at: string
          id?: string
          idempotency_key: string
          provider_message_id?: string | null
          recorded_at?: string
          recorded_by?: string | null
          visit_id: string
        }
        Update: {
          channel?: string
          contacted_at?: string
          id?: string
          idempotency_key?: string
          provider_message_id?: string | null
          recorded_at?: string
          recorded_by?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_customer_contact_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_customer_contact_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_denials: {
        Row: {
          alternative_shown: boolean
          alternative_taken: boolean
          created_at: string
          dog_count: number | null
          human_id: string | null
          id: string
          reason_code: string
          reason_detail: string | null
          requested_date: string | null
          service: string | null
          size: string | null
          slot: string | null
          source: string
        }
        Insert: {
          alternative_shown?: boolean
          alternative_taken?: boolean
          created_at?: string
          dog_count?: number | null
          human_id?: string | null
          id?: string
          reason_code?: string
          reason_detail?: string | null
          requested_date?: string | null
          service?: string | null
          size?: string | null
          slot?: string | null
          source?: string
        }
        Update: {
          alternative_shown?: boolean
          alternative_taken?: boolean
          created_at?: string
          dog_count?: number | null
          human_id?: string | null
          id?: string
          reason_code?: string
          reason_detail?: string | null
          requested_date?: string | null
          service?: string | null
          size?: string | null
          slot?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_denials_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_deposit_bank_instruction_versions: {
        Row: {
          account_name: string
          account_number: string
          id: string
          recorded_at: string
          recorded_by: string | null
          sort_code: string
        }
        Insert: {
          account_name: string
          account_number: string
          id?: string
          recorded_at?: string
          recorded_by?: string | null
          sort_code: string
        }
        Update: {
          account_name?: string
          account_number?: string
          id?: string
          recorded_at?: string
          recorded_by?: string | null
          sort_code?: string
        }
        Relationships: []
      }
      booking_deposit_money_reconciliations: {
        Row: {
          amount_pence: number
          human_id: string
          id: string
          opened_at: string
          opened_reason: string
          resolution: string | null
          resolution_event_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          state: string
          visit_id: string
        }
        Insert: {
          amount_pence: number
          human_id: string
          id?: string
          opened_at?: string
          opened_reason: string
          resolution?: string | null
          resolution_event_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          state: string
          visit_id: string
        }
        Update: {
          amount_pence?: number
          human_id?: string
          id?: string
          opened_at?: string
          opened_reason?: string
          resolution?: string | null
          resolution_event_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          state?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_deposit_money_reconciliations_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_deposit_money_reconciliations_resolution_event_id_fkey"
            columns: ["resolution_event_id"]
            isOneToOne: false
            referencedRelation: "booking_financial_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_deposit_money_reconciliations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_deposit_money_reconciliations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_deposit_money_reconciliations_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id", "human_id"]
          },
          {
            foreignKeyName: "booking_deposit_money_reconciliations_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id", "human_id"]
          },
        ]
      }
      booking_deposit_transfer_reservations: {
        Row: {
          amount_pence: number
          applied_at: string | null
          created_at: string
          destination_visit_id: string
          fallback_source_disposition: string
          human_id: string
          id: string
          released_at: string | null
          source_satisfaction_event_id: string
          source_visit_id: string
          state: string
        }
        Insert: {
          amount_pence: number
          applied_at?: string | null
          created_at?: string
          destination_visit_id: string
          fallback_source_disposition: string
          human_id: string
          id?: string
          released_at?: string | null
          source_satisfaction_event_id: string
          source_visit_id: string
          state: string
        }
        Update: {
          amount_pence?: number
          applied_at?: string | null
          created_at?: string
          destination_visit_id?: string
          fallback_source_disposition?: string
          human_id?: string
          id?: string
          released_at?: string | null
          source_satisfaction_event_id?: string
          source_visit_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_deposit_transfer_rese_destination_visit_id_human_i_fkey"
            columns: ["destination_visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id", "human_id"]
          },
          {
            foreignKeyName: "booking_deposit_transfer_rese_destination_visit_id_human_i_fkey"
            columns: ["destination_visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id", "human_id"]
          },
          {
            foreignKeyName: "booking_deposit_transfer_rese_source_satisfaction_event_id_fkey"
            columns: ["source_satisfaction_event_id"]
            isOneToOne: false
            referencedRelation: "booking_financial_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_deposit_transfer_reservat_source_visit_id_human_id_fkey"
            columns: ["source_visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id", "human_id"]
          },
          {
            foreignKeyName: "booking_deposit_transfer_reservat_source_visit_id_human_id_fkey"
            columns: ["source_visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id", "human_id"]
          },
          {
            foreignKeyName: "booking_deposit_transfer_reservations_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          booking_date: string | null
          booking_id: string | null
          cancel_reason: string | null
          committed_at: string | null
          customer_name: string | null
          deadline_at: string | null
          dog_breed: string | null
          dog_name: string | null
          event_type: string
          id: string
          occurred_at: string
          outcome_key: string | null
          policy_code: string | null
          previous_booking_date: string | null
          previous_slot: string | null
          requested_at: string | null
          service: string | null
          slot: string | null
          visit_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          booking_date?: string | null
          booking_id?: string | null
          cancel_reason?: string | null
          committed_at?: string | null
          customer_name?: string | null
          deadline_at?: string | null
          dog_breed?: string | null
          dog_name?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          outcome_key?: string | null
          policy_code?: string | null
          previous_booking_date?: string | null
          previous_slot?: string | null
          requested_at?: string | null
          service?: string | null
          slot?: string | null
          visit_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          booking_date?: string | null
          booking_id?: string | null
          cancel_reason?: string | null
          committed_at?: string | null
          customer_name?: string | null
          deadline_at?: string | null
          dog_breed?: string | null
          dog_name?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          outcome_key?: string | null
          policy_code?: string | null
          previous_booking_date?: string | null
          previous_slot?: string | null
          requested_at?: string | null
          service?: string | null
          slot?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_policy_code_fkey"
            columns: ["policy_code"]
            isOneToOne: false
            referencedRelation: "booking_policy_versions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "booking_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_financial_ledger: {
        Row: {
          actual_paid_at: string | null
          amount_pence: number
          bank_reference: string | null
          due_at: string | null
          event_kind: string
          human_id: string
          id: string
          idempotency_key: string
          reason: string
          recorded_at: string
          recorded_by: string | null
          refund_calendar_coverage_id: string | null
          refund_calendar_source: string | null
          refund_deadline_basis: string | null
          refund_origin: string | null
          related_visit_id: string | null
          settles_event_id: string | null
          visit_id: string | null
        }
        Insert: {
          actual_paid_at?: string | null
          amount_pence: number
          bank_reference?: string | null
          due_at?: string | null
          event_kind: string
          human_id: string
          id?: string
          idempotency_key: string
          reason: string
          recorded_at?: string
          recorded_by?: string | null
          refund_calendar_coverage_id?: string | null
          refund_calendar_source?: string | null
          refund_deadline_basis?: string | null
          refund_origin?: string | null
          related_visit_id?: string | null
          settles_event_id?: string | null
          visit_id?: string | null
        }
        Update: {
          actual_paid_at?: string | null
          amount_pence?: number
          bank_reference?: string | null
          due_at?: string | null
          event_kind?: string
          human_id?: string
          id?: string
          idempotency_key?: string
          reason?: string
          recorded_at?: string
          recorded_by?: string | null
          refund_calendar_coverage_id?: string | null
          refund_calendar_source?: string | null
          refund_deadline_basis?: string | null
          refund_origin?: string | null
          related_visit_id?: string | null
          settles_event_id?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_financial_ledger_coverage_fk"
            columns: ["refund_calendar_coverage_id"]
            isOneToOne: false
            referencedRelation: "booking_refund_calendar_coverage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_financial_ledger_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_financial_ledger_related_visit_id_fkey"
            columns: ["related_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_financial_ledger_related_visit_id_fkey"
            columns: ["related_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_financial_ledger_related_visit_id_human_id_fkey"
            columns: ["related_visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id", "human_id"]
          },
          {
            foreignKeyName: "booking_financial_ledger_related_visit_id_human_id_fkey"
            columns: ["related_visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id", "human_id"]
          },
          {
            foreignKeyName: "booking_financial_ledger_settles_event_id_fkey"
            columns: ["settles_event_id"]
            isOneToOne: false
            referencedRelation: "booking_financial_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_financial_ledger_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_financial_ledger_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_financial_ledger_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id", "human_id"]
          },
          {
            foreignKeyName: "booking_financial_ledger_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id", "human_id"]
          },
        ]
      }
      booking_funnel_events: {
        Row: {
          created_at: string
          dog_count: number | null
          human_id: string | null
          id: string
          session_id: string
          step: string
        }
        Insert: {
          created_at?: string
          dog_count?: number | null
          human_id?: string | null
          id?: string
          session_id: string
          step: string
        }
        Update: {
          created_at?: string
          dog_count?: number | null
          human_id?: string | null
          id?: string
          session_id?: string
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_funnel_events_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_late_deposit_satisfaction_requests: {
        Row: {
          amount_pence: number
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          due_at_snapshot: string
          human_id: string
          id: string
          requested_at: string
          reservation_id: string
          source_kind: string
          state: string
          terms_accepted_at: string
          terms_publication_id: string
          visit_id: string
        }
        Insert: {
          amount_pence: number
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          due_at_snapshot: string
          human_id: string
          id?: string
          requested_at?: string
          reservation_id: string
          source_kind: string
          state: string
          terms_accepted_at: string
          terms_publication_id: string
          visit_id: string
        }
        Update: {
          amount_pence?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          due_at_snapshot?: string
          human_id?: string
          id?: string
          requested_at?: string
          reservation_id?: string
          source_kind?: string
          state?: string
          terms_accepted_at?: string
          terms_publication_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_late_deposit_satisfaction_req_terms_publication_id_fkey"
            columns: ["terms_publication_id"]
            isOneToOne: false
            referencedRelation: "booking_terms_publication_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_late_deposit_satisfaction_reques_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id", "human_id"]
          },
          {
            foreignKeyName: "booking_late_deposit_satisfaction_reques_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id", "human_id"]
          },
          {
            foreignKeyName: "booking_late_deposit_satisfaction_requests_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_late_deposit_satisfaction_requests_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_late_deposit_satisfaction_requests_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_legacy_money_audit: {
        Row: {
          actor: string
          after_state: Json
          before_state: Json
          classification: string
          created_at: string
          evidence: Json
          id: string
          idempotency_key: string
          reason: string
          row_set_hash: string
          visit_id: string
        }
        Insert: {
          actor: string
          after_state: Json
          before_state: Json
          classification: string
          created_at?: string
          evidence: Json
          id?: string
          idempotency_key: string
          reason: string
          row_set_hash: string
          visit_id: string
        }
        Update: {
          actor?: string
          after_state?: Json
          before_state?: Json
          classification?: string
          created_at?: string
          evidence?: Json
          id?: string
          idempotency_key?: string
          reason?: string
          row_set_hash?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_legacy_money_audit_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_legacy_money_audit_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_lineages: {
        Row: {
          created_at: string
          human_id: string
          id: string
          self_service_reschedule_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          human_id: string
          id?: string
          self_service_reschedule_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          human_id?: string
          id?: string
          self_service_reschedule_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_lineages_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_policy_audit: {
        Row: {
          action: string
          actor_id: string | null
          actor_scope: string
          detail: Json
          human_id: string | null
          id: string
          occurred_at: string
          reason: string | null
          visit_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_scope: string
          detail?: Json
          human_id?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          visit_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_scope?: string
          detail?: Json
          human_id?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_policy_audit_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_policy_audit_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_policy_audit_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_policy_incident_audit: {
        Row: {
          action: string
          actor_id: string
          id: string
          incident_id: string
          occurred_at: string
          reason: string
        }
        Insert: {
          action: string
          actor_id: string
          id?: string
          incident_id: string
          occurred_at?: string
          reason: string
        }
        Update: {
          action?: string
          actor_id?: string
          id?: string
          incident_id?: string
          occurred_at?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_policy_incident_audit_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "booking_policy_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_policy_incidents: {
        Row: {
          appointment_date: string
          human_id: string
          id: string
          kind: string
          reason: string
          recorded_at: string
          recorded_by: string
          revision: number
          visit_id: string
          waived_at: string | null
          waived_by: string | null
          waiver_reason: string | null
        }
        Insert: {
          appointment_date: string
          human_id: string
          id?: string
          kind: string
          reason: string
          recorded_at?: string
          recorded_by: string
          revision?: number
          visit_id: string
          waived_at?: string | null
          waived_by?: string | null
          waiver_reason?: string | null
        }
        Update: {
          appointment_date?: string
          human_id?: string
          id?: string
          kind?: string
          reason?: string
          recorded_at?: string
          recorded_by?: string
          revision?: number
          visit_id?: string
          waived_at?: string | null
          waived_by?: string | null
          waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_policy_incidents_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_policy_incidents_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id", "human_id"]
          },
          {
            foreignKeyName: "booking_policy_incidents_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id", "human_id"]
          },
        ]
      }
      booking_policy_settings: {
        Row: {
          allow_customer_cancellations: boolean
          allow_customer_rescheduling: boolean
          allow_repeat_booking: boolean
          auto_confirm: boolean
          bank_account_name: string | null
          bank_account_number: string | null
          bank_sort_code: string | null
          booking_horizon_days: number
          current_bank_instruction_id: string | null
          current_terms_publication_id: string | null
          customer_intake_enabled: boolean
          deposit_hold_hours: number
          show_customer_history: boolean
          singleton: boolean
          terms_url: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_customer_cancellations?: boolean
          allow_customer_rescheduling?: boolean
          allow_repeat_booking?: boolean
          auto_confirm?: boolean
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_sort_code?: string | null
          booking_horizon_days?: number
          current_bank_instruction_id?: string | null
          current_terms_publication_id?: string | null
          customer_intake_enabled?: boolean
          deposit_hold_hours?: number
          show_customer_history?: boolean
          singleton?: boolean
          terms_url?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_customer_cancellations?: boolean
          allow_customer_rescheduling?: boolean
          allow_repeat_booking?: boolean
          auto_confirm?: boolean
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_sort_code?: string | null
          booking_horizon_days?: number
          current_bank_instruction_id?: string | null
          current_terms_publication_id?: string | null
          customer_intake_enabled?: boolean
          deposit_hold_hours?: number
          show_customer_history?: boolean
          singleton?: boolean
          terms_url?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_policy_settings_current_bank_instruction_id_fkey"
            columns: ["current_bank_instruction_id"]
            isOneToOne: false
            referencedRelation: "booking_deposit_bank_instruction_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_policy_settings_current_terms_publication_id_fkey"
            columns: ["current_terms_publication_id"]
            isOneToOne: false
            referencedRelation: "booking_terms_publication_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_policy_settings_audit: {
        Row: {
          action: string
          actor_id: string | null
          after_state: Json
          before_state: Json
          id: string
          occurred_at: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_state: Json
          before_state: Json
          id?: string
          occurred_at?: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_state?: Json
          before_state?: Json
          id?: string
          occurred_at?: string
          reason?: string | null
        }
        Relationships: []
      }
      booking_policy_versions: {
        Row: {
          change_rule: string
          code: string
          created_at: string
          effective_at: string | null
        }
        Insert: {
          change_rule: string
          code: string
          created_at?: string
          effective_at?: string | null
        }
        Update: {
          change_rule?: string
          code?: string
          created_at?: string
          effective_at?: string | null
        }
        Relationships: []
      }
      booking_refund_calendar_coverage: {
        Row: {
          calendar_source: string
          calendar_version: string
          covers_from: string
          covers_to: string
          id: string
          recorded_at: string
          recorded_by: string | null
        }
        Insert: {
          calendar_source: string
          calendar_version: string
          covers_from: string
          covers_to: string
          id?: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Update: {
          calendar_source?: string
          calendar_version?: string
          covers_from?: string
          covers_to?: string
          id?: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Relationships: []
      }
      booking_refund_non_working_days: {
        Row: {
          calendar_source: string
          holiday_date: string
          label: string
          recorded_at: string
        }
        Insert: {
          calendar_source: string
          holiday_date: string
          label: string
          recorded_at?: string
        }
        Update: {
          calendar_source?: string
          holiday_date?: string
          label?: string
          recorded_at?: string
        }
        Relationships: []
      }
      booking_service_prepayment_reconciliations: {
        Row: {
          amount_pence: number
          evidence: Json
          human_id: string
          id: string
          obligation_event_id: string | null
          opened_at: string
          opened_reason: string
          resolution_reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          state: string
          target_visit_id: string | null
          visit_id: string
        }
        Insert: {
          amount_pence: number
          evidence: Json
          human_id: string
          id?: string
          obligation_event_id?: string | null
          opened_at?: string
          opened_reason: string
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          state: string
          target_visit_id?: string | null
          visit_id: string
        }
        Update: {
          amount_pence?: number
          evidence?: Json
          human_id?: string
          id?: string
          obligation_event_id?: string | null
          opened_at?: string
          opened_reason?: string
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          state?: string
          target_visit_id?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_service_prepayment_reconc_target_visit_id_human_id_fkey"
            columns: ["target_visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id", "human_id"]
          },
          {
            foreignKeyName: "booking_service_prepayment_reconc_target_visit_id_human_id_fkey"
            columns: ["target_visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id", "human_id"]
          },
          {
            foreignKeyName: "booking_service_prepayment_reconciliat_obligation_event_id_fkey"
            columns: ["obligation_event_id"]
            isOneToOne: false
            referencedRelation: "booking_financial_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_service_prepayment_reconciliatio_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id", "human_id"]
          },
          {
            foreignKeyName: "booking_service_prepayment_reconciliatio_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id", "human_id"]
          },
          {
            foreignKeyName: "booking_service_prepayment_reconciliations_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_service_prepayment_reconciliations_target_visit_id_fkey"
            columns: ["target_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_service_prepayment_reconciliations_target_visit_id_fkey"
            columns: ["target_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_service_prepayment_reconciliations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_service_prepayment_reconciliations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_terms_publication_versions: {
        Row: {
          approved_content_sha256: string
          id: string
          public_url: string
          published_at: string
          recorded_at: string
          recorded_by: string
          version_label: string
        }
        Insert: {
          approved_content_sha256: string
          id?: string
          public_url: string
          published_at: string
          recorded_at?: string
          recorded_by: string
          version_label: string
        }
        Update: {
          approved_content_sha256?: string
          id?: string
          public_url?: string
          published_at?: string
          recorded_at?: string
          recorded_by?: string
          version_label?: string
        }
        Relationships: []
      }
      booking_visit_backfill_reconciliation_audit: {
        Row: {
          action: string
          actor: string
          after_state: Json
          before_state: Json
          created_at: string
          id: string
          idempotency_key: string
          payload: Json
          reason: string
          review_key: string
          row_set_hash: string
        }
        Insert: {
          action: string
          actor: string
          after_state: Json
          before_state: Json
          created_at?: string
          id?: string
          idempotency_key: string
          payload: Json
          reason: string
          review_key: string
          row_set_hash: string
        }
        Update: {
          action?: string
          actor?: string
          after_state?: Json
          before_state?: Json
          created_at?: string
          id?: string
          idempotency_key?: string
          payload?: Json
          reason?: string
          review_key?: string
          row_set_hash?: string
        }
        Relationships: []
      }
      booking_visit_deposits: {
        Row: {
          amount_pence: number
          bank_instruction_id: string | null
          bank_received_at: string | null
          customer_payment_reference: string | null
          disposition_event_id: string | null
          due_at: string | null
          exemption_reason: string | null
          origin: string
          recorded_at: string | null
          recorded_by: string | null
          requirement_decided_at: string
          requirement_reason: string | null
          satisfaction_event_id: string | null
          satisfaction_source: string | null
          staff_verification_reference: string | null
          state: string
          terms_accepted_at: string | null
          terms_publication_id: string | null
          updated_at: string
          visit_id: string
        }
        Insert: {
          amount_pence?: number
          bank_instruction_id?: string | null
          bank_received_at?: string | null
          customer_payment_reference?: string | null
          disposition_event_id?: string | null
          due_at?: string | null
          exemption_reason?: string | null
          origin: string
          recorded_at?: string | null
          recorded_by?: string | null
          requirement_decided_at: string
          requirement_reason?: string | null
          satisfaction_event_id?: string | null
          satisfaction_source?: string | null
          staff_verification_reference?: string | null
          state: string
          terms_accepted_at?: string | null
          terms_publication_id?: string | null
          updated_at?: string
          visit_id: string
        }
        Update: {
          amount_pence?: number
          bank_instruction_id?: string | null
          bank_received_at?: string | null
          customer_payment_reference?: string | null
          disposition_event_id?: string | null
          due_at?: string | null
          exemption_reason?: string | null
          origin?: string
          recorded_at?: string | null
          recorded_by?: string | null
          requirement_decided_at?: string
          requirement_reason?: string | null
          satisfaction_event_id?: string | null
          satisfaction_source?: string | null
          staff_verification_reference?: string | null
          state?: string
          terms_accepted_at?: string | null
          terms_publication_id?: string | null
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_visit_deposits_bank_instruction_id_fkey"
            columns: ["bank_instruction_id"]
            isOneToOne: false
            referencedRelation: "booking_deposit_bank_instruction_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_visit_deposits_disposition_event_id_fkey"
            columns: ["disposition_event_id"]
            isOneToOne: false
            referencedRelation: "booking_financial_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_visit_deposits_satisfaction_event_id_fkey"
            columns: ["satisfaction_event_id"]
            isOneToOne: false
            referencedRelation: "booking_financial_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_visit_deposits_terms_publication_id_fkey"
            columns: ["terms_publication_id"]
            isOneToOne: false
            referencedRelation: "booking_terms_publication_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_visit_deposits_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_visit_deposits_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_visit_service_payments: {
        Row: {
          actual_paid_at: string
          amount_pence: number
          bill_revision: number
          human_id: string
          id: string
          idempotency_key: string
          payment_method: string
          reason: string
          recorded_at: string
          recorded_by: string | null
          reference: string | null
          visit_id: string
        }
        Insert: {
          actual_paid_at: string
          amount_pence: number
          bill_revision: number
          human_id: string
          id?: string
          idempotency_key: string
          payment_method: string
          reason: string
          recorded_at?: string
          recorded_by?: string | null
          reference?: string | null
          visit_id: string
        }
        Update: {
          actual_paid_at?: string
          amount_pence?: number
          bill_revision?: number
          human_id?: string
          id?: string
          idempotency_key?: string
          payment_method?: string
          reason?: string
          recorded_at?: string
          recorded_by?: string | null
          reference?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_visit_service_payments_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_visit_service_payments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_visit_service_payments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_visit_service_payments_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id", "human_id"]
          },
          {
            foreignKeyName: "booking_visit_service_payments_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id", "human_id"]
          },
        ]
      }
      booking_visits: {
        Row: {
          approval_state: string
          booking_date: string
          cancelled_at: string | null
          commercial_eligibility_at: string | null
          completed_at: string | null
          confirmation_state: string
          confirmed_at: string | null
          continues_cancelled_visit_id: string | null
          created_at: string
          customer_change_deadline_at: string | null
          eligibility_policy_code: string | null
          human_id: string
          id: string
          is_last_minute: boolean
          legacy_compat_key: string | null
          lifecycle_state: string
          lineage_id: string
          policy_code: string | null
          requested_at: string
          revision: number
          row_revision: number
          runtime_generation: string
          source: string
          supersedes_visit_id: string | null
          terms_acknowledgement: string
          terms_notice_at: string | null
          terms_notice_by: string | null
          terms_notice_method: string | null
          terms_publication_id: string | null
          updated_at: string
        }
        Insert: {
          approval_state?: string
          booking_date: string
          cancelled_at?: string | null
          commercial_eligibility_at?: string | null
          completed_at?: string | null
          confirmation_state?: string
          confirmed_at?: string | null
          continues_cancelled_visit_id?: string | null
          created_at?: string
          customer_change_deadline_at?: string | null
          eligibility_policy_code?: string | null
          human_id: string
          id?: string
          is_last_minute?: boolean
          legacy_compat_key?: string | null
          lifecycle_state?: string
          lineage_id: string
          policy_code?: string | null
          requested_at?: string
          revision?: number
          row_revision?: number
          runtime_generation?: string
          source?: string
          supersedes_visit_id?: string | null
          terms_acknowledgement?: string
          terms_notice_at?: string | null
          terms_notice_by?: string | null
          terms_notice_method?: string | null
          terms_publication_id?: string | null
          updated_at?: string
        }
        Update: {
          approval_state?: string
          booking_date?: string
          cancelled_at?: string | null
          commercial_eligibility_at?: string | null
          completed_at?: string | null
          confirmation_state?: string
          confirmed_at?: string | null
          continues_cancelled_visit_id?: string | null
          created_at?: string
          customer_change_deadline_at?: string | null
          eligibility_policy_code?: string | null
          human_id?: string
          id?: string
          is_last_minute?: boolean
          legacy_compat_key?: string | null
          lifecycle_state?: string
          lineage_id?: string
          policy_code?: string | null
          requested_at?: string
          revision?: number
          row_revision?: number
          runtime_generation?: string
          source?: string
          supersedes_visit_id?: string | null
          terms_acknowledgement?: string
          terms_notice_at?: string | null
          terms_notice_by?: string | null
          terms_notice_method?: string | null
          terms_publication_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_visits_continues_cancelled_visit_id_fkey"
            columns: ["continues_cancelled_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_visits_continues_cancelled_visit_id_fkey"
            columns: ["continues_cancelled_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_visits_eligibility_policy_code_fkey"
            columns: ["eligibility_policy_code"]
            isOneToOne: false
            referencedRelation: "booking_policy_versions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "booking_visits_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_visits_lineage_id_human_id_fkey"
            columns: ["lineage_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_lineages"
            referencedColumns: ["id", "human_id"]
          },
          {
            foreignKeyName: "booking_visits_policy_code_fkey"
            columns: ["policy_code"]
            isOneToOne: false
            referencedRelation: "booking_policy_versions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "booking_visits_supersedes_visit_id_fkey"
            columns: ["supersedes_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_visits_supersedes_visit_id_fkey"
            columns: ["supersedes_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_visits_terms_publication_id_fkey"
            columns: ["terms_publication_id"]
            isOneToOne: false
            referencedRelation: "booking_terms_publication_versions"
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
          checked_in_at: string | null
          completed_at: string | null
          confirmation_channel: string
          confirmed: boolean | null
          created_at: string | null
          created_by_id: string | null
          created_by_name: string | null
          created_by_role: string | null
          deposit_amount: number | null
          deposit_due_by: string | null
          deposit_received_at: string | null
          deposit_reference: string | null
          deposit_required: boolean
          dog_id: string
          dog_name_snapshot: string | null
          group_id: string | null
          id: string
          notes: string | null
          notify_human_ids: string[] | null
          owner_name_snapshot: string | null
          paid_amount: number | null
          paid_at: string | null
          payment: string | null
          payment_method: string | null
          pickup_by_id: string | null
          price_override: number | null
          ready_at: string | null
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
          visit_id: string | null
          visit_membership_state: string
          whatsapp_conversation_id: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          addons?: string[] | null
          booking_date: string
          breed_snapshot?: string | null
          cancel_reason?: string | null
          chain_id?: string | null
          checked_in_at?: string | null
          completed_at?: string | null
          confirmation_channel?: string
          confirmed?: boolean | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_name?: string | null
          created_by_role?: string | null
          deposit_amount?: number | null
          deposit_due_by?: string | null
          deposit_received_at?: string | null
          deposit_reference?: string | null
          deposit_required?: boolean
          dog_id: string
          dog_name_snapshot?: string | null
          group_id?: string | null
          id?: string
          notes?: string | null
          notify_human_ids?: string[] | null
          owner_name_snapshot?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment?: string | null
          payment_method?: string | null
          pickup_by_id?: string | null
          price_override?: number | null
          ready_at?: string | null
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
          visit_id?: string | null
          visit_membership_state?: string
          whatsapp_conversation_id?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          addons?: string[] | null
          booking_date?: string
          breed_snapshot?: string | null
          cancel_reason?: string | null
          chain_id?: string | null
          checked_in_at?: string | null
          completed_at?: string | null
          confirmation_channel?: string
          confirmed?: boolean | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_name?: string | null
          created_by_role?: string | null
          deposit_amount?: number | null
          deposit_due_by?: string | null
          deposit_received_at?: string | null
          deposit_reference?: string | null
          deposit_required?: boolean
          dog_id?: string
          dog_name_snapshot?: string | null
          group_id?: string | null
          id?: string
          notes?: string | null
          notify_human_ids?: string[] | null
          owner_name_snapshot?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment?: string | null
          payment_method?: string | null
          pickup_by_id?: string | null
          price_override?: number | null
          ready_at?: string | null
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
          visit_id?: string | null
          visit_membership_state?: string
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
            foreignKeyName: "bookings_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "bookings_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
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
      customer_booking_rule_overrides: {
        Row: {
          effective_from: string
          effective_to: string | null
          human_id: string
          id: string
          idempotency_key: string
          mode: string
          reason: string
          recorded_at: string
          recorded_by: string | null
        }
        Insert: {
          effective_from?: string
          effective_to?: string | null
          human_id: string
          id?: string
          idempotency_key: string
          mode: string
          reason: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Update: {
          effective_from?: string
          effective_to?: string | null
          human_id?: string
          id?: string
          idempotency_key?: string
          mode?: string
          reason?: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_booking_rule_overrides_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_reservations: {
        Row: {
          amount_pence: number
          created_at: string
          human_id: string
          id: string
          reserve_event_id: string
          state: string
          terminal_event_id: string | null
          updated_at: string
          visit_id: string
        }
        Insert: {
          amount_pence: number
          created_at?: string
          human_id: string
          id?: string
          reserve_event_id: string
          state: string
          terminal_event_id?: string | null
          updated_at?: string
          visit_id: string
        }
        Update: {
          amount_pence?: number
          created_at?: string
          human_id?: string
          id?: string
          reserve_event_id?: string
          state?: string
          terminal_event_id?: string | null
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_reservations_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_reservations_reserve_event_id_fkey"
            columns: ["reserve_event_id"]
            isOneToOne: true
            referencedRelation: "booking_financial_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_reservations_terminal_event_id_fkey"
            columns: ["terminal_event_id"]
            isOneToOne: true
            referencedRelation: "booking_financial_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_reservations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "customer_credit_reservations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_reservations_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id", "human_id"]
          },
          {
            foreignKeyName: "customer_credit_reservations_visit_id_human_id_fkey"
            columns: ["visit_id", "human_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id", "human_id"]
          },
        ]
      }
      customer_phone_lookup_attempts: {
        Row: {
          attempted_at: string
          id: string
          ip: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          ip: string
        }
        Update: {
          attempted_at?: string
          id?: string
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
          immediate_slots: string[]
          is_open: boolean | null
          overrides: Json | null
          setting_date: string
          updated_at: string | null
        }
        Insert: {
          extra_slots?: string[] | null
          id?: string
          immediate_slots?: string[]
          is_open?: boolean | null
          overrides?: Json | null
          setting_date: string
          updated_at?: string | null
        }
        Update: {
          extra_slots?: string[] | null
          id?: string
          immediate_slots?: string[]
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
          is_pregnant: boolean
          last_groomed_date: string | null
          microchip: string | null
          name: string
          neutered: boolean | null
          reported_size: string | null
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
          is_pregnant?: boolean
          last_groomed_date?: string | null
          microchip?: string | null
          name: string
          neutered?: boolean | null
          reported_size?: string | null
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
          is_pregnant?: boolean
          last_groomed_date?: string | null
          microchip?: string | null
          name?: string
          neutered?: boolean | null
          reported_size?: string | null
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
          ai_whatsapp_allowed: boolean
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          blocked_slots: string[]
          created_at: string | null
          customer_notes: string
          customer_user_id: string | null
          deposit_required: boolean
          email: string | null
          email_opted_out: boolean
          email_opted_out_at: string | null
          email_opted_out_reason: string | null
          fb: string | null
          heard_about_us: string | null
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
          preferred_slots: string[]
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
          ai_whatsapp_allowed?: boolean
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          blocked_slots?: string[]
          created_at?: string | null
          customer_notes?: string
          customer_user_id?: string | null
          deposit_required?: boolean
          email?: string | null
          email_opted_out?: boolean
          email_opted_out_at?: string | null
          email_opted_out_reason?: string | null
          fb?: string | null
          heard_about_us?: string | null
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
          preferred_slots?: string[]
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
          ai_whatsapp_allowed?: boolean
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          blocked_slots?: string[]
          created_at?: string | null
          customer_notes?: string
          customer_user_id?: string | null
          deposit_required?: boolean
          email?: string | null
          email_opted_out?: boolean
          email_opted_out_at?: string | null
          email_opted_out_reason?: string | null
          fb?: string | null
          heard_about_us?: string | null
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
          preferred_slots?: string[]
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
      notification_dismissals: {
        Row: {
          booking_id: string
          dismissed_at: string
          dismissed_by: string | null
        }
        Insert: {
          booking_id: string
          dismissed_at?: string
          dismissed_by?: string | null
        }
        Update: {
          booking_id?: string
          dismissed_at?: string
          dismissed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_dismissals_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          booking_id: string | null
          channel: string
          created_at: string | null
          dedupe_key: string | null
          error_message: string | null
          group_id: string | null
          human_id: string | null
          id: string
          message_text: string | null
          provider_message_id: string | null
          sent_at: string | null
          status: string
          trigger_type: string
        }
        Insert: {
          booking_id?: string | null
          channel: string
          created_at?: string | null
          dedupe_key?: string | null
          error_message?: string | null
          group_id?: string | null
          human_id?: string | null
          id?: string
          message_text?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          trigger_type: string
        }
        Update: {
          booking_id?: string | null
          channel?: string
          created_at?: string | null
          dedupe_key?: string | null
          error_message?: string | null
          group_id?: string | null
          human_id?: string | null
          id?: string
          message_text?: string | null
          provider_message_id?: string | null
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
      retention_marks: {
        Row: {
          created_at: string
          created_by: string | null
          dog_id: string
          id: string
          kind: string
          reason: string | null
          until: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dog_id: string
          id?: string
          kind: string
          reason?: string | null
          until?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dog_id?: string
          id?: string
          kind?: string
          reason?: string | null
          until?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_marks_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_config: {
        Row: {
          daily_dog_cap: number
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
          daily_dog_cap?: number
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
          daily_dog_cap?: number
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
          booking_change_request_id: string | null
          booking_visit_id: string | null
          closure_date: string | null
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
          booking_change_request_id?: string | null
          booking_visit_id?: string | null
          closure_date?: string | null
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
          booking_change_request_id?: string | null
          booking_visit_id?: string | null
          closure_date?: string | null
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
            foreignKeyName: "salon_todos_booking_change_request_id_fkey"
            columns: ["booking_change_request_id"]
            isOneToOne: false
            referencedRelation: "booking_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salon_todos_booking_visit_id_fkey"
            columns: ["booking_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "salon_todos_booking_visit_id_fkey"
            columns: ["booking_visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salon_todos_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_alert_prefs: {
        Row: {
          cancellation: boolean
          messages: boolean
          new_booking: boolean
          new_client: boolean
          reschedule: boolean
          updated_at: string
          user_id: string
          waitlist: boolean
        }
        Insert: {
          cancellation?: boolean
          messages?: boolean
          new_booking?: boolean
          new_client?: boolean
          reschedule?: boolean
          updated_at?: string
          user_id: string
          waitlist?: boolean
        }
        Update: {
          cancellation?: boolean
          messages?: boolean
          new_booking?: boolean
          new_client?: boolean
          reschedule?: boolean
          updated_at?: string
          user_id?: string
          waitlist?: boolean
        }
        Relationships: []
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
      staff_push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_used_at: string | null
          p256dh: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth?: string | null
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_used_at?: string | null
          p256dh?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string | null
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_used_at?: string | null
          p256dh?: string | null
          user_agent?: string | null
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
      whatsapp_ai_action_audit: {
        Row: {
          action_kind: string
          conversation_id: string
          created_at: string
          draft_id: string
          id: string
          outcome: string
          payload: Json
          reason: string | null
        }
        Insert: {
          action_kind: string
          conversation_id: string
          created_at?: string
          draft_id: string
          id?: string
          outcome: string
          payload: Json
          reason?: string | null
        }
        Update: {
          action_kind?: string
          conversation_id?: string
          created_at?: string
          draft_id?: string
          id?: string
          outcome?: string
          payload?: Json
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_ai_action_audit_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_ai_action_audit_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_drafts"
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
          last_message_at: string | null
          last_message_direction: string | null
          last_message_text: string | null
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
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_text?: string | null
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
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_text?: string | null
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
      whatsapp_flow_sessions: {
        Row: {
          booking_id: string | null
          created_at: string
          expires_at: string
          flow_token: string
          flow_type: string
          human_id: string | null
          phone_e164: string
          screen: string | null
          state: Json
          status: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          expires_at?: string
          flow_token: string
          flow_type?: string
          human_id?: string | null
          phone_e164: string
          screen?: string | null
          state?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          expires_at?: string
          flow_token?: string
          flow_type?: string
          human_id?: string | null
          phone_e164?: string
          screen?: string | null
          state?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_flow_sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_flow_sessions_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_manage_sessions: {
        Row: {
          action: string
          candidate_visits: Json
          conversation_id: string | null
          created_at: string
          expires_at: string
          human_id: string
          id: string
          selected_key: string | null
          status: string
        }
        Insert: {
          action: string
          candidate_visits?: Json
          conversation_id?: string | null
          created_at?: string
          expires_at?: string
          human_id: string
          id?: string
          selected_key?: string | null
          status?: string
        }
        Update: {
          action?: string
          candidate_visits?: Json
          conversation_id?: string | null
          created_at?: string
          expires_at?: string
          human_id?: string
          id?: string
          selected_key?: string | null
          status?: string
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
          media_mime: string | null
          media_path: string | null
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
          media_mime?: string | null
          media_path?: string | null
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
          media_mime?: string | null
          media_path?: string | null
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
      whatsapp_reschedule_receipts: {
        Row: {
          cancelled_booking_ids: string[]
          created_at: string
          flow_token: string
          new_booking_ids: string[]
          request_hash: string
        }
        Insert: {
          cancelled_booking_ids: string[]
          created_at?: string
          flow_token: string
          new_booking_ids: string[]
          request_hash: string
        }
        Update: {
          cancelled_booking_ids?: string[]
          created_at?: string
          flow_token?: string
          new_booking_ids?: string[]
          request_hash?: string
        }
        Relationships: []
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
      booking_visit_backfill_review: {
        Row: {
          booking_date: string | null
          booking_ids: string[] | null
          details: Json | null
          human_id: string | null
          kind: string | null
          reason_code: string | null
          review_key: string | null
          row_set_hash: string | null
          visit_ids: string[] | null
        }
        Relationships: []
      }
      booking_visit_bill_summary: {
        Row: {
          amount_due_pence: number | null
          bill_revision: number | null
          booking_date: string | null
          deposit_part_payment_pence: number | null
          gross_service_total_pence: number | null
          human_id: string | null
          non_deposit_paid_pence: number | null
          visit_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_visits_human_id_fkey"
            columns: ["human_id"]
            isOneToOne: false
            referencedRelation: "humans"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_visit_policy_events: {
        Row: {
          booking_date: string | null
          cancel_reason: string | null
          committed_at: string | null
          deadline_at: string | null
          event_type: string | null
          id: string | null
          occurred_at: string | null
          outcome_key: string | null
          policy_code: string | null
          requested_at: string | null
          slot: string | null
          visit_id: string | null
          was_late: boolean | null
        }
        Insert: {
          booking_date?: string | null
          cancel_reason?: string | null
          committed_at?: string | null
          deadline_at?: string | null
          event_type?: string | null
          id?: string | null
          occurred_at?: string | null
          outcome_key?: string | null
          policy_code?: string | null
          requested_at?: string | null
          slot?: string | null
          visit_id?: string | null
          was_late?: never
        }
        Update: {
          booking_date?: string | null
          cancel_reason?: string | null
          committed_at?: string | null
          deadline_at?: string | null
          event_type?: string | null
          id?: string | null
          occurred_at?: string | null
          outcome_key?: string | null
          policy_code?: string | null
          requested_at?: string | null
          slot?: string | null
          visit_id?: string | null
          was_late?: never
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_policy_code_fkey"
            columns: ["policy_code"]
            isOneToOne: false
            referencedRelation: "booking_policy_versions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "booking_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visit_bill_summary"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "booking_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "booking_visits"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      active_slots: { Args: never; Returns: string[] }
      active_slots_for: { Args: { p_date: string }; Returns: string[] }
      apply_booking_visit_backfill_reconciliation: {
        Args: {
          p_action: string
          p_expected_hash: string
          p_idempotency_key: string
          p_payload: Json
          p_reason: string
          p_review_key: string
        }
        Returns: Json
      }
      apply_whatsapp_booking_action: {
        Args: { p_action_id: string }
        Returns: string
      }
      approve_booking_visit: {
        Args: {
          p_expected_visit_revision: number
          p_idempotency_key: string
          p_reason?: string
          p_visit_id: string
        }
        Returns: Json
      }
      approve_customer_signup: {
        Args: { p_human_id: string }
        Returns: undefined
      }
      assert_booking_dog_not_pregnant: {
        Args: { p_dog_id: string }
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
      booking_policy_runtime: { Args: never; Returns: string }
      booking_policy_runtime_at: { Args: { p_at: string }; Returns: string }
      booking_policy_runtime_status: { Args: never; Returns: Json }
      booking_refund_calendar_status: { Args: never; Returns: Json }
      booking_visit_data_quality: {
        Args: { p_visit_id: string }
        Returns: string
      }
      booking_visit_malformed_children: {
        Args: { p_visit_id: string }
        Returns: Json
      }
      booking_visit_money_summary: {
        Args: { p_visit_id: string }
        Returns: Json
      }
      booking_visit_reconciliation_snapshot: {
        Args: { p_visit_ids: string[] }
        Returns: Json
      }
      cancel_customer_booking: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: {
          booking_group_id: string
          cancelled_at: string
          cancelled_booking_ids: string[]
          cancelled_count: number
          target_booking_id: string
        }[]
      }
      cancel_customer_booking_visit: {
        Args: {
          p_idempotency_key: string
          p_paid_deposit_outcome?: string
          p_reason?: string
          p_review_id: string
          p_visit_id: string
        }
        Returns: Json
      }
      cancel_customer_credit_refund: {
        Args: { p_idempotency_key: string; p_refund_due_id: string }
        Returns: Json
      }
      cancel_staff_booking_visit: {
        Args: {
          p_expected_revision: number
          p_idempotency_key: string
          p_incident_kind?: string
          p_paid_deposit_outcome?: string
          p_prepayment_handling?: string
          p_prepayment_refund_due_at?: string
          p_prepayment_target_visit_id?: string
          p_reason?: string
          p_record_incident?: boolean
          p_visit_id: string
        }
        Returns: Json
      }
      cancel_whatsapp_booking_by_id: {
        Args: { p_booking_id: string; p_human_id: string; p_reason?: string }
        Returns: {
          booking_ids: string[]
          cancelled_count: number
          group_id: string
        }[]
      }
      cancel_whatsapp_booking_group: {
        Args: { p_group_id: string; p_human_id: string; p_reason?: string }
        Returns: {
          booking_ids: string[]
          cancelled_count: number
          group_id: string
        }[]
      }
      canonical_single_breed_size: {
        Args: { p_breed: string }
        Returns: string
      }
      change_deadline_for: {
        Args: {
          p_booking_date: string
          p_policy_code: string
          p_start_slot: string
        }
        Returns: string
      }
      close_day_with_rearrangement_tasks: {
        Args: { p_date: string }
        Returns: Json
      }
      complete_closure_rearrangement_task: {
        Args: { p_task_id: string }
        Returns: Json
      }
      complete_customer_profile: {
        Args: {
          p_address: string
          p_name: string
          p_policies_version?: string
          p_postcode?: string
          p_surname: string
        }
        Returns: {
          address: string
          id: string
          name: string
          policies_accepted_at: string
          policies_version: string
          postcode: string
          surname: string
        }[]
      }
      create_customer_booking_group: {
        Args: { p_booking_date: string; p_bookings: Json }
        Returns: {
          id: string
        }[]
      }
      create_customer_dog: {
        Args: {
          p_breed?: string
          p_human_id?: string
          p_name: string
          p_size?: string
        }
        Returns: {
          breed: string
          human_id: string
          id: string
          name: string
          reported_size: string
          size: string
        }[]
      }
      create_pending_customer: {
        Args: never
        Returns: {
          id: string
        }[]
      }
      create_staff_booking_from_conversation: {
        Args: { p_conversation_id: string; p_payload: Json }
        Returns: string
      }
      create_staff_booking_group: {
        Args: { p_booking_date: string; p_bookings: Json }
        Returns: {
          addons: string[] | null
          booking_date: string
          breed_snapshot: string | null
          cancel_reason: string | null
          chain_id: string | null
          checked_in_at: string | null
          completed_at: string | null
          confirmation_channel: string
          confirmed: boolean | null
          created_at: string | null
          created_by_id: string | null
          created_by_name: string | null
          created_by_role: string | null
          deposit_amount: number | null
          deposit_due_by: string | null
          deposit_received_at: string | null
          deposit_reference: string | null
          deposit_required: boolean
          dog_id: string
          dog_name_snapshot: string | null
          group_id: string | null
          id: string
          notes: string | null
          notify_human_ids: string[] | null
          owner_name_snapshot: string | null
          paid_amount: number | null
          paid_at: string | null
          payment: string | null
          payment_method: string | null
          pickup_by_id: string | null
          price_override: number | null
          ready_at: string | null
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
          visit_id: string | null
          visit_membership_state: string
          whatsapp_conversation_id: string | null
          whatsapp_message_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_staff_booking_visit: {
        Args: {
          p_booking_date: string
          p_bookings: Json
          p_human_id: string
          p_idempotency_key: string
          p_source?: string
          p_terms_notice_method: string
        }
        Returns: Json
      }
      create_staff_visit: {
        Args: { p_date: string; p_human_id: string; p_key: string }
        Returns: string
      }
      create_whatsapp_booking_group: {
        Args: { p_booking_date: string; p_bookings: Json; p_human_id: string }
        Returns: {
          id: string
        }[]
      }
      current_booking_rules: { Args: never; Returns: Json }
      current_customer_booking_rules: { Args: never; Returns: Json }
      customer_credit_balance: { Args: { p_human_id: string }; Returns: Json }
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
      decide_booking_change_request: {
        Args: {
          p_decision: string
          p_expected_request_revision: number
          p_idempotency_key: string
          p_reason: string
          p_record_incident?: boolean
          p_request_id: string
        }
        Returns: Json
      }
      decide_customer_override_reschedule_request: {
        Args: { p_decision: string; p_reason: string; p_request_id: string }
        Returns: Json
      }
      decline_booking_visit: {
        Args: {
          p_customer_reason: string
          p_expected_visit_revision: number
          p_idempotency_key: string
          p_visit_id: string
        }
        Returns: Json
      }
      deposit_due_by_for: {
        Args: { p_created: string; p_date: string; p_slot: string }
        Returns: string
      }
      deposit_reference_for: {
        Args: { p_date: string; p_owner: string }
        Returns: string
      }
      derive_canonical_dog_size: { Args: { p_breed: string }; Returns: string }
      dismiss_delivery_failure: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      emit_booking_visit_event: {
        Args: {
          p_cancel_reason?: string
          p_event_type: string
          p_outcome_key: string
          p_requested_at?: string
          p_visit_id: string
        }
        Returns: string
      }
      extend_refund_calendar: {
        Args: {
          p_calendar_source?: string
          p_calendar_version: string
          p_covers_to: string
          p_holidays: Json
        }
        Returns: Json
      }
      find_or_create_legacy_visit: {
        Args: { p_date: string; p_human_id: string; p_key: string }
        Returns: string
      }
      get_ai_whatsapp_settings: {
        Args: never
        Returns: {
          enabled: boolean
          updated_at: string
          updated_by: string
        }[]
      }
      get_blocked_seats: {
        Args: { p_end: string; p_start: string }
        Returns: {
          seat_index: number
          setting_date: string
          slot: string
        }[]
      }
      get_booking_visit_backfill_review: { Args: never; Returns: Json }
      get_booking_visit_policy_events: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_customer_booking_visit_capabilities: {
        Args: { p_visit_id: string }
        Returns: Json
      }
      get_customer_credit_balance: { Args: never; Returns: Json }
      get_dog_grooming_intervals: {
        Args: never
        Returns: {
          dog_id: string
          first_groomed_date: string
          last_groomed_date: string
          last_service: string
          median_interval_days: number
          visit_count: number
        }[]
      }
      get_immediate_slots: {
        Args: never
        Returns: {
          setting_date: string
          slot: string
        }[]
      }
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
      get_occupancy_range: {
        Args: { p_from: string; p_to: string }
        Returns: {
          booking_date: string
          size: string
          slot: string
        }[]
      }
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
      get_staff_customer_credit_balance: {
        Args: { p_human_id: string }
        Returns: Json
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
      legacy_visit_change_deadline: {
        Args: { p_date: string; p_slot: string }
        Returns: string
      }
      legacy_visit_money_hash: { Args: { p_visit_id: string }; Returns: string }
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
      list_customer_booking_visits: {
        Args: { p_include_history?: boolean }
        Returns: Json
      }
      list_customer_trusted_humans: {
        Args: never
        Returns: {
          id: string
          name: string
          phone: string
          relationship: string
          surname: string
        }[]
      }
      list_staff_booking_policy_attention: { Args: never; Returns: Json }
      list_staff_booking_visit: { Args: { p_visit_id: string }; Returns: Json }
      log_booking_denial: {
        Args: {
          p_alternative_shown?: boolean
          p_alternative_taken?: boolean
          p_dog_count?: number
          p_human_id?: string
          p_reason_code: string
          p_reason_detail?: string
          p_requested_date?: string
          p_service?: string
          p_size?: string
          p_slot?: string
          p_source?: string
        }
        Returns: string
      }
      log_funnel_event: {
        Args: {
          p_dog_count?: number
          p_human_id?: string
          p_occurred_at?: string
          p_session_id: string
          p_step: string
          p_step_index?: number
        }
        Returns: undefined
      }
      mark_booking_visit_no_show: {
        Args: {
          p_expected_visit_revision: number
          p_idempotency_key: string
          p_reason: string
          p_visit_id: string
        }
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
      policy_for_confirmation: {
        Args: { p_confirmed_at: string }
        Returns: string
      }
      preview_booking_visit_backfill_reconciliation: {
        Args: { p_action: string; p_payload: Json; p_review_key: string }
        Returns: Json
      }
      preview_customer_cancel_visit: {
        Args: { p_visit_id: string }
        Returns: Json
      }
      preview_legacy_visit_opening_money: {
        Args: { p_classification: string; p_evidence: Json; p_visit_id: string }
        Returns: Json
      }
      prune_abandoned_signups: { Args: never; Returns: number }
      recompute_legacy_booking_visit: {
        Args: { p_visit_id: string }
        Returns: undefined
      }
      record_booking_incident: {
        Args: {
          p_expected_visit_revision: number
          p_idempotency_key: string
          p_kind: string
          p_reason: string
          p_visit_id: string
        }
        Returns: Json
      }
      record_customer_booking_contact: {
        Args: {
          p_channel: string
          p_contacted_at: string
          p_expected_visit_revision: number
          p_idempotency_key: string
          p_provider_message_id?: string
          p_visit_id: string
        }
        Returns: Json
      }
      record_legacy_visit_opening_money: {
        Args: {
          p_classification: string
          p_evidence: Json
          p_expected_hash: string
          p_idempotency_key: string
          p_reason: string
          p_visit_id: string
        }
        Returns: Json
      }
      record_visit_deposit_outcome: {
        Args: {
          p_bank_received_at: string
          p_expected_visit_revision: number
          p_idempotency_key: string
          p_outcome: string
          p_reason?: string
          p_staff_reference: string
          p_visit_id: string
        }
        Returns: Json
      }
      refund_calendar_coverage_for: {
        Args: { p_from: string }
        Returns: string
      }
      refund_due_at: { Args: { p_from: string }; Returns: string }
      refund_due_at_verified: {
        Args: { p_from: string }
        Returns: {
          calendar_source: string
          coverage_id: string
          due_at: string
        }[]
      }
      reject_customer_signup: {
        Args: { p_human_id: string; p_reason?: string }
        Returns: undefined
      }
      replace_trusted_contacts: {
        Args: { p_contacts?: Json; p_human_id: string }
        Returns: undefined
      }
      replay_whatsapp_reschedule_receipt: {
        Args: { p_flow_token: string; p_human_id: string }
        Returns: {
          cancelled_booking_ids: string[]
          new_booking_ids: string[]
        }[]
      }
      request_customer_credit_refund: {
        Args: { p_amount_pence: number; p_idempotency_key: string }
        Returns: Json
      }
      request_customer_override_reschedule: {
        Args: {
          p_booking_date: string
          p_booking_id: string
          p_bookings: Json
          p_reason: string
        }
        Returns: Json
      }
      reschedule_customer_booking: {
        Args: {
          p_booking_date: string
          p_booking_id: string
          p_bookings: Json
          p_reason: string
        }
        Returns: {
          id: string
        }[]
      }
      reschedule_customer_booking_direct_unchecked: {
        Args: {
          p_booking_date: string
          p_booking_id: string
          p_bookings: Json
          p_reason: string
        }
        Returns: {
          id: string
        }[]
      }
      reschedule_staff_booking_visit: {
        Args: {
          p_booking_date: string
          p_expected_revision: number
          p_idempotency_key: string
          p_reason?: string
          p_slot_assignments: Json
          p_visit_id: string
        }
        Returns: Json
      }
      reschedule_whatsapp_booking_group: {
        Args: {
          p_booking_date: string
          p_bookings: Json
          p_expected_old_date?: string
          p_expected_old_ids?: string[]
          p_expected_old_slot?: string
          p_expected_old_snapshot?: Json
          p_expected_services?: Json
          p_flow_token?: string
          p_human_id: string
          p_old_booking_id?: string
          p_old_group_id?: string
          p_reason?: string
        }
        Returns: {
          cancelled_booking_ids: string[]
          new_booking_ids: string[]
          replayed: boolean
        }[]
      }
      resolve_deposit_requirement: {
        Args: {
          p_booking_date: string
          p_eligibility_at: string
          p_human_id: string
          p_policy_code: string
        }
        Returns: Json
      }
      resolve_event_actor: {
        Args: { p_source?: string }
        Returns: {
          actor_id: string
          actor_name: string
          actor_role: string
        }[]
      }
      resolve_visit_deposit_money: {
        Args: {
          p_expected_visit_revision: number
          p_idempotency_key: string
          p_reason: string
          p_resolution: string
          p_visit_id: string
        }
        Returns: Json
      }
      revoke_calendar_feed_token: {
        Args: { p_feed_type: string }
        Returns: undefined
      }
      run_legacy_deposit_auto_release: { Args: never; Returns: number }
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
      set_ai_whatsapp_enabled: {
        Args: { p_enabled: boolean }
        Returns: {
          enabled: boolean
          updated_at: string
          updated_by: string
        }[]
      }
      set_booking_incident_waiver: {
        Args: {
          p_expected_incident_revision: number
          p_idempotency_key: string
          p_incident_id: string
          p_reason: string
          p_waived: boolean
        }
        Returns: Json
      }
      set_customer_booking_intake_enabled: {
        Args: { p_enabled: boolean; p_reason: string }
        Returns: Json
      }
      set_customer_deposit_override: {
        Args: {
          p_human_id: string
          p_idempotency_key: string
          p_mode: string
          p_reason: string
        }
        Returns: Json
      }
      settle_booking_refund_due: {
        Args: {
          p_actual_paid_at: string
          p_bank_reference: string
          p_idempotency_key: string
          p_reason?: string
          p_refund_due_id: string
        }
        Returns: Json
      }
      slots_are_hhmm: { Args: { p_slots: string[] }; Returns: boolean }
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
      sync_booking_visit_completion: {
        Args: { p_visit_id: string }
        Returns: string
      }
      update_booking_rules: { Args: { p_rules: Json }; Returns: Json }
      update_customer_contact_details: {
        Args: {
          p_address: string
          p_email?: string
          p_fb?: string
          p_insta?: string
          p_name: string
          p_postcode?: string
          p_surname: string
          p_tiktok?: string
          p_whatsapp?: boolean
        }
        Returns: {
          address: string
          email: string
          fb: string
          id: string
          insta: string
          name: string
          postcode: string
          surname: string
          tiktok: string
          whatsapp: boolean
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
          reported_size: string
          size: string
        }[]
      }
      update_staff_booking_visit: {
        Args: {
          p_changes: Json
          p_expected_revision: number
          p_idempotency_key: string
          p_reason: string
          p_visit_id: string
        }
        Returns: Json
      }
      validate_booking_calendar: {
        Args: { p_booking_date: string; p_slot: string }
        Returns: undefined
      }
      visit_actionability: {
        Args: { p_at: string; p_intent: string; p_visit_id: string }
        Returns: Json
      }
      visit_rows: {
        Args: { p_visit_id: string }
        Returns: {
          addons: string[] | null
          booking_date: string
          breed_snapshot: string | null
          cancel_reason: string | null
          chain_id: string | null
          checked_in_at: string | null
          completed_at: string | null
          confirmation_channel: string
          confirmed: boolean | null
          created_at: string | null
          created_by_id: string | null
          created_by_name: string | null
          created_by_role: string | null
          deposit_amount: number | null
          deposit_due_by: string | null
          deposit_received_at: string | null
          deposit_reference: string | null
          deposit_required: boolean
          dog_id: string
          dog_name_snapshot: string | null
          group_id: string | null
          id: string
          notes: string | null
          notify_human_ids: string[] | null
          owner_name_snapshot: string | null
          paid_amount: number | null
          paid_at: string | null
          payment: string | null
          payment_method: string | null
          pickup_by_id: string | null
          price_override: number | null
          ready_at: string | null
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
          visit_id: string | null
          visit_membership_state: string
          whatsapp_conversation_id: string | null
          whatsapp_message_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      visit_start_at: { Args: { p_visit_id: string }; Returns: string }
      waive_visit_deposit_requirement: {
        Args: {
          p_expected_visit_revision: number
          p_idempotency_key: string
          p_reason: string
          p_visit_id: string
        }
        Returns: Json
      }
      withdraw_customer_booking_change_request: {
        Args: { p_idempotency_key: string; p_request_id: string }
        Returns: Json
      }
      withdraw_customer_booking_visit: {
        Args: {
          p_idempotency_key: string
          p_reason?: string
          p_visit_id: string
        }
        Returns: Json
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
