
import React from 'react';
import { ETHICS_SCENARIOS, VERIF_QUIZ, BAD_PROMPTS } from '../../lib/data';

// Helper to build preview blocks if they are not present in the class metadata
const buildPreviewBlocks = () => {
  const buildBlock = (id, name, items, mapper) => ({ id, name, questions: items.map(mapper) });
  const verifMapper = (v, idx) => ({ id: `q-verif-${idx}`, title: v.q, duration: v.duration || 30 });
  const ethicsMapper = (e, idx) => ({ id: `q-eth-${idx}`, title: e.text, duration: e.duration || 30 });
  const badMapper = (b, idx) => ({ id: `q-bad-${idx}`, title: b.bad, duration: b.duration || 30 });

  return [
    buildBlock('ETHICS', 'Escenarios éticos', ETHICS_SCENARIOS, ethicsMapper),
    buildBlock('VERIF', 'Verificación', VERIF_QUIZ, verifMapper),
    buildBlock('PROMPTS', 'Mejorar prompts', BAD_PROMPTS, badMapper),
  ];
};

export function Timeline({ classData, blockViewIndex, setBlockViewIndex, questionRunning, onJumpToQuestion, answeredQuestionIds }) {
  const currentMeta = classData.meta || {};
  const blocks = currentMeta.blocks ? currentMeta.blocks : buildPreviewBlocks();

  const blockIndex = typeof blockViewIndex === 'number'
    ? blockViewIndex
    : (typeof currentMeta.currentBlockIndex === 'number' ? currentMeta.currentBlockIndex : 0);

  const currentBlock = (blocks && blocks[blockIndex]) ? blocks[blockIndex] : blocks[0];
  const currentQuestions = (currentBlock && Array.isArray(currentBlock.questions)) ? currentBlock.questions : [];

  // Determine which questions have been launched
  let launchedUpTo = -1;
  if (currentMeta && typeof currentMeta.currentQuestionIndex === 'number' && typeof currentMeta.currentBlockIndex === 'number') {
    if (currentMeta.currentBlockIndex > blockIndex) {
      launchedUpTo = (currentQuestions.length || 0) - 1;
    } else if (currentMeta.currentBlockIndex === blockIndex) {
      launchedUpTo = currentMeta.currentQuestionIndex - 1;
    }
  }

  // Determine the index to display in the header
  let displayedIndex = 0;
  if (questionRunning && questionRunning.payload && Number(questionRunning.payload.blockIndex) === blockIndex && typeof questionRunning.payload.questionIndex === 'number') {
    displayedIndex = Number(questionRunning.payload.questionIndex);
  } else if (launchedUpTo >= 0) {
    displayedIndex = launchedUpTo;
  } else if (currentMeta && typeof currentMeta.currentQuestionIndex === 'number') {
    displayedIndex = Math.max(0, currentMeta.currentQuestionIndex - 1);
  }

  const displayedQuestionNumber = Math.min(Math.max(1, displayedIndex + 1), currentQuestions.length || 1);

  if (!currentBlock) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Bloque: {currentBlock.name}</div>
        <div className="text-xs opacity-60">
          Pregunta {displayedQuestionNumber} / {currentQuestions.length}
        </div>
      </div>

      {/* Block selector tabs */}
      <div className="flex gap-2 mb-3">
        {blocks.map((b, bi) => (
          <button
            key={b.id}
            onClick={() => setBlockViewIndex(bi)}
            className={`px-3 py-1 rounded text-sm ${bi === blockIndex ? 'bg-blue-600 text-white' : 'bg-white/5'}`}>
            {b.name}
          </button>
        ))}
      </div>

      {/* Horizontal timeline: numbered nodes with connecting line */}
      <div className="mt-4">
        <div className="relative">
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="h-0.5 bg-slate-500/30 rounded" />
          </div>
          <div className="relative z-10 overflow-x-auto py-2">
            <div className="flex items-center justify-between gap-4 px-2 w-full">
              {currentQuestions.map((q, i) => {
                const isActive = questionRunning && questionRunning.payload && Number(questionRunning.payload.blockIndex) === blockIndex && Number(questionRunning.payload.questionIndex) === i;
                // Prefer askedQuestions stored in class meta (server-authoritative). Fall back to answeredQuestionIds.
                const askedMap = (classData && classData.meta && classData.meta.askedQuestions) || {}
                const isAskedInMeta = !!askedMap[q.id]
                const isAnswered = isAskedInMeta || answeredQuestionIds.has(q.id);
                // Determine which question is the "next" to be launched according to class meta
                const meta = (classData && classData.meta) || {}
                const isNext = (typeof meta.currentBlockIndex === 'number' && Number(meta.currentBlockIndex) === blockIndex && typeof meta.currentQuestionIndex === 'number' && Number(meta.currentQuestionIndex) === i)
                const baseClasses = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shadow-sm transition-transform';
                // Visual priority: active (running) > next (halo) > answered (green) > default
                const colorClass = isActive
                  ? 'bg-yellow-400 text-black ring-2 ring-yellow-300 scale-105'
                  : isNext
                  ? 'bg-slate-700 text-white/90 ring-4 ring-blue-400/30 scale-105'
                  : isAnswered
                  ? 'bg-green-500 text-white'
                  : 'bg-slate-700 text-white/90';

                return (
                  <div key={q.id || i} className="flex flex-col items-center min-w-[36px] flex-1">
                    <button
                      title={q.title}
                      aria-label={q.title}
                      onClick={() => onJumpToQuestion(blockIndex, i)}
                      className={`${baseClasses} ${colorClass}`}>
                      {i + 1}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
