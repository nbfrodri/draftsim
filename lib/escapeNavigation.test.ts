import { describe, expect, it, vi } from "vitest";
import { createEscapeStack } from "./escapeNavigation";
const key = (extra = {}) => ({ key: "Escape", defaultPrevented: false, isComposing: false, repeat: false, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), ...extra });
describe("Escape layers", () => {
  it("dismisses one top layer, then returns to its parent after unregistering", () => {
    const stack = createEscapeStack(); const page = vi.fn(), modal = vi.fn(), popup = vi.fn();
    stack.register({ dismiss: page, priority: 0 }); stack.register({ dismiss: modal, priority: 100 });
    const unregister = stack.register({ dismiss: popup, priority: 200 });
    const event = key(); stack.dispatch(event);
    expect(popup).toHaveBeenCalledTimes(1); expect(modal).not.toHaveBeenCalled(); expect(page).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    unregister(); stack.dispatch(key()); expect(modal).toHaveBeenCalledOnce();
  });
  it("uses the newest layer at equal priority and respects blockers", () => {
    const stack = createEscapeStack(); const older = vi.fn(), newer = vi.fn();
    stack.register({ dismiss: older, priority: 100 }); stack.register({ dismiss: newer, priority: 100 });
    stack.dispatch(key()); expect(newer).toHaveBeenCalledOnce(); expect(older).not.toHaveBeenCalled();
    stack.register({ dismiss: () => {}, priority: 1000 }); stack.dispatch(key()); expect(newer).toHaveBeenCalledOnce();
  });
  it("ignores composition, handled events and held keys", () => {
    const stack = createEscapeStack(); const close = vi.fn(); stack.register({ dismiss: close, priority: 0 });
    for (const extra of [{ isComposing: true }, { defaultPrevented: true }, { repeat: true }, { key: "Enter" }]) stack.dispatch(key(extra));
    expect(close).not.toHaveBeenCalled();
  });
});
