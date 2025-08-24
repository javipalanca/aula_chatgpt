export const LS_KEY = 'aula-chatgpt-progress-v1';

const SETTINGS_KEY = 'aula-chatgpt-settings-v1'

import { databases } from './appwrite'

// Appwrite: configure these collection IDs in your Appwrite console and set in env if needed
const APPWRITE_DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID
const APPWRITE_PROGRESS_COLLECTION = import.meta.env.VITE_APPWRITE_PROGRESS_COLLECTION_ID
const APPWRITE_SETTINGS_COLLECTION = import.meta.env.VITE_APPWRITE_SETTINGS_COLLECTION_ID

const SESSION_KEY = 'aula-session-id'

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
  try {
    // always persist locally first for offline/fast writes
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)) } catch (e) {}

    // try Appwrite for session-scoped storage
    if (databases && APPWRITE_DB_ID && APPWRITE_PROGRESS_COLLECTION) {
      const id = getSessionId()
      // attempt to create, otherwise update
      databases.getDocument(APPWRITE_DB_ID, APPWRITE_PROGRESS_COLLECTION, id)
        .then(() => databases.updateDocument(APPWRITE_DB_ID, APPWRITE_PROGRESS_COLLECTION, id, { data: state }))
        .catch(() => databases.createDocument(APPWRITE_DB_ID, APPWRITE_PROGRESS_COLLECTION, id, { data: state }).catch(() => {}))
      return
    }
    return
  } catch {}
}

export function loadProgress() {
  try {
    // return localStorage immediately for synchronous callers
    const raw = localStorage.getItem(LS_KEY)
    // asynchronously try to refresh from Appwrite using session id and store locally if found
    if (databases && APPWRITE_DB_ID && APPWRITE_PROGRESS_COLLECTION) {
      const id = getSessionId()
      databases.getDocument(APPWRITE_DB_ID, APPWRITE_PROGRESS_COLLECTION, id)
        .then(res => { if (res && res.data) localStorage.setItem(LS_KEY, JSON.stringify(res.data)) })
        .catch(() => {})
    }
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveSettings(s) {
  try {
    // persist locally first and notify listeners
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('aula-chatgpt-settings', { detail: s })) } catch (e) {}

    if (databases && APPWRITE_DB_ID && APPWRITE_SETTINGS_COLLECTION) {
      const id = getSessionId()
      databases.getDocument(APPWRITE_DB_ID, APPWRITE_SETTINGS_COLLECTION, id)
        .then(() => databases.updateDocument(APPWRITE_DB_ID, APPWRITE_SETTINGS_COLLECTION, id, { data: s }))
        .catch(() => databases.createDocument(APPWRITE_DB_ID, APPWRITE_SETTINGS_COLLECTION, id, { data: s }).catch(() => {}))
    }
  } catch {}
}

export function loadSettings() {
  try {
    const r = localStorage.getItem(SETTINGS_KEY)
    // asynchronously refresh settings from Appwrite and dispatch a settings event so UI can update
    if (databases && APPWRITE_DB_ID && APPWRITE_SETTINGS_COLLECTION) {
      const id = getSessionId()
      databases.getDocument(APPWRITE_DB_ID, APPWRITE_SETTINGS_COLLECTION, id)
        .then(res => { if (res && res.data) {
          try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(res.data)) } catch {}
          try { window.dispatchEvent(new CustomEvent('aula-chatgpt-settings', { detail: res.data })) } catch {}
        }})
        .catch(() => {})
    }
    return r ? JSON.parse(r) : { mascotVisible: true, mascotMuted: false }
  } catch { return { mascotVisible: true, mascotMuted: false } }
}
