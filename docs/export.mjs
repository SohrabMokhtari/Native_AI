import {validateModel} from './core.mjs';
import {mountApp,RUNTIME_CSS} from './runtime.mjs';
const utf8 = new TextEncoder();
export const safeJSON = v => JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const filename = name => name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'my-app';
export const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="44" fill="#7055d9"/><path d="M48 139V53h23l50 58V53h23v86h-23L71 81v58z" fill="white"/></svg>';
export function appHTML(model,pwa=false) {
  const m=validateModel(model);
  const policy="default-src 'none'; script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="theme-color" content="#7055d9"><title>${esc(m.name)}</title>${pwa?'<link rel="manifest" href="./manifest.webmanifest"><link rel="icon" href="./icon.svg">':''}<style>body{margin:0;background:#fcfbfe}main{max-width:1100px;margin:0 auto}${RUNTIME_CSS}</style></head><body><main id="app"></main><noscript>This application needs JavaScript enabled in your browser, not a software installation.</noscript><script>const model=${safeJSON(m)};(${mountApp.toString()})(document.getElementById('app'),model);${pwa?"if('serviceWorker' in navigator && location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});":''}</script></body></html>`;
}
function crc32(bytes) {let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
/** Small uncompressed ZIP writer: packaging only, no installed library or app compiler. */
export function zipFiles(files) {
  const entries=Object.entries(files);if(entries.length>100)throw new Error('Too many archive entries.');
  const parts=[],central=[];let offset=0;
  for(const [name,text] of entries){
    if(!/^[a-z0-9_.-]+$/i.test(name))throw new Error('Unsafe archive path.');
    const n=utf8.encode(name),b=typeof text==='string'?utf8.encode(text):text,crc=crc32(b);
    const header=new Uint8Array(30+n.length),v=new DataView(header.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,b.length,true);v.setUint32(22,b.length,true);v.setUint16(26,n.length,true);header.set(n,30);
    const ch=new Uint8Array(46+n.length),cv=new DataView(ch.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,b.length,true);cv.setUint32(24,b.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);ch.set(n,46);
    parts.push(header,b);central.push(ch);offset+=header.length+b.length;
  }
  const size=central.reduce((s,b)=>s+b.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
  const output=new Uint8Array(offset+size+22);let p=0;for(const b of [...parts,...central,end]){output.set(b,p);p+=b.length;}return output;
}
export function pwaFiles(model) {
  const m=validateModel(model),cache=`native-${m.id}-${Date.now()}`;
  return {'index.html':appHTML(m,true),'manifest.webmanifest':JSON.stringify({id:'./',name:m.name,short_name:m.name.slice(0,24),description:m.description,start_url:'./',scope:'./',display:'standalone',background_color:'#fcfbfe',theme_color:'#7055d9',icons:[{src:'./icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]},null,2),'icon.svg':ICON,'sw.js':`const CACHE=${JSON.stringify(cache)};const FILES=['./','./index.html','./manifest.webmanifest','./icon.svg'];self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match(e.request).then(r=>r||Response.error()))));});`,'README.txt':`${m.name}\n\nOpen index.html for the standalone web app. No packages or build commands are needed.\nFor mobile home-screen installation and offline caching, upload these files together to an HTTPS static host. Browser support varies; SVG-only icons may need PNG alternatives for some devices. This is a web app, NOT an APK or IPA.\nData is stored only in each browser. No accounts, cloud database, cross-device sync, notifications, payments, or shared backend are included. Data is not included in this export. Local file storage behavior varies by browser.\nGenerated with Native AI. The shared runtime executes a validated app model; no custom per-app source implementation was generated.\n`};
}
export function download(data,name,type='application/octet-stream') {
  const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
