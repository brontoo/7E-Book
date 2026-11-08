/*
 * THE SEVEN EMIRATES — MASTER INTERACTIVE TIMELINE
 * Seven original, user-produced 1920×1080 / 24 fps videos, decoded as
 * 1,673 individually seekable Full HD WebP frames (no separate video overlays).
 * No automatic playback: all changes originate from a user action.
 */
(() => {
  'use strict';

  const CLIPS = Object.freeze([
    { id:'abu-dhabi',       name:'Abu Dhabi',      folder:'01-AD',  short:'01 / ABU DHABI' },
    { id:'dubai',           name:'Dubai',          folder:'02-DXB', short:'02 / DUBAI' },
    { id:'sharjah',         name:'Sharjah',        folder:'03-SHJ', short:'03 / SHARJAH' },
    { id:'ajman',           name:'Ajman',          folder:'04-AJ',  short:'04 / AJMAN' },
    { id:'umm-al-quwain',   name:'Umm Al Quwain',  folder:'05-UMQ', short:'05 / UMM AL QUWAIN' },
    { id:'ras-al-khaimah', name:'Ras Al Khaimah', folder:'06-RAK', short:'06 / RAS AL KHAIMAH' },
    { id:'fujairah',        name:'Fujairah',       folder:'07-FUJ', short:'07 / FUJAIRAH' }
  ]);
  const FRAMES_PER_CLIP = 239;
  const FPS = 24;
  const TOTAL_FRAMES = CLIPS.length * FRAMES_PER_CLIP;
  const DURATION = TOTAL_FRAMES / FPS;
  const CONFIG = Object.freeze({width:1920,height:1080, fps:FPS, totalFrames:TOTAL_FRAMES,
    cacheLimit:30, maxConcurrent:7, prefetchForward:11, prefetchBackward:7});

  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#bookCanvas');
  const ctx = canvas?.getContext('2d',{alpha:false, desynchronized:true});
  if (!ctx) { console.error('Full HD canvas could not be initialized'); return; }
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  const viewport=$('#viewport'), loading=$('#loading'), slider=$('#scrubber'),
        pill=$('#pillText'), chapterTitle=$('#chapterTitle'), readout=$('#readout'),
        prev=$('#prev'), next=$('#next'), chapterNav=$('#chapters'),
        clipIndicator=$('#clipIndicator'), playerState=$('#playerState'),
        counter=$('#frameCounter');
  slider.max=String(TOTAL_FRAMES-1);
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const timeOf=(f)=>f/FPS;
  const videoOf=(f)=>clamp(Math.floor(f/FRAMES_PER_CLIP),0,CLIPS.length-1);
  const localOf=(f)=>f%FRAMES_PER_CLIP;
  const frameURL=(i)=>`frames/${CLIPS[videoOf(i)].folder}/f_${String(localOf(i)).padStart(4,'0')}.webp`;
  const chapterStops = Object.freeze([
    {id:'cover',name:'The Cover',short:'THE COVER',at:0},
    ...CLIPS.map((c,j)=>({...c,at:(j+1)*FRAMES_PER_CLIP-1}))
  ]);
  const READY= new Map(); // frame -> {img, state:'loading'|'ready'}
  const PENDING=new Map(); // frame -> priority
  let activeRequests=0;
  let currentFrame=0, drawnFrame=-1, firstPaint=false;
  let direction=1, lastPrefetchAnchor=-999;
  let animationId=null, dragging=false, pointerId=null, downX=0, downFrame=0;
  let gestureHolding=false, timelineControlHeld=false;
  let drawingPending=false;
  let lastEventFrame=-1;
  const issueEvent=(reason)=>window.dispatchEvent(new CustomEvent('emiratesbook:activity',{
    detail:{reason,frame:currentFrame,time:timeOf(currentFrame),dragging,
      navigating:animationId!==null,gestureHolding,timelineControlHeld}
  }));

  // Never request the entire journey at once: a small, prioritized set of
  // Full HD frames is decoded around the playhead. Stale work is discarded.
  function schedule(i, urgent=false) {
    if (!Number.isInteger(i) || i<0 || i>=TOTAL_FRAMES || READY.has(i)) return;
    if (PENDING.has(i)) { if (urgent) PENDING.set(i,100);return; }
    PENDING.set(i,urgent?100:1);
    if (PENDING.size>56) {
      for (const [k,p] of [...PENDING]) {
        if (p<100 && Math.abs(k-currentFrame)>18)PENDING.delete(k);
      }
    }
    pump();
  }
  function pump() {
    while (activeRequests<CONFIG.maxConcurrent && PENDING.size) {
      let candidate=null,score=-Infinity;
      for (const [i,p] of PENDING) {
        const dist=Math.abs(i-currentFrame);
        const s=p*1000-dist;
        if(s>score){score=s;candidate=i;}
      }
      if(candidate===null)break;
      PENDING.delete(candidate);
      if(READY.has(candidate))continue;
      const idx=candidate;
      const img=new Image();
      img.decoding='async';
      const entry={img,state:'loading'};
      READY.set(idx,entry);
      activeRequests++;
      img.onload=()=>{
        entry.state='ready';
        activeRequests--;
        if(idx===currentFrame) draw(img,idx);
        trimCache();pump();
      };
      img.onerror=()=>{
        activeRequests--;
        READY.delete(idx);
        console.warn('Frame could not be loaded',frameURL(idx));
        if(idx===currentFrame) {
          playerState.textContent='Frame unavailable — check extracted project files';
          if(!firstPaint) {
            loading.querySelector('p').textContent='Could not load the frames. Run the complete folder using Live Server or localhost.';
            loading.querySelector('.spinner').style.display='none';
          }
        }
        pump();
      };
      if (idx===currentFrame) img.fetchPriority='high';
      img.src=frameURL(idx);
    }
  }
  function trimCache(){
    const loaded=[...READY.entries()].filter(([i,v])=>v.state==='ready' && i!==currentFrame);
    if(loaded.length<=CONFIG.cacheLimit-1)return;
    loaded.sort((a,b)=>Math.abs(b[0]-currentFrame)-Math.abs(a[0]-currentFrame));
    while(READY.size>CONFIG.cacheLimit && loaded.length){
      READY.delete(loaded.shift()[0]);
    }
  }
  function draw(image,i){
    if (!image?.complete || !image.naturalWidth) return;
    ctx.drawImage(image,0,0,CONFIG.width,CONFIG.height);
    drawnFrame=i;
    if(!firstPaint){
      firstPaint=true;
      loading.classList.add('hidden');
      loading.setAttribute('aria-hidden','true');
    }
    playerState.textContent='Handcrafted · Full HD';
  }
  function prefetch(anchor){
    if(Math.abs(anchor-lastPrefetchAnchor)<4 && firstPaint) return;
    lastPrefetchAnchor=anchor;
    const a=direction>0?CONFIG.prefetchForward:CONFIG.prefetchBackward;
    const b=direction>0?CONFIG.prefetchBackward:CONFIG.prefetchForward;
    for(let n=1;n<=a;n++)schedule(anchor+n,false);
    for(let n=1;n<=b;n++)schedule(anchor-n,false);
    // Cross-clip preloading works because timeline is genuinely continuous.
    trimCache();
  }
  function updateChapter(){
    // The first half of each later clip still shows its preceding emirate,
    // so switch chapter labels only after the physical page has turned.
    if(currentFrame===0)return 0;
    const clip=videoOf(currentFrame),offset=localOf(currentFrame);
    if(clip===0)return offset<72?0:1;
    return offset<115?clip:clip+1;
  }
  function updateUI(){
    const ci=updateChapter();
    const pct=Math.round(currentFrame/(TOTAL_FRAMES-1)*100);
    slider.value=String(currentFrame);
    slider.style.setProperty('--progress',pct+'%');
    readout.textContent=`${pct}% · ${timeOf(currentFrame).toFixed(2)}s / ${DURATION.toFixed(2)}s`;
    chapterTitle.textContent=chapterStops[ci].name;
    pill.textContent=chapterStops[ci].short;
    clipIndicator.textContent=`${String(videoOf(currentFrame)+1).padStart(2,'0')} / 07`;
    counter.textContent=`${String(currentFrame+1).padStart(4,'0')} / ${TOTAL_FRAMES}`;
    viewport.setAttribute('aria-valuenow',String(pct));
    viewport.setAttribute('aria-valuetext',`${chapterStops[ci].name}, frame ${currentFrame+1} of ${TOTAL_FRAMES}`);
    [...chapterNav.children].forEach((b,j)=>{
      b.classList.toggle('active',ci===j);
      b.setAttribute('aria-current',ci===j?'step':'false');
    });
    prev.disabled=currentFrame<=0;
    next.disabled=currentFrame>=TOTAL_FRAMES-1;
  }
  function setFrame(value,options={}){
    const i=clamp(Math.round(value),0,TOTAL_FRAMES-1);
    if(i!==currentFrame)direction=i>currentFrame?1:-1;
    currentFrame=i;
    schedule(i,true);
    const entry=READY.get(i);
    if(entry?.state==='ready' && drawnFrame!==i)draw(entry.img,i);
    if(!options.noPrefetch)prefetch(i);
    updateUI();
    if(lastEventFrame!==i || options.forceActivity){
      lastEventFrame=i;issueEvent('frame');
    }
  }
  function cancelNavigation(){
    if(animationId!==null)cancelAnimationFrame(animationId);
    animationId=null;
  }
  function navigateTo(target){
    cancelNavigation();
    const beginningFrame=currentFrame;
    const destination=clamp(Math.round(target),0,TOTAL_FRAMES-1);
    if(destination===beginningFrame)return;
    viewport.classList.add('used');
    issueEvent('navigation-start');
    const delta=Math.abs(destination-beginningFrame);
    const duration=clamp(delta/FPS*210,450,5000);
    const startTime=performance.now();
    const loop=now=>{
      const u=clamp((now-startTime)/duration,0,1);
      const eased=u*u*(3-2*u);
      setFrame(beginningFrame+(destination-beginningFrame)*eased);
      if(u<1)animationId=requestAnimationFrame(loop);
      else{animationId=null;issueEvent('navigation-end');}
    };
    animationId=requestAnimationFrame(loop);
  }
  chapterStops.forEach((chapter,j)=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='chapter';
    button.setAttribute('aria-label',`Go to ${chapter.name}`);
    button.innerHTML='<span class="dot" aria-hidden="true"></span><span class="chapterName"></span><span class="chapterIndex"></span>';
    button.querySelector('.chapterName').textContent=chapter.name;
    button.querySelector('.chapterIndex').textContent=j?String(j).padStart(2,'0'):'START';
    button.addEventListener('click',()=>navigateTo(chapter.at));
    chapterNav.appendChild(button);
  });
  function pointerDown(event){
    if(event.button!==0 && event.pointerType!=='touch')return;
    cancelNavigation();dragging=true;pointerId=event.pointerId;
    downX=event.clientX;downFrame=currentFrame;
    viewport.classList.add('isDragging','used');
    viewport.setPointerCapture(event.pointerId);
    issueEvent('pointer-down');
    event.preventDefault();
  }
  function pointerMove(event){
    if(!dragging || pointerId!==event.pointerId)return;
    // One full viewport-width drag ~= one 10-second physical page-turn clip.
    const delta=(downX-event.clientX)/Math.max(350,viewport.clientWidth)*FRAMES_PER_CLIP;
    setFrame(downFrame+delta);
    event.preventDefault();
  }
  function pointerUp(event){
    if(!dragging || pointerId!==event.pointerId)return;
    dragging=false;pointerId=null;
    viewport.classList.remove('isDragging');
    if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);
    issueEvent('pointer-up');
  }
  viewport.addEventListener('pointerdown',pointerDown);
  viewport.addEventListener('pointermove',pointerMove);
  viewport.addEventListener('pointerup',pointerUp);
  viewport.addEventListener('pointercancel',pointerUp);
  viewport.addEventListener('lostpointercapture',()=>{
    if(!dragging)return;
    dragging=false;pointerId=null;viewport.classList.remove('isDragging');issueEvent('pointer-up');
  });
  slider.addEventListener('pointerdown',()=>{timelineControlHeld=true;issueEvent('slider-down');});
  const sliderUp=()=>{if(timelineControlHeld){timelineControlHeld=false;issueEvent('slider-up');}};
  window.addEventListener('pointerup',sliderUp);
  window.addEventListener('pointercancel',sliderUp);
  slider.addEventListener('change',sliderUp);
  slider.addEventListener('input',()=>{cancelNavigation();viewport.classList.add('used');setFrame(Number(slider.value),{forceActivity:true});});
  prev.addEventListener('click',()=>{
    const stop=[...chapterStops].reverse().find(c=>c.at<currentFrame-7) || chapterStops[0];
    navigateTo(stop.at);
  });
  next.addEventListener('click',()=>{
    const stop=chapterStops.find(c=>c.at>currentFrame+7) || chapterStops[chapterStops.length-1];
    navigateTo(stop.at);
  });
  viewport.addEventListener('keydown',event=>{
    let delta=null;
    if(event.key==='ArrowLeft')delta=event.shiftKey?24:6;
    if(event.key==='ArrowRight')delta=event.shiftKey?-24:-6;
    if(event.key==='Home'){cancelNavigation();setFrame(0);event.preventDefault();return;}
    if(event.key==='End'){cancelNavigation();setFrame(TOTAL_FRAMES-1);event.preventDefault();return;}
    if(delta!==null){cancelNavigation();setFrame(currentFrame+delta);viewport.classList.add('used');event.preventDefault();}
  });

  window.EmiratesBook=Object.freeze({
    get totalFrames(){return TOTAL_FRAMES;},
    get fps(){return FPS;},
    get currentTime(){return timeOf(currentFrame);},
    get frame(){return currentFrame;},
    get chapters(){return chapterStops.map(c=>({...c}));},
    get clips(){return CLIPS.map((c,j)=>({...c,firstFrame:j*FRAMES_PER_CLIP,lastFrame:(j+1)*FRAMES_PER_CLIP-1}));},
    seekFrame(i){cancelNavigation();viewport.classList.add('used');setFrame(i);},
    seek(seconds){cancelNavigation();viewport.classList.add('used');setFrame(Math.round(seconds*FPS));},
    goToChapter(id){const c=chapterStops.find(x=>x.id===id);if(c)navigateTo(c.at);},
    setGestureHolding(active){const value=Boolean(active);if(value!==gestureHolding){gestureHolding=value;cancelNavigation();issueEvent(value?'gesture-grab':'gesture-release');}},
    get isBusy(){return dragging||animationId!==null||gestureHolding||timelineControlHeld;},
    get currentChapter(){return chapterStops[updateChapter()].id;}
  });
  updateUI();
  schedule(0,true);
  for(let i=1;i<=11;i++)schedule(i);
  if(location.protocol==='file:') {
    // The camera's ES-module dependencies are reliably available on localhost.
    console.info('For hand gestures, open this project via Live Server or localhost rather than file://.');
  }
})();
