import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { playNavHoverSound, playClickSound } from '../utils/sounds';

/* ─── Game-style toggle switch ───────────────────────────── */
export function GameToggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onChange}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* OFF label */}
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.55rem',
        letterSpacing: '0.08em',
        color: '#ffffff',
        opacity: value ? 0.25 : 0.9,
        transition: 'opacity 0.2s',
      }}>
        OFF
      </span>

      {/* Track */}
      <div style={{
        position: 'relative',
        width: '38px',
        height: '18px',
        background: value ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)'}`,
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        {/* Thumb */}
        <motion.div
          animate={{ x: value ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{
            position: 'absolute',
            top: '1px',
            left: '1px',
            width: '14px',
            height: '14px',
            background: value ? '#ffffff' : 'rgba(255,255,255,0.4)',
            transition: 'background 0.2s',
          }}
        />
      </div>

      {/* ON label */}
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.55rem',
        letterSpacing: '0.08em',
        color: '#ffffff',
        opacity: value ? 0.9 : 0.25,
        transition: 'opacity 0.2s',
      }}>
        ON
      </span>
    </div>
  );
}

type MenuPage = 'explore' | 'missions' | 'hotcold' | 'settings';

interface NavItem {
  id: MenuPage;
  label: string;
  icon: string;
  keybind: string;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'explore',     label: 'EXPLORE',     icon: '◈', keybind: '01' },
  { id: 'missions',    label: 'MISSIONS',    icon: '⬡', keybind: '02', badge: '3' },
  { id: 'hotcold',     label: 'HOT OR COLD', icon: '◉', keybind: '03' },
  { id: 'settings',    label: 'SETTINGS',    icon: '⊕', keybind: '04' },
];

const MOCK_MISSIONS = [
  {
    id: 1,
    continent: 'NORTH AMERICA',
    title: 'Conquer the Americas',
    description: 'Visit every unlocked destination in North America.',
    explored: 4,
    total: 4,
    badgeIcon: '🦅',
    achievement: {
      name: 'Eagle Eye',
      description: 'You explored every unlocked destination in North America, from the streets of NYC to the coasts of Costa Rica.',
      completedDate: 'Feb 28, 2026',
    },
  },
  {
    id: 2,
    continent: 'SOUTH AMERICA',
    title: 'Southern Explorer',
    description: 'Explore every country across South America.',
    explored: 4,
    total: 6,
    badgeIcon: '🌿',
  },
  {
    id: 3,
    continent: 'EUROPE',
    title: 'European Grand Tour',
    description: 'Travel through the cities and landmarks of Europe.',
    explored: 5,
    total: 7,
    badgeIcon: '🏰',
  },
  {
    id: 4,
    continent: 'AFRICA',
    title: 'African Discovery',
    description: 'Discover the wildlife and cultures of Africa.',
    explored: 3,
    total: 9,
    badgeIcon: '🦁',
  },
  {
    id: 5,
    continent: 'ASIA & OCEANIA',
    title: 'Eastern Odyssey',
    description: 'Journey through Asia and Oceania\'s destinations.',
    explored: 4,
    total: 5,
    badgeIcon: '⛩',
  },
];

function HexBadge({ icon, earned }: { icon: string; earned: boolean }) {
  return (
    <div style={{ position: 'relative', width: '44px', height: '50px', flexShrink: 0 }}>
      <svg width="44" height="50" viewBox="0 0 44 50" style={{ position: 'absolute', top: 0, left: 0 }}>
        <polygon
          points="22,1 42,13 42,37 22,49 2,37 2,13"
          fill={earned ? 'rgba(255,255,255,0.08)' : 'transparent'}
          stroke={earned ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)'}
          strokeWidth="1"
        />
      </svg>
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1rem',
        opacity: earned ? 1 : 0.25,
        filter: earned ? 'none' : 'grayscale(1)',
      }}>
        {icon}
      </div>
    </div>
  );
}

let signatureCanvasRef: HTMLCanvasElement | null = null;

function SignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    signatureCanvasRef = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    return () => { signatureCanvasRef = null; };
  }, []);

  const getPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.MouseEvent) => {
    isDrawing.current = true;
    lastPos.current = getPos(e);
  };

  const onMove = (e: React.MouseEvent) => {
    if (!isDrawing.current || !lastPos.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };

  const onUp = () => {
    isDrawing.current = false;
    lastPos.current = null;
  };

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        style={{
          width: '100%',
          height: '80px',
          cursor: 'crosshair',
          display: 'block',
        }}
      />
      <div style={{
        position: 'absolute',
        bottom: '12px',
        left: '1.5rem',
        right: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        pointerEvents: 'none',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>✕</span>
        <div style={{
          flex: 1,
          borderBottom: '1px dashed rgba(255,255,255,0.2)',
        }} />
      </div>
    </div>
  );
}

function handleDownloadAchievement(mission: typeof MOCK_MISSIONS[0]) {
  const canvas = document.createElement('canvas');
  const w = 800;
  const h = 500;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, w, h);

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 20, w - 40, h - 40);

  // Badge icon (text fallback)
  ctx.font = '40px serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(mission.badgeIcon, w / 2, 90);

  // "ACHIEVEMENT UNLOCKED"
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.letterSpacing = '3px';
  ctx.fillText('ACHIEVEMENT UNLOCKED', w / 2, 125);

  // Achievement name
  ctx.font = 'bold 24px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(mission.achievement!.name, w / 2, 165);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.moveTo(200, 185);
  ctx.lineTo(600, 185);
  ctx.stroke();

  // Description
  ctx.font = '13px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(mission.achievement!.description, w / 2, 215);

  // Completed date
  ctx.font = '9px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('COMPLETED', w / 2 - 80, 260);
  ctx.font = '14px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(mission.achievement!.completedDate, w / 2 - 80, 280);

  // Achievements count
  ctx.font = '9px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('ACHIEVEMENTS', w / 2 + 80, 260);
  ctx.font = '14px monospace';
  ctx.fillStyle = '#ffffff';
  const completedCount = MOCK_MISSIONS.filter(m => m.explored >= m.total).length;
  ctx.fillText(`${completedCount}/${MOCK_MISSIONS.length}`, w / 2 + 80, 280);

  // Signature X + dotted line
  ctx.font = '14px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.textAlign = 'left';
  ctx.fillText('✕', 195, 405);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(215, 400);
  ctx.lineTo(600, 400);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = '9px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.textAlign = 'center';
  ctx.fillText('Sign your name above the dotted line', w / 2, 425);

  // Copy signature if exists
  if (signatureCanvasRef) {
    const sigW = 400;
    const sigH = 80;
    ctx.drawImage(signatureCanvasRef, (w - sigW) / 2, 320, sigW, sigH);
  }

  // Download
  const link = document.createElement('a');
  link.download = `achievement-${mission.achievement!.name.toLowerCase().replace(/\s+/g, '-')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}


const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  color: '#ffffff',
  letterSpacing: '0.05em',
};
const labelStyle: React.CSSProperties = {
  ...monoStyle,
  fontSize: '0.58rem',
  opacity: 0.4,
  letterSpacing: '0.14em',
};
const divider: React.CSSProperties = {
  height: '1px',
  background: 'rgba(255,255,255,0.1)',
  margin: '1rem 0',
};

/* ─── Panel contents ─────────────────────────────────────── */
function ExplorePanel() {
  return (
    <div>
      <p style={labelStyle}>ACTIVE MODE: EXPLORE</p>
      <p style={{ ...monoStyle, marginTop: '1rem', opacity: 0.7, fontSize: '0.78rem', lineHeight: 1.9 }}>
        Rotate the globe to survey<br />global regions.<br /><br />
        Click a country to scan<br />and identify it.
      </p>
    </div>
  );
}

function MissionsPanel() {
  const [achievementModal, setAchievementModal] = useState<typeof MOCK_MISSIONS[0] | null>(null)

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {MOCK_MISSIONS.map((m, idx) => {
          const pct = Math.round((m.explored / m.total) * 100)
          const isComplete = m.explored >= m.total
          return (
            <motion.div
              key={m.id}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.08 + idx * 0.06 }}
              style={{ border: `1px solid ${isComplete ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.13)'}`, padding: '1rem' }}
            >
              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
                <HexBadge icon={m.badgeIcon} earned={isComplete} />
                <div style={{ flex: 1 }}>
                  <p style={{ ...monoStyle, fontSize: '0.45rem', opacity: 0.35, letterSpacing: '0.14em', marginBottom: '0.4rem' }}>
                    {m.continent}
                  </p>
                  <p style={{ ...monoStyle, fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                    {m.title}
                  </p>
                  <p style={{ ...monoStyle, fontSize: '0.55rem', opacity: 0.4, lineHeight: 1.6 }}>
                    {m.description}
                  </p>
                </div>
              </div>

              <div style={{ marginTop: '0.8rem' }}>
                {/* Progress bar */}
                <div style={{ background: 'rgba(255,255,255,0.08)', height: '3px', borderRadius: '2px', marginBottom: '0.4rem' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, ease: 'easeOut', delay: 0.3 + idx * 0.1 }}
                    style={{ height: '100%', background: isComplete ? 'rgba(255,255,255,0.9)' : '#fff', borderRadius: '2px' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ ...monoStyle, fontSize: '0.55rem', opacity: 0.5 }}>
                    {m.explored}/{m.total} countries explored
                  </span>
                  <span style={{ ...monoStyle, fontSize: '0.5rem', opacity: isComplete ? 0.8 : 0.3, letterSpacing: '0.1em' }}>
                    {isComplete ? 'COMPLETE' : `${pct}%`}
                  </span>
                </div>

                {isComplete && m.achievement && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    onClick={() => { playClickSound(); setAchievementModal(m); }}
                    onMouseEnter={() => playNavHoverSound()}
                    style={{
                      width: '100%',
                      marginTop: '0.7rem',
                      padding: '0.5rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#fff',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.5rem',
                      letterSpacing: '0.14em',
                      cursor: 'pointer',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                    whileHover={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.4)' }}
                  >
                    VIEW ACHIEVEMENT
                  </motion.button>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Achievement Modal — rendered via portal to escape sidebar */}
      {ReactDOM.createPortal(
      <AnimatePresence>
        {achievementModal && achievementModal.achievement && (
          <motion.div
            key="achievement-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setAchievementModal(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 600,
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
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '460px',
                background: 'rgba(10,10,10,0.95)',
                border: '1px solid rgba(255,255,255,0.15)',
                padding: '2rem',
                cursor: 'default',
                textAlign: 'center',
                position: 'relative',
              }}
            >
              {/* Close X */}
              <motion.button
                onClick={() => { playClickSound(); setAchievementModal(null); }}
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

              {/* Large hex badge */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <div style={{ position: 'relative', width: '72px', height: '82px' }}>
                  <svg width="72" height="82" viewBox="0 0 72 82" style={{ position: 'absolute', top: 0, left: 0 }}>
                    <polygon
                      points="36,1 70,21 70,61 36,81 2,61 2,21"
                      fill="rgba(255,255,255,0.06)"
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth="1"
                    />
                  </svg>
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.8rem',
                  }}>
                    {achievementModal.badgeIcon}
                  </div>
                </div>
              </div>

              <p style={{ ...monoStyle, fontSize: '0.45rem', opacity: 0.35, letterSpacing: '0.16em', marginBottom: '0.5rem' }}>
                ACHIEVEMENT UNLOCKED
              </p>

              <h3 style={{ ...monoStyle, fontSize: '1.1rem', marginBottom: '0.8rem', letterSpacing: '0.06em' }}>
                {achievementModal.achievement.name}
              </h3>

              <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 2rem 1rem' }} />

              <p style={{ ...monoStyle, fontSize: '0.58rem', opacity: 0.45, lineHeight: 1.7, marginBottom: '1.2rem' }}>
                {achievementModal.achievement.description}
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '1.5rem' }}>
                <div>
                  <p style={{ ...monoStyle, fontSize: '0.42rem', opacity: 0.3, letterSpacing: '0.12em', marginBottom: '0.3rem' }}>COMPLETED</p>
                  <p style={{ ...monoStyle, fontSize: '0.7rem' }}>{achievementModal.achievement.completedDate}</p>
                </div>
                <div>
                  <p style={{ ...monoStyle, fontSize: '0.42rem', opacity: 0.3, letterSpacing: '0.12em', marginBottom: '0.3rem' }}>ACHIEVEMENTS</p>
                  <p style={{ ...monoStyle, fontSize: '0.7rem' }}>{MOCK_MISSIONS.filter(m => m.explored >= m.total).length}/{MOCK_MISSIONS.length}</p>
                </div>
              </div>

              {/* Signature pad */}
              <div style={{ marginBottom: '1.2rem' }}>
                <SignaturePad />
                <p style={{ ...monoStyle, fontSize: '0.55rem', opacity: 0.3, letterSpacing: '0.08em', marginTop: '0.4rem' }}>Sign your name above the dotted line</p>
              </div>

              {/* Download button */}
              <motion.button
                onClick={() => {
                  playClickSound();
                  handleDownloadAchievement(achievementModal);
                }}
                onMouseEnter={() => playNavHoverSound()}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.5rem',
                  letterSpacing: '0.14em',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                whileHover={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.4)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                DOWNLOAD ACHIEVEMENT
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}
    </div>
  );
}

