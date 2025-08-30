/**
 * Remote storage adapter
 * ----------------------
 * This module provides a thin adapter over the remote storage API. It
 * centralizes all network I/O related to classes, participants, answers
 * and settings. It keeps a small in-memory cache for fast synchronous
 * reads during the page lifetime and exposes helpers used throughout the
 * teacher/student UI.
 *
 * The adapter prefers WebSocket for low-latency realtime actions and
 * falls back to REST endpoints when needed.
 */
// Remote-only storage adapter — never uses localStorage.
// All persistence goes through a remote proxy (configured with VITE_STORAGE_API)
// which stores data in MongoDB. A small in-memory cache exists only for
// synchronous reads during the page lifetime.
const _RAW_API = import.meta.env.VITE_STORAGE_API || ''
// Allow users to set VITE_STORAGE_API without protocol (e.g. localhost:4000).
// If no scheme is present, assume http://. Also strip trailing slash.
const API_BASE = (_RAW_API && !/^https?:\/\//i.test(_RAW_API) ? `http://${_RAW_API}` : _RAW_API).replace(/\/$/, '')
/**
 * Obtiene la URL base del API remoto configurado mediante VITE_STORAGE_API.
 * @returns {string} URL base (sin barra final) o cadena vacía si no está configurado
 */
export function getApiBase() { return API_BASE }

const SESSION_KEY = 'aula-session-id'

const MEM = { progress: {}, settings: {}, classes: {} }
// Track in-flight remote fetches to avoid spawning many concurrent requests
const IN_FLIGHT = { progress: {}, settings: {} }
// throttle for classes sync to avoid spamming the backend from many clients/components
let _lastClassesSync = 0
let _classesSyncPromise = null
const CLASSES_SYNC_MIN_MS = 5000 // minimum interval between remote /api/classes calls

/**
 * Devuelve un identificador de sesión único para el cliente. Se almacena en
 * sessionStorage para persistir durante la pestaña. Si sessionStorage no
 * está disponible, se genera un identificador temporal.
 *
 * @returns {string} sessionId
 */
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

/**
 * Persiste el progreso del alumno en el servidor.
 * Se utiliza el endpoint PUT /api/progress/:sessionId y se mantiene un
 * cache en memoria para lecturas inmediatas.
 *
 * @param {Object} state Estado de progreso a guardar
 * @returns {void}
 */
export function saveProgress(state) {
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

/**
 * Carga el progreso del usuario desde el servidor si NO existe en la cache
 * local. Esta función arranca una petición remota en background si procede
 * y devuelve el valor cacheado inmediatamente.
 *
 * @returns {Object|null} Estado de progreso o null
 */
export function loadProgress() {
  try {
    const id = getSessionId()
    const cached = MEM.progress[id]
    // Always attempt remote fetch when cache is empty
    if (!cached && !IN_FLIGHT.progress[id]) {
      // Only start a remote fetch if we don't have cached data and there's
      // no existing in-flight request for this id.
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
    return cached || null
  } catch (e) { console.warn('loadProgress error', e); return null }
}

/**
 * Guarda ajustes del usuario y despacha un evento local para que la UI
 * se sincronice inmediatamente.
 *
 * @param {Object} s Settings a persistir
 * @returns {void}
 */
export function saveSettings(s) {
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

/**
 * Carga los ajustes del usuario desde el servidor si no están cacheados.
 * Devuelve siempre un objeto con valores por defecto cuando no hay API.
 *
 * @returns {{mascotVisible:boolean,mascotMuted:boolean}|Object}
 */
export function loadSettings() {
  try {
    const id = getSessionId()
    const cached = MEM.settings[id]
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

/**
 * Crea una nueva clase en el backend y mantiene una copia optimista en la
 * memoria local.
 *
 * @param {Object} options
 * @param {string} options.name Nombre de la clase
 * @param {string} options.teacherName Nombre del profesor
 * @param {Object} options.meta Metadata inicial de la clase
 * @param {?string} options.password Contraseña opcional de la clase
 * @returns {Promise<Object>} Objeto de clase creado en cache local
 */
export async function createClass({ name = 'Clase', teacherName = 'Profesor', meta = {}, password = null } = {}) {
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

/**
 * Lista las clases cacheadas. Inicia una sincronización remota en background
 * para mantener la cache actualizada.
 *
 * @returns {Array<Object>} Array de clases
 */
export function listClasses() {
  syncClassesRemote().catch(() => {})
  return Object.values(MEM.classes)
}

/**
 * Sincroniza la lista de clases desde el backend y actualiza la cache local.
 * Implementa throttling para evitar llamadas frecuentes desde múltiples
 * componentes.
 *
 * @returns {Promise<Object>} Mapa de clases
 */
export async function syncClassesRemote() {
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

/**
 * Elimina una clase en el servidor y refresca la cache local.
 *
 * @param {string} code Código de la clase
 * @returns {Promise<boolean>} true si se eliminó correctamente
 */
export async function deleteClass(code) {
  try {
    const r = await fetch(`${API_BASE}/api/classes/${encodeURIComponent(code)}`, { method: 'DELETE' })
    if (!r.ok) throw new Error('Failed to delete class')
    await syncClassesRemote()
    return true
  } catch (e) { console.warn('deleteClass failed', e); throw e }
}

/**
 * Marca una clase como activa/inactiva en el servidor y sincroniza la cache.
 *
 * @param {string} code Código de la clase
 * @param {boolean} active Estado deseado
 * @returns {Promise<boolean>}
 */
export async function setClassActive(code, active) {
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

/**
 * Retorna la clase cacheada por código. Si no existe, inicia una
 * sincronización remota para recuperar la información.
 *
 * @param {string} code Código de la clase
 * @returns {Object|null}
 */
export function getClass(code) {
  const cached = MEM.classes[code]
  if (!cached) syncClassesRemote().catch(()=>{})
  return cached || null
}

/**
 * Actualiza metadata de una clase en el servidor.
 *
 * @param {string} code Código de la clase
 * @param {Object} meta Metadata a persistir
 * @returns {Promise<boolean>}
 */
export async function setClassMeta(code, meta) {
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
/**
 * Persiste metadata de la clase y actualiza la cache local de forma
 * optimista. Despacha un evento 'aula-classes-updated' para que listeners
 * actualicen su estado.
 *
 * @param {string} code Código de la clase
 * @param {Object} meta Metadata a persistir
 * @returns {Promise<Object>} Clase actualizada en cache
 */
export async function persistClassMeta(code, meta) {
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

/**
 * Intenta unir al usuario a una clase. Verifica existencia, estado y
 * contraseña si procede, y crea un participante en el servidor.
 *
 * @param {string} code Código de la clase
 * @param {string} displayName Nombre a mostrar
 * @param {?string} password Contraseña si la clase está protegida
 * @returns {Promise<Object>} Payload del participante creado
 */
export async function joinClass(code, displayName, password = null) {
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

/**
 * Lista participantes de una clase desde el servidor.
 *
 * @param {string} code Código de la clase
 * @returns {Promise<Array<Object>>} Array de participantes
 */
export async function listClassParticipants(code) {
  const r = await fetch(`${API_BASE}/api/participants?classId=${encodeURIComponent(code)}`)
  if (!r.ok) throw new Error('Failed to list participants')
  const docs = await r.json()
  return docs.map(d => ({ sessionId: d.sessionId, displayName: d.displayName, score: d.score, progress: d.progress, lastSeen: d.lastSeen }))
}

/**
 * Recupera los IDs de preguntas contestadas para una clase.
 * Devuelve un Set con los questionId recogidos del endpoint `/api/answers`.
 * @param {string} classId
 * @returns {Promise<Set<string>>}
 */
export async function listAnsweredQuestionIds(classId) {
  if (!classId) return new Set()
  try {
    const r = await fetch(`${API_BASE}/api/answers?classId=${encodeURIComponent(classId)}`)
    if (!r.ok) throw new Error('Failed to list answers')
    const docs = await r.json()
    const ids = new Set((docs || []).filter(d => d && d.questionId).map(d => d.questionId))
    return ids
  } catch (e) {
    console.warn('listAnsweredQuestionIds failed', e)
    throw e
  }
}

export async function postParticipantUpdate(code, { sessionId = getSessionId(), scoreDelta = 0, progress = {} } = {}) {
  /**
   * Actualiza un participante (score/progress) mediante POST al endpoint de
   * participantes. Devuelve el payload enviado.
   *
   * @param {string} code Código de la clase
   * @param {Object} options
   * @param {string} [options.sessionId]
   * @param {number} [options.scoreDelta]
   * @param {Object} [options.progress]
   * @returns {Promise<Object>} Payload enviado
   */
  if (!API_BASE) throw new Error('postParticipantUpdate requires VITE_STORAGE_API')
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
/**
 * Inicia el latido (heartbeat) periódico del participante para mantenerlo
 * marcado como conectado.
 *
 * @param {string} classId Código de la clase
 * @param {number} [intervalMs=5000] Intervalo entre pings
 * @returns {void}
 */
export function startHeartbeat(classId, intervalMs = 5000) {
  try {
    stopHeartbeat()
    const sendPing = async () => {
      try {
        const sid = getSessionId()
        if (typeof _ws !== 'undefined' && _ws && _ws.readyState === WebSocket.OPEN) {
          try { _ws.send(JSON.stringify({ type: 'ping', classId, sessionId: sid })) } catch(e) { console.warn('heartbeat ws send failed', e) }
        } else {
          /* HTTP fallback commented out: prefer WebSocket for heartbeat.
          // fallback: update participant lastSeen via POST (no score change).
          // Omit displayName so we don't overwrite an existing custom name.
          try { await fetch(`${API_BASE}/api/participants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: `${classId}:${sid}`, classId, sessionId: sid, lastSeen: Date.now() }) }) } catch(e) { console.warn('heartbeat POST failed', e) }
          */
        }
  } catch (e) { console.warn('heartbeat sendPing failed', e) }
    }
    // send immediately and then on interval
    sendPing().catch(()=>{})
    _heartbeatInterval = setInterval(()=>{ sendPing().catch(()=>{}) }, intervalMs)
  } catch (e) { console.warn('startHeartbeat failed', e) }
}

/**
 * Detiene el heartbeat iniciado por `startHeartbeat`.
 * @returns {void}
 */
export function stopHeartbeat() {
  try {
    if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null }
  } catch (e) { /* ignore */ }
}

// Leave class: mark participant as disconnected (used on unload / back)
/**
 * Marca al participante como desconectado en el servidor (used on unload/back)
 *
 * @param {string} code Código de la clase
 * @returns {Promise<void>}
 */
export async function leaveClass(code) {
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
  if (!API_BASE) throw new Error('createChallenge requires VITE_STORAGE_API')
  const ch = { id: `c-${Date.now()}`, title, duration, payload, startedAt: Date.now() }
  const cid = `${code}:${ch.id}`
  const r = await fetch(`${API_BASE}/api/challenges`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: cid, classId: code, ...ch }) })
  if (!r.ok) throw new Error('createChallenge failed')
  try { await syncClassesRemote() } catch(e){ console.warn('syncClassesRemote failed after createChallenge', e) }
  try { window.dispatchEvent(new CustomEvent('aula-challenge', { detail: { code, challenge: ch } })) } catch(e){ console.warn('dispatch aula-challenge failed', e) }
  return ch
}
/**
 * Reinicia una clase en el backend (borrado remoto). Llama a syncClassesRemote
 * posteriormente. Esta función ejecuta la petición de forma asíncrona y no
 * devuelve una promesa (comportamiento intentional para usos de compatibilidad).
 *
 * @param {string} code Código de la clase
 * @returns {void}
 */
export function resetClass(code) {
  if (!API_BASE) throw new Error('resetClass requires VITE_STORAGE_API')
  ;(async () => {
    try {
      await fetch(`${API_BASE}/api/classes/${encodeURIComponent(code)}`, { method: 'DELETE' })
  try { await syncClassesRemote() } catch(e){ console.warn('syncClassesRemote failed in resetClass', e) }
    } catch (e) { console.warn('resetClass failed', e) }
  })()
}

/**
 * Exporta la utilidad de sesión para que otros módulos la usen.
 */
export { getSessionId }

// --- Realtime (WebSocket) client helper ---
let _ws = null
/**
 * Inicializa la conexión WebSocket usada para eventos en tiempo real.
 * Devuelve el WebSocket instanciado y reintenta con backoff en caso de
 * cierre.
 *
 * @param {string} [baseUrl] URL base del API (opcional)
 * @returns {WebSocket|null}
 */
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
  /**
   * Suscribe el cliente a un classId en el WebSocket. Intenta enviar el
   * mensaje inmediatamente o reintenta durante unos segundos si el socket
   * no está aún abierto.
   *
   * @param {string} classId Código de la clase
   * @param {{role?:string,displayName?:string}} options
   * @returns {boolean} true si la suscripción fue programada/enviada
   */
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

/**
 * Crea una pregunta/challenge en el servidor.
 *
 * @param {string} code Código de la clase
 * @param {Object} options
 * @param {string} [options.id]
 * @param {string} [options.title]
 * @param {Array} [options.options]
 * @param {number} [options.duration]
 * @param {Object} [options.payload]
 * @returns {Promise<Object>} Objeto pregunta creado
 */
export async function createQuestion(code, { id = `q-${Date.now()}`, title = 'Pregunta', options = [], duration, payload = {} } = {}) {
  if (!API_BASE) throw new Error('createQuestion requires VITE_STORAGE_API')
  const q = { id, title, options, duration, payload, created_at: Date.now(), classId: code }
  const r = await fetch(`${API_BASE}/api/challenges`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) })
  if (!r.ok) {
    const txt = await r.text().catch(()=>null)
    throw new Error('createQuestion failed: ' + (txt || (r.status + ' ' + r.statusText)))
  }
  return q
}

/**
 * Cancela la suscripción al classId en el WebSocket.
 *
 * @param {string} classId Código de la clase
 * @returns {boolean} true si se envió correctamente
 */
export function unsubscribeFromClass(classId) {
  try {
    if (!_ws) return false
    const payload = JSON.stringify({ type: 'unsubscribe', classId, sessionId: getSessionId() })
    try { _ws.send(payload); return true } catch(e) { console.warn('unsubscribeFromClass send failed', e); return false }
  } catch (e) { console.warn('unsubscribeFromClass failed', e); return false }
}

/**
 * Envía una respuesta al endpoint de answers.
 *
 * @param {string} classId
 * @param {string} sessionId
 * @param {string} questionId
 * @param {any} answer
 * @returns {Promise<Object>} Payload enviado
 */
export async function submitAnswer(classId, sessionId, questionId, answer) {
  if (!API_BASE) throw new Error('submitAnswer requires VITE_STORAGE_API')
  const payload = { classId, sessionId, questionId, answer }
  const r = await fetch(`${API_BASE}/api/answers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  if (!r.ok) throw new Error('submitAnswer failed')
  return payload
}

// Submit an answer along with an evaluator result (score/feedback). Prefer WebSocket so the
// server can broadcast `answer-evaluated` to teachers immediately; fallback to HTTP POST.
/**
 * Envía una respuesta evaluada (resultado del evaluador) prefiriendo
 * WebSocket para baja latencia y fallando a HTTP si es necesario.
 *
 * @param {string} classId
 * @param {string} sessionId
 * @param {string} questionId
 * @param {any} answer
 * @param {Object} evaluation Resultado del evaluador
 * @returns {Promise<Object>} Payload enviado
 */
export async function submitEvaluatedAnswer(classId, sessionId, questionId, answer, evaluation = {}) {
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

  /* HTTP fallback commented out: prefer WebSocket for evaluated answer submission.
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
  */
}

/**
 * Revela la respuesta correcta de una pregunta. Intenta vía WebSocket y
 * cae a HTTP POST si no hay respuesta en un timeout configurable.
 *
 * @param {string} classId
 * @param {string} questionId
 * @param {any} correctAnswer
 * @param {number} [points=100]
 * @returns {Promise<Object>} Payload de resultados de la pregunta
 */
export async function revealQuestion(classId, questionId, correctAnswer, points = 100) {
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
          /*setTimeout(async () => {
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
          }, 3000)*/
        })
      } catch(e) { console.warn('revealQuestion ws send failed', e) }
    }
  } catch (e) { console.warn('revealQuestion ws check failed', e) }

  /* HTTP fallback commented out: prefer WebSocket reveal flow.
  const r = await fetch(`${API_BASE}/api/questions/${encodeURIComponent(questionId)}/reveal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ classId, correctAnswer, points }) })
  if (!r.ok) {
    const txt = await r.text().catch(()=>null)
    throw new Error('revealQuestion failed: ' + (txt||r.status))
  }
  return await r.json()
  */
}

/**
 * Ordena el cierre/stop de una pregunta. Prefiere WebSocket y falla a HTTP.
 *
 * @param {string} classId
 * @param {string} questionId
 * @returns {Promise<Object>} Respuesta del servidor o {ok:true, via:'ws'}
 */
export async function stopQuestion(classId, questionId) {
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

  /* HTTP fallback commented out: prefer WebSocket stop flow.
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
  */
}

