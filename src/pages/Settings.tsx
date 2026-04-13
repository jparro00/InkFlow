import { useClientStore } from '../stores/clientStore';
import { useBookingStore } from '../stores/bookingStore';
import { useState, useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { saveApiKey, removeApiKey, hasApiKey } from '../services/apiKeyService';

export default function SettingsPage() {
  const clients = useClientStore((s) => s.clients);
  const bookings = useBookingStore((s) => s.bookings);
  const { setHeaderLeft, setHeaderRight } = useUIStore();
  const { signOut } = useAuth();

  useEffect(() => {
    setHeaderLeft(null);
    setHeaderRight(null);
    return () => { setHeaderLeft(null); setHeaderRight(null); };
  }, [setHeaderLeft, setHeaderRight]);
  const [exportClient, setExportClient] = useState('');
  const [exported, setExported] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'saved' | 'removed' | 'error'>('idle');
  const [morningTime, setMorningTime] = useState(() => localStorage.getItem('inkbloop-morning-time') ?? '10:00');
  const [eveningTime, setEveningTime] = useState(() => localStorage.getItem('inkbloop-evening-time') ?? '14:00');
  const [timesSaved, setTimesSaved] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpStatus, setTotpStatus] = useState<'checking' | 'enabled' | 'disabled'>('checking');

  // Check TOTP status on mount
  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const hasTotp = (data?.totp?.length ?? 0) > 0;
      setTotpStatus(hasTotp ? 'enabled' : 'disabled');
    });
  }, []);

  // Check API key status on mount
  useEffect(() => {
    hasApiKey().then(setApiKeyConfigured);
  }, []);

  const handleChangePassword = async () => {
    if (!newPassword.trim()) return;
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordSaved(true);
      setNewPassword('');
      setTimeout(() => setPasswordSaved(false), 3000);
    } catch (e) {
      console.error('Failed to change password:', e);
    }
  };

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
  const cardClass = "bg-surface/60 rounded-lg border border-border/30 p-5 space-y-5";
  const rowClass = "flex items-center justify-between min-h-[48px]";
  const inputClass = "w-full bg-input border border-border/60 rounded-md px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]";

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-3 pb-8 lg:px-6 max-w-xl">
      <h1 className="font-display text-2xl lg:text-2xl text-text-p mb-8">Settings</h1>

      <section className={sectionClass}>
        <h2 className="text-md text-text-p font-display mb-3">Account</h2>
        <div className={cardClass}>
          <div className="text-base text-text-s mb-2">Change password</div>
          <div className="flex gap-3">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className={`${inputClass} flex-1`}
            />
            <button
              onClick={handleChangePassword}
              disabled={!newPassword.trim()}
              className="px-5 py-3.5 text-base bg-accent text-bg rounded-md cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 min-h-[48px]"
            >
              {passwordSaved ? 'Updated!' : 'Change'}
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
              <div className={`text-sm mt-1 ${totpStatus === 'enabled' ? 'text-success' : totpStatus === 'disabled' ? 'text-text-t' : 'text-text-t'}`}>
                {totpStatus === 'checking' ? 'Checking...' : totpStatus === 'enabled' ? 'Enabled' : 'Not enrolled'}
              </div>
            </div>
            <button
              onClick={async () => {
                setTotpLoading(true);
                try {
                  if (totpStatus === 'enabled') {
                    const { data } = await supabase.auth.mfa.listFactors();
                    if (data?.totp?.[0]) {
                      await supabase.auth.mfa.unenroll({ factorId: data.totp[0].id });
                      setTotpStatus('disabled');
                    }
                  } else {
                    await supabase.auth.mfa.enroll({ factorType: 'totp' });
                    setTotpStatus('enabled');
                  }
                } catch (e) {
                  console.error('TOTP action failed:', e);
                }
                setTotpLoading(false);
              }}
              disabled={totpLoading || totpStatus === 'checking'}
              className="text-base text-accent active:text-accent-dim transition-colors cursor-pointer press-scale min-h-[44px] px-2 disabled:opacity-40"
            >
              {totpLoading ? '...' : totpStatus === 'enabled' ? 'Remove' : 'Enroll'}
            </button>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-md text-text-p font-display mb-3">Session</h2>
        <div className={cardClass}>
          <button
            onClick={() => signOut()}
            className="w-full py-3.5 text-base text-danger rounded-md border border-danger/30 cursor-pointer press-scale transition-all active:bg-danger/10 min-h-[48px]"
          >
            Sign Out
          </button>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-md text-text-p font-display mb-3">Appointment Times</h2>
        <div className={cardClass}>
          <div className="text-base text-text-s mb-2">Default morning and evening start times</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-text-t uppercase tracking-wider mb-2 block font-medium">Morning</label>
              <input
                type="time"
                value={morningTime}
                onChange={(e) => setMorningTime(e.target.value)}
                className={`${inputClass} [color-scheme:dark] appearance-none`}
                style={{ height: 48 }}
              />
            </div>
            <div>
              <label className="text-sm text-text-t uppercase tracking-wider mb-2 block font-medium">Evening</label>
              <input
                type="time"
                value={eveningTime}
                onChange={(e) => setEveningTime(e.target.value)}
                className={`${inputClass} [color-scheme:dark] appearance-none`}
                style={{ height: 48 }}
              />
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.setItem('inkbloop-morning-time', morningTime);
              localStorage.setItem('inkbloop-evening-time', eveningTime);
              setTimesSaved(true);
              setTimeout(() => setTimesSaved(false), 2000);
            }}
            className="w-full py-3.5 text-base bg-accent text-bg rounded-md cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong min-h-[48px]"
          >
            {timesSaved ? 'Saved!' : 'Save Times'}
          </button>
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
              className="px-5 py-3.5 text-base bg-accent text-bg rounded-md cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-glow active:shadow-glow-strong shrink-0 min-h-[48px]"
            >
              {exported ? 'Done!' : 'Export'}
            </button>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-md text-text-p font-display mb-3">AI Quick Booking</h2>
        <div className={cardClass}>
          <div className="text-base text-text-s mb-2">Anthropic API key for AI-powered quick booking</div>
          {apiKeyConfigured ? (
            <>
              <div className={rowClass}>
                <div>
                  <div className="text-base text-text-p">API Key</div>
                  <div className="text-sm text-success mt-1">Configured</div>
                </div>
                <button
                  onClick={async () => {
                    setApiKeySaving(true);
                    try {
                      await removeApiKey();
                      setApiKeyConfigured(false);
                      setApiKeyStatus('removed');
                      setTimeout(() => setApiKeyStatus('idle'), 2000);
                    } catch (e) {
                      console.error('Failed to remove API key:', e);
                      setApiKeyStatus('error');
                      setTimeout(() => setApiKeyStatus('idle'), 2000);
                    }
                    setApiKeySaving(false);
                  }}
                  disabled={apiKeySaving}
                  className="text-base text-danger active:text-danger/70 transition-colors cursor-pointer press-scale min-h-[44px] px-2 disabled:opacity-40"
                >
                  {apiKeySaving ? '...' : 'Remove'}
                </button>
              </div>
              {apiKeyStatus === 'removed' && (
                <div className="text-sm text-success">Key removed.</div>
              )}
            </>
          ) : (
            <>
              <div className="flex gap-3">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-ant-..."
                  className={`${inputClass} flex-1`}
                />
                <button
                  onClick={async () => {
                    if (!apiKeyInput.trim()) return;
                    setApiKeySaving(true);
                    try {
                      await saveApiKey(apiKeyInput.trim());
                      setApiKeyConfigured(true);
                      setApiKeyInput('');
                      setApiKeyStatus('saved');
                      setTimeout(() => setApiKeyStatus('idle'), 2000);
                    } catch (e) {
                      console.error('Failed to save API key:', e);
                      setApiKeyStatus('error');
                      setTimeout(() => setApiKeyStatus('idle'), 2000);
                    }
                    setApiKeySaving(false);
                  }}
                  disabled={!apiKeyInput.trim() || apiKeySaving}
                  className="px-5 py-3.5 text-base bg-accent text-bg rounded-md cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 min-h-[48px]"
                >
                  {apiKeySaving ? '...' : apiKeyStatus === 'saved' ? 'Saved!' : 'Save'}
                </button>
              </div>
              {apiKeyStatus === 'error' && (
                <div className="text-sm text-danger">Failed to save. Try again.</div>
              )}
            </>
          )}
          <div className="text-sm text-text-t">Uses Claude Haiku to parse natural language bookings. Key is encrypted and stored securely on the server.</div>
        </div>
      </section>

      <section>
        <h2 className="text-md text-text-p font-display mb-3">About</h2>
        <div className={cardClass}>
          <div className="text-base text-text-s">Ink Bloop v0.1.0</div>
          <div className="text-sm text-text-t leading-relaxed">
            Ink Bloop stores client contact information and booking data for
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
    </div>
  );
}
