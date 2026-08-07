# phone-harness install

Use once. For phone work, read `SKILL.md`.

## Requirements

- macOS Sequoia+ with iPhone Mirroring paired to the phone (open the app once
  manually to pair — pairing prompts need the physical phone).
- Python 3.12+ with pyobjc (`pip install pyobjc-framework-Quartz
  pyobjc-framework-Vision pyobjc-framework-AppKit`).
- The terminal app needs two permissions in System Settings > Privacy &
  Security. **The toggles require the user:**
  - **Accessibility** — taps and keystrokes. Takes effect immediately.
  - **Screen Recording** — seeing the phone. Takes effect after the terminal
    app restarts.

Open the panes directly:

```bash
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
```

> **Heads up — you may need to grant more than these two.** Accessibility and
> Screen Recording are the permissions we *know* are required, and they're all
> `--doctor` currently checks. But this was built on a machine that was already
> permissive, so a fresh Mac may prompt for additional approvals the first time
> an action runs. If `--doctor` passes but taps, typing, or capture silently do
> nothing, watch for a macOS permission prompt and check System Settings >
> Privacy & Security for a pane asking to approve your terminal. As we pin down
> exactly which extra permissions a clean install needs, they'll get added to
> `--doctor` as proper prerequisites.

## Fast Path

```bash
git clone https://github.com/ShawnPana/phone-harness ~/Projects/phone-harness
cd ~/Projects/phone-harness
pip install pyobjc-framework-Quartz pyobjc-framework-Vision pyobjc-framework-AppKit
./phone-harness --doctor
./phone-harness <<'PY'
print(screen_info())
PY
```

If `screen_info()` prints window bounds, you're done.

## If It Fails

`--doctor` walks the ladder in order: pyobjc → Accessibility → Screen
Recording → app installed → app running → window found → capture works → OCR
works. Fix the first FAIL; later checks depend on earlier ones.

Common cases:

- **Capture is blank/black**: Screen Recording was granted but the terminal
  hasn't restarted since.
- **Window not found**: the phone isn't paired, isn't in range, or iPhone
  Mirroring shows a connect screen — open the app manually once.
- **Taps do nothing**: Accessibility missing, or another window stole focus —
  events land only when the mirroring window is frontmost.
