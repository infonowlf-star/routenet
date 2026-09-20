import{k as w}from"./index-Du2FOUsO.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const M=w("ChevronDown",[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]]),f=new Map;async function l(t){if(!t)return{r:30,g:30,b:38};const c=f.get(t);if(c)return c;try{const r=new Image;r.crossOrigin="anonymous",r.src=t,await new Promise((n,m)=>{r.onload=()=>n(),r.onerror=()=>m()});const s=document.createElement("canvas"),e=32;s.width=e,s.height=e;const i=s.getContext("2d");i.drawImage(r,0,0,e,e);const o=i.getImageData(0,0,e,e).data;let g=0,d=0,u=0,a=0;for(let n=0;n<o.length;n+=4){if(o[n+3]<128)continue;const b=(o[n]+o[n+1]+o[n+2])/3;b<20||b>235||(g+=o[n],d+=o[n+1],u+=o[n+2],a++)}if(a===0)return{r:60,g:30,b:40};const h={r:Math.round(g/a),g:Math.round(d/a),b:Math.round(u/a)};return f.set(t,h),h}catch{return{r:60,g:30,b:40}}}function p(t){const c=`rgb(${t.r}, ${t.g}, ${t.b})`,r=`rgb(${Math.round(t.r*.4)}, ${Math.round(t.g*.4)}, ${Math.round(t.b*.4)})`;return`linear-gradient(180deg, ${c} 0%, ${r} 45%, #0a0a0a 100%)`}export{M as C,p as a,l as g};
