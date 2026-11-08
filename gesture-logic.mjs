/** Pure interaction math for The Seven Emirates hand-gesture interface.
 * Separate from MediaPipe to keep it testable and version independent.
 */
export const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const mirrorX = normalizedX => 1 - normalizedX;
export const smooth = (current, target, alpha) => current == null ? target : current + alpha * (target - current);

// Scale-independent pinch detection: relative to wrist-to-middle-knuckle distance.
export function pinchRatio(landmarks) {
  if (!landmarks || landmarks.length < 21) return Infinity;
  return distance(landmarks[4], landmarks[8]) / Math.max(distance(landmarks[0], landmarks[9]), 0.018);
}

// Soft fallback for hands pointing laterally or when gesture-classifier is uncertain.
export function looksLikePointing(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;
  const wrist = landmarks[0];
  const extended = [8, 12, 16, 20].map((tip, i) => {
    const pip = [6, 10, 14, 18][i];
    const mcp = [5, 9, 13, 17][i];
    return distance(landmarks[tip], wrist) > distance(landmarks[pip], wrist) * 1.12
      && distance(landmarks[tip], landmarks[mcp]) > distance(landmarks[pip], landmarks[mcp]) * 1.25;
  });
  return extended[0] && !extended[1] && !extended[2] && !extended[3];
}

// A mapping that takes up most of the webcam field of view, not just its edges.
export function screenPoint(landmarks, viewportWidth, viewportHeight, inset=0.11) {
  const tip = landmarks[8];
  return {
    x: clamp((mirrorX(tip.x) - inset) / (1 - 2 * inset), 0, 1) * viewportWidth,
    y: clamp((tip.y - inset) / (1 - 2 * inset), 0, 1) * viewportHeight
  };
}

export function fistToFrame(originFrame, originX, currentX, frameCount, sensitivity=290, deadZone=0.012) {
  const delta = originX - currentX;
  const corrected = Math.abs(delta) <= deadZone ? 0 : delta - Math.sign(delta) * deadZone;
  return clamp(Math.round(originFrame + corrected * sensitivity), 0, frameCount - 1);
}

export function centerOfPalm(landmarks) {
  if (!landmarks || landmarks.length < 21) return null;
  const ids = [0,5,9,13,17];
  return {x: ids.reduce((s,i)=>s+landmarks[i].x,0)/5, y:ids.reduce((s,i)=>s+landmarks[i].y,0)/5};
}

export function pickInteractiveAtPoint(documentLike,x,y) {
  const elem = documentLike.elementFromPoint(x, y);
  if (!elem) return null;
  return elem.closest?.('button:not(:disabled), a[href], input[type="range"], [data-gesture-click], [role="button"]:not([aria-disabled="true"])') || null;
}
