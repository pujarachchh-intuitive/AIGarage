import { motion, AnimatePresence } from 'framer-motion'
import { theme } from './theme'

interface ModeBannerProps {
  visible?: boolean
  replayLabel?: string
}

export function ModeBanner({ visible = false, replayLabel = 'Replay of run chg-012' }: ModeBannerProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg font-mono text-sm"
          style={{
            background: theme.colors.glassDark,
            border: `2px solid ${theme.colors.needsUpdate}`,
            color: theme.colors.text,
            boxShadow: `0 0 20px rgba(255, 176, 32, 0.2)`,
          }}
        >
          {replayLabel}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
