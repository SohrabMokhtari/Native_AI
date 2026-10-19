/** Optional maintainer integration: actual Chromium and origin storage; mocked inference/Turnstile. */
import {createServer} from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
import {buildComposable} from '../ai/composable-agent.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=path.resolve(fileURLToPath(new URL('../docs/',import.meta.url)));
const server=createServer(async(req,res)=>{try{const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!name.startsWith(root+path.sep))throw new Error();res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(name));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,checks=[];
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  for(const provider of ['groq','gemini']){
    const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage(),errors=[],sent=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.route('https://challenges.cloudflare.com/**',route=>route.fulfill({contentType:'text/javascript',body:"window.turnstile={render:(root,o)=>{window.proofOptions=o;o.callback('mock-proof');return 0;},reset:()=>window.proofOptions.callback('mock-proof')};"}));
    await page.route('**/api/v3/config',route=>route.fulfill({json:{mode:'live',provider,model:provider==='gemini'?'gemini-3.8-flash':'openai/gpt-oss-120b',maxCalls:3,siteKey:'test-public'}}));
    await page.route('**/api/v3/generate',async route=>{
      const input=route.request().postDataJSON();sent.push(input);const args={payload:JSON.stringify({edits:[{section:'design',id:'',value:{mode:'light'}}]}),message:'Synthetic draft for UI test.',revision:input.revision};
      const response=provider==='gemini'?{candidates:[{finishReason:'STOP',content:{role:'model',parts:[{functionCall:{name:'submit_app',args}}]}}]}:{choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'test',type:'function',function:{name:'submit_app',arguments:JSON.stringify(args)}}]}}]};
      const result=await buildComposable({prompt:input.prompt,current:input.current,revision:input.revision,conversation:input.conversation},{AI_PROVIDER:'groq',V3_AI_PROVIDER:provider,GROQ_API_KEY:'fixture',GEMINI_API_KEY:'fixture'},async()=>Response.json(response));await route.fulfill({json:result});
    });
    await page.goto(origin+'/v3/index.html');await page.locator('#mode.live').waitFor();assert.match(await page.locator('#mode').innerText(),provider==='gemini'?/Gemini/:/Groq/);
    if(provider==='gemini')assert.match(await page.locator('#privacy').innerText(),/Google unpaid-service/);
    await page.locator('#dashboard').click();await page.getByRole('button',{name:'+ Add record',exact:true}).click();await page.getByLabel('Task *',{exact:true}).fill('private-browser-marker');await page.getByRole('button',{name:'Save record',exact:true}).click();
    await page.reload();await page.locator('#mode.live').waitFor();assert.match(await page.locator('.v3-record-card').innerText(),/private-browser-marker/);
    const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('native-ai-workspace-v3')));const before=await saved();
    await page.locator('#prompt').fill('Make it light');await page.locator('#build').click();await page.locator('#draft-bar').waitFor({state:'visible'});assert.deepEqual((await saved()).snapshot,before.snapshot);assert.equal((await saved()).app.design.mode,'dark');
    await page.locator('#discard').click();assert.deepEqual((await saved()).snapshot,before.snapshot);
    await page.locator('#prompt').fill('Make it light');await page.locator('#build').click();await page.locator('#draft-bar').waitFor({state:'visible'});await page.locator('#apply').click();assert.equal((await saved()).app.design.mode,'light');assert.deepEqual((await saved()).snapshot,before.snapshot);
    await page.locator('#undo').click();assert.equal((await saved()).app.design.mode,'dark');assert.deepEqual((await saved()).snapshot,before.snapshot);
    const pending=page.waitForEvent('download');await page.locator('#export').click();const download=await pending,html=await readFile(await download.path(),'utf8');assert.ok(html.includes('createKernel'));assert.doesNotMatch(html,/private-browser-marker|GEMINI_API_KEY/);
    assert.doesNotMatch(JSON.stringify(sent),/private-browser-marker|snapshot/);assert.deepEqual(errors,[]);
    checks.push({provider,passed:true,checks:['provider disclosure','real origin storage/reload','draft staging','discard preserves data','apply preserves data','compatible undo','standalone export excludes records','no private records in request','no page errors']});await context.close();
  }
  const report={method:'Actual local Chromium navigation and localStorage. Inference and Turnstile mocked. No live model or deployed Worker.',checks};await writeFile(new URL('../evidence/gemini-browser.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
