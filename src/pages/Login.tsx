import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showTotp, setShowTotp] = useState(false);
  const [totp, setTotp] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showTotp) {
      setShowTotp(true);
      return;
    }
    navigate('/');
  };

  const inputClass = "w-full bg-input border border-border/60 rounded-md px-4 py-4 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[52px]";

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-5 relative overflow-hidden">
      {/* Atmospheric background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-accent/[0.03] blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Logo */}
        <motion.div
          className="text-center mb-10"
          animate={{ scale: [1, 1.02, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="text-accent mx-auto">
            <path d="M12 2C12 2 9.5 8 9 12c-.3 2.5.5 4.5 2 6.5L12 20l1-1.5c1.5-2 2.3-4 2-6.5C14.5 8 12 2 12 2z" fill="currentColor" opacity="0.7"/>
            <path d="M12 18.5c-.3.8-.5 1.8-.4 2.8.05.4.15.7.4.7s.35-.3.4-.7c.1-1-.1-2-.4-2.8z" fill="currentColor"/>
          </svg>
          <h1 className="font-display text-2xl text-text-p mt-3">InkFlow</h1>
          <p className="text-xs text-text-t mt-1.5 tracking-wider uppercase">Studio Management</p>
        </motion.div>

        {/* Form */}
        <div className="bg-surface/60 border border-border/30 rounded-xl p-6 backdrop-blur-sm">
          <form onSubmit={handleLogin} className="space-y-4">
            {!showTotp ? (
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
                  />
                </div>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
              >
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

            <button
              type="submit"
              className="w-full py-4 bg-accent text-bg text-base rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong mt-3 min-h-[52px]"
            >
              {showTotp ? 'Verify' : 'Sign In'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
