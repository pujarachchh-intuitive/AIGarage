import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { Suspense, useState } from 'react'
import { TopBar } from './TopBar'
import { ModeBanner } from './ModeBanner'
import { LeftRail } from './LeftRail'
import { RightHUD } from './RightHUD'
import { BottomDock } from './BottomDock'
import { theme } from './theme'

interface AppShellProps {
  children?: React.ReactNode
}

function Scene() {
  return (
    <>
      <color attach="background" args={[theme.colors.bg]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />

      {/* Placeholder - will be replaced by actual city/synapse scenes */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={theme.colors.breaking} emissive={theme.colors.breaking} emissiveIntensity={2} toneMapped={false} />
      </mesh>

      <OrbitControls
        autoRotate
        autoRotateSpeed={2}
        enableDamping
        dampingFactor={0.05}
      />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.1}
          luminanceSmoothing={0.9}
          intensity={1}
          mipmapBlur
        />
        <Vignette darkness={0.3} />
      </EffectComposer>
    </>
  )
}

export function AppShell({ children }: AppShellProps) {
  const [currentMode, setCurrentMode] = useState<'MOCK' | 'LIVE' | 'REPLAY'>('MOCK')
  const [currentView, setCurrentView] = useState<'City' | 'Synapse'>('City')
  const [showNodeDetail, setShowNodeDetail] = useState(true)
  const [showBottomDock, setShowBottomDock] = useState(true)
  const [replayProgress, setReplayProgress] = useState(0)

  return (
    <div style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
      {/* 3D Canvas - full screen background */}
      <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>

      {/* HUD Overlays */}
      <TopBar
        mode={currentMode}
        onModeChange={(mode) => setCurrentMode(mode as any)}
        currentView={currentView}
        onViewChange={setCurrentView}
        onSettingsOpen={() => console.log('Settings')}
      />

      <ModeBanner
        visible={currentMode === 'REPLAY'}
        replayLabel="Replay of run chg-012"
      />

      <LeftRail />

      <RightHUD
        visible={showNodeDetail}
        nodeId="db:column:orders.cust_id"
        nodeName="cust_id"
        type="column"
        owner="Data Platform"
        file="schema/orders.sql"
        line={42}
        isPii={true}
        isTested={true}
        confidence="high"
      />

      <BottomDock
        visible={showBottomDock}
        progress={replayProgress}
        onSeek={setReplayProgress}
        replayMode={currentMode === 'REPLAY'}
        onPlayPause={(playing) => console.log('Play/Pause:', playing)}
      />

      {children}
    </div>
  )
}
