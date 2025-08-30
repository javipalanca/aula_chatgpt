import React from "react";
import { Button } from "../../ui";
import { Bar } from "react-chartjs-2";

// Chart options can be defined outside as they are static
const rankingOptions = {
  maintainAspectRatio: false,
  responsive: true,
  animation: { duration: 900, easing: "easeOutQuart" },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}` },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { maxRotation: 40, minRotation: 0 } },
    y: { beginAtZero: true, ticks: { stepSize: 1 } },
  },
};

export function ScoresOverlay({ show, onClose, participants }) {
  if (!show) return null;

  const sortedParticipants = (participants || [])
    .slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  const top10 = sortedParticipants.slice(0, 10);
  const rankingLabels = top10.map((p) => p.displayName);
  const rankingValues = top10.map((p) => p.score || 0);
  const palette = [
    "#EF4444",
    "#F59E0B",
    "#10B981",
    "#3B82F6",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#F97316",
    "#6366F1",
    "#14B8A6",
  ];
  const rankingColors = top10.map((_, i) =>
    i === 0
      ? "#FFD700"
      : i === 1
        ? "#C0C0C0"
        : i === 2
          ? "#CD7F32"
          : palette[i % palette.length],
  );

  const rankingData = {
    labels: rankingLabels,
    datasets: [
      {
        label: "Puntos",
        data: rankingValues,
        backgroundColor: rankingColors,
        borderRadius: 8,
        barPercentage: 0.72,
      },
    ],
  };

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-xl p-6 max-w-2xl w-full">
        <h3 className="text-xl font-bold mb-3">Puntuaciones acumuladas</h3>
        <div className="w-full">
          <div className="mb-4 w-full overflow-x-auto">
            <div
              className="flex gap-3 items-stretch"
              style={{ minWidth: 420, whiteSpace: "nowrap" }}
            >
              {sortedParticipants.slice(0, 3).map((p, i) => (
                <div
                  key={p.sessionId || i}
                  className="text-center p-3 rounded-lg shadow-lg inline-block"
                  style={{
                    background:
                      i === 0
                        ? "linear-gradient(135deg,#FFD54A,#FFD700)"
                        : i === 1
                          ? "linear-gradient(135deg,#E0E0E0,#C0C0C0)"
                          : "linear-gradient(135deg,#D4A373,#CD7F32)",
                    width: 220,
                    minWidth: 120,
                  }}
                >
                  <div className="text-4xl">
                    {i === 0 ? "👑" : i === 1 ? "🥈" : "🥉"}
                  </div>
                  <div className="font-bold mt-2 text-lg truncate">
                    {p.displayName}
                  </div>
                  <div className="text-sm opacity-80">{p.score || 0} pts</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 260 }}>
            {participants.length === 0 ? (
              <p className="text-sm text-slate-600">Sin participantes</p>
            ) : (
              <Bar options={rankingOptions} data={rankingData} />
            )}
          </div>
          <div className="mt-4 space-y-2 max-h-40 overflow-auto">
            {sortedParticipants.map((p) => (
              <div
                key={p.sessionId}
                className="flex justify-between items-center p-2 border rounded"
              >
                <div className="font-semibold">{p.displayName}</div>
                <div className="font-bold">{p.score || 0}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose} variant="ghost">
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
