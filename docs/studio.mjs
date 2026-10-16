import {validateModel,validateData,compatible,offlinePlan} from './core.mjs';
import {mountApp,RUNTIME_CSS} from './runtime.mjs';
import {appHTML,pwaFiles,zipFiles,download,filename} from './export.mjs';
const $=id=>document.getElementById(id),key='native-ai-workspace-v2';
let state={app:null,data:{},history:[]},busy=false,config={mode:'starter'},widget=null,token='',storageOK=true;
const style=document.createElement('style');style.textContent=RUNTIME_CSS;document.head.append(style);
function message(text,role='assistant'){
  const article=document.createElement('article');article.className=`message ${role}`;
  if(role==='user')article.textContent=text;
  else{const a=document.createElement('span');a.className='avatar';a.textContent='N';const p=document.createElement('p');p.textContent=text;article.append(a,p);}
  $('messages').append(article);$('messages').scrollTop=$('messages').scrollHeight;
}
function save(next){
  if(!storageOK)throw new Error('Browser storage is unavailable or contains a damaged workspace. Back up or clear it before saving.');
  try{localStorage.setItem(key,JSON.stringify(next));}catch{throw new Error('Browser storage is full or blocked. Download a backup before clearing space.');}
  state=next;$('save-state').textContent='Saved on this device · Not synced';
}
function render(){
  if(!state.app)return;
  mountApp($('app-root'),state.app,{data:state.data,onChange:data=>save({...state,data})});
  $('starters').hidden=true;$('starters').style.display='none';$('export').disabled=false;$('undo').disabled=!state.history.length||busy;
  $('build').firstChild.textContent='Make this change ';$('prompt').placeholder='Make it teal, rename it, or describe a change…';
}
try{
  const saved=localStorage.getItem(key);
  if(saved){const s=JSON.parse(saved);validateModel(s.app);const data=validateData(s.app,s.data);state={app:s.app,data,history:Array.isArray(s.history)?s.history.filter(m=>{try{validateModel(m);return true;}catch{return false;}}).slice(-10):[]};render();}
}catch{storageOK=false;message('Your saved workspace could not be loaded. It has not been overwritten. Export browser storage for recovery, or use New app to explicitly reset it.');}
async function connect(){
  try{const r=await fetch('./api/config',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!r.ok)return;const c=await r.json();if(c.mode!=='live'||typeof c.siteKey!=='string')return;config=c;
    $('mode').textContent='Hosted AI';$('mode').classList.add('live');$('engine-note').textContent='Hosted AI · Provider key protected';
    $('disclosure').textContent='Live mode sends your prompt and app design to the operator’s AI provider. Record values are not included. Do not put secrets in prompts or field labels.';
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
    script.onload=()=>{widget=window.turnstile.render($('challenge'),{sitekey:c.siteKey,action:'generate',callback:v=>{token=v;},'expired-callback':()=>{token='';},'error-callback':()=>{token='';}});};
    script.onerror=()=>message('The anti-abuse check could not load. Hosted AI is unavailable; no request has been sent.');document.head.append(script);
  }catch{/* Static hosting deliberately falls back to the clearly labeled starter mode. */}
}
connect();
function setBusy(value){busy=value;for(const id of ['build','new','import','undo'])$(id).disabled=value||(id==='undo'&&!state.history.length);$('build').firstChild.textContent=value?'Building… ':state.app?'Make this change ':'Build my app ';}
$('prompt-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const prompt=$('prompt').value.trim();if(!prompt)return;
  message(prompt,'user');setBusy(true);
  const current=state.app?structuredClone(state.app):null;
  try{
    let result;
    if(config.mode==='live'){
      if(!token)throw new Error('Complete the anti-abuse check before using hosted AI.');
      const r=await fetch('./api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,current,token}),signal:AbortSignal.timeout(65000)});
      const body=await r.json();if(!r.ok)throw new Error(body.error||'The AI request failed. No design changes were applied.');
      if(body.status==='unsupported')throw new Error(body.message);result=body;
    }else result=offlinePlan(prompt,current);
    const app=validateModel(result.app);compatible(current,app,state.data);
    const data=validateData(app,state.data),history=current?[...state.history,current].slice(-10):[];
    save({app,data,history});render();$('prompt').value='';message(result.message||'Your app is ready to try.');
  }catch(e){message(e.message||'Could not complete the request. No design changes were made.');}
  finally{setBusy(false);if(widget!==null&&window.turnstile){token='';window.turnstile.reset(widget);}}
});
document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{$('prompt').value=b.dataset.prompt;$('prompt-form').requestSubmit();}));
$('desktop').onclick=()=>{$('app-root').classList.remove('phone');$('desktop').classList.add('selected');$('mobile').classList.remove('selected');$('desktop').setAttribute('aria-pressed','true');$('mobile').setAttribute('aria-pressed','false');};
$('mobile').onclick=()=>{$('app-root').classList.add('phone');$('mobile').classList.add('selected');$('desktop').classList.remove('selected');$('desktop').setAttribute('aria-pressed','false');$('mobile').setAttribute('aria-pressed','true');};
$('about').onclick=()=>$('about-dialog').showModal();$('export').onclick=()=>{$('export-status').textContent='';$('export-dialog').showModal();};
$('download-html').onclick=()=>{download(appHTML(state.app),`${filename(state.app.name)}.html`,'text/html');$('export-status').textContent='Downloaded. Open the HTML file in your browser. No developer tools required.';};
$('download-pwa').onclick=()=>{download(zipFiles(pwaFiles(state.app)),`${filename(state.app.name)}-web.zip`,'application/zip');$('export-status').textContent='Downloaded. HTTPS hosting is required for installation/offline caching. This is not an app-store binary.';};
$('backup').onclick=()=>{download(JSON.stringify({format:'native-ai-backup/1',app:state.app,data:state.data},null,2),`${filename(state.app.name)}.native.json`,'application/json');$('export-status').textContent='Backup includes your records. Keep it somewhere private.';};
$('share').onclick=async()=>{
  try{
    if(!/^https?:$/.test(location.protocol))throw new Error('Share links require a hosted copy of this studio. Use the HTML export instead.');
    const bytes=new TextEncoder().encode(JSON.stringify(state.app));let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
    const encoded=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');if(encoded.length>16000)throw new Error('This app is too large for a reliable share link. Export it instead.');
    const u=new URL('./run.html',location.href);u.hash=`app=${encoded}`;
    if(!confirm('Anyone with this link can read the app design. Records are NOT included. Copy link?'))return;
    await navigator.clipboard.writeText(u.href);$('export-status').textContent='Link copied. Recipients get their own local records; this is not a shared database.';
  }catch(e){$('export-status').textContent=e.message;}
};
$('undo').onclick=()=>{if(busy||!state.history.length)return;try{const app=state.history.at(-1);compatible(state.app,app,state.data);save({app,data:validateData(app,state.data),history:state.history.slice(0,-1)});render();message('Restored the previous design. Records were preserved.');}catch(e){message(`Cannot undo safely: ${e.message}`);}};
$('new').onclick=()=>{if(busy)return;if(!confirm('Start a new workspace? Download a backup first to keep the current app and records.'))return;try{localStorage.removeItem(key);location.reload();}catch{message('Browser storage is blocked. Enable it or use another browser.');}};
$('import').onclick=()=>$('import-file').click();
$('import-file').onchange=async()=>{
  const f=$('import-file').files[0];if(!f)return;
  try{if(f.size>4000000)throw new Error('Backup exceeds the 4 MB import limit.');const b=JSON.parse(await f.text());if(b.format!=='native-ai-backup/1')throw new Error('Unknown backup format.');const app=validateModel(b.app),data=validateData(app,b.data);if(state.app&&!confirm('Replace the current workspace with this backup?'))return;save({app,data,history:[]});render();message('Backup restored. Records are stored only in this browser.');}catch(e){message(`Import failed: ${e.message}`);}finally{$('import-file').value='';}
};
