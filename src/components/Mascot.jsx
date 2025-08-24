import React from 'react'
import neutralRaw from '../assets/mascots/mascot-neutral.svg?raw'
import waveRaw from '../assets/mascots/mascot-wave.svg?raw'
import thinkRaw from '../assets/mascots/mascot-think.svg?raw'
import laptopRaw from '../assets/mascots/mascot-laptop.svg?raw'
import cheerRaw from '../assets/mascots/mascot-cheer.svg?raw'
import sleepRaw from '../assets/mascots/mascot-sleep.svg?raw'

const POSES = {
  neutral: neutralRaw,
  wave: waveRaw,
  think: thinkRaw,
  laptop: laptopRaw,
  cheer: cheerRaw,
  sleep: sleepRaw,
}

export default function Mascot ({ pose = 'neutral', animate = false, className = '', alt, triggerBounce = false }) {
  const svg = POSES[pose] || POSES.neutral
  // Add a container where the SVG is inlined so CSS variables apply correctly
  const wrapperClass = `mascot-svg ${pose === 'wave' && animate ? 'mascot-wave animate' : ''} ${triggerBounce ? 'bounce' : ''} ${className}`
  // small random offsets to avoid perfectly synchronized blinking/sparkle when multiple mascots exist
  // randomize offsets and durations so each mascot instance behaves slightly differently
  const blinkOffset = `${(Math.random() * 8).toFixed(2)}s` // up to 8s offset
  const sparkleOffset = `${(Math.random() * 10).toFixed(2)}s` // up to 10s offset
  // durations between 8s and 18s for blinking, 10s and 22s for sparkle
  const blinkDur = `${(8 + Math.random() * 10).toFixed(2)}s`
  const sparkleDur = `${(10 + Math.random() * 12).toFixed(2)}s`
  const style = { ['--blink-offset']: blinkOffset, ['--sparkle-offset']: sparkleOffset, ['--blink-duration']: blinkDur, ['--sparkle-duration']: sparkleDur }
  return (
    <div className={wrapperClass} aria-hidden={alt ? 'false' : 'true'} style={style} dangerouslySetInnerHTML={{ __html: svg }} />
  )
}

// Export list of poses for external use
export const POSE_LIST = Object.keys(POSES)

