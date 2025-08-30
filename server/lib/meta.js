export function getDefaultMeta() {
  return {
    currentBlockIndex: 0,
    currentQuestionIndex: 0,
    finished: false,
    startedAt: null,
    askedQuestions: {},
    revealedQuestions: {},
    mode: "lobby",
    timer: null,
  };
}
