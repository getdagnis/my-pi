# Remember π

A keyboard-first practice game for recalling 10,000 digits after the decimal point of π. Correct digits are written onto a chalkboard, mistakes leave the sequence in place, and each run includes three three-second hints.

## Development

Requirements: Node.js 22.18 or newer and npm 11.19.1.

```sh
npm install
vp run dev
```

The all-time best, locked start, and latest clean line candidate are stored in this browser's local storage. A 20-digit line locks after a second clean completion, or after it and the following line are both completed cleanly. The digit board starts with 100 digits, then adds rows as you progress so one full row stays ahead of the active digit. It currently includes 10,000 verified decimal digits. The game has no server or account.

## Checks

```sh
vp check
vp run website#test
vp run website#build
```

Core game rules live in `apps/website/src/game.ts`; the decimal digit source is in `apps/website/src/pi-digits.ts`. The provided blackboard image can be replaced by updating the image URL in `apps/website/src/game.module.sass`.
