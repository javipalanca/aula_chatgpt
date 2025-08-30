# FLOW — Resumen del flujo y reglas (versión organizada)

## Checklist

- Componentes y responsabilidades (servidor, WS, DB, profesor, alumno).
- Flujos completos:
  - Alumno con evaluación LLM en cliente.
  - Alumno con evaluación LLM en servidor.
  - Profesor revela MCQ / redflags.
- Eventos WS y endpoints HTTP usados.
- Formas de datos (participant, answer, question, evaluation).
- Reglas de puntuación y fórmulas (incluyendo timeDecay).
- Riesgos y mitigaciones (duplicado de puntos, idempotencia, races).

## Resumen alto nivel

- Fuente de verdad de puntuaciones: servidor (repositorios / DB).
- Comunicación en tiempo real: WebSocket (`WSManager` / `BroadcastService`).
- Evaluaciones LLM pueden venir del cliente o del servidor. En ambos casos el servidor es quien aplica la puntuación y hace el broadcast.
- El cliente puede mostrar una estimación (`displayedEvaluationResult`) pero no debe persistir la puntuación acumulada: sólo el servidor incrementa `participants.score`.

## Componentes y responsabilidades

### Frontend — estudiante

- Envía respuestas con `submitAnswer` o `submitEvaluatedAnswer`.
- Si la evaluación se hace en cliente, puede usar `/api/evaluate` o evaluar localmente y luego enviar la evaluación (WS preferido).
- Muestra la evaluación estimada, no aplica `scoreDelta` permanentemente.

### Frontend — profesor

- Lanza preguntas (`createQuestion` / WS launch).
- Para MCQ/redflags el profesor proporciona `correctAnswer` (o el payload incluye `correct`).
- Escucha eventos: `participants-updated`, `answer-evaluated`, `question-results`.

### Servidor (Express + servicios)

- Repositorios: `ParticipantsRepo`, `AnswersRepo`, `ClassesRepo` (MongoDB).
- Servicios principales:
  - `AnswerService.submitAnswer`: guarda la respuesta, calcula evaluación si procede (cliente o servidor), aplica puntos mediante `participantsRepo.incScore`, persiste evaluación y broadcast.
  - `QuestionService.revealQuestion`: para MCQ/redflags calcula premios según `correctAnswer` y `timeDecay`; para `open`/`prompt` puede invocar LLM en batch.
  - `ParticipantService`: upsert/heartbeat, lista de conectados y broadcast `participants-updated`.
  - `LLMEvaluator`: integra OpenAI/Ollama y normaliza resultado a 0..1.
  - `WSManager` / `BroadcastService`: gestionan sockets, suscripciones por `classId` y envían snapshots (enviar snapshot al profesor al suscribirse).

### Base de datos (MongoDB)

- Colecciones: `participants`, `answers`, `classes`/`challenges`.
- Reglas operativas:
  - Upserts cuidadosos: no poner la misma ruta en `$set` y `$setOnInsert`.
  - Incremento de puntuación via `$inc` en `participantsRepo.incScore`.

## Formas de datos (ejemplos)

Participant

```json
{
  "id": "CL:SID",
  "classId": "CL",
  "sessionId": "SID",
  "displayName": "Alicia",
  "score": 42,
  "lastSeen": "2025-08-29T...Z",
  "connected": true
}
```

Answer

```json
{
	"id": "class:session:question",
	"classId": "CL",
	"sessionId": "SID",
	"questionId": "Q1",
	"answer": "...",
	"created_at": "2025-08-29T...Z",
	"evaluation": {
		"score": 0.2,
		"feedback": "...",
		"awardedPoints": 20,
		"evaluatedAt": "2025-08-29T...Z",
		"source": "client" | "server"
	}
}
```

Question (challenge)

```json
{
  "id": "Q1",
  "title": "...",
  "payload": {
    "source": "open|prompt|mcq",
    "evaluation": "llm|manual",
    "correctAnswer": null,
    "correct": null,
    "points": 100,
    "duration": 30,
    "timeDecay": true
  },
  "options": []
}
```

WS event `participants-updated`

```json
{
  "type": "participants-updated",
  "classId": "CL",
  "participants": [
    {
      "sessionId": "SID",
      "displayName": "Alicia",
      "score": 62,
      "lastSeen": "...",
      "connected": true
    }
  ]
}
```

## Eventos WS y endpoints HTTP clave

WS messages (cliente ↔ servidor)

- `subscribe` — `{ type:'subscribe', classId, sessionId, role, displayName }`
- `ping` — `{ type:'ping', classId, sessionId }` (heartbeat)
- `reveal` — `{ type:'reveal', classId, questionId, correctAnswer?, points }` (teacher)
- `answer` — `{ type:'answer', classId, sessionId, questionId, answer, evaluation }` (submitEvaluatedAnswer)

Broadcasts (servidor → clientes)

- `participant-heartbeat`, `participants-updated`, `question-launched`, `answers-count`, `answer-evaluated`, `question-results`

HTTP endpoints

- `POST /api/answers` (submitAnswer fallback)
- `DELETE /api/answers?classId=...` (delete answers)
- `POST /api/questions/:id/reveal` (reveal fallback)
- `POST /api/participants` (join/update)
- `GET /api/participants?classId=...`
- `POST /api/evaluate` (LLMEvaluator server-side)

