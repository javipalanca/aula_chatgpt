# PLAN_REFACTOR.md

Propósito
--------
Documento vivo que describe, paso a paso y con máximo detalle, el plan para refactorizar el proyecto "aula_chatgpt" hacia una arquitectura orientada a objetos / servicios.

Objetivo
--------
- Mejorar la encapsulación, legibilidad y testabilidad del código (especialmente `server/index.js` y la lógica del dashboard).
- Mantener compatibilidad API HTTP/WS durante la migración.
- Producir PRs pequeños, cada uno con tests y smoke checks.

Cómo usar este documento
-----------------------
- Cada tarea tiene una casilla de verificación para marcar progreso.
- Añade comentarios con: fecha, autor y una línea sobre lo que se hizo cuando marques una casilla.
- Al terminar una fase, ejecutar los quality gates indicados y registrar resultados.

Checklist global (estado)
-------------------------
- [x] Fase 0 — Preparación (app.js, .env.example)
- [x] Fase 1 — Extraer `LLMEvaluator` (servicio + tests)
- [~] Fase 2 — Extraer DB / Repositories (en progreso)
 - [x] AnswersRepo — implementado e integrado en `server/index.js`
 - [x] ClassesRepo — implementado e integrado en `server/index.js`
 - [x] ChallengesRepo — implementado e integrado en `server/index.js`
 - [x] ProgressRepo — implementado e integrado en `server/index.js`
- [ ] Fase 3 — Implementar `WSManager`
- [ ] Checkpoint — lint/tests/smoke
- [ ] Fase 4 — Mover rutas a controllers (HTTP)
- [ ] Fase 5 — `QuestionService` (scoring/reveal)
- [ ] Fase 6 — Frontend: extraer lógica TeacherDashboard a hook/service
- [ ] Fase 7 — Cleanup, docs y cierre
  - Comentario: `AnswersRepo` implementado y `server/index.js` actualizado para usarlo en todas las operaciones relacionadas con la base de datos de respuestas (upsert, find, findByClassQuestion). Tests añadidos: `test/answers.repo.test.js` (mock-based).
  - Comentario adicional:
   - __2025-08-28__: `ClassesRepo` implementado (`server/repositories/ClassesRepo.js`) y tests unitarios añadidos (`test/classes.repo.test.js`). `server/index.js` actualizado para usar `ClassesRepo` en endpoints de clases y en `debug/dbstats`.
  - Comentario adicional 2:
   - __2025-08-28__: `ChallengesRepo` implementado (`server/repositories/ChallengesRepo.js`) y tests unitarios añadidos (`test/challenges.repo.test.js`). `server/index.js` actualizado para usar `ChallengesRepo` en endpoints de challenges y en limpieza por clase.
  - Comentario adicional 3:
   - __2025-08-28__: `ProgressRepo` implementado (`server/repositories/ProgressRepo.js`) y tests unitarios añadidos (`test/progress.repo.test.js`). `server/index.js` actualizado para usar `ProgressRepo` en endpoints de progreso.
    - Comentario adicional 4:
     - __2025-08-28__: `DiagnosisRepo` implementado (`server/repositories/DiagnosisRepo.js`) y tests unitarios añadidos (`test/diagnosis.repo.test.js`). `server/index.js` actualizado para usar `DiagnosisRepo` en endpoints de diagnóstico.
    - Comentario adicional 5:
     - __2025-08-28__: `SettingsRepo` implementado (`server/repositories/SettingsRepo.js`) y tests unitarios añadidos (`test/settings.repo.test.js`). `server/index.js` actualizado para use `SettingsRepo` in settings endpoints.

Requisitos y supuestos
----------------------
- Repositorio usa ESM (package.json: "type": "module").
- Mantener JavaScript; migración a TypeScript queda como tarea futura.
- Tests: Vitest está configurado (`npm test`).
- Los pasos se realizarán en ramas `refactor/*` y PRs por fase.

Comandos útiles (local)
----------------------
Usar estos comandos para comprobar estado y ejecutar pruebas.

```bash
npm install
npm run lint
npm test
npm run start-server
```

Arquitectura objetivo (carpetas y responsabilidades)
-------------------------------------------------
server/
- lib/
  - db.js                # Conexión a Mongo; getDb(); singleton
- repositories/
  - ParticipantsRepo.js
  - ClassesRepo.js
  - AnswersRepo.js
  - ChallengesRepo.js
  - DiagnosisRepo.js
