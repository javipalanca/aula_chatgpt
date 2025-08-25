import React, { useEffect, useState, useRef } from 'react'

export default function ChallengeTimer() {
  const [challenge, setChallenge] = useState(null)
  const [remaining, setRemaining] = useState(0)
  const timerRef = useRef(null)

  useEffect(()=>{
    function onChallenge(e) {
      const detail = e.detail || {}
      const ch = detail.challenge
      if (!ch) return
      setChallenge(ch)
      const end = (ch.startedAt || Date.now()) + ((ch.duration || 60) * 1000)
      setRemaining(Math.max(0, Math.ceil((end - Date.now())/1000)))
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(()=>{
        const rem = Math.max(0, Math.ceil((end - Date.now())/1000))
        setRemaining(rem)
        if (rem <= 0) { clearInterval(timerRef.current); timerRef.current = null; setChallenge(null) }
      }, 500)
    }
    window.addEventListener('aula-challenge', onChallenge)
    return ()=> { window.removeEventListener('aula-challenge', onChallenge); if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  if (!challenge) return null

  return (
    <div className="fixed left-1/2 transform -translate-x-1/2 top-6 z-50">
      <div className="bg-blue-600 text-white px-4 py-2 rounded-xl shadow-lg">
        <div className="font-bold">{challenge.title}</div>
        <div className="text-sm">Tiempo restante: {remaining}s</div>
      </div>
    </div>
  )
}
