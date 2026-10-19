import test from 'node:test';import assert from 'node:assert/strict';
import {evaluate,parseArgs} from '../scripts/eval-builder.mjs';
import {CASES,accept,taskWorkspace} from '../scripts/eval-cases.mjs';
import {preflight} from '../docs/v3/checks.mjs';
test('evaluation defaults dry and touches no credentials or network',async()=>{let calls=0;const r=await evaluate(parseArgs([]),{},()=>{calls++;throw new Error();});assert.equal(calls,0);assert.equal(r.liveResults,'NOT RUN');assert.equal(r.configurations.length,3);assert.equal(r.cases.length,8);assert.equal(r.cases.filter(c=>c.heldOut).length,1);});
for(const args of [['--live'],['--live','--max-calls=100','--max-tokens=4096'],['--config=other'],['--case=other'],['--typo']])test('evaluation rejects unsafe/unknown arguments '+args.join(' '),()=>assert.throws(()=>parseArgs(args)));
test('live missing credential guard runs before network',async()=>{let calls=0;await assert.rejects(evaluate(parseArgs(['--live','--config=optimized-gemini','--case=create','--max-calls=3','--max-tokens=8192']),{},()=>{calls++;}));assert.equal(calls,0);});
test('quota failure stops comparison and includes failed request metrics',async()=>{
  let calls=0;const r=await evaluate(parseArgs(['--live','--max-calls=6','--max-tokens=24576']),{GROQ_API_KEY:'fixture',GEMINI_API_KEY:'fixture'},async()=>{calls++;return new Response(null,{status:429});});assert.equal(calls,1);assert.equal(r.stop,'AI_QUOTA_EXCEEDED');assert.equal(r.results[0].success,false);assert.equal(r.summaries[0].calls,1);assert.equal(r.summaries[0].quotaErrors,1);assert.equal(r.summaries[0].tokens.inputTokens.unknownCalls,1);
});
test('global evaluation budget stops without overshooting, even without usage',async()=>{
  let calls=0;const r=await evaluate(parseArgs(['--live','--config=optimized-gemini','--max-calls=1','--max-tokens=4096']),{GEMINI_API_KEY:'fixture'},async()=>{calls++;return Response.json({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{functionCall:{name:'inspect_app',args:{}}}]}}]});});assert.equal(calls,1);assert.equal(r.calls,1);assert.equal(r.reservedOutputTokens,4096);assert.equal(r.stop,'EVAL_BUDGET_EXHAUSTED');assert.equal(r.summaries[0].failures,1);
});
test('acceptance oracle rejects plausible but incorrect app independently of authored tests',()=>{
  const c=CASES.find(c=>c.id==='completion'),p=taskWorkspace();p.functions=[{id:'completion',params:[],returns:'number',body:100}];p.tests=[{name:'self-serving assertion',state:{},data:{},actions:[],expect:[{value:100,equals:100}]}];assert.equal(preflight(p).passed,true);assert.throws(()=>accept(c,{status:'ready',app:p,checks:preflight(p)},c.start()));
});
