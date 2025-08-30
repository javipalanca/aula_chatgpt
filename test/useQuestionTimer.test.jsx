import React from "react";
import { render, act } from "@testing-library/react";
import { vi, describe, test, expect } from "vitest";
import useQuestionTimer from "../src/hooks/useQuestionTimer";

function TimerComp({ question }) {
  const { secondsLeft } = useQuestionTimer(question);
  return <div data-testid="s">{secondsLeft}</div>;
}

describe("useQuestionTimer", () => {
  test("starts countdown and decreases with time", async () => {
    vi.useFakeTimers();
    const { getByTestId } = render(<TimerComp question={{ duration: 3 }} />);
    // initial should be 3 after effect runs; flush microtasks
    await Promise.resolve();
    expect(getByTestId("s").textContent).toBe("3");

    // advance one second inside act so state updates flush
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    // now the secondsLeft should have decreased
    expect(getByTestId("s").textContent).toBe("2");
    vi.useRealTimers();
  });
});
