import { describe, it, expect, beforeEach, vi } from "vitest";
import SettingsService from "../server/services/SettingsService.js";

describe("SettingsService", () => {
  let settingsRepo;
  let svc;

  beforeEach(() => {
    settingsRepo = {
      findById: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(true),
    };
    svc = new SettingsService({ settingsRepo });
  });

  it("getSettings returns null when no id", async () => {
    const res = await svc.getSettings(null);
    expect(res).toBeNull();
  });

  it("getSettings returns document", async () => {
    settingsRepo.findById.mockResolvedValue({ id: "s1", data: { x: 1 } });
    const res = await svc.getSettings("s1");
    expect(settingsRepo.findById).toHaveBeenCalledWith("s1");
    expect(res).toHaveProperty("data");
  });

  it("upsertSettings calls repo.upsert", async () => {
    await svc.upsertSettings("s2", { a: 1 });
    expect(settingsRepo.upsert).toHaveBeenCalledWith({
      id: "s2",
      data: { a: 1 },
    });
  });
});
