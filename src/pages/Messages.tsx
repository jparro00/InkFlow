import { useState, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNowStrict } from 'date-fns';
import { useMessageStore } from '../stores/messageStore';
import { useUIStore } from '../stores/uiStore';
import type { ConversationSummary } from '../services/messageService';

function formatTime(iso: string): string {
  try {
    const dist = formatDistanceToNowStrict(new Date(iso), { addSuffix: false });
    return dist
      .replace(/ seconds?/, 's')
      .replace(/ minutes?/, 'm')
      .replace(/ hours?/, 'h')
      .replace(/ days?/, 'd')
      .replace(/ weeks?/, 'w')
      .replace(/ months?/, 'mo')
      .replace(/ years?/, 'y');
  } catch {
    return '';
  }
}

function PlatformAvatar({ convo }: { convo: ConversationSummary }) {
  const isIG = convo.platform === 'instagram';
  const initial = convo.participantName.charAt(0);

  return (
    <div className="relative shrink-0">
      <div
        className="w-14 h-14 rounded-full p-[2.5px]"
        style={{
          background: isIG
            ? 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'
            : '#0084FF',
        }}
      >
        <div className="w-full h-full rounded-full bg-elevated flex items-center justify-center overflow-hidden">
          {convo.profilePic ? (
            <img
              src={convo.profilePic}
              alt={convo.participantName}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-text-s text-lg font-medium">{initial}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationItem({ convo, index }: { convo: ConversationSummary; index: number }) {
  const isUnread = convo.lastMessageFromClient;

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="w-full text-left flex items-center gap-3.5 px-5 py-3.5 lg:px-4 rounded-lg active:bg-elevated/40 lg:hover:bg-elevated/30 transition-colors cursor-pointer press-scale min-h-[72px]"
    >
      <PlatformAvatar convo={convo} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-base truncate ${
              isUnread ? 'text-text-p font-semibold' : 'text-text-s font-normal'
            }`}
          >
            {convo.participantName}
          </span>
          <span className="text-xs text-text-t shrink-0">
            {formatTime(convo.lastMessageTime)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={`text-sm truncate flex-1 ${
              isUnread ? 'text-text-p font-semibold' : 'text-text-t'
            }`}
          >
            {isUnread && convo.unreadCount > 1
              ? `${convo.unreadCount}+ new messages`
              : convo.lastMessage || 'No messages yet'}
          </span>
          {isUnread && (
            <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />
          )}
        </div>
      </div>
    </motion.button>
  );
}

export default function MessagesPage() {
  const { setHeaderLeft, setHeaderRight } = useUIStore();
  const conversations = useMessageStore((s) => s.conversations);
  const isLoading = useMessageStore((s) => s.isLoading);
  const error = useMessageStore((s) => s.error);
  const fetchConversations = useMessageStore((s) => s.fetchConversations);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setHeaderLeft(null);
    setHeaderRight(null);
    return () => { setHeaderLeft(null); setHeaderRight(null); };
  }, [setHeaderLeft, setHeaderRight]);

  // Fetch on mount + poll every 5 seconds for new messages
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const filtered = search
    ? conversations.filter((c) =>
        c.participantName.toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="shrink-0 px-3 pb-2">
        <div className="relative">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-t" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search messages..."
            className="w-full bg-surface border border-border/40 rounded-md pl-12 pr-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 lg:px-6">
        {isLoading && conversations.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-text-t" />
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <div className="text-text-t text-sm mb-2">Failed to load messages</div>
            <div className="text-text-t text-xs">{error}</div>
            <button
              onClick={fetchConversations}
              className="mt-4 text-sm text-accent cursor-pointer press-scale"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((convo, i) => (
              <ConversationItem key={convo.id} convo={convo} index={i} />
            ))}

            {filtered.length === 0 && (
              <div className="text-center py-16 text-text-t text-sm">
                {search ? 'No conversations match your search.' : 'No conversations yet.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
