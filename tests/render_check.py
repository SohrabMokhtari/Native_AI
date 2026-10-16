"""Restricted-environment DOM tests: no navigation; storage is a test-only memory adapter."""
import json,pathlib,re,zipfile
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'evidence';checks=[]
modules=['core.mjs','runtime.mjs','export.mjs','studio.mjs']
def bundle(names):
    code='\n'.join((ROOT/'docs'/name).read_text() for name in names)
    code=re.sub(r'^import .*?;\s*$', '',code,flags=re.M)
    code=re.sub(r'\bexport (?=(?:const|function|async function|class)\b)','',code)
    return code
html=(ROOT/'docs/index.html').read_text()
html=re.sub(r'<script[^>]+src="./studio.mjs"[^>]*></script>','',html)
html=html.replace('<link rel="stylesheet" href="./style.css">','<style>'+(ROOT/'docs/style.css').read_text()+'</style>')
html=html.replace('<link rel="icon" href="./icon.svg">','')
def record(name,cond=True):
    assert cond,name
    checks.append(name)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1150},accept_downloads=True)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    bootstrap="""window.__store={};Object.defineProperty(window,'localStorage',{value:{getItem:k=>window.__store[k]??null,setItem:(k,v)=>{window.__store[k]=v},removeItem:k=>{delete window.__store[k]}}});window.fetch=async()=>new Response('{"mode":"starter"}',{headers:{'Content-Type':'application/json'}});if(!crypto.randomUUID)crypto.randomUUID=()=> 'app-'+Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');"""
    page.set_content(html);page.evaluate(bootstrap);page.add_script_tag(content='(()=>{'+bundle(modules)+'})();')
    page.screenshot(path=str(OUT/'01-studio-desktop.png'),full_page=True)
    page.locator('[data-prompt="Build a task board"]').click();page.locator('.native-app').wait_for(timeout=3000)
    record('Starter labels its non-AI mode',page.locator('#mode').inner_text()=='Starter mode')
    record('Task starter renders from plain language',page.locator('.na-intro h1').inner_text()=='Daylight')
    def add(title,status='To do',notes=''):
        page.get_by_role('button',name='+ Add record',exact=True).click()
        page.locator('.na-dialog input[name=title]').fill(title)
        page.locator('.na-dialog textarea[name=notes]').fill(notes)
        page.locator('.na-dialog select[name=status]').select_option(status)
        page.get_by_role('button',name='Save record',exact=True).click()
    add('Sketch the next big idea','In progress','Start with the one thing people need most.')
    add('Take a proper lunch break','To do','A little space makes better work.')
    add('Ship something useful','Done','Small, working, and ready to share.')
    record('Create records and board groups',page.locator('.na-card').count()==3 and page.locator('.na-column').count()==3)
    record('Workspace written to storage adapter',len(json.loads(page.evaluate("localStorage.getItem('native-ai-workspace-v2')"))['data']['items'])==3)
    for prompt,title in [('Rename it My little workspace','Conversational rename'),('Make it teal','Theme change'),('Add a text field called Owner','Optional field extension')]:
        page.locator('#prompt').fill(prompt);page.locator('#prompt-form').evaluate('(f)=>f.requestSubmit()');record(title,page.locator('.na-card').count()==3)
    record('Rename applied',page.locator('.na-intro h1').inner_text()=='My little workspace')
    record('Theme applied',page.locator('.native-app').evaluate("n=>n.style.getPropertyValue('--app-accent')")=='#087e80')
    page.locator('#prompt').fill('Build a video editor with payments');page.locator('#prompt-form').evaluate('(f)=>f.requestSubmit()')
    record('Unsupported request preserves app',page.locator('.na-intro h1').inner_text()=='My little workspace')
    page.locator('.na-search').fill('proper lunch');record('Search filters records',page.locator('.na-card').count()==1);page.locator('.na-search').fill('')
    page.locator('.na-card').filter(has_text='Take a proper lunch break').get_by_role('button',name='Edit',exact=True).click()
    page.locator('.na-dialog select[name=status]').select_option('Done');page.locator('.na-dialog input[name=owner]').fill('Me');page.get_by_role('button',name='Save record',exact=True).click()
    record('Edit moves record to correct board column',page.get_by_role('heading',name='Done · 2',exact=True).count()==1)
    page.screenshot(path=str(OUT/'02-app-desktop.png'),full_page=True)
    page.locator('#mobile').click();record('Phone preview works','phone' in page.locator('#app-root').get_attribute('class'));page.screenshot(path=str(OUT/'03-phone-preview.png'),full_page=True);page.locator('#desktop').click()
    add('<img src=x onerror="window.xss=true">','To do','</script><script>window.xss=true</script>')
    record('Malicious-looking record text is not HTML or code',page.evaluate('window.xss !== true') and page.locator('.na-card img').count()==0)
    page.once('dialog',lambda d:d.accept());page.locator('.na-card').filter(has_text='<img src=x').get_by_role('button',name='Delete',exact=True).click()
    record('Delete removes intended record',page.locator('.na-card').count()==3)
    state=json.loads(page.evaluate("localStorage.getItem('native-ai-workspace-v2')"));(OUT/'test-state.json').write_text(json.dumps(state))
    page.locator('#export').click();record('Export choices visible',page.locator('#export-dialog').is_visible());page.locator('#export-dialog .close').click()
    # Restart the UI against the same test storage adapter (not a real page reload).
    page.set_content(html);page.add_script_tag(content='(()=>{'+bundle(modules)+'})();')
    record('UI restores saved workspace through storage adapter',page.locator('.na-card').count()==3)
    phone=browser.new_context(viewport={'width':390,'height':844},is_mobile=True)
    mobile=phone.new_page();mobile.set_content(html);mobile.evaluate(bootstrap);mobile.add_script_tag(content='(()=>{'+bundle(modules)+'})();')
    mobile.locator('[data-prompt="Build a reading list in teal"]').click();mobile.locator('.native-app').wait_for(timeout=3000)
    record('390px mobile layout has no horizontal overflow',mobile.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
    mobile.screenshot(path=str(OUT/'05-studio-mobile.png'),full_page=True)
    record('No uncaught errors in tested studio interactions',not errors)
    # Validate the exported runtime by local DOM injection with all networking unavailable.
    code=bundle(['core.mjs','runtime.mjs','export.mjs'])
    testpage=browser.new_page();testpage.set_content('<main id="app"></main>');testpage.evaluate(bootstrap)
    exported=testpage.evaluate('model=>{'+code+';return appHTML(model)}',state['app'])
    (OUT/'sample-app.html').write_text(exported)
    record('App export excludes record values','Take a proper lunch break' not in exported)
    record('Export includes no external script dependencies','src="https://' not in exported)
    testpage.evaluate("()=>{window.fetch=()=>Promise.reject(new Error('Network disabled by test'));window.XMLHttpRequest=class{constructor(){throw new Error('No network')}};}")
    testpage.set_content(exported)
    record('Exported runtime renders with network disabled',testpage.locator('.na-intro h1').inner_text()=='My little workspace')
    testpage.get_by_role('button',name='+ Add record',exact=True).click();testpage.locator('.na-dialog input[name=title]').fill('Offline record');testpage.get_by_role('button',name='Save record',exact=True).click()
    record('Exported runtime creates records without network',testpage.locator('.na-card').count()==1)
    testpage.screenshot(path=str(OUT/'04-exported-app.png'),full_page=True)
    # ZIP bytes produced by browser code; verify independently with Python's ZIP reader.
    zipbytes=page.evaluate('model=>{'+code+';return Array.from(zipFiles(pwaFiles(model)))}',state['app'])
    (OUT/'sample-app-web.zip').write_bytes(bytes(zipbytes))
    with zipfile.ZipFile(OUT/'sample-app-web.zip') as z:
        record('Browser ZIP export passes independent CRC check',z.testzip() is None)
        record('PWA package has its required files',set(z.namelist())=={'index.html','manifest.webmanifest','sw.js','icon.svg','README.txt'})
    browser.close()
result={'passed':len(checks),'checks':checks,'method':'Local DOM rendering in Chromium with a test-only in-memory localStorage adapter. Exported runtime injected locally with network calls disabled. Direct navigation is blocked by managed browser policy; policy was not changed. ZIP verified independently.','not_tested':['Real browser localStorage and page reload','Direct file:// export navigation/downloads','Real AI provider','Cloudflare deployment/Turnstile','Service-worker caching and PWA installation','Safari/iOS/Android devices','App-store builds','Cloud sync']}
(OUT/'browser-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
