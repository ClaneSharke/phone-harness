"""Did the screen scroll, hold still, or get replaced? Measured in pixels.

Scroll progress used to be judged by how much OCR text two captures shared.
That fails in three ways this module does not:

  - a screen with no readable text has no overlap to measure, so a settled
    list reads as movement and end-detection never fires (issue #24)
  - a scroll and a NAVIGATION both collapse the overlap, so a gesture that
    opened a row is indistinguishable from one that scrolled (issue #22)
  - OCR is not stable frame to frame: identical pixels can yield overlaps
    anywhere from 0.6 to 1.0, so a real scroll is regularly reported as no
    movement

A scroll is a vertical translation of the content, so measure that directly.
Each capture is reduced to one brightness value per row; the shift that best
lines the two profiles up is how far the view moved, and how well they line up
at that shift says whether a translation explains the change at all.

Quartz only — no new dependency.
"""
import Quartz
from Foundation import NSURL

STATUS_BAR = 0.09      # cropped: the clock ticks and would read as motion
HOME_STRIP = 0.05
ROWS = 400             # profile resolution; finer = better on dense content
COLS = 64              # sampled columns, split into STRIPS independent profiles
STRIPS = 8             # separate column bands. Averaging the whole width flattens
                       # a photo grid into mush; bands keep enough structure that
                       # a real scroll still correlates (0.71 vs 0.59 measured).
MAX_SHIFT = 0.45       # search +/- this fraction of the profile

# Calibrated on this hardware against known cases:
#   identical frames                 1.00
#   photo-grid scroll (worst real)   0.71
#   navigation (General -> Fonts)    0.34
MATCH_MIN = 0.55       # below this, no translation explains the change
STILL_PX = 2           # |dy| under this is "did not move"


def profile(path):
    """Row-brightness profiles, one per column band, top of screen first.

    Returns STRIPS lists. Chrome (status bar, home strip) is cropped: the clock
    ticks once a minute and would otherwise read as motion.
    """
    src = Quartz.CGImageSourceCreateWithURL(NSURL.fileURLWithPath_(path), None)
    if src is None:
        raise RuntimeError(f"cannot read image {path}")
    img = Quartz.CGImageSourceCreateImageAtIndex(src, 0, None)
    if img is None:
        raise RuntimeError(f"cannot decode image {path}")

    cs = Quartz.CGColorSpaceCreateDeviceGray()
    ctx = Quartz.CGBitmapContextCreate(None, COLS, ROWS, 8, COLS, cs,
                                       Quartz.kCGImageAlphaNone)
    Quartz.CGContextDrawImage(ctx, ((0, 0), (COLS, ROWS)), img)
    buf = bytes(Quartz.CGBitmapContextGetData(ctx).as_buffer(COLS * ROWS))

    per = COLS // STRIPS
    top, bot = int(ROWS * STATUS_BAR), int(ROWS * (1 - HOME_STRIP))
    out = []
    for s in range(STRIPS):
        lo, hi = s * per, (s + 1) * per
        rows = [sum(buf[y * COLS + lo:y * COLS + hi]) / per for y in range(ROWS)]
        rows.reverse()      # CGContext draws bottom-up; index 0 = top of screen
        out.append(rows[top:bot])
    return out


def _pearson(a, b):
    n = len(a)
    if n < 8:
        return 0.0
    ma, mb = sum(a) / n, sum(b) / n
    num = sxx = syy = 0.0
    for i in range(n):
        x, y = a[i] - ma, b[i] - mb
        num += x * y
        sxx += x * x
        syy += y * y
    den = (sxx * syy) ** 0.5
    return num / den if den > 0 else 0.0


def _match_at(a, b, dy):
    """How well `dy` lines the two profiles up, as Pearson r."""
    n = len(a)
    if dy >= 0:
        aa, bb = a[:n - dy], b[dy:]
    else:
        aa, bb = a[-dy:], b[:n + dy]
    return _pearson(aa, bb) if len(aa) >= n * 0.4 else 0.0


def compare(before, after):
    """Vertical motion between two profile sets.

    Returns {dy, match}. dy > 0 means the content moved DOWN the screen (what a
    'down' scroll does); dy < 0 means it moved up. The shift is the one that
    best lines up ALL column bands at once, so a single band of repeating
    content cannot carry the answer on its own.
    """
    if len(before) != len(after) or len(before[0]) != len(after[0]):
        raise ValueError("capture size changed between frames")
    lim = int(len(before[0]) * MAX_SHIFT)
    best_r, best_dy = -2.0, 0
    for dy in range(-lim, lim + 1):
        r = sum(_match_at(a, b, dy) for a, b in zip(before, after)) / len(before)
        if r > best_r:
            best_r, best_dy = r, dy
    # The search runs in bottom-up buffer order; report screen-space direction.
    return {"dy": -best_dy, "match": round(best_r, 3)}


def verdict(m):
    """'scrolled' | 'still' | 'replaced'."""
    if m["match"] < MATCH_MIN:
        return "replaced"
    return "still" if abs(m["dy"]) < STILL_PX else "scrolled"
