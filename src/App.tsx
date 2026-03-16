import { useState, useRef, useCallback, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { GlobeModel } from './components/GlobeModel'
import { LandingPage } from './components/LandingPage'
import { GameMenu, GameToggle, HotColdGame } from './components/GameMenu'
import { motion, AnimatePresence } from 'framer-motion'
import { playNavHoverSound, playClickSound } from './utils/sounds'
import './App.css'

type AppMode = 'landing' | 'playing'
type MenuPage = 'explore' | 'missions' | 'hotcold' | 'settings'

const NAV_HEIGHT = 52

/* ────────────────────────────────────────────
   CameraRig — animates camera between modes.
   Once settled in playing mode, stops updating
   so OrbitControls can take over completely.
   ──────────────────────────────────────────── */
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

const CAMERA_DURATION = 1.2 // seconds

const LANDING_POS = new THREE.Vector3(0, -4, 4)
const PLAYING_POS = new THREE.Vector3(0, 0, 6)
const LANDING_SPH = new THREE.Spherical().setFromVector3(LANDING_POS)
const PLAYING_SPH = new THREE.Spherical().setFromVector3(PLAYING_POS)

function CameraRig({ mode, onSettled }: { mode: AppMode; onSettled: () => void }) {
  const { camera } = useThree()
  const timeRef = useRef(0)
  const settledRef = useRef(false)
  const calledSettledRef = useRef(false)
  const prevModeRef = useRef(mode)
  const startSphRef = useRef(new THREE.Spherical().setFromVector3(LANDING_POS))

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)

    // Detect mode change — capture current camera position in spherical coords
    if (prevModeRef.current !== mode) {
      prevModeRef.current = mode
      startSphRef.current = new THREE.Spherical().setFromVector3(camera.position)
      settledRef.current = false
      calledSettledRef.current = false
      timeRef.current = 0
    }

    if (settledRef.current && mode === 'playing') return
    if (settledRef.current && mode === 'landing') return

    timeRef.current = Math.min(timeRef.current + delta, CAMERA_DURATION)
    const raw = timeRef.current / CAMERA_DURATION
    const t = easeInOutCubic(raw)

    const targetSph = mode === 'playing' ? PLAYING_SPH : LANDING_SPH
    const start = startSphRef.current

    // Interpolate spherical coords — radius never collapses
    const radius = start.radius + (targetSph.radius - start.radius) * t
    const phi = start.phi + (targetSph.phi - start.phi) * t
    const theta = start.theta + (targetSph.theta - start.theta) * t

    const sph = new THREE.Spherical(radius, phi, theta)
    camera.position.setFromSpherical(sph)
    camera.lookAt(0, 0, 0)

    // Trigger HUD early at ~60% through the animation
    if (mode === 'playing' && !calledSettledRef.current && raw > 0.55) {
      calledSettledRef.current = true
      onSettled()
    }

    if (raw >= 1) {
      settledRef.current = true
      const finalPos = mode === 'playing' ? PLAYING_POS : LANDING_POS
      camera.position.copy(finalPos)
      camera.lookAt(0, 0, 0)
    }
  })

  return <PerspectiveCamera makeDefault position={[0, -4, 4]} fov={50} />
}

/* ────────────────────────────────────────────
   AdaptiveControls — EXACT same code as
   GlobeView.tsx had, just copied here.
   ──────────────────────────────────────────── */
function SceneBackground({ transparent }: { transparent: boolean }) {
  const { scene, gl } = useThree()
  useEffect(() => {
    if (transparent) {
      scene.background = null
      gl.setClearColor(0x000000, 0)
    } else {
      scene.background = new THREE.Color('#000000')
      gl.setClearColor(0x000000, 1)
    }
  }, [transparent, scene, gl])
  return null
}

const AUTO_ROTATE_TARGET = 0.15

function AdaptiveControls({ isFlat, controlsRef, hoveringRef, autoRotateEnabled, spaceSpinRef }: { isFlat: boolean; controlsRef: React.RefObject<any>; hoveringRef: React.RefObject<boolean>; autoRotateEnabled: boolean; spaceSpinRef: React.RefObject<number> }) {
  const { camera, size } = useThree()
  const mapW = 8
  const mapH = 4
  const transitioningRef = useRef(false)
  const currentSpeedRef = useRef(AUTO_ROTATE_TARGET)
  const idleTimerRef = useRef(0)
  const prevHoveringRef = useRef(false)

  useFrame((_, rawDelta) => {
    const controls = controlsRef.current
    if (!controls) return
    const delta = Math.min(rawDelta, 0.05)

    const hovering = hoveringRef.current

    // Track when mouse leaves globe — start 5s cooldown
    if (prevHoveringRef.current && !hovering) {
      idleTimerRef.current = 0
    }
    if (!hovering) {
      idleTimerRef.current += delta
    } else {
      idleTimerRef.current = 0
    }
    prevHoveringRef.current = hovering

    // Only resume auto-rotate after 5s idle
    const wantRotate = autoRotateEnabled && !isFlat && !hovering && idleTimerRef.current >= 5
    const spaceSpin = spaceSpinRef.current ?? 0
    const targetSpeed = spaceSpin > 0 ? spaceSpin : (wantRotate ? AUTO_ROTATE_TARGET : 0)
    // Accelerate slowly (0.3), decelerate faster (3)
    const lerpSpeed = spaceSpin > 0 ? 6 : (targetSpeed > currentSpeedRef.current ? 0.3 : 3)
    currentSpeedRef.current += (targetSpeed - currentSpeedRef.current) * delta * lerpSpeed
    if (targetSpeed === 0 && Math.abs(currentSpeedRef.current) < 0.001) currentSpeedRef.current = 0
    controls.autoRotate = currentSpeedRef.current > 0
    controls.autoRotateSpeed = currentSpeedRef.current

    const aspect = size.width / size.height
    const fovRad = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180)
    const tanHalfFov = Math.tan(fovRad / 2)
    const distToFitH = (mapH / 2) / tanHalfFov
    const distToFitW = (mapW / 2) / (aspect * tanHalfFov)
    const idealMaxDist = Math.min(distToFitH, distToFitW) * 0.95

    const offset = new THREE.Vector3().copy(camera.position).sub(controls.target)
    const spherical = new THREE.Spherical().setFromVector3(offset)

    if (isFlat) {
      const speed = delta * 5

      if (transitioningRef.current) {
        const phiDiff = Math.PI / 2 - spherical.phi
        const thetaDiff = 0 - spherical.theta
        const radiusDiff = idealMaxDist - spherical.radius

        spherical.phi += phiDiff * speed
        spherical.theta += thetaDiff * speed
        spherical.radius += radiusDiff * speed
        controls.target.x += (0 - controls.target.x) * speed
        controls.target.y += (0 - controls.target.y) * speed
        controls.target.z += (0 - controls.target.z) * speed

        offset.setFromSpherical(spherical)
        camera.position.copy(controls.target).add(offset)
        camera.lookAt(controls.target)

        const settled = Math.abs(phiDiff) < 0.01 && Math.abs(thetaDiff) < 0.01 && Math.abs(radiusDiff) < 0.05
        if (settled) {
          controls.minPolarAngle = Math.PI / 2
          controls.maxPolarAngle = Math.PI / 2
          controls.minAzimuthAngle = 0
          controls.maxAzimuthAngle = 0
          controls.enablePan = true
          controls.maxDistance = idealMaxDist
          transitioningRef.current = false
        }
      }

      // Pan limits
      if (!transitioningRef.current) {
        const dist = camera.position.z
        const vH = 2 * dist * Math.tan(fovRad / 2)
        const vW = vH * aspect
        const limitX = Math.max(0, (mapW - vW) / 2)
        const limitY = Math.max(0, (mapH - vH) / 2)
        controls.target.x = Math.max(-limitX, Math.min(limitX, controls.target.x))
        controls.target.y = Math.max(-limitY, Math.min(limitY, controls.target.y))
        controls.target.z = 0
      }
    } else if (transitioningRef.current) {
      const speed = delta * 5
      const radiusDiff = 6 - spherical.radius

      spherical.radius += radiusDiff * speed
      controls.target.x += (0 - controls.target.x) * speed
      controls.target.y += (0 - controls.target.y) * speed
      controls.target.z += (0 - controls.target.z) * speed

      offset.setFromSpherical(spherical)
      camera.position.copy(controls.target).add(offset)
      camera.lookAt(controls.target)

      if (controls.target.length() < 0.01 && Math.abs(radiusDiff) < 0.05) {
        controls.target.set(0, 0, 0)
        transitioningRef.current = false
      }
    }
  })

  // React to isFlat changes
  const prevIsFlat = useRef(isFlat)
  useFrame(() => {
    if (prevIsFlat.current !== isFlat) {
      prevIsFlat.current = isFlat
      const controls = controlsRef.current
      if (!controls) return
      if (isFlat) {
        controls.enableRotate = false
        controls.enablePan = false
      } else {
        controls.enableRotate = true
        controls.enablePan = false
        controls.minPolarAngle = 0
        controls.maxPolarAngle = Math.PI
        controls.minAzimuthAngle = -Infinity
        controls.maxAzimuthAngle = Infinity
        controls.maxDistance = 10
      }
      transitioningRef.current = true
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={isFlat}
      enableRotate={!isFlat}
      minDistance={2}
      maxDistance={10}
      enableDamping
      dampingFactor={0.05}
      autoRotate={!isFlat}
      autoRotateSpeed={0.15}
      mouseButtons={{
        LEFT: isFlat ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  )
}

/* ────────────────────────────────────────────
   ZoomHandler — exact same as GlobeView.tsx
   ──────────────────────────────────────────── */
function ZoomHandler({ zoomRef, controlsRef }: { zoomRef: React.RefObject<number>; controlsRef: React.RefObject<any> }) {
  const { camera } = useThree()

  useFrame(() => {
    const cmd = zoomRef.current
    if (!cmd || Math.abs(cmd) < 0.01) return

    const controls = controlsRef.current
    const target = controls ? (controls.target as THREE.Vector3) : new THREE.Vector3(0, 0, 0)
    const offset = new THREE.Vector3().copy(camera.position).sub(target)
    const dist = offset.length()
    const maxD = controls?.maxDistance || 10
    const minD = controls?.minDistance || 2
    const newDist = Math.max(minD, Math.min(maxD, dist + cmd * 0.15))
    offset.normalize().multiplyScalar(newDist)
    camera.position.copy(target).add(offset)

    zoomRef.current = cmd * 0.88
    if (Math.abs(zoomRef.current) < 0.01) zoomRef.current = 0
  })

  return null
}

/* ────────────────────────────────────────────
   Button style
   ──────────────────────────────────────────── */
const CONTINENT_LABELS: Record<string, string> = {
  na: 'NORTH AMERICA', sa: 'SOUTH AMERICA', eu: 'EUROPE', af: 'AFRICA', as: 'ASIA & OCEANIA',
}

// Unlock dates for locked countries (future dates)
const UNLOCK_DATES: Record<string, string> = {
  'Cuba': '2026-04-15T00:00:00',
  'Argentina': '2026-03-28T00:00:00',
  'Colombia': '2026-05-10T00:00:00',
  'Peru': '2026-06-01T00:00:00',
  'Bolivia': '2026-07-20T00:00:00',
  'Greece': '2026-04-05T00:00:00',
  'Turkey': '2026-03-22T00:00:00',
  'Norway': '2026-05-18T00:00:00',
  'Switzerland': '2026-04-30T00:00:00',
  'Egypt': '2026-03-25T00:00:00',
  'South Africa': '2026-06-12T00:00:00',
  'Morocco': '2026-04-20T00:00:00',
  'Nigeria': '2026-05-05T00:00:00',
  'Thailand': '2026-03-20T00:00:00',
  'India': '2026-04-08T00:00:00',
  'China': '2026-05-25T00:00:00',
  'Indonesia': '2026-06-15T00:00:00',
  'Philippines': '2026-04-28T00:00:00',
}

function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const diff = new Date(targetDate).getTime() - now
  if (diff <= 0) return <span>AVAILABLE NOW</span>

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
  const minutes = Math.floor((diff / (1000 * 60)) % 60)
  const seconds = Math.floor((diff / 1000) % 60)

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
      {[
        { value: days, label: 'DAYS' },
        { value: hours, label: 'HRS' },
        { value: minutes, label: 'MIN' },
        { value: seconds, label: 'SEC' },
      ].map((unit) => (
        <div key={unit.label} style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '1.3rem',
            color: '#fff',
            letterSpacing: '0.05em',
            lineHeight: 1,
            marginBottom: '0.3rem',
          }}>
            {pad(unit.value)}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.4rem',
            opacity: 0.35,
            letterSpacing: '0.12em',
          }}>
            {unit.label}
          </div>
        </div>
      ))}
    </div>
  )
}