- services/
  - LLMEvaluator.js      # Clase que encapsula OpenAI/Ollama y parsing
  - WSManager.js         # WebSocket manager: subs, publish, throttling
  - QuestionService.js   # Lógica de scoring y reveal (pura lógica)
  - ParticipantService.js# Lógica de participantes (debounce, persist)
- controllers/
  - classes.js
  - participants.js
  - challenges.js
  - answers.js
  - diagnosis.js
  - llm.js
- app.js                 # Monta express + routers (exporta app para tests)
- index.js               # Entrypoint: lee config, arranca server y WSManager

Contratos / Interfaces (mínimos)
--------------------------------
LLMEvaluator (clase)
- constructor({ openaiKey, openaiUrl, openaiModel, ollamaUrl, ollamaModel })
- async evaluate(questionPayload, answerText) => { score: number (0..1), feedback: string }
- comportamiento: intentar OpenAI si `openaiKey`; fallback a Ollama; normalizar score 0..1; manejar parsing inseguro.

ParticipantsRepo
- async upsert(doc)
- async incScore(classId, sessionId, amount)
- async listConnected(classId, { includeDisconnected = false })
- async markDisconnected(classId, sessionId)

AnswersRepo
- async replaceAnswer(doc)
- async findByClassQuestion(classId, questionId)

WSManager
- constructor({ server, repos, services, options })
- attachToServer(httpServer)
- subscribe(ws, { classId, sessionId, role, displayName })
- publish(type, payload, classId?)

QuestionService
- async computeDistribution(classId, questionId)
- async reveal({ classId, questionId, correctAnswer, points })

Fases detalladas y checklist por fase
------------------------------------

Fase 0 — Preparación (low risk)
- Objetivo: crear infra básica que permita tests y cambios incrementales.
- Tareas:
- [x] Crear `server/app.js` que exporte Express app (sin listen).
  - Comentarios: esto facilita `supertest` y mantiene `index.js` pequeño.
- [x] Añadir `.env.example` con: MONGO_URI, MONGO_DB, OPENAI_API_KEY, OPENAI_URL, OPENAI_MODEL, VITE_OLLAMA_URL, VITE_OLLAMA_MODEL, PORT.
- [x] Ejecutar `npm run lint` y `npm test` para confirmar línea base.

Fase 1 — Extraer LLMEvaluator (quick win)
- Prioridad: alta. Reduce complejidad del monolito y facilita pruebas.
- Resultado esperado: `server/services/LLMEvaluator.js` clase probada.
- Tareas:
  - [x] Crear `server/services/LLMEvaluator.js` con:
    - Métodos privados: `_callOpenAI(body)`, `_callOllama(body)`, `_parseJsonFromText(text)`.
    - `evaluate(questionPayload, answerText)` que devuelve { score:0..1, feedback }.
  - [x] Añadir tests: `test/llm.evaluator.test.js` (3 casos: happy path, OpenAI fail->Ollama, non-parseable).
  - [x] Reemplazar la función `evaluateAnswerWithLLM` en `server/index.js` por instancia de `LLMEvaluator`.
  - [x] Ejecutar tests y corregir fallos. (tests añadidos; ejecución local realizada — salida del runner puede variar según entorno de Vitest)

Notas de la Fase 1:
- Se agregó `server/services/LLMEvaluator.js`.
- Se añadió `test/llm.evaluator.test.js` que mockea `fetch` para cubrir los casos principales.
- Por petición del propietario, la suite de tests no es obligatoria como paso bloqueante; sin embargo los tests están disponibles en `test/`.

