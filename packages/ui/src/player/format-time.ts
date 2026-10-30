/** Minutes and seconds, as 3:07. */
export function formatTime(timeUs: number): string {
  const seconds = Math.floor(timeUs / 1_000_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
