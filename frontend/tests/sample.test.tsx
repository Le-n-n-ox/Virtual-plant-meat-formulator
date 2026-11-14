import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("skeleton test setup", () => {
  it("renders a sample assertion", () => {
    render(<p>Test environment ready</p>);

    expect(screen.getByText("Test environment ready")).toBeInTheDocument();
  });
});
