/* ─────────────────────────── Design tokens ─────────────────────────── */
export const C = {
  bg:          '#0A0715',
  card:        'rgba(255,255,255,0.055)',
  border:      'rgba(139,92,246,0.28)',
  borderFaint: 'rgba(255,255,255,0.09)',
  primary:     '#7C3AED',
  gold:        '#F59E0B',
  text:        '#FFFFFF',
  sub:         '#B8A6D9',
  muted:       '#6B5E8A',
  mic:         '#22C55E',
  red:         '#EF4444',
  pink:        '#EC4899',
  inputBg:     'rgba(255,255,255,0.065)',
} as const;

/* ─────────────────────────── Room metadata ─────────────────────────── */
export const ROOM_META = { id: '123456', name: 'Royal Lounge', type: 'Public' };
export const MAX_SEATS = 10;

/* ─────────────────────────── Themes ─────────────────────────────────
   Each theme exposes:
   - accent : primary glow / border / button color
   - bg     : deep background (slightly tinted toward the accent hue)
   - surface: card / panel background (a step lighter than bg)
   These three are applied throughout the room screen so changing themes
   feels like a full premium repaint, not just a border-color swap.
─────────────────────────────────────────────────────────────────────── */
export const ROOM_THEMES: { id: string; name: string; accent: string; bg: string; surface: string }[] = [
  { id: 'cosmic',   name: '🌌 Cosmic',      accent: '#7C3AED', bg: '#0A0715', surface: '#130930' },
  { id: 'inferno',  name: '🔥 Inferno',      accent: '#EF4444', bg: '#0F0505', surface: '#200A0A' },
  { id: 'ocean',    name: '🌊 Ocean',        accent: '#0EA5E9', bg: '#020D14', surface: '#062030' },
  { id: 'midnight', name: '🌙 Midnight',     accent: '#3B82F6', bg: '#050A1A', surface: '#0A1535' },
  { id: 'forest',   name: '🌿 Forest',       accent: '#22C55E', bg: '#030E05', surface: '#061A09' },
  { id: 'cherry',   name: '🌸 Cherry',       accent: '#EC4899', bg: '#0F0510', surface: '#200828' },
  { id: 'thunder',  name: '⚡ Thunder',       accent: '#F59E0B', bg: '#0E0C03', surface: '#1C1905' },
  { id: 'galaxy',   name: '🎆 Galaxy',        accent: '#A855F7', bg: '#0A0514', surface: '#15062A' },
  { id: 'arctic',   name: '❄️ Arctic',        accent: '#67E8F9', bg: '#020E10', surface: '#041B1E' },
  { id: 'desert',   name: '🏜️ Desert',        accent: '#D97706', bg: '#0E0A03', surface: '#1C1505' },
  { id: 'neon',     name: '🎭 Neon City',     accent: '#10B981', bg: '#030E0A', surface: '#051A12' },
  { id: 'sunset',   name: '🌅 Sunset',        accent: '#F97316', bg: '#0E0703', surface: '#1E0E05' },
  { id: 'rose',     name: '🌹 Rose Gold',     accent: '#F43F5E', bg: '#0F0408', surface: '#200714' },
  { id: 'ice',      name: '💎 Ice Crystal',   accent: '#BAE6FD', bg: '#020B12', surface: '#041622' },
  { id: 'lava',     name: '🌋 Lava',          accent: '#DC2626', bg: '#0F0404', surface: '#200808' },
  { id: 'aurora',   name: '🌌 Aurora',        accent: '#6EE7B7', bg: '#03100D', surface: '#061E19' },
];
