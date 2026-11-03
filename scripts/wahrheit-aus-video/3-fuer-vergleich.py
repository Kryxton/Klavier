# Step 3: truth.json -> .messung/<name>/noten.json for scripts/wahrheit.mjs (bar, eighth, length in eighths)
#   python 3-fuer-vergleich.py ../../.messung/grossformat/noten.json
import json, sys, collections
d = json.load(open('truth.json'))
bars = d['bars']            # bar number -> length in eighths
out = []
for x in d['notes']:
    bar = int(x['on'])
    per = bars.get(str(bar), 6)
    eighth = (x['on'] - bar) * per
    if x['off'] is None:
        length = None
    else:
        # length in eighths, through the bars it crosses
        end_bar = int(x['off'])
        length = 0.0
        b, frac = bar, x['on'] - bar
        while b < end_bar:
            length += (1 - frac) * bars.get(str(b), 6)
            b, frac = b + 1, 0.0
        length += (x['off'] - end_bar - frac) * bars.get(str(end_bar), 6)
    hand = 'right' if 270 <= x['hue'] <= 345 else 'left'
    out.append({'midi': x['midi'], 'hand': hand, 'bar': bar, 'eighth': round(eighth, 3),
                'len': None if length is None else round(length, 3)})
# eighths before each bar, so the reading can be compared over the whole piece
start, at = {}, 0
for b in range(1, max(int(k) for k in bars) + 1):
    start[b] = at
    at += bars.get(str(b), 6)
json.dump({'meter': '6/8', 'eighthsPerBar': 6, 'barEighths': bars, 'barStart': start, 'notes': out},
          open(sys.argv[1], 'w'), indent=0)
print(len(out), 'notes', collections.Counter(n['hand'] for n in out))
