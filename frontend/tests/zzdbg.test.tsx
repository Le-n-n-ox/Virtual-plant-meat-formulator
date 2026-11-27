import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { stubMatchMedia } from "./_matchMedia";
import { useIsMobile } from "@/hooks/use-mobile";

function Probe() {
  const isMobile = useIsMobile();
  return <span data-testid="p">{String(isMobile)}</span>;
}

describe("dbg", () => {
  it("reports width", () => {
    stubMatchMedia();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 390,
    });
    console.log("innerWidth =", window.innerWidth);
    console.log("matchMedia =", typeof window.matchMedia);
    const { getByTestId } = render(<Probe />);
    console.log("isMobile =", getByTestId("p").textContent);
    expect(true).toBe(true);
    vi.unstubAllGlobals();
  });
});
