"""Assemble docs/video/sameskin-demo.mp4 from the recorded frames and narration.

Usage: python scripts/demo/assemble.py
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "docs", "video")
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

meta = json.load(open(os.path.join(OUT, "frames.json")))
stamps, timeline = meta["stamps"], meta["timeline"]
# Video time starts at the first captured frame; shift everything to that origin.
ORIGIN = stamps[0]
stamps = [s - ORIGIN for s in stamps]
for sc in timeline:
    sc["start"] = max(0.0, sc["start"] - ORIGIN)
FRAMES = meta.get("frames") or os.path.join(OUT, "frames")
durations = json.load(open(os.path.join(OUT, "audio", "durations.json")))
files = sorted(f for f in os.listdir(FRAMES) if f.endswith(".jpg"))
assert len(files) == len(stamps), (len(files), len(stamps))

# Video: concat demuxer with the real inter-frame gaps (variable frame rate), then CFR 30.
last_id = timeline[-1]["id"]
tail = durations.get(last_id, 3) + 0.7
total = stamps[-1] + tail
lines = ["ffconcat version 1.0"]
for i, f in enumerate(files):
    d = (stamps[i + 1] - stamps[i]) if i + 1 < len(files) else tail
    lines.append(f"file '{os.path.join(FRAMES, f).replace(os.sep, '/')}'")
    lines.append(f"duration {max(d, 0.01):.4f}")
lines.append(f"file '{os.path.join(FRAMES, files[-1]).replace(os.sep, '/')}'")
concat = os.path.join(OUT, "frames.ffconcat")
open(concat, "w", encoding="utf-8").write("\n".join(lines) + "\n")

# Audio: each narration placed at its scene start.
inputs, filters, labels = [], [], []
for i, sc in enumerate(timeline):
    mp3 = os.path.join(OUT, "audio", f"{sc['id']}.mp3")
    if not os.path.exists(mp3):
        continue
    inputs += ["-i", mp3]
    ms = int(round((sc["start"] + 0.35) * 1000))
    filters.append(f"[{i + 1}:a]adelay={ms}|{ms},apad[a{i}]")
    labels.append(f"[a{i}]")
mix = ";".join(filters) + ";" if filters else ""
mix += "".join(labels) + f"amix=inputs={len(labels)}:normalize=0:dropout_transition=0,atrim=0:{total:.3f},loudnorm=I=-16:TP=-1.5:LRA=11[aout]"

out = os.path.join(OUT, "sameskin-demo.mp4")
cmd = [
    FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", concat, *inputs,
    "-filter_complex", mix,
    "-map", "0:v", "-map", "[aout]",
    "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#faf6f1,fps=30,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "160k", "-t", f"{total:.3f}", out,
]
print("frames:", len(files), "video length: %.1fs" % total)
subprocess.run(cmd, check=True)
print("wrote", out, os.path.getsize(out) // 1024, "KB")
