const SPEEDS = [0.75, 1, 1.25, 1.5];

/** The next playback speed in the cycle, wrapping around after the last. */
export const nextRate = (rate: number) =>
  SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
