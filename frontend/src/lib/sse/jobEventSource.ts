/** Planned SSE wrapper; real connection handling starts in a later phase. */

export function connect(jobId: string): void {
  void jobId;
  // TODO: request a stream token before connecting.
}

export function disconnect(): void {
  // TODO: close the active EventSource when SSE support is implemented.
}
