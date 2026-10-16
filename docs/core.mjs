/** Native AI v0.2: executable data, never model-authored source code. */
export const FORMAT = 'native-ai/1';
export const THEMES = ['violet', 'teal', 'blue', 'rose', 'amber'];
export const TYPES = ['text', 'longtext', 'number', 'date', 'select', 'boolean'];
export const LIMITS = { collections: 8, fields: 16, views: 12, rows: 1000, modelBytes: 60000 };
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
function need(ok, message) { if (!ok) throw new Error(message); }
function object(v, keys, path) {
  need(v && typeof v === 'object' && !Array.isArray(v), `${path} must be an object.`);
  need(Object.keys(v).every(k => keys.includes(k)) && keys.every(k => own(v, k)), `${path} has missing or unsupported properties.`);
}
function text(v, n, path, empty = false) { need(typeof v === 'string' && v.length <= n && (empty || v.trim()), `${path} is invalid.`); }
function id(v) { need(typeof v === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(v) && !['__proto__','constructor','prototype'].includes(v), 'Invalid identifier.'); }
function list(v, n, path) { need(Array.isArray(v) && v.length > 0 && v.length <= n, `${path} must contain 1–${n} items.`); }
function unique(v, path) { need(new Set(v.map(x => x.id)).size === v.length, `${path} has duplicate identifiers.`); }
export function validateModel(m) {
  need(JSON.stringify(m).length <= LIMITS.modelBytes, 'Application structure is too large.');
  object(m, ['format','id','name','description','theme','collections','views'], 'App');
  need(m.format === FORMAT, 'Unsupported application format.'); id(m.id);
  text(m.name, 80, 'Name'); text(m.description, 500, 'Description', true);
  need(THEMES.includes(m.theme), 'Unsupported theme.');
  list(m.collections, LIMITS.collections, 'Collections'); unique(m.collections, 'Collections');
  for (const c of m.collections) {
    object(c, ['id','name','fields'], 'Collection'); id(c.id); text(c.name, 60, 'Collection name');
    list(c.fields, LIMITS.fields, 'Fields'); unique(c.fields, 'Fields');
    for (const f of c.fields) {
      object(f, ['id','label','type','required','options'], 'Field'); id(f.id); text(f.label, 60, 'Field label');
      need(TYPES.includes(f.type) && typeof f.required === 'boolean', 'Invalid field type or required flag.');
      need(Array.isArray(f.options) && f.options.length <= 12 && new Set(f.options).size === f.options.length, 'Invalid field options.');
      f.options.forEach(o => text(o, 60, 'Option'));
      need(f.type === 'select' ? f.options.length > 0 : f.options.length === 0, 'Only select fields have options.');
    }
  }
  list(m.views, LIMITS.views, 'Views'); unique(m.views, 'Views');
  for (const v of m.views) {
    object(v, ['id','title','collection','layout','titleField','subtitleField','groupField'], 'View');
    id(v.id); text(v.title, 60, 'View title');
    const c = m.collections.find(c => c.id === v.collection); need(c, 'View references a missing collection.');
    need(['cards','table','board'].includes(v.layout), 'Unsupported layout.');
    need(c.fields.some(f => f.id === v.titleField), 'Missing title field.');
    need(v.subtitleField === '' || c.fields.some(f => f.id === v.subtitleField), 'Missing subtitle field.');
    need(v.groupField === '' || c.fields.some(f => f.id === v.groupField && f.type === 'select'), 'Group field must be a select field.');
    need(v.layout !== 'board' || v.groupField !== '', 'Boards need a select field to group by.');
  }
  return structuredClone(m);
}
export function validateRow(collection, values) {
  need(values && typeof values === 'object' && !Array.isArray(values), 'Invalid record.');
  need(Object.keys(values).every(k => collection.fields.some(f => f.id === k)), 'Unknown record field.');
  const out = {};
  for (const f of collection.fields) {
    const value = own(values, f.id) ? values[f.id] : (f.type === 'boolean' ? false : '');
    const missing = value === '' || value === null;
    need(!f.required || !missing, `${f.label} is required.`);
    if (missing && f.type !== 'boolean') { out[f.id] = ''; continue; }
    if (f.type === 'boolean') need(typeof value === 'boolean', `${f.label} must be true or false.`);
    else if (f.type === 'number') need(typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e15, `${f.label} must be a finite number.`);
    else {
      text(value, f.type === 'longtext' ? 8000 : 500, f.label, !f.required);
      if (f.type === 'select') need(f.options.includes(value), `${f.label} has an invalid option.`);
      if (f.type === 'date') need(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value, `${f.label} must be a real date.`);
    }
    out[f.id] = value;
  }
  return out;
}
export function validateData(m, data) {
  need(data && typeof data === 'object' && !Array.isArray(data), 'Invalid application data.');
  need(Object.keys(data).every(k => m.collections.some(c => c.id === k)), 'Unknown data collection.');
  const out = {};
  for (const c of m.collections) {
    const rows = own(data, c.id) ? data[c.id] : [];
    need(Array.isArray(rows) && rows.length <= LIMITS.rows, 'Too many records.');
    const seen = new Set();
    out[c.id] = rows.map(r => {
      object(r, ['id','values'], 'Record'); text(r.id, 100, 'Record ID');
      need(!seen.has(r.id), 'Duplicate record ID.'); seen.add(r.id);
      return { id: r.id, values: validateRow(c, r.values) };
    });
  }
  return out;
}
export function compatible(previous, next, data) {
  validateModel(next);
  if (!previous) return;
  need(previous.id === next.id, 'An edit cannot change the application ID.');
  for (const c of previous.collections) {
    if (!data[c.id]?.length) continue;
    const n = next.collections.find(x => x.id === c.id);
    need(n, 'Cannot remove a collection containing data. Export a backup first.');
    for (const f of c.fields) {
      const nf = n.fields.find(x => x.id === f.id);
      need(nf && nf.type === f.type, 'Cannot remove or change the type of a populated field.');
    }
  }
  validateData(next, data);
}
const field = (id, label, type = 'text', required = false, options = []) => ({ id, label, type, required, options });
export function starter(kind, appId = `app-${globalThis.crypto.randomUUID()}`) {
  const library = {
    tasks: ['Daylight', 'A little structure. A lot more headspace.', 'Tasks', [field('title','Task','text',true),field('notes','Notes','longtext'),field('status','Status','select',true,['To do','In progress','Done']),field('due','Due date','date')], 'board','status'],
    reading: ['Next chapter', 'Keep the books that stay with you.', 'Books', [field('title','Book','text',true),field('author','Author'),field('notes','Notes','longtext'),field('status','Status','select',true,['Want to read','Reading','Finished'])], 'cards','status'],
    expenses: ['Pocket ledger', 'Make room for what matters.', 'Expenses', [field('title','Expense','text',true),field('amount','Amount','number',true),field('category','Category','select',true,['Food','Travel','Home','Other']),field('date','Date','date')], 'table','category'],
    habits: ['Small steps', 'Build a rhythm, one small win at a time.', 'Habits', [field('title','Habit','text',true),field('notes','Your reason','longtext'),field('done','Completed today','boolean')], 'cards',''],
    inventory: ['Shelf', 'A home for everything you keep.', 'Items', [field('title','Item','text',true),field('quantity','Quantity','number'),field('location','Location'),field('notes','Notes','longtext')], 'table',''],
    notes: ['Fieldnotes', 'A quiet place for your ideas.', 'Notes', [field('title','Title','text',true),field('body','Note','longtext'),field('category','Collection','select',false,['Ideas','Work','Personal'])], 'cards','category']
  };
  need(own(library, kind), 'Unknown starter.');
  const [name, description, cname, fields, layout, groupField] = library[kind];
  return validateModel({ format: FORMAT, id: appId, name, description, theme: 'violet', collections: [{id:'items',name:cname,fields}], views:[{id:'home',title:cname,collection:'items',layout,titleField:'title',subtitleField:fields[1].id,groupField}] });
}
export function offlinePlan(prompt, current) {
  text(prompt, 2000, 'Request');
  const p = prompt.toLowerCase();
  need(!/\b(payment|payments|login|logins|authentication|multiplayer|shared database|real.time chat|bank connection|native ios|apk|ipa)\b/.test(p), 'This needs capabilities beyond the local starter engine. No app changes were made.');
  if (current) {
    const m = structuredClone(current); let changed = false;
    const name = prompt.match(/^(?:rename(?: it)?(?: to)?|call it|name it)\s+["']?(.+?)["']?[.!]?$/i);
    if (name) { m.name = name[1]; changed = true; }
    for (const theme of THEMES) if (new RegExp(`\\b${theme}\\b`).test(p)) { m.theme = theme; changed = true; }
    const layout = /\b(board|table|cards)\b/.exec(p)?.[1];
    if (layout) { m.views[0].layout = layout; changed = true; }
    const added = prompt.match(/^add (?:a |an )?(text|number|date|boolean) field (?:called |named )?["']?([a-z][a-z ]{0,35})["']?[.!]?$/i);
    if (added) {
      const label = added[2].trim(), fid = label.toLowerCase().replace(/\s+/g,'_');
      m.collections[0].fields.push(field(fid,label,added[1].toLowerCase())); changed = true;
    }
    need(changed, 'Starter mode supports renaming, theme colors, cards/table/board layouts, and “add a text field called …”. Broader edits require hosted AI.');
    return { app: validateModel(m), message: 'Starter-mode edit. Review the preview; only the supported change shown here was applied.' };
  }
  const kinds = [['reading',/\b(book|books|reading)\b/],['expenses',/\b(expense|expenses|budget|spending)\b/],['habits',/\b(habit|habits)\b/],['inventory',/\b(inventory|stockroom)\b/],['notes',/\b(note|notes|journal)\b/],['tasks',/\b(task|tasks|todo|to.do|kanban)\b/]];
  const kind = kinds.find(([,pattern]) => pattern.test(p))?.[0];
  need(kind, 'This request is outside starter mode. Try a task board, reading list, expense tracker, habits, inventory, or notes. Hosted AI enables broader requests within the engine’s capabilities.');
  const app = starter(kind);
  for (const theme of THEMES) if (new RegExp(`\\b${theme}\\b`).test(p)) app.theme = theme;
  return { app, message: `Created a ${kind} starter, not a full interpretation of every detail in your request. Data stays in this browser. Review and refine it below.` };
}
const str = { type:'string' };
const obj = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const MODEL_SCHEMA = obj({format:{type:'string',enum:[FORMAT]},id:str,name:str,description:str,theme:{type:'string',enum:THEMES},collections:{type:'array',items:obj({id:str,name:str,fields:{type:'array',items:obj({id:str,label:str,type:{type:'string',enum:TYPES},required:{type:'boolean'},options:{type:'array',items:str}})}})},views:{type:'array',items:obj({id:str,title:str,collection:str,layout:{type:'string',enum:['cards','table','board']},titleField:str,subtitleField:str,groupField:str})}});
export const RESPONSE_SCHEMA = obj({ status:{type:'string',enum:['ready','unsupported']},message:str,app:{anyOf:[MODEL_SCHEMA,{type:'null'}]} });
