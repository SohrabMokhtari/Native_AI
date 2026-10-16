/** Test-only static module concatenator. No generated program is converted into source. */
import {composableHTML} from '../docs/v3/export.mjs';
import {quizExample} from '../docs/v3/examples.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),modules=new Map();
function bundle(file){const rel=path.relative(root,file).replaceAll('\\','/');if(modules.has(rel))return rel;let source=fs.readFileSync(file,'utf8');modules.set(rel,'');
  source=source.replace(/^import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?\s*$/gm,(_,clause,dep)=>{const target=bundle(path.resolve(path.dirname(file),dep));return `const ${clause}=require(${JSON.stringify(target)});`;});
  const names=[...source.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let)\s+([a-zA-Z_$][\w$]*)/g)].map(m=>m[1]);
  for(const match of source.matchAll(/export\s+const\s*\{([^}]+)\}/g))names.push(...match[1].split(',').map(x=>x.trim()));
  source=source.replace(/\bexport\s+(?=(?:async\s+)?(?:function|class|const|let)\b)/g,'');
  modules.set(rel,`function(require,module,exports){\n${source}\nmodule.exports={${names.join(',')}};\n}`);return rel;
}
const entry=bundle(path.join(root,'docs/v3/studio.mjs'));
const out=`(()=>{const modules={${[...modules].map(([key,value])=>`${JSON.stringify(key)}:${value}`).join(',\n')}};const cache={};function require(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](require,module,module.exports);return module.exports;}require(${JSON.stringify(entry)});})();`;
fs.writeFileSync(path.join(root,'evidence/v3-test-bundle.js'),out);console.log('Created test-only module bundle.');
fs.writeFileSync(path.join(root,'../native-ai-quiz-v3.html'),composableHTML(quizExample()));
