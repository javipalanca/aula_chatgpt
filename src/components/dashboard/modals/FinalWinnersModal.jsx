import React from "react";
import { Button } from "../../ui";

export function FinalWinnersModal({ show, onClose, winners, onRestart }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-90 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-2xl p-8 max-w-4xl w-full text-center shadow-2xl">
        <div className="text-4xl font-extrabold mb-4">¡Fin del juego!</div>
        <div className="mb-6 text-lg opacity-70">
          Top 3 — Felicidades a los mejores participantes
        </div>
        <div className="flex items-center justify-center gap-6 mb-6">
          {winners.length === 0 ? (
            <div className="text-sm opacity-60">No hay participantes</div>
          ) : (
            winners.map((p, i) => (
              <div
                key={p.sessionId || i}
                className={`p-6 rounded-lg text-center shadow-lg transform ${
                  i === 0
                    ? "scale-110 bg-gradient-to-br from-yellow-300 to-yellow-400"
                    : i === 1
                      ? "bg-gray-200"
                      : "bg-yellow-100"
                }`}
                style={{ width: 200 }}
              >
                <div className="text-5xl mb-2">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                </div>
                <div className="font-bold text-lg truncate">
                  {p.displayName}
                </div>
                <div className="text-sm opacity-80">{p.score || 0} pts</div>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-center gap-4">
          <Button onClick={onClose} variant="primary">
            Cerrar
          </Button>
          <Button onClick={onRestart} variant="ghost">
            Reiniciar juego
          </Button>
        </div>
      </div>
    </div>
  );
}
