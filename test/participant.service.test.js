import { describe, it, expect, beforeEach, vi } from "vitest";
import ParticipantService from "../server/services/ParticipantService.js";

describe("ParticipantService", () => {
  let participantsRepo;
  let broadcast;
  let participantLastPersist;
  let participantLastBroadcast;
  let svc;

  beforeEach(() => {
    participantsRepo = {
      listConnected: vi.fn().mockResolvedValue([]),
      incScore: vi.fn().mockResolvedValue(true),
      upsert: vi.fn().mockResolvedValue(true),
      findOneById: vi.fn().mockResolvedValue(null),
      findOneByClassSession: vi.fn().mockResolvedValue(null),
      resetScores: vi.fn().mockResolvedValue(true),
      markDisconnected: vi.fn().mockResolvedValue(true),
    };
    broadcast = vi.fn();
    participantLastPersist = new Map();
    participantLastBroadcast = new Map();
    svc = new ParticipantService({
      participantsRepo,
      broadcast,
      participantLastPersist,
      participantLastBroadcast,
      options: { minPersistMs: 5000, minBroadcastMs: 2000 },
    });
  });

  it("saveParticipant skips writes when recent and not a score op", async () => {
    const payload = {
      id: "c1:s1",
      classId: "c1",
      sessionId: "s1",
      displayName: "A",
    };
    // simulate recent persist
    participantLastPersist.set("c1:s1", Date.now());
    const res = await svc.saveParticipant(payload);
    expect(res).toBeTruthy();
    expect(res.skipped).toBe(true);
    expect(participantsRepo.upsert).not.toHaveBeenCalled();
  });

  it("saveParticipant calls incScore when scoreDelta provided", async () => {
    const payload = {
      id: "c2:s2",
      classId: "c2",
      sessionId: "s2",
      scoreDelta: 7,
    };
    const res = await svc.saveParticipant(payload);
    expect(res.ok).toBe(true);
    expect(participantsRepo.incScore).toHaveBeenCalledWith("c2", "s2", 7);
  });

  it("handleSubscribe upserts participant and broadcasts participants-updated", async () => {
    participantsRepo.findOneById.mockResolvedValue(null);
    participantsRepo.listConnected.mockResolvedValue([
      { sessionId: "sX", displayName: "X" },
    ]);
    const result = await svc.handleSubscribe({
      classId: "cls1",
      sessionId: "sX",
      role: "student",
      displayName: "Tester",
    });
    expect(result.ok).toBe(true);
    expect(participantsRepo.upsert).toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalled();
    const call = broadcast.mock.calls.find(
      (c) => c[0] && c[0].type === "participants-updated",
    );
    expect(call).toBeTruthy();
  });

  it("handleDisconnect marks disconnected and broadcasts", async () => {
    participantsRepo.listConnected.mockResolvedValue([
      { sessionId: "sY", displayName: "Y" },
    ]);
    await svc.handleDisconnect("cls2", "sY");
    expect(participantsRepo.markDisconnected).toHaveBeenCalledWith(
      "cls2",
      "sY",
    );
    // should have broadcast participant-disconnected and participants-updated (two calls)
    const types = broadcast.mock.calls.map((c) => c[0] && c[0].type);
    expect(types).toContain("participant-disconnected");
    expect(types).toContain("participants-updated");
  });

  it("handlePing throttles heartbeat broadcast when recently broadcasted", async () => {
    // simulate participant already connected and recent broadcasts/persists
    participantsRepo.findOneByClassSession.mockResolvedValue({
      connected: true,
      displayName: "Z",
    });
    participantLastPersist.set("c3:s3", Date.now());
    participantLastBroadcast.set("c3:s3", Date.now());
    await svc.handlePing("c3", "s3");
    // no heartbeat broadcast because it was recently sent
    const types = broadcast.mock.calls.map((c) => c[0] && c[0].type);
    expect(types).not.toContain("participant-heartbeat");
  });

  it("handlePing broadcasts heartbeat when not throttled", async () => {
    participantsRepo.findOneByClassSession.mockResolvedValue({
      connected: true,
      displayName: "Z",
    });
    // ensure no recent broadcast
    participantLastBroadcast.delete("c4:s4");
    participantLastPersist.set("c4:s4", Date.now());
    await svc.handlePing("c4", "s4");
    const types = broadcast.mock.calls.map((c) => c[0] && c[0].type);
    expect(types).toContain("participant-heartbeat");
  });

  it("saveParticipant rejects when repo.upsert fails", async () => {
    participantsRepo.upsert.mockRejectedValue(new Error("DB fail"));
    const payload = {
      id: "err:1",
      classId: "err",
      sessionId: "1",
      displayName: "Err",
    };
    await expect(svc.saveParticipant(payload)).rejects.toThrow("DB fail");
  });

  it("handleSubscribe propagates repo error", async () => {
    participantsRepo.upsert.mockRejectedValue(new Error("Upsert fail"));
    await expect(
      svc.handleSubscribe({
        classId: "cE",
        sessionId: "sE",
        role: "student",
        displayName: "E",
      }),
    ).rejects.toThrow("Upsert fail");
  });

  it("handlePing triggers upsert when lastPersist expired", async () => {
    participantsRepo.findOneByClassSession.mockResolvedValue({
      connected: true,
      displayName: "Old",
    });
    // set lastPersist to old timestamp so update is allowed
    participantLastPersist.set("c5:s5", Date.now() - 15000);
    await svc.handlePing("c5", "s5");
    expect(participantsRepo.upsert).toHaveBeenCalled();
  });
});
