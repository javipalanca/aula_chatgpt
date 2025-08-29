// Remote-only storage adapter — never uses localStorage.
// All persistence goes through a remote proxy (configured with VITE_STORAGE_API)
// which stores data in MongoDB. A small in-memory cache exists only for
// synchronous reads during the page lifetime.
const _RAW_API = import.meta.env.VITE_STORAGE_API || ''
// Allow users to set VITE_STORAGE_API without protocol (e.g. localhost:4000).
// If no scheme is present, assume http://. Also strip trailing slash.
const API_BASE = (_RAW_API && !/^https?:\/\//i.test(_RAW_API) ? `http://${_RAW_API}` : _RAW_API).replace(/\/$/, '')
export function getApiBase() { return API_BASE }
const USE_API = !!API_BASE

const SESSION_KEY = 'aula-session-id'

const MEM = { progress: {}, settings: {}, classes: {} }
// Track in-flight remote fetches to avoid spawning many concurrent requests
const IN_FLIGHT = { progress: {}, settings: {} }
// throttle for classes sync to avoid spamming the backend from many clients/components
let _lastClassesSync = 0
let _classesSyncPromise = null
const CLASSES_SYNC_MIN_MS = 5000 // minimum interval between remote /api/classes calls

function getSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `sess-${Date.now()}-${Math.floor(Math.random()*100000)}`
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch (e) {
    return `sess-${Date.now()}-${Math.floor(Math.random()*100000)}`
  }
}

export function saveProgress(state) {
  if (!USE_API) {
    console.warn('saveProgress: VITE_STORAGE_API is not configured — persistence disabled')
    return
  }
  try {
    const id = getSessionId()
  MEM.progress[id] = state;
    (async () => {
      try {
        await fetch(`${API_BASE}/api/progress/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: state }) })
      } catch (e) { console.warn('saveProgress remote failed', e) }
    })()
  } catch (e) { console.warn('saveProgress error', e) }
}

export function loadProgress() {
  try {
    const id = getSessionId()
    const cached = MEM.progress[id]
    if (USE_API) {
      // Only start a remote fetch if we don't have cached data and there's
      // no existing in-flight request for this id.
      if (!cached && !IN_FLIGHT.progress[id]) {
        IN_FLIGHT.progress[id] = (async () => {
          try {
            const r = await fetch(`${API_BASE}/api/progress/${encodeURIComponent(id)}`)
            if (r.ok) {
              const data = await r.json()
              if (data && data.data) {
                MEM.progress[id] = data.data
                try { window.dispatchEvent(new CustomEvent('aula-progress', { detail: data.data })) } catch (e) { console.warn('dispatch aula-progress failed', e) }
              }
            }
          } catch (e) { console.warn('loadProgress remote fetch failed', e) }
          finally { delete IN_FLIGHT.progress[id] }
        })()
      }
    } else {
      console.warn('loadProgress: VITE_STORAGE_API not configured — no persistence')
    }
    return cached || null
  } catch (e) { console.warn('loadProgress error', e); return null }
}

export function saveSettings(s) {
  if (!USE_API) {
    console.warn('saveSettings: VITE_STORAGE_API is not configured — persistence disabled')
  try { window.dispatchEvent(new CustomEvent('aula-chatgpt-settings', { detail: s })) } catch (e) { console.warn('dispatch settings event failed', e) }
    return
  }
  try {
    const id = getSessionId()
  MEM.settings[id] = s;
  try { window.dispatchEvent(new CustomEvent('aula-chatgpt-settings', { detail: s })) } catch (e) { console.warn('dispatch settings event failed', e) }
    (async () => {
      try {
        await fetch(`${API_BASE}/api/settings/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: s }) })
      } catch (e) { console.warn('saveSettings remote failed', e) }
    })()
  } catch (e) { console.warn('saveSettings error', e) }
}

