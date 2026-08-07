# Phone Harness 📱

Connect an LLM directly to a real iPhone through macOS iPhone Mirroring — a
thin, editable harness in the spirit of
prior work.

No jailbreak, no Xcode, no WebDriverAgent. The Mac's mirroring window is the
transport: `screencapture` + Vision-framework OCR for eyes, HID-level CGEvents
for hands. The agent writes what's missing during execution in
`agent-workspace/agent_helpers.py`.

```
  ● agent: wants to open Weather
  │
  ● ocr() → "Weather" at (400, 468)
  │
  ● tap(400, 468) → wait_stable() → ocr() confirms forecast
  ✓ done
```

## Why this works

iPhone Mirroring renders the phone as a Mac window and forwards real mouse and
keyboard input as touches. That gives an agent everything it needs:

- **See** — capture just the mirroring window (`screencapture -l`), OCR it
  with Apple's Vision framework: every visible string with a tap-ready
  coordinate. The poor man's DOM.
- **Act** — CGEvents posted at the HID tap: taps, long-presses, drags
  (swipes), scroll gestures, unicode typing, and the app's own shortcuts
  (Cmd+1 Home, Cmd+2 App Switcher, Cmd+3 Spotlight).
- **Verify** — screenshot again. No DOM means the capture is the ground truth.

Things that do NOT work, learned the hard way: AppleScript `click at`
(silently ignored — the window is a video stream with no accessibility tree),
and input while the window isn't frontmost (swallowed).

## Setup

Read [install.md](install.md). Short version: pair iPhone Mirroring once,
grant the terminal Accessibility + Screen Recording, then:

```bash
./phone-harness --doctor
```

## Usage

```bash
./phone-harness <<'PY'
open_app("Notes")
tap_text("New Note")
type_text("hello from the harness")
print([o["text"] for o in ocr()][:10])
PY
```

Day-to-day workflow lives in [SKILL.md](SKILL.md) — register it as an agent
skill with `./phone-harness skill`.

## Architecture

- `SKILL.md` — day-to-day usage (the agent-facing product surface)
- `install.md` — permissions bootstrap and troubleshooting
- `src/phone_harness/` — protected core (~500 lines):
  - `mirror.py` — window discovery, focus, capture, CGEvent input
  - `ocr.py` — Vision-framework text recognition → screen-point boxes
  - `helpers.py` — the primitives pre-imported into scripts
  - `admin.py` — `--doctor`
  - `run.py` — the CLI (`exec` stdin with helpers in scope)
- `agent-workspace/agent_helpers.py` — helper code the agent edits; auto-
  loaded into every script's namespace

The mirror transport is stateless (window bounds and captures are re-queried
per call), so there is no daemon — every invocation is self-contained.

## Limits

- One phone, one session; unlocking the physical phone pauses mirroring.
- No multi-touch (no pinch), no camera/Face ID flows, DRM video renders black.
- OCR sees text, not semantics — unlabeled icons need a screenshot + a
  vision-capable model.
