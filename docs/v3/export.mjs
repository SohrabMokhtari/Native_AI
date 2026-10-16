import {createKernel,validateProgram} from './kernel.mjs';
import {mountProgram,COMPOSABLE_CSS} from './renderer.mjs';
import {safeJSON} from '../export.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Embeds the SAME kernel and renderer for every app. Never embeds user records or provider access. */
export function composableHTML(program) {
  const p=validateProgram(program);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${esc(p.name)}</title><style>body{margin:0;background:${p.design.mode==='dark'?'#101722':'#f6f5fa'}}#app{max-width:${p.design.width}px;margin:0 auto}${COMPOSABLE_CSS}</style></head><body><div id="app"></div><noscript>Enable JavaScript in your browser to run the shared application engine.</noscript><script>const K=(${createKernel.toString()})();const P=${safeJSON(p)};const app=(${mountProgram.toString()})(document.getElementById('app'),P,null,{kernel:K});</script></body></html>`;
}
