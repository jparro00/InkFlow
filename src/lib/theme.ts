export type ThemeId = 'crimson' | 'green' | 'noir' | 'electric' | 'sepia' | 'violet' | 'dracula' | 'gruvbox';

export interface ThemePreset {
  id: ThemeId;
  name: string;
  bg: string;
  accent: string;
}

export const THEMES: ThemePreset[] = [
  { id: 'crimson',  name: 'Crimson',  bg: '#110D18', accent: '#DE0000' },
  { id: 'violet',   name: 'Violet',   bg: '#0D0614', accent: '#8B5CF6' },
  { id: 'dracula',  name: 'Dracula',  bg: '#282A36', accent: '#BD93F9' },
  { id: 'gruvbox',  name: 'Gruvbox',  bg: '#282828', accent: '#FE8019' },
  { id: 'green',    name: 'Moss',     bg: '#121212', accent: '#4ADE80' },
  { id: 'noir',     name: 'Noir',     bg: '#0A0A0A', accent: '#E5E5E5' },
  { id: 'electric', name: 'Electric', bg: '#0A0E1A', accent: '#38BDF8' },
  { id: 'sepia',    name: 'Sepia',    bg: '#1A1410', accent: '#F59E0B' },
];

export const DEFAULT_THEME: ThemeId = 'crimson';
const STORAGE_KEY = 'inkbloop-theme';

export function getTheme(): ThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && THEMES.some((t) => t.id === v)) return v as ThemeId;
  } catch { /* ignore */ }
  return DEFAULT_THEME;
}

export function applyTheme(id: ThemeId) {
  if (id === DEFAULT_THEME) {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = id;
  }
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
}
