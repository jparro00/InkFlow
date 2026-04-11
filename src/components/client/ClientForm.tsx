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

  // Parse existing dob into parts
  const parseDob = (dob: string) => {
    if (!dob) return { dobMonth: '', dobDay: '', dobYear: '' };
    const [y, m, d] = dob.split('-');
    return { dobMonth: String(parseInt(m)), dobDay: String(parseInt(d)), dobYear: y };
  };
  const initDob = parseDob(client?.dob ?? '');
  const defaultYear = String(new Date().getFullYear() - 18);

  const [form, setForm] = useState({
    name: client?.name ?? '',
    display_name: client?.display_name ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    instagram: client?.instagram ?? '',
    facebook_id: client?.facebook_id ?? '',
    dobMonth: initDob.dobMonth,
    dobDay: initDob.dobDay,
    dobYear: initDob.dobYear || defaultYear,
    tags: client?.tags.join(', ') ?? '',
  });

  // Compose dob string from parts
  const dobValue = form.dobMonth && form.dobDay && form.dobYear
    ? `${form.dobYear}-${form.dobMonth.padStart(2, '0')}-${form.dobDay.padStart(2, '0')}`
    : '';

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
      dob: dobValue || undefined,
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

  const inputClass = "w-full bg-input border border-border/60 rounded-md px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]";
  const errorInputClass = "w-full bg-input border border-danger/60 rounded-md px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-danger/40 transition-colors min-h-[48px]";
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
          <div className="grid grid-cols-3 gap-2">
            <select
              value={form.dobMonth}
              onChange={(e) => setForm((f) => ({ ...f, dobMonth: e.target.value }))}
              className={`${inputClass} cursor-pointer`}
            >
              <option value="">Month</option>
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                <option key={i} value={String(i + 1)}>{m}</option>
              ))}
            </select>
            <select
              value={form.dobDay}
              onChange={(e) => setForm((f) => ({ ...f, dobDay: e.target.value }))}
              className={`${inputClass} cursor-pointer`}
            >
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i} value={String(i + 1)}>{i + 1}</option>
              ))}
            </select>
            <select
              value={form.dobYear}
              onChange={(e) => setForm((f) => ({ ...f, dobYear: e.target.value }))}
              className={`${inputClass} cursor-pointer`}
            >
              <option value="">Year</option>
              {Array.from({ length: 100 }, (_, i) => {
                const y = new Date().getFullYear() - i;
                return <option key={y} value={String(y)}>{y}</option>;
              })}
            </select>
          </div>
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
            className="w-full lg:w-auto px-6 py-4 lg:py-2.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-glow active:shadow-glow-strong min-h-[52px]"
          >
            {client ? 'Update Client' : 'Add Client'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
