# Aula ChatGPT

Proyecto frontend (React + Vite + Tailwind) para el juego/taller educativo "Aula ChatGPT".

Storage backend

La aplicación usa por defecto `localStorage` para persistencia. Si prefieres persistencia remota, configura un pequeño proxy que exponga endpoints REST y pon su URL en `.env` con `VITE_STORAGE_API`.

Ejemplo `.env`:

```
VITE_STORAGE_API=http://localhost:4000
```

El proxy puede gestionar colecciones/colecciones equivalentes a: `progress`, `settings`, `classes`, `participants`, `challenges`.

- `participants`: documentos por participante con id `"<classCode>:<sessionId>"` y campos `{ classId, sessionId, displayName, score, progress, lastSeen }`.
- `challenges`: documentos por reto con id `"<classCode>:<challengeId>"` y campos `{ classId, id, title, duration, payload, startedAt }`.

Notas de seguridad: la contraseña se hashea en el cliente (SHA‑256) antes de enviarla/guardarla; para un despliegue seguro valida la contraseña en el servidor y protege la API con autenticación.

## Persistencia remota (opcional)

Si prefieres persistencia remota, el proyecto incluye un pequeño proxy Node/Express que puede hablar con una base de datos como MongoDB.

Ejemplo `.env` para el proxy y el frontend:

```
MONGO_URI=mongodb://gtirouter.dsic.upv.es:43012
MONGO_DB=aula_chatgpt
PORT=4000
VITE_STORAGE_API=http://localhost:4000
```

Arranca el proxy con `npm run start-server` y configura `VITE_STORAGE_API` para apuntar a él; si no lo configuras, la app usará `localStorage`.

---

Instalación

```bash
npm install
```

Desarrollo

```bash
npm run dev
```

Construir para producción

```bash
npm run build
npm run preview
```