/* ─── Hot or Cold Game ───────────────────────────────────── */

const COUNTRY_COORDS: Record<string, [number, number]> = {
  'Japan': [36.2, 138.3], 'Brazil': [-14.2, -51.9], 'France': [46.2, 2.2],
  'Australia': [-25.3, 133.8], 'Thailand': [15.9, 100.9], 'United States': [37.1, -95.7],
  'Germany': [51.2, 10.4], 'Mexico': [23.6, -102.6], 'Italy': [41.9, 12.5],
  'South Korea': [35.9, 127.8], 'United Kingdom': [55.4, -3.4], 'India': [20.6, 78.9],
  'Turkey': [38.9, 35.2], 'Spain': [40.5, -3.7], 'Egypt': [26.8, 30.8],
  'Peru': [-9.2, -75.0], 'South Africa': [-30.6, 22.9], 'Norway': [60.5, 8.5],
  'Argentina': [-38.4, -63.6], 'Greece': [39.1, 21.8], 'Morocco': [31.8, -7.1],
  'Colombia': [4.6, -74.3], 'Indonesia': [-0.8, 113.9], 'Portugal': [39.4, -8.2],
  'Kenya': [-0.02, 37.9], 'Costa Rica': [9.7, -83.8], 'Nigeria': [9.1, 8.7],
  'Iceland': [64.9, -19.0], 'Philippines': [12.9, 121.8], 'Vietnam': [14.1, 108.3],
  'Tanzania': [-6.4, 34.9], 'Ethiopia': [9.1, 40.5], 'Ghana': [7.9, -1.0],
  'Senegal': [14.5, -14.5], 'Madagascar': [-18.8, 46.9], 'Nepal': [28.4, 84.1],
  'New Zealand': [-40.9, 174.9], 'Cuba': [21.5, -77.8], 'Jamaica': [18.1, -77.3],
  'Saudi Arabia': [23.9, 45.1], 'China': [35.9, 104.2], 'Russia': [61.5, 105.3],
  'Canada': [56.1, -106.3],
};

