"""Owner-operated real camera session. No fake camera, model/media interception or image recording.
Only test account/progress GET responses are fixtures; ALL API mutations are blocked.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from common import EXPO_COMMIT, IDS, bind_read_only_api

QUESTIONS = {
 'physicalDevice':'I used a physical webcam, not a virtual camera',
 'noAutoPrompt':'No camera prompt before Enable Hand Controls',
 'fistDirection':'Fist LEFT advances and RIGHT reverses',
 'fistSmooth':'Fist movement is proportional and smooth',
 'fistStop':'Releasing fist stops immediately; no inertia',
 'fistAnchor':'First fist detection causes no frame jump',
 'pointer':'Pointer is smooth, mirrored and targets controls',
 'trackingLoss':'Pointer disappears when hand tracking is lost',
 'pinchOnce':'One click per pinch/release; held pinch never repeats',
 'scopedClick':'Locked/disabled/unrelated controls never activate',
 'sevenChapters':'All seven chapters display in All chapters mode',
 'sixBoundaries':'All six boundaries work forward AND backward',
 'chapterLabels':'Educational labels match displayed frames',
 'locks':'Locked mode cannot pass the first incomplete mission',
 'noRewards':'Navigating never creates real points or stamps',
 'shutdown':'Disable Camera stops the camera indicator',
 'routeShutdown':'Leaving book stops camera; returning does not restart',
 'noDuplicates':'Repeated enable/disable never creates duplicate streams',
 'otherInputs':'Mouse, touch, keyboard and slider remain usable',
 'modelComparison':'Compared with original prototype if model hashes differ',
}
INSTRUMENT = r'''(() => {
const active=new Set();let maxActive=0;window.__qaMetrics={cameraCalls:0,cameraAcquired:0,maxActive:0,frames:[],cameraStates:[]};
const record=(kind,extra={})=>{window.qaEvent?.({kind,at:Date.now(),...extra}).catch(()=>{});};
if(navigator.mediaDevices){const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia=(...args)=>{window.__qaMetrics.cameraCalls++;record('permission-request');return native(...args).then(stream=>{
window.__qaMetrics.cameraAcquired++;for(const track of stream.getTracks()){
active.add(track);maxActive=Math.max(maxActive,active.size);window.__qaMetrics.maxActive=maxActive;
const settings=track.getSettings();record('track-start',{active:active.size,width:settings.width,height:settings.height,frameRate:settings.frameRate});
const stopped=()=>{active.delete(track);record('track-stop',{active:active.size});};
track.addEventListener('ended',stopped,{once:true});const stop=track.stop.bind(track);track.stop=()=>{stop();stopped();};
}return stream;},error=>{record('permission-error',{name:error.name});throw error;});};}
window.__qaActive=()=>active.size;
let requested=null,requestedAt=0,lastDisplayed=null,lastCamera=null;
new MutationObserver(()=>{
 const player=document.querySelector('.frame-book-player');const camera=document.querySelector('.book-gesture-controls')?.dataset.cameraStatus||'unmounted';
 if(camera!==lastCamera){lastCamera=camera;record('camera-state',{status:camera});}
 if(!player)return;
 const request=player.dataset.frameRequested,display=player.dataset.frameDisplayed;
 if(request!==requested){requested=request;requestedAt=performance.now();}
 if(display!==''&&display!==lastDisplayed){lastDisplayed=display;const row={at:Date.now(),frame:Number(display),requestToDisplayMs:display===requested?performance.now()-requestedAt:null,cameraActive:camera==='active'};
 window.__qaMetrics.frames.push(row);if(window.__qaMetrics.frames.length>500)window.__qaMetrics.frames.shift();}
}).observe(document,{subtree:true,attributes:true,childList:true,attributeFilter:['data-frame-requested','data-frame-displayed','data-camera-status']});
})();'''
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--app',type=Path,required=True);p.add_argument('--base-url',default='http://127.0.0.1:4174')
p.add_argument('--channel',choices=['chrome','msedge'],default='chrome');p.add_argument('--report',type=Path,required=True)
p.add_argument('--timeout-minutes',type=int,default=30)
a=p.parse_args()
if urlparse(a.base_url).hostname not in ('localhost','127.0.0.1'):raise SystemExit('Use only the isolated localhost preview')
if subprocess.check_output(['git','-C',str(a.app),'rev-parse','HEAD'],text=True).strip()!=EXPO_COMMIT:raise SystemExit('Unexpected app commit')
report=dict(expoCommit=EXPO_COMMIT,browser=a.channel,physicalCameraVerified=False,cameraStreamObserved=False,
 mediaOrModelMocked=False,syntheticVideoUsed=False,authAndProgressFixtures=True,educationalAcceptance='NOT TESTED: requires genuine nonproduction accounts in a separate normal browser',
 recommendation='NO-GO pending independent review and nonproduction educational acceptance',events=[],networkFailures=[],memory=[],sessions=[],answers={k:'not-tested' for k in QUESTIONS},blockedApiMutations=[])
a.report.parent.mkdir(parents=True,exist_ok=True)
def save():a.report.write_text(json.dumps(report,indent=2)+'\n')
save()
with sync_playwright() as pw:
    browser=pw.chromium.launch(channel=a.channel,headless=False)
    context=browser.new_context(viewport=None,service_workers='block')
    state={'verified':[]};bind_read_only_api(context,a.app,state,report['blockedApiMutations'])
    context.add_init_script(INSTRUMENT)
    # Presentation-only seen-stamp state suppresses replay animations, never server rewards.
    context.add_init_script("localStorage.setItem('sevenEmiratesBook:v1:9101',JSON.stringify({chapter:0,seenStamps:"+json.dumps(IDS)+"}));")
    commands=[]
    def event(_source,value):
        if isinstance(value,dict):
            report['events'].append(value)
            if value.get('kind')=='track-start':report['cameraStreamObserved']=True
    context.expose_binding('qaEvent',event)
    context.expose_binding('qaCommand',lambda _source,value:commands.append(value))
    page=context.new_page();cdp=context.new_cdp_session(page)
    page.on('requestfailed',lambda request:report['networkFailures'].append(dict(url=request.url,error=request.failure)) if any(host in request.url for host in ('hjqyhybgitdizfhwpdcv.supabase.co','cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/','storage.googleapis.com/mediapipe')) else None)
    rows=''.join('<label style="display:block;margin:7px 0">'+text+'<select data-question="'+key+'"><option value="not-tested">Not tested</option><option value="yes">Yes</option><option value="no">No</option></select></label>' for key,text in QUESTIONS.items())
    panel='''<details open style="position:fixed;right:8px;bottom:8px;z-index:2147483640;background:white;color:#17382c;border:2px solid #376955;padding:12px;max-height:72vh;width:310px;overflow:auto;font:13px system-ui">
<summary><b>Owner camera QA — click to collapse</b></summary><p>REAL CAMERA + MEDIA. SIMULATED ACCOUNT/PROGRESS. Nothing is submitted.</p>
<p>Use a physical mouse on this panel. Collapse it while testing.</p>
<button data-command="locked">Locked mode</button> <button data-command="all">All chapters</button> <button data-command="projects">Visit Projects</button> <button data-command="book">Return to book</button>
<p>Camera starts only with the game's Enable Hand Controls button.</p>'''+rows+'''<p>Disable Camera before saving.</p><button data-command="finish">Save and finish</button></details>'''
    def install():
        page.evaluate('''html=>{if(document.querySelector('#owner-qa'))return;const host=document.createElement('div');host.id='owner-qa';host.innerHTML=html;document.body.append(host);
 host.addEventListener('click',e=>{const cmd=e.target.dataset.command;if(!cmd)return;
 if(cmd==='finish'&&window.__qaActive?.()>0){alert('Please use Disable Camera before saving.');return;}
 const answers=Object.fromEntries([...host.querySelectorAll('[data-question]')].map(el=>[el.dataset.question,el.value]));window.qaCommand({command:cmd,answers});});}''',panel)
        page.evaluate('(answers)=>{for(const el of document.querySelectorAll("#owner-qa [data-question]"))el.value=answers[el.dataset.question]||"not-tested"}',report['answers'])
    page.goto(a.base_url+'/eco-journey?chapter=abu-dhabi');install()
    print('Use the visible browser. Reports are saved automatically to: '+str(a.report),flush=True)
    deadline=time.monotonic()+a.timeout_minutes*60;last_saved=0;done=False
    try:
        while not page.is_closed() and not done and time.monotonic()<deadline:
            page.wait_for_timeout(250)
            if not page.locator('#owner-qa').count():install()
            while commands:
                cmd=commands.pop(0);report['answers'].update({k:v for k,v in cmd.get('answers',{}).items() if k in QUESTIONS and v in ('yes','no','not-tested')})
                action=cmd.get('command')
                snapshot=page.evaluate('window.__qaMetrics');report['sessions'].append(snapshot)
                if action=='finish':done=True;break
                if action in ('all','locked'):state['verified']=list(range(1,8)) if action=='all' else []
                target='/innovation-hub' if action=='projects' else '/eco-journey?chapter=abu-dhabi'
                # In-page router navigation allows the game's actual route-unmount cleanup.
                page.evaluate("path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));}",target)
                page.wait_for_timeout(300);install()
                if action in ('all','locked'):page.reload();install()
            if time.monotonic()-last_saved>2:
                heap=cdp.send('Runtime.getHeapUsage');report['memory'].append(dict(at=time.time(),jsHeapUsedBytes=heap['usedSize'],scope='JS heap only; not GPU/native/WASM total'))
                save();last_saved=time.monotonic()
        if not page.is_closed():
            report['sessions'].append(page.evaluate('window.__qaMetrics'))
            report['activeTracksAtFinish']=page.evaluate('window.__qaActive?.() ?? 0')
        report['completedViaPanel']=done
    finally:
        browser.close();save()
print('Saved. Owner answers are self-reported; this tool does not approve production.')
