import {
  StrictMode,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  createGame,
  finalizeLockedSequence,
  HINT_COUNT,
  hintedDigits,
  MAX_MISTAKES,
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
  type GameState,
} from "./game";
import styles from "./game.module.sass";
import "./style.css";

const CONFETTI = Array.from({ length: 18 }, (_, index) => index);
const DIGITS_PER_ROW_DESKTOP = 20;
const DIGITS_PER_ROW_MOBILE = 10;

function getBestScore(): number {
  try {
    return readBest(window.localStorage);
  } catch {
    return 0;
  }
}

function getLockedSequence(): number {
  try {
    return readLockedSequence(window.localStorage);
  } catch {
    return 0;
  }
}

function getPendingSequence(lockedSequence: number): number | null {
  try {
    return readPendingSequence(window.localStorage, lockedSequence);
  } catch {
    return null;
  }
}

function getInitialGame(): GameState {
  const lockedSequence = getLockedSequence();
  return createGame(getBestScore(), lockedSequence, getPendingSequence(lockedSequence));
}

function formatTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function ResourcePips({
  remaining,
  total,
  type,
}: {
  remaining: number;
  total: number;
  type: "hint" | "miss";
}) {
  return (
    <div
      className={styles.resourcePips}
      role="img"
      aria-label={`${remaining} ${type === "hint" ? "hints" : "misses"} remaining`}
    >
      {Array.from({ length: total }, (_, index) => (
        <i
          className={
            index < remaining ? (type === "hint" ? styles.hintPipActive : styles.missPipActive) : ""
          }
          key={index}
        />
      ))}
    </div>
  );
}