const MOCK_COUNTRY_DATA: Record<string, { lastVisit: string; places: number; description: string }> = {
  // North America
  'USA': { lastVisit: 'Feb 2026', places: 12, description: 'From NYC skyscrapers to LA beaches, Speed conquered coast to coast with epic fan meetups and insane challenges.' },
  'Canada': { lastVisit: 'Jan 2026', places: 5, description: 'Snow-covered mountains, freezing challenges, and the warmest fans — Speed took on the Great White North.' },
  'Mexico': { lastVisit: 'Dec 2025', places: 3, description: 'Vibrant streets, legendary tacos, and ancient ruins. Speed brought the energy to every corner of Mexico.' },
  'Costa Rica': { lastVisit: 'Oct 2025', places: 2, description: 'Zip lines through rainforests and volcanic hot springs — pure adventure in Central America.' },
  'Cuba': { lastVisit: 'Sep 2025', places: 1, description: 'Classic cars, colorful streets, and rich culture. A unique stop on Speed\'s world tour.' },
  // South America
  'Brazil': { lastVisit: 'Nov 2025', places: 7, description: 'Carnival energy, Copacabana vibes, and the Amazon jungle. Brazil matched Speed\'s intensity.' },
  'Argentina': { lastVisit: 'Oct 2025', places: 4, description: 'Tango, steak, and football passion. Buenos Aires welcomed Speed with open arms.' },
  'Colombia': { lastVisit: 'Sep 2025', places: 2, description: 'Coffee farms, vibrant nightlife, and incredible hospitality in the heart of South America.' },
  'Peru': { lastVisit: 'Aug 2025', places: 1, description: 'Machu Picchu and ancient Incan history — a bucket-list adventure for Speed.' },
  'Chile': { lastVisit: 'Jul 2025', places: 2, description: 'From the Atacama Desert to Patagonian glaciers, Chile offered extreme contrasts.' },
  'Ecuador': { lastVisit: 'Jun 2025', places: 1, description: 'Straddling the equator with volcanic landscapes and the Galápagos nearby.' },
  'Venezuela': { lastVisit: 'May 2025', places: 2, description: 'Angel Falls and Caribbean coastlines — natural beauty at every turn.' },
  'Bolivia': { lastVisit: 'Apr 2025', places: 1, description: 'The surreal Salar de Uyuni salt flats made for an unforgettable backdrop.' },
  'Uruguay': { lastVisit: 'Mar 2025', places: 1, description: 'Laid-back beaches and charming colonial towns along the River Plate.' },
  // Europe
  'France': { lastVisit: 'Jan 2026', places: 6, description: 'Paris lights, croissant challenges, and the Eiffel Tower sprint. Speed conquered France in style.' },
  'England': { lastVisit: 'Mar 2026', places: 8, description: 'London bridges, football stadiums, and iconic landmarks. Speed\'s second home in Europe.' },
  'Spain': { lastVisit: 'Dec 2025', places: 5, description: 'Tapas, flamenco, and La Rambla dashes. Spain brought the heat and the flavor.' },
  'Italy': { lastVisit: 'Nov 2025', places: 9, description: 'Pizza in Naples, gondolas in Venice, and the Colosseum at night. Italy was legendary.' },
  'Germany': { lastVisit: 'Feb 2026', places: 4, description: 'Berlin\'s history, Oktoberfest energy, and autobahn speed. A perfect match for Speed.' },
  'Greece': { lastVisit: 'Oct 2025', places: 4, description: 'Santorini sunsets, ancient ruins, and crystal-clear waters in the Mediterranean.' },
  'Portugal': { lastVisit: 'Dec 2025', places: 3, description: 'Lisbon trams, pastel de nata, and Atlantic coastline vibes.' },
  'Turkey': { lastVisit: 'Nov 2025', places: 3, description: 'Istanbul bazaars, Cappadocia balloons, and where East meets West.' },
  'Norway': { lastVisit: 'Jan 2026', places: 2, description: 'Northern lights, fjords, and Viking history in the land of the midnight sun.' },
  'Croatia': { lastVisit: 'Aug 2025', places: 1, description: 'Dubrovnik walls and Adriatic coastline — a hidden gem of Europe.' },
  'Switzerland': { lastVisit: 'Feb 2026', places: 3, description: 'Alpine peaks, chocolate, and paragliding over the Swiss Alps.' },
  // Africa
  'Egypt': { lastVisit: 'Sep 2025', places: 3, description: 'Pyramids, pharaohs, and camel sprints. Ancient history came alive for Speed.' },
  'South Africa': { lastVisit: 'Aug 2025', places: 2, description: 'Table Mountain, shark diving, and safari adventures at the tip of Africa.' },
  'Morocco': { lastVisit: 'Oct 2025', places: 3, description: 'Marrakech souks, Sahara nights, and vibrant colors everywhere.' },
  'Kenya': { lastVisit: 'Jul 2025', places: 2, description: 'Safari game drives and Maasai culture in the heart of East Africa.' },
  'Nigeria': { lastVisit: 'Nov 2025', places: 1, description: 'Lagos energy, Afrobeats, and one of the most passionate fan bases on the planet.' },
  'Ghana': { lastVisit: 'Jun 2025', places: 1, description: 'West African warmth, vibrant markets, and rich cultural heritage.' },
  'Ethiopia': { lastVisit: 'May 2025', places: 2, description: 'Ancient churches, coffee origins, and the cradle of civilization.' },
  'Madagascar': { lastVisit: 'Apr 2025', places: 1, description: 'Unique wildlife, baobab trees, and an island like no other.' },
  'Senegal': { lastVisit: 'Mar 2025', places: 1, description: 'Dakar\'s energy, colorful fishing boats, and the gateway to West Africa.' },
  'Algeria': { lastVisit: 'Feb 2025', places: 1, description: 'Saharan landscapes and Mediterranean coastline in North Africa\'s largest country.' },
  'Mozambique': { lastVisit: 'Jan 2025', places: 1, description: 'Pristine beaches and coral reefs along the Indian Ocean coast.' },
  'Cameroon': { lastVisit: 'Dec 2024', places: 1, description: 'Diverse landscapes from rainforest to savanna — Africa in miniature.' },
  'Uganda': { lastVisit: 'Nov 2024', places: 1, description: 'Mountain gorillas and the source of the Nile in the Pearl of Africa.' },
  // Asia & Oceania
  'Japan': { lastVisit: 'Mar 2026', places: 11, description: 'Shibuya chaos, ramen battles, and Mt. Fuji sunrise. Japan was Speed\'s ultimate playground.' },
  'Thailand': { lastVisit: 'Dec 2025', places: 4, description: 'Bangkok tuk tuks, floating markets, and tropical island paradise.' },
  'India': { lastVisit: 'Oct 2025', places: 2, description: 'Taj Mahal sunrises, street food chaos, and a billion fans waiting.' },
  'China': { lastVisit: 'Mar 2026', places: 5, description: 'Great Wall marathons, Shanghai skylines, and ancient temples.' },
  'South Korea': { lastVisit: 'Feb 2026', places: 3, description: 'K-pop, Korean BBQ, and Gangnam style. Speed fit right in with Seoul\'s energy.' },
  'Indonesia': { lastVisit: 'Dec 2025', places: 2, description: 'Bali temples, Komodo dragons, and tropical adventures across thousands of islands.' },
  'Australia': { lastVisit: 'Jan 2026', places: 6, description: 'Sydney Harbour runs, reef snorkeling, and outback adventures down under.' },
  'Vietnam': { lastVisit: 'Nov 2025', places: 2, description: 'Ha Long Bay cruises, pho challenges, and motorbike madness in Hanoi.' },
  'Philippines': { lastVisit: 'Jan 2026', places: 3, description: 'Chocolate Hills, island hopping, and some of the friendliest people on Earth.' },
  'New Zealand': { lastVisit: 'Feb 2026', places: 2, description: 'Bungee jumps, Hobbiton, and jaw-dropping landscapes at every turn.' },
}

interface SpeedBooking {
  title: string;
  type: string;
  rating: number;
  pricePerPerson: number;
}

