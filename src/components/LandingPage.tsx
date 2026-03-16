import { motion } from 'framer-motion';
import { playNavHoverSound, playClickSound } from '../utils/sounds';

interface LandingPageProps {
  onStart: () => void;
  soundOn?: boolean;
}

export const LandingPage = ({ onStart, soundOn = true }: LandingPageProps) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingLeft: '5rem',
      position: 'relative',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{ textAlign: 'left', position: 'relative', zIndex: 1 }}
      >
        <motion.h1
          initial={{ letterSpacing: '0.5em', opacity: 0 }}
          animate={{ letterSpacing: '0.1em', opacity: 1 }}
          transition={{ duration: 1.2, ease: 'circOut' }}
          style={{ fontSize: '2.5rem', marginBottom: '1rem', color: '#fff', maxWidth: '500px', lineHeight: 1.2 }}
        >
          Find your adventure at the speed of Expedia
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.5, duration: 1 }}
          style={{
            fontFamily: 'var(--font-mono)',
            marginBottom: '3rem',
            fontSize: '0.9rem',
            color: '#fff',
            maxWidth: '400px',
          }}
        >
          Explore the world like never before. Discover destinations, plan your next adventure, and travel at full speed.
        </motion.p>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onMouseEnter={() => soundOn && playNavHoverSound()}
          onClick={() => { if (soundOn) playClickSound(); onStart(); }}
          style={{
            padding: '1.2rem 3.5rem',
            fontSize: '1rem',
            letterSpacing: '0.2em',
          }}
        >
          START NOW
        </motion.button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 1, duration: 2 }}
        style={{
          position: 'absolute',
          bottom: '2rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem',
          color: '#fff',
          zIndex: 1,
        }}
      >
        © 2026 Expedia Group & iShowSpeed. All rights reserved.
      </motion.div>
    </div>
  );
};
