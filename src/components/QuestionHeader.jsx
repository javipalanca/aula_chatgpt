import React from "react";
import { Button } from "./ui";
import ParticipantsBadge from "./ParticipantsBadge";

export default function QuestionHeader({
  classCode,
  displayName,
  score,
  onShowScores,
}) {
  return (
    <div className="mb-6">
      <div className="text-sm opacity-60">
        Clase: <span className="font-mono">{classCode}</span>
      </div>
      <div className="text-2xl font-bold mt-2">{displayName || "Alumno"}</div>
      <div className="mt-2 flex items-center justify-center gap-4">
        <ParticipantsBadge score={score} onShow={onShowScores} />
      </div>
    </div>
  );
}