export function loadSettings() {
  try {
    const id = getSessionId()
    const cached = MEM.settings[id]
    if (USE_API) {
      // Only fetch once per id while request is in-flight; this prevents
      // render loops from creating many simultaneous requests.
      if (!cached && !IN_FLIGHT.settings[id]) {
        IN_FLIGHT.settings[id] = (async () => {
          try {
            const r = await fetch(`${API_BASE}/api/settings/${encodeURIComponent(id)}`)
            if (r.ok) {
              const data = await r.json()
              if (data && data.data) {
                MEM.settings[id] = data.data
                try { window.dispatchEvent(new CustomEvent('aula-chatgpt-settings', { detail: data.data })) } catch (e) { console.warn('dispatch settings event failed', e) }
              }
            }
          } catch (e) { console.warn('loadSettings remote fetch failed', e) }
          finally { delete IN_FLIGHT.settings[id] }
        })()
      }
    } else {
      console.warn('loadSettings: VITE_STORAGE_API not configured — returning defaults')
    }
    return cached || { mascotVisible: true, mascotMuted: false }
  } catch (e) { console.warn('loadSettings error', e); return { mascotVisible: true, mascotMuted: false } }
}

// --- Classroom / Teacher mode (remote-only) ---

function genClassCode() {
  return Math.random().toString(36).substring(2,8).toUpperCase()
}

