import { describe, expect, test, vi } from "vite-plus/test";
import {
  BEST_SCORE_KEY,
  createGame,
  finalizeLockedSequence,
  hintedDigits,
  LOCKED_SEQUENCE_KEY,
  MISTAKE_FEEDBACK_MS,
  MISTAKE_OVERLAY_MS,
  PENDING_SEQUENCE_KEY,
  PLAYABLE_DIGITS,
  readBest,
  readLockedSequence,
  readPendingSequence,
  revealHint,
  resetLockedSequence,
  saveBest,
  saveLockedSequence,
  savePendingSequence,
  setLockedSequence,
  submitDigit,
  visibleDigitCount,
} from "../src/game";

describe("digit progression", () => {
  test("keeps the first 100 digits visible and adds one row below the active row", () => {
    expect(visibleDigitCount(60, 20)).toBe(100);
    expect(visibleDigitCount(80, 20)).toBe(120);
    expect(visibleDigitCount(90, 10)).toBe(110);
    expect(visibleDigitCount(9_999, 20)).toBe(PLAYABLE_DIGITS.length);
  });

  test("advances only on the expected digit and starts the timer on first input", () => {
    const initial = createGame();
    const wrong = submitDigit(initial, "9", 1_000);
    expect(wrong.score).toBe(0);
    expect(wrong.mistakes).toBe(1);
    expect(wrong.mistakeDigit).toBe("9");
    expect(wrong.mistakeUntil).toBe(1_000 + MISTAKE_FEEDBACK_MS);
    expect(wrong.mistakeOverlayUntil).toBe(1_000 + MISTAKE_OVERLAY_MS);
    expect(wrong.startedAt).toBe(1_000);

    const correct = submitDigit(wrong, "1", 1_500);
    expect(correct.score).toBe(1);
    expect(correct.personalBest).toBe(1);
  });

  test("continues past the former 100-digit limit", () => {
    const continued = PLAYABLE_DIGITS.slice(0, 125)
      .split("")
      .reduce((game, digit, index) => submitDigit(game, digit, 1_000 + index), createGame());
    expect(PLAYABLE_DIGITS.length).toBe(10_000);
    expect(continued.score).toBe(125);
  });

  test("accepts 1 directly or after typing the 3. prefix", () => {
    const prefix = submitDigit(createGame(), "3", 1_000);
    expect(prefix.score).toBe(0);
    expect(prefix.mistakes).toBe(0);
    expect(prefix.prefixEntered).toBe(true);
    expect(prefix.prefixThreeEntered).toBe(true);
    expect(prefix.prefixDecimalEntered).toBe(false);
    expect(prefix.startedAt).toBe(1_000);

    const decimalPrefix = submitDigit(prefix, ".", 1_100);
    expect(decimalPrefix.mistakes).toBe(0);
    expect(decimalPrefix.prefixDecimalEntered).toBe(true);
    const started = submitDigit(decimalPrefix, "1", 1_200);
    expect(started.score).toBe(1);
    expect(started.prefixThreeEntered).toBe(false);
    expect(started.prefixDecimalEntered).toBe(false);

    const leadingDot = submitDigit(createGame(), ".", 2_000);
    expect(leadingDot.mistakes).toBe(0);
    expect(leadingDot.prefixEntered).toBe(true);
    expect(leadingDot.prefixThreeEntered).toBe(false);
    expect(leadingDot.prefixDecimalEntered).toBe(true);
    expect(leadingDot.startedAt).toBe(2_000);
    expect(submitDigit(leadingDot, "1", 2_100).score).toBe(1);
    expect(submitDigit(createGame(), "1", 3_000).score).toBe(1);
  });

  test("records a new best once per run while still accepting later digits", () => {
    const first = submitDigit(createGame(0), "1", 500);
    const next = submitDigit(first, "4", 700);
    expect(first.celebrationUntil).toBe(2_700);
    expect(next.celebrationUntil).toBe(first.celebrationUntil);
    expect(next.personalBest).toBe(2);

    const restarted = createGame(next.personalBest);
    expect(submitDigit(restarted, "1", 1_000).celebrationUntil).toBeNull();
  });

  test("stops at the available digit set and records the completion time", () => {
    const completed = PLAYABLE_DIGITS.split("").reduce(
      (game, digit, index) => submitDigit(game, digit, 2_000 + index),
      createGame(PLAYABLE_DIGITS.length),
    );
    expect(completed.score).toBe(PLAYABLE_DIGITS.length);
    expect(completed.completedAt).toBe(2_000 + PLAYABLE_DIGITS.length - 1);
    expect(submitDigit(completed, "0", 9_000).score).toBe(PLAYABLE_DIGITS.length);
  });

  test("can restart at the final available digit without locking beyond the end", () => {
    const lastDigit = PLAYABLE_DIGITS.at(-1)!;
    const completed = submitDigit(createGame(0, PLAYABLE_DIGITS.length - 1), lastDigit, 5_000);
    expect(completed.score).toBe(PLAYABLE_DIGITS.length);
    expect(completed.completedAt).toBe(5_000);
    expect(completed.pendingLockedSequence).toBeNull();
  });

  test("ends the run on the fifth miss and ignores later input", () => {
    let game = createGame();
    for (let miss = 0; miss < 5; miss += 1) {
      game = submitDigit(game, "9", 1_000 + miss);
    }
    expect(game.mistakes).toBe(5);
    expect(game.completedAt).toBe(1_004);
    expect(submitDigit(game, "1", 2_000)).toBe(game);
    expect(revealHint(game, 2_100)).toBe(game);
  });
});

