import React, { useState } from "react";
import { clsx } from "../ui";

export function ParticipantsPanel({ participants }) {
  const [showParticipantsList, setShowParticipantsList] = useState(true);

  if (!showParticipantsList) {
    return (
      <div className="w-full md:w-14 mt-6 md:mt-0 flex items-start justify-end">
        <button
          className="text-sm text-slate-600"
          onClick={() => setShowParticipantsList(true)}
        >
          Mostrar participantes
        </button>
      </div>
    );
  }

  return (
    <div className="w-full md:w-72 mt-6 md:mt-0">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="font-semibold">Participantes</h4>
        <button
          className="text-sm text-slate-600"
          onClick={() => setShowParticipantsList(false)}
        >
          Ocultar
        </button>
      </div>
      <div className="mb-4">
        <div className="mt-3 space-y-2 max-h-72 overflow-auto">
          {participants
            .slice()
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .map((p) => (
              <div
                key={p.sessionId}
                className={clsx(
                  "p-2 rounded border flex items-center justify-between",
                  p.connected === false ? "bg-red-50 opacity-60" : "bg-white/5",
                )}
              >
                <div className="font-semibold">
                  {p.displayName}
                  {p.connected === false && (
                    <span className="ml-2 text-xs text-red-600">
                      (desconectado)
                    </span>
                  )}
                </div>
                <div className="font-bold">{p.score || 0}</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
