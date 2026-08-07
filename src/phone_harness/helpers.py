"""Phone control via iPhone Mirroring.

Core helpers live here. Agent-editable helpers live in
PH_AGENT_WORKSPACE/agent_helpers.py (defaults to <repo>/agent-workspace).
Raw Quartz is always available: `import Quartz` in your script for anything
these helpers don't cover.
"""
import hashlib, importlib.util, os, time
from pathlib import Path

from . import mirror, ocr as _ocr
from .mirror import (  # re-exported input primitives
    tap, long_press, drag, press, type_text, activate, find_window,
)

CORE_DIR = Path(__file__).resolve().parent
REPO_ROOT = CORE_DIR.parent.parent
AGENT_WORKSPACE = Path(
    os.environ.get("PH_AGENT_WORKSPACE", REPO_ROOT / "agent-workspace"))


# --- session / state ---

def ensure_mirroring():
    """Launch + focus iPhone Mirroring; return window bounds {x, y, w, h, id}."""
    win = mirror.ensure_window()
    mirror.activate()
    return win


def screen_info():
    """{window, frontmost, img_px} — bounds in screen points, capture size in px."""
    path, win = mirror.capture()
    w, h = _ocr.image_size(path)
    return {"window": win, "frontmost": mirror.is_frontmost(), "img_px": [w, h]}


def screenshot(path=None):
    """Capture the phone window to a PNG and return its path. View it to see
    the phone; combine with ocr() for coordinates."""
    p, _ = mirror.capture(path)
    return p


# --- reading the screen ---

def ocr(min_confidence=0.3):
    """All visible text with tap-ready screen-point centers:
    [{text, confidence, x, y, w, h}]. This is the element tree — prefer it
    over eyeballing screenshots for anything with a text label."""
    path, win = mirror.capture()
    return [o for o in _ocr.recognize(path, win)
            if o["confidence"] >= min_confidence]


def find_text(query, exact=False):
    """OCR results matching query (case-insensitive substring by default)."""
    q = query.lower()
    return [o for o in ocr()
            if (o["text"].lower() == q if exact else q in o["text"].lower())]


def tap_text(query, index=0, exact=False):
    """Find text on screen and tap its center. Raises with what IS visible on
    failure, so the next step is informed."""
    hits = find_text(query, exact=exact)
    if not hits:
        visible = [o["text"] for o in ocr()][:30]
        raise RuntimeError(f"no visible text matches {query!r}; saw: {visible}")
    hit = hits[index]
    tap(hit["x"], hit["y"])
    return hit


# --- gestures relative to the phone window ---

def _win():
    return mirror.ensure_window()


def swipe(direction, distance=0.4):
    """swipe('up'|'down'|'left'|'right') — a touch-drag centered in the window.
    Direction is finger motion: swipe('up') moves content up (scrolls down)."""
    w = _win()
    cx, cy = w["x"] + w["w"] / 2, w["y"] + w["h"] / 2
    dx = {"left": -1, "right": 1}.get(direction, 0) * w["w"] * distance
    dy = {"up": -1, "down": 1}.get(direction, 0) * w["h"] * distance
    if not dx and not dy:
        raise ValueError(f"unknown direction {direction!r}")
    mirror.drag(cx - dx / 2, cy - dy / 2, cx + dx / 2, cy + dy / 2)


def scroll(amount=300):
    """Scroll-gesture at window center. Positive scrolls content down the way
    a trackpad two-finger-up does; use swipe() when momentum matters."""
    w = _win()
    mirror.scroll_wheel(-amount, w["x"] + w["w"] / 2, w["y"] + w["h"] / 2)


# --- navigation ---

def home():
    """Go to the iPhone Home Screen (Cmd+1)."""
    press("cmd+1")
    time.sleep(0.8)


def app_switcher():
    press("cmd+2")
    time.sleep(0.8)


def open_app(name):
    """Open an app via Spotlight (Cmd+3): type name, return, wait for launch."""
    press("cmd+3")
    time.sleep(0.9)
    type_text(name)
    time.sleep(1.2)  # let results populate before committing
    press("return")
    wait_stable()


# --- timing ---

def wait(seconds=1.0):
    time.sleep(seconds)


def wait_stable(timeout=6.0, interval=0.5, settle=2):
    """Wait until `settle` consecutive captures are identical (animation done).
    The status-bar clock ticks once a minute, so near-misses are rare."""
    prev, same = None, 0
    deadline = time.time() + timeout
    while time.time() < deadline:
        path, _ = mirror.capture()
        digest = hashlib.md5(Path(path).read_bytes()).hexdigest()
        same = same + 1 if digest == prev else 0
        if same >= settle - 1:
            return True
        prev = digest
        time.sleep(interval)
    return False


def _load_agent_helpers():
    p = AGENT_WORKSPACE / "agent_helpers.py"
    if not p.exists():
        return
    spec = importlib.util.spec_from_file_location("phone_harness_agent_helpers", p)
    if not spec or not spec.loader:
        return
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for name, value in vars(module).items():
        if not name.startswith("_"):
            globals()[name] = value


_load_agent_helpers()
