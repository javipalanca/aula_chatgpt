import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { vi, describe, test, expect } from "vitest";

// Mock storage and realtime helpers used by StudentView
vi.mock("../src/lib/storage", () => ({
  getSessionId: () => "sess-x",
  listClassParticipants: vi.fn(async () => []),
  joinClass: vi.fn(async () => {}),
  startHeartbeat: vi.fn(() => {}),
  stopHeartbeat: vi.fn(() => {}),
  leaveClass: vi.fn(async () => {}),
  submitAnswer: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../src/hooks/useRealtime", () => ({ default: () => {} }));

import StudentView from "../src/pages/StudentView";

describe("StudentView basic render and answer flow", () => {
  test("renders waiting view and allows back click", () => {
    const onBack = vi.fn();
    const { getAllByText } = render(
      <StudentView classCode="C" displayName="D" onBack={onBack} />,
    );
    const matches = getAllByText("Volver");
    // pick the button inside the waiting panel (last one in the DOM here)
    const btn = matches[matches.length - 1];
    fireEvent.click(btn);
    expect(onBack).toHaveBeenCalled();
  });

  test("basic mount", () => {
    render(<StudentView classCode="C" displayName="D" onBack={() => {}} />);
    expect(true).toBe(true);
  });
});