const MOCK_BOOKINGS: Record<string, SpeedBooking[]> = {
  'USA': [
    { title: 'Times Square Night Run', type: 'Activity', rating: 4.8, pricePerPerson: 45 },
    { title: 'Hollywood Hills Hike', type: 'Tour', rating: 4.6, pricePerPerson: 30 },
    { title: 'NYC Street Food Tour', type: 'Food', rating: 4.9, pricePerPerson: 55 },
  ],
  'Japan': [
    { title: 'Shibuya Crossing Challenge', type: 'Activity', rating: 5.0, pricePerPerson: 0 },
    { title: 'Osaka Ramen Crawl', type: 'Food', rating: 4.9, pricePerPerson: 40 },
    { title: 'Mt. Fuji Sunrise Trek', type: 'Tour', rating: 4.7, pricePerPerson: 85 },
  ],
  'England': [
    { title: 'London Bridge Sprint', type: 'Activity', rating: 4.5, pricePerPerson: 20 },
    { title: 'Camden Market Food Run', type: 'Food', rating: 4.8, pricePerPerson: 35 },
    { title: 'Manchester Stadium Tour', type: 'Tour', rating: 4.7, pricePerPerson: 50 },
  ],
  'France': [
    { title: 'Eiffel Tower Speed Climb', type: 'Activity', rating: 4.6, pricePerPerson: 25 },
    { title: 'Paris Croissant Challenge', type: 'Food', rating: 4.9, pricePerPerson: 30 },
  ],
  'Brazil': [
    { title: 'Copacabana Beach Dash', type: 'Activity', rating: 4.7, pricePerPerson: 15 },
    { title: 'Rio Favela Tour', type: 'Tour', rating: 4.4, pricePerPerson: 40 },
    { title: 'Amazon Jungle Day Trip', type: 'Tour', rating: 4.8, pricePerPerson: 120 },
  ],
  'Australia': [
    { title: 'Sydney Harbour Run', type: 'Activity', rating: 4.6, pricePerPerson: 0 },
    { title: 'Great Barrier Reef Snorkel', type: 'Tour', rating: 4.9, pricePerPerson: 95 },
  ],
  'Italy': [
    { title: 'Colosseum Night Tour', type: 'Tour', rating: 4.8, pricePerPerson: 60 },
    { title: 'Naples Pizza Showdown', type: 'Food', rating: 5.0, pricePerPerson: 25 },
    { title: 'Venice Gondola Race', type: 'Activity', rating: 4.5, pricePerPerson: 70 },
  ],
  'Spain': [
    { title: 'La Rambla Street Dash', type: 'Activity', rating: 4.5, pricePerPerson: 0 },
    { title: 'Tapas Bar Hopping', type: 'Food', rating: 4.8, pricePerPerson: 35 },
  ],
  'Germany': [
    { title: 'Berlin Wall Run', type: 'Activity', rating: 4.4, pricePerPerson: 0 },
    { title: 'Oktoberfest Experience', type: 'Food', rating: 4.7, pricePerPerson: 45 },
  ],
  'South Korea': [
    { title: 'Gangnam Style Dance-off', type: 'Activity', rating: 4.9, pricePerPerson: 0 },
    { title: 'Korean BBQ Challenge', type: 'Food', rating: 5.0, pricePerPerson: 30 },
    { title: 'DMZ Border Tour', type: 'Tour', rating: 4.6, pricePerPerson: 65 },
  ],
  'Thailand': [
    { title: 'Bangkok Tuk Tuk Race', type: 'Activity', rating: 4.7, pricePerPerson: 10 },
    { title: 'Floating Market Tour', type: 'Tour', rating: 4.5, pricePerPerson: 25 },
  ],
  'Mexico': [
    { title: 'Cancun Cenote Dive', type: 'Tour', rating: 4.8, pricePerPerson: 55 },
    { title: 'Taco Street Challenge', type: 'Food', rating: 4.9, pricePerPerson: 15 },
  ],
  'Canada': [
    { title: 'Niagara Falls Boat Ride', type: 'Tour', rating: 4.7, pricePerPerson: 40 },
    { title: 'Toronto CN Tower Edge Walk', type: 'Activity', rating: 4.9, pricePerPerson: 175 },
  ],
  'India': [
    { title: 'Taj Mahal Sunrise Visit', type: 'Tour', rating: 4.8, pricePerPerson: 20 },
    { title: 'Delhi Street Food Run', type: 'Food', rating: 4.6, pricePerPerson: 10 },
  ],
  'Egypt': [
    { title: 'Pyramid Camel Sprint', type: 'Activity', rating: 4.5, pricePerPerson: 30 },
    { title: 'Nile River Cruise', type: 'Tour', rating: 4.7, pricePerPerson: 80 },
  ],
  'Turkey': [
    { title: 'Cappadocia Balloon Ride', type: 'Tour', rating: 5.0, pricePerPerson: 150 },
    { title: 'Istanbul Bazaar Dash', type: 'Activity', rating: 4.6, pricePerPerson: 0 },
  ],
  'Greece': [
    { title: 'Santorini Sunset Chase', type: 'Activity', rating: 4.9, pricePerPerson: 0 },
    { title: 'Athens Acropolis Tour', type: 'Tour', rating: 4.7, pricePerPerson: 35 },
  ],
  'Kenya': [
    { title: 'Safari Game Drive', type: 'Tour', rating: 4.9, pricePerPerson: 110 },
    { title: 'Maasai Village Visit', type: 'Tour', rating: 4.5, pricePerPerson: 40 },
  ],
  'South Africa': [
    { title: 'Table Mountain Hike', type: 'Activity', rating: 4.6, pricePerPerson: 25 },
    { title: 'Cape Town Shark Dive', type: 'Tour', rating: 4.8, pricePerPerson: 130 },
  ],
  'Morocco': [
    { title: 'Marrakech Souk Sprint', type: 'Activity', rating: 4.5, pricePerPerson: 0 },
    { title: 'Sahara Desert Night', type: 'Tour', rating: 4.9, pricePerPerson: 95 },
  ],
  'New Zealand': [
    { title: 'Queenstown Bungee Jump', type: 'Activity', rating: 4.9, pricePerPerson: 140 },
    { title: 'Hobbiton Movie Set Tour', type: 'Tour', rating: 4.8, pricePerPerson: 75 },
  ],
  'Colombia': [
    { title: 'Cartagena Old Town Walk', type: 'Tour', rating: 4.6, pricePerPerson: 20 },
  ],
  'Peru': [
    { title: 'Machu Picchu Trek', type: 'Tour', rating: 5.0, pricePerPerson: 90 },
  ],
  'Chile': [
    { title: 'Atacama Desert Stargazing', type: 'Tour', rating: 4.8, pricePerPerson: 55 },
  ],
  'Portugal': [
    { title: 'Lisbon Tram 28 Ride', type: 'Activity', rating: 4.5, pricePerPerson: 5 },
    { title: 'Pastel de Nata Tasting', type: 'Food', rating: 4.9, pricePerPerson: 15 },
  ],
  'Norway': [
    { title: 'Northern Lights Chase', type: 'Tour', rating: 5.0, pricePerPerson: 120 },
  ],
  'Croatia': [
    { title: 'Dubrovnik Wall Walk', type: 'Tour', rating: 4.7, pricePerPerson: 30 },
  ],
  'Switzerland': [
    { title: 'Swiss Alps Paragliding', type: 'Activity', rating: 4.9, pricePerPerson: 160 },
  ],
  'Vietnam': [
    { title: 'Ha Long Bay Cruise', type: 'Tour', rating: 4.8, pricePerPerson: 50 },
    { title: 'Hanoi Pho Challenge', type: 'Food', rating: 4.7, pricePerPerson: 8 },
  ],
  'Philippines': [
    { title: 'Chocolate Hills Tour', type: 'Tour', rating: 4.5, pricePerPerson: 25 },
  ],
  'Indonesia': [
    { title: 'Bali Temple Run', type: 'Activity', rating: 4.6, pricePerPerson: 15 },
    { title: 'Komodo Island Trek', type: 'Tour', rating: 4.8, pricePerPerson: 85 },
  ],
  'China': [
    { title: 'Great Wall Marathon', type: 'Activity', rating: 4.9, pricePerPerson: 60 },
    { title: 'Shanghai Street Eats', type: 'Food', rating: 4.7, pricePerPerson: 20 },
  ],
}

interface SpeedClip {
  title: string;
  views: string;
  duration: string;
}

