import { motion } from 'framer-motion'
import { theme } from './theme'

interface DistrictLegendItem {
  name: string
  health: 'breaking' | 'needsUpdate' | 'safe'
  affectedCount: number
}

interface LeftRailProps {
  districts?: DistrictLegendItem[]
}

const defaultDistricts: DistrictLegendItem[] = [
  { name: 'Database', health: 'breaking', affectedCount: 5 },
  { name: 'Pipelines', health: 'needsUpdate', affectedCount: 3 },
  { name: 'Backend', health: 'safe', affectedCount: 0 },
  { name: 'API', health: 'safe', affectedCount: 0 },
  { name: 'Frontend', health: 'safe', affectedCount: 0 },
  { name: 'Dashboards', health: 'safe', affectedCount: 0 },
  { name: 'Business', health: 'safe', affectedCount: 0 },
]

const healthColors = {
  breaking: '#ff3b5c',
  needsUpdate: '#ffb020',
  safe: '#6b7280',
}

export function LeftRail({ districts = defaultDistricts }: LeftRailProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="fixed left-0 top-20 h-screen w-56 pt-8 px-4 flex flex-col gap-4 overflow-y-auto z-30 backdrop-blur-[10px]"
      style={{
        background: `${theme.colors.glassDark}`,
        borderRight: `1px solid ${theme.colors.border}`,
      }}
    >
      <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: theme.colors.textDim }}>
        District Legend
      </h3>

      {districts.map((district, idx) => (
        <motion.div
          key={district.name}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.05 }}
          className="p-3 rounded border transition-all hover:border-opacity-100"
          style={{
            border: `1px solid ${theme.colors.border}`,
            background: theme.colors.glassLight,
          }}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm font-medium" style={{ color: theme.colors.text }}>
              {district.name}
            </span>
            {district.affectedCount > 0 && (
              <span className="text-xs px-2 py-1 rounded font-mono" style={{
                background: healthColors[district.health],
                color: '#000',
              }}>
                {district.affectedCount}
              </span>
            )}
          </div>

          {/* Health ring */}
          <div className="relative h-2 rounded-full overflow-hidden" style={{
            background: theme.colors.glassDark,
          }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ delay: idx * 0.1 + 0.3, duration: 0.8 }}
              className="h-full rounded-full"
              style={{
                background: healthColors[district.health],
              }}
            />
          </div>
        </motion.div>
      ))}
    </motion.div>
  )
}
