import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Modal from '../common/Modal';
import AgentMessages from './AgentMessages';
import { useAgentStore } from '../../stores/agentStore';
import { useUIStore } from '../../stores/uiStore';
import { processInput } from '../../agents/orchestrator';

export default function AgentPanel() {
  const closePanel = useAgentStore((s) => s.closePanel);
  const isProcessing = useAgentStore((s) => s.isProcessing);
  const setCreateClientFormOpen = useUIStore((s) => s.setCreateClientFormOpen);
  const setPrefillClientData = useUIStore((s) => s.setPrefillClientData);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  // Listen for agent navigation events (from clientAgent)
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      navigate(path);
    };
    window.addEventListener('agent-navigate', handler);
    return () => window.removeEventListener('agent-navigate', handler);
  }, [navigate]);

  // Listen for agent create-client events (from no-match selection)
  useEffect(() => {
    const handler = (e: Event) => {
      const { name } = (e as CustomEvent<{ name: string }>).detail;
      closePanel();
      setPrefillClientData({ name });
      setCreateClientFormOpen(true);
    };
    window.addEventListener('agent-create-client', handler);
    return () => window.removeEventListener('agent-create-client', handler);
  }, [closePanel, setPrefillClientData, setCreateClientFormOpen]);

  // Focus input after modal opens (small delay for animation)
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || isProcessing) return;
    setInput('');
    processInput(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal
      title="InkBloop Agent"
      onClose={closePanel}
      width="lg:max-w-[520px]"
      fullScreenMobile={true}
      canCollapse={false}
    >
      <div className="flex flex-col -mx-5 -my-5 lg:-mx-6 lg:-my-5 h-full lg:h-[70vh]">
        {/* Messages area */}
        <AgentMessages />

        {/* Composer */}
        <div className="shrink-0 border-t border-border/40 px-4 py-3 bg-elevated">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What would you like to do?"
              rows={1}
              className="flex-1 bg-input border border-border/60 rounded-xl px-4 py-3 text-[15px] text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 resize-none transition-colors max-h-[120px]"
              style={{ minHeight: 48 }}
              disabled={isProcessing}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isProcessing}
              className="w-14 h-14 bg-accent text-bg rounded-xl flex items-center justify-center shrink-0 cursor-pointer press-scale transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-glow active:shadow-glow-strong"
            >
              <Send size={22} />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
