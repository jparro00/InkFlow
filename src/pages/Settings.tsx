import { useClientStore } from '../stores/clientStore';
import { useBookingStore } from '../stores/bookingStore';
import { useState } from 'react';

export default function SettingsPage() {
  const clients = useClientStore((s) => s.clients);
  const bookings = useBookingStore((s) => s.bookings);
  const [exportClient, setExportClient] = useState('');
  const [exported, setExported] = useState(false);

  const handleExport = () => {
    const client = clients.find(
      (c) => c.name.toLowerCase() === exportClient.toLowerCase()
    );
    if (!client) return;

    const clientBookings = bookings.filter((b) => b.client_id === client.id);
    const data = { client, bookings: clientBookings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${client.name.replace(/\s+/g, '_')}_export.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 3000);
  };

  const sectionClass = "mb-10";
  const cardClass = "bg-surface/60 rounded-xl border border-border/30 p-5 space-y-5";
  const rowClass = "flex items-center justify-between min-h-[48px]";
  const inputClass = "w-full bg-input border border-border/60 rounded-xl px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]";

  return (
    <div className="px-5 pt-6 pb-8 lg:px-6 lg:pt-6 max-w-xl">
      <h1 className="font-display text-2xl lg:text-2xl text-text-p mb-8">Settings</h1>

      <section className={sectionClass}>
        <h2 className="text-md text-text-p font-display mb-3">Account</h2>
        <div className={cardClass}>
          <div className={rowClass}>
            <span className="text-base text-text-s">Change password</span>
            <button className="text-base text-accent active:text-accent-dim transition-colors cursor-pointer press-scale min-h-[44px] px-2">
              Change
            </button>
          </div>
          <div className="h-px bg-border/30" />
          <div className={rowClass}>
            <span className="text-base text-text-s">Backup recovery codes</span>
            <button className="text-base text-accent active:text-accent-dim transition-colors cursor-pointer press-scale min-h-[44px] px-2">
              Regenerate
            </button>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-md text-text-p font-display mb-3">Two-Factor Authentication</h2>
        <div className={cardClass}>
          <div className={rowClass}>
            <div>
              <div className="text-base text-text-p">TOTP Status</div>
              <div className="text-sm text-success mt-1">Enabled</div>
            </div>
            <button className="text-base text-accent active:text-accent-dim transition-colors cursor-pointer press-scale min-h-[44px] px-2">
              Re-enroll
            </button>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-md text-text-p font-display mb-3">Session</h2>
        <div className={cardClass}>
          <div className={rowClass}>
            <span className="text-base text-text-s">Auto-logout timeout</span>
            <select className="bg-input border border-border/60 rounded-xl px-4 py-3 text-base text-text-p cursor-pointer min-h-[48px]">
              <option>4 hours</option>
              <option>8 hours</option>
              <option>12 hours</option>
              <option>24 hours</option>
            </select>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-md text-text-p font-display mb-3">Privacy</h2>
        <div className={cardClass}>
          <div className="text-base text-text-s mb-2">Export all data for a client</div>
          <div className="flex gap-3">
            <input
              type="text"
              value={exportClient}
              onChange={(e) => setExportClient(e.target.value)}
              placeholder="Client name..."
              className={`${inputClass} flex-1`}
            />
            <button
              onClick={handleExport}
              disabled={!exportClient.trim()}
              className="px-5 py-3.5 text-base bg-accent text-bg rounded-xl cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 min-h-[48px]"
            >
              {exported ? 'Done!' : 'Export'}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-md text-text-p font-display mb-3">About</h2>
        <div className={cardClass}>
          <div className="text-base text-text-s">InkFlow MVP v0.1.0</div>
          <div className="text-sm text-text-t leading-relaxed">
            InkFlow stores client contact information and booking data for
            business purposes. No data is shared with third parties. No
            third-party analytics or tracking SDKs are used. Client data can be
            exported and deleted upon request via Settings &gt; Privacy.
          </div>
          <div className="text-xs text-text-t">
            Legal consultation recommended before storing Tennessee DL scans digitally.
          </div>
        </div>
      </section>
    </div>
  );
}