const MOCK_CLIPS: Record<string, SpeedClip[]> = {
  'USA': [
    { title: 'Speed Runs Through Times Square at 2AM', views: '14M', duration: '12:34' },
    { title: 'I Challenged NYC Taxi Drivers to a Race', views: '9.2M', duration: '18:21' },
    { title: 'Hollywood Walk of Fame Speed Run', views: '7.8M', duration: '15:45' },
    { title: 'Miami Beach Volleyball vs Pros', views: '6.4M', duration: '14:08' },
    { title: 'Chicago Deep Dish Pizza Eating Contest', views: '5.9M', duration: '11:22' },
    { title: 'Las Vegas Strip at 3AM Challenge', views: '8.1M', duration: '16:40' },
  ],
  'Japan': [
    { title: 'Shibuya Crossing at Peak Hour is INSANE', views: '22M', duration: '14:12' },
    { title: 'I Tried Every Ramen in Osaka', views: '11M', duration: '20:33' },
    { title: 'Mt. Fuji Sunrise Challenge', views: '8.5M', duration: '16:50' },
    { title: 'Tokyo Robot Restaurant Experience', views: '7.3M', duration: '13:25' },
    { title: 'Kyoto Temple Run at Dawn', views: '6.1M', duration: '11:48' },
    { title: 'Akihabara Gaming Marathon', views: '9.8M', duration: '22:15' },
  ],
  'England': [
    { title: 'Speed Takes Over London Bridge', views: '16M', duration: '11:28' },
    { title: 'Manchester United Stadium Tour', views: '13M', duration: '19:15' },
    { title: 'Camden Market Food Challenge', views: '6.3M', duration: '14:40' },
    { title: 'Big Ben Selfie Sprint', views: '5.7M', duration: '8:55' },
    { title: 'Liverpool Beatles Tour with Fans', views: '4.9M', duration: '15:30' },
    { title: 'Buckingham Palace Guard Challenge', views: '10M', duration: '12:18' },
  ],
  'France': [
    { title: 'Racing Up the Eiffel Tower', views: '18M', duration: '13:55' },
    { title: 'Paris Croissant Eating Contest', views: '7.1M', duration: '10:22' },
    { title: 'Louvre Museum Speed Tour', views: '5.8M', duration: '16:45' },
    { title: 'French Riviera Jet Ski Race', views: '6.5M', duration: '12:30' },
    { title: 'Versailles Palace Exploration', views: '4.2M', duration: '18:10' },
  ],
  'Brazil': [
    { title: 'Copacabana Beach Sprint Challenge', views: '12M', duration: '15:30' },
    { title: 'Amazon Jungle Survival Day', views: '9.8M', duration: '22:14' },
    { title: 'Rio Favela Tour with Locals', views: '8.1M', duration: '17:45' },
    { title: 'São Paulo Street Art Walk', views: '5.3M', duration: '13:20' },
    { title: 'Christ the Redeemer Sunrise Hike', views: '7.6M', duration: '11:55' },
    { title: 'Carnival Dance-off Challenge', views: '11M', duration: '14:40' },
  ],
  'Italy': [
    { title: 'Colosseum at Night is UNREAL', views: '10M', duration: '12:18' },
    { title: 'Naples Pizza Showdown', views: '15M', duration: '16:33' },
    { title: 'Venice Gondola Race Gone Wrong', views: '11M', duration: '13:50' },
    { title: 'Amalfi Coast Road Trip', views: '6.8M', duration: '19:25' },
    { title: 'Florence Gelato Challenge', views: '5.2M', duration: '10:15' },
    { title: 'Pompeii Ruins Exploration', views: '4.7M', duration: '15:40' },
  ],
  'Australia': [
    { title: 'Sydney Harbour Bridge Run', views: '7.5M', duration: '11:42' },
    { title: 'Great Barrier Reef Snorkeling', views: '8.9M', duration: '14:20' },
    { title: 'Melbourne Street Art Tour', views: '4.3M', duration: '12:55' },
    { title: 'Outback Survival Challenge', views: '6.7M', duration: '20:30' },
    { title: 'Kangaroo Island Wildlife Day', views: '5.1M', duration: '16:10' },
  ],
  'South Korea': [
    { title: 'Gangnam Style Dance-off in Seoul', views: '20M', duration: '10:55' },
    { title: 'Korean BBQ Mukbang Challenge', views: '14M', duration: '18:30' },
    { title: 'DMZ Border Visit', views: '6.7M', duration: '15:12' },
    { title: 'Bukchon Hanok Village Walk', views: '4.8M', duration: '11:40' },
    { title: 'K-Pop Dance Cover on the Street', views: '12M', duration: '9:25' },
    { title: 'Jeju Island Road Trip', views: '5.5M', duration: '17:50' },
  ],
  'Spain': [
    { title: 'La Rambla Street Sprint', views: '5.4M', duration: '9:30' },
    { title: 'Barcelona Tapas Bar Crawl', views: '6.8M', duration: '16:15' },
    { title: 'Running of the Bulls Reaction', views: '9.1M', duration: '11:45' },
    { title: 'Sagrada Familia Inside Tour', views: '4.6M', duration: '14:20' },
    { title: 'Ibiza Sunset DJ Set', views: '7.3M', duration: '13:05' },
  ],
  'Germany': [
    { title: 'Berlin Wall History Run', views: '4.9M', duration: '13:22' },
    { title: 'Oktoberfest Speed Challenge', views: '8.2M', duration: '17:40' },
    { title: 'Autobahn No Speed Limit Test', views: '11M', duration: '10:55' },
    { title: 'Cologne Cathedral Climb', views: '3.8M', duration: '12:30' },
    { title: 'Munich Beer Garden Tour', views: '5.6M', duration: '15:15' },
  ],
  'Mexico': [
    { title: 'Cancun Cenote Diving Adventure', views: '7.3M', duration: '14:55' },
    { title: 'Mexico City Taco Challenge', views: '9.1M', duration: '12:10' },
    { title: 'Chichen Itza Pyramid Visit', views: '5.8M', duration: '16:20' },
    { title: 'Oaxaca Mezcal Tasting', views: '4.2M', duration: '11:35' },
    { title: 'Lucha Libre Wrestling Night', views: '8.5M', duration: '13:45' },
  ],
  'Canada': [
    { title: 'Niagara Falls Up Close', views: '7.9M', duration: '10:45' },
    { title: 'CN Tower Edge Walk', views: '9.5M', duration: '13:20' },
    { title: 'Banff National Park Hike', views: '6.2M', duration: '17:30' },
    { title: 'Vancouver Sushi Challenge', views: '4.8M', duration: '14:55' },
    { title: 'Montreal Poutine Tour', views: '5.3M', duration: '11:40' },
  ],
  'Kenya': [
    { title: 'Safari Game Drive with Lions', views: '10M', duration: '18:30' },
    { title: 'Maasai Village Experience', views: '5.6M', duration: '14:15' },
    { title: 'Nairobi City Night Walk', views: '3.9M', duration: '12:40' },
    { title: 'Great Rift Valley Overlook', views: '4.5M', duration: '10:20' },
    { title: 'Kenyan Marathon Training Day', views: '7.2M', duration: '16:55' },
  ],
  'New Zealand': [
    { title: 'Queenstown Bungee Jump GONE WRONG', views: '16M', duration: '8:55' },
    { title: 'Hobbiton Movie Set Tour', views: '7.2M', duration: '15:40' },
    { title: 'Milford Sound Kayaking', views: '5.4M', duration: '13:25' },
    { title: 'Rotorua Geothermal Hot Springs', views: '4.1M', duration: '11:10' },
    { title: 'Skydiving Over Lake Taupo', views: '8.8M', duration: '9:50' },
  ],
  'China': [
    { title: 'Running the Great Wall of China', views: '19M', duration: '16:20' },
    { title: 'Shanghai Night Street Eats', views: '8.4M', duration: '14:10' },
    { title: 'Terracotta Warriors Up Close', views: '6.1M', duration: '13:35' },
    { title: 'Chengdu Panda Sanctuary Visit', views: '9.3M', duration: '11:50' },
    { title: 'Hong Kong Night Market Sprint', views: '7.7M', duration: '12:25' },
  ],
  'Vietnam': [
    { title: 'Ha Long Bay Boat Adventure', views: '6.8M', duration: '16:40' },
    { title: 'Hanoi Pho Challenge', views: '5.5M', duration: '11:55' },
    { title: 'Ho Chi Minh City Motorbike Chaos', views: '7.9M', duration: '13:30' },
    { title: 'Hoi An Lantern Festival Night', views: '4.6M', duration: '10:45' },
    { title: 'Mekong Delta Floating Market', views: '5.1M', duration: '15:20' },
  ],
  'Costa Rica': [
    { title: 'Zip Lining Through the Cloud Forest', views: '6.1M', duration: '14:20' },
    { title: 'Arenal Volcano Hot Springs', views: '4.3M', duration: '11:05' },
    { title: 'Manuel Antonio Beach Wildlife', views: '3.8M', duration: '12:50' },
    { title: 'White Water Rafting Adventure', views: '5.5M', duration: '15:30' },
    { title: 'Sloth Sanctuary Visit', views: '7.2M', duration: '9:40' },
  ],
  'Chile': [
    { title: 'Atacama Desert Stargazing Night', views: '5.7M', duration: '16:30' },
    { title: 'Patagonia Glacier Hike', views: '7.2M', duration: '18:45' },
    { title: 'Santiago Street Food Market', views: '3.9M', duration: '12:15' },
    { title: 'Easter Island Moai Mystery', views: '8.4M', duration: '14:50' },
    { title: 'Valparaíso Colorful Hills Walk', views: '4.1M', duration: '11:25' },
  ],
  'Ecuador': [
    { title: 'Standing on the Equator Line', views: '4.8M', duration: '9:15' },
    { title: 'Galápagos Islands Wildlife Tour', views: '8.3M', duration: '20:10' },
    { title: 'Quito Old Town Night Walk', views: '3.5M', duration: '11:40' },
    { title: 'Cotopaxi Volcano Hike', views: '5.2M', duration: '15:55' },
    { title: 'Amazon Rainforest Lodge Stay', views: '6.1M', duration: '18:30' },
  ],
  'Venezuela': [
    { title: 'Angel Falls — World\'s Tallest Waterfall', views: '6.9M', duration: '15:40' },
    { title: 'Caribbean Coast Beach Day', views: '3.8M', duration: '12:25' },
    { title: 'Los Roques Island Hopping', views: '4.5M', duration: '13:10' },
    { title: 'Caracas Mountain Cable Car', views: '3.2M', duration: '10:50' },
  ],
  'Uruguay': [
    { title: 'Montevideo Old Town Walk', views: '3.2M', duration: '10:50' },
    { title: 'Punta del Este Beach Sprint', views: '4.1M', duration: '8:30' },
    { title: 'Colonia del Sacramento Day Trip', views: '2.9M', duration: '13:15' },
    { title: 'Uruguayan Asado Experience', views: '3.7M', duration: '11:40' },
  ],
  'Croatia': [
    { title: 'Dubrovnik City Walls Full Walk', views: '5.4M', duration: '13:55' },
    { title: 'Plitvice Lakes Nature Run', views: '4.7M', duration: '15:20' },
    { title: 'Split Diocletian Palace Tour', views: '3.6M', duration: '11:30' },
    { title: 'Hvar Island Sunset Kayak', views: '4.2M', duration: '12:45' },
  ],
  'Portugal': [
    { title: 'Lisbon Tram 28 Full Ride', views: '4.8M', duration: '11:30' },
    { title: 'Pastel de Nata Factory Tour', views: '6.2M', duration: '9:45' },
    { title: 'Porto Wine Cellar Challenge', views: '5.1M', duration: '14:20' },
    { title: 'Algarve Cave Boat Tour', views: '7.3M', duration: '12:55' },
    { title: 'Sintra Palace Day Trip', views: '4.0M', duration: '16:10' },
  ],
  'Ghana': [
    { title: 'Accra Market Day Challenge', views: '3.9M', duration: '12:40' },
    { title: 'Cape Coast Castle History Tour', views: '4.5M', duration: '14:10' },
    { title: 'Kakum Canopy Walkway', views: '5.1M', duration: '10:25' },
    { title: 'Ghanaian Jollof Rice Cook-off', views: '3.4M', duration: '13:50' },
  ],
  'Ethiopia': [
    { title: 'Lalibela Rock Churches Visit', views: '5.1M', duration: '16:05' },
    { title: 'Ethiopian Coffee Ceremony', views: '3.6M', duration: '10:30' },
    { title: 'Simien Mountains Trek', views: '4.8M', duration: '18:20' },
    { title: 'Addis Ababa Mercato Walk', views: '3.2M', duration: '12:15' },
  ],
  'Madagascar': [
    { title: 'Baobab Avenue at Sunset', views: '4.4M', duration: '11:20' },
    { title: 'Lemur Encounter in the Wild', views: '6.2M', duration: '13:45' },
    { title: 'Tsingy Stone Forest Climb', views: '5.0M', duration: '15:30' },
    { title: 'Nosy Be Island Beach Day', views: '3.7M', duration: '10:50' },
  ],
  'Senegal': [
    { title: 'Dakar Street Art Tour', views: '3.1M', duration: '10:15' },
    { title: 'Gorée Island History Walk', views: '3.8M', duration: '12:50' },
    { title: 'Lake Retba Pink Lake Visit', views: '4.6M', duration: '9:40' },
    { title: 'Senegalese Thieboudienne Feast', views: '3.3M', duration: '11:30' },
  ],
  'Algeria': [
    { title: 'Sahara Dune Surfing Adventure', views: '4.6M', duration: '14:30' },
    { title: 'Algiers Casbah Exploration', views: '3.3M', duration: '11:40' },
    { title: 'Timgad Roman Ruins Walk', views: '3.9M', duration: '13:15' },
    { title: 'Constantine Bridges Tour', views: '3.1M', duration: '10:55' },
  ],
  'Mozambique': [
    { title: 'Bazaruto Archipelago Diving', views: '3.5M', duration: '15:10' },
    { title: 'Maputo City Night Walk', views: '2.8M', duration: '9:55' },
    { title: 'Tofo Beach Whale Shark Swim', views: '5.3M', duration: '12:40' },
    { title: 'Mozambique Island History Tour', views: '3.0M', duration: '14:20' },
  ],
  'Cameroon': [
    { title: 'Mount Cameroon Climb Challenge', views: '4.2M', duration: '18:20' },
    { title: 'Douala Street Food Tour', views: '3.4M', duration: '12:05' },
    { title: 'Waza National Park Safari', views: '3.8M', duration: '15:45' },
    { title: 'Limbe Black Sand Beach', views: '2.9M', duration: '10:30' },
  ],
  'Uganda': [
    { title: 'Mountain Gorilla Trek', views: '7.8M', duration: '19:30' },
    { title: 'Source of the Nile Visit', views: '4.0M', duration: '13:15' },
    { title: 'Bwindi Forest Night Hike', views: '5.2M', duration: '16:40' },
    { title: 'Kampala Rolex Street Food', views: '3.5M', duration: '10:50' },
  ],
}

