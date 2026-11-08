/**
 * The Seven Emirates — optional camera-driven gesture interaction.
 * MediaPipe Tasks Vision is loaded only on explicit opt-in.
 * No camera frames are captured, uploaded, recorded, or stored by this application.
 * Webcam activity stops on disable / tab hide / page unload.
 */
import { clamp, smooth, mirrorX, pinchRatio, looksLikePointing,
  screenPoint, fistToFrame, centerOfPalm, pickInteractiveAtPoint } from './gesture-logic.mjs';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/vision_bundle.mjs';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task';
// The complete journey is now seven independent, consecutive Full HD clips.
const totalFrames = () => window.EmiratesBook?.totalFrames ?? 1673;
const CONNECTORS = [
  [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12], [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20], [0,17]
];
const OPTIONS = {
  inferenceIntervalMs: 68,         // ~15 inferences / second, limiting main-thread work
  fistStabilityMs: 135,           // avoid inadvertent motion
  fistDeadZone: 0.014,
  framesPerCameraWidth: 425,      // A broad fist sweep advances roughly one 10-second emirate
  pointerSmoothing: 0.35,
  fistSmoothing: 0.38,
  pinchCloseRatio: 0.43,
  pinchReleaseRatio: 0.64,        // hysteresis suppresses jitter
  pinchStableMs: 90,
  clickCooldownMs: 530,
  pointerGraceMs: 430,
  lostHandMs: 480
};

const q = sel => document.querySelector(sel);
const onOff = q('#gestureToggle');
const dot = q('#gestureIndicator');
const status = q('#gestureStatus');
const cam = q('#gestureCam');
const preview = q('#gestureVideo');
const skeleton = q('#gestureSkeleton');
const previewStatus = q('#gestureCamBadge');
const cursor = q('#gesturePointer');
const toast = q('#gestureToast');
const viewport = q('#viewport');
const scrubber = q('#scrubber');
const previewCtx = skeleton.getContext('2d');

let recognizer = null;
let stream = null;
let running = false;
let initializing = false;
let sequence = 0;
let rafHandle = 0;
let lastVideoTime = -1;
let lastInferenceAt = 0;
let lastHandAt = 0;
let fistCandidateAt = 0;
let lastFistAt = 0;
let fistAnchor = null;
let fistX = null;
let pointerX = null;
let pointerY = null;
let pointerReady = false;
let lastPointAt = 0;
let pinchDown = false;
let pinchCandidateAt = 0;
let lastClickAt = -Infinity;
let currentMode = 'idle';
let lastStatus = '';
let lastToastAt = -Infinity;
let isManualDragging = false;

function setStatus(message, state='idle') {
  if (message === lastStatus && status.dataset.state === state) return;
  lastStatus = message;
  status.textContent = message;
  status.dataset.state = state;
  previewStatus.textContent = message;
}
function showToast(message,now=performance.now()) {
  if (now - lastToastAt < 1200) return;
  lastToastAt = now;
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(()=>{if(performance.now()-lastToastAt>850)toast.classList.remove('visible')},1000);
}
function hidePointer() {
  pointerReady = false;
  pointerX = pointerY = null;
  cursor.classList.remove('visible','isPinching');
}
function resetInput({hide=true}={}) {
  fistCandidateAt = 0;
  lastFistAt = 0;
  fistAnchor = null;
  fistX = null;
  pinchDown = false;
  pinchCandidateAt = 0;
  currentMode = 'idle';
  window.EmiratesBook?.setGestureHolding?.(false);
  if (hide) hidePointer();
}
function updateButton() {
  onOff.classList.toggle('isOn',running);
  onOff.setAttribute('aria-pressed',String(running));
  onOff.textContent = running ? '■  Disable hand controls' : '✦  Enable hand controls';
  onOff.disabled = initializing;
  dot.classList.toggle('on', running);
  cam.classList.toggle('active',running);
  cam.setAttribute('aria-hidden',String(!running));
}
function stopCameraTracks() {
  if (stream) for (const track of stream.getTracks()) track.stop();
  stream = null;
  preview.srcObject = null;
}
function stop({message='Hand controls disabled'}={}) {
  sequence++;
  initializing = false;
  running = false;
  cancelAnimationFrame(rafHandle);
  rafHandle = 0;
  stopCameraTracks();
  try { recognizer?.close?.(); } catch (_) {}
  recognizer = null;
  resetInput();
  previewCtx.clearRect(0,0,skeleton.width,skeleton.height);
  toast.classList.remove('visible');
  updateButton();
  setStatus(message);
}

