"""Helpers for the local security test harness (API on localhost:3100, DB adoptafacil_sec)."""
import json
import os
import requests

SEC = os.environ.get('AUDIT_DIR', './auditoria-seguridad') + ''
API = 'http://localhost:3100'


def actors():
    d = {}
    for line in open(f'{SEC}/evidencia/actors.env'):
        if '=' in line:
            k, v = line.strip().split('=', 1)
            d[k] = v
    return d


A = actors()


def call(method, path, who=None, body=None, headers=None, files=None, raw=False):
    h = dict(headers or {})
    if who:
        h['authorization'] = 'Bearer ' + A.get(who, who)
    r = requests.request(method, API + path, json=None if files else body, files=files,
                         headers=h, allow_redirects=False)
    try:
        j = r.json()
    except Exception:
        j = r.text[:300]
    return r.status_code, (r if raw else j)


def save(name, obj):
    p = f'{SEC}/evidencia/{name}.json'
    old = json.load(open(p)) if os.path.exists(p) else {}
    old.update(obj)
    json.dump(old, open(p, 'w'), indent=1, default=str)


def load(name):
    return json.load(open(f'{SEC}/evidencia/{name}.json'))


def short(j, n=220):
    s = j if isinstance(j, str) else json.dumps(j, ensure_ascii=False)
    return s[:n]