const HOT_COLD_CLUES: { country: string; clue: string; type: 'text' | 'image' }[] = [
  { country: 'Japan', clue: 'Speed went viral racing through neon-lit streets where cherry blossoms meet bullet trains.', type: 'image' },
  { country: 'Brazil', clue: 'Speed danced samba at carnival and screamed "SEWEY" at the Christ the Redeemer statue.', type: 'text' },
  { country: 'France', clue: 'Speed tried escargot and almost passed out near a famous iron tower.', type: 'image' },
  { country: 'Australia', clue: 'Speed held a koala and surfed near a world-famous opera house.', type: 'text' },
  { country: 'Thailand', clue: 'Speed visited golden temples and ate the spiciest street food of his life.', type: 'image' },
  { country: 'Italy', clue: 'Speed threw a coin into a famous fountain and sprinted through ancient colosseum ruins.', type: 'text' },
  { country: 'South Korea', clue: 'Speed did a K-pop dance battle in a district famous for its nightlife and skincare shops.', type: 'image' },
  { country: 'United Kingdom', clue: 'Speed met the royal guards and streamed outside a clock tower that chimes every hour.', type: 'text' },
  { country: 'India', clue: 'Speed visited a white marble mausoleum and tried the spiciest curry challenge.', type: 'image' },
  { country: 'Turkey', clue: 'Speed flew in a hot air balloon over fairy chimneys and ate kebabs in a transcontinental city.', type: 'text' },
  { country: 'Egypt', clue: 'Speed rode a camel past ancient triangular monuments and sailed the longest river.', type: 'image' },
  { country: 'Mexico', clue: 'Speed explored ancient pyramids built by the Aztecs and ate tacos al pastor on the street.', type: 'text' },
  { country: 'Peru', clue: 'Speed hiked to a lost Incan city hidden high in the Andes mountains.', type: 'image' },
  { country: 'South Africa', clue: 'Speed did a safari and spotted the Big Five near the southern tip of a continent.', type: 'text' },
  { country: 'Norway', clue: 'Speed chased the Northern Lights and visited fjords in a Scandinavian kingdom.', type: 'image' },
  { country: 'Argentina', clue: 'Speed watched tango in Buenos Aires and visited the southernmost city in the world.', type: 'text' },
  { country: 'Greece', clue: 'Speed explored white-and-blue island villages and visited the birthplace of the Olympics.', type: 'image' },
  { country: 'Morocco', clue: 'Speed got lost in a massive labyrinth-like market in a North African kingdom.', type: 'text' },
  { country: 'Iceland', clue: 'Speed bathed in a geothermal lagoon on a volcanic island near the Arctic Circle.', type: 'image' },
  { country: 'Colombia', clue: 'Speed explored a colorful walled city on the Caribbean coast of South America.', type: 'text' },
  { country: 'Germany', clue: 'Speed visited a fairy-tale castle in Bavaria and drove full speed on a highway with no limits.', type: 'text' },
  { country: 'Spain', clue: 'Speed ran with the bulls and watched flamenco dancers in a passionate European nation.', type: 'image' },
  { country: 'Indonesia', clue: 'Speed surfed in Bali and visited ancient temples on the largest archipelago on Earth.', type: 'text' },
  { country: 'Kenya', clue: 'Speed witnessed the Great Migration and ran with Maasai warriors in East Africa.', type: 'image' },
  { country: 'New Zealand', clue: 'Speed bungee-jumped in a land where they filmed a famous trilogy about rings.', type: 'text' },
  { country: 'Philippines', clue: 'Speed island-hopped through turquoise lagoons in a Southeast Asian archipelago of 7,000+ islands.', type: 'image' },
  { country: 'Vietnam', clue: 'Speed cruised through emerald karst waters and slurped pho in a Southeast Asian country shaped like an S.', type: 'text' },
  { country: 'Nepal', clue: 'Speed trekked toward the world\'s highest peak in a Himalayan kingdom.', type: 'image' },
  { country: 'Cuba', clue: 'Speed rode in a colorful vintage car through the streets of a Caribbean island\'s capital.', type: 'text' },
  { country: 'Portugal', clue: 'Speed ate pastéis de nata and rode a yellow tram through hilly streets on the Iberian coast.', type: 'image' },
];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getTemperature(distKm: number): { label: string; color: string } {
  if (distKm < 500) return { label: 'BURNING', color: '#ff3b30' };
  if (distKm < 1500) return { label: 'HOT', color: '#ff9500' };
  if (distKm < 3500) return { label: 'WARM', color: '#ffcc00' };
  if (distKm < 7000) return { label: 'COLD', color: '#5ac8fa' };
  return { label: 'FREEZING', color: '#007aff' };
}

