import 'dotenv/config'
import { Client, Databases } from 'appwrite'

const endpoint = process.env.VITE_APPWRITE_ENDPOINT
const project = process.env.VITE_APPWRITE_PROJECT_ID
const databaseId = process.env.VITE_APPWRITE_DATABASE_ID
const progressCollection = process.env.VITE_APPWRITE_PROGRESS_COLLECTION_ID

async function run() {
    if (!endpoint || !project) {
        console.error('Missing VITE_APPWRITE_ENDPOINT or VITE_APPWRITE_PROJECT_ID in environment')
        process.exit(2)
    }

    const client = new Client().setEndpoint(endpoint).setProject(project)
    const databases = new Databases(client)

    try {
        const res = await databases.listDocuments(databaseId, progressCollection, [], 5)
        console.log('listDocuments OK, total:', res.total)
    } catch (e) {
        console.error('listDocuments failed:')
        console.error(e.toString())
        if (e.response) console.error('response:', e.response)
        process.exit(3)
    }
}

run()