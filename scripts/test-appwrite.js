import 'dotenv/config'
import { Client, Databases } from 'appwrite'

const endpoint = process.env.VITE_APPWRITE_ENDPOINT
const project = process.env.VITE_APPWRITE_PROJECT_ID
const databaseId = process.env.VITE_APPWRITE_DATABASE_ID
const progressCollection = process.env.VITE_APPWRITE_PROGRESS_COLLECTION_ID
const settingsCollection = process.env.VITE_APPWRITE_SETTINGS_COLLECTION_ID

async function run() {
  if (!endpoint || !project) {
    console.error('Missing VITE_APPWRITE_ENDPOINT or VITE_APPWRITE_PROJECT_ID in environment')
    process.exit(2)
  }

  const client = new Client().setEndpoint(endpoint).setProject(project)
  const databases = new Databases(client)

  console.log('Endpoint:', endpoint)
  console.log('Project:', project)

  try {
    if (databaseId) {
      console.log('Checking progress collection documents (first 5)')
      const res = await databases.listDocuments(databaseId, progressCollection, [], 5)
      console.log('progress.listDocuments OK, total:', res.total)
    } else {
      console.log('No VITE_APPWRITE_DATABASE_ID set; skipping listDocuments')
    }

    if (databaseId && settingsCollection) {
      console.log('Checking settings collection documents (first 5)')
      const res2 = await databases.listDocuments(databaseId, settingsCollection, [], 5)
      console.log('settings.listDocuments OK, total:', res2.total)
    }

    console.log('Appwrite connectivity test completed successfully')
  } catch (e) {
    console.error('Appwrite test failed:')
    console.error(e.toString())
    if (e.response) console.error('response:', e.response)
    process.exit(3)
  }
}

run()
