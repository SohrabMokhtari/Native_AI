import {buildComposable,composableConfig,BuildError,boundedJSON} from './composable-agent.mjs';
import {validateProgram} from '../docs/v3/kernel.mjs';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
const has=v=>typeof v==='string'&&v.trim().length>0;
function configured(env){return env.COMPOSABLE_AI_ENABLED==='true'&&env.PUBLIC_AI_ENABLED==='true'&&composableConfig(env)&&has(env.TURNSTILE_SECRET)&&has(env.TURNSTILE_SITE_KEY)&&typeof env.GENERATION_LIMITER?.limit==='function'&&typeof env.GLOBAL_LIMITER?.limit==='function';}
export async function handleComposable(request,env,fetcher=fetch){
  const url=new URL(request.url);
  if(url.pathname==='/api/v3/config'&&request.method==='GET')return reply(configured(env)?{mode:'live',siteKey:env.TURNSTILE_SITE_KEY,provider:'groq',...composableConfig(env)}:{mode:'disabled',reason:'Composable AI requires explicit operator enablement. Local examples remain available.'});
  if(url.pathname!=='/api/v3/generate')return reply({error:'Not found.'},404);
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  if(!configured(env))return reply({error:'Composable AI is disabled. The existing builder is unchanged.'},503);
  if(request.headers.get('Origin')!==url.origin)return reply({error:'Origin not allowed.'},403);
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return reply({error:'JSON required.'},415);
  let body;
  try{body=await boundedJSON(request,190000);if(!body||Object.keys(body).some(k=>!['prompt','current','revision','conversation','token'].includes(k)))throw new Error();
    if(!has(body.prompt)||body.prompt.length>3000||!has(body.token)||body.token.length>2048||!Number.isSafeInteger(body.revision)||body.revision<0)throw new Error();
    if(body.current!==null)validateProgram(body.current);
    const history=body.conversation??[];if(!Array.isArray(history)||history.length>8||history.some(m=>!m||Object.keys(m).length!==2||!['user','assistant'].includes(m.role)||!has(m.content)||m.content.length>1500))throw new Error();
  }catch{return reply({error:'Invalid or oversized request. No changes applied.'},400);}
  try{
    const ip=request.headers.get('CF-Connecting-IP');if(!ip)return reply({error:'Missing edge identity.'},403);
    if(!(await env.GENERATION_LIMITER.limit({key:ip})).success||!(await env.GLOBAL_LIMITER.limit({key:'all-builds'})).success)return reply({error:'Build quota is busy. Wait before trying again.'},429,{'Retry-After':'60'});
    const r=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',redirect:'manual',body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:body.token,remoteip:ip}),signal:AbortSignal.timeout(10000)});
    if(!r.ok){await r.body?.cancel().catch(()=>{});return reply({error:'Anti-abuse verification unavailable.'},503);}
    const proof=await boundedJSON(r,16000);if(proof.success!==true||proof.hostname!==url.hostname||proof.action!=='generate')return reply({error:'Anti-abuse verification failed.'},403);
    const {token,...input}=body;return reply(await buildComposable(input,env,fetcher));
  }catch(e){if(e instanceof BuildError)return reply({error:e.message,code:e.code},e.status,e.retryAfter?{'Retry-After':String(e.retryAfter)}:{});return reply({error:'Construction service failed. No changes applied.',code:'BUILD_UNAVAILABLE'},503);}
}
