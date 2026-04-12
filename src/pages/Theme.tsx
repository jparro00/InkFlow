export default function ThemePage() {
  const colors = {
    'Backgrounds': [
      { name: 'bg', value: '#121212', label: '0dp — Page background' },
      { name: 'surface', value: '#1E1E1E', label: '1dp — Cards, sidebar' },
      { name: 'elevated', value: '#272727', label: '4dp — Modals, toasts' },
      { name: 'input', value: '#2C2C2C', label: '6dp — Form inputs' },
      { name: 'border', value: '#333333', label: '12dp — Dividers' },
      { name: 'border-s', value: '#383838', label: '24dp — Strong dividers' },
    ],
    'Text (white at M2 opacity)': [
      { name: 'text-p', value: 'rgba(255,255,255,0.87)', label: 'High emphasis — 87%' },
      { name: 'text-s', value: 'rgba(255,255,255,0.60)', label: 'Medium emphasis — 60%' },
      { name: 'text-t', value: 'rgba(255,255,255,0.38)', label: 'Disabled / tertiary — 38%' },
    ],
    'Accent': [
      { name: 'accent', value: '#B08CE8', label: 'Primary — Inky Purple' },
      { name: 'accent-dim', value: '#8466B8', label: 'Pressed / active' },
      { name: 'accent-glow', value: 'rgba(176,140,232,0.12)', label: 'Background tint' },
    ],
    'Status': [
      { name: 'danger', value: '#CF6679', label: 'Errors, rescheduled' },
      { name: 'success', value: '#22D3EE', label: 'Success state (cyan)' },
      { name: 'today', value: '#E05068', label: 'Current day indicator' },
    ],
    'Booking Types': [
      { name: 'Regular', value: '#5BA2FF', label: 'Standard bookings' },
      { name: 'Touch Up', value: '#E8A87C', label: 'Quick sessions' },
      { name: 'Consultation', value: '#6BB89E', label: 'Planning meetings' },
      { name: 'Full Day', value: '#D4A65A', label: 'Multi-hour sessions' },
    ],
  };

  const typeScale = [
    { token: 'text-2xs', size: '10px', sample: 'Tiny labels, hour markers' },
    { token: 'text-xs', size: '11px', sample: 'Tab labels, badges, helper text' },
    { token: 'text-sm', size: '13px', sample: 'Captions, uppercase labels, secondary info' },
    { token: 'text-base', size: '15px', sample: 'Body text, form inputs, list items — the default' },
    { token: 'text-md', size: '17px', sample: 'Day headers, booking titles, emphasized UI' },
    { token: 'text-lg', size: '24px', sample: 'Section headers' },
    { token: 'text-xl', size: '32px', sample: 'Modal titles, page headings' },
    { token: 'text-2xl', size: '40px', sample: 'Month names, major headings' },
  ];

  const radii = [
    { token: 'radius-sm', value: '6px', use: 'Badges, chips, booking events' },
    { token: 'radius-md', value: '10px', use: 'Buttons, inputs, controls' },
    { token: 'radius-lg', value: '14px', use: 'Cards, containers, dropdowns' },
    { token: 'radius-xl', value: '20px', use: 'Modals, major overlays' },
  ];

  const shadows = [
    { token: 'shadow-glow', value: '0 0 14px rgba(176,140,232,0.20)', use: 'Ambient glow on buttons' },
    { token: 'shadow-glow-strong', value: '0 0 22px rgba(176,140,232,0.32)', use: 'Active/pressed state' },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 pt-6 pb-16 lg:px-8 max-w-3xl">

        {/* Header */}
        <div className="flex items-center gap-5 mb-10">
          <img
            src={import.meta.env.BASE_URL + 'inkflow_logo.png'}
            alt="InkFlow"
            className="w-16 h-16 rounded-xl"
          />
          <div>
            <h1 className="font-display text-2xl text-text-p">InkFlow</h1>
            <p className="text-sm text-text-s mt-1">Studio Management — Theme Reference</p>
          </div>
        </div>

        {/* Typography */}
        <section className="mb-12">
          <h2 className="font-display text-xl text-text-p mb-5">Typography</h2>

          <div className="bg-surface/60 rounded-lg border border-border/30 p-5 mb-5">
            <div className="flex flex-col lg:flex-row lg:gap-12 gap-6">
              <div className="flex-1">
                <div className="text-xs text-accent uppercase tracking-wider font-medium mb-3">Display — DM Serif Display</div>
                <p className="font-display text-2xl text-text-p mb-1">The quick brown fox</p>
                <p className="font-display text-xl text-text-p mb-1">jumps over the lazy dog</p>
                <p className="font-display text-lg text-text-s">ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
                <p className="font-display text-lg text-text-t">abcdefghijklmnopqrstuvwxyz 0123456789</p>
              </div>
              <div className="flex-1">
                <div className="text-xs text-accent uppercase tracking-wider font-medium mb-3">UI — System Stack</div>
                <p className="text-md text-text-p mb-1">The quick brown fox</p>
                <p className="text-base text-text-p mb-1">jumps over the lazy dog</p>
                <p className="text-sm text-text-s">ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
                <p className="text-sm text-text-t">abcdefghijklmnopqrstuvwxyz 0123456789</p>
              </div>
            </div>
          </div>

          <div className="bg-surface/60 rounded-lg border border-border/30 overflow-hidden">
            <div className="grid grid-cols-[auto_auto_1fr] text-sm">
              <div className="px-4 py-2.5 text-text-t font-medium border-b border-border/30 bg-surface/40">Token</div>
              <div className="px-4 py-2.5 text-text-t font-medium border-b border-border/30 bg-surface/40">Size</div>
              <div className="px-4 py-2.5 text-text-t font-medium border-b border-border/30 bg-surface/40">Usage</div>
              {typeScale.map((t) => (
                <div key={t.token} className="contents">
                  <div className="px-4 py-2.5 text-accent font-mono text-xs border-b border-border/10">{t.token}</div>
                  <div className="px-4 py-2.5 text-text-s font-mono text-xs border-b border-border/10">{t.size}</div>
                  <div className="px-4 py-2.5 text-text-s border-b border-border/10" style={{ fontSize: t.size }}>{t.sample}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Colors */}
        <section className="mb-12">
          <h2 className="font-display text-xl text-text-p mb-5">Color Palette</h2>
          {Object.entries(colors).map(([group, swatches]) => (
            <div key={group} className="mb-6">
              <h3 className="text-sm text-text-t uppercase tracking-wider font-medium mb-3">{group}</h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {swatches.map((s) => (
                  <div key={s.name} className="bg-surface/60 rounded-lg border border-border/30 p-3 flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-md shrink-0 border border-border/30"
                      style={{ background: s.value }}
                    />
                    <div className="min-w-0">
                      <div className="text-sm text-text-p font-medium truncate">{s.name}</div>
                      <div className="text-xs text-text-t font-mono truncate">{s.value}</div>
                      <div className="text-xs text-text-t mt-0.5 truncate">{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Border Radius */}
        <section className="mb-12">
          <h2 className="font-display text-xl text-text-p mb-5">Border Radius</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {radii.map((r) => (
              <div key={r.token} className="bg-surface/60 border border-border/30 p-4 flex flex-col items-center gap-3" style={{ borderRadius: r.value }}>
                <div
                  className="w-16 h-16 bg-accent/20 border-2 border-accent/40"
                  style={{ borderRadius: r.value }}
                />
                <div className="text-center">
                  <div className="text-sm text-accent font-mono">{r.value}</div>
                  <div className="text-xs text-text-t mt-0.5">{r.use}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Shadows / Glow */}
        <section className="mb-12">
          <h2 className="font-display text-xl text-text-p mb-5">Glow Effects</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {shadows.map((s) => (
              <div key={s.token} className="bg-surface/60 rounded-lg border border-border/30 p-5 flex items-center gap-4">
                <div
                  className="w-14 h-14 bg-accent rounded-md shrink-0"
                  style={{ boxShadow: s.value }}
                />
                <div>
                  <div className="text-sm text-text-p font-medium">{s.token}</div>
                  <div className="text-xs text-text-t font-mono mt-0.5">{s.value}</div>
                  <div className="text-xs text-text-t mt-1">{s.use}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Button Samples */}
        <section className="mb-12">
          <h2 className="font-display text-xl text-text-p mb-5">Components</h2>
          <div className="bg-surface/60 rounded-lg border border-border/30 p-5 space-y-6">
            <div>
              <div className="text-xs text-text-t uppercase tracking-wider font-medium mb-3">Buttons</div>
              <div className="flex flex-wrap gap-3">
                <button className="px-5 py-3 bg-accent text-bg rounded-md font-medium shadow-glow active:shadow-glow-strong press-scale cursor-pointer">Primary Action</button>
                <button className="px-5 py-3 rounded-md border border-border/60 text-text-s active:text-text-p active:bg-elevated press-scale cursor-pointer">Secondary</button>
                <button className="px-5 py-3 text-accent active:text-accent-dim press-scale cursor-pointer">Text Link</button>
                <button className="px-5 py-3 bg-accent text-bg rounded-md font-medium opacity-40 cursor-not-allowed">Disabled</button>
              </div>
            </div>
            <div className="h-px bg-border/30" />
            <div>
              <div className="text-xs text-text-t uppercase tracking-wider font-medium mb-3">Inputs</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-w-lg">
                <input className="bg-input border border-border/60 rounded-md px-4 py-3 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors" placeholder="Default input" readOnly />
                <input className="bg-input border-2 border-danger/60 rounded-md px-4 py-3 text-base text-text-p placeholder:text-text-t" placeholder="Error state" readOnly />
              </div>
            </div>
            <div className="h-px bg-border/30" />
            <div>
              <div className="text-xs text-text-t uppercase tracking-wider font-medium mb-3">Booking Type Indicators</div>
              <div className="space-y-2">
                {(['Regular', 'Touch Up', 'Consultation', 'Full Day'] as const).map((type) => {
                  const color = { Regular: '#5BA2FF', 'Touch Up': '#E8A87C', Consultation: '#6BB89E', 'Full Day': '#D4A65A' }[type];
                  return (
                    <div
                      key={type}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-border/30"
                      style={{ borderLeftWidth: 3, borderLeftColor: color, backgroundColor: `${color}12` }}
                    >
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-base text-text-p">{type}</span>
                      <span className="text-sm text-text-t font-mono ml-auto">{color}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-sm text-text-t text-center pt-4 border-t border-border/30">
          InkFlow Theme Reference — v0.1.0
        </div>
      </div>
    </div>
  );
}
