// basic setup for tests
import "@testing-library/jest-dom";

// mock fetch globally
if (!globalThis.fetch) {
  globalThis.fetch = () =>
    Promise.reject(new Error("fetch not implemented in test"));
}
