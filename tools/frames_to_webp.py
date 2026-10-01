"""Stitch a burst from shot.mjs into an animated WebP (and an MP4 if ffmpeg
is on the PATH).

    python tools/frames_to_webp.py screenshots/motion/kumo-plating [--width 390] [--hold 1600]

Reads <prefix>-000.png, -001.png, ... and writes <prefix>.webp. The last
frame is held so the finished dish stays on screen before the loop restarts.
"""
import argparse
import glob
import os
import shutil
import subprocess

from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('prefix')
ap.add_argument('--width', type=int, default=390)
ap.add_argument('--every', type=int, default=50, help='ms between captured frames')
ap.add_argument('--hold', type=int, default=1600, help='ms to hold the final frame')
ap.add_argument('--skip', type=int, default=2, help='keep every Nth frame (2 = ~30fps from a 60fps recording)')
args = ap.parse_args()

all_files = sorted(glob.glob(f'{args.prefix}-[0-9][0-9][0-9].png'))
files = all_files[::args.skip]
if not files:
    raise SystemExit(f'no frames for {args.prefix}')
frames = []
for f in files:
    im = Image.open(f).convert('RGB')
    frames.append(im.resize((args.width, round(im.height * args.width / im.width)), Image.LANCZOS))
# Real timings from the screencast when available, else a fixed rate.
times_file = f'{args.prefix}.json'
if os.path.exists(times_file):
    import json
    ts = json.load(open(times_file))[::args.skip]
    durations = [max(20, round((ts[i + 1] - ts[i]) * 1000)) for i in range(len(ts) - 1)] + [0]
    os.remove(times_file)
else:
    durations = [args.every] * len(frames)
durations[-1] = args.hold
frames[0].save(f'{args.prefix}.webp', save_all=True, append_images=frames[1:],
               duration=durations, loop=0, quality=80, method=6)
print(f'{args.prefix}.webp  {len(frames)} frames')

if shutil.which('ffmpeg'):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(1000 // args.every),
                    '-i', f'{args.prefix}-%03d.png', '-vf', f'scale={args.width * 2}:-2', '-pix_fmt', 'yuv420p',
                    f'{args.prefix}.mp4'], check=True)
    print(f'{args.prefix}.mp4')
for f in all_files:
    os.remove(f)
