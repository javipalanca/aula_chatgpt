/*
  LLMEvaluator
  Encapsula la lógica de evaluación mediante LLMs (OpenAI y/o Ollama).
  Interfaz: constructor(config), async evaluate(questionPayload, answerText)
*/
export default class LLMEvaluator {
  constructor({
    openaiKey = "",
    openaiUrl = "",
    openaiModel = "",
    ollamaUrl = "",
    ollamaModel = "",
  } = {}) {
    this.openaiKey = openaiKey;
    this.openaiUrl = openaiUrl;
    this.openaiModel = openaiModel;
    this.ollamaUrl = ollamaUrl;
    this.ollamaModel = ollamaModel;
  }

  // Extrae JSON contenido en un texto si existe
  _parseJsonFromText(content) {
    if (!content || typeof content !== "string") return null;
    // primer intento: JSON.parse directo
    try {
      return JSON.parse(content);
    } catch (e) {
      /* fallthrough */
    }
    // buscar primer '{' y último '}' y parsear substring
    try {
      const s = content.indexOf("{");
      const eidx = content.lastIndexOf("}");
      if (s !== -1 && eidx !== -1 && eidx > s) {
        return JSON.parse(content.substring(s, eidx + 1));
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  async _callOpenAI(system, user) {
    if (!this.openaiKey) return null;
    try {
      const url = `${this.openaiUrl}/v1/chat/completions`;
      const body = {
        model: this.openaiModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 200,
      };
      try {
        console.info("LLM: using OpenAI", {
          provider: "openai",
          model: this.openaiModel,
          url,
        });
      } catch (e) {
        /* ignore */
      }
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.openaiKey}`,
        },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) {
        try {
          console.warn("OpenAI eval failed", {
            status: r.status,
            body: String(text).slice(0, 200),
          });
        } catch (e) {
          /* ignore */
        }
        return null;
      }
      // intentar parseo
      try {
        const parsed = JSON.parse(text);
        const content =
          parsed.choices &&
          parsed.choices[0] &&
          parsed.choices[0].message &&
          parsed.choices[0].message.content
            ? parsed.choices[0].message.content
            : null;
        if (content) {
          const parsedContent = this._parseJsonFromText(content);
          if (parsedContent) return parsedContent;
        }
      } catch (e) {
        const parsedContent = this._parseJsonFromText(text);
        if (parsedContent) return parsedContent;
      }
      return null;
    } catch (e) {
      console.warn("OpenAI eval error", e);
      return null;
    }
  }

  async _callOllama(system, user) {
    if (!this.ollamaUrl) return null;
    try {
      const url = this.ollamaUrl.replace(/\/$/, "") + "/api/generate";
      try {
        console.info("LLM: using Ollama", {
          provider: "ollama",
          model: this.ollamaModel,
          url,
        });
      } catch (e) {
        /* ignore */
      }
      const body = {
        model: this.ollamaModel,
        prompt: `${system}\n\n${user}`,
        max_tokens: 200,
      };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) {
        try {
          console.warn("Ollama eval failed", {
            status: r.status,
            body: String(text).slice(0, 200),
          });
        } catch (e) {
          /* ignore */
        }
        return null;
      }
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed[0];
        if (
          parsed &&
          Array.isArray(parsed.results) &&
          parsed.results[0] &&
          parsed.results[0].content
        ) {
          const inner = this._parseJsonFromText(parsed.results[0].content);
          if (inner) return inner;
        }
        const direct = this._parseJsonFromText(text);
        if (direct) return direct;
      } catch (e) {
        console.warn("parse ollama eval response failed", e);
      }
      return null;
    } catch (e) {
      console.warn("Ollama eval error", e);
      return null;
    }
  }

  // Normaliza a 0..1
  _normalizeScore(raw) {
    const n = Number(raw || 0);
    if (isNaN(n)) return 0;
    if (n > 1) return Math.max(0, Math.min(1, n / 100));
    return Math.max(0, Math.min(1, n));
  }

  async evaluate(questionPayload = {}, answerText = "") {
    const questionText =
      questionPayload &&
      (questionPayload.title ||
        questionPayload.prompt ||
        questionPayload.question)
        ? questionPayload.title ||
          questionPayload.prompt ||
          questionPayload.question
        : "";
    const isBadPromptImprovement =
      questionPayload && questionPayload.source === "BAD_PROMPTS";
    const isPromptEvaluation =
      questionPayload &&
      (questionPayload.evaluation === "prompt" ||
        questionPayload.source === "PROMPTS");

    const system = isBadPromptImprovement
      ? `Eres un experto en ingeniería de prompts. El siguiente es un mal prompt que un estudiante ha intentado mejorar. Evalúa cuánto ha mejorado el prompt del estudiante en comparación con el original. Devuelve únicamente JSON válido con dos campos: score (número entre 1 y 100) y feedback (cadena corta y constructiva). Un buen prompt debe ser claro, específico, y ético.`
      : isPromptEvaluation
        ? `Eres un experto en ingeniería de prompts. Evalúa la calidad del siguiente prompt de un estudiante. Devuelve únicamente JSON válido con dos campos: score (número entre 1 y 100) y feedback (cadena corta y constructiva). Un buen prompt debe ser claro, específico, y ético. Por ejemplo, un prompt para hacer trampa en un examen es de muy baja calidad (score 1).`
        : `Eres un evaluador objetivo que puntúa respuestas de estudiantes. Devuelve únicamente JSON válido con dos campos: score (número entre 1 y 100) y feedback (cadena corta).`;

    const user = isBadPromptImprovement
      ? `Mal prompt original: ${String(questionText).slice(0, 1000)}\n\nPrompt mejorado del alumno: ${String(answerText).slice(0, 2000)}\n\nEvalúa la mejora del prompt: asigna un score entre 1 (poca o nula mejora) y 100 (excelente mejora) y da feedback. Devuelve JSON: {"score": 1-100, "feedback": "..." }.`
      : isPromptEvaluation
        ? `Prompt del alumno: ${String(answerText).slice(0, 2000)}\n\nEvalúa la calidad de este prompt: asigna un score entre 1 (muy malo) y 100 (excelente) y da feedback. Devuelve JSON: {"score": 1-100, "feedback": "..." }.`
        : `Pregunta: ${String(questionText).slice(0, 1000)}\n\nRespuesta del alumno: ${String(answerText).slice(0, 2000)}\n\nEvalúa la respuesta: asigna un score entre 1 (muy mala) y 100 (excelente) según la calidad, claridad y cumplimiento de la consigna. Devuelve JSON: {"score": 1-100, "feedback": "..." }.`;

    // Try OpenAI first
    if (this.openaiKey) {
      const res = await this._callOpenAI(system, user);
      if (res) {
        try {
          const scoreFraction = this._normalizeScore(res.score);
          return { score: scoreFraction, feedback: res.feedback || "" };
        } catch (e) {
          /* ignore parse */
        }
      }
    }

    // Fallback to Ollama
    if (this.ollamaUrl) {
      const res = await this._callOllama(system, user);
      if (res) {
        try {
          const scoreFraction = this._normalizeScore(res.score);
          return { score: scoreFraction, feedback: res.feedback || "" };
        } catch (e) {
          /* ignore */
        }
      }
    }

    return {
      score: 0,
      feedback: "Evaluador no disponible o no pudo parsear respuesta",
    };
  }
}
