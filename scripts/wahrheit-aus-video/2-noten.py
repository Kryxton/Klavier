# Step 2: bar lines and runs of every picture -> notes placed in their bars (truth.json).
# Everything is measured between the bar lines of the same picture, so uneven picture times don't matter.
#   python 2-noten.py [frames.pkl]
import site, sys, pickle, json, colorsys
sys.path.append(site.getusersitepackages())
import numpy as np

src = sys.argv[1] if len(sys.argv) > 1 else 'frames.pkl'
d = pickle.load(open(src, 'rb'))
T = np.array(d['times'])
F = d['frames']
n = min(len(T), len(F))

# --- bar lines -> tape coordinate u = y - v t, one u per bar
V, D, U1 = 252.7, 350.0, 359.1
obs = [(T[i], y) for i in range(n) for y, _ in F[i][0] if 20 < y < 700]
for _ in range(3):
    t = np.array([o[0] for o in obs]); y = np.array([o[1] for o in obs])
    k = 1 + np.round((U1 - (y - V * t)) / D).astype(int)
    # slope per bar
    slopes = []
    for kk in np.unique(k):
        m = k == kk
        if m.sum() > 50 and np.ptp(t[m]) > 1:
            slopes.append(np.polyfit(t[m], y[m], 1)[0])
    V = float(np.median(slopes))
    us = {int(kk): float(np.median((y - V * t)[k == kk])) for kk in np.unique(k) if (k == kk).sum() > 30}
    ks = sorted(us)
    D = float(np.median(-np.diff([us[kk] for kk in ks])))
    U1 = float(np.median([us[kk] + (kk - 1) * D for kk in ks]))
resid = y - V * t - np.array([us.get(int(kk), np.nan) for kk in k])
print(f'speed {V:.2f} px/s, bar {D:.2f} px = {D / V:.4f} s, bars {ks[0]}..{ks[-1]}, line residual sd {np.nanstd(resid):.2f} px', file=sys.stderr)
spacing = -np.diff([us[kk] for kk in ks])
print('bar spacing min/max', spacing.min().round(2), spacing.max().round(2), file=sys.stderr)

uk = np.array([us[kk] for kk in ks]); kk_arr = np.array(ks, float)
def pos_of(u):
    # bars increase as u decreases; extrapolate with the mean spacing
    return np.interp(-u, -uk, kk_arr, left=np.nan, right=np.nan) if uk[-1] <= u <= uk[0] else ks[0] + (uk[0] - u) / D if u > uk[0] else ks[-1] + (uk[-1] - u) / D

# per-frame shift from the visible lines (absorbs timestamp jitter)
def shift(i):
    vals = []
    for y, _ in F[i][0]:
        if not 20 < y < 700:
            continue
        u = y - V * T[i]
        kk = 1 + round((U1 - u) / D)
        if kk in us:
            vals.append(u - us[kk])
    return float(np.median(vals)) if vals else 0.0

GLOW = 680
runs = []   # (midi, pos_bottom or nan, pos_top or nan, lo, hi, colour)
for i in range(n):
    sh = shift(i)
    for midi, s, e, col in F[i][1]:
        # the glow above a played key can bridge two notes on one key: look only above it
        if s >= GLOW:
            continue
        cut = e > GLOW
        e = min(e, GLOW)
        pb = pos_of(e - V * T[i] - sh)
        pt = pos_of(s - V * T[i] - sh)
        runs.append((midi, np.nan if cut else pb, pt if s > 10 else np.nan, pb, pt, col, i))

notes = []
by_lane = {}
for r in runs:
    by_lane.setdefault(r[0], []).append(r)
for midi, rs in by_lane.items():
    rs.sort(key=lambda r: r[3])
    groups, cur, hi = [], [], -1e9
    for r in rs:
        if cur and r[3] > hi - 0.004:
            groups.append(cur); cur = []
        cur.append(r)
        hi = r[4] if len(cur) == 1 else max(hi, r[4])
    if cur:
        groups.append(cur)
    for g in groups:
        b = [r[1] for r in g if not np.isnan(r[1])]
        tp = [r[2] for r in g if not np.isnan(r[2])]
        if len(g) < 15 or len(b) < 5:
            continue
        cols = np.array([r[5] for r in g])
        h, l, s_ = colorsys.rgb_to_hls(*(np.median(cols, 0) / 255))
        notes.append({'midi': midi, 'on': float(np.median(b)), 'onSd': float(np.std(b)),
                      'off': float(np.median(tp)) if len(tp) >= 5 else None,
                      'hue': round(h * 360), 'n': len(g)})
notes.sort(key=lambda x: (x['on'], x['midi']))
# eighths in each bar: its length against the bars around it (tempo may drift, a bar may be short)
sp = {kk: us[kk] - us[kk + 1] for kk in ks if kk + 1 in us}
bar_eighths = {}
for kk, v in sp.items():
    near = [sp[j] for j in range(kk - 3, kk + 4) if j != kk and j in sp]
    bar_eighths[kk] = int(round(6 * v / float(np.median(near))))
json.dump({'bars': bar_eighths, 'speed': V, 'barPx': D, 'barSec': D / V, 'firstBarU': us[ks[0]], 'notes': notes}, open('truth.json', 'w'), indent=0)
print(len(notes), 'notes', file=sys.stderr)
