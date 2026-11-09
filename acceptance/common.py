"""Read-only QA helpers. Never changes application source, media or real progress."""
import hashlib
import json
from pathlib import Path
import re
import urllib.request
from urllib.parse import unquote, urlparse

EXPO_COMMIT = '07f4e1fe9ade229efdaf3bfc4b026cba917801b6'
MEDIA = 'https://hjqyhybgitdizfhwpdcv.supabase.co/storage/v1/object/public/seven-emirates-game/7e-1bc718ef5e77/'
MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'
EXPECTED_MANIFEST_SHA = '96e7635ce959133c36268b0028474f0737932af5dd498977e7a5d1b69a34d11f'
IDS = ['abu-dhabi','dubai','sharjah','ajman','umm-al-quwain','ras-al-khaimah','fujairah']


def validate_manifest(raw):
    if hashlib.sha256(raw).hexdigest() != EXPECTED_MANIFEST_SHA:
        raise ValueError('Published manifest SHA differs from the reviewed immutable manifest')
    m = json.loads(raw)
    if (m['schemaVersion'],m['mediaVersion'],m['width'],m['height'],m['frameCount']) != (1,'7e-1bc718ef5e77',1920,1080,1673):
        raise ValueError('Manifest version, dimensions or count mismatch')
    if len(m['frames']) != 1673 or len(m['chapters']) != 7:
        raise ValueError('Manifest inventory mismatch')
    keys = set()
    for i, f in enumerate(m['frames']):
        key = f['url']
        if f['index'] != i or (f['width'], f['height']) != (1920,1080):
            raise ValueError('Invalid global frame index or Full HD dimensions')
        if type(f['byteLength']) is not int or f['byteLength'] <= 0 or not re.fullmatch('[0-9a-f]{64}',f['sha256']):
            raise ValueError('Invalid frame integrity metadata')
        if key in keys or key.startswith('/') or '..' in key.split('/') or urlparse(key).scheme:
            raise ValueError('Invalid/duplicate relative asset key')
        keys.add(key)
    end = 0
    for i,c in enumerate(m['chapters']):
        if c['chapterId'] != IDS[i] or c['startInclusive'] != end or not end < c['endExclusive'] <= 1673:
            raise ValueError('Invalid ordered chapter range')
        if not end <= c['restingFrame'] < c['endExclusive']:
            raise ValueError('Invalid resting frame')
        end = c['endExclusive']
    if end != 1673:
        raise ValueError('Chapter coverage mismatch')
    return dict(passed=True,recordsVerified=1673,manifestSha256=EXPECTED_MANIFEST_SHA,
                chapters=[{k:c[k] for k in ('chapterId','startInclusive','endExclusive','restingFrame')} for c in m['chapters']])


def fetch_manifest():
    with urllib.request.urlopen(MEDIA+'manifest.json',timeout=30) as response:
        if response.status != 200 or 'application/json' not in response.headers.get('Content-Type',''):
            raise ValueError('Public manifest HTTP/MIME check failed')
        return validate_manifest(response.read())


def compare_models():
    sources = {}
    for label, url in [('pinned', MODEL), ('prototype', 'https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task')]:
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                body = response.read()
                sources[label] = dict(url=url, status=response.status, byteLength=len(body), sha256=hashlib.sha256(body).hexdigest())
        except Exception as error:
            sources[label] = dict(url=url, error=str(error))
    verified = all(sources[k].get('status') == 200 and sources[k].get('byteLength', 0) > 0 for k in ('pinned', 'prototype'))
    same = sources['pinned'].get('sha256') == sources['prototype'].get('sha256') if verified else None
    return dict(verified=verified, sameBytes=same, sources=sources,
                requiresPhysicalComparison=not (verified and same), modelVersionUnchanged=True)


def bind_read_only_api(context, app, state, blocked):
    bindings = re.findall(r'id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*missionSlug:\s*"([^"]+)"',
                          Path(app,'client/src/components/book/chapters.ts').read_text())
    def mutation_guard(route):
        if route.request.method not in ('GET', 'HEAD', 'OPTIONS'):
            blocked.append(dict(method=route.request.method, reason='Non-read request blocked'))
            route.abort()
        else:
            route.continue_()  # Actual GET response bytes are never replaced.
    context.route('**/*', mutation_guard)
    def api(route):
        if route.request.method not in ('GET','OPTIONS'):
            blocked.append(dict(method=route.request.method,reason='API mutation blocked'))
            route.abort();return
        rows=[]
        for name in unquote(urlparse(route.request.url).path.split('/api/trpc/')[-1]).split(','):
            if name=='auth.me':
                value=dict(id=9101,email='physical-qa@example.invalid',name='Read-only camera QA',role='student',openId='physical-qa')
            elif name=='missions.getAll':
                value=[dict(id=i+1,slug=c[2],title=c[1]) for i,c in enumerate(bindings)]
            elif name=='passport.getMine':
                value=dict(missionStates=[dict(missionId=i,status='verified') for i in state['verified']],totalPoints=25*len(state['verified']),badges=[])
            elif name in ('projects.getStats','teacher.getAnalytics'):
                value=dict(totalProjects=0,totalStudents=0,totalVotes=0)
            else:value=[]
            rows.append({'result':{'data':{'json':value}}})
        route.fulfill(content_type='application/json',body=json.dumps(rows))
    context.route('**/api/trpc/**',api)


def automated_summary(manifest, browser, performance, browser_exit, models=None):
    indices = [i for c in manifest.get('chapters',[]) for i in (c['startInclusive'],c['endExclusive']-1)]
    complete = (manifest.get('passed') is True and manifest.get('recordsVerified') == 1673 and
                browser_exit == 0 and browser.get('remoteVerified') is True and browser.get('modelInitialized') is True and
                [s['index'] for s in browser.get('samples',[])] == indices and len(indices)==14 and
                len(browser.get('timings',{}).get('boundaryKeyToDisplayedMs',[]))==12 and performance.get('passed') is True and
                (models or {}).get('verified') is True and (models or {}).get('sameBytes') is True)
    comparison = models or browser.get('originalModelComparison',{})
    return dict(automatedPassed=bool(complete),productionRecommendation='NO-GO: physical camera and genuine nonproduction educational acceptance require review',
                physicalCameraVerified=False,expoCommit=EXPO_COMMIT,recordsVerified=manifest.get('recordsVerified',0),
                boundarySamplesVerified=len(browser.get('samples',[])),transitionsVerified=len(browser.get('timings',{}).get('boundaryKeyToDisplayedMs',[]))//2,
                modelInitialized=browser.get('modelInitialized',False),originalModelComparison=comparison,
                originalModelStatus='same-bytes' if comparison.get('sameBytes') is True else 'different-bytes' if comparison.get('sameBytes') is False else 'unverified')
