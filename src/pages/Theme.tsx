import { useState, useCallback } from 'react';
import { THEMES, getTheme, applyTheme, type ThemeId } from '../lib/theme';
import Logo from '../components/common/Logo';

// --- Color helpers ---
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function hexToHsl(hex: string): [number, number, number] {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  h /= 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return `#${v.toString(16).padStart(2,'0')}${v.toString(16).padStart(2,'0')}${v.toString(16).padStart(2,'0')}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// --- Swatch ---
function Swatch({ name, value, selected, onTap, onChange: _onChange }: {
  name: string; value: string; selected: boolean;
  onTap: () => void; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onTap}
        className={`relative w-9 h-9 rounded-md shrink-0 overflow-hidden cursor-pointer transition-all ${
          selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : 'border border-border/30'
        }`}
        style={{ background: value }}
      />
      <label className="cursor-pointer" onClick={onTap}>
        <div className="text-xs text-text-s">{name}</div>
        <div className="text-xs text-text-t font-mono">{value}</div>
      </label>
    </div>
  );
}

// --- Hue slider ---
function HueSlider({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, s, l] = hexToHsl(value);
  return (
    <div className="pt-2 pb-1 space-y-2">
      <input
        type="range"
        min={0}
        max={360}
        value={Math.round(h)}
        onChange={(e) => onChange(hslToHex(parseInt(e.target.value), s, l))}
        className="w-full h-8 rounded-md appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => hslToHex(i * 30, s, l)).join(', ')})`,
          WebkitAppearance: 'none',
        }}
      />
      <label className="flex items-center gap-2 px-3 py-2 text-xs rounded-md border border-border/60 text-text-s active:text-text-p active:bg-elevated press-scale cursor-pointer relative overflow-hidden">
        <span className="w-4 h-4 rounded-sm shrink-0 border border-border/30" style={{ background: value }} />
        Full color picker
        <input
          type="color"
          value={value.startsWith('#') ? value : '#888888'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </label>
      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px; height: 28px;
          border-radius: 6px;
          background: ${value};
          border: 3px solid rgba(255,255,255,0.9);
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          width: 20px; height: 28px;
          border-radius: 6px;
          background: ${value};
          border: 3px solid rgba(255,255,255,0.9);
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

// --- Defaults ---
const defaults = {
  accent: '#DE0000',
  'accent-dim': '#CC0068',
  danger: '#FE0000',
  success: '#FECA00',
  today: '#EE4700',
  bg: '#110D18',
  surface: '#1A1525',
  elevated: '#241E30',
  input: '#2A2337',
  border: '#342D42',
  'border-s': '#3E3650',
  Regular: '#B813FF',
  'Touch Up': '#F67100',
  Consultation: '#FE84FF',
  'Full Day': '#FF00AC',
  'Cover Up': '#1E90FF',
  Personal: '#10D897',
};

type ColorKey = keyof typeof defaults;

const cssMap: Record<ColorKey, string> = {
  accent: '--color-accent',
  'accent-dim': '--color-accent-dim',
  danger: '--color-danger',
  success: '--color-success',
  today: '--color-today',
  bg: '--color-bg',
  surface: '--color-surface',
  elevated: '--color-elevated',
  input: '--color-input',
  border: '--color-border',
  'border-s': '--color-border-s',
  Regular: '--color-type-regular',
  'Touch Up': '--color-type-touchup',
  Consultation: '--color-type-consult',
  'Full Day': '--color-type-fullday',
  'Cover Up': '--color-type-coverup',
  Personal: '--color-type-personal',
};

/** Read the live CSS variable value for each color, falling back to defaults. */
function readLiveColors(): Record<ColorKey, string> {
  const style = getComputedStyle(document.documentElement);
  const live = { ...defaults };
  for (const key of Object.keys(cssMap) as ColorKey[]) {
    const raw = style.getPropertyValue(cssMap[key]).trim();
    // Only use it if it looks like a hex color (skip rgba values like text-p)
    if (raw && raw.startsWith('#')) {
      live[key] = raw;
    } else if (raw) {
      // Convert rgb(r, g, b) to hex
      const match = raw.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
      if (match) {
        const [, r, g, b] = match;
        live[key] = `#${Number(r).toString(16).padStart(2, '0')}${Number(g).toString(16).padStart(2, '0')}${Number(b).toString(16).padStart(2, '0')}`;
      }
    }
  }
  return live;
}

export default function ThemePage() {
  const [colors, setColors] = useState(readLiveColors);
  const [selected, setSelected] = useState<ColorKey | null>(null);
  const [activeTheme, setActiveTheme] = useState<ThemeId>(() => getTheme());

  const clearInlineOverrides = useCallback(() => {
    Object.values(cssMap).forEach((p) => {
      if (p) document.documentElement.style.removeProperty(p);
    });
    ['--color-accent-glow', '--accent-rgb', '--shadow-glow', '--shadow-glow-strong'].forEach((p) =>
      document.documentElement.style.removeProperty(p),
    );
  }, []);

  const handleThemeChange = useCallback((id: ThemeId) => {
    clearInlineOverrides();
    applyTheme(id);
    setActiveTheme(id);
    setSelected(null);
    // CSS-var updates are synchronous — reading getComputedStyle now reflects the new theme
    setColors(readLiveColors());
  }, [clearInlineOverrides]);

  const update = useCallback((key: ColorKey, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));

    const prop = cssMap[key];
    if (prop) document.documentElement.style.setProperty(prop, value);

    if (key === 'accent') {
      const rgb = hexToRgb(value);
      document.documentElement.style.setProperty('--accent-rgb', rgb);
      document.documentElement.style.setProperty('--color-accent-glow', `rgba(${rgb},0.12)`);
      document.documentElement.style.setProperty('--shadow-glow', `0 0 14px rgba(${rgb},0.20)`);
      document.documentElement.style.setProperty('--shadow-glow-strong', `0 0 22px rgba(${rgb},0.32)`);
    }
  }, []);

  const reset = useCallback(() => {
    setSelected(null);
    clearInlineOverrides();
    setColors(readLiveColors());
  }, [clearInlineOverrides]);

  const accentRgb = hexToRgb(colors.accent);

  const renderSwatchGroup = (keys: ColorKey[]) => (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        {keys.map((key) => (
          <Swatch
            key={key}
            name={key}
            value={colors[key]}
            selected={selected === key}
            onTap={() => setSelected(selected === key ? null : key)}
            onChange={(v) => update(key, v)}
          />
        ))}
      </div>
      {selected && keys.includes(selected) && (
        <HueSlider value={colors[selected]} onChange={(v) => update(selected, v)} />
      )}
    </>
  );

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="px-5 pt-6 pb-16 lg:px-8 max-w-xl mx-auto">

        {/* Brand */}
        <div className="flex items-center gap-4 mb-10">
          <Logo className="w-14 h-14" />
          <div className="flex-1">
            <h1 className="font-display text-2xl text-text-p">Ink Bloop</h1>
            <p className="text-sm text-text-t">Theme Reference</p>
          </div>
          <button
            onClick={reset}
            className="px-4 py-2.5 text-sm bg-accent text-bg rounded-md font-medium shadow-glow active:shadow-glow-strong press-scale cursor-pointer"
          >
            Reset
          </button>
        </div>

        {/* Theme picker */}
        <section className="mb-10">
          <div className="text-xs text-accent uppercase tracking-wider font-medium mb-4">Theme</div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {THEMES.map((t) => {
              const selectedTheme = activeTheme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleThemeChange(t.id)}
                  className={`flex flex-col items-center gap-2 py-2 rounded-md cursor-pointer press-scale transition-all ${selectedTheme ? 'ring-2 ring-accent' : ''}`}
                  aria-pressed={selectedTheme}
                  aria-label={`Apply ${t.name} theme`}
                >
                  <span
                    className="w-10 h-10 rounded-full border border-border/60 flex items-center justify-center"
                    style={{ background: t.bg }}
                  >
                    <span className="w-5 h-5 rounded-full" style={{ background: t.accent }} />
                  </span>
                  <span className={`text-xs ${selectedTheme ? 'text-text-p' : 'text-text-t'}`}>{t.name}</span>
                </button>
              );
            })}
          </div>
        </section>

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

          <div className="text-xs text-text-t mb-2">Accent &amp; status</div>
          <div className="mb-5">
            {renderSwatchGroup(['accent', 'accent-dim', 'danger', 'success', 'today'])}
          </div>

          <div className="text-xs text-text-t mb-2">Surfaces &amp; borders</div>
          <div className="mb-5">
            {renderSwatchGroup(['bg', 'surface', 'elevated', 'input', 'border', 'border-s'])}
          </div>

          <div className="text-xs text-text-t mb-2">Booking types</div>
          {renderSwatchGroup(['Regular', 'Touch Up', 'Consultation', 'Full Day', 'Cover Up', 'Personal'])}
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
                {[null, null, null].map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => {
                  const isToday = day === 12;
                  const hasBooking = [2, 3, 4, 7, 8, 9, 10, 14, 16, 21, 23, 28].includes(day);
                  return (
                    <div key={day} className="flex flex-col items-center py-0.5">
                      <span
                        className="w-7 h-7 flex items-center justify-center rounded-full text-xs"
                        style={isToday ? { backgroundColor: colors.today, color: 'var(--color-bg)', fontWeight: 600 } : undefined}
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
              {(['Regular', 'Touch Up', 'Consultation', 'Full Day', 'Cover Up', 'Personal'] as const).map((type) => (
                <div
                  key={type}
                  className="p-3 rounded-lg border border-border/30 flex items-center gap-3"
                  style={{ borderLeftWidth: 3, borderLeftColor: colors[type], backgroundColor: `${colors[type]}12` }}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colors[type] }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-p font-medium">{type === 'Regular' ? 'Sarah Mitchell' : type === 'Touch Up' ? 'Jake Donovan' : type === 'Consultation' ? 'Alyssa Chen' : type === 'Full Day' ? 'Tyler Brooks' : type === 'Cover Up' ? 'Morgan Blake' : 'Day Off'}</div>
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

        <div className="text-xs text-text-t text-center pt-4 border-t border-border/30">Ink Bloop v0.1.0</div>
      </div>
    </div>
  );
}
