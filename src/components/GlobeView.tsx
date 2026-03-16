import { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Stars } from '@react-three/drei';
import { GlobeModel } from './GlobeModel';
import { GameMenu } from './GameMenu';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';

type MenuPage = 'explore' | 'missions' | 'hotcold' | 'settings';

const NAV_HEIGHT = 52;

interface GlobeViewProps {
  onExit: () => void;
}

// --- Adaptive OrbitControls ---
function AdaptiveControls({ isFlat, controlsRef }: { isFlat: boolean; controlsRef: React.RefObject<any> }) {
  const { camera, size } = useThree();
  const mapW = 8;
  const mapH = 4;
  const transitioningRef = useRef(false);

  // When mode changes, start smooth transition instead of snapping
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (isFlat) {
      controls.enableRotate = false;
      controls.enablePan = false; // Disable pan during transition
      transitioningRef.current = true;
    } else {
      controls.enableRotate = true;
      controls.enablePan = false;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI;
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
      controls.maxDistance = 10;
      transitioningRef.current = true;
    }
  }, [isFlat, controlsRef]);

  useFrame((_, rawDelta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const delta = Math.min(rawDelta, 0.05);

    // Get camera's spherical position relative to target
    const offset = new THREE.Vector3().copy(camera.position).sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);

    if (isFlat) {
      // Smoothly move camera to front-facing position (phi=PI/2, theta=0)
      const phiDiff = Math.PI / 2 - spherical.phi;
      const thetaDiff = 0 - spherical.theta;
      const targetXDiff = 0 - controls.target.x;
      const targetYDiff = 0 - controls.target.y;
      const targetZDiff = 0 - controls.target.z;
      const speed = delta * 5;

      if (transitioningRef.current) {
        spherical.phi += phiDiff * speed;
        spherical.theta += thetaDiff * speed;
        controls.target.x += targetXDiff * speed;
        controls.target.y += targetYDiff * speed;
        controls.target.z += targetZDiff * speed;

        offset.setFromSpherical(spherical);
        camera.position.copy(controls.target).add(offset);
        camera.lookAt(controls.target);

        // When close enough, lock constraints and enable pan
        const settled = Math.abs(phiDiff) < 0.01 && Math.abs(thetaDiff) < 0.01;
        if (settled) {
          controls.minPolarAngle = Math.PI / 2;
          controls.maxPolarAngle = Math.PI / 2;
          controls.minAzimuthAngle = 0;
          controls.maxAzimuthAngle = 0;
          controls.enablePan = true;
          transitioningRef.current = false;

          const aspect = size.width / size.height;
          const fovRad = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
          const tanHalfFov = Math.tan(fovRad / 2);
          const distToFitH = (mapH / 2) / tanHalfFov;
          const distToFitW = (mapW / 2) / (aspect * tanHalfFov);
          controls.maxDistance = Math.min(distToFitH, distToFitW) * 0.95;
        }
      }

      // Pan limits
      if (!transitioningRef.current) {
        const aspect = size.width / size.height;
        const dist = camera.position.z;
        const fovRad = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
        const vH = 2 * dist * Math.tan(fovRad / 2);
        const vW = vH * aspect;
        const limitX = Math.max(0, (mapW - vW) / 2);
        const limitY = Math.max(0, (mapH - vH) / 2);
        controls.target.x = Math.max(-limitX, Math.min(limitX, controls.target.x));
        controls.target.y = Math.max(-limitY, Math.min(limitY, controls.target.y));
        controls.target.z = 0;
      }
    } else if (transitioningRef.current) {
      // When switching back to globe, smoothly reset target to origin
      controls.target.x += (0 - controls.target.x) * delta * 5;
      controls.target.y += (0 - controls.target.y) * delta * 5;
      controls.target.z += (0 - controls.target.z) * delta * 5;
      if (controls.target.length() < 0.01) {
        controls.target.set(0, 0, 0);
        transitioningRef.current = false;
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={isFlat}
      enableRotate={!isFlat}
      minDistance={2}
      maxDistance={10}
      enableDamping
      dampingFactor={0.05}
      mouseButtons={{
        LEFT: isFlat ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      }}
    />
  );
}

// --- Smooth zoom from button clicks ---
function ZoomHandler({ zoomRef, controlsRef }: { zoomRef: React.RefObject<number>; controlsRef: React.RefObject<any> }) {
  const { camera } = useThree();

  useFrame(() => {
    const cmd = zoomRef.current;
    if (!cmd || Math.abs(cmd) < 0.01) return;

    const controls = controlsRef.current;
    const target = controls ? controls.target as THREE.Vector3 : new THREE.Vector3(0, 0, 0);
    const offset = new THREE.Vector3().copy(camera.position).sub(target);
    const dist = offset.length();
    
    // Use dynamic maxDistance from controls if available
    const maxD = controls?.maxDistance || 10;
    const minD = controls?.minDistance || 2;
    
    const newDist = Math.max(minD, Math.min(maxD, dist + cmd * 0.15));
    offset.normalize().multiplyScalar(newDist);
    camera.position.copy(target).add(offset);

    zoomRef.current = cmd * 0.88;
    if (Math.abs(zoomRef.current) < 0.01) zoomRef.current = 0;
  });

  return null;
}

// --- Button style ---
const btnBase: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.25)',
  color: '#fff',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6rem',
  letterSpacing: '0.12em',
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
  transition: 'border-color 0.2s, background 0.2s',
};