const TYPE_COLORS: Record<string, string> = {
  'Activity': '#fff',
  'Tour': '#fff',
  'Food': '#fff',
}

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
}

const SEARCHABLE_COUNTRIES: { name: string; locked: boolean; continent: string }[] = [
  // North America
  { name: 'USA', locked: false, continent: 'na' },
  { name: 'Canada', locked: false, continent: 'na' },
  { name: 'Mexico', locked: false, continent: 'na' },
  { name: 'Costa Rica', locked: false, continent: 'na' },
  { name: 'Cuba', locked: true, continent: 'na' },
  // South America
  { name: 'Brazil', locked: false, continent: 'sa' },
  { name: 'Argentina', locked: true, continent: 'sa' },
  { name: 'Colombia', locked: true, continent: 'sa' },
  { name: 'Peru', locked: true, continent: 'sa' },
  { name: 'Chile', locked: false, continent: 'sa' },
  { name: 'Ecuador', locked: false, continent: 'sa' },
  { name: 'Venezuela', locked: false, continent: 'sa' },
  { name: 'Bolivia', locked: true, continent: 'sa' },
  { name: 'Uruguay', locked: false, continent: 'sa' },
  // Europe
  { name: 'France', locked: false, continent: 'eu' },
  { name: 'England', locked: false, continent: 'eu' },
  { name: 'Spain', locked: false, continent: 'eu' },
  { name: 'Italy', locked: false, continent: 'eu' },
  { name: 'Germany', locked: false, continent: 'eu' },
  { name: 'Greece', locked: true, continent: 'eu' },
  { name: 'Portugal', locked: false, continent: 'eu' },
  { name: 'Turkey', locked: true, continent: 'eu' },
  { name: 'Norway', locked: true, continent: 'eu' },
  { name: 'Croatia', locked: false, continent: 'eu' },
  { name: 'Switzerland', locked: true, continent: 'eu' },
  // Africa
  { name: 'Egypt', locked: true, continent: 'af' },
  { name: 'South Africa', locked: true, continent: 'af' },
  { name: 'Morocco', locked: true, continent: 'af' },
  { name: 'Kenya', locked: false, continent: 'af' },
  { name: 'Nigeria', locked: true, continent: 'af' },
  { name: 'Ghana', locked: false, continent: 'af' },
  { name: 'Ethiopia', locked: false, continent: 'af' },
  { name: 'Madagascar', locked: false, continent: 'af' },
  { name: 'Senegal', locked: false, continent: 'af' },
  { name: 'Algeria', locked: false, continent: 'af' },
  { name: 'Mozambique', locked: false, continent: 'af' },
  { name: 'Cameroon', locked: false, continent: 'af' },
  { name: 'Uganda', locked: false, continent: 'af' },
  // Asia & Oceania
  { name: 'Japan', locked: false, continent: 'as' },
  { name: 'Thailand', locked: true, continent: 'as' },
  { name: 'India', locked: true, continent: 'as' },
  { name: 'China', locked: true, continent: 'as' },
  { name: 'South Korea', locked: false, continent: 'as' },
  { name: 'Indonesia', locked: true, continent: 'as' },
  { name: 'Australia', locked: false, continent: 'as' },
  { name: 'Vietnam', locked: false, continent: 'as' },
  { name: 'Philippines', locked: true, continent: 'as' },
  { name: 'New Zealand', locked: false, continent: 'as' },
]

/* ────────────────────────────────────────────
   App
   ──────────────────────────────────────────── */
