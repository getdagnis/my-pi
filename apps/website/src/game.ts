import { PI_DIGITS } from "./pi-digits";

export const HINT_COUNT = 3;
export const MAX_MISTAKES = 5;
export const HINT_LENGTH = 10;
export const HINT_DURATION_MS = 3_000;
export const MISTAKE_FEEDBACK_MS = 200;
export const MISTAKE_OVERLAY_MS = 240;
export const BEST_SCORE_KEY = "remember-pi-best";
export const LOCKED_SEQUENCE_KEY = "remember-pi-locked-sequence";
export const PENDING_SEQUENCE_KEY = "remember-pi-pending-sequence";
export const PLAYABLE_DIGITS = PI_DIGITS;
export const INITIAL_VISIBLE_DIGITS = 100;
export const INITIAL_VISIBLE_DIGITS_MOBILE = 60;
export const SEQUENCE_LENGTH = 20;

export function visibleDigitCount(score: number, digitsPerRow: number): number {
  const rowSize = Math.max(1, Math.floor(digitsPerRow));
  const initialVisibleDigits =
    rowSize === 10 ? INITIAL_VISIBLE_DIGITS_MOBILE : INITIAL_VISIBLE_DIGITS;
  const activeRow = Math.floor(Math.max(0, score) / rowSize);
  const nextRowEnd = (activeRow + 2) * rowSize;
  return Math.min(PLAYABLE_DIGITS.length, Math.max(initialVisibleDigits, nextRowEnd));
}

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
  mistakeOverlayUntil: number | null;
  mistakeDigit: string | null;
  lockedSequence: number;
  cleanChunks: number;
  cleanChunkEligible: boolean;
  pendingLockedSequence: number | null;
  lockUpdateAt: number | null;
  prefixEntered: boolean;
  prefixThreeEntered: boolean;
  prefixDecimalEntered: boolean;
  runStart: number;
  pendingCleanSequence: number | null;
};

export function createGame(
  personalBest = 0,
  lockedSequence = 0,
  pendingCleanSequence: number | null = null,
): GameState {
  const cleanSequence =
    pendingCleanSequence !== null &&
    pendingCleanSequence > lockedSequence &&
    pendingCleanSequence < PLAYABLE_DIGITS.length
      ? pendingCleanSequence
      : null;
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
    mistakeOverlayUntil: null,
    mistakeDigit: null,
    lockedSequence,
    cleanChunks: 0,
    cleanChunkEligible: true,
    pendingLockedSequence: null,
    lockUpdateAt: null,
    prefixEntered: false,
    prefixThreeEntered: false,
    prefixDecimalEntered: false,
    runStart: lockedSequence,
    pendingCleanSequence: cleanSequence,
  };
}