async function hashPassword(pwd) {
  try {
    if (!pwd) return null
    const enc = new TextEncoder().encode(pwd)
    const digest = await (crypto.subtle ? crypto.subtle.digest('SHA-256', enc) : Promise.reject(new Error('No crypto')))
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch (e) { return null }
}

export async function createClass({ name = 'Clase', teacherName = 'Profesor', meta = {}, password = null } = {}) {
  if (!USE_API) throw new Error('createClass requires VITE_STORAGE_API to be configured')
  const code = genClassCode()
  const passwordHash = password ? await hashPassword(password) : null
  const payload = { id: code, name, teacherName, code, meta, active: true, passwordHash }

  // Try once, if network error occurs retry one more time (simple resilience for flaky networks)
  let lastErr = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(`${API_BASE}/api/classes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok) {
        const body = await r.text().catch(()=>null)
        throw new Error(`Remote createClass failed: ${r.status} ${r.statusText} ${body || ''}`)
      }
      const resp = await r.json()
      const id = resp.id || code
      MEM.classes[id] = { id, code: id, name, teacherName, meta, active: true, passwordHash, participants: {}, challenges: [] }
      return MEM.classes[id]
    } catch (e) {
      lastErr = e
      // small backoff before retry
      if (attempt === 1) await new Promise(res => setTimeout(res, 250))
    }
  }
  throw new Error('createClass error: ' + String(lastErr))
}

export function listClasses() {
  if (!USE_API) { console.warn('listClasses: VITE_STORAGE_API not configured'); return [] }
  syncClassesRemote().catch(() => {})
  return Object.values(MEM.classes)
}

export async function syncClassesRemote() {
  if (!USE_API) throw new Error('syncClassesRemote requires VITE_STORAGE_API')
  const now = Date.now()
  // If a sync happened recently, return the existing promise or cached classes
  if (now - _lastClassesSync < CLASSES_SYNC_MIN_MS) {
    if (_classesSyncPromise) return _classesSyncPromise
    return MEM.classes
  }
  // If a sync is already inflight, reuse it
  if (_classesSyncPromise) return _classesSyncPromise
  _classesSyncPromise = (async () => {
    try {
      const r = await fetch(`${API_BASE}/api/classes`)
      if (!r.ok) throw new Error('Failed to fetch classes')
      const docs = await r.json()
      const out = {}
      for (const d of docs) {
        out[d.id] = { id: d.id, code: d.id, name: d.name, teacherName: d.teacherName, meta: d.meta, createdAt: d.created_at || d.createdAt || Date.now(), active: d.active, passwordHash: d.passwordHash, participants: {}, challenges: d.challenges || [] }
      }
      MEM.classes = out;
      try { window.dispatchEvent(new CustomEvent('aula-classes-updated', { detail: out })) } catch(e) { console.warn('dispatch aula-classes-updated failed', e) }
      _lastClassesSync = Date.now()
      return out
    } catch (e) {
      console.warn('syncClassesRemote failed', e)
      throw e
    } finally {
      // clear inflight promise after a short delay so subsequent rapid calls reuse cache
      setTimeout(() => { _classesSyncPromise = null }, 0)
    }
  })()
  return _classesSyncPromise
}

export async function deleteClass(code) {
  if (!USE_API) throw new Error('deleteClass requires VITE_STORAGE_API')
  try {
    const r = await fetch(`${API_BASE}/api/classes/${encodeURIComponent(code)}`, { method: 'DELETE' })
    if (!r.ok) throw new Error('Failed to delete class')
    await syncClassesRemote()
    return true
  } catch (e) { console.warn('deleteClass failed', e); throw e }
}

export async function setClassActive(code, active) {
  if (!USE_API) throw new Error('setClassActive requires VITE_STORAGE_API')
  try {
  const url = `${API_BASE}/api/classes/${encodeURIComponent(code)}`
  const r = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active }) })
    if (!r.ok) {
      const body = await r.text().catch(()=>null)
      throw new Error(`Failed to update class: ${r.status} ${r.statusText} ${body || ''}`)
    }
    await syncClassesRemote()
    return true
  } catch (e) {
    // Normalize network errors to a clearer message for the UI
    const msg = e && e.message ? e.message : String(e)
    console.warn('setClassActive failed', msg)
    throw new Error(`setClassActive failed contacting ${API_BASE}: ${msg}`)
  }
}

export function getClass(code) {
  const cached = MEM.classes[code]
  if (USE_API && !cached) syncClassesRemote().catch(()=>{})
  return cached || null
}

export async function setClassMeta(code, meta) {
  if (!USE_API) throw new Error('setClassMeta requires VITE_STORAGE_API')
  try {
    const url = `${API_BASE}/api/classes/${encodeURIComponent(code)}`
    const r = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ meta }) })
    if (!r.ok) {
      const body = await r.text().catch(()=>null)
      throw new Error(`Failed to update class meta: ${r.status} ${r.statusText} ${body || ''}`)
    }
    await syncClassesRemote()
    return true
  } catch (e) {
    console.warn('setClassMeta failed', e)
    throw e
  }
}

// Persist class meta and update local cache immediately to avoid UI inconsistencies.
// This helper performs the PATCH, updates MEM.classes locally with the new meta,
// dispatches the 'aula-classes-updated' event so UI listeners refresh, and then
// triggers a remote sync to reconcile state.
export async function persistClassMeta(code, meta) {
  if (!USE_API) throw new Error('persistClassMeta requires VITE_STORAGE_API')
  try {
    const url = `${API_BASE}/api/classes/${encodeURIComponent(code)}`
    const r = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ meta }) })
    if (!r.ok) {
      const body = await r.text().catch(()=>null)
      throw new Error(`Failed to persist class meta: ${r.status} ${r.statusText} ${body || ''}`)
    }
    // Update local cache optimistically so UI reacts immediately
    MEM.classes = MEM.classes || {}
    MEM.classes[code] = { ...(MEM.classes[code] || {}), id: code, code, meta, participants: MEM.classes[code] ? MEM.classes[code].participants : {}, challenges: MEM.classes[code] ? MEM.classes[code].challenges : [], name: MEM.classes[code] ? MEM.classes[code].name : undefined, teacherName: MEM.classes[code] ? MEM.classes[code].teacherName : undefined, active: MEM.classes[code] ? MEM.classes[code].active : true }
    try { window.dispatchEvent(new CustomEvent('aula-classes-updated', { detail: MEM.classes })) } catch(e) { console.warn('dispatch aula-classes-updated failed', e) }
    // Trigger remote sync to reconcile other clients (don't fail the flow if sync fails)
    try { await syncClassesRemote() } catch(e) { console.warn('syncClassesRemote failed after persistClassMeta', e) }
    return MEM.classes[code]
  } catch (e) {
    console.warn('persistClassMeta failed', e)
    throw e
  }
}

export async function joinClass(code, displayName, password = null) {
  if (!USE_API) throw new Error('joinClass requires VITE_STORAGE_API')
  const sid = getSessionId()
  const r = await fetch(`${API_BASE}/api/classes/${encodeURIComponent(code)}`)
  if (!r.ok) throw new Error('No existe esa clase')
  const doc = await r.json()
  if (!doc) throw new Error('No existe esa clase')
  // Prevent joining a class that was deactivated
  if (doc.active === false) throw new Error('No existe esa clase')
  if (doc.passwordHash) {
    const provided = await hashPassword(password || '')
    if (!provided || provided !== doc.passwordHash) throw new Error('Contraseña incorrecta')
  }
  const pid = `${code}:${sid}`
  const payload = { id: pid, classId: code, sessionId: sid, displayName: displayName || `Alumno-${sid.slice(0,5)}`, score: 0, progress: {}, lastSeen: Date.now(), connected: true }
  const res = await fetch(`${API_BASE}/api/participants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error('Failed to join class')
  try { await syncClassesRemote() } catch(e){ console.warn('syncClassesRemote failed after joinClass', e) }
  return payload
}

export async function listClassParticipants(code) {
  if (!USE_API) throw new Error('listClassParticipants requires VITE_STORAGE_API')
  const r = await fetch(`${API_BASE}/api/participants?classId=${encodeURIComponent(code)}`)
  if (!r.ok) throw new Error('Failed to list participants')
  const docs = await r.json()
  return docs.map(d => ({ sessionId: d.sessionId, displayName: d.displayName, score: d.score, progress: d.progress, lastSeen: d.lastSeen }))
}

export async function postParticipantUpdate(code, { sessionId = getSessionId(), scoreDelta = 0, progress = {} } = {}) {
  if (!USE_API) throw new Error('postParticipantUpdate requires VITE_STORAGE_API')
  const pid = `${code}:${sessionId}`
  // send scoreDelta so the server can increment accumulated score
  // Do not set a default displayName here to avoid overwriting an existing
  // participant displayName in the DB when only updating score/progress.
  const payload = { id: pid, classId: code, sessionId, scoreDelta: Number(scoreDelta) || 0, progress: progress || {}, lastSeen: Date.now() }
  const r = await fetch(`${API_BASE}/api/participants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  if (!r.ok) throw new Error('postParticipantUpdate failed')
  try { await syncClassesRemote() } catch(e){ console.warn('syncClassesRemote failed', e) }
  return payload
}

// Heartbeat: keep-alive pings to show student is still connected. Uses WS if available, falls back to participant POST.
let _heartbeatInterval = null
export function startHeartbeat(classId, intervalMs = 5000) {
  try {
    stopHeartbeat()
    const sendPing = async () => {
      try {
        const sid = getSessionId()
        if (typeof _ws !== 'undefined' && _ws && _ws.readyState === WebSocket.OPEN) {
          try { _ws.send(JSON.stringify({ type: 'ping', classId, sessionId: sid })) } catch(e) { console.warn('heartbeat ws send failed', e) }
        } else if (USE_API) {
          // fallback: update participant lastSeen via POST (no score change).
          // Omit displayName so we don't overwrite an existing custom name.
          try { await fetch(`${API_BASE}/api/participants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: `${classId}:${sid}`, classId, sessionId: sid, lastSeen: Date.now() }) }) } catch(e) { console.warn('heartbeat POST failed', e) }
        }
  } catch (e) { console.warn('heartbeat sendPing failed', e) }
    }
    // send immediately and then on interval
    sendPing().catch(()=>{})
    _heartbeatInterval = setInterval(()=>{ sendPing().catch(()=>{}) }, intervalMs)
  } catch (e) { console.warn('startHeartbeat failed', e) }
}

