/* eslint-env node */
export default class SettingsService {
  constructor({ settingsRepo } = {}) {
    this.settingsRepo = settingsRepo
  }

  async getSettings(id) {
    if (!id) return null
    return this.settingsRepo.findById(id)
  }

  async upsertSettings(id, data) {
    if (!id) throw new Error('id required')
    await this.settingsRepo.upsert({ id, data })
    return { ok: true }
  }
}
