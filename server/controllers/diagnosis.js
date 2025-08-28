import express from 'express'

export default function diagnosisController({ diagnosisResultsRepo, ollamaConfig = {}, fetchImpl = fetch, csvEscape = (v)=>String(v||'') } = {}) {
  const router = express.Router()

  router.get('/generate', async (req, res) => {
    if (!ollamaConfig.url) return res.status(500).json({ ok: false, error: 'Ollama no configurado' })
    try {
      const genPrompt = `Genera un array JSON con 3 objetos {id,prompt} en español para ejercicios cortos de diagnóstico educativo: Detecta el bulo, Prompt Golf (pedir prompt mínimo), y Re-pregunta. Devuelve solo JSON.`
      const url = ollamaConfig.url.replace(/\/$/, '') + '/api/generate'
      const r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: ollamaConfig.model, prompt: genPrompt }) })
      const text = await r.text()
      if (!r.ok) return res.status(502).send(text)
      try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) return res.json(parsed) } catch (e) { /* fallback */ }
      return res.status(502).send(text)
    } catch (e) { return res.status(502).json({ ok: false, error: String(e) }) }
  })

  router.post('/validate-bulo', async (req, res) => {
    const { answer } = req.body || {}
    if (!ollamaConfig.url) return res.status(500).json({ ok: false, error: 'Ollama no configurado' })
    const prompt = `Eres un asistente que valida posibles bulos. Lee la respuesta: "${String(answer).slice(0,1000)}" y responde en JSON { verdict: 'bulo'|'no-bulo'|'dudoso', reasons: [..] } en español.`
    try {
      const callUrl = ollamaConfig.url.replace(/\/$/, '') + '/api/generate'
      const r = await fetchImpl(callUrl, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ model: ollamaConfig.model, prompt, max_tokens: 512 }) })
      const text = await r.text()
      if (!r.ok) return res.status(502).send(text)
      try { return res.json({ ok: true, raw: JSON.parse(text) }) } catch (e) { return res.status(502).send(text) }
    } catch (e) { return res.status(502).json({ ok: false, error: String(e) }) }
  })

  router.post('/results', async (req, res) => {
    const payload = req.body || {}
    payload.created_at = new Date()
    try { const r = await diagnosisResultsRepo.insert(payload); return res.json({ ok: true, id: payload.id || (r && r.insertedId && r.insertedId.toString()) || 'ok' }) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  router.get('/results', async (req, res) => {
    const classId = req.query.classId
    try { const docs = await diagnosisResultsRepo.find(classId ? { classId } : {}); return res.json(docs) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  router.get('/report/:classId', async (req, res) => {
    const classId = req.params.classId
    try {
      const docs = await diagnosisResultsRepo.find(classId ? { classId } : {})
      const rows = []
      rows.push(['id','classId','studentId','stage','score','verdict','created_at','raw'].join(','))
      for (const d of docs) {
        const id = d.id || (d._id && d._id.toString()) || ''
        const studentId = d.studentId || ''
        const stage = d.stage || ''
        const score = typeof d.score !== 'undefined' ? d.score : ''
        const verdict = d.verdict ? String(d.verdict).replace(/\n/g,' ') : ''
        const created = d.created_at ? new Date(d.created_at).toISOString() : ''
        const raw = d.raw ? JSON.stringify(d.raw).replace(/"/g,'""') : ''
        rows.push([csvEscape(id), csvEscape(classId||''), csvEscape(studentId), csvEscape(stage), csvEscape(score), csvEscape(verdict), csvEscape(created), csvEscape(raw)].join(','))
      }
      const csv = rows.join('\n')
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="diagnosis_report_${classId||'all'}.csv"`)
      return res.send(csv)
    } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  return router
}