export const GlobeView = ({ onExit }: GlobeViewProps) => {
  const [activePage, setActivePage] = useState<MenuPage>('explore');
  const [isFlat, setIsFlat] = useState(false);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  const tooltipRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<any>(null);
  const zoomRef = useRef(0);

  // Track mouse for tooltip (direct DOM, no re-renders)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${e.clientX + 14}px`;
      tooltipRef.current.style.top = `${e.clientY + 14}px`;
    }
  }, []);

  const handleZoom = useCallback((direction: number) => {
    zoomRef.current += direction;
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        background: '#000000',
        overflow: 'hidden',
      }}
      onMouseMove={handleMouseMove}
    >
      {/* Game Navigation */}
      <GameMenu activePage={activePage} onPageChange={setActivePage} onExit={onExit} />

      {/* 3D Canvas */}
      <div style={{
        position: 'absolute',
        top: NAV_HEIGHT,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1,
      }}>
        <Canvas>
          <color attach="background" args={['#000000']} />
          <PerspectiveCamera makeDefault position={[0, 0, 6]} fov={50} />
          <AdaptiveControls isFlat={isFlat} controlsRef={controlsRef} />
          <ZoomHandler zoomRef={zoomRef} controlsRef={controlsRef} />

          <ambientLight intensity={1.5} />
          <directionalLight position={[5, 5, 5]} intensity={2} />
          <directionalLight position={[-5, -3, -5]} intensity={0.5} color="#ffffff" />

          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

          <GlobeModel
            onCountryHover={setHoveredCountry}
            isFlat={isFlat}
          />
        </Canvas>
      </div>

      {/* Hover tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: 'fixed',
          zIndex: 300,
          pointerEvents: 'none',
          opacity: hoveredCountry ? 1 : 0,
          transition: 'opacity 0.15s ease',
          padding: '0.35rem 0.7rem',
          background: 'rgba(0,0,0,0.85)',
          border: '1px solid rgba(255,255,255,0.2)',
          backdropFilter: 'blur(8px)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem',
          letterSpacing: '0.08em',
          color: '#ffffff',
          whiteSpace: 'nowrap',
        }}
      >
        {hoveredCountry?.toUpperCase()}
      </div>

      {/* Bottom-left controls */}
      <div
        style={{
          position: 'absolute',
          bottom: '1.5rem',
          left: '1.5rem',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {/* Globe/Map toggle */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          onClick={() => setIsFlat(prev => !prev)}
          style={btnBase}
          whileHover={{ borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.1)' }}
          whileTap={{ scale: 0.97 }}
        >
          {isFlat ? '[ GLOBE VIEW ]' : '[ MAP VIEW ]'}
        </motion.button>

        {/* Zoom controls */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          style={{ display: 'flex', gap: '0.35rem' }}
        >
          <motion.button
            onClick={() => handleZoom(-1.5)}
            style={{ ...btnBase, flex: 1, fontSize: '0.75rem', padding: '0.4rem' }}
            whileHover={{ borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.1)' }}
            whileTap={{ scale: 0.95 }}
          >
            +
          </motion.button>
          <motion.button
            onClick={() => handleZoom(1.5)}
            style={{ ...btnBase, flex: 1, fontSize: '0.75rem', padding: '0.4rem' }}
            whileHover={{ borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.1)' }}
            whileTap={{ scale: 0.95 }}
          >
            -
          </motion.button>
        </motion.div>

        {/* System status */}
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.55rem',
          opacity: 0.3,
          letterSpacing: '0.1em',
          margin: 0,
          pointerEvents: 'none',
        }}>
          [ ENGINE: R3F ]&nbsp;&nbsp;[ MODE: {isFlat ? 'FLAT_MAP' : 'WIREFRAME'} ]
        </p>
      </div>

      {/* Crosshair */}
      <div style={{
        position: 'absolute',
        top: `calc(${NAV_HEIGHT}px + 50%)`,
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '28px',
        height: '28px',
        pointerEvents: 'none',
        opacity: 0.18,
        zIndex: 50,
      }}>
        <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: '1px', background: '#fff' }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, width: '1px', height: '100%', background: '#fff' }} />
      </div>

      {/* Country info panel — shows on HOVER */}
      <AnimatePresence>
        {hoveredCountry && activePage === 'explore' && (
          <motion.div
            key={hoveredCountry}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute',
              top: NAV_HEIGHT + 24,
              right: '1.5rem',
              bottom: '5.5rem',
              zIndex: 100,
              width: '280px',
              padding: '1.5rem',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.88)',
              backdropFilter: 'blur(20px)',
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ flex: '0 0 auto' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', marginBottom: '0.5rem', opacity: 0.35, letterSpacing: '0.15em' }}>
                INTEL REPORT // {hoveredCountry.toUpperCase()}
              </p>
              <h3 style={{ fontSize: '1.1rem', fontFamily: 'var(--font-mono)', marginBottom: '0.75rem', letterSpacing: '0.04em', color: '#ffffff' }}>
                {hoveredCountry.toUpperCase()}
              </h3>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.15)', marginBottom: '1.25rem' }} />
              
              <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ fontSize: '0.58rem', opacity: 0.5, fontFamily: 'var(--font-mono)', marginBottom: '0.4rem', borderLeft: '2px solid #ffffff', paddingLeft: '8px' }}>
                  CORE METRICS
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <p style={{ fontSize: '0.42rem', opacity: 0.3, fontFamily: 'var(--font-mono)', marginBottom: '2px' }}>THREAT</p>
                    <p style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)' }}>NOMINAL</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.42rem', opacity: 0.3, fontFamily: 'var(--font-mono)', marginBottom: '2px' }}>STATUS</p>
                    <p style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: '#00ffcc' }}>ACTIVE</p>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }} className="custom-scrollbar">
              <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ fontSize: '0.58rem', opacity: 0.5, fontFamily: 'var(--font-mono)', marginBottom: '0.6rem', borderLeft: '2px solid #ffffff', paddingLeft: '8px' }}>
                  SITUATION BRIEFING
                </p>
                <p style={{ 
                  fontSize: '0.62rem', 
                  opacity: 0.7, 
                  fontFamily: 'var(--font-mono)', 
                  lineHeight: 1.6,
                  color: '#ffffff',
                  textAlign: 'justify'
                }}>
                  {hoveredCountry === 'Brazil' && "Strategic hub in South America. Known for its vast biodiversity and complex urban networks. Operational environment: Tropical / Urban."}
                  {hoveredCountry === 'USA' && "Global leadership vector with advanced infrastructure. North American logistical nexus. Operational environment: Variable / High-Tech."}
                  {hoveredCountry === 'Japan' && "Technological powerhouse in the Pacific. Densely populated urban canyons and ancient cultural sites. Operational environment: High-Density / Cyber."}
                  {hoveredCountry === 'France' && "European diplomatic and cultural cornerstone. Key node for international intelligence exchange. Operational environment: Temperate / Historical."}
                  {!['Brazil', 'USA', 'Japan', 'France'].includes(hoveredCountry) && `Strategic data suggests significant tactical potential in this region. Surveillance satellites show high activity in key sectors. Monitoring protocol engaged.`}
                </p>
              </div>

              <p style={{ fontSize: '0.52rem', opacity: 0.4, fontFamily: 'var(--font-mono)', marginBottom: '0.85rem', letterSpacing: '0.1em' }}>
                OPERATIVE ACTIVITES (BOOK LIKE SPEED)
              </p>

              {[
                { title: 'TACTICAL INSERTION (HALO)', rating: '4.9', price: '$1,250', type: 'EXTREME' },
                { title: 'URBAN EXTRACTION DRILL', rating: '4.7', price: '$850', type: 'COMBAT' },
                { title: 'COVERT OPS LODGING', rating: '5.0', price: '$420', type: 'STEALTH' },
                { title: 'INTEL GATHERING TOUR', rating: '4.5', price: '$200', type: 'EXPLORE' },
              ].map((act, i) => (
                <motion.div
                  key={i}
                  whileHover={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.3)' }}
                  style={{
                    padding: '1rem',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    marginBottom: '0.75rem',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <span style={{ 
                      fontSize: '0.42rem', 
                      background: '#fff', 
                      color: '#000', 
                      padding: '2px 4px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 'bold'
                    }}>
                      {act.type}
                    </span>
                    <span style={{ fontSize: '0.52rem', fontFamily: 'var(--font-mono)', opacity: 0.6 }}>
                      ⭐ {act.rating}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', marginBottom: '0.4rem', color: '#fff', lineHeight: 1.4 }}>
                    {act.title}
                  </p>
                  <p style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: '#00ffcc', opacity: 0.9 }}>
                    {act.price} <span style={{ opacity: 0.4, fontSize: '0.5rem', color: '#fff' }}>/ PER OPERATIVE</span>
                  </p>
                </motion.div>
              ))}
            </div>

            <div style={{ flex: '0 0 auto', marginTop: '1.25rem' }}>
              <motion.button
                whileHover={{ background: '#fff', color: '#000' }}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'transparent',
                  border: '1px solid #ffffff',
                  color: '#ffffff',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.15em',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                DEPLOY SYSTEM
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