function Game() {
  const [game, setGame] = useState<GameState>(getInitialGame);
  const [editingLock, setEditingLock] = useState(false);
  const [lockedSequenceDraft, setLockedSequenceDraft] = useState("0");
  const [clockNow, setClockNow] = useState(Date.now);
  const [mobileDigits, setMobileDigits] = useState("");
  const [digitsPerRow, setDigitsPerRow] = useState(() =>
    window.matchMedia("(max-width: 700px)").matches
      ? DIGITS_PER_ROW_MOBILE
      : DIGITS_PER_ROW_DESKTOP,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const enterDigit = useCallback((digit: string) => {
    setGame((current) => submitDigit(current, digit, Date.now()));
  }, []);

  useEffect(() => {
    if (game.startedAt === null || game.completedAt !== null) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [game.startedAt, game.completedAt]);

  useEffect(() => {
    const deadlines = [
      game.hintUntil,
      game.celebrationUntil,
      game.mistakeUntil,
      game.mistakeOverlayUntil,
      game.lockUpdateAt,
    ].filter((deadline): deadline is number => deadline !== null && deadline > Date.now());
    if (deadlines.length === 0) return;
    const timers = deadlines.map((deadline) =>
      window.setTimeout(() => setClockNow(Date.now()), deadline - Date.now()),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [
    game.hintUntil,
    game.celebrationUntil,
    game.mistakeUntil,
    game.mistakeOverlayUntil,
    game.lockUpdateAt,
  ]);

  useEffect(() => {
    if (game.lockUpdateAt === null) return;
    const timer = window.setTimeout(
      () => {
        setGame((current) => finalizeLockedSequence(current, Date.now()));
      },
      Math.max(0, game.lockUpdateAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [game.lockUpdateAt]);

  useEffect(() => {
    if (game.personalBest > 0) saveBest(window.localStorage, game.personalBest);
  }, [game.personalBest]);

  useEffect(() => {
    saveLockedSequence(window.localStorage, game.lockedSequence);
  }, [game.lockedSequence]);

  useEffect(() => {
    savePendingSequence(window.localStorage, game.pendingCleanSequence);
  }, [game.pendingCleanSequence]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']")
      )
        return;
      if (!/^[\d.]$/.test(event.key)) return;
      event.preventDefault();
      enterDigit(event.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enterDigit]);

  const activeHint = hintedDigits(game, clockNow);
  const visibleCount = visibleDigitCount(game.score, digitsPerRow);
  const mistakeFeedback = game.mistakeUntil !== null && clockNow < game.mistakeUntil;
  const mistakeOverlay = game.mistakeOverlayUntil !== null && clockNow < game.mistakeOverlayUntil;
  const elapsed = game.startedAt === null ? 0 : (game.completedAt ?? clockNow) - game.startedAt;
  const celebrating = game.celebrationUntil !== null && clockNow < game.celebrationUntil;
  const outOfMisses = game.mistakes >= MAX_MISTAKES;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const updateColumns = () =>
      setDigitsPerRow(media.matches ? DIGITS_PER_ROW_MOBILE : DIGITS_PER_ROW_DESKTOP);
    media.addEventListener("change", updateColumns);
    return () => media.removeEventListener("change", updateColumns);
  }, []);

  function handleMobileInput(value: string) {
    setMobileDigits("");
    for (const digit of value) {
      if (/^[\d.]$/.test(digit)) enterDigit(digit);
    }
  }

  function restart() {
    setEditingLock(false);
    setGame((current) =>
      createGame(current.personalBest, current.lockedSequence, current.pendingCleanSequence),
    );
    setClockNow(Date.now());
    setMobileDigits("");
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  function focusDigitEntry() {
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  function editLockedSequence() {
    setLockedSequenceDraft(String(game.lockedSequence));
    setEditingLock(true);
  }

  function saveLockedSequenceEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(lockedSequenceDraft);
    if (!Number.isInteger(value) || value < 0 || value >= PLAYABLE_DIGITS.length) return;
    setGame((current) => setLockedSequence(current, value));
    setEditingLock(false);
  }

  return (
    <main className={styles.page}>
      {mistakeOverlay && (
        <div key={game.mistakeOverlayUntil} className={styles.missOverlay} aria-hidden="true" />
      )}
      <header className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.eyebrow}>A little practice in infinity</span>
          <h1>Remember π</h1>
        </div>
        <div className={styles.headerResources}>
          <div className={styles.headerResource}>
            <span>Hints remaining</span>
            <ResourcePips remaining={game.hintsLeft} total={HINT_COUNT} type="hint" />
          </div>
          <div className={styles.headerResource}>
            <span>Misses remaining</span>
            <ResourcePips
              remaining={MAX_MISTAKES - game.mistakes}
              total={MAX_MISTAKES}
              type="miss"
            />
          </div>
        </div>
      </header>

      <section
        className={styles.board}
        aria-label="Pi digit practice board"
        onClick={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("button, input")) return;
          inputRef.current?.focus({ preventScroll: true });
        }}
      >
        <div className={styles.boardWash} aria-hidden="true" />
        <div
          className={`${styles.digitArea} ${game.lockUpdateAt !== null ? styles.sequenceFlashing : ""}`}
        >
          <div className={styles.piPrefix} aria-label="Pi equals three">
            <span>π</span>
            <span className={styles.equals}>=</span>
            <span className={styles.numberPrefix}>
              <span
                className={game.prefixThreeEntered && game.score === 0 ? styles.prefixActive : ""}
              >
                3
              </span>
              <span
                className={game.prefixDecimalEntered && game.score === 0 ? styles.prefixActive : ""}
              >
                .
              </span>
            </span>
          </div>
          <div className={styles.digits} aria-label={`${game.score} digits correct`}>
            {PLAYABLE_DIGITS.slice(0, visibleCount)
              .split("")
              .map((digit, index) => {
                const guessed = index < game.score;
                const hinted = !guessed && index < game.score + activeHint.length;
                const current = !guessed && !hinted && index === game.score;
                const wrong =
                  current &&
                  game.mistakeDigit !== null &&
                  game.mistakeUntil !== null &&
                  clockNow < game.mistakeUntil;
                return (
                  <span
                    className={[
                      styles.digit,
                      guessed ? styles.guessed : "",
                      hinted ? styles.hinted : "",
                      current && !wrong ? styles.liveDigit : "",
                      wrong ? styles.mistakeDigit : "",
                      !guessed && !hinted && !current ? styles.blank : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={index}
                    aria-hidden="true"
                    style={
                      hinted
                        ? ({ "--hint-delay": `${(index - game.score) * 0.3}s` } as CSSProperties)
                        : undefined
                    }
                  >
                    {guessed
                      ? digit
                      : hinted
                        ? activeHint[index - game.score]
                        : wrong
                          ? game.mistakeDigit
                          : "_"}
                  </span>
                );
              })}
          </div>
        </div>
        <p
          className={`${styles.status} ${mistakeFeedback ? styles.statusError : ""}`}
          aria-live="polite"
        >
          {outOfMisses
            ? "No more misses this run."
            : game.score === 0 && game.mistakes === 0
              ? "Start with the first digit after the decimal"
              : game.score === PLAYABLE_DIGITS.length
                ? "You reached the end of this practice set. Beautifully done."
                : game.mistakeUntil !== null && clockNow < game.mistakeUntil
                  ? "Not quite — keep going"
                  : "Keep the rhythm. One digit at a time."}
        </p>
        <div className={styles.actionsFooter}>
          <button
            className={styles.hintButton}
            type="button"
            disabled={game.completedAt !== null || game.hintsLeft === 0 || Boolean(activeHint)}
            onClick={() => {
              setGame((current) => revealHint(current, Date.now()));
              setClockNow(Date.now());
              focusDigitEntry();
            }}
          >
            <span className={styles.hintText}>Hint ({game.hintsLeft})</span>
          </button>
          <div className={styles.checkpoints} aria-label="Practice progress">
            <div className={styles.checkpoint}>
              <strong>{game.score}</strong>
              <span>Digits</span>
            </div>
            <div className={styles.checkpoint}>
              <strong>{game.personalBest}</strong>
              <span>Best</span>
            </div>
            <div className={styles.checkpoint}>
              <strong className={styles.timerValue}>{formatTime(elapsed)}</strong>
              <span>Time</span>
            </div>
            <div className={styles.checkpoint}>
              <strong>{game.lockedSequence}</strong>
              <span>Locked Sequence</span>
              {editingLock ? (
                <form className={styles.lockEditor} onSubmit={saveLockedSequenceEdit}>
                  <input
                    aria-label="Locked sequence start digit count"
                    type="number"
                    min={0}
                    max={PLAYABLE_DIGITS.length - 1}
                    step={1}
                    value={lockedSequenceDraft}
                    onChange={(event) => setLockedSequenceDraft(event.currentTarget.value)}
                  />
                  <button
                    className={styles.resetLockButton}
                    type="submit"
                    disabled={
                      !Number.isInteger(Number(lockedSequenceDraft)) ||
                      Number(lockedSequenceDraft) < 0 ||
                      Number(lockedSequenceDraft) >= PLAYABLE_DIGITS.length
                    }
                  >
                    Save
                  </button>
                  <button
                    className={styles.resetLockButton}
                    type="button"
                    onClick={() => setEditingLock(false)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className={styles.lockActions}>
                  <button
                    className={styles.resetLockButton}
                    type="button"
                    disabled={game.lockedSequence === 0 && game.pendingLockedSequence === null}
                    onClick={() => {
                      setGame((current) => resetLockedSequence(current));
                      focusDigitEntry();
                    }}
                  >
                    Reset
                  </button>
                  <button
                    className={styles.resetLockButton}
                    type="button"
                    onClick={editLockedSequence}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          </div>
          <button className={styles.restartButton} type="button" onClick={restart}>
            Restart from {game.lockedSequence} (locked)
          </button>
          <label className={styles.mobileEntry} aria-hidden="true">
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label="Type the next digit of pi"
              value={mobileDigits}
              onChange={(event) => handleMobileInput(event.currentTarget.value)}
            />
          </label>
        </div>
        {celebrating && (
          <div className={styles.celebration} aria-live="assertive">
            <span>New personal best</span>
            <div className={styles.confetti} aria-hidden="true">
              {CONFETTI.map((piece) => (
                <i key={piece} style={{ "--piece": piece } as CSSProperties} />
              ))}
            </div>
          </div>
        )}
        {outOfMisses && (
          <div className={styles.gameOver} role="status">
            <div className={styles.gameOverContent}>
              <span className={styles.gameOverEyebrow}>Practice paused</span>
              <strong>No more misses</strong>
              <div className={styles.gameOverStats}>
                <div className={styles.gameOverStat}>
                  <span>Digits guessed</span>
                  <strong>{game.score}</strong>
                </div>
                <div className={styles.gameOverStat}>
                  <span>Hints remaining</span>
                  <ResourcePips remaining={game.hintsLeft} total={HINT_COUNT} type="hint" />
                </div>
                <div className={styles.gameOverStat}>
                  <span>Time</span>
                  <strong>{formatTime(elapsed)}</strong>
                </div>
              </div>
              <button className={styles.gameOverRestart} type="button" onClick={restart}>
                Restart from {game.lockedSequence} (locked)
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <Game />
  </StrictMode>,
);
