import 'dotenv/config'
import { Client, Databases } from 'appwrite'

const endpoint = process.env.VITE_APPWRITE_ENDPOINT
const project = process.env.VITE_APPWRITE_PROJECT_ID
const databaseId = process.env.VITE_APPWRITE_DATABASE_ID
const progressCollection = process.env.VITE_APPWRITE_PROGRESS_COLLECTION_ID

async function run() {
  if (!endpoint || !project || !databaseId || !progressCollection) {
    console.error('Missing one of required env vars: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_DATABASE_ID, VITE_APPWRITE_PROGRESS_COLLECTION_ID')
    process.exit(2)
  }

  const client = new Client().setEndpoint(endpoint).setProject(project)
  const databases = new Databases(client)
  const appwriteKey = process.env.APPWRITE_KEY || process.env.APPWRITE_KEY
  if (appwriteKey) {
    try { client.setKey(appwriteKey) } catch {}
  }

  const docId = `test-doc-${Date.now()}-${Math.floor(Math.random()*100000)}`
  const payload = { test: true, createdAt: new Date().toISOString() }

  try {
    console.log('Inspecting collection to generate compatible payload')
    let payloadToUse = {}
    try {
      // Use fetch against the full Appwrite REST endpoint to read collection schema
      const base = endpoint.replace(/\/$/, '')
      const url = `${base}/databases/${databaseId}/collections/${progressCollection}`
  const headers = { 'X-Appwrite-Project': project }
  if (appwriteKey) headers['X-Appwrite-Key'] = appwriteKey
  const resp = await fetch(url, { headers })
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${await resp.text()}`)
      const collection = await resp.json()
      console.log('Collection summary:', JSON.stringify({ id: collection.$id, name: collection.name, attributesCount: (collection.attributes||[]).length }))
      const attrs = collection.attributes || []
      if (!attrs.length) {
        console.error('Collection has no attributes defined. Appwrite enforces schema: create at least one attribute in the collection (string or text) via the Appwrite Console before running this test.')
        process.exit(4)
      }
      // Build sample payload using first few attributes present
      for (const a of attrs) {
        const key = a.key || a.$id || a.name
        if (!key) continue
        const type = (a.type || a['type'])
        if (type && typeof type === 'string') {
          const t = type.toLowerCase()
          if (t.includes('bool')) payloadToUse[key] = true
          else if (t.includes('int')) payloadToUse[key] = 1
          else if (t.includes('float') || t.includes('double') || t.includes('number')) payloadToUse[key] = 1.23
          else if (t.includes('date') || t.includes('time')) payloadToUse[key] = new Date().toISOString()
          else payloadToUse[key] = `test-${Math.floor(Math.random()*1000)}`
        } else {
          payloadToUse[key] = `test-${Math.floor(Math.random()*1000)}`
        }
        if (Object.keys(payloadToUse).length >= 5) break
      }
    } catch (e) {
      console.error('Failed to inspect collection schema:', e.toString())
      process.exit(5)
    }

    const finalPayload = payloadToUse

    console.log('Creating document with id', docId, 'payload keys:', Object.keys(finalPayload))
    const created = await databases.createDocument(databaseId, progressCollection, docId, finalPayload, [], [])
    console.log('Created document id:', created.$id)

    console.log('Fetching document back')
    const fetched = await databases.getDocument(databaseId, progressCollection, docId)
    console.log('Fetched document:', { id: fetched.$id, data: fetched.data || fetched })

    console.log('Deleting document')
    await databases.deleteDocument(databaseId, progressCollection, docId)
    console.log('Delete succeeded')

    console.log('CRUD test completed successfully')
    process.exit(0)
  } catch (e) {
    console.error('CRUD test failed:')
    try { console.error(e.message || e.toString()) } catch {}
    try { console.error('Full error:', JSON.stringify(e, Object.getOwnPropertyNames(e))) } catch {}
    process.exit(3)
  }
}

run()
