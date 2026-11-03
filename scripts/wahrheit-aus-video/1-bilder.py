# The truth for scripts/wahrheit.mjs, step 1: every picture of a recording, its bar lines and the bars
# in each key's lane, at full size. Made for the landscape recording (`grossformat`): where the stage
# lies and how wide a key is are measured by hand below. About 15 minutes.
#   python 1-bilder.py <video> [frames.pkl] [seconds, for a quick try]
import site, sys, subprocess, re, pickle, threading
sys.path.append(site.getusersitepackages())
import numpy as np

import os
FF = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')  # npm i --no-save ffmpeg-static
VID = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else 'frames.pkl'
LIMIT = ['-t', sys.argv[3]] if len(sys.argv) > 3 else []
X0, X1, Y1 = 225, 2311, 722          # stage crop (full-res coordinates)
W, H = X1 - X0, Y1
WK = 42.46                            # white key width
OCT = 7 * WK

# key lanes: midi -> centre x (full res)
lanes = {}
midi, i = 21, 0
while i < 49:
    pc = midi % 12
    if pc in (1, 3, 6, 8, 10):
        midi += 1
        continue
    lanes[midi] = X0 + (i + 0.5) * WK
    i += 1
    midi += 1
# black keys from measured runs at y=820 (centres), filled by octave pattern
measured = [(260, 287), (335, 361), (385, 411), (460, 486), (509, 535), (558, 584), (632, 659), (683, 708), (757, 784), (806, 832), (855, 881), (930, 956)]
pattern = {}
for s, e in measured:
    c = (s + e) / 2
    # boundary index nearest
    b = round((c - X0) / WK)
    pattern.setdefault(b % 7, []).append(c - (X0 + b * WK))
off = {k: np.mean(v) for k, v in pattern.items()}
for b in range(1, 49):
    if b % 7 in off:
        # black key between white b-1 and b
        left = [m for m, x in lanes.items() if abs(x - (X0 + (b - 0.5) * WK)) < 1][0]
        lanes[left + 1] = X0 + b * WK + off[b % 7]
lane_midis = sorted(lanes)
lane_x = np.array([round((lanes[m] - X0)) for m in lane_midis])

def runs_of(mask):
    d = np.diff(np.concatenate([[0], mask.astype(np.int8), [0]]))
    s = np.where(d == 1)[0]
    e = np.where(d == -1)[0]
    return list(zip(s, e))   # [s, e)

proc = subprocess.Popen([FF, '-loglevel', 'info'] + LIMIT + ['-i', VID, '-vf', f'crop={W}:{H}:{X0}:0,showinfo',
                         '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
times = []
def read_err():
    for line in proc.stderr:
        m = re.search(rb'pts_time:([\d.]+)', line)
        if m:
            times.append(float(m.group(1)))
threading.Thread(target=read_err, daemon=True).start()

frames = []
size = W * H * 3
n = 0
is_black = np.array([m % 12 in (1, 3, 6, 8, 10) for m in lane_midis])
probe = np.concatenate([[x - 8, x, x + 8] if b else [x - 13, x, x + 13] for x, b in zip(lane_x, is_black)])
black_idx = np.where(is_black)[0]
wl_idx = black_idx - 1   # white neighbours (lanes sorted by midi)
wr_idx = black_idx + 1
while True:
    buf = proc.stdout.read(size)
    if len(buf) < size:
        break
    f = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    lum = f.mean(2)
    med = np.median(lum[:, ::7], axis=1)
    # bar lines: local maxima of the row median above the background
    lines = []
    y = 1
    while y < H - 1:
        if med[y] > 11 and med[y] >= med[y - 1] and med[y] >= med[y + 1]:
            lo, hi = max(0, y - 6), min(H, y + 7)
            w = np.clip(med[lo:hi] - 6, 0, None)
            lines.append((float((np.arange(lo, hi) * w).sum() / w.sum()), float(med[y])))
            y += 8
        else:
            y += 1
    mx = f.max(2)
    # edges of the bar lit, and something lit around the middle (letters darken the middle only)
    full = np.empty((H, len(lane_x)), bool)
    for k, (x, b) in enumerate(zip(lane_x, is_black)):
        e, c = (8, 6) if b else (13, 10)
        full[:, k] = (mx[:, x - e] > 60) & (mx[:, x + e] > 60) & (mx[:, x - c:x + c + 1].max(1) > 60)
    # a black lane lies between two white bars: both lit means a second, not a black key
    full[:, black_idx] &= ~(full[:, wl_idx] & full[:, wr_idx])
    notes = []
    for k in range(len(lane_x)):
        x = lane_x[k]
        ed = 8 if is_black[k] else 13
        body = mx[:, x - ed:x + ed + 1].max(1)
        merged = []
        for s, e in runs_of(full[:, k]):
            # a dark letter across a dim bar cuts it; between two notes the lane goes dark
            if merged and s - merged[-1][1] <= 18 and body[merged[-1][1]:s].min() > 40:
                merged[-1] = (merged[-1][0], e)
            else:
                merged.append((s, e))
        for s, e in merged:
            if e - s < 3:
                continue
            ed = 8 if is_black[k] else 13
            seg = f[s:e, [lane_x[k] - ed, lane_x[k] + ed]].reshape(-1, 3).astype(np.int16)
            bright = seg[seg.max(1) > 60]
            sat = bright.max(1) - bright.min(1)
            col = bright[sat >= np.percentile(sat, 75)].mean(0)
            notes.append((lane_midis[k], int(s), int(e), tuple(int(c) for c in col)))
    frames.append((lines, notes))
    n += 1
    if n % 1000 == 0:
        print(n, flush=True)
proc.wait()
pickle.dump({'times': times, 'frames': frames, 'lanes': lanes}, open(OUT, 'wb'))
print('done', n, len(times))
