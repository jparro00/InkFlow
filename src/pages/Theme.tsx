import { useState, useCallback } from 'react';

// Helper: convert hex to rgba string for glow effects
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function Swatch({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <div className="relative w-8 h-8 rounded-md border border-border/30 shrink-0 overflow-hidden">
        <div className="absolute inset-0" style={{ background: value }} />
        <input
          type="color"
          value={value.startsWith('#') ? value : '#888888'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
      <div>
        <div className="text-xs text-text-s group-hover:text-text-p transition-colors">{name}</div>
        <div className="text-xs text-text-t font-mono">{value}</div>
      </div>
    </label>
  );
}

const defaults = {
  accent: '#B08CE8',
  'accent-dim': '#8466B8',
  danger: '#CF6679',
  success: '#22D3EE',
  today: '#E05068',
  bg: '#121212',
  surface: '#1E1E1E',
  elevated: '#272727',
  input: '#2C2C2C',
  Regular: '#5BA2FF',
  'Touch Up': '#E8A87C',
  Consultation: '#6BB89E',
  'Full Day': '#D4A65A',
};

type ColorKey = keyof typeof defaults;

export default function ThemePage() {
  const [colors, setColors] = useState(defaults);

  const update = useCallback((key: ColorKey, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));

    // Live-update CSS custom properties so Tailwind classes respond
    const cssMap: Partial<Record<ColorKey, string>> = {
      accent: '--color-accent',
      'accent-dim': '--color-accent-dim',
      danger: '--color-danger',
      success: '--color-success',
      today: '--color-today',
      bg: '--color-bg',
      surface: '--color-surface',
      elevated: '--color-elevated',
      input: '--color-input',
    };
    const prop = cssMap[key];
    if (prop) {
      document.documentElement.style.setProperty(prop, value);
    }

    // Update glow shadows when accent changes
    if (key === 'accent') {
      const rgb = hexToRgb(value);
      document.documentElement.style.setProperty('--color-accent-glow', `rgba(${rgb},0.12)`);
      document.documentElement.style.setProperty('--shadow-glow', `0 0 14px rgba(${rgb},0.20)`);
      document.documentElement.style.setProperty('--shadow-glow-strong', `0 0 22px rgba(${rgb},0.32)`);
    }
  }, []);

  const reset = useCallback(() => {
    setColors(defaults);
    // Clear all inline overrides
    const props = ['--color-accent', '--color-accent-dim', '--color-accent-glow', '--color-danger', '--color-success', '--color-today', '--color-bg', '--color-surface', '--color-elevated', '--color-input', '--shadow-glow', '--shadow-glow-strong'];
    props.forEach((p) => document.documentElement.style.removeProperty(p));
  }, []);

  const accentRgb = hexToRgb(colors.accent);

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="px-5 pt-6 pb-16 lg:px-8 max-w-xl mx-auto">

        {/* Brand */}
        <div className="flex items-center gap-4 mb-10">
          <img
            src={import.meta.env.BASE_URL + 'inkflow_logo.png'}
            alt="InkFlow"
            className="w-14 h-14 rounded-lg"
          />
          <div className="flex-1">
            <h1 className="font-display text-2xl text-text-p">InkFlow</h1>
            <p className="text-sm text-text-t">Theme Reference</p>
          </div>
          <button
            onClick={reset}
            className="px-3 py-1.5 text-xs rounded-md border border-border/60 text-text-t active:text-text-s press-scale cursor-pointer"
          >
            Reset
          </button>
        </div>

        {/* Fonts */}
        <section className="mb-10">
          <div className="text-xs text-accent uppercase tracking-wider font-medium mb-4">Fonts</div>

          <div className="mb-6">
            <div className="text-xs text-text-t mb-2">Display &mdash; DM Serif Display</div>
            <p className="font-display text-2xl text-text-p">April 2026</p>
            <p className="font-display text-xl text-text-s">New Booking</p>
            <p className="font-display text-lg text-text-t">Settings</p>
          </div>

          <div>
            <div className="text-xs text-text-t mb-2">UI &mdash; System Stack</div>
            <p className="text-md text-text-p">Sarah Mitchell &middot; Regular</p>
            <p className="text-base text-text-s">10:00 AM &mdash; 1:00 PM (3h)</p>
            <p className="text-sm text-text-t">Estimate: $450 &middot; Confirmed</p>
          </div>
        </section>

        {/* Colors */}
        <section className="mb-10">
          <div className="text-xs text-accent uppercase tracking-wider font-medium mb-4">Colors</div>

          <div className="text-xs text-text-t mb-2">UI colors</div>
          <div className="flex flex-wrap gap-x-5 gap-y-3 mb-5">
            {(['accent', 'accent-dim', 'danger', 'success', 'today', 'bg', 'surface', 'elevated', 'input'] as ColorKey[]).map((key) => (
              <Swatch key={key} name={key} value={colors[key]} onChange={(v) => update(key, v)} />
            ))}
          </div>

          <div className="text-xs text-text-t mb-2">Booking types</div>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {(['Regular', 'Touch Up', 'Consultation', 'Full Day'] as ColorKey[]).map((key) => (
              <Swatch key={key} name={key} value={colors[key]} onChange={(v) => update(key, v)} />
            ))}
          </div>
        </section>

        {/* Components */}
        <section className="mb-10">
          <div className="text-xs text-accent uppercase tracking-wider font-medium mb-4">Components</div>

          {/* Buttons */}
          <div className="mb-5">
            <div className="text-xs text-text-t mb-2">Buttons</div>
            <div className="flex flex-wrap gap-3">
              <button className="px-5 py-2.5 bg-accent text-bg rounded-md font-medium shadow-glow active:shadow-glow-strong press-scale cursor-pointer text-sm">Save Booking</button>
              <button className="px-5 py-2.5 rounded-md border border-border/60 text-text-s text-sm press-scale cursor-pointer">Cancel</button>
              <button className="px-5 py-2.5 text-accent text-sm press-scale cursor-pointer">View Profile</button>
              <button className="px-5 py-2.5 bg-accent text-bg rounded-md font-medium opacity-40 cursor-not-allowed text-sm">Disabled</button>
            </div>
          </div>

          {/* Mini calendar */}
          <div className="mb-5">
            <div className="text-xs text-text-t mb-2">Calendar</div>
            <div className="bg-surface/60 border border-border/30 rounded-lg p-3">
              <div className="font-display text-lg text-text-p mb-2">April</div>
              <div className="grid grid-cols-7 gap-y-1 text-center">
                {['S','M','T','W','T','F','S'].map((d, i) => (
                  <div key={i} className="text-xs text-text-t font-medium py-1">{d}</div>
                ))}
                {/* Empty cells for April 2026 starting on Wednesday */}
                {[null, null, null].map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => {
                  const isToday = day === 12;
                  const hasBooking = [2, 3, 4, 7, 8, 9, 10, 14, 16, 21, 23, 28].includes(day);
                  return (
                    <div key={day} className="flex flex-col items-center py-0.5">
                      <span
                        className="w-7 h-7 flex items-center justify-center rounded-full text-xs"
                        style={isToday ? { backgroundColor: colors.today, color: '#fff', fontWeight: 600 } : undefined}
                      >
                        <span className={isToday ? '' : 'text-text-p'}>{day}</span>
                      </span>
                      {hasBooking && !isToday && <span className="w-1 h-1 rounded-full bg-text-t mt-0.5" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Inputs */}
          <div className="mb-5">
            <div className="text-xs text-text-t mb-2">Inputs</div>
            <div className="space-y-2">
              <input className="w-full bg-input border border-border/60 rounded-md px-4 py-3 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors" placeholder="Search clients..." readOnly />
              <input className="w-full bg-input border-2 border-danger/60 rounded-md px-4 py-3 text-base text-text-p placeholder:text-text-t" placeholder="Required field" readOnly />
            </div>
          </div>

          {/* Booking cards */}
          <div className="mb-5">
            <div className="text-xs text-text-t mb-2">Booking cards</div>
            <div className="space-y-2">
              {(['Regular', 'Touch Up', 'Consultation', 'Full Day'] as const).map((type) => (
                <div
                  key={type}
                  className="p-3 rounded-lg border border-border/30 flex items-center gap-3"
                  style={{ borderLeftWidth: 3, borderLeftColor: colors[type], backgroundColor: `${colors[type]}12` }}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colors[type] }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-p font-medium">{type === 'Regular' ? 'Sarah Mitchell' : type === 'Touch Up' ? 'Jake Donovan' : type === 'Consultation' ? 'Alyssa Chen' : 'Tyler Brooks'}</div>
                    <div className="text-xs text-text-s">{type} &middot; 3h</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tab bar */}
          <div className="mb-5">
            <div className="text-xs text-text-t mb-2">Tab bar</div>
            <div className="bg-surface/80 border border-border/60 rounded-lg p-3">
              <div className="flex items-center justify-around">
                {[
                  { label: 'Calendar', active: true },
                  { label: 'Clients', active: false },
                  { label: 'Messages', active: false },
                  { label: 'Settings', active: false },
                ].map((tab) => (
                  <div
                    key={tab.label}
                    className="relative flex flex-col items-center gap-1 px-4 py-2 rounded-lg"
                    style={{ color: tab.active ? colors.accent : undefined }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                      style={tab.active ? { filter: `drop-shadow(0 0 6px rgba(${accentRgb},0.5)) drop-shadow(0 0 14px rgba(${accentRgb},0.25))` } : undefined}
                    >
                      {tab.label === 'Calendar' && <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>}
                      {tab.label === 'Clients' && <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>}
                      {tab.label === 'Messages' && <><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></>}
                      {tab.label === 'Settings' && <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>}
                    </svg>
                    <span className={`text-xs font-medium ${tab.active ? '' : 'text-text-t'}`}>{tab.label}</span>
                    {tab.active && (
                      <span
                        className="absolute bottom-0.5 left-1/2 -translate-x-1/2 pointer-events-none"
                        style={{
                          width: 56,
                          height: 8,
                          background: `radial-gradient(ellipse 40% 50% at center, rgba(${accentRgb},0.9) 0%, rgba(${accentRgb},0.4) 30%, rgba(${accentRgb},0.1) 60%, transparent 100%)`,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Status chips */}
          <div>
            <div className="text-xs text-text-t mb-2">Status</div>
            <div className="flex flex-wrap gap-2">
              {['Confirmed', 'Tentative', 'Completed', 'Cancelled'].map((s) => (
                <span key={s} className="px-3 py-2 text-sm rounded-md border border-border/60 text-text-s">{s}</span>
              ))}
            </div>
          </div>
        </section>

        <div className="text-xs text-text-t text-center pt-4 border-t border-border/30">InkFlow v0.1.0</div>
      </div>
    </div>
  );
}
