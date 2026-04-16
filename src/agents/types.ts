import type { Booking, Client } from '../types';
import type { ConversationSummary } from '../services/messageService';

// --- AI Response Format ---

export interface AgentIntent {
  agent: 'booking' | 'client' | 'schedule' | 'messaging' | 'unknown';
  action: 'create' | 'open' | 'edit' | 'query' | 'draft' | 'unknown';
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
    // Client entities
    name?: string;
    phone?: string;
    tags?: string[];
    // Schedule entities
    query_type?: 'count' | 'list' | 'available' | 'summary';
    date_range_start?: string;
    date_range_end?: string;
    booking_type?: string;
    // Messaging entities
    draft_context?: 'reminder' | 'followup' | 'reschedule';
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

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  selections?: {
    type: 'client' | 'booking' | 'conversation' | 'template';
    items: Array<Client | Booking | ConversationSummary | DraftTemplate>;
    mode: 'single';
    context:
      | 'ambiguous_client'
      | 'no_match'
      | 'ambiguous_booking'
      | 'platform_choice'
      | 'draft_template';
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
  }>;
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
