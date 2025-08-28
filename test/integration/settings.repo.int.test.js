import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { connectDb, closeDb } from '../../server/lib/db.js'
import SettingsRepo from '../../server/repositories/SettingsRepo.js'

let mongod

describe('SettingsRepo integration (mongodb-memory-server)', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    const uri = mongod.getUri()
    await connectDb({ uri, dbName: 'testdb' })
  })

  afterAll(async () => {
    await closeDb()
    if (mongod) await mongod.stop()
  })

  it('upsert and findById against real mongo', async () => {
    const repo = new SettingsRepo()
    await repo.upsert({ id: 's-int-1', data: { theme: 'dark' } })
    const d = await repo.findById('s-int-1')
    expect(d).not.toBeNull()
    expect(d.data.theme).toBe('dark')
  })
})