export function submitDigit(game: GameState, digit: string, now: number): GameState {
  if (game.completedAt !== null) return game;
  if (game.score === 0 && digit === ".") {
    return {
      ...game,
      startedAt: game.startedAt ?? now,
      prefixEntered: true,
      prefixDecimalEntered: true,
    };
  }
  if (!/^\d$/.test(digit)) return game;
  const startedAt = game.startedAt ?? now;
  if (game.score >= PLAYABLE_DIGITS.length) {
    return { ...game, startedAt };
  }
  if (game.score === 0 && digit === "3") {
    return { ...game, startedAt, prefixEntered: true, prefixThreeEntered: true };
  }

  if (digit !== PLAYABLE_DIGITS[game.score]) {
    const mistakes = game.mistakes + 1;
    return {
      ...game,
      startedAt,
      mistakes,
      mistakeUntil: now + MISTAKE_FEEDBACK_MS,
      mistakeOverlayUntil: now + MISTAKE_OVERLAY_MS,
      mistakeDigit: digit,
      completedAt: mistakes >= MAX_MISTAKES ? now : game.completedAt,
      cleanChunks: 0,
      cleanChunkEligible: false,
      pendingCleanSequence:
        game.pendingCleanSequence !== null && game.score < game.pendingCleanSequence
          ? null
          : game.pendingCleanSequence,
    };
  }

  const score = game.score + 1;
  const personalBest = Math.max(game.personalBest, score);
  const beatsRunBest = game.celebrationUntil === null && score > game.runBest;
  const reachedChunk = (score - game.runStart) % SEQUENCE_LENGTH === 0;
  const cleanChunks = reachedChunk
    ? game.cleanChunkEligible
      ? game.cleanChunks + 1
      : 0
    : game.cleanChunks;
  const cleanChunkCompleted = reachedChunk && game.cleanChunkEligible;
  const pairLockTarget =
    cleanChunkCompleted && cleanChunks >= 2 && score - SEQUENCE_LENGTH > game.lockedSequence
      ? score - SEQUENCE_LENGTH
      : null;
  const repeatedLockTarget =
    cleanChunkCompleted && game.pendingCleanSequence === score && score > game.lockedSequence
      ? score
      : null;
  const lockTarget = Math.max(
    game.lockedSequence,
    pairLockTarget ?? game.lockedSequence,
    repeatedLockTarget ?? game.lockedSequence,
  );
  const shouldLock = lockTarget > game.lockedSequence;
  const restoredMiss = pairLockTarget !== null && game.mistakes > 0;
  const pendingCleanSequence =
    cleanChunkCompleted && score < PLAYABLE_DIGITS.length ? score : game.pendingCleanSequence;
  return {
    ...game,
    startedAt,
    score,
    mistakes: restoredMiss ? game.mistakes - 1 : game.mistakes,
    completedAt: score === PLAYABLE_DIGITS.length ? now : game.completedAt,
    prefixEntered: false,
    prefixThreeEntered: false,
    prefixDecimalEntered: false,
    mistakeUntil: null,
    mistakeOverlayUntil: null,
    mistakeDigit: null,
    personalBest,
    celebrationUntil: beatsRunBest ? now + 2_200 : game.celebrationUntil,
    cleanChunks,
    cleanChunkEligible: reachedChunk ? true : game.cleanChunkEligible,
    pendingLockedSequence: shouldLock
      ? Math.max(game.pendingLockedSequence ?? game.lockedSequence, lockTarget)
      : game.pendingLockedSequence,
    lockUpdateAt: shouldLock ? now + 900 : game.lockUpdateAt,
    pendingCleanSequence,
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
    pendingCleanSequence:
      game.pendingCleanSequence !== null && game.score < game.pendingCleanSequence
        ? null
        : game.pendingCleanSequence,
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
  const lockedSequence = Math.max(game.lockedSequence, game.pendingLockedSequence);
  return {
    ...game,
    lockedSequence,
    pendingLockedSequence: null,
    lockUpdateAt: null,
    pendingCleanSequence:
      game.pendingCleanSequence !== null && game.pendingCleanSequence <= lockedSequence
        ? null
        : game.pendingCleanSequence,
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
    pendingCleanSequence: null,
  };
}

export function setLockedSequence(game: GameState, sequence: number): GameState {
  const lockedSequence = Number.isFinite(sequence)
    ? Math.min(PLAYABLE_DIGITS.length - 1, Math.max(0, Math.floor(sequence)))
    : 0;
  return {
    ...game,
    lockedSequence,
    pendingLockedSequence: null,
    lockUpdateAt: null,
    cleanChunks: 0,
    cleanChunkEligible: true,
    pendingCleanSequence: null,
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

export function readPendingSequence(
  storage: Pick<Storage, "getItem">,
  lockedSequence: number,
): number | null {
  try {
    const value = Number(storage.getItem(PENDING_SEQUENCE_KEY));
    return Number.isInteger(value) && value > lockedSequence && value < PLAYABLE_DIGITS.length
      ? value
      : null;
  } catch {
    return null;
  }
}

export function saveLockedSequence(storage: Pick<Storage, "setItem">, sequence: number): void {
  try {
    const value = Number.isFinite(sequence)
      ? Math.min(PLAYABLE_DIGITS.length - 1, Math.max(0, Math.floor(sequence)))
      : 0;
    storage.setItem(LOCKED_SEQUENCE_KEY, String(value));
  } catch {
    // The current run remains playable when browser storage is unavailable.
  }
}

export function savePendingSequence(
  storage: Pick<Storage, "setItem" | "removeItem">,
  sequence: number | null,
): void {
  try {
    if (sequence === null) {
      storage.removeItem(PENDING_SEQUENCE_KEY);
      return;
    }
    if (Number.isInteger(sequence) && sequence > 0 && sequence < PLAYABLE_DIGITS.length) {
      storage.setItem(PENDING_SEQUENCE_KEY, String(sequence));
    } else {
      storage.removeItem(PENDING_SEQUENCE_KEY);
    }
  } catch {
    // The current run remains playable when browser storage is unavailable.
  }
}
