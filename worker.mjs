import {validateModel} from './docs/core.mjs';
import {generateApp,providerConfig,ProviderError} from './ai/provider.mjs';
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...HEADERS,...extra}});
const configured=env=>env.PUBLIC_AI_ENABLED==='true'&&providerConfig(env)&&typeof env.TURNSTILE_SECRET==='string'&&env.TURNSTILE_SECRET.trim()&&typeof env.TURNSTILE_SITE_KEY==='string'&&env.TURNSTILE_SITE_KEY.trim()&&typeof env.GENERATION_LIMITER?.limit==='function'&&typeof env.GLOBAL_LIMITER?.limit==='function';
async function bodyJSON(request,max=90000){
 const reader=request.body?.getReader();if(!reader)throw new Error('Missing body.');let size=0,parts=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Error('Request too large.');}parts.push(value);}
 const all=new Uint8Array(size);let i=0;for(const p of parts){all.set(p,i);i+=p.length;}return JSON.parse(new TextDecoder().decode(all));
}
export async function handleRequest(request,env,fetcher=fetch){
 const url=new URL(request.url);
 if(url.pathname==='/api/config'&&request.method==='GET'){
  if(!configured(env))return reply({mode:'starter'});
  const {provider,model}=providerConfig(env);
  return reply({mode:'live',siteKey:env.TURNSTILE_SITE_KEY,provider,model});
 }
 if(url.pathname==='/api/generate'){
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  if(!configured(env))return reply({error:'Hosted AI is not configured. The operator must enable it with secrets and abuse controls.'},503);
  if(request.headers.get('Origin')!==url.origin)return reply({error:'Origin not allowed.'},403);
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return reply({error:'JSON required.'},415);
  let body;
  try{body=await bodyJSON(request);if(!body||Object.keys(body).some(k=>!['prompt','current','token'].includes(k)))throw new Error('Invalid body.');if(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>2000||typeof body.token!=='string'||!body.token||body.token.length>2048)throw new Error('Invalid request.');if(body.current!==null)validateModel(body.current);}catch{return reply({error:'Invalid or oversized request. No changes made.'},400);}
  try{
   const ip=request.headers.get('CF-Connecting-IP');if(!ip)return reply({error:'Missing edge identity.'},403);
   const perUser=await env.GENERATION_LIMITER.limit({key:ip});if(!perUser.success)return reply({error:'Too many builds. Try again later.'},429);
   const global=await env.GLOBAL_LIMITER.limit({key:'all-builds'});if(!global.success)return reply({error:'The public build quota is temporarily busy.'},429);
   const verify=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:body.token,remoteip:ip}),signal:AbortSignal.timeout(10000)});
   const proof=await verify.json();if(!verify.ok||proof.success!==true||proof.hostname!==url.hostname||proof.action!=='generate')return reply({error:'Anti-abuse verification failed. Retry the challenge.'},403);
   return reply(await generateApp({prompt:body.prompt,current:body.current},env,fetcher));
  }catch(error){
   if(error instanceof ProviderError)return reply({error:error.message,code:error.code},error.status,error.retryAfter?{'Retry-After':String(error.retryAfter)}:{});
   return reply({error:'Build service unavailable or timed out. No changes made.'},503);
  }
 }
 if(url.pathname.startsWith('/api/'))return reply({error:'Not found.'},404);
 if(!env.ASSETS)return new Response('Static asset binding is missing.',{status:503});
 const response=await env.ASSETS.fetch(request),out=new Response(response.body,response);
 out.headers.set('X-Content-Type-Options','nosniff');out.headers.set('Referrer-Policy','no-referrer');
 out.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
 return out;
}
export default {fetch:(request,env)=>handleRequest(request,env)};