export function stopHeartbeat() {
  try {
    if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null }
  } catch (e) { /* ignore */ }
}

// Leave class: mark participant as disconnected (used on unload / back)
export async function leaveClass(code) {
  if (!USE_API) return
  try {
    const sid = getSessionId()
    const pid = `${code}:${sid}`
  // Do not include displayName when leaving; avoid overwriting an existing
  // displayName with the default alias during disconnect.
  const payload = { id: pid, classId: code, sessionId: sid, connected: false, lastSeen: Date.now() }
    await fetch(`${API_BASE}/api/participants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  } catch (e) { console.warn('leaveClass failed', e) }
  finally { try { stopHeartbeat() } catch(e){ console.warn('stopHeartbeat failed', e) } }
}

export async function createChallenge(code, { title = 'Reto', duration = 60, payload = {} } = {}) {
  if (!USE_API) throw new Error('createChallenge requires VITE_STORAGE_API')
  const ch = { id: `c-${Date.now()}`, title, duration, payload, startedAt: Date.now() }
  const cid = `${code}:${ch.id}`
  const r = await fetch(`${API_BASE}/api/challenges`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: cid, classId: code, ...ch }) })
  if (!r.ok) throw new Error('createChallenge failed')
  try { await syncClassesRemote() } catch(e){ console.warn('syncClassesRemote failed after createChallenge', e) }
  try { window.dispatchEvent(new CustomEvent('aula-challenge', { detail: { code, challenge: ch } })) } catch(e){ console.warn('dispatch aula-challenge failed', e) }
  return ch
}

export function resetClass(code) {
  if (!USE_API) throw new Error('resetClass requires VITE_STORAGE_API')
  ;(async () => {
    try {
      await fetch(`${API_BASE}/api/classes/${encodeURIComponent(code)}`, { method: 'DELETE' })
  try { await syncClassesRemote() } catch(e){ console.warn('syncClassesRemote failed in resetClass', e) }
    } catch (e) { console.warn('resetClass failed', e) }
  })()
}

export { getSessionId }

// --- Realtime (WebSocket) client helper ---
let _ws = null
export function initRealtime(baseUrl) {
  if (_ws) return _ws
  baseUrl = baseUrl || API_BASE || ''
  // Build ws url: prefer provided API_BASE, otherwise derive from window.location
  let wsUrl = ''
  if (baseUrl) {
    wsUrl = baseUrl.replace(/^http/, 'ws')
  } else if (typeof window !== 'undefined' && window.location) {
    const p = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    wsUrl = `${p}//${window.location.host}`
  }

  // ensure path ends with / for server upgrade handling
  if (wsUrl && !wsUrl.endsWith('/')) wsUrl = wsUrl + '/'

  let attempts = 0
    let triedFallback = false
  function connect() {
    attempts += 1
    try {
        _ws = new WebSocket(wsUrl)
    } catch (e) {
        console.warn('initRealtime: failed to create WebSocket for', wsUrl, e)
        _ws = null
    }
      // If initial connect failed and we haven't tried fallback, attempt explicit localhost
      if (!_ws && !triedFallback && !wsUrl.includes('localhost')) {
        triedFallback = true
        const fallback = 'ws://localhost:4000/'
        try {
          console.warn('initRealtime: attempting fallback websocket URL', fallback)
          _ws = new WebSocket(fallback)
        } catch (e) {
          console.warn('initRealtime: fallback websocket creation failed', e)
          _ws = null
        }
      }
    if (!_ws) return
    _ws.addEventListener('open', () => { attempts = 0; try { console.log('initRealtime: ws open', { url: wsUrl }) } catch(e){ console.warn('initRealtime open log failed', e) } })
    _ws.addEventListener('message', (m) => {
  try { console.log('initRealtime: ws raw recv', { raw: String(m.data).slice(0,200) }) } catch(e) { console.warn('initRealtime raw recv log failed', e) }
      try {
        const data = JSON.parse(m.data)
        try { console.log('initRealtime: ws parsed recv (full)', data) } catch(e) { console.warn('initRealtime parsed recv log failed', e) }
        // Ensure the dispatched detail is a plain JSON-safe object to avoid
        // accidental field loss when consumers read the event (e.g., Dates or
        // prototypes). This also makes client-side logging reliable for debug.
        let safeDetail = data
        try { safeDetail = JSON.parse(JSON.stringify(data)) } catch (e) { /* if stringify fails, fallback to original */ }
        window.dispatchEvent(new CustomEvent('aula-realtime', { detail: safeDetail }))
      } catch (e) { console.warn('initRealtime: failed to parse message', e) }
    })
    _ws.addEventListener('close', (ev) => {
  try { console.log('initRealtime: ws close', ev) } catch(e){ console.warn('initRealtime close log failed', e) }
      _ws = null
      // reconnect with backoff
      const backoff = Math.min(30000, 500 + Math.random()*1000 * attempts)
      setTimeout(connect, backoff)
    })
  _ws.addEventListener('error', (ev) => { try { console.log('initRealtime: ws error', ev) } catch(e){ console.warn('initRealtime error log failed', e) } console.warn('initRealtime websocket error', ev) })
  }
  try { connect() } catch (e) { console.warn('initRealtime initial connect failed', e) }
  return _ws
}

  // Subscribe client to a specific classId over the active websocket.
  export function subscribeToClass(classId, { role = 'student', displayName = null } = {}) {
      try {
        // ensure websocket exists
        if (!_ws) initRealtime()
  const payloadObj = { type: 'subscribe', classId, sessionId: getSessionId(), role, displayName }
  try { console.log('subscribeToClass: preparing subscribe payload', payloadObj) } catch(e) { console.warn('subscribeToClass log failed', e) }
    const payload = JSON.stringify(payloadObj)
        // if open, send immediately
        if (_ws && _ws.readyState === WebSocket.OPEN) {
          try {
            _ws.send(payload)
                console.log('subscribeToClass: sent subscribe immediately', payloadObj)
          } catch (e) {
            console.warn('subscribeToClass send immediate failed', e)
          }
          return true
        }
        // otherwise attempt to send when socket opens, with periodic retries for up to 10s
        let attempts = 0
        const maxAttempts = 20 // 20 * 500ms = 10s
        const sendIfOpen = () => {
          attempts += 1
            try {
              if (_ws && _ws.readyState === WebSocket.OPEN) {
                try {
                  _ws.send(payload)
                  console.log('subscribeToClass: sent subscribe on retry', payloadObj)
                } catch (e) {
                  console.warn('subscribeToClass send failed in retry', e)
                }
                clearInterval(interval)
                try { _ws.removeEventListener('open', onOpen) } catch(e) { console.warn('removeEventListener failed', e) }
              }
            } catch (e) {
              console.warn('subscribeToClass periodic send failed', e)
            }
          if (attempts >= maxAttempts) {
            clearInterval(interval)
            try { _ws && _ws.removeEventListener('open', onOpen) } catch(e) { console.warn('removeEventListener failed at maxAttempts', e) }
          }
        }
        const onOpen = () => { sendIfOpen() }
        try { _ws && _ws.addEventListener('open', onOpen) } catch (e) { /* ignore */ }
        const interval = setInterval(sendIfOpen, 500)
        // final cleanup after 11s
  setTimeout(()=>{ try { clearInterval(interval); _ws && _ws.removeEventListener('open', onOpen) } catch(e){ console.warn('subscribeToClass cleanup failed', e) } }, 11000)
        return true
      } catch (e) { console.warn('subscribeToClass failed', e); return false }
  }

export async function createQuestion(code, { id = `q-${Date.now()}`, title = 'Pregunta', options = [], duration, payload = {} } = {}) {
  if (!USE_API) throw new Error('createQuestion requires VITE_STORAGE_API')
  const q = { id, title, options, duration, payload, created_at: Date.now(), classId: code }
  const r = await fetch(`${API_BASE}/api/challenges`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) })
  if (!r.ok) {
    const txt = await r.text().catch(()=>null)
    throw new Error('createQuestion failed: ' + (txt || (r.status + ' ' + r.statusText)))
  }
  return q
}

