"""Generate narration audio for the demo video with Microsoft Edge neural TTS.

Usage: python scripts/demo/tts.py
Writes docs/video/audio/<scene>.mp3 and docs/video/audio/durations.json
"""
import asyncio, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "docs", "video", "audio")
os.makedirs(OUT, exist_ok=True)

import edge_tts
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def duration(path: str) -> float:
    p = subprocess.run([FFMPEG, "-i", path, "-f", "null", "-"], capture_output=True, text=True)
    m = re.findall(r"time=(\d+):(\d+):(\d+\.\d+)", p.stderr)
    if not m:
        raise RuntimeError(f"no duration for {path}")
    h, mi, s = m[-1]
    return int(h) * 3600 + int(mi) * 60 + float(s)


async def main():
    spec = json.load(open(os.path.join(ROOT, "scripts", "demo", "narration.json"), encoding="utf-8"))
    durations = {}
    for scene in spec["scenes"]:
        path = os.path.join(OUT, f"{scene['id']}.mp3")
        # One process per scene: the in-process Communicate API intermittently returns no audio.
        subprocess.run([sys.executable, "-m", "edge_tts", "--text", scene["text"], "--voice", spec["voice"], "--write-media", path], check=True, capture_output=True)
        durations[scene["id"]] = round(duration(path), 2)
        print(f"{scene['id']:10s} {durations[scene['id']]:6.2f}s")
    json.dump(durations, open(os.path.join(OUT, "durations.json"), "w"), indent=2)
    print("total narration:", round(sum(durations.values()), 1), "s")


asyncio.run(main())
