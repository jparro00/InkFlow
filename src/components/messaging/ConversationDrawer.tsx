import { useEffect, useRef, useCallback } from 'react';
import { Send, ArrowLeft, ImagePlus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { useUIStore } from '../../stores/uiStore';
import { useMessageStore, isBusinessMessage } from '../../stores/messageStore';
import type { GraphMessage } from '../../services/messageService';
import { sendMarkSeen } from '../../services/messageService';

function MessageBubble({ msg }: { msg: GraphMessage }) {
  const isBusiness = isBusinessMessage(msg) || msg.from.id === '__self__';
  const isPending = msg.id.startsWith('pending_');
  const hasAttachments = msg.attachments?.data?.length;

  return (
    <div className={`flex ${isBusiness ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className="max-w-[80%]">
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isBusiness
              ? 'bg-accent/15 text-text-p rounded-br-md'
              : 'bg-surface border border-border/30 text-text-p rounded-bl-md'
          } ${isPending ? 'opacity-60' : ''}`}
        >
          {msg.message && <div>{msg.message}</div>}
          {hasAttachments && msg.attachments!.data.map((att, i) => (
            att.payload?.url ? (
              <img
                key={i}
                src={att.payload.url}
                alt="attachment"
                className="mt-1 rounded-lg max-w-full max-h-48 object-cover"
              />
            ) : (
              <div key={i} className="text-text-t text-xs mt-1">[{att.type}]</div>
            )
          ))}
        </div>
        <div className={`text-[11px] text-text-t mt-1 ${isBusiness ? 'text-right' : 'text-left'} px-1`}>
          {format(new Date(msg.created_time), 'h:mm a')}
        </div>
      </div>
    </div>
  );
}

export default function ConversationDrawer() {
  const { selectedConversationId, setSelectedConversationId } = useUIStore();
  const conversations = useMessageStore((s) => s.conversations);
  const currentMessages = useMessageStore((s) => s.currentMessages);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const sendMessage = useMessageStore((s) => s.sendMessage);
  const markRead = useMessageStore((s) => s.markRead);
  const clearCurrentMessages = useMessageStore((s) => s.clearCurrentMessages);
  const isSending = useMessageStore((s) => s.isSending);
  const isLoadingMessages = useMessageStore((s) => s.isLoadingMessages);
  const sendImage = useMessageStore((s) => s.sendImage);
  const hasOlderMessages = useMessageStore((s) => s.hasOlderMessages);
  const isLoadingOlder = useMessageStore((s) => s.isLoadingOlder);
  const loadOlderMessages = useMessageStore((s) => s.loadOlderMessages);
  const drafts = useMessageStore((s) => s.drafts);
  const setDraft = useMessageStore((s) => s.setDraft);
  const clearDraft = useMessageStore((s) => s.clearDraft);

  const convo = conversations.find((c) => c.id === selectedConversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevMsgCount = useRef(0);
  const isDismissing = useRef(false);

  // Slide-from-right animation
  const dragX = useMotionValue(window.innerWidth);
  const backdropOpacity = useTransform(dragX, [0, window.innerWidth], [1, 0]);

  // Enter animation
  useEffect(() => {
    animate(dragX, 0, { type: 'spring', damping: 30, stiffness: 300 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback(() => {
    if (isDismissing.current) return;
    isDismissing.current = true;
    animate(dragX, window.innerWidth, {
      type: 'spring', stiffness: 200, damping: 30, mass: 1.2,
      onComplete: () => setSelectedConversationId(null),
    });
  }, [dragX, setSelectedConversationId]);

  // Swipe right to close
  const bindDrag = useDrag(
    ({ movement: [mx], velocity: [vx], direction: [dx], last, cancel }) => {
      if (isDismissing.current) return;

      // Only allow rightward swipe
      if (mx < 0) {
        dragX.set(0);
        cancel();
        return;
      }

      dragX.set(mx);

      if (last) {
        if (mx > 80 || (vx > 0.4 && dx > 0)) {
          dismiss();
        } else {
          animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 30 });
        }
      }
    },
    { axis: 'x', filterTaps: true, threshold: 10, pointer: { touch: true } }
  );

  // Fetch messages from DB on open + lightweight poll + send mark_seen
  useEffect(() => {
    if (!selectedConversationId) return;

    fetchMessages(selectedConversationId);
    markRead(selectedConversationId);

    // Tell FB/IG we've seen the messages
    const c = useMessageStore.getState().conversations.find((cv) => cv.id === selectedConversationId);
    if (c) {
      sendMarkSeen(c.platform, c.participantPsid).catch(() => {});
    }

    // Poll Supabase (lightweight DB query) for new messages
    const interval = setInterval(() => {
      fetchMessages(selectedConversationId);
    }, 3000);

    return () => {
      clearInterval(interval);
      clearCurrentMessages();
    };
  }, [selectedConversationId, fetchMessages, markRead, clearCurrentMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (currentMessages.length > prevMsgCount.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevMsgCount.current = currentMessages.length;
  }, [currentMessages.length]);

  if (!convo) return null;

  const draftText = drafts[convo.id] ?? '';

  const handleTextChange = (value: string) => {
    if (value) {
      setDraft(convo.id, value);
    } else {
      clearDraft(convo.id);
    }
  };

  const handleSend = async () => {
    const msg = draftText.trim();
    if (!msg) return;
    clearDraft(convo.id);
    try {
      await sendMessage(convo.id, convo.platform, convo.participantPsid, msg);
    } catch (e) {
      // Restore draft on failure
      setDraft(convo.id, msg);
      console.error('Failed to send:', e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !convo) return;
    e.target.value = '';

    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    try {
      await sendImage(convo.id, convo.platform, convo.participantPsid, dataUrl);
    } catch (err) {
      console.error('Failed to send image:', err);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-50 backdrop-blur-sm"
        style={{ backgroundColor: 'var(--color-overlay)', opacity: backdropOpacity }}
        onClick={dismiss}
      />

      {/* Panel — slides from right */}
      <motion.div
        {...bindDrag()}
        style={{ x: dragX, touchAction: 'pan-y' }}
        className="fixed inset-y-0 right-0 w-full lg:max-w-[480px] bg-elevated z-50 flex flex-col shadow-lg"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-4 border-b border-border/40">
          <button
            onClick={dismiss}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-text-s active:text-text-p active:bg-surface transition-colors cursor-pointer press-scale"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="font-display text-lg text-text-p flex-1 truncate">{convo.participantName}</h2>
        </div>

        {/* Messages area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 pt-4 pb-8"
          style={{ minHeight: 0 }}
        >
          {currentMessages.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              {isLoadingMessages ? (
                <Loader2 size={24} className="animate-spin text-text-t" />
              ) : (
                <span className="text-text-t text-sm">No messages yet</span>
              )}
            </div>
          ) : (
            <>
              {hasOlderMessages && (
                <div className="text-center py-3">
                  <button
                    onClick={() => selectedConversationId && loadOlderMessages(selectedConversationId)}
                    disabled={isLoadingOlder}
                    className="text-sm text-accent cursor-pointer press-scale disabled:opacity-40"
                  >
                    {isLoadingOlder ? 'Loading...' : 'Load older messages'}
                  </button>
                </div>
              )}
              {currentMessages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-border/40 px-4 py-3 flex items-end gap-2 bg-elevated safe-bottom">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending}
            className="w-10 h-10 rounded-full flex items-center justify-center text-text-s active:text-text-p active:bg-surface transition-colors cursor-pointer press-scale shrink-0 disabled:opacity-30"
          >
            <ImagePlus size={20} />
          </button>
          <textarea
            value={draftText}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 bg-surface border border-border/40 rounded-xl px-4 py-3 text-sm text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 resize-none transition-colors max-h-24"
          />
          <button
            onClick={handleSend}
            disabled={!draftText.trim() || isSending}
            className="w-10 h-10 rounded-full bg-accent text-bg flex items-center justify-center cursor-pointer press-scale transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            <Send size={18} />
          </button>
        </div>
      </motion.div>
    </>
  );
}
