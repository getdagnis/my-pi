import { describe, expect, test, vi } from "vite-plus/test";
import {
  BEST_SCORE_KEY,
  createGame,
  finalizeLockedSequence,
  hintedDigits,
  PLAYABLE_DIGITS,
  readBest,
  revealHint,
  resetLockedSequence,
  saveBest,
  submitDigit,
} from "../src/game";

describe("digit progression", () => {
  test("advances only on the expected digit and starts the timer on first input", () => {
    const initial = createGame();
    const wrong = submitDigit(initial, "9", 1_000);
    expect(wrong.score).toBe(0);
    expect(wrong.mistakes).toBe(1);
    expect(wrong.startedAt).toBe(1_000);

    const correct = submitDigit(wrong, "1", 1_500);
    expect(correct.score).toBe(1);
    expect(correct.personalBest).toBe(1);
  });

  test("accepts 1 directly or after typing the 3. prefix", () => {
    const prefix = submitDigit(createGame(), "3", 1_000);
    expect(prefix.score).toBe(0);
    expect(prefix.mistakes).toBe(0);
    expect(prefix.prefixEntered).toBe(true);
    expect(prefix.startedAt).toBe(1_000);

    const decimalPrefix = submitDigit(prefix, ".", 1_100);
    expect(decimalPrefix.mistakes).toBe(0);
    expect(submitDigit(decimalPrefix, "1", 1_200).score).toBe(1);

    const leadingDot = submitDigit(createGame(), ".", 2_000);
    expect(leadingDot.mistakes).toBe(0);
    expect(leadingDot.prefixEntered).toBe(true);
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
  test("locks after two consecutive clean ten-digit sections and resumes there", () => {
    const twentyCorrect = PLAYABLE_DIGITS.slice(0, 20)
      .split("")
      .reduce((game, digit, index) => submitDigit(game, digit, 1_000 + index), createGame());

    expect(twentyCorrect.pendingLockedSequence).toBe(20);
    expect(twentyCorrect.lockedSequence).toBe(0);
    const locked = finalizeLockedSequence(twentyCorrect, twentyCorrect.lockUpdateAt!);
    expect(locked.lockedSequence).toBe(20);
    expect(createGame(locked.personalBest, locked.lockedSequence).score).toBe(20);
  });

  test("a mistake or hint breaks the clean streak until two new sections are completed", () => {
    let game = PLAYABLE_DIGITS.slice(0, 9)
      .split("")
      .reduce((current, digit, index) => submitDigit(current, digit, 1_000 + index), createGame());
    game = revealHint(game, 2_000);
    game = submitDigit(game, PLAYABLE_DIGITS[9], 2_100);
    game = PLAYABLE_DIGITS.slice(10, 20)
      .split("")
      .reduce((current, digit, index) => submitDigit(current, digit, 3_000 + index), game);
    expect(game.pendingLockedSequence).toBeNull();

    game = PLAYABLE_DIGITS.slice(20, 40)
      .split("")
      .reduce((current, digit, index) => submitDigit(current, digit, 5_000 + index), game);
    expect(game.pendingLockedSequence).toBe(30);
    expect(
      resetLockedSequence(finalizeLockedSequence(game, game.lockUpdateAt!)).lockedSequence,
    ).toBe(0);
  });

  test("a mistake also requires two fresh clean sections before locking", () => {
    let game = PLAYABLE_DIGITS.slice(0, 20)
      .split("")
      .reduce((current, digit, index) => submitDigit(current, digit, 1_000 + index), createGame());
    game = submitDigit(game, "9", 2_000);
    game = PLAYABLE_DIGITS.slice(20, 50)
      .split("")
      .reduce((current, digit, index) => submitDigit(current, digit, 3_000 + index), game);
    expect(game.pendingLockedSequence).toBe(50);
  });

  test("restores one miss at each pair of clean sections without exceeding the cap", () => {
    let game = createGame();
    game = submitDigit(game, "9", 1_000);
    game = submitDigit(game, "9", 1_100);
    game = submitDigit(game, "9", 1_200);
    game = PLAYABLE_DIGITS.slice(0, 50)
      .split("")
      .reduce((current, digit, index) => submitDigit(current, digit, 2_000 + index), game);

    expect(game.lockedSequence).toBe(0);
    expect(game.pendingLockedSequence).toBe(50);
    expect(game.mistakes).toBe(1);
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
