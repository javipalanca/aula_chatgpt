export default class ProgressService {
  constructor({ progressRepo } = {}) {
    this.progressRepo = progressRepo;
  }

  async get(id) {
    if (!id) return null;
    return this.progressRepo.findById(id);
  }

  async upsert(id, data = {}) {
    if (!id) throw new Error("id required");
    await this.progressRepo.upsert({ id, data, updated_at: new Date() });
    return { ok: true };
  }
}
