import React from "react";
import { Button } from "../ui";

export function DashboardHeader({
  classData,
  onDelete,
  onRestartGame,
  onExit,
  onShowCode,
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-bold">{classData.name || classData.id}</h2>
        <div className="text-sm opacity-60">
          Código:{" "}
          <span className="font-mono">{classData.code || classData.id}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={onRestartGame}>Reiniciar juego</Button>
        <Button onClick={onDelete} variant="destructive">
          Borrar
        </Button>
        <Button
          onClick={() =>
            onShowCode && onShowCode(classData.code || classData.id)
          }
          variant="outline"
        >
          Mostrar código
        </Button>
        <Button onClick={onExit} variant="ghost">
          Salir
        </Button>
      </div>
    </div>
  );
}
