
/*
  TeacherDashboard.jsx

  Este archivo contiene el componente React que implementa la interfaz de
  profesor/profesora para gestionar una clase en tiempo real.

  Tras la refactorización, este componente actúa como un "controlador" o
  "orquestador". Mantiene todo el estado y la lógica de negocio (en hooks
  y manejadores de eventos), pero delega el renderizado de la UI a
  componentes hijos más pequeños y especializados que se encuentran en
  `src/components/dashboard`.
*/
import React from 'react'
import { FancyCard } from '../components/ui'
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
import { ClassSelector } from '../components/dashboard/ClassSelector'
import { DashboardHeader } from '../components/dashboard/DashboardHeader'
import { Timeline } from '../components/dashboard/Timeline'
import { QuestionControl } from '../components/dashboard/QuestionControl'
import { ParticipantsPanel } from '../components/dashboard/ParticipantsPanel'
import { CodeModal } from '../components/dashboard/modals/CodeModal'
import { ScoresOverlay } from '../components/dashboard/modals/ScoresOverlay'
import { FinalWinnersModal } from '../components/dashboard/modals/FinalWinnersModal'
import useTeacherDashboard from '../hooks/useTeacherDashboard'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

export default function TeacherDashboard() {
  const state = useTeacherDashboard()

  const {
    classes,
    selected,
    setSelected,
    questionRunning,
    lastQuestionResults,
    showScoresOverlay,
    setShowScoresOverlay,
    secondsLeft,
    selectedCorrect,
    participants,
    liveAnswers,
    showCodeModal,
    setShowCodeModal,
    codeToShow,
    blockViewIndex,
    setBlockViewIndex,
    showFinalModal,
    finalWinners,
    showNextBlockButton,
    showFinishGameButton,
    answeredQuestionIds,
  selectedClassData,

  // actions
    handleRevealAction,
    handleCreateClass,
    handleDeleteClass,
    handleToggleActiveClass,
    handleRestartGame,
    handleNextBlock,
    handleFinishGame,
    handleShowCode,
    handleLaunch,
    jumpToQuestion,
  setShowFinalModal,
  } = state
  

  if (!selected || !selectedClassData) {
    return (
      <ClassSelector
        classes={classes}
        onSelectClass={setSelected}
        onCreateClass={handleCreateClass}
        onDeleteClass={handleDeleteClass}
        onToggleActiveClass={handleToggleActiveClass}
        onShowCode={handleShowCode}
      />
    );
  }

  return (
    <div className="p-4">
      
      <DashboardHeader 
        classData={selectedClassData}
        questionRunning={questionRunning}
        onToggleActive={() => handleToggleActiveClass(selected)}
        onDelete={() => handleDeleteClass(selected)}
        onRestartGame={handleRestartGame}
  onExit={() => setSelected(null)}
  onShowCode={handleShowCode}
      />

      <FancyCard className="p-6 mt-4">
        <div className="flex flex-col md:flex-row md:items-start md:gap-6">
          <div className="flex-1">
            <Timeline 
                classData={selectedClassData}
                blockViewIndex={blockViewIndex}
                setBlockViewIndex={setBlockViewIndex}
                questionRunning={questionRunning}
                onJumpToQuestion={jumpToQuestion}
                answeredQuestionIds={answeredQuestionIds}
              />
            <QuestionControl 
              questionRunning={questionRunning}
              secondsLeft={secondsLeft}
              liveAnswers={liveAnswers}
              lastQuestionResults={lastQuestionResults}
              selectedCorrect={selectedCorrect}
              onLaunch={handleLaunch}
              onReveal={handleRevealAction}
              onShowScores={() => setShowScoresOverlay(true)}
              showNextBlockButton={showNextBlockButton}
              showFinishGameButton={showFinishGameButton}
              onNextBlock={handleNextBlock}
              onFinishGame={handleFinishGame}
            />
          </div>
          <ParticipantsPanel participants={participants} />
        </div>
      </FancyCard>

      <CodeModal 
        show={showCodeModal}
        onClose={() => setShowCodeModal(false)}
        code={codeToShow}
      />
      <ScoresOverlay 
        show={showScoresOverlay}
        onClose={() => setShowScoresOverlay(false)}
        participants={participants}
      />
      <FinalWinnersModal 
        show={showFinalModal}
        onClose={() => setShowFinalModal(false)}
        winners={finalWinners}
        onRestart={handleRestartGame}
      />
    </div>
  );
}
