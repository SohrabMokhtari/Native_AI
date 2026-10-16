/** This exact runtime is reused by preview and every exported application. */
export function mountApp(root, model, options = {}) {
  const colors = {violet:'#7055d9',teal:'#087e80',blue:'#2e66c5',rose:'#b84975',amber:'#967015'};
  const key = `native-ai-data:${model.id}`;
  let data = {}, storageWarning = '', viewId = model.views[0].id, query = '';
  const clone = v => JSON.parse(JSON.stringify(v));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const button = (text, fn, cls = 'na-btn') => { const b = el('button',cls,text); b.type='button'; b.addEventListener('click',fn); return b; };
  function checkRows(value) {
    const out = {};
    for (const c of model.collections) {
      const rows = value?.[c.id] || [];
      if (!Array.isArray(rows) || rows.length > 1000) throw new Error('Invalid or oversized saved data.');
      const ids = new Set();
      out[c.id] = rows.map(r => {
        if (!r || typeof r.id !== 'string' || r.id.length > 100 || ids.has(r.id) || !r.values || typeof r.values !== 'object') throw new Error('Invalid saved record.');
        ids.add(r.id);
        return {id:r.id,values:checkValues(c,r.values)};
      });
    }
    return out;
  }
  function checkValues(c, values) {
    const out = {};
    for (const f of c.fields) {
      let v = Object.prototype.hasOwnProperty.call(values,f.id) ? values[f.id] : (f.type === 'boolean' ? false : '');
      if (v === '' || v === null) { if(f.required) throw new Error(`${f.label} is required.`); out[f.id] = f.type === 'boolean' ? false : ''; continue; }
      if (f.type === 'number') { if(typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v)>1e15) throw new Error(`${f.label} must be a finite number.`); }
      else if (f.type === 'boolean') { if(typeof v !== 'boolean') throw new Error(`${f.label} must be true or false.`); }
      else {
        if(typeof v !== 'string' || v.length > (f.type === 'longtext' ? 8000 : 500)) throw new Error(`${f.label} is too long or invalid.`);
        if(f.required && !v.trim()) throw new Error(`${f.label} is required.`);
        if(f.type === 'select' && !f.options.includes(v)) throw new Error(`${f.label} has an invalid option.`);
        if(f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)) || new Date(v).toISOString().slice(0,10)!==v)) throw new Error(`${f.label} must be a real date.`);
      }
      out[f.id] = v;
    }
    return out;
  }
  try {
    data = checkRows(options.data ?? JSON.parse(localStorage.getItem(key) || '{}'));
  } catch (e) {
    storageWarning = 'Saved data could not be loaded. It has not been overwritten. Export or recover it before editing.';
    model.collections.forEach(c => { data[c.id] = []; });
    if (!options.data) options.readOnly = true;
  }
  const box = el('section','native-app'); box.style.setProperty('--app-accent',colors[model.theme]); root.replaceChildren(box);
  const notice = el('p','na-notice'); notice.setAttribute('role','status');
  function persist(next) {
    if(options.readOnly) throw new Error('This recovery view is read-only.');
    const checked = checkRows(next);
    if(options.onChange) options.onChange(clone(checked));
    else localStorage.setItem(key,JSON.stringify(checked));
    data = checked;
  }
  function commit(fn) {
    try { const next=clone(data); fn(next); persist(next); storageWarning=''; draw(); }
    catch(e) { notice.textContent = `Could not save: ${e.message}`; notice.hidden=false; }
  }
  function editor(collection, row) {
    const d = el('dialog','na-dialog'), form=el('form','na-form');
    form.append(el('h2','',row ? 'Edit record' : `Add to ${collection.name}`));
    const inputs = new Map();
    for(const f of collection.fields) {
      const label=el('label','na-field'), span=el('span','',f.label + (f.required?' *':''));
      let input;
      if(f.type==='select') { input=el('select'); if(!f.required) input.append(new Option('Choose…','')); f.options.forEach(o => input.append(new Option(o,o))); }
      else if(f.type==='longtext') { input=el('textarea'); input.rows=3; input.maxLength=8000; }
      else { input=el('input'); input.type=f.type==='boolean'?'checkbox':f.type==='number'?'number':f.type==='date'?'date':'text'; if(f.type==='number') input.step='any'; if(f.type==='text')input.maxLength=500; }
      if(f.type!=='boolean') input.required=f.required;
      if(row) { if(f.type==='boolean')input.checked=!!row.values[f.id]; else input.value=row.values[f.id] ?? ''; }
      input.name=f.id; label.append(span,input); form.append(label); inputs.set(f.id,input);
    }
    const error=el('p','na-notice'); error.setAttribute('role','alert'); error.hidden=true;
    const actions=el('div','na-actions');
    actions.append(button('Cancel',()=>d.close(),'na-btn na-secondary'));
    const save=el('button','na-btn','Save record'); save.type='submit'; actions.append(save); form.append(error,actions);
    form.addEventListener('submit',event=>{
      event.preventDefault();
      try {
        const values={};
        for(const f of collection.fields){const i=inputs.get(f.id);values[f.id]=f.type==='boolean'?i.checked:f.type==='number'?(i.value===''?'':Number(i.value)):i.value;}
        const checked=checkValues(collection,values), next=clone(data), rows=next[collection.id];
        if(row){const target=rows.find(r=>r.id===row.id); if(!target)throw new Error('Record no longer exists.');target.values=checked;}
        else {if(rows.length>=1000)throw new Error('This local prototype supports up to 1,000 records per collection.');rows.push({id:globalThis.crypto.randomUUID(),values:checked});}
        persist(next); d.close(); draw();
      } catch(e) {error.textContent=`Could not save: ${e.message}`;error.hidden=false;}
    });
    d.append(form); box.append(d); d.addEventListener('close',()=>d.remove());d.showModal();
  }
  function recordActions(c,r){
    const a=el('div','na-row-actions');
    for(const f of c.fields.filter(x=>x.type==='boolean'))a.append(button(`${r.values[f.id]?'✓':'○'} ${f.label}`,()=>commit(n=>{n[c.id].find(x=>x.id===r.id).values[f.id]=!r.values[f.id];}),'na-text-btn'));
    a.append(button('Edit',()=>editor(c,r),'na-text-btn'));
    a.append(button('Delete',()=>{if(confirm('Delete this record? This cannot be undone.'))commit(n=>{n[c.id]=n[c.id].filter(x=>x.id!==r.id);});},'na-text-btn na-danger'));
    return a;
  }
  function card(c,v,r){
    const n=el('article','na-card'); n.append(el('h3','',r.values[v.titleField] || 'Untitled'));
    for(const f of c.fields.filter(f=>f.id!==v.titleField&&f.type!=='boolean')){
      const value=r.values[f.id]; if(value===''||value===undefined)continue;
      if(f.type==='select')n.append(el('span','na-tag',value));
      else {const p=el('p','na-value');p.append(el('span','na-label',f.label),el('span','',value));n.append(p);}
    }
    n.append(recordActions(c,r));return n;
  }
  function items(target,c,v){
    const rows=data[c.id].filter(r=>Object.values(r.values).some(x=>String(x).toLowerCase().includes(query.toLowerCase())));
    target.replaceChildren();
    if(!rows.length){const empty=el('div','na-empty');empty.append(el('span','na-empty-symbol','＋'),el('h3','',query?'No matches yet':'A fresh start'),el('p','',query?'Try a different search.':`Add your first record to ${c.name.toLowerCase()}.`));if(!query)empty.append(button('Add your first record',()=>editor(c)));target.append(empty);return;}
    if(v.layout==='table'){
      const wrap=el('div','na-table-wrap'),table=el('table','na-table'),head=el('thead'),hr=el('tr');
      c.fields.forEach(f=>{const th=el('th','',f.label);th.scope='col';hr.append(th);});hr.append(el('th','','Actions'));head.append(hr);table.append(head);
      const body=el('tbody');rows.forEach(r=>{const tr=el('tr');c.fields.forEach(f=>tr.append(el('td','',f.type==='boolean'?(r.values[f.id]?'Yes':'No'):r.values[f.id]??'')));const td=el('td');td.append(recordActions(c,r));tr.append(td);body.append(tr);});table.append(body);wrap.append(table);target.append(wrap);
    }else if(v.layout==='board'){
      const board=el('div','na-board'),field=c.fields.find(f=>f.id===v.groupField),groups=[...field.options];
      if(rows.some(r=>!r.values[field.id]))groups.push('');
      for(const group of groups){const column=el('section','na-column'),subset=rows.filter(r=>r.values[field.id]===group);column.append(el('h3','na-column-title',`${group||'Unassigned'} · ${subset.length}`));subset.forEach(r=>column.append(card(c,v,r)));board.append(column);}target.append(board);
    }else{const grid=el('div','na-cards');rows.forEach(r=>grid.append(card(c,v,r)));target.append(grid);}
  }
  function draw(){
    box.replaceChildren();
    const head=el('header','na-head'),brand=el('div'),mark=el('span','na-mark',model.name.slice(0,1).toUpperCase());
    brand.append(mark,el('span','na-name',model.name));head.append(brand,el('span','na-local','On this device'));box.append(head);
    const intro=el('div','na-intro');intro.append(el('p','na-eyebrow','YOUR SPACE, YOUR PACE'),el('h1','',model.name),el('p','na-description',model.description));box.append(intro);
    const nav=el('nav','na-tabs');nav.setAttribute('aria-label','Application views');
    for(const v of model.views){const b=button(v.title,()=>{viewId=v.id;query='';draw();},`na-tab ${v.id===viewId?'active':''}`);b.setAttribute('aria-current',v.id===viewId?'page':'false');nav.append(b);}box.append(nav);
    const v=model.views.find(v=>v.id===viewId),c=model.collections.find(c=>c.id===v.collection);
    const tools=el('div','na-tools'),search=el('input','na-search');search.type='search';search.placeholder=`Search ${c.name.toLowerCase()}…`;search.setAttribute('aria-label','Search records');search.value=query;
    const content=el('div','na-content');search.addEventListener('input',()=>{query=search.value;items(content,c,v);});
    tools.append(search,button('+ Add record',()=>editor(c)));box.append(tools);
    const stats=el('div','na-stats');stats.append(el('span','',`${data[c.id].length} records`));
    const nf=c.fields.find(f=>f.type==='number');if(nf){const total=data[c.id].reduce((s,r)=>s+(Number(r.values[nf.id])||0),0);stats.append(el('span','',`Total ${nf.label.toLowerCase()}: ${total.toLocaleString(undefined,{maximumFractionDigits:2})}`));}
    box.append(stats);notice.textContent=storageWarning;notice.hidden=!storageWarning;box.append(notice,content);items(content,c,v);
    box.append(el('footer','na-footer','Built with Native AI · Local data only · No account or cloud sync'));
  }
  draw();
  return { getData:()=>clone(data), destroy:()=>root.replaceChildren() };
}
export const RUNTIME_CSS = `
.native-app{--app-accent:#7055d9;box-sizing:border-box;container-type:inline-size;background:#fcfbfe;color:#252232;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:580px;border-radius:14px;padding:26px;line-height:1.5;overflow-wrap:anywhere}.native-app *{box-sizing:border-box}.native-app button,.native-app input,.native-app textarea,.native-app select{font:inherit}.native-app button{cursor:pointer}.native-app button:focus-visible,.native-app input:focus-visible,.native-app textarea:focus-visible,.native-app select:focus-visible{outline:3px solid var(--app-accent);outline-offset:3px}.na-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.na-head>div{display:flex;align-items:center;gap:10px}.na-mark{background:var(--app-accent);color:white;display:grid;place-items:center;width:32px;height:32px;border-radius:10px;font-weight:750}.na-name{font-weight:700;font-size:14px}.na-local{font-size:11px;color:#777081}.na-local:before{content:'● ';color:#398969}.na-intro{padding:38px 0 22px}.na-eyebrow{font-size:9px;font-weight:750;letter-spacing:2px;color:var(--app-accent)}.na-intro h1{font-size:clamp(27px,5cqw,40px);line-height:1.15;letter-spacing:-1.3px;margin:8px 0 12px}.na-description{font-size:14px;color:#777080;margin:0;max-width:520px}.na-tabs{display:flex;gap:20px;border-bottom:1px solid #e9e4ef;overflow-x:auto}.na-tab{white-space:nowrap;border:0;background:none;padding:12px 0;color:#777080;font-size:13px;font-weight:650}.na-tab.active{border-bottom:2px solid var(--app-accent);color:var(--app-accent)}.na-tools{display:flex;justify-content:space-between;gap:12px;margin-top:22px}.na-search{min-width:0;width:240px;border:1px solid #e5deeb;border-radius:8px;background:white;padding:10px 12px;font-size:12px!important}.na-btn{background:var(--app-accent);color:#fff;border:1px solid transparent;padding:10px 15px;border-radius:8px;font-size:12px!important;font-weight:650;white-space:nowrap}.na-secondary{background:#f2eef7;color:#41394e}.na-stats{display:flex;flex-wrap:wrap;gap:20px;font-size:11px;color:#8a8193;margin:15px 0}.na-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:14px}.na-card{padding:17px;border:1px solid #e9e3ef;border-radius:11px;background:white;min-width:0}.na-card h3{margin:0 0 12px;font-size:14px;letter-spacing:-.2px}.na-value{display:flex;flex-direction:column;gap:3px;font-size:12px;color:#5f566b;white-space:pre-wrap;margin:12px 0}.na-label{font-size:9px;letter-spacing:.5px;color:#90869a;text-transform:uppercase}.na-tag{display:inline-block;background:#f3f0f8;border-radius:5px;color:#655476;padding:3px 8px;font-size:10px}.na-row-actions{display:flex;gap:12px;flex-wrap:wrap;border-top:1px solid #f1ecf5;padding-top:12px;margin-top:15px}.na-text-btn{background:none;border:0;padding:0;font-size:11px!important;color:var(--app-accent)}.na-danger{color:#8c7584}.na-board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(170px,1fr);gap:12px;overflow-x:auto;padding-bottom:10px}.na-column{background:#f3f0f8;border-radius:10px;padding:10px;min-width:0}.na-column-title{font-size:11px;font-weight:650;margin:3px 0 12px;color:#73667e}.na-column .na-card{margin-bottom:10px;padding:12px}.na-table-wrap{overflow-x:auto;border:1px solid #e9e3ef;border-radius:10px}.na-table{width:100%;border-collapse:collapse;background:white;font-size:12px}.na-table th{text-align:left;font-weight:650;background:#f6f3fa;white-space:nowrap;font-size:11px}.na-table th,.na-table td{padding:13px;border-bottom:1px solid #f1edf6;max-width:300px}.na-table .na-row-actions{margin:0;padding:0;border:0}.na-empty{text-align:center;border:1px dashed #dcd5e7;background:white;border-radius:12px;padding:35px 20px}.na-empty-symbol{display:grid;place-items:center;margin:auto;width:40px;height:40px;border-radius:12px;background:#f3effb;color:var(--app-accent);font-size:25px}.na-empty h3{font-size:16px;margin:12px 0 5px}.na-empty p{font-size:12px;color:#887d94;margin:0 0 18px}.na-footer{font-size:10px;color:#9b90a5;margin-top:30px;text-align:center}.na-dialog{border:1px solid #ded6e9;border-radius:16px;padding:24px;max-height:85vh;width:min(450px,calc(100vw - 30px));color:#302739;box-shadow:0 20px 80px #20103b30}.na-dialog::backdrop{background:#21143355;backdrop-filter:blur(3px)}.na-form h2{font-size:21px;margin:0 0 20px}.na-field{display:flex;flex-direction:column;gap:6px;margin-bottom:15px;font-size:12px}.na-field input:not([type=checkbox]),.na-field textarea,.na-field select{border:1px solid #dcd3e6;border-radius:7px;padding:10px;width:100%;background:white;color:#302739}.na-field input[type=checkbox]{align-self:flex-start;width:20px;height:20px;accent-color:var(--app-accent)}.na-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.na-notice{background:#fff0dc;color:#754c20;padding:12px;border-radius:8px;font-size:12px}.na-notice[hidden]{display:none}@container(max-width:460px){.na-intro{padding-top:28px}.na-tools{flex-wrap:wrap}.na-search{flex:1;width:140px}.na-board{grid-auto-flow:row;grid-auto-columns:unset;grid-template-columns:1fr}.na-head{align-items:flex-start}.na-local{font-size:9px}}@media(max-width:480px){.native-app{padding:18px;border-radius:0}.na-name{font-size:12px}.na-head{gap:8px}}`;
