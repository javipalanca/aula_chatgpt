import React, { useEffect, useState } from 'react'
import Mascot from './Mascot'
import { saveSettings, loadSettings } from '../lib/storage'

// Simple bus for messages to the mascot
const listeners = []
// pending messages emitted before any listener registers (or while none active)
const pendingMessages = []

export function mascotSpeak ({ text = '', mood = 'neutral', duration = 4000 } = {}) {
  try {
    // debug: report call and listener count
    try { console.debug('[mascotSpeak] text=', text, 'mood=', mood, 'duration=', duration, 'listeners=', listeners.length) } catch (e) {}
    const msg = { text, mood, duration }
    // store in pending so late listeners can receive it
    pendingMessages.push({ ...msg, ts: Date.now() })
    // deliver to current listeners
    listeners.forEach((fn) => fn(msg))
    // schedule cleanup of this pending message after its duration + 1s
    if (duration && duration > 0) {
      setTimeout(() => {
        // clear from pendingMessages
        const idx = pendingMessages.findIndex(m => m.text === text && m.ts)
        if (idx !== -1) pendingMessages.splice(idx, 1)
        listeners.forEach((fn) => fn({ text: '', mood: 'neutral', duration: 0 }))
      }, duration + 1000)
    }
  } catch (e) {
    // ignore if no listeners
  }
}

export function setMascotSettings (s) {
  try { saveSettings(s) } catch (e) {}
  // notify other parts of the app in the same tab
  try { window.dispatchEvent(new CustomEvent('aula-chatgpt-settings', { detail: s })) } catch (e) {}
  listeners.forEach((fn) => fn({ text: '', mood: 'neutral' }))
}

export default function MascotGuide () {
  const initial = loadSettings()
  const [settings, setSettings] = useState(initial)
  const [state, setState] = useState({ text: '', mood: 'neutral', visible: false })
  const [pose, setPose] = useState('neutral')
  const [animatePose, setAnimatePose] = useState(false)
   const [bounce, setBounce] = useState(false)

  useEffect(() => {
    const fn = ({ text = '', mood = 'neutral', duration = 4000 } = {}) => {
      if (!settings.mascotVisible || settings.mascotMuted) return
      setState({ text, mood, visible: !!text })
      // set a pose depending on mood
      const nextPose = mood === 'happy' || mood === 'cheer' ? 'cheer' : mood === 'sad' ? 'sleep' : mood === 'think' ? 'think' : 'neutral'
      setPose(nextPose)
      setAnimatePose(mood === 'happy' || mood === 'cheer')
      if (duration && duration > 0) {
        setTimeout(() => { setPose('neutral'); setAnimatePose(false) }, duration)
      }
    }
    listeners.push(fn)
    // flush recent pending messages to this new listener
    try {
      const now = Date.now()
      for (const m of pendingMessages.slice()) {
        // only replay recent messages (last 10s)
        if (now - (m.ts || 0) < 10000) fn({ text: m.text, mood: m.mood, duration: m.duration })
      }
    } catch (e) {}
    return () => {
      const i = listeners.indexOf(fn)
      if (i !== -1) listeners.splice(i, 1)
    }
  }, [settings])

  // Listen for immediate settings updates in the same tab
  useEffect(() => {
    const onAppSettings = (e) => {
      try {
        const s = e.detail
        if (s) setSettings(s)
      } catch {}
    }
    window.addEventListener('aula-chatgpt-settings', onAppSettings)
    return () => window.removeEventListener('aula-chatgpt-settings', onAppSettings)
  }, [])

    // Listen for short bounce trigger events
    useEffect(() => {
      const onBounce = () => {
        setBounce(true)
        setTimeout(() => setBounce(false), 700)
      }
      window.addEventListener('mascot-bounce', onBounce)
      return () => window.removeEventListener('mascot-bounce', onBounce)
    }, [])
  useEffect(() => {
    // persist settings when they change
    saveSettings(settings)
  }, [settings])

  // Listen to storage events so sidebar toggles (which update localStorage) sync the guide
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'aula-chatgpt-settings-v1') {
        try {
          const s = JSON.parse(e.newValue)
          if (s) setSettings(s)
        } catch {}
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const { text, mood, visible } = state
  const moodEmoji = mood === 'happy' ? '🙂' : mood === 'sad' ? '😟' : mood === 'cheer' ? '🎉' : '💬'

  // respects reduced motion
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div aria-hidden={!settings.mascotVisible}>
      <div className="fixed right-6 bottom-6 z-50 flex items-end gap-3 pointer-events-none">
        {/* Speech bubble */}
        <div className={`max-w-xs pointer-events-auto transition-opacity ${prefersReduced ? '' : 'transition-transform duration-300'} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      <div className="bg-white/95 backdrop-blur border border-[color:var(--mascot-accent)] rounded-2xl p-3 shadow-lg text-sm text-slate-800">
            <div className="flex items-start gap-2">
              <div className="text-lg leading-none">{moodEmoji}</div>
              <div className="flex-1">
                <div className="font-medium">Guía</div>
        <div className="mt-1 text-slate-700">{text}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Mascot (pointer events enabled only on the image) */}
        <div className="pointer-events-auto">
          <Mascot pose={pose} animate={animatePose && !prefersReduced} triggerBounce={bounce} alt="Mascota guía" />
        </div>
      </div>

  {/* Note: controls moved to the sidebar; floating controls removed to avoid covering the mascot */}

    </div>
  )
}
