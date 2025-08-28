import express from 'express'

export default function llmController({ evaluator, ollamaConfig = {}, fetchImpl = fetch } = {}) {
  const router = express.Router()

  router.post('/evaluate', async (req, res) => {
    const { question, answer } = req.body || {}
    if (!question || !answer) return res.status(400).json({ error: 'Question and answer are required' })
    try { const result = await evaluator.evaluate(question, answer); return res.json(result) } catch (e) { return res.status(500).json({ error: 'Evaluation failed' }) }
  })

  router.post('/proxy', async (req, res) => {
    const body = req.body || {}
    const prompt = body.prompt || ''
    const OLLAMA_URL = ollamaConfig.url || ''
    const OLLAMA_MODEL = body.model || ollamaConfig.model || ''
    if (!OLLAMA_URL) return res.status(500).json({ ok: false, error: 'Ollama no configurado' })
    try {
      const url = OLLAMA_URL.replace(/\/$/, '') + '/api/generate'
      const r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: OLLAMA_MODEL, prompt, max_tokens: body.max_tokens || 512 }) })
      const text = await r.text()
      if (!r.ok) return res.status(502).send(text)
      try { return res.json({ ok: true, provider: 'ollama', raw: JSON.parse(text) }) } catch (e) { return res.json({ ok: true, provider: 'ollama', raw: text }) }
    } catch (e) { return res.status(502).json({ ok: false, error: String(e) }) }
  })

  return router
}
