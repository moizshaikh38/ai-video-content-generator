"""CV sample timestamps share the requested trim origin with cut evidence.

Rounding a fractional trim to a decode frame must not create a second clock.
A frame just before the requested start is clamped to the clip boundary only.
"""
import math

def sample_relative_time(frame_index, source_fps, start_sec):
 if not all(math.isfinite(x) for x in (frame_index,source_fps,start_sec)) or source_fps<=0 or frame_index<0:
  raise ValueError('finite frame index/time and positive fps required')
 return round(max(0.0,frame_index/source_fps-start_sec),6)
