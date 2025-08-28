/* eslint-env node */
export default class DiagnosisService {
  constructor({ diagnosisRepo, ollamaUrl = '', ollamaModel = '' } = {}) {
    this.diagnosisRepo = diagnosisRepo
    this.ollamaUrl = ollamaUrl
    this.ollamaModel = ollamaModel
  }

  async generatePrompts() {
    if (!this.ollamaUrl) throw new Error('Ollama not configured')
    const genPrompt = `Genera un array JSON con 3 objetos {id,prompt} en español para ejercicios cortos de diagnóstico educativo: Detecta el bulo, Prompt Golf (pedir prompt mínimo), y Re-pregunta. Devuelve solo JSON.`
    const url = this.ollamaUrl.replace(/\/$/, '') + '/api/generate'
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.ollamaModel, prompt: genPrompt }) })
    if (!r.ok) throw new Error('Ollama generate failed')
    const text = await r.text()
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed
      if (parsed && Array.isArray(parsed.results) && parsed.results[0] && parsed.results[0].content) {
        const inner = JSON.parse(parsed.results[0].content)
        if (Array.isArray(inner)) return inner
      }
    } catch (e) {
      const s = text.indexOf('[')
      const eidx = text.lastIndexOf(']')
      if (s !== -1 && eidx !== -1 && eidx > s) {
        try { const maybe = JSON.parse(text.substring(s, eidx+1)); if (Array.isArray(maybe)) return maybe } catch (ee) { /* fallthrough */ }
      }
      throw new Error('Ollama returned unparsable output')
    }
  }

  async saveResult(payload = {}) {
    payload.created_at = new Date()
    const r = await this.diagnosisRepo.insert(payload)
    return { ok: true, id: payload.id || (r && r.insertedId && r.insertedId.toString()) || 'ok' }
  }

  async listResults(classId) {
    return this.diagnosisRepo.find(classId ? { classId } : {})
  }
}
