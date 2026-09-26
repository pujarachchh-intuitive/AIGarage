import { motion } from 'framer-motion'
import { theme } from './theme'
import { useState } from 'react'

interface BottomDockProps {
  visible?: boolean
  progress?: number
  onSeek?: (progress: number) => void
  replayMode?: boolean
  onPlayPause?: (playing: boolean) => void
}

export function BottomDock({
  visible = false,
  progress = 0.5,
  onSeek,
  replayMode = false,
  onPlayPause,
}: BottomDockProps) {
  const [isPlaying, setIsPlaying] = useState(false)

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
    onPlayPause?.(!isPlaying)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const newProgress = (e.clientX - rect.left) / rect.width
    onSeek?.(Math.max(0, Math.min(1, newProgress)))
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 20 }}
      transition={{ duration: 0.3 }}
      className="fixed bottom-0 left-0 right-0 backdrop-blur-[10px] z-30"
      style={{
        background: theme.colors.glass,
        borderTop: `1px solid ${theme.colors.border}`,
      }}
    >
      <div className="h-32 flex flex-col gap-4 p-6">
        {/* Controls */}
        <div className="flex items-center gap-4">
          {replayMode && (
            <button
              onClick={handlePlayPause}
              className="w-10 h-10 rounded flex items-center justify-center hover:opacity-80"
              style={{
                background: theme.colors.breaking,
                color: '#fff',
              }}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
          )}

          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs font-mono" style={{ color: theme.colors.textDim }}>
              {Math.round(progress * 100)}%
            </span>

            {/* Progress bar */}
            <div
              onClick={handleSeek}
              className="flex-1 h-1 rounded-full cursor-pointer group"
              style={{
                background: theme.colors.glassDark,
              }}
            >
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${progress * 100}%` }}
                style={{
                  background: theme.colors.breaking,
                }}
              />
            </div>
          </div>

          {/* Speed control */}
          {replayMode && (
            <div className="flex gap-1 text-xs">
              {['0.5x', '1x', '2x'].map(speed => (
                <button
                  key={speed}
                  className="px-2 py-1 rounded hover:opacity-80"
                  style={{
                    background: theme.colors.glassDark,
                    border: `1px solid ${theme.colors.border}`,
                    color: theme.colors.text,
                  }}
                >
                  {speed}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timeline preview (placeholder) */}
        <div
          className="flex-1 rounded border"
          style={{
            background: theme.colors.glassDark,
            borderColor: theme.colors.border,
          }}
        >
          <div className="h-full flex items-end justify-between px-2 gap-1">
            {Array.from({ length: 16 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 rounded-t transition-all"
                style={{
                  height: `${Math.random() * 80 + 20}%`,
                  background: i / 16 <= progress ? theme.colors.breaking : theme.colors.parser,
                  opacity: 0.5,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