function App() {
  const [mode, setMode] = useState<AppMode>('landing')
  const [showUI, setShowUI] = useState(false)
  const [activePage, setActivePage] = useState<MenuPage>('explore')
  const [isFlat, setIsFlat] = useState(false)
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null)
  const [hoveredLocked, setHoveredLocked] = useState(false)
  const [hoveredContinent, setHoveredContinent] = useState<string | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [selectedContinent, setSelectedContinent] = useState<string | null>(null)
  const [selectedLocked, setSelectedLocked] = useState(false)
  const [showLocked, setShowLocked] = useState(true)
  const [showLines, setShowLines] = useState(true)
  const [soundOn, setSoundOn] = useState(true)
  const [autoRotateEnabled, setAutoRotateEnabled] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [lightboxClip, setLightboxClip] = useState<SpeedClip | null>(null)
  const [easterEggsFound, setEasterEggsFound] = useState<Set<string>>(new Set())
  const [easterEggModal, setEasterEggModal] = useState<{ id: string; title: string; description: string; icon: string } | null>(null)
  const [lightspeedIntensity, setLightspeedIntensity] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const controlsRef = useRef<any>(null)
  const zoomRef = useRef(0)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hoveringCanvasRef = useRef(false)
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)
  const soundOnRef = useRef(soundOn)
  soundOnRef.current = soundOn
  const spaceSpinRef = useRef(0)
  const spaceHeldRef = useRef(false)
  const spaceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const spaceTriggeredRef = useRef(false)
  const pendingSpaceEggRef = useRef<{ id: string; title: string; description: string; icon: string } | null>(null)
  const spaceEggTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const searchResults = searchQuery.trim()
    ? SEARCHABLE_COUNTRIES.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 8)
    : []

  const handleSearchSelect = useCallback((country: typeof SEARCHABLE_COUNTRIES[0]) => {
    if (soundOn) playClickSound()
    setSelectedCountry(country.name)
    setSelectedLocked(country.locked)
    setSelectedContinent(country.continent)
    setActivePage('explore')
    setSearchOpen(false)
    setSearchQuery('')
  }, [soundOn])

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [searchOpen])

  const triggerEasterEgg = useCallback((egg: { id: string; title: string; description: string; icon: string }) => {
    setEasterEggsFound(prev => {
      if (prev.has(egg.id)) return prev
      const next = new Set(prev)
      next.add(egg.id)
      setEasterEggModal(egg)
      return next
    })
  }, [])

  // Shooting stars
  const [shootingStars, setShootingStars] = useState<{ id: number; top: number; left: number; angle: number; delay: number }[]>([])
  const starIdRef = useRef(0)

  useEffect(() => {
    if (mode !== 'playing') return
    const spawn = () => {
      const id = ++starIdRef.current
      setShootingStars(prev => [...prev, {
        id,
        top: Math.random() * 40,
        left: Math.random() * 80 + 10,
        angle: 25 + Math.random() * 20,
        delay: 0,
      }])
      setTimeout(() => setShootingStars(prev => prev.filter(s => s.id !== id)), 3000)
    }
    const interval = setInterval(spawn, 6000 + Math.random() * 8000)
    const firstTimeout = setTimeout(spawn, 2000 + Math.random() * 3000)
    return () => { clearInterval(interval); clearTimeout(firstTimeout) }
  }, [mode])

  const handleStarClick = useCallback((starId: number) => {
    setShootingStars(prev => prev.filter(s => s.id !== starId))
    triggerEasterEgg({
      id: 'shooting_star',
      title: 'Wish Upon a Star',
      description: 'You caught a shooting star! Speed would be proud of those reflexes.',
      icon: '☄',
    })
  }, [triggerEasterEgg])

  // Space bar hold to spin
  useEffect(() => {
    if (mode !== 'playing') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || spaceHeldRef.current) return
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      e.preventDefault()
      spaceHeldRef.current = true
      spaceTriggeredRef.current = false
      spaceSpinRef.current = 0.5
      spaceIntervalRef.current = setInterval(() => {
        spaceSpinRef.current = Math.min(spaceSpinRef.current + 2, 120)
        // Lightspeed kicks in after speed > 5, scales 0→1 between 5 and 50
        const intensity = Math.min(1, Math.max(0, (spaceSpinRef.current - 5) / 45))
        setLightspeedIntensity(intensity)
        if (spaceSpinRef.current >= 15 && !spaceTriggeredRef.current) {
          spaceTriggeredRef.current = true
          pendingSpaceEggRef.current = {
            id: 'speed_spin',
            title: 'Full Speed Ahead',
            description: 'You spun the globe at maximum velocity! The world is a blur at this speed.',
            icon: '💫',
          }
        }
      }, 100)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceHeldRef.current = false
      spaceSpinRef.current = 0
      setLightspeedIntensity(0)
      if (spaceIntervalRef.current) { clearInterval(spaceIntervalRef.current); spaceIntervalRef.current = null }
      if (pendingSpaceEggRef.current) {
        const egg = pendingSpaceEggRef.current
        pendingSpaceEggRef.current = null
        spaceEggTimeoutRef.current = setTimeout(() => triggerEasterEgg(egg), 2000)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (spaceIntervalRef.current) clearInterval(spaceIntervalRef.current)
      if (spaceEggTimeoutRef.current) clearTimeout(spaceEggTimeoutRef.current)
      spaceSpinRef.current = 0
      setLightspeedIntensity(0)
    }
  }, [mode, triggerEasterEgg])

  const handleStart = useCallback(() => setMode('playing'), [])

  const handleExit = useCallback(() => {
    setShowUI(false)
    setIsFlat(false)
    setHoveredCountry(null)
    setSelectedCountry(null)
    setMode('landing')
  }, [])

  const handleCameraSettled = useCallback(() => {
    setShowUI(true)
  }, [])

  const handleCountryHover = useCallback((name: string | null, locked?: boolean, continent?: string) => {
    if (name && !locked && soundOnRef.current) {
      playNavHoverSound()
    }
    setHoveredCountry(name)
    setHoveredLocked(!!locked)
    setHoveredContinent(continent ?? null)
  }, [])

  const handleCountryClick = useCallback((name: string, locked: boolean, continent: string) => {
    if (!name) {
      setSelectedCountry(null)
      return
    }
    if (soundOn) playClickSound()
    setSelectedCountry(name)
    setSelectedLocked(locked)
    setSelectedContinent(continent)
    setActivePage('explore')
  }, [soundOn])

  const handleGlobeHover = useCallback((hovering: boolean) => {
    hoveringCanvasRef.current = hovering
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${e.clientX + 14}px`
      tooltipRef.current.style.top = `${e.clientY + 14}px`
    }
  }, [])

  const handleZoom = useCallback((direction: number) => {
    zoomRef.current += direction
  }, [])

  return (
    <main
      style={{ width: '100vw', height: '100vh', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}
      onMouseMove={handleMouseMove}
    >
      {/* ── Lightspeed effect (behind globe) ── */}
      {lightspeedIntensity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {/* Animated streaks */}
          {Array.from({ length: 60 }).map((_, i) => {
            const angle = (i / 60) * 360 + (i % 3) * 4
            const baseLen = 15 + (i % 5) * 8
            const length = baseLen + lightspeedIntensity * (50 + (i % 4) * 15)
            const thickness = 0.5 + lightspeedIntensity * (1.2 + (i % 3) * 0.5)
            const baseOpacity = lightspeedIntensity * (0.18 + (i % 7) * 0.06)
            const duration = 0.4 + (i % 5) * 0.2
            const delay = (i % 11) * 0.09
            const r = 180 + (i % 3) * 20
            const g = 200 + (i % 4) * 14
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${length}%`,
                  height: `${thickness}px`,
                  background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,${baseOpacity * 0.3}) 15%, rgba(${r},${g},255,${baseOpacity}) 45%, rgba(255,255,255,${baseOpacity * 0.6}) 75%, transparent 100%)`,
                  transformOrigin: '0% 50%',
                  transform: `rotate(${angle}deg)`,
                  animation: `lightstreakPulse ${duration}s ${delay}s ease-in-out infinite`,
                }}
              />
            )
          })}

          {/* Outer ring particles */}
          {Array.from({ length: 24 }).map((_, i) => {
            const angle = (i / 24) * 360 + 7.5
            const dist = 30 + lightspeedIntensity * 28
            const size = 1.5 + lightspeedIntensity * 2.5
            return (
              <div
                key={`p${i}`}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${size}px`,
                  height: `${size}px`,
                  borderRadius: '50%',
                  background: `rgba(220,235,255,${lightspeedIntensity * 0.7})`,
                  transformOrigin: '0% 50%',
                  transform: `rotate(${angle}deg) translateX(${dist}vw)`,
                  animation: `lightstreakDot ${0.5 + (i % 5) * 0.15}s ${(i % 8) * 0.1}s ease-in-out infinite`,
                }}
              />
            )
          })}

          {/* Center glow — pulsing */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: `${80 + lightspeedIntensity * 180}px`,
            height: `${80 + lightspeedIntensity * 180}px`,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(210,225,255,${lightspeedIntensity * 0.25}) 0%, rgba(180,205,255,${lightspeedIntensity * 0.12}) 40%, transparent 70%)`,
            animation: 'lightstreakGlow 1.5s ease-in-out infinite alternate',
          }} />

          {/* Vignette */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,${lightspeedIntensity * 0.55}) 100%)`,
            transition: 'all 0.2s',
          }} />
        </div>
      )}

      {/* ── Persistent 3D Canvas ── */}
      <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          transition: mode === 'landing'
            ? 'transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
            : 'transform 1.2s cubic-bezier(0.33, 0, 0.2, 1)',
          transform: mode === 'landing'
            ? 'translateX(calc((5rem + 500px) / 2))'
            : showUI && selectedCountry && !selectedLocked && MOCK_CLIPS[selectedCountry]
              ? 'translateY(26px)'
              : showUI && (activePage !== 'explore' || selectedCountry)
                ? 'translate(-160px, 26px)'
                : 'translateY(26px)',
          opacity: activePage === 'hotcold' ? 0 : 1,
          pointerEvents: activePage === 'hotcold' ? 'none' : 'auto',
        }}
      >
        <Canvas
          gl={{ alpha: true }}
          onPointerDown={(e) => { pointerDownPos.current = { x: e.clientX, y: e.clientY }; }}
          onPointerMissed={(e) => {
            if (!pointerDownPos.current) return;
            const dx = e.clientX - pointerDownPos.current.x;
            const dy = e.clientY - pointerDownPos.current.y;
            if (Math.sqrt(dx * dx + dy * dy) < 15) {
              setSelectedCountry(null);
            }
            pointerDownPos.current = null;
          }}
        >
          <SceneBackground transparent={lightspeedIntensity > 0} />
          <CameraRig mode={mode} onSettled={handleCameraSettled} />

          {/* Controls + Zoom only active when UI is shown */}
          {showUI && (
            <>
              <AdaptiveControls isFlat={isFlat} controlsRef={controlsRef} hoveringRef={hoveringCanvasRef} autoRotateEnabled={autoRotateEnabled && !selectedCountry} spaceSpinRef={spaceSpinRef} />
              <ZoomHandler zoomRef={zoomRef} controlsRef={controlsRef} />
            </>
          )}

          <ambientLight intensity={1.5} />
          <directionalLight position={[5, 5, 5]} intensity={2} />
          <directionalLight position={[-5, -3, -5]} intensity={0.5} color="#ffffff" />
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

          <GlobeModel onCountryHover={handleCountryHover} onCountryClick={handleCountryClick} onGlobeHover={handleGlobeHover} isFlat={isFlat} showLocked={showLocked} showLines={showLines} autoRotate={mode === 'landing'} selectedCountry={selectedCountry} />
        </Canvas>
      </div>

      {/* ── Hot or Cold game (replaces globe) ── */}
      <AnimatePresence>
        {showUI && activePage === 'hotcold' && (
          <motion.div
            key="hotcold-game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ position: 'absolute', top: 0, left: 0, right: '320px', bottom: 0, zIndex: 5, pointerEvents: 'auto' }}
          >
            <HotColdGame />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Landing overlay ── */}
      <AnimatePresence>
        {mode === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            style={{ position: 'absolute', inset: 0, zIndex: 10 }}
          >
            <LandingPage onStart={handleStart} soundOn={soundOn} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Playing UI overlay ── */}
      <AnimatePresence>
        {showUI && (
          <motion.div
            key="playing-ui"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}
          >
            <div style={{ pointerEvents: 'auto' }}>
              <GameMenu
                activePage={activePage}
                onPageChange={(page: MenuPage) => { setSelectedCountry(null); setActivePage(page); }}
                onExit={handleExit}
                showLocked={showLocked}
                showLines={showLines}
                onToggleLocked={() => setShowLocked(v => !v)}
                onToggleLines={() => setShowLines(v => !v)}
                soundOn={soundOn}
                onToggleSound={() => setSoundOn(v => !v)}
              />
            </div>

            {/* Hover tooltip */}
            <div
              ref={tooltipRef}
              style={{
                position: 'fixed', zIndex: 300, pointerEvents: 'none',
                opacity: hoveredCountry ? 1 : 0,
                transition: 'opacity 0.15s ease',
                padding: '0.35rem 0.7rem',
                background: 'rgba(0,0,0,0.85)',
                border: '1px solid rgba(255,255,255,0.2)',
                backdropFilter: 'blur(8px)',
                fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                letterSpacing: '0.08em', color: '#ffffff', whiteSpace: 'nowrap',
              }}
            >
              {hoveredLocked && <span style={{ marginRight: '0.4rem', opacity: 0.6 }}>&#x1F512;</span>}
              {hoveredCountry?.toUpperCase()}
              {hoveredLocked && <span style={{ marginLeft: '0.5rem', opacity: 0.4, fontSize: '0.5rem' }}>LOCKED</span>}
            </div>

            {/* Search */}
            {activePage !== 'hotcold' && <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              style={{
                position: 'absolute',
                top: 'calc(52px + 1.2rem)',
                left: selectedCountry && !selectedLocked && MOCK_CLIPS[selectedCountry] ? 'calc(320px + 1.5rem)' : '1.5rem',
                zIndex: 200,
                pointerEvents: 'auto',
                transition: 'left 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              }}
            >
              <AnimatePresence mode="wait">
                {!searchOpen ? (
                  <motion.button
                    key="search-btn"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    onClick={() => { if (soundOn) playClickSound(); setSearchOpen(true); }}
                    onMouseEnter={() => soundOn && playNavHoverSound()}
                    style={{
                      ...btnBase,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.45rem 0.8rem',
                    }}
                    whileHover={{ borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.1)' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    SEARCH
                  </motion.button>
                ) : (
                  <motion.div
                    key="search-panel"
                    initial={{ opacity: 0, width: 160 }}
                    animate={{ opacity: 1, width: 260 }}
                    exit={{ opacity: 0, width: 160, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.2 }}
                    style={{ position: 'relative' }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: 'rgba(0,0,0,0.85)',
                      border: '1px solid rgba(255,255,255,0.25)',
                      backdropFilter: 'blur(12px)',
                      padding: '0.4rem 0.7rem',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
                          if (e.key === 'Enter' && searchResults.length > 0) handleSearchSelect(searchResults[0]);
                        }}
                        placeholder="Search country..."
                        style={{
                          flex: 1,
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          color: '#fff',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.6rem',
                          letterSpacing: '0.08em',
                        }}
                      />
                      <button
                        onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                        style={{
                          background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                          cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                          padding: 0,
                        }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Results dropdown */}
                    {searchResults.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        background: 'rgba(0,0,0,0.92)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        backdropFilter: 'blur(12px)',
                        maxHeight: '280px',
                        overflowY: 'auto',
                      }}>
                        {searchResults.map((country) => (
                          <div
                            key={country.name}
                            onClick={() => handleSearchSelect(country)}
                            onMouseEnter={() => soundOn && playNavHoverSound()}
                            style={{
                              padding: '0.55rem 0.7rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              transition: 'background 0.1s',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {country.locked && <span style={{ fontSize: '0.5rem', opacity: 0.5 }}>&#x1F512;</span>}
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#fff', letterSpacing: '0.06em' }}>
                                {country.name}
                              </span>
                            </div>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.45rem', opacity: 0.3, letterSpacing: '0.08em' }}>
                              {CONTINENT_LABELS[country.continent] || country.continent.toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {searchQuery.trim() && searchResults.length === 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        background: 'rgba(0,0,0,0.92)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        backdropFilter: 'blur(12px)',
                        padding: '0.7rem',
                      }}>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', opacity: 0.4, textAlign: 'center' }}>
                          No countries found
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>}

            {/* Bottom-left controls */}
            {activePage !== 'hotcold' && <div style={{
              position: 'absolute', bottom: '1.5rem',
              left: selectedCountry && !selectedLocked && MOCK_CLIPS[selectedCountry] ? 'calc(320px + 1.5rem)' : '1.5rem',
              zIndex: 100,
              display: 'flex', flexDirection: 'column', gap: '0.5rem', pointerEvents: 'auto',
              transition: 'left 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}>
              <motion.button
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                onMouseEnter={() => soundOn && playNavHoverSound()}
                onClick={() => { if (soundOn) playClickSound(); setIsFlat(prev => !prev); }} style={{ ...btnBase, minWidth: '130px', textAlign: 'center' as const }}
                whileHover={{ borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.1)' }}
                whileTap={{ scale: 0.97 }}
              >
                {isFlat ? '[ GLOBE VIEW ]' : '[ MAP VIEW ]'}
              </motion.button>

              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
                style={{ display: 'flex', gap: '0.35rem' }}
              >
                <motion.button
                  onMouseEnter={() => soundOn && playNavHoverSound()}
                  onClick={() => { if (soundOn) playClickSound(); handleZoom(-1.5); }}
                  style={{ ...btnBase, flex: 1, fontSize: '0.75rem', padding: '0.4rem' }}
                  whileHover={{ borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.1)' }}
                  whileTap={{ scale: 0.95 }}
                >+</motion.button>
                <motion.button
                  onMouseEnter={() => soundOn && playNavHoverSound()}
                  onClick={() => { if (soundOn) playClickSound(); handleZoom(1.5); }}
                  style={{ ...btnBase, flex: 1, fontSize: '0.75rem', padding: '0.4rem' }}
                  whileHover={{ borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.1)' }}
                  whileTap={{ scale: 0.95 }}
                >-</motion.button>
              </motion.div>


            </div>}

            {/* Bottom-right toggles */}
            {activePage !== 'hotcold' && <div style={{
              position: 'absolute', bottom: '1.5rem',
              right: (activePage !== 'explore' || selectedCountry) ? 'calc(320px + 1.5rem)' : '1.5rem',
              zIndex: 100,
              display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end', pointerEvents: 'auto',
              transition: 'right 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}>
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
                style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.08em', color: '#fff', opacity: 0.5 }}>SHOW LOCKED COUNTRIES</span>
                <GameToggle value={showLocked} onChange={() => { if (soundOn) playClickSound(); setShowLocked(v => !v); }} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
                style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.08em', color: '#fff', opacity: 0.5 }}>SHOW ROUTES</span>
                <GameToggle value={showLines} onChange={() => { if (soundOn) playClickSound(); setShowLines(v => !v); }} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0 }}
                style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.08em', color: '#fff', opacity: 0.5 }}>AUTO ROTATE</span>
                <GameToggle value={autoRotateEnabled} onChange={() => { if (soundOn) playClickSound(); setAutoRotateEnabled(v => !v); }} />
              </motion.div>
            </div>}

            {/* Crosshair */}
            <div style={{
              position: 'absolute', top: `calc(${NAV_HEIGHT}px + 50%)`, left: '50%',
              transform: 'translate(-50%, -50%)', width: '28px', height: '28px',
              pointerEvents: 'none', opacity: activePage === 'hotcold' ? 0 : 0.18, zIndex: 50,
              transition: 'opacity 0.3s',
            }}>
              <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: '1px', background: '#fff' }} />
              <div style={{ position: 'absolute', left: '50%', top: 0, width: '1px', height: '100%', background: '#fff' }} />
            </div>

            {/* Country info panel */}
            <AnimatePresence>
              {hoveredCountry && (
                <motion.div
                  key={hoveredCountry}
                  initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 10, opacity: 0 }} transition={{ duration: 0.2 }}
                  style={{
                    position: 'absolute', top: `calc(${NAV_HEIGHT}px + 1.5rem)`,
                    right: (activePage !== 'explore' || selectedCountry) ? 'calc(320px + 1.5rem)' : '1.5rem',
                    transition: 'right 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    zIndex: 100,
                    padding: '1.25rem 1.5rem', border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(12px)',
                    pointerEvents: 'none', minWidth: '220px',
                  }}
                >
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', marginBottom: '0.4rem', opacity: 0.35, letterSpacing: '0.12em' }}>
                    {hoveredContinent ? CONTINENT_LABELS[hoveredContinent] || hoveredContinent.toUpperCase() : 'UNKNOWN REGION'}
                  </p>
                  <h3 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)', marginBottom: '0.6rem', letterSpacing: '0.06em', color: '#ffffff' }}>
                    {hoveredCountry.toUpperCase()}
                  </h3>
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.15)', marginBottom: '0.6rem' }} />
                  {hoveredLocked ? (
                    <p style={{ fontSize: '0.65rem', opacity: 0.55, fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
                      STATUS: LOCKED<br />
                      CLEARANCE REQUIRED
                    </p>
                  ) : (
                    <p style={{ fontSize: '0.65rem', opacity: 0.55, fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
                      LAST VISIT: {MOCK_COUNTRY_DATA[hoveredCountry]?.lastVisit ?? 'N/A'}<br />
                      PLACES VISITED: {MOCK_COUNTRY_DATA[hoveredCountry]?.places ?? 0}
                    </p>
                  )}
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', opacity: 0.25, marginTop: '0.6rem', letterSpacing: '0.08em' }}>
                    CLICK TO VIEW DETAILS
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Country detail side panel */}
            <AnimatePresence>
              {selectedCountry && (
                <motion.div
                  key={`detail-${selectedCountry}`}
                  initial={{ x: 320, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 320, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
                  style={{
                    position: 'absolute',
                    top: '52px',
                    right: 0,
                    bottom: 0,
                    width: '320px',
                    zIndex: 160,
                    background: 'rgba(0,0,0,0.92)',
                    backdropFilter: 'blur(20px)',
                    borderLeft: '1px solid rgba(255,255,255,0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    pointerEvents: 'auto',
                  }}
                >
                  <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', opacity: 0.35, letterSpacing: '0.12em' }}>
                      {selectedContinent ? CONTINENT_LABELS[selectedContinent] || selectedContinent.toUpperCase() : ''}
                    </span>
                    <motion.button
                      whileHover={{ opacity: 1 }}
                      onMouseEnter={() => soundOn && playNavHoverSound()}
                      onClick={() => { if (soundOn) playClickSound(); setSelectedCountry(null); }}
                      style={{
                        background: 'none',
                        border: '1px solid rgba(255,255,255,0.2)',
                        cursor: 'pointer',
                        color: '#fff',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.55rem',
                        opacity: 0.5,
                        padding: '3px 8px',
                      }}
                    >
                      ✕ CLOSE
                    </motion.button>
                  </div>

                  <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', letterSpacing: '0.06em', color: '#fff', marginBottom: '0.6rem' }}>
                    {selectedCountry.toUpperCase()}
                  </h2>

                  {MOCK_COUNTRY_DATA[selectedCountry]?.description && (
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#fff', opacity: 0.45, lineHeight: 1.7, marginBottom: '1rem' }}>
                      {MOCK_COUNTRY_DATA[selectedCountry].description}
                    </p>
                  )}

                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.15)', marginBottom: '1.2rem' }} />

                  {selectedLocked ? (
                    <div>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', opacity: 0.5, lineHeight: 1.8, marginBottom: '1.5rem' }}>
                        This destination is currently locked.<br />
                        It will be available soon.
                      </p>
                      <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '1.2rem', marginBottom: '1rem' }}>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', opacity: 0.35, letterSpacing: '0.12em', marginBottom: '0.8rem', textAlign: 'center' }}>UNLOCKS IN</p>
                        {UNLOCK_DATES[selectedCountry!] ? (
                          <CountdownTimer targetDate={UNLOCK_DATES[selectedCountry!]} />
                        ) : (
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', opacity: 0.4, textAlign: 'center' }}>Coming soon</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1.5rem' }}>
                        <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '0.85rem' }}>
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', opacity: 0.35, letterSpacing: '0.1em', marginBottom: '0.3rem' }}>LAST VISIT</p>
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#fff' }}>
                            {MOCK_COUNTRY_DATA[selectedCountry]?.lastVisit ?? 'N/A'}
                          </p>
                        </div>
                        <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '0.85rem' }}>
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', opacity: 0.35, letterSpacing: '0.1em', marginBottom: '0.3rem' }}>PLACES VISITED</p>
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#fff' }}>
                            {MOCK_COUNTRY_DATA[selectedCountry]?.places ?? 0}
                          </p>
                        </div>
                      </div>

                      {/* Highlights */}
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', opacity: 0.35, letterSpacing: '0.12em', marginBottom: '0.8rem' }}>SPEED'S HIGHLIGHTS</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
                        {['Fan meetup at landmark', 'Street food challenge', 'Local adventure vlog'].map((item, i) => (
                          <motion.div
                            key={i}
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: 0.1 + i * 0.08 }}
                            style={{ border: '1px solid rgba(255,255,255,0.08)', padding: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}
                          >
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', opacity: 0.3 }}>0{i + 1}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#fff', opacity: 0.7 }}>{item}</span>
                          </motion.div>
                        ))}
                      </div>

                      {/* Rating */}
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', opacity: 0.35, letterSpacing: '0.12em', marginBottom: '0.5rem' }}>SPEED'S RATING</p>
                      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '1.5rem' }}>
                        {[1, 2, 3, 4, 5].map(s => (
                          <div key={s} style={{
                            width: '20px', height: '4px',
                            background: s <= (MOCK_COUNTRY_DATA[selectedCountry]?.places ?? 0) % 5 + 1 ? '#ffffff' : 'rgba(255,255,255,0.1)',
                          }} />
                        ))}
                      </div>

                      {/* Book what Speed did */}
                      <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', marginBottom: '1.2rem' }} />
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', opacity: 0.35, letterSpacing: '0.12em', marginBottom: '0.8rem' }}>BOOK WHAT SPEED DID</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginBottom: '1.5rem' }}>
                        {(!MOCK_BOOKINGS[selectedCountry!] || MOCK_BOOKINGS[selectedCountry!].length === 0) && (
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', opacity: 0.4 }}>No bookings available yet.</p>
                        )}
                        {(MOCK_BOOKINGS[selectedCountry!] ?? []).map((booking, i) => (
                          <motion.div
                            key={i}
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: 0.12 + i * 0.08 }}
                            style={{
                              border: '1px solid rgba(255,255,255,0.1)',
                              padding: '0.85rem',
                              cursor: 'pointer',
                              transition: 'border-color 0.15s, background 0.15s',
                            }}
                            whileHover={{ borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.04)', transition: { duration: 0 } }}
                            onMouseEnter={() => soundOn && playNavHoverSound()}
                          >
                            {/* Type badge + rating */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                              <span style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.45rem',
                                letterSpacing: '0.1em',
                                padding: '2px 6px',
                                border: '1px solid rgba(255,255,255,0.15)',
                                color: TYPE_COLORS[booking.type] ?? '#fff',
                              }}>
                                {booking.type.toUpperCase()}
                              </span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: '#fff', opacity: 0.6 }}>
                                {'★'.repeat(Math.round(booking.rating))} {booking.rating}
                              </span>
                            </div>

                            {/* Title */}
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#fff', marginBottom: '0.4rem', lineHeight: 1.4 }}>
                              {booking.title}
                            </p>

                            {/* Price */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', opacity: 0.4 }}>per person</span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#fff' }}>
                                {booking.pricePerPerson === 0 ? 'FREE' : `$${booking.pricePerPerson}`}
                              </span>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                    </div>
                  )}
                  </div>

                  {/* Fixed bottom CTA */}
                  {!selectedLocked && (
                    <motion.button
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      onMouseEnter={() => soundOn && playNavHoverSound()}
                      onClick={() => { if (soundOn) playClickSound(); }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      style={{
                        width: '100%',
                        flexShrink: 0,
                        padding: '1rem',
                        background: '#ffffff',
                        border: 'none',
                        color: '#000000',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.6rem',
                        letterSpacing: '0.14em',
                        cursor: 'pointer',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      BUILD THIS TRIP ON EXPEDIA
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginTop: '-1px' }}>
                        <path d="M1 9L9 1M9 1H3M9 1V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </motion.button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Left side panel — Speed's Clips ── */}
            <AnimatePresence>
              {selectedCountry && !selectedLocked && MOCK_CLIPS[selectedCountry] && (
                <motion.div
                  key={`clips-${selectedCountry}`}
                  initial={{ x: -320, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -320, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
                  style={{
                    position: 'absolute',
                    top: '52px',
                    left: 0,
                    bottom: 0,
                    width: '320px',
                    zIndex: 160,
                    background: 'rgba(0,0,0,0.92)',
                    backdropFilter: 'blur(20px)',
                    borderRight: '1px solid rgba(255,255,255,0.15)',
                    overflowY: 'auto',
                    padding: '1.5rem',
                    pointerEvents: 'auto',
                  }}
                >
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', opacity: 0.35, letterSpacing: '0.12em', marginBottom: '0.5rem' }}>
                    SPEED'S CLIPS
                  </p>
                  <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', letterSpacing: '0.06em', color: '#fff', marginBottom: '1.2rem' }}>
                    {selectedCountry.toUpperCase()}
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {MOCK_CLIPS[selectedCountry]!.map((clip, i) => (
                      <motion.div
                        key={i}
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.08 + i * 0.06 }}
                        style={{
                          cursor: 'pointer',
                          border: '1px solid rgba(255,255,255,0.08)',
                          overflow: 'hidden',
                          transition: 'border-color 0.15s, background 0.15s',
                        }}
                        whileHover={{ borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.04)', transition: { duration: 0 } }}
                        onMouseEnter={() => soundOn && playNavHoverSound()}
                        onClick={() => { if (soundOn) playClickSound(); setLightboxClip(clip); }}
                      >
                        {/* Thumbnail */}
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#1a1a1a', overflow: 'hidden' }}>
                          {/* Duration badge */}
                          <span style={{
                            position: 'absolute',
                            bottom: '6px',
                            right: '6px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.5rem',
                            background: 'rgba(0,0,0,0.8)',
                            color: '#fff',
                            padding: '2px 5px',
                            letterSpacing: '0.05em',
                          }}>
                            {clip.duration}
                          </span>
                          {/* Play icon */}
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: 0.6,
                          }}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: 'rgba(0,0,0,0.6)',
                              border: '1px solid rgba(255,255,255,0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <span style={{ fontSize: '0.7rem', color: '#fff', marginLeft: '2px' }}>▶</span>
                            </div>
                          </div>
                        </div>
                        {/* Info */}
                        <div style={{ padding: '0.7rem' }}>
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#fff', lineHeight: 1.4, marginBottom: '0.35rem' }}>
                            {clip.title}
                          </p>
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', opacity: 0.35 }}>
                            {clip.views} views
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── Clip Lightbox ── */}
      <AnimatePresence>
        {lightboxClip && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setLightboxClip(null)}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 500,
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '70vw',
                maxWidth: '900px',
                cursor: 'default',
              }}
            >
              {/* Video placeholder */}
              <div style={{
                width: '100%',
                aspectRatio: '16/9',
                background: '#1a1a1a',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.2rem',
                position: 'relative',
              }}>
                {/* Play icon */}
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <span style={{ fontSize: '1.4rem', color: '#fff', marginLeft: '4px', opacity: 0.6 }}>▶</span>
                </div>
                {/* Duration */}
                <span style={{
                  position: 'absolute',
                  bottom: '10px',
                  right: '12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6rem',
                  background: 'rgba(0,0,0,0.7)',
                  color: '#fff',
                  padding: '3px 8px',
                  letterSpacing: '0.05em',
                }}>
                  {lightboxClip.duration}
                </span>
              </div>

              {/* Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: '#fff', lineHeight: 1.4, marginBottom: '0.4rem' }}>
                    {lightboxClip.title}
                  </p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', opacity: 0.35 }}>
                    {lightboxClip.views} views
                  </p>
                </div>
                <button
                  onClick={() => setLightboxClip(null)}
                  onMouseEnter={() => soundOn && playNavHoverSound()}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.55rem',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    opacity: 0.5,
                    letterSpacing: '0.1em',
                    flexShrink: 0,
                    marginLeft: '1rem',
                  }}
                >
                  ✕ CLOSE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Shooting Stars ── */}
      {showUI && activePage !== 'hotcold' && !isFlat && shootingStars.map(star => (
        <div
          key={star.id}
          onClick={() => handleStarClick(star.id)}
          style={{
            position: 'absolute',
            top: `${star.top}%`,
            left: `${star.left}%`,
            width: '280px',
            height: '160px',
            zIndex: 80,
            cursor: 'pointer',
            pointerEvents: 'auto',
            transform: 'translate(-40px, -40px)',
          }}
        >
          {/* Star dot */}
          <div
            style={{
              position: 'absolute',
              top: '40px',
              left: '40px',
              width: '4px',
              height: '4px',
              background: '#fff',
              borderRadius: '50%',
              boxShadow: '0 0 8px 3px rgba(255,255,255,0.7), 0 0 16px 6px rgba(200,220,255,0.3), 0 0 24px 8px rgba(180,200,255,0.1)',
              transform: `rotate(${star.angle}deg)`,
              animation: `shootingStar 2s ease-out forwards`,
              pointerEvents: 'none',
            }}
          />
        </div>
      ))}

      {/* ── Easter Egg Achievement Modal ── */}
      {ReactDOM.createPortal(
        <AnimatePresence>
          {easterEggModal && (
            <motion.div
              key="easter-egg-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setEasterEggModal(null)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 700,
                background: 'rgba(0,0,0,0.85)',
                backdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ duration: 0.25 }}
                onClick={e => e.stopPropagation()}
                style={{
                  width: '420px',
                  background: 'rgba(10,10,10,0.95)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  padding: '2.5rem 2rem',
                  cursor: 'default',
                  textAlign: 'center',
                  position: 'relative',
                }}
              >
                {/* Close X */}
                <motion.button
                  onClick={() => { playClickSound(); setEasterEggModal(null); }}
                  onMouseEnter={() => playNavHoverSound()}
                  whileHover={{ opacity: 1 }}
                  style={{
                    position: 'absolute',
                    top: '0.8rem',
                    right: '0.8rem',
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    width: '30px',
                    height: '30px',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    opacity: 0.5,
                  }}
                >
                  ✕
                </motion.button>

                {/* Icon */}
                <div style={{ fontSize: '2.5rem', marginBottom: '1.2rem' }}>
                  {easterEggModal.icon}
                </div>

                <p style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6rem',
                  opacity: 0.35,
                  letterSpacing: '0.16em',
                  color: '#fff',
                  marginBottom: '0.6rem',
                }}>
                  EASTER EGG FOUND
                </p>

                <h3 style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.2rem',
                  letterSpacing: '0.06em',
                  color: '#fff',
                  marginBottom: '1rem',
                }}>
                  {easterEggModal.title}
                </h3>

                <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 2rem 1rem' }} />

                <p style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  opacity: 0.5,
                  lineHeight: 1.7,
                  color: '#fff',
                  marginBottom: '1.5rem',
                }}>
                  {easterEggModal.description}
                </p>

                <p style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.55rem',
                  opacity: 0.3,
                  letterSpacing: '0.1em',
                  color: '#fff',
                }}>
                  {easterEggsFound.size}/2 EASTER EGGS DISCOVERED
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </main>
  )
}

export default App