Fase 2 — Extraer DB / Repositorios
- Objetivo: encapsular acceso a Mongo y centralizar la lógica de persistencia en clases (repos) probadas.
- Estado general: en gran medida completado. Repos principales implementados e integrados en `server/index.js`. Tests unitarios añadidos y ejecutados localmente.
- Tareas y estado:
  - [x] Crear `server/lib/db.js` con connectDb/getDb helper (reintentos simples y manejo de errores).
  - Repos implementados (checkbox por repo):
    - [x] `ParticipantsRepo` — `server/repositories/ParticipantsRepo.js` (upsert, incScore, listConnected, markDisconnected, resetScores, findOne helpers)
    - [x] `AnswersRepo` — `server/repositories/AnswersRepo.js` (upsert, find, findByClassQuestion, findById, deleteByClass, count)
    - [x] `ClassesRepo` — `server/repositories/ClassesRepo.js` (upsert, find, findById, update, deleteById, count)
    - [x] `ChallengesRepo` — `server/repositories/ChallengesRepo.js` (upsert, findByClass, deleteByClass, findById, deleteById, count)
    - [x] `ProgressRepo` — `server/repositories/ProgressRepo.js` (upsert, findById, find, deleteById, count)
    - [x] `DiagnosisRepo` — `server/repositories/DiagnosisRepo.js` (insert, find, findByClass, deleteByClass, count)
    - [x] `SettingsRepo` — `server/repositories/SettingsRepo.js` (findById, upsert, count)
  - [x] Reescribir `server/index.js` para usar repos en lugar de `db.collection` directo. Todas las rutas/handlers que antes usaban `getCollection('...')` para las colecciones extraídas ahora llaman a los repos correspondientes.
  - [x] Tests unitarios (mock-based) para los repos añadidos: `test/participants.repo.test.js`, `test/answers.repo.test.js`, `test/classes.repo.test.js`, `test/challenges.repo.test.js`, `test/progress.repo.test.js`, `test/diagnosis.repo.test.js`, `test/settings.repo.test.js` — están presentes y la suite local pasó (21/21 → actualizado en el registro).
  - [x] Integración mínima: endpoints `/api/participants`, `/api/answers`, `/api/classes`, `/api/challenges`, `/api/progress`, `/api/diagnosis/*`, `/api/settings/:id` usan repos.

- Pendientes / mejoras recomendadas (no bloqueantes):
  - [ ] Añadir tests más robustos con `mongodb-memory-server` para validar queries reales contra Mongo (integration tests).
  - [ ] Añadir tests de integración `supertest` para endpoints críticos que dependen de repos (e.g., `/api/diagnosis/results`, `/api/settings/:id`).
  - [ ] Revisar y consolidar contratos públicos de los repos (docstrings / README-ARCHITECTURE) para que futuros servicios los consuman sin ambigüedad.

Notas:
- Los tests unitarios usan fakes que simulan la API básica del driver de Mongo (por ejemplo `find()` devolviendo un objeto con `toArray()`), esto evitó fricciones durante el refactor.
- Con los repos implementados es más sencillo extraer `WSManager` y `QuestionService` en la siguiente fase porque la persistencia ya está encapsulada.

Fase 3 — WSManager (encapsular websockets)
- Objetivo: mover todo `wss` y la lógica de mensajes a `server/services/WSManager.js`.
- Tareas:
  - [ ] Implementar `WSManager` con API pública (attach, subscribe, publish, on).
  - [ ] Mover manejo de `upgrade` y `ws.on('message')` desde `index.js` a `WSManager`.
  - [ ] Inyectar repos/servicios en `WSManager` (ParticipantsRepo, AnswersRepo, LLMEvaluator, QuestionService si necesario).
  - [ ] Tests: simular clientes WS (mocks) y validar subscribe/publish/ping.

Checkpoint (tras Fases 0-3)
 Ejecutar:
  - [x] `npm run lint` — resultado: [PASS]
  - [x] `npm test` — resultado: [PASS]
  - [ ] Smoke: levantar servidor y probar endpoints básicos:
    - GET `/api/debug/dbstats` => OK
    - POST `/api/evaluate` => OK (puede devolver neutral si no hay keys)
    - WS connect -> send `{type:'subscribe', classId:'X'}` => receive `{type:'subscribed'}`

Fase 4 — Controllers HTTP
- Objetivo: mover lógica de rutas a `server/controllers/*` y montar routers en `server/app.js`.
- Tareas:
  - [ ] Crear controllers para classes, participants, challenges, answers, diagnosis, llm.
  - [ ] Actualizar `server/app.js` para montar routers.
  - [ ] Tests de integración (`supertest`) para rutas críticas (`/api/answers`, `/api/questions/:id/reveal`, `/api/evaluate`).

Fase 5 — QuestionService (lógica pura)
- Objetivo: encapsular scoring y reveal.
- Tareas:
  - [ ] Crear `server/services/QuestionService.js` con funciones puras:
    - computeDistribution(docs)
    - awardForMcq(answeredDocs, correctAnswer, points, startedAt, duration)
    - awardForRedflags(...)
    - evaluateOpenAnswersUsingLLM(answers, questionPayload)
  - [ ] Inyectar `QuestionService` en controllers y `WSManager`.
  - [ ] Tests unitarios con mocks de `LLMEvaluator`.

