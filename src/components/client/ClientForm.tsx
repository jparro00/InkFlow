import { useState } from 'react';
import Modal from '../common/Modal';
import { useClientStore } from '../../stores/clientStore';
import type { Client } from '../../types';

interface ClientFormProps {
  client?: Client;
  onClose: () => void;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const instagramRegex = /^@[\w.]+$/;
const facebookRegex = /^(\d+|https?:\/\/(www\.)?facebook\.com\/.+)$/;

export default function ClientForm({ client, onClose }: ClientFormProps) {
  const addClient = useClientStore((s) => s.addClient);
  const updateClient = useClientStore((s) => s.updateClient);

  const [form, setForm] = useState({
    name: client?.name ?? '',
    display_name: client?.display_name ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    instagram: client?.instagram ?? '',
    facebook_id: client?.facebook_id ?? '',
    dob: client?.dob ?? '',
    tags: client?.tags.join(', ') ?? '',
  });

  const emailValid = !form.email || emailRegex.test(form.email);
  const instagramValid = !form.instagram || instagramRegex.test(form.instagram);
  const facebookValid = !form.facebook_id || facebookRegex.test(form.facebook_id);
  const isValid = form.name.trim() && emailValid && instagramValid && facebookValid;

  const handleSave = () => {
    if (!isValid) return;
    const data = {
      name: form.name,
      display_name: form.display_name || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      instagram: form.instagram || undefined,
      facebook_id: form.facebook_id || undefined,
      dob: form.dob || undefined,
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
  const errorInputClass = "w-full bg-input border border-danger/60 rounded-xl px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-danger/40 transition-colors min-h-[48px]";
  const labelClass = "text-sm text-text-t uppercase tracking-wider mb-2 block font-medium";

  return (
    <Modal title={client ? 'Edit Client' : 'New Client'} onClose={onClose} width="lg:max-w-[520px]">
      <div className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
          <div>
            <label className={labelClass}>Display Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              placeholder="What you call them"
              className={inputClass}
            />
          </div>
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
              placeholder="name@example.com"
              className={form.email && !emailValid ? errorInputClass : inputClass}
            />
            {form.email && !emailValid && (
              <span className="text-xs text-danger mt-1 block">Enter a valid email</span>
            )}
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
              className={form.instagram && !instagramValid ? errorInputClass : inputClass}
            />
            {form.instagram && !instagramValid && (
              <span className="text-xs text-danger mt-1 block">Must start with @ (letters, numbers, dots, underscores)</span>
            )}
          </div>
          <div>
            <label className={labelClass}>Facebook</label>
            <input
              type="text"
              value={form.facebook_id}
              onChange={(e) => setForm((f) => ({ ...f, facebook_id: e.target.value }))}
              placeholder="Profile URL or ID"
              className={form.facebook_id && !facebookValid ? errorInputClass : inputClass}
            />
            {form.facebook_id && !facebookValid && (
              <span className="text-xs text-danger mt-1 block">Enter a Facebook URL or numeric ID</span>
            )}
          </div>
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
            disabled={!isValid}
            className="w-full lg:w-auto px-6 py-4 lg:py-2.5 text-base bg-accent text-bg rounded-xl font-medium cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[52px]"
          >
            {client ? 'Update Client' : 'Add Client'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
