import test from 'node:test';
import assert from 'node:assert/strict';
import {clamp,mirrorX,pinchRatio,looksLikePointing,screenPoint,fistToFrame,centerOfPalm,pickInteractiveAtPoint} from '../gesture-logic.mjs';

function makeHand() {
 const p=Array.from({length:21},()=>({x:.5,y:.6,z:0}));
 p[0]={x:.5,y:.91};p[9]={x:.5,y:.65};
 p[5]={x:.41,y:.67};p[17]={x:.59,y:.69};
 p[4]={x:.45,y:.49};p[8]={x:.55,y:.27};
 return p;
}
test('clamp honors bounds',()=>{assert.equal(clamp(-2,0,9),0);assert.equal(clamp(10,0,9),9)});
test('webcam horizontal mapping is mirrored',()=>assert.ok(Math.abs(mirrorX(.8)-.2)<1e-12));
test('fist swipe left progresses frames and right reverses frames',()=>{
 assert.ok(fistToFrame(100,.8,.4,1673)>100);
 assert.ok(fistToFrame(100,.3,.8,1673)<100);
});
test('fist no movement respects deadzone',()=>assert.equal(fistToFrame(130,.5,.507,1673),130));
test('fist swipe clips at video bounds',()=>{
 assert.equal(fistToFrame(1670,.9,0,1673),1672);
 assert.equal(fistToFrame(2,0,.9,1673),0);
});
test('pinch ratio relative to hand size detects pinch',()=>{
 const hand=makeHand();hand[4]={x:.5,y:.35};hand[8]={x:.51,y:.34};
 assert.ok(pinchRatio(hand)<.43);
});
test('open fingers do not register pinch',()=>assert.ok(pinchRatio(makeHand())>.64));
test('no landmarks gives safe fallback',()=>assert.equal(pinchRatio(null),Infinity));
test('cursor maps coordinates into screen bounds',()=>{
 const p=makeHand();p[8]={x:.15,y:.85};
 const screen=screenPoint(p,1920,1080,.1);
 assert.ok(screen.x>=0 && screen.x<=1920);
 assert.ok(screen.y>=0 && screen.y<=1080);
});
test('palm center averages 5 key joints',()=>{const h=makeHand();assert.ok(centerOfPalm(h).x>=.4 && centerOfPalm(h).x<=.6);});
test('pointing heuristic does not classify incomplete hand',()=>assert.equal(looksLikePointing([]),false));
test('pointing interaction finds UI control',()=>{
 const fakeTarget={closest(sel){return {tag:'button',sel}}};
 const hit=pickInteractiveAtPoint({elementFromPoint(){return fakeTarget}},100,120);
 assert.equal(hit.tag,'button');
});
test('pointing interaction safely handles empty scene',()=>assert.equal(pickInteractiveAtPoint({elementFromPoint(){return null}},1,2),null));