describe("clean-sequence checkpoints", () => {
  test("a first clean 40-digit run locks its first 20 digits", () => {
    const fortyCorrect = PLAYABLE_DIGITS.slice(0, 40)
      .split("")
      .reduce((game, digit, index) => submitDigit(game, digit, 1_000 + index), createGame());

    expect(fortyCorrect.pendingLockedSequence).toBe(20);
    expect(fortyCorrect.pendingCleanSequence).toBe(40);
    expect(fortyCorrect.lockedSequence).toBe(0);
    const locked = finalizeLockedSequence(fortyCorrect, fortyCorrect.lockUpdateAt!);
    expect(locked.lockedSequence).toBe(20);
    expect(createGame(locked.personalBest, locked.lockedSequence).score).toBe(20);
  });

  test("a repeated clean 20-digit line locks after its second successful attempt", () => {
    const firstAttempt = PLAYABLE_DIGITS.slice(0, 20)
      .split("")
      .reduce((current, digit, index) => submitDigit(current, digit, 1_000 + index), createGame());
    expect(firstAttempt.pendingCleanSequence).toBe(20);

    const secondAttempt = PLAYABLE_DIGITS.slice(0, 20)
      .split("")
      .reduce(
        (current, digit, index) => submitDigit(current, digit, 3_000 + index),
        createGame(0, 0, firstAttempt.pendingCleanSequence),
      );

    expect(secondAttempt.pendingLockedSequence).toBe(20);
    expect(secondAttempt.pendingCleanSequence).toBe(20);
    const locked = finalizeLockedSequence(secondAttempt, secondAttempt.lockUpdateAt!);
    expect(locked.lockedSequence).toBe(20);
    expect(locked.pendingCleanSequence).toBeNull();
  });

  test("a later hint preserves a clean line, but one during its repeat erases it", () => {
    const firstCleanLine = PLAYABLE_DIGITS.slice(0, 20)
      .split("")
      .reduce((current, digit, index) => submitDigit(current, digit, 1_000 + index), createGame());
    expect(revealHint(firstCleanLine, 2_000).pendingCleanSequence).toBe(20);

    const retry = createGame(0, 0, firstCleanLine.pendingCleanSequence);
    expect(revealHint(retry, 3_000).pendingCleanSequence).toBeNull();
    expect(submitDigit(retry, "9", 3_000).pendingCleanSequence).toBeNull();
    expect(resetLockedSequence(firstCleanLine).pendingCleanSequence).toBeNull();
  });

  test("a mistake also requires two fresh clean sections before locking", () => {
    let game = PLAYABLE_DIGITS.slice(0, 20)
      .split("")
      .reduce((current, digit, index) => submitDigit(current, digit, 1_000 + index), createGame());
    game = submitDigit(game, "9", 2_000);
    game = PLAYABLE_DIGITS.slice(20, 80)
      .split("")
      .reduce((current, digit, index) => submitDigit(current, digit, 3_000 + index), game);
    expect(game.pendingLockedSequence).toBe(60);
  });

  test("restores one miss when two clean 20-digit lines lock the earlier line", () => {
    let game = createGame();
    game = submitDigit(game, "9", 1_000);
    game = submitDigit(game, "9", 1_100);
    game = submitDigit(game, "9", 1_200);
    game = PLAYABLE_DIGITS.slice(0, 60)
      .split("")
      .reduce((current, digit, index) => submitDigit(current, digit, 2_000 + index), game);

    expect(game.lockedSequence).toBe(0);
    expect(game.pendingLockedSequence).toBe(40);
    expect(game.mistakes).toBe(2);
    expect(game.pendingCleanSequence).toBe(60);
  });

  test("locks the next 20 digits for each additional clean line", () => {
    let game = PLAYABLE_DIGITS.slice(0, 60)
      .split("")
      .reduce((current, digit, index) => submitDigit(current, digit, 1_000 + index), createGame());
    game = finalizeLockedSequence(game, game.lockUpdateAt!);
    expect(game.lockedSequence).toBe(40);
    expect(game.pendingCleanSequence).toBe(60);

    const retry = PLAYABLE_DIGITS.slice(40, 60)
      .split("")
      .reduce(
        (current, digit, index) => submitDigit(current, digit, 3_000 + index),
        createGame(0, 40, game.pendingCleanSequence),
      );
    expect(retry.pendingLockedSequence).toBe(60);
  });

  test("edits the locked start without changing the active run score", () => {
    const running = submitDigit(createGame(), "1", 1_000);
    const edited = setLockedSequence(running, 40);
    expect(edited.lockedSequence).toBe(40);
    expect(edited.score).toBe(1);
    expect(createGame(edited.personalBest, edited.lockedSequence).score).toBe(40);
  });
});

