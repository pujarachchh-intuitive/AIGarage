export const theme = {
  colors: {
    // Background
    bg: '#05070d',

    // Glass HUD
    glass: 'rgba(15, 20, 35, 0.55)',
    glassLight: 'rgba(15, 20, 35, 0.35)',
    glassDark: 'rgba(5, 7, 13, 0.8)',

    // Status colors
    breaking: '#ff3b5c',
    needsUpdate: '#ffb020',
    safe: '#6b7280',
    fixed: '#22e39a',

    // Origin badges
    bobFound: '#a78bfa',
    parser: '#38bdf8',

    // Special
    pii: '#f472b6',
    approval: '#facc15',

    // Grayscale
    text: '#e5e7eb',
    textDim: '#9ca3af',
    border: 'rgba(255, 255, 255, 0.1)',
  },

  effects: {
    glassBlur: '10px',
    neonGlow: '0 0 20px rgba(255, 59, 92, 0.3)',
    softGlow: '0 0 40px rgba(255, 59, 92, 0.1)',
  },

  animations: {
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
    verySlow: '1000ms',
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
} as const

export type Theme = typeof theme