## Flujos detallados

### 1) Alumno con LLM en cliente (cliente evalúa y envía score)

1. El alumno escribe prompt/respuesta. El componente `ChatGPT` puede llamar a `/api/evaluate` (opcional) o evaluar localmente.
2. El cliente llama `submitEvaluatedAnswer` (WS preferido) con payload `{ answer, evaluation: { score, feedback } }`.
3. `WSManager` recibe el mensaje `answer` y delega a `AnswerService.submitAnswer`.
4. `AnswerService`:
   - Upsertea la respuesta en `AnswersRepo`.
   - Si `evaluation` está presente y el `evalMode` es `prompt|open`, llama a `computeAndApplyAward(evaluation.score, ...)`.
   - Antes de llamar a `participantsRepo.incScore`, verifica idempotencia: si `answer.evaluation.awardedPoints` ya existe, no vuelve a incScore.
   - Llama `participantsRepo.incScore(classId, sessionId, awarded)`.
   - Persiste la evaluación junto con `awardedPoints` y hace broadcast `answer-evaluated` y `participants-updated`.
5. El cliente estudiante recibe `participants-updated` y actualiza la UI con la puntuación autorizada por el servidor.

### 2) Alumno envía sin evaluación → LLM en servidor

1. El alumno hace `submitAnswer` (WS o POST). `AnswerService` upsertea la respuesta.
2. `AnswerService` detecta `evalMode` `prompt|open` y que no hay `evaluation`; invoca `LLMEvaluator.evaluate(payload, answer)`.
3. Recibe `{ score, feedback }` y `computeAndApplyAward()` calcula `awarded`.
4. `participantsRepo.incScore(...)` es llamado una vez, evaluación persiste y se emiten `answer-evaluated` y `participants-updated`.

### 3) Profesor revela MCQ / redflags (reveal flow)

1. El profesor envía `reveal` (WS) o hace `POST /api/questions/:id/reveal` con `correctAnswer` (requerido para MCQ/redflags).
2. `QuestionService.revealQuestion` obtiene las respuestas (`AnswersRepo.findByClassQuestion`).
3. Para cada respuesta correcta, calcula `award = round(points * timeMultiplier)` (fraction=1).
4. Si una respuesta ya tiene `evaluation.awardedPoints` (por ejemplo, LLM cliente), no volver a aplicar `incScore` (idempotencia).
5. Se broadcast `question-results` y `participants-updated`.

## Fórmulas de puntuación

- Normalización LLM: `scoreFraction = (raw > 1 ? raw/100 : raw)` luego clamp 0..1.
- award (LLM o server-eval): `awarded = round(points * scoreFraction * timeMultiplier)`.
- `timeMultiplier`:
  - si `timeDecay === false` → `1`.
  - si `timeDecay === true` → `max(0, 1 - (timeTaken / duration))`.
- MCQ award (sin LLM score): `awarded = round(points * timeMultiplier)` para respuestas correctas (fraction = 1).

## Riesgos y mitigaciones

- Duplicado de puntos (doble `incScore`)
  - Causa: el cliente persistía `scoreDelta` además del servidor.
  - Mitigación: eliminar persistencia de `score` desde cliente. Sólo el servidor ejecuta `participantsRepo.incScore`.
  - Refuerzo: idempotencia en `AnswerService` y `QuestionService` — no incrementar si `answer.evaluation.awardedPoints` ya existe.

- Race conditions en broadcasts / snapshots perdidos
  - Mitigación: al suscribir el profesor enviar snapshot `participants-updated` inmediato desde `WSManager`.

- Upsert collisions en MongoDB
  - Mitigación: evitar incluir la misma ruta en `$set` y `$setOnInsert` (fix en `ParticipantsRepo`).

- Time-of-check vs time-of-write en awarding
  - Mitigación: comprobar `awardedPoints` por respuesta al calcular batch awards; considerar lock lógico por `questionId` si es crítico.

## Reglas operativas (resumen)

- Nunca pedir al profesor que ingrese la respuesta para preguntas LLM. El LLM puntúa y el servidor aplica/propaga.
- Para MCQ/redflags el profesor decide `correctAnswer`; el servidor aplica awards prorrateando por tiempo según `timeDecay`.
- El cliente puede mostrar una estimación (`awardedPoints`) pero no debe persistir `scoreDelta`.
- Todas las modificaciones de `participants.score` deben pasar por `participantsRepo.incScore` en el servidor.

## Guía de pruebas rápidas

- Caso LLM cliente:
  - Alumno envía respuesta con `evaluation.score = 20` y `points = 100`.
  - Verificar que `AnswerService` upsertea evaluación con `awardedPoints ≈ 20` y llama `participantsRepo.incScore(classId, sessionId, 20)` exactamente una vez.
  - Verificar broadcast `participants-updated` con `score` incrementado +20.

- Caso server-eval:
  - Alumno envía respuesta sin `evaluation`.
  - Server llama `LLMEvaluator.evaluate`, calcula `awardedPoints` y llama `incScore` una vez.

- Caso MCQ:
  - Profesor revela con `correctAnswer`.
  - Server asigna awards a `correctSessions` y no re-aplica awards para respuestas ya evaluadas.
