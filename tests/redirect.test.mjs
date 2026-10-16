/** Regression coverage for Cloudflare's unsupported redirect:error mode.
 * The workerd restriction is simulated; HTTP redirects below use real local Node fetch.
 * No provider credentials or live inference are used.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {generateApp,ProviderError} from '../ai/provider.mjs';
import {starter} from '../docs/core.mjs';

const input={prompt:'Build a local task board'};
const env=provider=>provider==='groq'
  ? {AI_PROVIDER:'groq',GROQ_API_KEY:'fixture-not-a-real-key'}
  : {AI_PROVIDER:'openai',OPENAI_API_KEY:'fixture-not-a-real-key',AI_MODEL:'fixture-model'};
const result=()=>({status:'ready',message:'A local board.',app:starter('tasks','test-app')});
const envelope=provider=>provider==='groq'
  ? {choices:[{finish_reason:'stop',message:{content:JSON.stringify(result())}}]}
  : {status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result())}]}]};
const code=value=>error=>error instanceof ProviderError&&error.code===value;

for(const provider of ['groq','openai']){
  test(`${provider}: supported redirect mode survives a simulated workerd restriction`,async()=>{
    let calls=0;
    const fetcher=async(url,options)=>{
      if(options.redirect==='error')throw new TypeError("The redirect mode 'error' is not supported");
      assert.equal(options.redirect,'manual');
      assert.ok(url.startsWith(provider==='groq'?'https://api.groq.com/':'https://api.openai.com/'));
      assert.ok(options.signal instanceof AbortSignal);
      calls++;
      return Response.json(envelope(provider));
    };
    const app=await generateApp(input,env(provider),fetcher);
    assert.equal(app.status,'ready');assert.equal(calls,1);
  });
  for(const status of [301,302,303,304,307,308])test(`${provider}: reject HTTP ${status} without following Location`,async()=>{
    let calls=0;
    await assert.rejects(generateApp(input,env(provider),async(url,options)=>{
      calls++;
      assert.equal(options.redirect,'manual');
      return new Response(null,{status,headers:{Location:'https://do-not-contact.invalid/private-location'}});
    }),error=>code('AI_REDIRECT_BLOCKED')(error)&&error.status===502&&!error.message.includes('private-location'));
    assert.equal(calls,1);
  });
}

test('a real local HTTP redirect never receives a follow-up request or forwarded authorization',async t=>{
  let providerHits=0,targetHits=0;
  const server=createServer((request,response)=>{
    request.resume();
    if(request.url==='/provider'){
      providerHits++;
      assert.equal(request.headers.authorization,'Bearer fixture-not-a-real-key');
      response.writeHead(307,{Location:'/must-not-receive-credentials'});response.end('not an app');
    }else{targetHits++;response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify(envelope('groq')));}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const local=`http://127.0.0.1:${server.address().port}/provider`;
  await assert.rejects(generateApp(input,env('groq'),(url,options)=>fetch(local,options)),code('AI_REDIRECT_BLOCKED'));
  assert.equal(providerHits,1);assert.equal(targetHits,0);
});

for(const [status,expected] of [[302,'AI_REDIRECT_BLOCKED'],[401,'AI_CREDENTIALS_REJECTED'],[429,'AI_QUOTA_EXCEEDED'],[500,'AI_PROVIDER_ERROR']]){
  test(`response cleanup failure does not mask HTTP ${status}`,async()=>{
    let calls=0;
    await assert.rejects(generateApp(input,env('groq'),async()=>{
      calls++;
      return {ok:false,status,headers:new Headers(),body:{cancel:async()=>{throw new Error('secret-in-cleanup');}}};
    }),error=>code(expected)(error)&&!error.message.includes('secret-in-cleanup'));
    assert.equal(calls,1);
  });
}

for(const name of ['TimeoutError','AbortError'])test(`${name} is distinguished from an immediate network failure`,async()=>{
  await assert.rejects(generateApp(input,env('groq'),async()=>{throw new DOMException('do not expose',name);}),
    error=>code('AI_TIMEOUT')(error)&&error.status===504&&!error.message.includes('do not expose'));
});

test('unknown failures remain sanitized and do not falsely state that a timeout occurred',async()=>{
  let calls=0;
  await assert.rejects(generateApp(input,env('groq'),async()=>{calls++;throw new Error('secret-from-runtime');}),
    error=>code('AI_UNAVAILABLE')(error)&&!error.message.includes('secret-from-runtime')&&!/timed out/i.test(error.message));
  assert.equal(calls,1);
});