async function start() {
  if (running || initializing) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    setStatus('Camera requires HTTPS or localhost. Mouse controls still work.','error');
    return;
  }
  const id = ++sequence;
  initializing = true;
  updateButton();
  setStatus('Loading MediaPipe hand model…');
  let workerRecognizer=null, workerStream=null;
  try {
    // Lazy-loaded: zero camera/model work until the visitor opts in.
    const {FilesetResolver, GestureRecognizer} = await import(SDK_URL);
    if (id !== sequence) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    if (id !== sequence) return;
    const taskOptions = delegate => ({
      baseOptions: {modelAssetPath: MODEL_URL, delegate},
      runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55
    });
    try { workerRecognizer = await GestureRecognizer.createFromOptions(vision,taskOptions('GPU')); }
    catch (e) { workerRecognizer = await GestureRecognizer.createFromOptions(vision,taskOptions('CPU')); }
    if (id !== sequence) {workerRecognizer.close();return;}
    setStatus('Allow access to your webcam…');
    workerStream = await navigator.mediaDevices.getUserMedia({
      audio: false, video: {facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}}
    });
    if (id !== sequence) {workerStream.getTracks().forEach(t=>t.stop());workerRecognizer.close();return;}
    recognizer = workerRecognizer;
    stream = workerStream;
    preview.srcObject = stream;
    await preview.play();
    if (id !== sequence) return;
    initializing = false;
    running = true;
    lastVideoTime = -1;
    lastInferenceAt = 0;
    lastHandAt = performance.now();
    resetInput();
    updateButton();
    setStatus('Show your hand to the camera','active');
    requestLoop();
  } catch (err) {
    workerStream?.getTracks().forEach(t=>t.stop());
    try {workerRecognizer?.close?.()} catch (_) {}
    if (id !== sequence) return;
    stop({message:err?.name === 'NotAllowedError'
      ? 'Camera permission denied. Enable permission and try again.'
      : err?.name === 'NotFoundError'
        ? 'No camera found. Mouse and touch still work.'
        : 'Could not initialize tracking. Check connection, HTTPS and camera.'});
    status.dataset.state='error';
    console.error('[Hand Controls]',err);
  }
}

function syncCanvasDimensions() {
  const width = Math.round(skeleton.clientWidth * Math.min(2,window.devicePixelRatio || 1));
  const height = Math.round(skeleton.clientHeight * Math.min(2,window.devicePixelRatio || 1));
  if (skeleton.width !== width || skeleton.height !== height) {skeleton.width=width;skeleton.height=height;}
}
function drawHand(landmarks) {
  syncCanvasDimensions();
  const cw=skeleton.width,ch=skeleton.height;
  previewCtx.clearRect(0,0,cw,ch);
  if (!landmarks?.length || !preview.videoWidth || !preview.videoHeight) return;
  const scale = Math.min(cw/preview.videoWidth,ch/preview.videoHeight);
  const actualW=preview.videoWidth*scale, actualH=preview.videoHeight*scale;
  const ox=(cw-actualW)/2,oy=(ch-actualH)/2;
  const pts = landmarks.map(pt=>({x:ox+(1-pt.x)*actualW,y:oy+pt.y*actualH}));
  previewCtx.strokeStyle='rgba(255,255,255,.94)';
  previewCtx.lineWidth=Math.max(1.65,cw/170);
  previewCtx.lineCap='round';previewCtx.lineJoin='round';
  for(const [a,b] of CONNECTORS) {
    previewCtx.beginPath();previewCtx.moveTo(pts[a].x,pts[a].y);
    previewCtx.lineTo(pts[b].x,pts[b].y);previewCtx.stroke();
  }
  for(let i=0;i<pts.length;i++) {
    previewCtx.beginPath();previewCtx.arc(pts[i].x,pts[i].y,i===8?Math.max(4.2,cw/45):Math.max(2.25,cw/95),0,2*Math.PI);
    previewCtx.fillStyle=i===8?'#35c5ff':'#167cf2';previewCtx.fill();
    previewCtx.lineWidth=1;previewCtx.strokeStyle='#ffffff';previewCtx.stroke();
  }
}
function mapPointer(landmarks) {
  const pt = screenPoint(landmarks,window.innerWidth,window.innerHeight,0.1);
  pointerX=smooth(pointerX,pt.x,OPTIONS.pointerSmoothing);
  pointerY=smooth(pointerY,pt.y,OPTIONS.pointerSmoothing);
  cursor.style.left=pointerX.toFixed(1)+'px';
  cursor.style.top=pointerY.toFixed(1)+'px';
  cursor.classList.add('visible');
  pointerReady = true;
}
function triggerVirtualClick(now) {
  if (!pointerReady || pointerX === null || pointerY === null || now-lastClickAt<OPTIONS.clickCooldownMs) return;
  const target=pickInteractiveAtPoint(document,pointerX,pointerY);
  if (!target || target.closest('#gestureCam') || target.id==='gestureToggle') return;
  lastClickAt=now;
  if (target.matches('input[type="range"]')) {
    const r=target.getBoundingClientRect();
    const ratio=clamp((pointerX-r.left)/Math.max(1,r.width),0,1);
    const min=Number(target.min||0),max=Number(target.max||100);
    target.value=String(Math.round(min+ratio*(max-min)));
    target.dispatchEvent(new Event('input',{bubbles:true}));
  } else target.click();
  showToast('Selected ✓',now);
}

