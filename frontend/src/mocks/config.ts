/** Mock-mode flag. Kept free of browser-only imports so server components can read it. */
export function isMocksEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCKS === "true";
}
