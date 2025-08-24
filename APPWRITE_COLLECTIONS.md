# Appwrite collections schema for `aula_chatgpt`

This document lists the recommended attributes to create in your Appwrite database collections so the app can store progress and settings server-side. The app writes session-scoped documents with shapes described below.

> Note: Appwrite uses a strict collection schema. Create the attributes below (types and keys) in each collection using the Appwrite Console. If you prefer a more permissive approach, set collection-level rules to allow public create/update (Role.any / guests) but still keep attribute schema defined.

## Progress collection (example collection id: `VITE_APPWRITE_PROGRESS_COLLECTION_ID`)
This collection stores a single document per anonymous browser session (the app uses a session id as document id). It stores the user's current UI state and progress metrics.

Recommended collection attributes (table):

| Attribute | Type | Max size (recommended) | Default | Required | Array |
|---|---:|---|---|---:|:---:|
| `tab` | string | 64 chars | `"inicio"` | no | no |
| `points` | integer | 32-bit | `0` | no | no |
| `streak` | integer | 32-bit | `0` | no | no |
| `badges` | array<string> or text | element: 128 chars | `[]` or `""` (if text store `[]` JSON) | no | yes (preferred) |
| `updatedAt` | datetime | n/a | none (app can set ISO timestamp) | no | no |

Notes:
- If your Appwrite Console doesn't support `array<string>`, create `badges` as `text` and store a JSON array string (e.g. `"[\"Badge A\"]"`). The app will write/read the array as JSON into that field.
- The app writes the document data under Appwrite's `data` object; attribute keys above must exist in the collection schema to accept direct fields.


## Settings collection (example collection id: `VITE_APPWRITE_SETTINGS_COLLECTION_ID`)
Stores per-session UI preferences (mascot visibility + mute and other options). The app reads/writes these settings and dispatches events so UI updates immediately.

Recommended collection attributes (table):

| Attribute | Type | Max size (recommended) | Default | Required | Array |
|---|---:|---|---|---:|:---:|
| `mascotVisible` | boolean | n/a | `true` | no | no |
| `mascotMuted` | boolean | n/a | `false` | no | no |
| `theme` | string | 32 chars | `"light"` | no | no |
| `updatedAt` | datetime | n/a | none (app can set ISO timestamp) | no | no |

Notes:
- Minimum required attributes for the app are `mascotVisible` and `mascotMuted`.
- The app will dispatch an event `aula-chatgpt-settings` after updating settings so the UI updates immediately.


## Permissions & CORS (important)
- If the site is open (no auth), on each collection ensure the permissions allow anonymous clients to create/read/update documents as needed:
  - Set create/read/update permissions to `Role.any()` (or enable `guests` scopes for collections).
  - If you want only anonymous writes but not reads, adjust accordingly.
- Also add your frontend origin(s) to the project's Allowed Origins / CORS list so browser requests from your app are accepted.


## Quick Appwrite Console steps
1. Open Appwrite Console → Databases → (select your database) → Create Collection
2. Add attributes:
   - For `progress` collection: add `tab (string)`, `points (integer)`, `streak (integer)`, `badges (text)` (or `array<string>` if available), `updatedAt` (datetime)
   - For `settings` collection: add `mascotVisible (boolean)`, `mascotMuted (boolean)`
3. Configure collection permissions: allow `any` (public) read/create/update if you want anonymous clients to persist data.


## Example document (progress)
{
  "tab": "builder",
  "points": 12,
  "streak": 2,
  "badges": ["Constructor/a de Prompts"],
  "updatedAt": "2025-08-24T12:34:56.789Z"
}

## Example document (settings)
{
  "mascotVisible": true,
  "mascotMuted": false,
  "updatedAt": "2025-08-24T12:34:56.789Z"
}


If you want, I can:
- Update `scripts/test-appwrite-crud.js` to attempt to create a document using the determined attribute keys (already tried — it failed where the collection had no attributes). I can re-run that after you create the attributes.
- Provide a one-click Appwrite Console checklist with the exact buttons to press (screenshots would help if you want a guided flow).

```
