import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Copy, Check } from 'lucide-react';
import QRCode from 'qrcode';
import { useUIStore } from '../stores/uiStore';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { saveApiKey, removeApiKey, hasApiKey } from '../services/apiKeyService';
import { THEMES, getTheme, applyTheme, type ThemeId } from '../lib/theme';

// Session-scoped cache so the API-key probe doesn't re-fire on every tab visit.
let _cachedApiKeyConfigured: boolean | null = null;

export default function SettingsPage() {
  const { setHeaderLeft, setHeaderRight } = useUIStore();
  const { signOut, session } = useAuth();
  const userId = session?.user?.id;
  const consentUrl = userId
    ? `${window.location.origin}/#/consent/${userId}`
    : '';
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [qrCopied, setQrCopied] = useState(false);

  useEffect(() => {
    if (!consentUrl || !qrCanvasRef.current) return;
    QRCode.toCanvas(qrCanvasRef.current, consentUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#FFFFFF', light: '#00000000' },
      errorCorrectionLevel: 'M',
    }).catch((err) => console.error('QR render failed', err));
  }, [consentUrl]);

  const copyConsentUrl = async () => {
    if (!consentUrl) return;
    try {
      await navigator.clipboard.writeText(consentUrl);
      setQrCopied(true);
      setTimeout(() => setQrCopied(false), 2000);
    } catch (e) {
      console.error('clipboard write failed', e);
    }
  };

  useEffect(() => {
    setHeaderLeft(null);
    setHeaderRight(null);
    return () => { setHeaderLeft(null); setHeaderRight(null); };
  }, [setHeaderLeft, setHeaderRight]);

  const [newPassword, setNewPassword] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [morningTime, setMorningTime] = useState(() => localStorage.getItem('inkbloop-morning-time') ?? '10:00');
  const [eveningTime, setEveningTime] = useState(() => localStorage.getItem('inkbloop-evening-time') ?? '18:00');
  const [timesSaved, setTimesSaved] = useState(false);

  // Studio name shown at the top of every consent PDF AND substituted into
  // 11 of the 12 waiver statements ("{studio} has given me…"). Persisted in
  // the studio_profiles table because the public consent flow (anonymous
  // client device) needs to read it — localStorage on the artist's own
  // device wouldn't be visible there.
  const [studioName, setStudioName] = useState('');
  const [studioNameSaved, setStudioNameSaved] = useState(false);
  const studioUserId = session?.user?.id;
  useEffect(() => {
    if (!studioUserId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('studio_profiles')
        .select('studio_name')
        .eq('user_id', studioUserId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.studio_name) {
        setStudioName(data.studio_name);
        return;
      }
      // One-shot migration: if the row is empty but the artist has a value
      // in localStorage from the pre-table era, write it through and clear
      // the legacy storage.
      const legacy = localStorage.getItem('inkbloop-studio-name');
      if (legacy) {
        await supabase.from('studio_profiles').upsert({
          user_id: studioUserId,
          studio_name: legacy,
        });
        localStorage.removeItem('inkbloop-studio-name');
        setStudioName(legacy);
      }
    })();
    return () => { cancelled = true; };
  }, [studioUserId]);

  const [theme, setTheme] = useState<ThemeId>(() => getTheme());

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'saved' | 'removed' | 'error'>('idle');

  useEffect(() => {
    if (_cachedApiKeyConfigured !== null) {
      setApiKeyConfigured(_cachedApiKeyConfigured);
      return;
    }
    hasApiKey().then((v) => {
      _cachedApiKeyConfigured = v;
      setApiKeyConfigured(v);
    });
  }, []);

  const handleChangePassword = async () => {
    if (!newPassword.trim()) return;
    setPasswordError('');
    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordSaved(true);
      setNewPassword('');
      setTimeout(() => setPasswordSaved(false), 3000);
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Failed to change password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const sectionClass = 'mb-10';
  const cardClass = 'bg-surface/60 rounded-lg border border-border/30 p-5 space-y-5';
  const inputClass = 'w-full bg-input border border-border/60 rounded-md px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]';
  const rowClass = 'flex items-center justify-between min-h-[48px]';

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-3 pb-8 lg:px-6 max-w-xl">
        <h1 className="font-display text-2xl lg:text-2xl text-text-p mb-8">Settings</h1>

        <section className={sectionClass}>
          <h2 className="text-md text-text-p font-display mb-3">Account</h2>
          <div className={cardClass}>
            <div>
              <div className="text-base text-text-s mb-2">Change password</div>
              <div className="flex gap-3">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); if (passwordError) setPasswordError(''); }}
                  placeholder="New password"
                  className={`${inputClass} flex-1`}
                />
                <button
                  onClick={handleChangePassword}
                  disabled={!newPassword.trim() || passwordSaving}
                  className="px-5 py-3.5 text-base bg-accent text-bg rounded-md cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 min-h-[48px]"
                >
                  {passwordSaving ? '...' : passwordSaved ? 'Updated!' : 'Change'}
                </button>
              </div>
              {passwordError && (
                <div className="text-sm text-danger mt-2">{passwordError}</div>
              )}
            </div>

            <button
              onClick={() => signOut()}
              className="w-full py-3.5 text-base text-danger rounded-md border border-danger/30 cursor-pointer press-scale transition-all active:bg-danger/10 min-h-[48px]"
            >
              Sign Out
            </button>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-md text-text-p font-display mb-3">Preferences</h2>
          <div className={cardClass}>
            <div className="text-base text-text-s mb-2">Default appointment start times</div>
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

          <div className={`${cardClass} mt-4`}>
            <div className="text-base text-text-s mb-2">Theme</div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {THEMES.map((t) => {
                const selected = theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setTheme(t.id); applyTheme(t.id); }}
                    className={`flex flex-col items-center gap-2 py-2 rounded-md cursor-pointer press-scale transition-all ${selected ? 'ring-2 ring-accent' : ''}`}
                    aria-pressed={selected}
                    aria-label={`Apply ${t.name} theme`}
                  >
                    <span
                      className="w-10 h-10 rounded-full border border-border/60 flex items-center justify-center"
                      style={{ background: t.bg }}
                    >
                      <span
                        className="w-5 h-5 rounded-full"
                        style={{ background: t.accent }}
                      />
                    </span>
                    <span className={`text-xs ${selected ? 'text-text-p' : 'text-text-t'}`}>{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-md text-text-p font-display mb-3">Consent forms</h2>
          <div className={cardClass}>
            <div>
              <div className="text-base text-text-s mb-1">Studio / artist name</div>
              <div className="text-sm text-text-t mb-3">
                Shown at the top of the consent PDF clients sign and download.
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={studioName}
                  onChange={(e) => setStudioName(e.target.value)}
                  placeholder="e.g. Black Anchor Tattoo"
                  className={`${inputClass} flex-1`}
                  maxLength={80}
                />
                <button
                  onClick={async () => {
                    if (!studioUserId) return;
                    const trimmed = studioName.trim();
                    await supabase.from('studio_profiles').upsert({
                      user_id: studioUserId,
                      studio_name: trimmed || null,
                    });
                    setStudioName(trimmed);
                    setStudioNameSaved(true);
                    setTimeout(() => setStudioNameSaved(false), 2000);
                  }}
                  className="shrink-0 px-5 py-3.5 text-base bg-accent text-bg rounded-md cursor-pointer press-scale transition-all min-h-[48px]"
                >
                  {studioNameSaved ? 'Saved!' : 'Save'}
                </button>
              </div>
            </div>

            <div>
              <div className="text-base text-text-s mb-1">Your QR code</div>
              <div className="text-sm text-text-t mb-4">
                Print this and let clients scan it before their session. Each scan opens your consent form.
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-md bg-bg/40 border border-border/40 p-4">
                  <canvas ref={qrCanvasRef} className="block" />
                </div>
                <div className="w-full">
                  <div className="text-xs text-text-t uppercase tracking-wider mb-1">Shareable URL</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={consentUrl}
                      readOnly
                      className={`${inputClass} flex-1 font-mono text-xs`}
                    />
                    <button
                      onClick={copyConsentUrl}
                      className="shrink-0 px-4 py-3.5 rounded-md border border-border/60 bg-input text-text-s cursor-pointer press-scale transition-all flex items-center gap-2 min-h-[48px]"
                      aria-label="Copy URL"
                    >
                      {qrCopied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-md text-text-p font-display mb-3">Support</h2>
          <div className={cardClass}>
            <Link
              to="/feedback"
              className={`${rowClass} -m-2 px-2 rounded-md cursor-pointer press-scale active:bg-elevated/40 transition-colors`}
            >
              <div>
                <div className="text-base text-text-p">Feedback</div>
                <div className="text-sm text-text-t mt-1">Tell us what you think.</div>
              </div>
              <ChevronRight size={18} className="text-text-t" />
            </Link>
          </div>
        </section>

        <section>
          <h2 className="text-md text-text-p font-display mb-3">AI Assistant</h2>
          <div className={cardClass}>
            <div className="text-base text-text-s mb-2">Anthropic API key</div>
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
                        _cachedApiKeyConfigured = false;
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
                        _cachedApiKeyConfigured = true;
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
            <div className="text-sm text-text-t">Powers the AI features in Ink Bloop (quick booking, message drafting, etc.). Stored encrypted on the server.</div>
          </div>
        </section>
      </div>
    </div>
  );
}
