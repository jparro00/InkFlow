import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Logo from '../components/common/Logo';

type Phase = 'credentials' | 'totp';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>('credentials');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');

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
          navigate('/');
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

        navigate('/');
      }
    } catch {
      setError('An unexpected error occurred');
    }

    setIsLoading(false);
  };

  const inputClass = "w-full bg-input border border-border/60 rounded-md px-4 py-4 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[52px]";

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-5 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-accent/[0.03] blur-[100px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10 login-fade-in">
        <div className="text-center mb-10 login-pulse">
          <Logo className="w-9 h-9 mx-auto" />
          <h1 className="font-display text-2xl text-text-p mt-3">Ink Bloop</h1>
          <p className="text-xs text-text-t mt-1.5 tracking-wider uppercase">Studio Management</p>
        </div>

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
              <div className="login-slide-in">
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
              </div>
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
                ? 'Signing in...'
                : phase === 'totp' ? 'Verify'
                : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
