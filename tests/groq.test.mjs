import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {generateApp,providerConfig,ProviderError,GROQ_MODEL,MAX_COMPLETION_TOKENS,validateBuildResult} from '../ai/provider.mjs';
import {handleRequest} from '../worker.mjs';
import {starter,RESPONSE_SCHEMA,compatible,validateData} from '../docs/core.mjs';
import {appHTML} from '../docs/export.mjs';
const origin='https://native-ai.example';
const settings=()=>({AI_PROVIDER:'groq',GROQ_API_KEY:'groq-unit-test-only'});
const environment=()=>({...settings(),PUBLIC_AI_ENABLED:'true',TURNSTILE_SITE_KEY:'public-site-key',TURNSTILE_SECRET:'challenge-unit-test-only',GENERATION_LIMITER:{limit:async()=>({success:true})},GLOBAL_LIMITER:{limit:async()=>({success:true})}});
const value=(app=starter('tasks','task-app'))=>({status:'ready',message:'A local task board.',app});
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json',...headers}});
const envelope=result=>({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(result)}}]});
const request=(body={prompt:'Build a task board',current:null,token:'proof'},headers={})=>new Request(origin+'/api/generate',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.4',...headers},body:JSON.stringify(body)});
function mock(result=value()){
 const calls=[];
 const fetcher=async(url,init)=>{calls.push({url,init});return url.includes('/siteverify')?json({success:true,hostname:'native-ai.example',action:'generate'}):json(envelope(result));};
 return {calls,fetcher};
}
const code=c=>e=>e instanceof ProviderError&&e.code===c;

test('Groq selects the requested default model',()=>{const c=providerConfig(settings());assert.equal(c.provider,'groq');assert.equal(c.model,GROQ_MODEL);assert.equal(c.endpoint,'https://api.groq.com/openai/v1/chat/completions');});
test('Groq-only secret works without a provider variable',()=>assert.equal(providerConfig({GROQ_API_KEY:'unit-test'}).provider,'groq'));
test('legacy OpenAI-only configuration remains usable',()=>assert.equal(providerConfig({OPENAI_API_KEY:'unit-test',AI_MODEL:'legacy-model'}).provider,'openai'));
test('ambiguous implicit provider fails closed',()=>assert.equal(providerConfig({OPENAI_API_KEY:'one',GROQ_API_KEY:'two',AI_MODEL:GROQ_MODEL}),null));
test('explicit Groq selection wins without using an OpenAI key',()=>assert.equal(providerConfig({...settings(),OPENAI_API_KEY:'unused'}).apiKey,'groq-unit-test-only'));
for(const overrides of [{AI_PROVIDER:'unknown'},{AI_PROVIDER:''},{AI_PROVIDER:null},{GROQ_API_KEY:''},{GROQ_API_KEY:'  '},{AI_MODEL:'unsupported-model'},{AI_MODEL:''}])test('bad provider configuration fails closed '+JSON.stringify(overrides),()=>assert.equal(providerConfig({...settings(),...overrides}),null));
test('supported 20B alternative requires an explicit model choice',()=>assert.equal(providerConfig({...settings(),AI_MODEL:'openai/gpt-oss-20b'}).model,'openai/gpt-oss-20b'));
test('Groq never falls back to an available OpenAI credential',async()=>{let calls=0;await assert.rejects(generateApp({prompt:'Build'}, {AI_PROVIDER:'groq',OPENAI_API_KEY:'unused',AI_MODEL:GROQ_MODEL},async()=>{calls++;}),code('AI_NOT_CONFIGURED'));assert.equal(calls,0);});
test('Groq makes one strict, bounded, non-streaming provider request',async()=>{
 const m=mock(),r=await generateApp({prompt:'Build a task board'},settings(),m.fetcher);
 assert.equal(r.status,'ready');assert.equal(m.calls.length,1);const {url,init}=m.calls[0],p=JSON.parse(init.body);
 assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(init.headers.Authorization,'Bearer groq-unit-test-only');assert.equal(init.redirect,'error');assert.ok(init.signal instanceof AbortSignal);
 assert.equal(p.model,GROQ_MODEL);assert.equal(p.max_completion_tokens,MAX_COMPLETION_TOKENS);assert.equal(p.reasoning_effort,'low');assert.equal(p.stream,false);
 assert.equal(p.response_format.type,'json_schema');assert.equal(p.response_format.json_schema.strict,true);assert.deepEqual(p.response_format.json_schema.schema,RESPONSE_SCHEMA);
 assert.equal(p.messages[0].role,'system');assert.deepEqual(JSON.parse(p.messages[1].content),{request:'Build a task board',current:null});
 for(const key of ['tools','store','api_key','max_tokens'])assert.ok(!Object.hasOwn(p,key));
 assert.match(r.app.id,/^app-/);assert.notEqual(r.app.id,'task-app');assert.ok(!JSON.stringify(r).includes('groq-unit-test-only'));
});
test('every response-schema object requires all properties and disallows extras',()=>{
 const visit=s=>{if(!s||typeof s!=='object')return;if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,Object.keys(s.properties));}for(const x of Object.values(s))if(Array.isArray(x))x.forEach(visit);else visit(x);};visit(RESPONSE_SCHEMA);
});
test('valid Groq edit preserves IDs, records and supports an export',async()=>{
 const current=starter('tasks','task-app'),next=structuredClone(current),data={items:[{id:'one',values:{title:'Do not lose me',notes:'Private record text',status:'To do',due:''}}]};
 next.theme='teal';next.collections[0].fields.push({id:'priority_note',label:'Priority note',type:'text',required:false,options:[]});
 const m=mock(value(next)),r=await generateApp({prompt:'Make it teal and add an optional text field called Priority note',current},settings(),m.fetcher);
 compatible(current,r.app,data);const preserved=validateData(r.app,data);assert.equal(preserved.items[0].values.title,'Do not lose me');assert.equal(r.app.id,current.id);assert.equal(r.app.theme,'teal');
 assert.ok(appHTML(r.app).includes('Priority note'));assert.ok(!appHTML(r.app).includes('Private record text'));assert.ok(!m.calls[0].init.body.includes('Private record text'));
});
for(const [name,change] of [
 ['app ID',m=>m.id='other'],['collection removal',m=>m.collections=[]],['collection ID',m=>{m.collections[0].id='other';m.views[0].collection='other';}],
 ['field removal',m=>m.collections[0].fields.pop()],['field type',m=>m.collections[0].fields.find(f=>f.id==='due').type='text'],
 ['select choice removal',m=>m.collections[0].fields.find(f=>f.type==='select').options.pop()],
 ['missing view reference',m=>m.views[0].titleField='missing'],['script property',m=>m.script='alert(1)'],
])test('unsafe edit rejected: '+name,async()=>{const current=starter('tasks','task-app'),next=structuredClone(current);change(next);const m=mock(value(next));await assert.rejects(generateApp({prompt:'Change it',current},settings(),m.fetcher),code('AI_INVALID_RESPONSE'));assert.equal(current.id,'task-app');assert.equal(current.collections[0].fields.length,4);});
for(const bad of [null,[],{}, {status:'ready',message:'',app:starter('tasks')},{...value(),extra:true},{status:'ready',message:'x'.repeat(1201),app:starter('tasks')},{status:'unsupported',message:'No',app:starter('tasks')},{status:'unknown',message:'No',app:null}])test('invalid result envelope rejected '+JSON.stringify(bad).slice(0,65),()=>assert.throws(()=>validateBuildResult(bad),code('AI_INVALID_RESPONSE')));
test('unsupported request stays unsupported, never becomes a starter',async()=>{const m=mock({status:'unsupported',message:'Real accounts require a backend.',app:null});assert.deepEqual(await generateApp({prompt:'Add real accounts'},settings(),m.fetcher),{status:'unsupported',message:'Real accounts require a backend.',app:null});assert.equal(m.calls.length,1);});
for(const reason of ['length','tool_calls',null])test('unfinished response rejected: '+reason,async()=>{const data=envelope(value());data.choices[0].finish_reason=reason;await assert.rejects(generateApp({prompt:'Build'},settings(),async()=>json(data)),code('AI_INCOMPLETE_RESPONSE'));});
test('provider refusal is not leaked or applied',async()=>{const data=envelope(value());data.choices[0].message.refusal='provider-private-details';await assert.rejects(generateApp({prompt:'Build'},settings(),async()=>json(data)),e=>code('AI_REFUSED')(e)&&!e.message.includes('provider-private'));});
test('content-filter stop rejected',async()=>{const data=envelope(value());data.choices[0].finish_reason='content_filter';await assert.rejects(generateApp({prompt:'Build'},settings(),async()=>json(data)),code('AI_REFUSED'));});
test('model tool calls cannot execute',async()=>{const data=envelope(value());data.choices[0].message.tool_calls=[{name:'run_code'}];await assert.rejects(generateApp({prompt:'Build'},settings(),async()=>json(data)),code('AI_INVALID_RESPONSE'));});
for(const data of [{},null,{choices:[]},{choices:[{},{}]}, {choices:[{finish_reason:'stop',message:{content:'not JSON'}}]}, {choices:[{finish_reason:'stop',message:{content:null}}]}])test('malformed completion rejected '+JSON.stringify(data),async()=>await assert.rejects(generateApp({prompt:'Build'},settings(),async()=>json(data)),code('AI_INVALID_RESPONSE')));
test('large provider response is bounded',async()=>await assert.rejects(generateApp({prompt:'Build'},settings(),async()=>new Response('x'.repeat(262145))),code('AI_INVALID_RESPONSE')));
test('non-JSON provider response rejected',async()=>await assert.rejects(generateApp({prompt:'Build'},settings(),async()=>new Response('<html>upstream error</html>')),code('AI_INVALID_RESPONSE')));
for(const [raw,expected] of [['37',37],['0',1],['999999999',86400],['invalid',60],[null,60]])test('quota failure has a bounded retry hint '+raw,async()=>{
 let calls=0;await assert.rejects(generateApp({prompt:'Build'},settings(),async()=>{calls++;return new Response('sensitive provider body',{status:429,headers:raw===null?{}:{'Retry-After':raw}});}),e=>code('AI_QUOTA_EXCEEDED')(e)&&e.status===429&&e.retryAfter===expected&&!e.message.includes('sensitive'));assert.equal(calls,1);
});
for(const status of [400,401,403,404,500,503])test('upstream failure is sanitized, no retries: '+status,async()=>{let calls=0;await assert.rejects(generateApp({prompt:'Build'},settings(),async()=>{calls++;return new Response('private provider details',{status});}),e=>e instanceof ProviderError&&!e.message.includes('private')&&e.status===([401,403].includes(status)?503:502));assert.equal(calls,1);});
test('network exceptions do not leak secrets',async()=>await assert.rejects(generateApp({prompt:'Build'},settings(),async()=>{throw new Error('groq-unit-test-only');}),e=>code('AI_UNAVAILABLE')(e)&&!e.message.includes('groq-unit-test-only')));
test('invalid input rejected before inference',async()=>{let calls=0;for(const prompt of ['', ' ', 'x'.repeat(2001)])await assert.rejects(generateApp({prompt},settings(),async()=>{calls++;}),code('AI_INVALID_REQUEST'));assert.equal(calls,0);});
test('records in design are rejected before inference',async()=>{const current=starter('tasks');current.records=['private'];let calls=0;await assert.rejects(generateApp({prompt:'Edit',current},settings(),async()=>{calls++;}),code('AI_INVALID_REQUEST'));assert.equal(calls,0);});
test('Groq gateway metadata contains no secrets',async()=>{const r=await handleRequest(new Request(origin+'/api/config'),environment());assert.deepEqual(await r.json(),{mode:'live',siteKey:'public-site-key',provider:'groq',model:GROQ_MODEL});});
for(const field of ['GROQ_API_KEY','TURNSTILE_SECRET','TURNSTILE_SITE_KEY','GENERATION_LIMITER','GLOBAL_LIMITER'])test('Groq gateway fails closed without '+field,async()=>{const e=environment();delete e[field];const m=mock();assert.equal((await handleRequest(request(),e,m.fetcher)).status,503);assert.equal(m.calls.length,0);assert.deepEqual(await (await handleRequest(new Request(origin+'/api/config'),e)).json(),{mode:'starter'});});
test('invalid limiter object fails closed',async()=>{const e=environment();e.GENERATION_LIMITER={};const m=mock();assert.equal((await handleRequest(request(),e,m.fetcher)).status,503);assert.equal(m.calls.length,0);});
test('Groq gateway performs verified challenge followed by one inference',async()=>{const m=mock(),r=await handleRequest(request(),environment(),m.fetcher);assert.equal(r.status,200);assert.equal(m.calls.length,2);assert.match(m.calls[0].url,/siteverify$/);assert.match(m.calls[1].url,/api.groq.com/);assert.equal((await r.json()).status,'ready');});
test('Groq gateway blocks failed challenges before inference',async()=>{let calls=0;const r=await handleRequest(request(),environment(),async()=>{calls++;return json({success:false});});assert.equal(r.status,403);assert.equal(calls,1);});
test('Groq gateway propagates quota without raw error or fallback',async()=>{let calls=0;const r=await handleRequest(request(),environment(),async url=>{calls++;return url.includes('siteverify')?json({success:true,hostname:'native-ai.example',action:'generate'}):new Response('provider private body',{status:429,headers:{'Retry-After':'22'}});});assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'22');assert.equal((await r.json()).code,'AI_QUOTA_EXCEEDED');assert.equal(calls,2);});
test('browser assets contain no provider credential reference or adapter import',()=>{for(const file of readdirSync(new URL('../docs/',import.meta.url))){if(!/\.(mjs|html|css)$/.test(file))continue;const text=readFileSync(new URL('../docs/'+file,import.meta.url),'utf8');assert.ok(!/GROQ_API_KEY|OPENAI_API_KEY|ai\/provider\.mjs|api\.groq\.com/.test(text),file);}});
test('checked-in config defaults to Groq but leaves public generation disabled',()=>{const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));assert.equal(config.vars.AI_PROVIDER,'groq');assert.equal(config.vars.AI_MODEL,GROQ_MODEL);assert.equal(config.vars.PUBLIC_AI_ENABLED,'false');assert.equal(config.assets.directory,'./docs');});
test('maintainer smoke test is dry by default',()=>{const r=spawnSync(process.execPath,['scripts/check-groq.mjs'],{cwd:new URL('../',import.meta.url),env:{PATH:process.env.PATH,GROQ_API_KEY:'never-transmit-this-fixture'},encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/No API request/);assert.ok(!r.stdout.includes('never-transmit'));});
test('maintainer live smoke test requires a secret without printing one',()=>{const r=spawnSync(process.execPath,['scripts/check-groq.mjs','--live'],{cwd:new URL('../',import.meta.url),env:{PATH:process.env.PATH},encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/GROQ_API_KEY/);});
