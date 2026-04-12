import { useState } from 'react';
import Modal, { useModalDismiss } from '../common/Modal';
import { useClientStore } from '../../stores/clientStore';
import type { ClientChannel } from '../../types';

interface CreateClientFormProps {
  onClose: () => void;
}

const channels: ClientChannel[] = ['Phone', 'Instagram', 'Facebook'];

const inputClass = "w-full bg-input border border-border/60 rounded-md px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]";
const labelClass = "text-sm text-text-t uppercase tracking-wider mb-2 block font-medium";

/** Inner content — rendered inside Modal so useModalDismiss() has access to context. */
function CreateClientFormContent() {
  const addClient = useClientStore((s) => s.addClient);
  const dismiss = useModalDismiss();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<ClientChannel | ''>('');

  const isValid = name.trim().length > 0;

  const handleSave = () => {
    if (!isValid) return;
    addClient({
      name: name.trim(),
      phone: phone || undefined,
      channel: channel || undefined,
      tags: [],
    });
    dismiss();
  };

  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass}>Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Client name"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Phone</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Preferred Channel</label>
        <div className="flex gap-2">
          {channels.map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannel(channel === ch ? '' : ch)}
              className={`flex-1 py-3 text-base rounded-md border transition-colors cursor-pointer press-scale min-h-[48px] ${
                channel === ch
                  ? 'bg-accent/15 border-accent/40 text-accent'
                  : 'bg-input border-border/60 text-text-s'
              }`}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:justify-end gap-3 pt-4 border-t border-border/40">
        <button
          onClick={dismiss}
          className="hidden lg:block px-4 py-2.5 text-sm text-text-s hover:text-text-p transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid}
          className="w-full lg:w-auto px-6 py-4 lg:py-2.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-glow active:shadow-glow-strong min-h-[52px]"
        >
          Add Client
        </button>
      </div>
    </div>
  );
}

export default function CreateClientForm({ onClose }: CreateClientFormProps) {
  return (
    <Modal title="New Client" onClose={onClose} width="lg:max-w-[520px]">
      <CreateClientFormContent />
    </Modal>
  );
}
