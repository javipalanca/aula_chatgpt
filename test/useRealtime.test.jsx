import { describe, test, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

// Mock storage initRealtime/subscription to ensure no real WS
vi.mock("../src/lib/storage", () => ({
  initRealtime: vi.fn(),
  subscribeToClass: vi.fn(),
  unsubscribeFromClass: vi.fn(),
  getSessionId: () => "s1",
}));
import useRealtime from "../src/hooks/useRealtime";

function TestComp({ classCode }) {
  // use a noop handler; useRealtime should mount/unmount cleanly
  useRealtime(classCode, () => {});
  return <div data-testid="ok">ok</div>;
}

describe("useRealtime hook basic", () => {
  test("mounts without error", () => {
    const { getByTestId } = render(<TestComp classCode="C" />);
    expect(getByTestId("ok").textContent).toBe("ok");
  });
});
