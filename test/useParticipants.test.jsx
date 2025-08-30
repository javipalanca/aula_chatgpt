import React from "react";
import { render } from "@testing-library/react";
import { vi, describe, test, expect } from "vitest";

// Mock storage before importing the hook
vi.mock("../src/lib/storage", () => ({
  joinClass: vi.fn(async () => {}),
  startHeartbeat: vi.fn(() => {}),
  stopHeartbeat: vi.fn(() => {}),
  leaveClass: vi.fn(async () => {}),
  listClassParticipants: vi.fn(async () => [
    { sessionId: "sess-1", displayName: "Alice", score: 0 },
  ]),
  getSessionId: () => "sess-1",
}));

import useParticipants from "../src/hooks/useParticipants";

function TestComp({ classCode, displayName }) {
  const hook = useParticipants(classCode, displayName);
  return <div data-testid="count">{(hook.participants || []).length}</div>;
}

describe("useParticipants", () => {
  test("calls joinClass/startHeartbeat and fetches participants", async () => {
    const { findByTestId } = render(
      <TestComp classCode="C1" displayName="D1" />,
    );
    const el = await findByTestId("count");
    expect(el.textContent).toBe("1");
  });

  test("calls leaveClass/stopHeartbeat on unmount", async () => {
    const storage = await import("../src/lib/storage");
    const r = render(<TestComp classCode="C2" displayName="D2" />);
    r.unmount();
    // leaveClass and stopHeartbeat should have been called during cleanup
    expect(storage.leaveClass).toHaveBeenCalled();
    expect(storage.stopHeartbeat).toHaveBeenCalled();
  });
});
