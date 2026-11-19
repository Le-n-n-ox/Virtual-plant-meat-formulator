"use client";

import { Component, type ReactNode } from "react";

/** Falls back (to the 2D view) if the WebGL scene throws, e.g. context loss. */
export class SceneErrorBoundary extends Component<
  {
    fallback: ReactNode; /** Names the subtree in the console, e.g. "Scene asset …". */
    label?: string;
    children: ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(
      `${this.props.label ?? "3D scene"} failed; showing the fallback.`,
      error,
    );
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
