export function formatLapTime(milliseconds: number | null | undefined): string {
  if (milliseconds == null || !Number.isFinite(milliseconds)) return "—";
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = (milliseconds % 60_000) / 1000;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

export function consistencyScore(lapTimesMs: number[]): number {
  if (lapTimesMs.length < 2) return 0;
  const sorted = [...lapTimesMs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 1;
  const deviations = sorted.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)] ?? 0;
  return Math.max(0, Math.min(100, 100 - (mad / median) * 2200));
}

export function downsampleIndices(length: number, maxPoints: number): number[] {
  if (length <= maxPoints) return Array.from({ length }, (_, index) => index);
  const step = (length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => Math.round(index * step));
}

export * from "./calibration";
