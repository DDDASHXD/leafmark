export const PROP_CHANGE_DURATION = 0.35;
export const PROP_CHANGE_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export const READOUT_TRANSITION = { duration: 300 };

export const STEP_SNAP_DURATION = 0.08;
export const STEP_SNAP_EASE: [number, number, number, number] = [0, 0.55, 0.45, 1];

export const reservedChars = (
  min: number,
  max: number,
  step: number,
  format?: (n: number) => string,
): number => {
  const sample = (n: number): string => {
    if (format) return format(n);
    const stepStr = String(step);
    const decimals = stepStr.includes(".") ? stepStr.split(".")[1].length : 0;
    return decimals > 0 ? n.toFixed(decimals) : String(n);
  };
  return Math.max(sample(min).length, sample(max).length);
};

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