export function unsubscribeFromClass(classId) {
  try {
    if (!_ws) return false
    const payload = JSON.stringify({ type: 'unsubscribe', classId, sessionId: getSessionId() })
    try { _ws.send(payload); return true } catch(e) { console.warn('unsubscribeFromClass send failed', e); return false }
  } catch (e) { console.warn('unsubscribeFromClass failed', e); return false }
}

export async function submitAnswer(classId, sessionId, questionId, answer) {
  if (!USE_API) throw new Error('submitAnswer requires VITE_STORAGE_API')
  const payload = { classId, sessionId, questionId, answer }
  const r = await fetch(`${API_BASE}/api/answers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  if (!r.ok) throw new Error('submitAnswer failed')
  return payload
}

// Submit an answer along with an evaluator result (score/feedback). Prefer WebSocket so the
// server can broadcast `answer-evaluated` to teachers immediately; fallback to HTTP POST.
export async function submitEvaluatedAnswer(classId, sessionId, questionId, answer, evaluation = {}) {
  if (!USE_API) throw new Error('submitEvaluatedAnswer requires VITE_STORAGE_API')
  const payload = { type: 'answer', classId, sessionId, questionId, answer, evaluation }
  // Try websocket first for low-latency broadcast
  try {
    if (typeof _ws !== 'undefined' && _ws && _ws.readyState === WebSocket.OPEN) {
      try {
        _ws.send(JSON.stringify(payload))
        return payload
      } catch (e) {
        console.warn('submitEvaluatedAnswer ws send failed, falling back to HTTP', e)
      }
    }
  } catch (e) { console.warn('submitEvaluatedAnswer ws check failed', e) }

  // HTTP fallback: send evaluation as part of the answer payload
  try {
    const httpPayload = { classId, sessionId, questionId, answer, evaluation }
    const r = await fetch(`${API_BASE}/api/answers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(httpPayload) })
    if (!r.ok) {
      const txt = await r.text().catch(()=>null)
      throw new Error('submitEvaluatedAnswer failed: ' + (txt || r.status))
    }
    return httpPayload
  } catch (e) {
    console.warn('submitEvaluatedAnswer HTTP fallback failed', e)
    throw e
  }
}

