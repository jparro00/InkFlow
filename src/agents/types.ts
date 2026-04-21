import type { Booking, Client } from '../types';
import type { ConversationSummary } from '../services/messageService';

// --- AI Response Format ---

export interface AgentIntent {
  agent: 'booking' | 'client' | 'schedule' | 'messaging' | 'feedback' | 'unknown';
  action: 'create' | 'open' | 'edit' | 'search' | 'query' | 'draft' | 'delete' | 'unknown';
  entities: {
    // Booking entities
    client_name?: string;
    date?: string;
    duration?: number;
    type?: string;
    timeSlot?: 'morning' | 'evening';
    estimate?: number;
    notes?: string;
    rescheduled?: boolean;
    find_slot?: 'morning' | 'evening' | 'any';
    // Personal booking: succinct free-text label (no client association).
    title?: string;
    // Client entities
    name?: string;
    phone?: string;
    tags?: string[];
    dob?: string;
    // Schedule entities
    query_type?: 'count' | 'list' | 'available' | 'summary';
    date_range_start?: string;
    date_range_end?: string;
    booking_type?: string;
    // Messaging entities
    draft_context?: 'reminder' | 'followup' | 'reschedule';
    // Feedback entities — verbatim feedback body, dropped into the tab's
    // textarea for the user to review and submit themselves.
    feedback_text?: string;
  };
}

// --- Entity Resolution Results ---

export type ClientResolution =
  | { type: 'exact'; client: Client }
  | { type: 'single'; client: Client }
  | { type: 'multiple'; clients: Client[] }
  | { type: 'none'; query: string; suggestions: Client[] };

export type BookingResolution =
  | { type: 'exact'; booking: Booking }
  | { type: 'multiple'; bookings: Booking[] }
  | { type: 'none' };

export type ConversationResolution =
  | { type: 'exact'; conversation: ConversationSummary }
  | { type: 'multiple'; conversations: ConversationSummary[] }
  | { type: 'none' };

// --- Agent Panel Messages ---

export interface DraftTemplate {
  id: string;
  label: string;
  icon: string;
  text: string;
}

export interface ConfirmOption {
  id: 'yes' | 'cancel';
  label: string;
  kind: 'destructive' | 'safe';
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  selections?: {
    type: 'client' | 'booking' | 'conversation' | 'template' | 'confirm';
    items: Array<Client | Booking | ConversationSummary | DraftTemplate | ConfirmOption>;
    mode: 'single';
    context:
      | 'ambiguous_client'
      | 'no_match'
      | 'search_results'
      | 'ambiguous_booking'
      | 'platform_choice'
      | 'draft_template'
      | 'confirm_delete_client'
      | 'confirm_delete_booking';
  };
  scheduleData?: {
    type: 'count' | 'list' | 'available' | 'summary';
    bookings?: Booking[];
    count?: number;
    summary?: string;
  };
  status?: 'loading' | 'action_taken';
  actionLabel?: string;
}

// --- Resolved data passed from orchestrator to sub-agents ---

export interface ResolvedBookingCreate {
  client_id?: string;
  date?: string;
  duration?: number;
  type?: string;
  timeSlot?: 'morning' | 'evening';
  estimate?: number;
  notes?: string;
  rescheduled?: boolean;
  title?: string;
}

export interface ResolvedBookingOpen {
  booking_id: string;
}

export interface ResolvedBookingEdit {
  booking_id: string;
  changes: Partial<{
    date: string;
    duration: number;
    type: string;
    timeSlot: 'morning' | 'evening';
    estimate: number;
    notes: string;
    rescheduled: boolean;
    title: string;
  }>;
}

export interface ResolvedClientCreate {
  name?: string;
  phone?: string;
}

export interface ResolvedClientOpen {
  client_id: string;
}

export interface ResolvedClientEdit {
  client_id: string;
  changes: Partial<{
    name: string;
    phone: string;
    tags: string[];
    dob: string;
  }>;
}

export interface ResolvedBookingDelete {
  booking_id: string;
}

export interface ResolvedClientDelete {
  client_id: string;
}

export interface ResolvedScheduleQuery {
  query_type: 'count' | 'list' | 'available' | 'summary';
  date_range_start?: string;
  date_range_end?: string;
  booking_type?: string;
}

export interface ResolvedMessagingOpen {
  conversation_id: string;
}

export interface ResolvedMessagingDraft {
  conversation_id: string;
  client_name: string;
  templates: DraftTemplate[];
}

export interface ResolvedFeedbackDraft {
  text: string;
}
