import { Client, Databases } from 'appwrite'

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT
const project = import.meta.env.VITE_APPWRITE_PROJECT_ID

let client = null
let databases = null

if (endpoint && project) {
  client = new Client().setEndpoint(endpoint).setProject(project)
  databases = new Databases(client)
}

export { client, databases }
