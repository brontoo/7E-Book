"""Fresh-browser real-media timing and limited CDP JS-heap measurements. No camera."""
import statistics
import time
from playwright.sync_api import sync_playwright, expect
from common import bind_read_only_api


def run(app, base, executable=None, channel=None, proxy=None):
    report=dict(passed=False,cameraRequests=0,physicalTrackingMeasured=False,memoryScope='CDP JS heap and DOM counters only; excludes total native/GPU/WASM memory',timings={},memory=[],failures=[])
    with sync_playwright() as pw:
        options=dict(headless=True)
        if executable:options['executable_path']=executable
        if channel:options['channel']=channel
        if proxy:options['proxy']=proxy
        # Only the managed Linux container requires this browser process option.
        from pathlib import Path
        if Path('/.dockerenv').exists():options['args']=['--no-sandbox','--enable-unsafe-swiftshader']
        browser=pw.chromium.launch(**options)
        context=browser.new_context(viewport=dict(width=1440,height=1000),service_workers='block')
        blocked=[];bind_read_only_api(context,app,{'verified':[]},blocked)
        context.add_init_script('''window.__firstFrame=null;window.__cameraCalls=0;
new MutationObserver(()=>{const f=document.querySelector('.frame-book-player')?.dataset.frameDisplayed;
if(window.__firstFrame===null&&f!==undefined&&f!==''&&Number.isInteger(Number(f)))window.__firstFrame=performance.now();
}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-frame-displayed']});
if(navigator.mediaDevices){const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia=(...args)=>{window.__cameraCalls++;return native(...args)};}''')
        page=context.new_page();cdp=context.new_cdp_session(page)
        def memory(stage):
            heap=cdp.send('Runtime.getHeapUsage');dom=cdp.send('Memory.getDOMCounters')
            report['memory'].append(dict(stage=stage,jsHeapUsedBytes=heap['usedSize'],jsHeapTotalBytes=heap['totalSize'],**dom))
        try:
            page.goto(base+'/innovation-hub');memory('projects-before-game')
            cache_hits=[]
            cdp.on('Network.responseReceived',lambda event:cache_hits.append(event['response']['url']) if event['response'].get('fromDiskCache') else None)
            cdp.send('Network.enable');cdp.send('Network.setCacheDisabled',{'cacheDisabled':True})
            page.goto(base+'/eco-journey?chapter=abu-dhabi',wait_until='domcontentloaded')
            player=page.locator('.frame-book-player')
            expect(player).to_have_attribute('data-frame-displayed','238',timeout=60000)
            report['timings']['coldNavigationToFirstFrameMs']=page.evaluate('window.__firstFrame')
            memory('cold-first-frame')
            cdp.send('Network.setCacheDisabled',{'cacheDisabled':False})
            page.reload(wait_until='domcontentloaded');expect(player).to_have_attribute('data-frame-displayed','238',timeout=60000)
            # Request normal caching, then measure repeat navigation. Routing can
            # still disable HTTP cache; report observed hits rather than assuming it.
            page.reload(wait_until='domcontentloaded');expect(player).to_have_attribute('data-frame-displayed','238',timeout=60000)
            report['timings']['warmNavigationToFirstFrameMs']=page.evaluate('window.__firstFrame')
            report['observedDiskCacheHits']=len(cache_hits)
            report['cacheCaveat']='Repeat navigation in a warm browser; request routing may disable HTTP cache. Disk hits are observed, never assumed.'
            times=[]
            for _ in range(4):
                for key,index in [('ArrowLeft',237),('ArrowRight',238)]:
                    canvas=player.locator('canvas');canvas.focus();start=time.perf_counter();canvas.press(key)
                    expect(player).to_have_attribute('data-frame-displayed',str(index),timeout=30000)
                    times.append((time.perf_counter()-start)*1000)
            report['timings']['warmKeyboardScrubMs']=times
            report['timings']['warmKeyboardScrubMedianMs']=statistics.median(times)
            memory('after-scrub')
            report['cameraRequests']=page.evaluate('window.__cameraCalls');assert report['cameraRequests']==0
            page.locator('.book-header .book-expo-link').click()
            expect(page.locator('.frame-book-player')).to_have_count(0)
            page.wait_for_timeout(250);memory('after-route-cleanup')
            report['blockedApiMutations']=blocked
            assert not blocked
            report['passed']=True
        except Exception as error:report['failures'].append(str(error).splitlines()[0] if str(error) else type(error).__name__)
        finally:browser.close()
    return report
