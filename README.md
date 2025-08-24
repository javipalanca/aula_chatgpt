# Aula ChatGPT

Proyecto frontend (React + Vite + Tailwind) para el juego/taller educativo "Aula ChatGPT".

Características:
- Single Page App React (sin backend)
- TailwindCSS para estilos
- Iconos con lucide-react
- Guardado en localStorage

Requisitos
- Node.js 18+ y npm o PNPM

Ollama (opcional)

Si quieres probar prompts contra un servidor Ollama local/remoto, añade un archivo `.env` en la raíz con la variable `VITE_OLLAMA_URL` apuntando a tu servidor (por ejemplo `http://localhost:11434`). Puedes usar el ejemplo `.env.example` incluido.

Ejemplo `.env`:

```
VITE_OLLAMA_URL=http://localhost:11434
VITE_OLLAMA_MODEL=llama2
```

Nota: por motivos de CORS es posible que necesites configurar Ollama para permitir peticiones desde el origen de tu app o usar un proxy.

Appwrite (opcional)
-------------------
Si quieres usar Appwrite como backend (auth, database, storage) añade las variables de entorno en `.env`:

```
VITE_APPWRITE_ENDPOINT=https://<tu-appwrite>/v1
VITE_APPWRITE_PROJECT_ID=<projectId>
VITE_APPWRITE_DATABASE_ID=<databaseId>
VITE_APPWRITE_PROGRESS_COLLECTION_ID=<progressCollectionId>
VITE_APPWRITE_SETTINGS_COLLECTION_ID=<settingsCollectionId>
```

Colecciones sugeridas (crear en la consola Appwrite > Database):

- progress: campos `{ data: JSON }` (usa un id único por usuario)
- settings: campos `{ data: JSON }`

La app intentará usar Appwrite si las variables están presentes; en caso contrario seguirá usando `localStorage`.

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