function getScore(temp: string, attempt: number): number {
  const tempScores: Record<string, number> = { 'BURNING': 100, 'HOT': 70, 'WARM': 40, 'COLD': 15, 'FREEZING': 5 };
  const attemptBonus = Math.max(0, (5 - attempt) * 10);
  return (tempScores[temp] ?? 0) + attemptBonus;
}

const MOCK_HOT_COLD_LEADERBOARD = {
  daily: [
    { rank: 1, name: 'FLAME_KING', score: 480, date: 'Today' },
    { rank: 2, name: 'GEO_MASTER', score: 445, date: 'Today' },
    { rank: 3, name: 'NAVIGATOR', score: 410, date: 'Today' },
    { rank: 4, name: 'ATLAS_PRO', score: 385, date: 'Today' },
    { rank: 5, name: 'Y0U', score: 0, date: 'Today', isPlayer: true },
  ],
  monthly: [
    { rank: 1, name: 'GEO_MASTER', score: 12840, date: 'March 2026' },
    { rank: 2, name: 'FLAME_KING', score: 11230, date: 'March 2026' },
    { rank: 3, name: 'WANDERLUST', score: 10100, date: 'March 2026' },
    { rank: 4, name: 'NAVIGATOR', score: 9870, date: 'March 2026' },
    { rank: 5, name: 'Y0U', score: 0, date: 'March 2026', isPlayer: true },
  ],
};

type HotColdGuess = { country: string; temp: string; color: string; distKm: number };

