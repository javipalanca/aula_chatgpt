
import React from 'react';
import { Button } from '../ui';

export function DashboardHeader({ classData, onToggleActive, onDelete, onRestartGame }) {
  const meta = classData.meta || {};

  return (
    <div className="mb-2 flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-bold">{classData.name || classData.id}</h2>
        <div className="text-sm opacity-60">
          Código: <span className="font-mono">{classData.code || classData.id}</span>
        </div>
      </div>

      {meta.finished && (
        <div className="ml-4 flex items-center gap-3">
          <div className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg text-sm">Juego finalizado</div>
          <div>
            <button
              onClick={onRestartGame}
              className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
            >
              Reiniciar juego
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={onToggleActive} variant="ghost">Activar/Desactivar</Button>
        <Button onClick={onDelete} variant="destructive">Borrar</Button>
      </div>
    </div>
  );
}
