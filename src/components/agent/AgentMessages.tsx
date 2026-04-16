import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, UserPlus, Search } from 'lucide-react';
import { useAgentStore } from '../../stores/agentStore';
import { useClientStore } from '../../stores/clientStore';
import { handleSelection } from '../../agents/orchestrator';
import ClientCard from './ClientCard';
import BookingCard from './BookingCard';
import ConversationCard from './ConversationCard';
import TemplateCard from './TemplateCard';
import ScheduleResponse from './ScheduleResponse';
import type { AgentMessage, DraftTemplate } from '../../agents/types';
import type { Booking, Client } from '../../types';
import type { ConversationSummary } from '../../services/messageService';

export default function AgentMessages() {
  const messages = useAgentStore((s) => s.messages);
  const pendingIntent = useAgentStore((s) => s.pendingIntent);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const onCreateClient = () => {
    // Dispatch create-client event for no-match scenario
    const intent = pendingIntent;
    if (intent) {
      const name = intent.entities.client_name || intent.entities.name || '';
      window.dispatchEvent(
        new CustomEvent('agent-create-client', { detail: { name } })
      );
    }
  };

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          onCreateClient={onCreateClient}
        />
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  onCreateClient,
}: {
  message: AgentMessage;
  onCreateClient: () => void;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-accent/15 text-text-p rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%] text-[15px]">
          {message.text}
        </div>
      </div>
    );
  }

  // Loading state
  if (message.status === 'loading') {
    return (
      <div className="flex justify-start">
        <div className="bg-surface/60 border border-border/30 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
          <Loader2 size={16} className="animate-spin text-accent" />
          <span className="text-[14px] text-text-t">Thinking...</span>
        </div>
      </div>
    );
  }

  // Action taken
  if (message.status === 'action_taken') {
    return (
      <div className="flex justify-start">
        <div className="bg-accent/10 border border-accent/20 rounded-2xl rounded-bl-md px-4 py-2.5 flex items-center gap-2">
          <Check size={16} className="text-accent" />
          <span className="text-[14px] text-accent font-medium">
            {message.actionLabel}
          </span>
        </div>
      </div>
    );
  }

  // Agent text + optional selections/schedule data
  return (
    <div className="flex flex-col items-start gap-2 max-w-[95%]">
      {message.text && (
        <div className="bg-surface/60 border border-border/30 rounded-2xl rounded-bl-md px-4 py-2.5 text-[15px] text-text-p">
          {message.text}
        </div>
      )}

      {/* Selection cards */}
      {message.selections && (
        <SelectionCards
          selections={message.selections}
          onCreateClient={onCreateClient}
        />
      )}

      {/* Schedule data */}
      {message.scheduleData && (
        <ScheduleResponse data={message.scheduleData} />
      )}
    </div>
  );
}

function SelectionCards({
  selections,
  onCreateClient,
}: {
  selections: NonNullable<AgentMessage['selections']>;
  onCreateClient: () => void;
}) {
  const [search, setSearch] = useState('');
  const allClients = useClientStore((s) => s.clients);

  const onSelect = (id: string) => {
    handleSelection(selections.type, id);
  };

  // For no_match: show suggestions, then a search field to find anyone
  const isNoMatch = selections.context === 'no_match' && selections.type === 'client';
  const suggestions = selections.items as Client[];

  // Search results: filter all clients by search query
  const searchResults = search.length >= 1
    ? allClients.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8)
    : [];

  return (
    <div className="w-full space-y-1.5 max-h-[50vh] overflow-y-auto">
      {/* "Create new client" button for no_match context */}
      {isNoMatch && (
        <button
          onClick={onCreateClient}
          className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg bg-accent/8 border border-accent/30 active:bg-accent/15 transition-colors cursor-pointer press-scale"
        >
          <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
            <UserPlus size={18} className="text-accent" />
          </div>
          <div className="text-[15px] text-accent font-medium">
            Create new client
          </div>
        </button>
      )}

      {/* Fuzzy suggestions for no_match */}
      {isNoMatch && suggestions.length > 0 && !search && (
        suggestions.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            onSelect={onSelect}
          />
        ))
      )}

      {/* Search input for no_match — find any client */}
      {isNoMatch && (
        <div className="relative mt-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-t" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all clients..."
            className="w-full bg-input border border-border/60 rounded-lg pl-9 pr-3 py-2.5 text-[14px] text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors"
          />
        </div>
      )}

      {/* Search results */}
      {isNoMatch && search && searchResults.length > 0 && (
        searchResults.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            onSelect={onSelect}
          />
        ))
      )}
      {isNoMatch && search && searchResults.length === 0 && (
        <div className="text-[13px] text-text-t text-center py-2">No clients match "{search}"</div>
      )}

      {/* Non-no_match client selections (disambiguation) */}
      {selections.type === 'client' && !isNoMatch &&
        (selections.items as Client[]).map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            onSelect={onSelect}
          />
        ))}

      {selections.type === 'booking' &&
        (selections.items as Booking[]).map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            onSelect={onSelect}
          />
        ))}

      {selections.type === 'conversation' &&
        (selections.items as ConversationSummary[]).map((convo) => (
          <ConversationCard
            key={convo.id}
            conversation={convo}
            onSelect={onSelect}
          />
        ))}

      {selections.type === 'template' &&
        (selections.items as DraftTemplate[]).map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}
