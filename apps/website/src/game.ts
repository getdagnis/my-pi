import { PI_DIGITS } from "./pi-digits";

export const HINT_COUNT = 3;
export const MAX_MISTAKES = 5;
export const HINT_LENGTH = 10;
export const HINT_DURATION_MS = 3_000;
export const BEST_SCORE_KEY = "remember-pi-best";
export const LOCKED_SEQUENCE_KEY = "remember-pi-locked-sequence";
export const PLAYABLE_DIGITS = PI_DIGITS.slice(0, 100);

export type GameState = {
  score: number;
  mistakes: number;
  hintsLeft: number;
  startedAt: number | null;
  completedAt: number | null;
  hintUntil: number | null;
  personalBest: number;
  runBest: number;
  celebrationUntil: number | null;
  mistakeUntil: number | null;
  lockedSequence: number;
  cleanChunks: number;
  cleanChunkEligible: boolean;
  pendingLockedSequence: number | null;
  lockUpdateAt: number | null;
  prefixEntered: boolean;
};

export function createGame(personalBest = 0, lockedSequence = 0): GameState {
  return {
    score: lockedSequence,
    mistakes: 0,
    hintsLeft: HINT_COUNT,
    startedAt: null,
    completedAt: null,
    hintUntil: null,
    personalBest,
    runBest: personalBest,
    celebrationUntil: null,
    mistakeUntil: null,
    lockedSequence,
    cleanChunks: 0,
    cleanChunkEligible: true,
    pendingLockedSequence: null,
    lockUpdateAt: null,
    prefixEntered: false,
  };
}

export function submitDigit(game: GameState, digit: string, now: number): GameState {
  if (game.completedAt !== null) return game;
  if (game.score === 0 && digit === ".") {
    return { ...game, startedAt: game.startedAt ?? now, prefixEntered: true };
  }
  if (!/^\d$/.test(digit)) return game;
  const startedAt = game.startedAt ?? now;
  if (game.score >= PLAYABLE_DIGITS.length) {
    return { ...game, startedAt };
  }
  if (game.score === 0 && digit === "3") {
    return { ...game, startedAt, prefixEntered: true };
  }

  if (digit !== PLAYABLE_DIGITS[game.score]) {
    const mistakes = game.mistakes + 1;
    return {
      ...game,
      startedAt,
      mistakes,
      mistakeUntil: now + 700,
      completedAt: mistakes >= MAX_MISTAKES ? now : game.completedAt,
      cleanChunks: 0,
      cleanChunkEligible: false,
    };
  }

  const score = game.score + 1;
  const personalBest = Math.max(game.personalBest, score);
  const beatsRunBest = game.celebrationUntil === null && score > game.runBest;
  const reachedChunk = score % 10 === 0;
  const cleanChunks = reachedChunk
    ? game.cleanChunkEligible
      ? game.cleanChunks + 1
      : 0
    : game.cleanChunks;
  const shouldLock =
    reachedChunk &&
    game.cleanChunkEligible &&
    cleanChunks > 0 &&
    cleanChunks % 2 === 0 &&
    score > game.lockedSequence;
  const restoredMiss = shouldLock && game.mistakes > 0;
  return {
    ...game,
    startedAt,
    score,
    mistakes: restoredMiss ? game.mistakes - 1 : game.mistakes,
    completedAt: score === PLAYABLE_DIGITS.length ? now : game.completedAt,
    prefixEntered: false,
    personalBest,
    celebrationUntil: beatsRunBest ? now + 2_200 : game.celebrationUntil,
    cleanChunks,
    cleanChunkEligible: reachedChunk ? true : game.cleanChunkEligible,
    pendingLockedSequence: shouldLock ? score : game.pendingLockedSequence,
    lockUpdateAt: shouldLock ? now + 900 : game.lockUpdateAt,
  };
}

export function revealHint(game: GameState, now: number): GameState {
  if (
    game.completedAt !== null ||
    game.hintsLeft === 0 ||
    (game.hintUntil !== null && now < game.hintUntil)
  )
    return game;
  return {
    ...game,
    startedAt: game.startedAt ?? now,
    hintsLeft: game.hintsLeft - 1,
    hintUntil: now + HINT_DURATION_MS,
    cleanChunks: 0,
    cleanChunkEligible: false,
  };
}

export function finalizeLockedSequence(game: GameState, now: number): GameState {
  if (
    game.lockUpdateAt === null ||
    now < game.lockUpdateAt ||
    game.pendingLockedSequence === null
  ) {
    return game;
  }
  return {
    ...game,
    lockedSequence: Math.max(game.lockedSequence, game.pendingLockedSequence),
    pendingLockedSequence: null,
    lockUpdateAt: null,
  };
}

export function resetLockedSequence(game: GameState): GameState {
  return {
    ...game,
    lockedSequence: 0,
    pendingLockedSequence: null,
    lockUpdateAt: null,
    cleanChunks: 0,
    cleanChunkEligible: true,
  };
}

export function setLockedSequence(game: GameState, sequence: number): GameState {
  const lockedSequence = Math.min(PLAYABLE_DIGITS.length - 1, Math.max(0, Math.floor(sequence)));
  return {
    ...game,
    lockedSequence,
    pendingLockedSequence: null,
    lockUpdateAt: null,
    cleanChunks: 0,
    cleanChunkEligible: true,
  };
}

export function hintedDigits(game: GameState, now: number): string {
  if (game.hintUntil === null || now >= game.hintUntil) return "";
  return PI_DIGITS.slice(game.score, game.score + HINT_LENGTH);
}

export function readBest(storage: Pick<Storage, "getItem">): number {
  try {
    const value = Number(storage.getItem(BEST_SCORE_KEY));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export function saveBest(storage: Pick<Storage, "setItem">, score: number): void {
  try {
    storage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // The current run remains playable when browser storage is unavailable.
  }
}

export function readLockedSequence(storage: Pick<Storage, "getItem">): number {
  try {
    const value = Number(storage.getItem(LOCKED_SEQUENCE_KEY));
    return Number.isInteger(value) && value >= 0 && value < PLAYABLE_DIGITS.length ? value : 0;
  } catch {
    return 0;
  }
}

export function saveLockedSequence(storage: Pick<Storage, "setItem">, sequence: number): void {
  try {
    const value = Math.min(PLAYABLE_DIGITS.length - 1, Math.max(0, Math.floor(sequence)));
    storage.setItem(LOCKED_SEQUENCE_KEY, String(value));
  } catch {
    // The current run remains playable when browser storage is unavailable.
  }
}
