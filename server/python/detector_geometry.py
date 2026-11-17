"""Normalize local detector rectangles at the image boundary, not API inputs.

DNN boxes may extend a few pixels beyond the image. Keep their visible portion
only when at least half the predicted box is in view. This is measured visible
geometry, not evidence about the hidden face/body or narrative importance.
"""
import math


def visible_detector_rect(rect, source_width, source_height):
    if len(rect) != 4 or source_width <= 0 or source_height <= 0:
        return None
    if not all(math.isfinite(float(v)) for v in rect):
        return None
    x, y, w, h = map(float, rect)
    if w <= 0 or h <= 0:
        return None
    left, top = max(0, x), max(0, y)
    right, bottom = min(source_width, x+w), min(source_height, y+h)
    if right <= left or bottom <= top or (right-left)*(bottom-top) < w*h*.5:
        return None
    # Round inward so the normalized box never invents off-image pixels.
    left, top, right, bottom = math.ceil(left), math.ceil(top), math.floor(right), math.floor(bottom)
    if right <= left or bottom <= top:
        return None
    return left, top, right-left, bottom-top
