import { motion } from 'framer-motion'
import { theme } from './theme'

interface TopBarProps {
  mode?: 'MOCK' | 'LIVE' | 'REPLAY'
  onModeChange?: (mode: string) => void
  currentView?: 'City' | 'Synapse'
  onViewChange?: (view: 'City' | 'Synapse') => void
  onSettingsOpen?: () => void
}

export function TopBar({
  mode = 'MOCK',
  onModeChange,
  currentView = 'City',
  onViewChange,
  onSettingsOpen
}: TopBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-40 backdrop-blur-[10px] border-b"
      style={{
        background: theme.colors.glass,
        borderColor: theme.colors.border,
      }}
    >
      <div className="flex items-center justify-between h-16 px-8">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold" style={{ color: theme.colors.breaking }}>
            SystemDNA
          </div>
          <div className="w-6 h-6 rounded-full animate-pulse" style={{ background: theme.colors.fixed }} />
        </div>

        {/* Center controls */}
        <div className="flex items-center gap-6">
          {/* Mode Badge */}
          <div className="px-3 py-1 rounded text-sm font-mono" style={{
            background: theme.colors.glassDark,
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
          }}>
            {mode}
          </div>

          {/* View Switch */}
          <div className="flex gap-2 p-1 rounded" style={{
            background: theme.colors.glassDark,
            border: `1px solid ${theme.colors.border}`,
          }}>
            {(['City', 'Synapse'] as const).map(view => (
              <button
                key={view}
                onClick={() => onViewChange?.(view)}
                className="px-4 py-1 rounded text-sm font-medium transition-all"
                style={{
                  background: currentView === view ? theme.colors.breaking : 'transparent',
                  color: theme.colors.text,
                }}
              >
                {view}
              </button>
            ))}
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-4">
          {/* Overlay toggles */}
          <div className="flex gap-2 text-xs" style={{ color: theme.colors.textDim }}>
            {['Impact', 'Trace', 'Metrics', 'Governance', 'Diff'].map(label => (
              <button
                key={label}
                className="px-2 py-1 rounded hover:opacity-80 transition-opacity"
                style={{
                  background: theme.colors.glassDark,
                  border: `1px solid ${theme.colors.border}`,
                  color: theme.colors.textDim,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Settings */}
          <button
            onClick={onSettingsOpen}
            className="p-2 rounded hover:opacity-80 transition-opacity"
            style={{
              background: theme.colors.glassDark,
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.text,
            }}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>
    </motion.div>
  )
}
