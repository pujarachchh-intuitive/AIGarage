import { motion, AnimatePresence } from 'framer-motion'
import { theme } from './theme'

interface NodeDetailProps {
  visible?: boolean
  nodeId?: string
  nodeName?: string
  type?: string
  owner?: string
  file?: string
  line?: number
  isPii?: boolean
  isTested?: boolean
  confidence?: 'high' | 'medium' | 'low'
}

export function RightHUD({
  visible = false,
  nodeId = 'db:column:orders.cust_id',
  nodeName = 'cust_id',
  type = 'column',
  owner = 'Data Platform',
  file = 'schema/orders.sql',
  line = 42,
  isPii = true,
  isTested = true,
  confidence = 'high',
}: NodeDetailProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
          className="fixed right-0 top-20 h-screen w-80 pt-8 px-6 flex flex-col gap-6 overflow-y-auto z-30 backdrop-blur-[10px]"
          style={{
            background: theme.colors.glassDark,
            borderLeft: `1px solid ${theme.colors.border}`,
          }}
        >
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: theme.colors.textDim }}>
              Node Detail
            </h3>

            {/* Node name */}
            <div className="mb-4">
              <div className="text-xl font-bold" style={{ color: theme.colors.fixed }}>
                {nodeName}
              </div>
              <div className="text-xs" style={{ color: theme.colors.textDim }}>
                {type}
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-4">
              {isPii && (
                <span className="px-2 py-1 rounded text-xs font-medium" style={{
                  background: theme.colors.pii,
                  color: '#fff',
                }}>
                  PII
                </span>
              )}
              {isTested && (
                <span className="px-2 py-1 rounded text-xs font-medium" style={{
                  background: theme.colors.fixed,
                  color: '#000',
                }}>
                  Tested
                </span>
              )}
              <span className="px-2 py-1 rounded text-xs font-medium" style={{
                background: theme.colors.bobFound,
                color: '#000',
              }}>
                Found by Bob
              </span>
            </div>

            {/* Location */}
            <div className="mb-4 p-3 rounded" style={{
              background: theme.colors.glassLight,
              border: `1px solid ${theme.colors.border}`,
            }}>
              <div className="text-xs" style={{ color: theme.colors.textDim }}>
                {file}:{line}
              </div>
              <div className="text-xs font-mono" style={{ color: theme.colors.text }}>
                {nodeId}
              </div>
            </div>

            {/* Metadata */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: theme.colors.textDim }}>Owner</span>
                <span style={{ color: theme.colors.text }}>{owner}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: theme.colors.textDim }}>Confidence</span>
                <span style={{ color: theme.colors.text }}>
                  {confidence.charAt(0).toUpperCase() + confidence.slice(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Relations sections */}
          <div>
            <h4 className="text-xs font-bold uppercase mb-2" style={{ color: theme.colors.textDim }}>
              Depends On
            </h4>
            <div className="space-y-1 text-xs">
              <div className="p-2 rounded cursor-pointer hover:opacity-80" style={{
                background: theme.colors.glassLight,
                border: `1px solid ${theme.colors.parser}`,
                color: theme.colors.parser,
              }}>
                db:table:orders
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase mb-2" style={{ color: theme.colors.textDim }}>
              Used By
            </h4>
            <div className="space-y-1 text-xs">
              <div className="p-2 rounded cursor-pointer hover:opacity-80" style={{
                background: theme.colors.glassLight,
                border: `1px solid ${theme.colors.parser}`,
                color: theme.colors.parser,
              }}>
                api:endpoint:GET /customers
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