/* ─── Sidebar leaderboard for Hot or Cold ─── */
function HotColdPanel() {
  const [leaderboardView, setLeaderboardView] = useState<'daily' | 'monthly'>('daily');
  const lb = MOCK_HOT_COLD_LEADERBOARD[leaderboardView];

  return (
    <div>
      <p style={{ ...monoStyle, fontSize: '0.55rem', opacity: 0.4, lineHeight: 1.7, marginBottom: '1.2rem' }}>
        Guess the country from Speed's travel clue. 5 rounds, 5 guesses each. The closer your guess, the hotter the feedback.
      </p>

      <div style={divider} />

      <p style={{ ...labelStyle, marginBottom: '0.8rem' }}>LEADERBOARD</p>

      <div style={{ display: 'flex', gap: '0', marginBottom: '1rem' }}>
        {(['daily', 'monthly'] as const).map(v => (
          <button
            key={v}
            onClick={() => { playClickSound(); setLeaderboardView(v); }}
            onMouseEnter={() => playNavHoverSound()}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: leaderboardView === v ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              borderBottom: leaderboardView === v ? '2px solid #fff' : '2px solid transparent',
              color: '#fff',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.5rem',
              letterSpacing: '0.12em',
              cursor: 'pointer',
              opacity: leaderboardView === v ? 1 : 0.4,
            }}
          >
            {v.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {lb.map(entry => (
          <motion.div
            key={`${leaderboardView}-${entry.rank}`}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: entry.rank * 0.06 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.55rem 0.75rem',
              border: `1px solid ${entry.isPlayer ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.09)'}`,
              background: entry.isPlayer ? 'rgba(255,255,255,0.05)' : 'transparent',
            }}
          >
            <span style={{ ...monoStyle, opacity: 0.35, fontSize: '0.55rem', width: '18px' }}>#{entry.rank}</span>
            <span style={{ ...monoStyle, flex: 1, fontSize: '0.65rem' }}>{entry.name}</span>
            <span style={{ ...monoStyle, fontSize: '0.65rem' }}>{entry.score.toLocaleString()}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Full-screen Hot or Cold game (replaces globe) ─── */
const hcMonoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  color: '#ffffff',
  letterSpacing: '0.05em',
};

export function HotColdGame() {
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'finished'>('idle');
  const [round, setRound] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [guess, setGuess] = useState('');
  const [guesses, setGuesses] = useState<HotColdGuess[]>([]);
  const [roundScores, setRoundScores] = useState<number[]>([]);
  const [roundClues, setRoundClues] = useState<typeof HOT_COLD_CLUES>([]);
  const [roundSolved, setRoundSolved] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const startGame = () => {
    const shuffled = [...HOT_COLD_CLUES].sort(() => Math.random() - 0.5).slice(0, 5);
    setRoundClues(shuffled);
    setRound(0);
    setAttempt(0);
    setGuesses([]);
    setRoundScores([]);
    setRoundSolved(false);
    setGameState('playing');
    setGuess('');
  };

  const countryNames = Object.keys(COUNTRY_COORDS);

  const handleGuessChange = (val: string) => {
    setGuess(val);
    if (val.length >= 1) {
      setSuggestions(countryNames.filter(c => c.toLowerCase().startsWith(val.toLowerCase())).slice(0, 6));
    } else {
      setSuggestions([]);
    }
  };

  const submitGuess = (sel?: string) => {
    const g = sel || guess;
    if (!g.trim()) return;
    const coords = COUNTRY_COORDS[g];
    if (!coords) return;
    const currentClue = roundClues[round];
    const target = COUNTRY_COORDS[currentClue.country];
    if (!target) return;
    const dist = haversineKm(coords[0], coords[1], target[0], target[1]);
    const temp = getTemperature(dist);
    const isCorrect = g.toLowerCase() === currentClue.country.toLowerCase();
    const newGuess: HotColdGuess = { country: g, temp: isCorrect ? 'CORRECT' : temp.label, color: isCorrect ? '#30d158' : temp.color, distKm: Math.round(dist) };
    setGuesses(prev => [...prev, newGuess]);
    setGuess('');
    setSuggestions([]);
    if (isCorrect) {
      setRoundScores(prev => [...prev, getScore('BURNING', attempt) + 50]);
      setRoundSolved(true);
    } else if (attempt >= 4) {
      setRoundScores(prev => [...prev, getScore(temp.label, 4)]);
      setRoundSolved(true);
    } else {
      setAttempt(prev => prev + 1);
    }
  };

  const nextRound = () => {
    if (round >= 4) { setGameState('finished'); }
    else { setRound(prev => prev + 1); setAttempt(0); setGuesses([]); setRoundSolved(false); }
  };

  const totalScore = roundScores.reduce((a, b) => a + b, 0);

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      top: '52px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 5,
    }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ width: '600px', maxWidth: '90vw', padding: '2rem' }}
      >
        {/* ── Idle state ── */}
        {gameState === 'idle' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ ...hcMonoStyle, fontSize: '0.7rem', opacity: 0.3, letterSpacing: '0.16em', marginBottom: '1rem' }}>MINI GAME</p>
            <h2 style={{ ...hcMonoStyle, fontSize: '2.4rem', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>HOT OR COLD</h2>
            <p style={{ ...hcMonoStyle, fontSize: '0.9rem', opacity: 0.4, lineHeight: 1.8, marginBottom: '2.5rem' }}>
              Can you guess where Speed traveled?<br />5 clues. 5 guesses each. How hot can you get?
            </p>
            <motion.button
              onMouseEnter={() => playNavHoverSound()}
              onClick={() => { playClickSound(); startGame(); }}
              whileHover={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.5)' }}
              whileTap={{ scale: 0.97 }}
              style={{
                padding: '1rem 3rem',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.25)',
                color: '#fff',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                letterSpacing: '0.16em',
                cursor: 'pointer',
              }}
            >
              ▶ START GAME
            </motion.button>
          </div>
        )}

        {/* ── Playing state ── */}
        {gameState === 'playing' && roundClues[round] && (() => {
          const currentClue = roundClues[round];
          return (
            <div>
              {/* Round progress bar */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} style={{
                    flex: 1, height: '3px',
                    background: i < round ? '#fff' : i === round ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.1)',
                    transition: 'background 0.3s',
                  }} />
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                <p style={{ ...hcMonoStyle, fontSize: '0.75rem', opacity: 0.4, letterSpacing: '0.14em' }}>
                  ROUND {round + 1} / 5
                </p>
                <p style={{ ...hcMonoStyle, fontSize: '0.75rem', opacity: 0.4, letterSpacing: '0.1em' }}>
                  {5 - attempt} {attempt === 4 ? 'GUESS' : 'GUESSES'} LEFT
                </p>
              </div>

              {/* Clue card */}
              <motion.div
                key={round}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  border: '1px solid rgba(255,255,255,0.15)',
                  padding: currentClue.type === 'image' ? '0' : '1.5rem',
                  marginBottom: '1.5rem',
                  textAlign: 'center',
                  overflow: 'hidden',
                }}
              >
                {currentClue.type === 'image' ? (
                  <>
                    <div style={{
                      width: '100%',
                      aspectRatio: '16 / 9',
                      background: 'rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </div>
                    <p style={{ ...hcMonoStyle, fontSize: '0.65rem', opacity: 0.25, letterSpacing: '0.14em', padding: '0.8rem 1.5rem 0' }}>PHOTO CLUE</p>
                    <p style={{ ...hcMonoStyle, fontSize: '0.85rem', opacity: 0.5, lineHeight: 1.7, padding: '0.5rem 1.5rem 1rem' }}>
                      Where was this photo taken?
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ ...hcMonoStyle, fontSize: '0.65rem', opacity: 0.25, letterSpacing: '0.14em', marginBottom: '0.8rem' }}>CLUE</p>
                    <p style={{ ...hcMonoStyle, fontSize: '1rem', opacity: 0.85, lineHeight: 1.8 }}>
                      "{currentClue.clue}"
                    </p>
                  </>
                )}
              </motion.div>

              {/* Input */}
              {!roundSolved && (
                <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      ref={inputRef}
                      type="text"
                      value={guess}
                      onChange={e => handleGuessChange(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitGuess(); }}
                      placeholder="Type a country name..."
                      style={{
                        flex: 1,
                        padding: '0.8rem 1rem',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: '#fff',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.9rem',
                        letterSpacing: '0.05em',
                        outline: 'none',
                      }}
                    />
                    <motion.button
                      onClick={() => submitGuess()}
                      onMouseEnter={() => playNavHoverSound()}
                      whileHover={{ background: 'rgba(255,255,255,0.15)' }}
                      style={{
                        padding: '0 1.2rem',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: '#fff',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                      }}
                    >
                      →
                    </motion.button>
                  </div>

                  {suggestions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                      background: 'rgba(10,10,10,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderTop: 'none',
                    }}>
                      {suggestions.map(s => (
                        <div
                          key={s}
                          onClick={() => { playClickSound(); submitGuess(s); }}
                          onMouseEnter={() => playNavHoverSound()}
                          style={{
                            padding: '0.6rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
                            color: '#fff', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.06)',
                          }}
                          onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          {s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Guess history */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.2rem' }}>
                <AnimatePresence>
                  {guesses.map((g, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.6rem 1rem',
                        border: `1px solid ${g.color}33`, background: `${g.color}0a`,
                      }}
                    >
                      <span style={{ ...hcMonoStyle, fontSize: '0.85rem' }}>{g.country}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                        {g.temp !== 'CORRECT' && (
                          <span style={{ ...hcMonoStyle, fontSize: '0.7rem', opacity: 0.4 }}>{g.distKm.toLocaleString()} km</span>
                        )}
                        <span style={{ ...hcMonoStyle, fontSize: '0.75rem', letterSpacing: '0.1em', color: g.color, fontWeight: 600 }}>
                          {g.temp === 'CORRECT' ? '✓ CORRECT' : g.temp}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Round solved */}
              {roundSolved && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center' }}>
                  <p style={{ ...hcMonoStyle, fontSize: '0.75rem', opacity: 0.4, marginBottom: '1rem' }}>
                    +{roundScores[round]} points
                  </p>
                  <motion.button
                    onMouseEnter={() => playNavHoverSound()}
                    onClick={() => { playClickSound(); nextRound(); }}
                    whileHover={{ background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.5)' }}
                    style={{
                      padding: '0.8rem 2.5rem',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.25)',
                      color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
                      letterSpacing: '0.14em', cursor: 'pointer',
                    }}
                  >
                    {round >= 4 ? 'VIEW RESULTS' : 'NEXT ROUND →'}
                  </motion.button>
                </motion.div>
              )}

              {/* Skip + Running score */}
              <div style={{ marginTop: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {!roundSolved ? (
                  <motion.button
                    onMouseEnter={() => playNavHoverSound()}
                    onClick={() => {
                      playClickSound();
                      setRoundScores(prev => [...prev, 0]);
                      setRoundSolved(true);
                    }}
                    whileHover={{ borderColor: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)' }}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      letterSpacing: '0.12em',
                      cursor: 'pointer',
                      opacity: 0.5,
                      padding: '0.5rem 1.2rem',
                    }}
                  >
                    SKIP →
                  </motion.button>
                ) : <span />}
                <span style={{ ...hcMonoStyle, fontSize: '0.8rem', opacity: 0.3 }}>
                  SCORE: {totalScore}
                </span>
              </div>
            </div>
          );
        })()}

        {/* ── Finished state ── */}
        {gameState === 'finished' && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center' }}>
            <p style={{ ...hcMonoStyle, fontSize: '0.7rem', opacity: 0.3, letterSpacing: '0.16em', marginBottom: '0.8rem' }}>GAME OVER</p>
            <p style={{ ...hcMonoStyle, fontSize: '3rem', marginBottom: '0.3rem' }}>{totalScore}</p>
            <p style={{ ...hcMonoStyle, fontSize: '0.85rem', opacity: 0.4, marginBottom: '2rem' }}>TOTAL POINTS</p>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 2rem 1.5rem' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
              {roundScores.map((score, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ ...hcMonoStyle, fontSize: '0.75rem', opacity: 0.5 }}>ROUND {i + 1}</span>
                  <span style={{ ...hcMonoStyle, fontSize: '0.9rem' }}>{score} pts</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center' }}>
              <motion.button
                onMouseEnter={() => playNavHoverSound()}
                onClick={() => { playClickSound(); startGame(); }}
                whileHover={{ background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.5)' }}
                style={{
                  padding: '0.8rem 2rem', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.25)', color: '#fff',
                  fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.14em', cursor: 'pointer',
                }}
              >
                ▶ PLAY AGAIN
              </motion.button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}



function SettingsPanel({ showLocked, showLines, soundOn, onToggleLocked, onToggleLines, onToggleSound }: {
  showLocked: boolean;
  showLines: boolean;
  soundOn: boolean;
  onToggleLocked: () => void;
  onToggleLines: () => void;
  onToggleSound: () => void;
}) {
  return (
    <div>
      <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.85rem 0',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{ ...monoStyle, opacity: 0.7, fontSize: '0.7rem' }}>Locked destinations</span>
          <GameToggle value={showLocked} onChange={onToggleLocked} />
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.85rem 0',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{ ...monoStyle, opacity: 0.7, fontSize: '0.7rem' }}>Route lines</span>
          <GameToggle value={showLines} onChange={onToggleLines} />
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.85rem 0',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{ ...monoStyle, opacity: 0.7, fontSize: '0.7rem' }}>Sound</span>
          <GameToggle value={soundOn} onChange={onToggleSound} />
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────── */
interface GameMenuProps {
  activePage: MenuPage;
  onPageChange: (page: MenuPage) => void;
  onExit: () => void;
  showLocked: boolean;
  showLines: boolean;
  soundOn: boolean;
  onToggleLocked: () => void;
  onToggleLines: () => void;
  onToggleSound: () => void;
}

export const GameMenu = ({ activePage, onPageChange, onExit, showLocked, showLines, soundOn, onToggleLocked, onToggleLines, onToggleSound }: GameMenuProps) => {

  const handleNavHover = useCallback(() => {
    if (soundOn) playNavHoverSound();
  }, [soundOn]);

  const handleClick = useCallback(() => {
    if (soundOn) playClickSound();
  }, [soundOn]);

  const panelMap: Record<MenuPage, React.ReactNode> = {
    explore:     <ExplorePanel />,
    missions:    <MissionsPanel />,
    hotcold:     <HotColdPanel />,
    settings:    <SettingsPanel showLocked={showLocked} showLines={showLines} soundOn={soundOn} onToggleLocked={onToggleLocked} onToggleLines={onToggleLines} onToggleSound={onToggleSound} />,
  };

  return (
    <>
      {/* ── TOP NAV BAR ────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'stretch',
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        height: '52px',
      }}>
        {/* Back Button */}
        <motion.button
          whileHover={{ background: 'rgba(255,255,255,0.1)' }}
          onMouseEnter={handleNavHover}
          onClick={() => { handleClick(); onExit(); }}
          style={{
            padding: '0 1.25rem',
            display: 'flex',
            alignItems: 'center',
            background: 'transparent',
            border: 'none',
            borderRight: '1px solid rgba(255,255,255,0.1)',
            cursor: 'pointer',
            color: '#fff',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            letterSpacing: '0.1em',
            transition: 'all 0.2s',
          }}
        >
          ← BACK
        </motion.button>

        {/* Nav items */}
        <div style={{ display: 'flex', flex: 1 }}>
          {NAV_ITEMS.map((item, idx) => {
            const isActive = item.id === activePage;
            return (
              <motion.button
                key={item.id}
                onMouseEnter={handleNavHover}
                onClick={() => { handleClick(); onPageChange(item.id === activePage && item.id !== 'explore' ? 'explore' : item.id); }}
                whileHover={{ background: 'rgba(255,255,255,0.12)' }}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0 1.25rem',
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: 'none',
                  borderRight: idx < NAV_ITEMS.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  borderBottom: isActive ? '2px solid #ffffff' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                {/* Badge */}
                {item.badge && (
                  <span style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.48rem',
                    background: '#ffffff',
                    color: '#000000',
                    padding: '1px 4px',
                    letterSpacing: '0.04em',
                    lineHeight: 1.4,
                  }}>
                    {item.badge}
                  </span>
                )}

                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                  color: isActive ? '#ffffff' : 'rgba(255,255,255,0.35)',
                  transition: 'color 0.2s',
                }}>
                  {item.icon}
                </span>

                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.1em',
                  color: isActive ? '#ffffff' : 'rgba(255,255,255,0.4)',
                  transition: 'color 0.2s',
                }}>
                  {item.label}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Player info — right side of nav */}
        <div style={{
          padding: '0 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ ...monoStyle, fontSize: '0.65rem' }}>OPERATOR: Y0U</p>
            <p style={{ ...monoStyle, fontSize: '0.52rem', opacity: 0.4, marginTop: '2px' }}>
              RANK 05  ·  41,870 XP
            </p>
          </div>
          {/* XP bar */}
          <div style={{ width: '80px' }}>
            <div style={{ background: 'rgba(255,255,255,0.12)', height: '2px', borderRadius: '2px' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '68%' }}
                transition={{ delay: 0.6, duration: 1.2, ease: 'easeOut' }}
                style={{ height: '100%', background: '#fff' }}
              />
            </div>
            <p style={{ ...monoStyle, fontSize: '0.46rem', opacity: 0.3, marginTop: '3px' }}>
              6,870 / 10,000
            </p>
          </div>
        </div>
      </div>

      {/* ── RIGHT SIDE PANEL ───────────────────────────────── */}
      <AnimatePresence>
        {activePage !== 'explore' && (
          <motion.div
            key={activePage}
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              position: 'absolute',
              top: '52px',       // below the nav bar
              right: 0,
              bottom: 0,
              width: '320px',
              zIndex: 150,
              background: 'rgba(0,0,0,0.88)',
              backdropFilter: 'blur(20px)',
              borderLeft: '1px solid rgba(255,255,255,0.15)',
              overflowY: 'auto',
              padding: '1.5rem',
            }}
          >
            {/* Panel header */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ ...monoStyle, fontSize: '0.62rem', opacity: 0.35 }}>
                  {NAV_ITEMS.find(n => n.id === activePage)?.icon}{' '}
                  {NAV_ITEMS.find(n => n.id === activePage)?.label}
                </span>
                <motion.button
                  whileHover={{ opacity: 1 }}
                  onMouseEnter={handleNavHover}
                  onClick={() => { handleClick(); onPageChange('explore'); }}
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
              <div style={divider} />
            </div>

            {panelMap[activePage]}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
