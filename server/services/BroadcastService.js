/* eslint-env node */
// Encapsulates WebSocket client bookkeeping and publishing
export default class BroadcastService {
  constructor({ logger = console } = {}) {
    this.wsClients = new Set();
    // classId -> Set(ws)
    this.classSubs = new Map();
    // ws -> Set(classId)
    this.wsToClasses = new Map();
    this.logger = logger;
  }

  registerClient(ws) {
    this.wsClients.add(ws);
  }

  unregisterClient(ws) {
    // remove from class subscriptions
    const set = this.wsToClasses.get(ws);
    if (set) {
      for (const cid of set) {
        const s = this.classSubs.get(cid);
        if (s) s.delete(ws);
        if (s && s.size === 0) this.classSubs.delete(cid);
      }
      this.wsToClasses.delete(ws);
    }
    this.wsClients.delete(ws);
  }

  subscribe(ws, classId) {
    if (!this.classSubs.has(classId)) this.classSubs.set(classId, new Set());
    this.classSubs.get(classId).add(ws);
    if (!this.wsToClasses.has(ws)) this.wsToClasses.set(ws, new Set());
    this.wsToClasses.get(ws).add(classId);
  }

  unsubscribe(ws, classId) {
    const set = this.classSubs.get(classId);
    if (set) set.delete(ws);
    const wsSet = this.wsToClasses.get(ws);
    if (wsSet) {
      wsSet.delete(classId);
      if (wsSet.size === 0) this.wsToClasses.delete(ws);
    }
  }

  publish(data, targetClassId) {
    const raw = JSON.stringify(data);
    let targets = [];
    if (targetClassId) {
      const set = this.classSubs.get(targetClassId);
      if (set && set.size) targets = Array.from(set);
    } else {
      targets = Array.from(this.wsClients);
    }
    try {
      // Helpful debug log for heartbeat/participants broadcasts as well
      try {
        if (data && data.type != "participant-heartbeat") {
          this.logger.debug &&
            this.logger.debug("BroadcastService.publish", {
              type: data && data.type,
              classId: targetClassId,
              targets: targets.length,
            });
        }
      } catch (e) {
        /* ignore logger errors */
      }
      if (
        data &&
        (data.type === "question-results" || data.type === "question-launched")
      )
        this.logger.log(
          "Broadcasting",
          data.type,
          "for class",
          targetClassId,
          "to",
          targets.length,
          "sockets",
        );
    } catch (e) {
      /* ignore logger errors */
    }
    for (const s of targets) {
      try {
        s.send(raw);
      } catch (e) {
        try {
          this.logger.warn("ws send failed", e);
        } catch (er) {
          /* ignore */
        }
      }
    }
  }
}
