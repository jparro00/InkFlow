import { useEffect, useRef, useCallback, useState } from 'react';
import { Send, ArrowLeft, ImagePlus, Loader2, UserPlus, ExternalLink, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../stores/uiStore';
import { useMessageStore, isBusinessMessage } from '../../stores/messageStore';
import { useClientStore } from '../../stores/clientStore';
import type { GraphMessage } from '../../services/messageService';
import CreateClientForm from '../client/CreateClientForm';
import type { ClientChannel } from '../../types';

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
  const findByPsid = useClientStore((s) => s.findByPsid);
  const linkPsidToClient = useClientStore((s) => s.linkPsidToClient);
  const clients = useClientStore((s) => s.clients);
  const navigate = useNavigate();

  const linkedClient = convo ? findByPsid(convo.participantPsid) : undefined;
  const [showLinkMenu, setShowLinkMenu] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Fetch messages on open + send mark_seen. New messages arrive via Realtime (no polling).
  useEffect(() => {
    if (!selectedConversationId) return;

    fetchMessages(selectedConversationId);
    markRead(selectedConversationId);

    return () => {
      clearCurrentMessages();
    };
  }, [selectedConversationId, fetchMessages, markRead, clearCurrentMessages]);

  // Auto-scroll to bottom when new messages arrive at the end (not when loading older)
  const prevLastMid = useRef<string | null>(null);
  useEffect(() => {
    if (!currentMessages.length) return;
    const lastMid = currentMessages[currentMessages.length - 1].id;
    if (lastMid !== prevLastMid.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevLastMid.current = lastMid;
  }, [currentMessages]);

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
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <motion.div
        {...(bindDrag() as any)}
        style={{ x: dragX, touchAction: 'pan-y' }}
        className="fixed inset-y-0 right-0 w-full lg:max-w-[480px] bg-elevated z-50 flex flex-col shadow-lg"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-4 border-b border-border/40">
          <button
            onClick={dismiss}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-text-s active:text-text-p active:bg-surface transition-colors cursor-pointer press-scale shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="w-9 h-9 rounded-full overflow-hidden bg-surface shrink-0">
            {convo.profilePic ? (
              <img src={convo.profilePic} alt={convo.participantName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-s text-sm font-medium">
                {convo.participantName.charAt(0)}
              </div>
            )}
          </div>
          <h2 className="font-display text-lg text-text-p flex-1 truncate">{convo.participantName}</h2>
          {linkedClient ? (
            <button
              onClick={() => {
                dismiss();
                setTimeout(() => navigate(`/clients/${linkedClient.id}`), 300);
              }}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 text-accent text-sm font-medium cursor-pointer press-scale transition-colors"
            >
              <ExternalLink size={14} />
              <span>Client</span>
            </button>
          ) : (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowLinkMenu(!showLinkMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface text-text-s text-sm font-medium cursor-pointer press-scale transition-colors active:text-text-p"
              >
                <UserPlus size={14} />
                <span>Link</span>
              </button>
              {showLinkMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-elevated border border-border/60 rounded-lg shadow-md z-10 overflow-hidden">
                  <button
                    onClick={() => { setShowLinkMenu(false); setShowCreateForm(true); }}
                    className="w-full text-left px-4 py-3 text-sm text-text-p hover:bg-surface active:bg-surface transition-colors cursor-pointer"
                  >
                    New Client
                  </button>
                  <button
                    onClick={() => { setShowLinkMenu(false); setShowClientSearch(true); }}
                    className="w-full text-left px-4 py-3 text-sm text-text-p hover:bg-surface active:bg-surface transition-colors cursor-pointer border-t border-border/30"
                  >
                    Existing Client
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Link to existing client search */}
        {showClientSearch && (
          <div className="shrink-0 border-b border-border/40 px-4 py-3 bg-surface/50">
            <div className="flex items-center gap-2 mb-2">
              <Search size={16} className="text-text-t shrink-0" />
              <input
                type="text"
                value={clientSearchQuery}
                onChange={(e) => setClientSearchQuery(e.target.value)}
                placeholder="Search clients..."
                autoFocus
                className="flex-1 bg-transparent text-sm text-text-p placeholder:text-text-t focus:outline-none"
              />
              <button onClick={() => { setShowClientSearch(false); setClientSearchQuery(''); }} className="text-text-t cursor-pointer press-scale">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {clients
                .filter((c) => !c.psid && c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()))
                .slice(0, 10)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={async () => {
                      await linkPsidToClient(c.id, convo.participantPsid);
                      setShowClientSearch(false);
                      setClientSearchQuery('');
                    }}
                    className="w-full text-left px-3 py-2 rounded-md text-sm text-text-p hover:bg-elevated active:bg-elevated transition-colors cursor-pointer press-scale"
                  >
                    {c.name}
                    {c.phone && <span className="text-text-t ml-2">{c.phone}</span>}
                  </button>
                ))}
              {clients.filter((c) => !c.psid && c.name.toLowerCase().includes(clientSearchQuery.toLowerCase())).length === 0 && (
                <div className="text-text-t text-xs py-2 text-center">No matching clients</div>
              )}
            </div>
          </div>
        )}

        {/* Messages area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 pt-4 pb-16"
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
        <div
          className="shrink-0 border-t border-border/40 px-4 pt-3 flex items-end gap-2 bg-elevated"
          style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}
        >
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

      {/* Create client form modal */}
      {showCreateForm && convo && (
        <div className="fixed inset-0 z-[60]">
          <CreateClientForm
            onClose={() => setShowCreateForm(false)}
            initialData={{
              name: convo.participantName,
              psid: convo.participantPsid,
              channel: (convo.platform === 'instagram' ? 'Instagram' : 'Facebook') as ClientChannel,
            }}
            onCreated={() => setShowCreateForm(false)}
          />
        </div>
      )}
    </>
  );
}