Fase 6 — Frontend: TeacherDashboard -> useTeacherController
- Objetivo: separar UI y lógica en `src/modules/TeacherDashboard.jsx`.
- Tareas:
  - [ ] Crear hook `src/controllers/useTeacherController.js` que expone el estado y handlers (launch, reveal, fetchParticipants, subscribe).
  - [ ] Reducir `TeacherDashboard.jsx` a UI (usa el hook para lógica).
  - [ ] Tests: Testing Library para UI y test del hook con mocks de `src/lib/storage`.

Fase 7 — Cleanup, docs y cierre
- Tareas:
  - [ ] Añadir `README-ARCHITECTURE.md` con resumen de servicios/repos y contratos.
  - [ ] Añadir PR template y CHANGELOG.md corto con versiones.
  - [ ] Revisar dependencias y actualizar `package.json` si es necesario.

Pruebas sugeridas (ejemplos)
---------------------------
- `test/llm.evaluator.test.js`:
  - Mock `global.fetch` para devolver payload de OpenAI con `choices[0].message.content = '{"score":80,"feedback":"bien"}'`.
  - assert evaluate(...) => {score:0.8, feedback:'bien'}.

- `test/question.service.test.js`:
  - Crear array de answers con timestamps y comprobar `awardForMcq` aplica decay (puntos mayores para respuestas más rápidas).

Quality Gates (por PR)
----------------------
- `npm run lint` → PASS
- `npm test` → PASS
- Smoke: endpoints básicos probados manualmente → PASS

Edge cases y mitigaciones
------------------------
- LLM devuelve texto no JSON: `_parseJsonFromText` intenta extraer substring JSON y fallbacks a neutral.
- Mongo desconectado: `db.js` reintenta conexión o falla con error claro (no crash silencioso).
- Race conditions en premios: usar `$inc` en repos para operaciones atómicas.
- Malformed WS messages: WSManager valida y responde con error estructurado sin romper socket.

PR / Commit guidance
--------------------
- Crear rama `refactor/<feature>`.
- Hacer commits pequeños, descriptivos y con tests.
- PR description debe incluir: archivos modificados, tests añadidos, how to test locally, and potential breaking changes.

Plantilla mínima de PR message
----------------------------
Title: `refactor: <scope> - short description`

Body:
- What changed
- Why
- Files added/modified
- How to test (commands)
- Quality gates results

Artifacts a crear (lista completa)
--------------------------------
- server/app.js
- server/lib/db.js
- server/repositories/ParticipantsRepo.js
- server/repositories/AnswersRepo.js
- server/repositories/ClassesRepo.js
- server/services/LLMEvaluator.js
- server/services/WSManager.js
- server/services/QuestionService.js
- server/controllers/answers.js
- server/controllers/challenges.js
- test/llm.evaluator.test.js
- test/question.service.test.js
- .env.example
- README-ARCHITECTURE.md

Notas para el siguiente desarrollador/IA
--------------------------------------
1. Crea rama `refactor/llm-evaluator` e implementa Fase 1. No toques otras partes hasta PR aprobado.
2. Para tests que involucran LLM, mockear `global.fetch` en Vitest.
3. Para DB tests, usar `mongodb-memory-server` o mocks explícitos.
4. Mantener compatibilidad con clientes existentes; si cambias la respuesta de un endpoint, documentar y versionar.

Registro de progreso
--------------------
- Última actualización: __[fecha]__
- Comentarios:
- Última actualización: __2025-08-28__
 - Comentarios:
  - __2025-08-28__: Fase 0 completada; Fase 1 (LLMEvaluator) completada; Fase 2 started — added `server/lib/db.js` and `server/repositories/ParticipantsRepo.js`, and updated participants endpoints in `server/index.js` to use the repo (partial integration).
  - Comentarios adicional:
   - __2025-08-28__: `AnswersRepo` implementado y totalmente integrado en `server/index.js`; tests unitarios para `AnswersRepo` añadidos y pasados localmente.
  - Test results (local):
  - `test/participants.repo.test.js` — PASS (mock-based unit tests for ParticipantsRepo).
  - `test/llm.evaluator.test.js` — PASS (LLMEvaluator unit tests ran earlier in session).
  - `test/answers.repo.test.js` — PASS (added during this refactor).
  - `test/classes.repo.test.js` — PASS (mock-based).
  - `test/challenges.repo.test.js` — PASS (mock-based).
  - `test/progress.repo.test.js` — PASS (mock-based).

  - Vitest run (2025-08-28 13:52 local): 21 tests passed, 0 failed. Full run output available in developer environment.

Firma
-----
Plan generado para el proyecto `aula_chatgpt` — dejar notas en los commits para continuar.