describe("hint timing", () => {
  test("reveals the next ten digits for three seconds without counting them", () => {
    const game = submitDigit(createGame(), "1", 1_000);
    const hinted = revealHint(game, 2_000);
    expect(hinted.hintsLeft).toBe(2);
    expect(hinted.score).toBe(1);
    expect(hintedDigits(hinted, 4_999)).toBe("4159265358");
    expect(hintedDigits(hinted, 5_000)).toBe("");
    expect(hinted.score).toBe(1);
  });

  test("does not allow overlapping previews or spend another hint", () => {
    const first = revealHint(createGame(), 0);
    const overlap = revealHint(first, 2_999);
    expect(overlap).toBe(first);
    expect(overlap.hintsLeft).toBe(2);
    expect(revealHint(first, 3_000).hintsLeft).toBe(1);
  });
});

describe("personal best storage", () => {
  test("loads a stored score and safely ignores invalid storage", () => {
    const storage = { getItem: vi.fn(() => "42.8") };
    expect(readBest(storage)).toBe(42);
    expect(readBest({ getItem: () => "not a score" })).toBe(0);
    expect(
      readBest({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(0);
  });

  test("writes the new all-time best under the stable key", () => {
    const storage = { setItem: vi.fn() };
    saveBest(storage, 27);
    expect(storage.setItem).toHaveBeenCalledWith(BEST_SCORE_KEY, "27");
  });
});

describe("locked sequence storage", () => {
  test("loads a valid saved start and falls back for invalid or unavailable storage", () => {
    expect(readLockedSequence({ getItem: () => "40" })).toBe(40);
    expect(readLockedSequence({ getItem: () => "40.5" })).toBe(0);
    expect(readLockedSequence({ getItem: () => "10000" })).toBe(0);
    expect(
      readLockedSequence({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(0);
  });

  test("writes the locked start under its stable key", () => {
    const storage = { setItem: vi.fn() };
    saveLockedSequence(storage, 40);
    expect(storage.setItem).toHaveBeenCalledWith(LOCKED_SEQUENCE_KEY, "40");
  });
});

describe("pending clean sequence storage", () => {
  test("loads only a valid candidate beyond the current lock", () => {
    expect(readPendingSequence({ getItem: () => "40" }, 20)).toBe(40);
    expect(readPendingSequence({ getItem: () => "20" }, 20)).toBeNull();
    expect(readPendingSequence({ getItem: () => "40.5" }, 20)).toBeNull();
    expect(readPendingSequence({ getItem: () => "10000" }, 20)).toBeNull();
    expect(
      readPendingSequence(
        {
          getItem: () => {
            throw new Error("blocked");
          },
        },
        0,
      ),
    ).toBeNull();
  });

  test("saves a clean candidate and removes it when it is cleared", () => {
    const storage = { setItem: vi.fn(), removeItem: vi.fn() };
    savePendingSequence(storage, 40);
    expect(storage.setItem).toHaveBeenCalledWith(PENDING_SEQUENCE_KEY, "40");
    savePendingSequence(storage, null);
    expect(storage.removeItem).toHaveBeenCalledWith(PENDING_SEQUENCE_KEY);
  });
});