function processResult(result, now) {
  const landmarks = result?.landmarks?.[0];
  if (!landmarks || landmarks.length<21) {
    if(now-lastHandAt>OPTIONS.lostHandMs) {
      if (currentMode !== 'idle') resetInput();
      setStatus('No hand detected — move into camera view','active');
      drawHand(null);
    }
    return;
  }
  lastHandAt=now;
  drawHand(landmarks);
  const category=result?.gestures?.[0]?.[0];
  const className=category?.categoryName || 'None';
  const confidence=category?.score || 0;
  const pointerGesture=(className==='Pointing_Up' && confidence>=0.51)||looksLikePointing(landmarks);
  const ratio=pinchRatio(landmarks);
  // Hysteresis: once pinching, require a noticeably larger distance to release.
  const isPinch = ratio < (pinchDown ? OPTIONS.pinchReleaseRatio : OPTIONS.pinchCloseRatio);
  // A pinch sometimes gets classified as a fist; preserve the cursor-click mode
  // if the user was pointing immediately before bringing thumb and index together.
  const pinchingFromPointer = isPinch && pointerReady && (now-lastPointAt<OPTIONS.pointerGraceMs);
  const fist=(className==='Closed_Fist' && confidence>=0.58 && !pinchingFromPointer);

  if(fist) {
    const palm=centerOfPalm(landmarks);
    const targetX=mirrorX(palm.x);
    fistX=smooth(fistX,targetX,OPTIONS.fistSmoothing);
    if(!fistCandidateAt)fistCandidateAt=now;
    lastFistAt=now;
    if(now-fistCandidateAt >= OPTIONS.fistStabilityMs) {
      if(currentMode!=='fist') {
        currentMode='fist';
        window.EmiratesBook?.setGestureHolding?.(true);
        fistAnchor={x:fistX,frame:window.EmiratesBook.frame};
        hidePointer();
        setStatus('✊ Closed fist · move LEFT to advance, RIGHT to rewind','active');
      }
      if(fistAnchor && !isManualDragging) {
        window.EmiratesBook.seekFrame(fistToFrame(
          fistAnchor.frame,fistAnchor.x,fistX,totalFrames(),
          OPTIONS.framesPerCameraWidth,OPTIONS.fistDeadZone));
      }
    } else setStatus('Hold your fist briefly to grab the pages','active');
    return;
  }
  fistCandidateAt=0;
  fistX=null;
  fistAnchor=null;
  if(currentMode==='fist') {currentMode='idle';window.EmiratesBook?.setGestureHolding?.(false);}

  if(pointerGesture)lastPointAt=now;
  const isCursor = pointerGesture || (isPinch && (pointerReady||now-lastPointAt<OPTIONS.pointerGraceMs));
  if(isCursor && !isManualDragging) {
    currentMode='pointer';
    mapPointer(landmarks);
    if(!pinchDown && isPinch) pinchCandidateAt=now;
    if(isPinch) {
      if(!pinchDown && now-pinchCandidateAt>OPTIONS.pinchStableMs) {
        pinchDown=true;
        cursor.classList.add('isPinching');
        triggerVirtualClick(now);
      }
      setStatus('👌 Pinch · select a chapter or control','active');
    } else {
      pinchDown=false;
      pinchCandidateAt=0;
      cursor.classList.remove('isPinching');
      setStatus('☝️ Point · move the blue cursor; pinch to click','active');
    }
  } else {
    if(currentMode==='pointer' && now-lastPointAt>OPTIONS.pointerGraceMs) {
      hidePointer();
      currentMode='idle';
    }
    pinchDown=false;
    pinchCandidateAt=0;
    if(currentMode!=='pointer')setStatus('Show a fist to turn pages or point to select','active');
  }
}

function requestLoop() {
  if(!running) return;
  rafHandle=requestAnimationFrame(loop);
}
function loop(now) {
  if(!running)return;
  try {
    if(preview.readyState>=2 && preview.currentTime!==lastVideoTime && now-lastInferenceAt>=OPTIONS.inferenceIntervalMs) {
      lastVideoTime=preview.currentTime;
      lastInferenceAt=now;
      processResult(recognizer.recognizeForVideo(preview,now),now);
    }
  } catch(err) {
    console.error('[Hand Controls] inference error',err);
    stop({message:'Hand tracking stopped due to an inference error.'});
    status.dataset.state='error';
    return;
  }
  requestLoop();
}

function init() {
  if(!window.EmiratesBook || !onOff) {
    setStatus('Book engine unavailable. Refresh to retry.','error');return;
  }
  updateButton();
  onOff.addEventListener('click',()=>running||initializing?stop():start());
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && (running||initializing)) stop({message:'Camera stopped when tab was hidden'});
  });
  window.addEventListener('pagehide',()=>stop());
  viewport.addEventListener('pointerdown',()=>{isManualDragging=true;},true);
  window.addEventListener('pointerup',()=>{isManualDragging=false;});
  window.addEventListener('pointercancel',()=>{isManualDragging=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && (running||initializing))stop();});
}
if(document.readyState==='complete')init();else window.addEventListener('load',init,{once:true});