export async function revealQuestion(classId, questionId, correctAnswer, points = 100) {
  if (!USE_API) throw new Error('revealQuestion requires VITE_STORAGE_API')
  // Prefer to send reveal via WebSocket so students receive immediate instruction
  try {
    if (typeof _ws !== 'undefined' && _ws && _ws.readyState === WebSocket.OPEN) {
      try {
        _ws.send(JSON.stringify({ type: 'reveal', classId, questionId, correctAnswer, points }))
        // Wait briefly for the server to broadcast the question-results event. If it arrives,
        // resolve with the real payload. Otherwise fallback to HTTP POST to ensure the reveal
        // is processed by the server and students receive the event.
        return await new Promise((resolve, reject) => {
          let settled = false
          const onRealtime = (e) => {
            const d = e.detail || {}
            if (d && d.type === 'question-results' && d.classId === classId && d.questionId === questionId) {
              settled = true
              window.removeEventListener('aula-realtime', onRealtime)
              resolve(d)
            }
          }
          window.addEventListener('aula-realtime', onRealtime)
          setTimeout(async () => {
            if (settled) return
            window.removeEventListener('aula-realtime', onRealtime)
            // fallback to HTTP
            try {
              const r = await fetch(`${API_BASE}/api/questions/${encodeURIComponent(questionId)}/reveal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ classId, correctAnswer, points }) })
              if (!r.ok) {
                const txt = await r.text().catch(()=>null)
                reject(new Error('revealQuestion failed: ' + (txt || r.status)))
              } else {
                const json = await r.json()
                resolve(json)
              }
            } catch (e) { reject(e) }
          }, 3000)
        })
      } catch(e) { console.warn('revealQuestion ws send failed', e) }
    }
  } catch (e) { console.warn('revealQuestion ws check failed', e) }

  const r = await fetch(`${API_BASE}/api/questions/${encodeURIComponent(questionId)}/reveal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ classId, correctAnswer, points }) })
  if (!r.ok) {
    const txt = await r.text().catch(()=>null)
    throw new Error('revealQuestion failed: ' + (txt||r.status))
  }
  return await r.json()
}

export async function stopQuestion(classId, questionId) {
  if (!USE_API) throw new Error('stopQuestion requires VITE_STORAGE_API');
  // Prefer to send stop via WebSocket so students receive immediate instruction
  try {
    if (typeof _ws !== 'undefined' && _ws && _ws.readyState === WebSocket.OPEN) {
      try {
        _ws.send(JSON.stringify({ type: 'stop', classId, questionId }));
        // optimistic: return success and let server broadcast results
        return { ok: true, via: 'ws' };
      } catch (e) {
        console.warn('stopQuestion ws send failed', e);
      }
    }
  } catch (e) {
    console.warn('stopQuestion ws check failed', e);
  }

  // Fallback to REST API if websocket is not available
  const r = await fetch(`${API_BASE}/api/questions/${encodeURIComponent(questionId)}/stop`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ classId }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => null);
    throw new Error('stopQuestion failed: ' + (txt || r.status));
  }
  return await r.json();
}

