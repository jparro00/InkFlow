import { useState } from 'react';
import Modal from '../common/Modal';
import { useClientStore } from '../../stores/clientStore';
import type { Client } from '../../types';

interface ClientFormProps {
  client?: Client;
  onClose: () => void;
}

export default function ClientForm({ client, onClose }: ClientFormProps) {
  const addClient = useClientStore((s) => s.addClient);
  const updateClient = useClientStore((s) => s.updateClient);

  const [form, setForm] = useState({
    name: client?.name ?? '',
    nickname: client?.nickname ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    instagram: client?.instagram ?? '',
    dob: client?.dob ?? '',
    skin_tone: client?.skin_tone ?? '',
    allergies: client?.allergies ?? '',
    tags: client?.tags.join(', ') ?? '',
  });

  const handleSave = () => {
    const data = {
      name: form.name,
      nickname: form.nickname || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      instagram: form.instagram || undefined,
      dob: form.dob || undefined,
      skin_tone: form.skin_tone || undefined,
      allergies: form.allergies || undefined,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };

    if (client) {
      updateClient(client.id, data);
    } else {
      addClient(data);
    }
    onClose();
  };

  const inputClass = "w-full bg-input border border-border/60 rounded-xl px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]";
  const labelClass = "text-sm text-text-t uppercase tracking-wider mb-2 block font-medium";

  return (
    <Modal title={client ? 'Edit Client' : 'New Client'} onClose={onClose} width="lg:max-w-[520px]">
      <div className="space-y-5">
        <div>
          <label className={labelClass}>Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={inputClass}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Instagram</label>
            <input
              type="text"
              value={form.instagram}
              onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
              placeholder="@handle"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Date of Birth</label>
            <input
              type="date"
              value={form.dob}
              onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Skin Tone</label>
            <input
              type="text"
              value={form.skin_tone}
              onChange={(e) => setForm((f) => ({ ...f, skin_tone: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Nickname</label>
            <input
              type="text"
              value={form.nickname}
              onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Allergies</label>
          <textarea
            value={form.allergies}
            onChange={(e) => setForm((f) => ({ ...f, allergies: e.target.value }))}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div>
          <label className={labelClass}>Tags (comma separated)</label>
          <input
            type="text"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="returning, cover-up specialist"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col lg:flex-row lg:justify-end gap-3 pt-4 border-t border-border/40">
          <button
            onClick={onClose}
            className="hidden lg:block px-4 py-2.5 text-sm text-text-s hover:text-text-p transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.name.trim()}
            className="w-full lg:w-auto px-6 py-4 lg:py-2.5 text-base bg-accent text-bg rounded-xl font-medium cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[52px]"
          >
            {client ? 'Update Client' : 'Add Client'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
