"""Draft UI acceptance using injected assets and a fully mocked local hosted response."""
import pathlib,json,re,subprocess
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'evidence';subprocess.run(['node','tests/v3-bundle.mjs'],cwd=ROOT,check=True)
markup=re.sub(r'<script\b[^>]*>.*?</script>|<link[^>]*rel="stylesheet"[^>]*>','',(ROOT/'docs/v3/index.html').read_text(),flags=re.S)
css=(ROOT/'docs/v3/studio.css').read_text();bundle=(OUT/'v3-test-bundle.js').read_text();checks=[]
def ck(name,value):
 if not value:raise AssertionError(name)
 checks.append({'name':name,'passed':True})
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1512,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate("""() => {const memory=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}});window.__sent=[];window.__live=false;window.fetch=async(url,init)=>{if(String(url).includes('/config'))return new Response(JSON.stringify(window.__live?{mode:'live',siteKey:'test-public-key',maxCalls:3}:{mode:'disabled'}));const body=JSON.parse(init.body);window.__sent.push(body);const app=structuredClone(body.current);app.design.mode='light';app.name='Reviewed draft';return new Response(JSON.stringify({status:'ready',message:'A new draft.',app,baseRevision:body.revision,usage:{calls:2},trace:[{tool:'edit_app',ok:true}]}));};} """)
 def boot(live=False):
  page.set_content(markup);page.add_style_tag(content=css)
  if live:
   page.evaluate("""() => {window.__live=true;let options;window.turnstile={render:(root,o)=>{options=o;o.callback('mock-proof');return 0;},reset:()=>options.callback('mock-proof')};const append=document.head.append.bind(document.head);document.head.append=(...nodes)=>{for(const node of nodes){if(node.tagName==='SCRIPT'&&node.src.includes('challenges.cloudflare.com'))node.onload();else append(node);}};} """)
  page.add_script_tag(content=bundle)
 boot();page.get_by_role('button',name='A focused dashboard').click()
 page.get_by_role('button',name='+ Add record',exact=True).click();page.get_by_label('Task *',exact=True).fill('private-marker-not-for-model');page.get_by_role('button',name='Save record',exact=True).click()
 boot(True);page.locator('#mode').filter(has_text='Hosted AI').wait_for();page.get_by_label('What should your app do?',exact=True).fill('Change the design to light.');page.get_by_role('button',name='Build a draft →').click();page.locator('#draft-bar').wait_for(state='visible')
 ck('candidate is staged before application',page.evaluate("JSON.parse(localStorage.getItem('native-ai-workspace-v3')).app.name")=='My Planner')
 ck('draft preview uses candidate appearance',page.locator('.v3-app.light').count()==1)
 ck('record values never sent to the model route','private-marker-not-for-model' not in page.evaluate('JSON.stringify(window.__sent)'))
 page.get_by_role('button',name='Apply draft',exact=True).click()
 ck('approval applies the draft',page.evaluate("JSON.parse(localStorage.getItem('native-ai-workspace-v3')).app.name")=='Reviewed draft')
 ck('approval preserves existing records','private-marker-not-for-model' in page.locator('.v3-record-card').inner_text())
 page.get_by_label('What should your app do?',exact=True).fill('Another change');page.get_by_role('button',name='Build a draft →').click();page.locator('#draft-bar').wait_for(state='visible')
 before=page.evaluate("localStorage.getItem('native-ai-workspace-v3')")
 page.get_by_role('button',name='Discard',exact=True).click()
 ck('discard keeps active app and snapshot',json.loads(before)['snapshot']==json.loads(page.evaluate("localStorage.getItem('native-ai-workspace-v3')"))['snapshot'])
 ck('no uncaught script errors',not errors)
 browser.close()
(OUT/'v3-draft-dom-results.json').write_text(json.dumps({'method':'Injected local assets, mocked API and widget, simulated memory storage. No external request or real provider.','checks':checks,'errors':errors},indent=2));print(json.dumps({'passed':len(checks)}))
