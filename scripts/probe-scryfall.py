"""Probe Scryfall search semantics (rate-limited, cached). Dev-only; results informed the local query engine.
Usage: python3 scripts/probe-scryfall.py "e:tla id:w" "e:tla c:m" ..."""
import hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request

CACHE = os.path.join(os.path.dirname(__file__), '..', '.cache', 'probe')
os.makedirs(CACHE, exist_ok=True)
UA = 'Loupe/1.0 (query-engine development)'
last = [0.0]


def search(q):
    path = os.path.join(CACHE, hashlib.sha1(q.encode()).hexdigest()[:16] + '.json')
    if os.path.exists(path):
        return json.load(open(path))
    url = 'https://api.scryfall.com/cards/search?' + urllib.parse.urlencode({'q': q, 'unique': 'prints'})
    out = {'q': q, 'ids': [], 'names': [], 'warnings': [], 'status': 200, 'details': None}
    while url:
        wait = 0.75 - (time.time() - last[0])
        if wait > 0:
            time.sleep(wait)
        last[0] = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req) as r:
                d = json.load(r)
        except urllib.error.HTTPError as e:
            d = json.load(e)
            out['status'] = e.code
            out['details'] = d.get('details')
            out['warnings'] += d.get('warnings', []) or []
            break
        out['ids'] += [c['id'] for c in d['data']]
        out['names'] += [c['name'] for c in d['data']]
        out['warnings'] += d.get('warnings', []) or []
        url = d.get('next_page') if d.get('has_more') else None
    json.dump(out, open(path, 'w'))
    return out


if __name__ == '__main__':
    for q in sys.argv[1:]:
        r = search(q)
        print(f"{r['status']} n={len(r['ids'])} warn={r['warnings'][:1]} det={r['details']} :: {q}")
        if len(r['names']) <= 12:
            print('   ', r['names'])
