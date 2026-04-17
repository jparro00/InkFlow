import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Modal from '../common/Modal';
import AgentMessages from './AgentMessages';
import MicButton from './MicButton';
import ListeningOrb from './ListeningOrb';
import { useAgentStore } from '../../stores/agentStore';
import { useUIStore } from '../../stores/uiStore';
import { processInput } from '../../agents/orchestrator';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';

export default function AgentPanel() {
  const closePanel = useAgentStore((s) => s.closePanel);
  const isProcessing = useAgentStore((s) => s.isProcessing);
  const setCreateClientFormOpen = useUIStore((s) => s.setCreateClientFormOpen);
  const setPrefillClientData = useUIStore((s) => s.setPrefillClientData);
  const addToast = useUIStore((s) => s.addToast);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  const voice = useVoiceRecorder({
    onTranscript: (text) => {
      // Transcript lands → run it through the agent pipeline exactly as if
      // the user typed it and hit send. No review step — the existing
      // confirmation layer (delete cards, etc) handles destructive safety.
      setInput('');
      processInput(text);
    },
  });

  // Surface voice errors as toasts so users see them even if the button
  // has already flicked back to idle.
  useEffect(() => {
    if (voice.state.kind === 'error') {
      addToast(voice.state.message);
    }
  }, [voice.state, addToast]);

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

  // Composer right-hand button: send if textarea has text, mic otherwise.
  // Voice states (requesting/recording/transcribing) always take over even
  // if there's text in the box — feels natural: you're in voice mode.
  const voiceActive =
    voice.state.kind === 'requesting' ||
    voice.state.kind === 'recording' ||
    voice.state.kind === 'transcribing' ||
    voice.state.kind === 'error';

  const showSend = !voiceActive && input.trim().length > 0;
  const textareaDisabled = isProcessing || voiceActive;
  const placeholder =
    voice.state.kind === 'recording'
      ? 'Listening...'
      : voice.state.kind === 'transcribing'
        ? 'Transcribing...'
        : voice.state.kind === 'requesting'
          ? 'Waiting for mic access...'
          : 'What would you like to do?';

  return (
    <Modal
      title="Inklet - AI Assistant"
      onClose={closePanel}
      width="lg:max-w-[520px]"
      fullScreenMobile={true}
      canCollapse={false}
    >
      {/* Listening orb — floats above everything during recording */}
      <AnimatePresence>
        {voice.state.kind === 'recording' && (
          <ListeningOrb
            level={voice.state.level}
            onStop={voice.stopManual}
          />
        )}
      </AnimatePresence>

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
              placeholder={placeholder}
              rows={1}
              className="flex-1 bg-input border border-border/60 rounded-xl px-4 py-3 text-[15px] text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 resize-none transition-colors max-h-[120px]"
              style={{ minHeight: 48 }}
              disabled={textareaDisabled}
            />
            {showSend ? (
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isProcessing}
                className="w-14 h-14 bg-accent text-bg rounded-xl flex items-center justify-center shrink-0 cursor-pointer press-scale transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-glow active:shadow-glow-strong"
              >
                <Send size={22} />
              </button>
            ) : (
              <MicButton
                state={voice.state}
                onStart={voice.start}
                onStopManual={voice.stopManual}
                disabled={isProcessing}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
