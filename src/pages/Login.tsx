import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';

const DEVICE_ID_KEY = 'inkbloop-device-id';

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown device';
}

type Phase = 'credentials' | 'totp' | 'email-code';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>('credentials');
  const [totp, setTotp] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const checkDeviceTrust = async (): Promise<boolean> => {
    const deviceId = getOrCreateDeviceId();
    const { data } = await supabase
      .from('device_trusts')
      .select('id')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (data) {
      // Update last_used
      await supabase
        .from('device_trusts')
        .update({ last_used: new Date().toISOString() })
        .eq('id', data.id);
      return true;
    }
    return false;
  };

  const sendVerificationCode = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await supabase.functions.invoke('send-verification');
    if (res.error) throw new Error(res.error.message || 'Failed to send code');
    setCodeSent(true);
  };

  const proceedAfterAuth = async () => {
    const trusted = await checkDeviceTrust();
    if (trusted) {
      navigate('/');
      return;
    }

    // Untrusted device — send verification code
    try {
      await sendVerificationCode();
      setPhase('email-code');
      setIsLoading(false);
    } catch {
      // If email sending fails, let them in anyway (graceful degradation)
      console.error('Failed to send verification email, allowing login');
      navigate('/');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (phase === 'credentials') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError(signInError.message);
          setIsLoading(false);
          return;
        }

        // Check if MFA is required
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totpFactors = factors?.totp?.filter((f) => f.status === 'verified') ?? [];

        if (totpFactors.length > 0) {
          const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
            factorId: totpFactors[0].id,
          });

          if (challengeError) {
            setError(challengeError.message);
            setIsLoading(false);
            return;
          }

          setFactorId(totpFactors[0].id);
          setChallengeId(challenge.id);
          setPhase('totp');
          setIsLoading(false);
          return;
        }

        if (data.session) {
          await proceedAfterAuth();
        }
      } else if (phase === 'totp') {
        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId,
          challengeId,
          code: totp,
        });

        if (verifyError) {
          setError(verifyError.message);
          setTotp('');
          setIsLoading(false);
          return;
        }

        await proceedAfterAuth();
      } else if (phase === 'email-code') {
        const deviceId = getOrCreateDeviceId();
        const deviceName = getDeviceName();

        const res = await supabase.functions.invoke('verify-code', {
          body: { code: emailCode, deviceId, deviceName },
        });

        if (res.error || res.data?.error) {
          setError(res.data?.error || 'Invalid or expired code');
          setEmailCode('');
          setIsLoading(false);
          return;
        }

        navigate('/');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    }

    setIsLoading(false);
  };

  const handleResendCode = async () => {
    setError('');
    setIsLoading(true);
    try {
      await sendVerificationCode();
      setError('');
      setEmailCode('');
    } catch {
      setError('Failed to resend code');
    }
    setIsLoading(false);
  };

  const inputClass = "w-full bg-input border border-border/60 rounded-md px-4 py-4 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[52px]";

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-5 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-accent/[0.03] blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-sm relative z-10"
      >
        <motion.div
          className="text-center mb-10"
          animate={{ scale: [1, 1.02, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <img src={`${import.meta.env.BASE_URL}inkbloop_logo.png`} alt="Ink Bloop" className="w-9 h-9 mx-auto" />
          <h1 className="font-display text-2xl text-text-p mt-3">Ink Bloop</h1>
          <p className="text-xs text-text-t mt-1.5 tracking-wider uppercase">Studio Management</p>
        </motion.div>

        <div className="bg-surface/60 border border-border/30 rounded-xl p-6 backdrop-blur-sm">
          <form onSubmit={handleLogin} className="space-y-4">
            {phase === 'credentials' && (
              <>
                <div>
                  <label className="text-xs text-text-t uppercase tracking-wider mb-1.5 block font-medium">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-text-t uppercase tracking-wider mb-1.5 block font-medium">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
              </>
            )}

            {phase === 'totp' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <label className="text-xs text-text-t uppercase tracking-wider mb-1.5 block font-medium">
                  Authentication Code
                </label>
                <input
                  type="text"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  className={`${inputClass} text-center tracking-[0.5em] text-lg`}
                  autoFocus
                />
                <p className="text-xs text-text-t mt-3 text-center">
                  Enter the code from your authenticator app
                </p>
              </motion.div>
            )}

            {phase === 'email-code' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <div className="text-center mb-4">
                  <div className="text-sm text-text-s mb-1">New device detected</div>
                  <div className="text-xs text-text-t">
                    We sent a code to <span className="text-text-s">{email}</span>
                  </div>
                </div>
                <label className="text-xs text-text-t uppercase tracking-wider mb-1.5 block font-medium">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className={`${inputClass} text-center tracking-[0.5em] text-lg`}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={isLoading}
                  className="w-full text-center text-xs text-text-t mt-3 cursor-pointer hover:text-text-s transition-colors disabled:opacity-40"
                >
                  Didn't get it? Send again
                </button>
              </motion.div>
            )}

            {error && (
              <div className="text-sm text-danger text-center py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-accent text-bg text-base rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong mt-3 min-h-[52px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading
                ? phase === 'email-code' ? 'Verifying...' : 'Signing in...'
                : phase === 'email-code' ? 'Verify'
                : phase === 'totp' ? 'Verify'
                : 'Sign In'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
