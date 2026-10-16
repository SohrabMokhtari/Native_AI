import {validateModel} from './core.mjs';
import {mountApp,RUNTIME_CSS} from './runtime.mjs';
const root=document.getElementById('app');
try{
 const value=new URLSearchParams(location.hash.slice(1)).get('app');
 if(!value||value.length>16000||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Missing or invalid app link.');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)));
 const app=validateModel(JSON.parse(text));document.title=app.name+' · Native AI';
 const css=document.createElement('style');css.textContent=RUNTIME_CSS;document.head.append(css);mountApp(root,app);
}catch(e){const p=document.createElement('p');p.className='error';p.textContent='This app could not be opened: '+e.message;root.replaceChildren(p);}
