// Checklist verifier: behaviour, content, language, contrast and offline checks in jsdom.
// Run it directly, or import it from a layer (for example a UAT guide) that adds its own checks.
import {existsSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const PATTERN_DIR=path.dirname(fileURLToPath(import.meta.url));
export const FLAVOUR_DIR=path.resolve(PATTERN_DIR,'../..');
export const USAGE='node verify.mjs page.html [--repo checkout-with-jsdom | --jsdom dir] [--origin https://host] [--expected-count n] [--forbid-host text]... [--example other.html] [--language-report report.json] [--preserve file --preserve-sha256 hash]';

export function parseArgs(argv){
 const [file,...args]=argv,opts={};
 for(let i=0;i<args.length;i+=2){const k=args[i].replace(/^--/,'');(opts[k]??=[]).push(args[i+1]);}
 const get=(k,fallback)=>opts[k]?.[0]??fallback;
 return {file,opts,get};
}

// jsdom comes from --jsdom, a checkout given by --repo (pnpm or npm layout), the current directory, or the global npm root.
export function loadJsdom(get){
 const tries=[];
 if(get('jsdom'))tries.push(path.resolve(get('jsdom')));
 for(const root of [get('repo'),process.cwd()].filter(Boolean).map(r=>path.resolve(r))){
  const pnpm=path.join(root,'node_modules/.pnpm');
  if(existsSync(pnpm)){const dir=readdirSync(pnpm).find(x=>x.startsWith('jsdom@'));if(dir)tries.push(path.join(pnpm,dir,'node_modules/jsdom'));}
  tries.push(path.join(root,'node_modules/jsdom'));
 }
 const load=dir=>createRequire(path.join(dir,'package.json'))(dir);
 for(const dir of tries)if(existsSync(path.join(dir,'package.json')))return load(dir);
 try{const dir=path.join(execFileSync('npm',['root','-g'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(),'jsdom');if(existsSync(path.join(dir,'package.json')))return load(dir);}catch{}
 throw Error('jsdom not found. Pass --repo <checkout with node_modules> or --jsdom <jsdom package dir>, or run npm install -g jsdom.');
}

export function createContext(get){
 const {JSDOM,VirtualConsole}=loadJsdom(get);
 const ctx={failures:[],count:0,warnings:[]};
 ctx.ok=(value,label)=>{ctx.count++;console.log(`${value?'PASS':'FAIL'} ${label}`);if(!value)ctx.failures.push(label);};
 ctx.warn=label=>{ctx.warnings.push(label);console.log(`WARN ${label}`);};
 ctx.boot=async(source,store={},denied=false,reduced=false)=>{
  const errors=[],requests=[],scrolls=[],scrollOptions=[],animations=[],clipboard=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(source,{url:'https://guide.invalid/offline.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
   const RealDate=w.Date;w.Date=class extends RealDate{constructor(...a){super(...(a.length?a:['2026-10-02T11:22:00Z']));}static now(){return new RealDate('2026-10-02T11:22:00Z').getTime();}};
   w.HTMLElement.prototype.scrollIntoView=function(options){scrolls.push(this.id);scrollOptions.push(options);};
   w.matchMedia=query=>({matches:query.includes('reduced-motion')&&reduced,addEventListener(){}});
   // A controlled animation clock lets tests inspect start frames and finish explicitly.
   w.HTMLElement.prototype.animate=function(frames,options){const a={node:this,frames,options,onfinish:null,cancelled:false,cancel(){this.cancelled=true;},finish(){if(!this.cancelled&&this.onfinish){const done=this.onfinish;this.onfinish=null;done();}}};animations.push(a);return a;};
   w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.document.execCommand=()=>false;
   Object.defineProperty(w,'isSecureContext',{value:true});
   Object.defineProperty(w.navigator,'clipboard',{value:{writeText(t){clipboard.push(t);return Promise.resolve();}}});
   w.fetch=()=>{requests.push('fetch');throw Error('Network prohibited');};
   w.XMLHttpRequest=function(){requests.push('XHR');throw Error('Network prohibited');};
   if(denied)Object.defineProperty(w,'localStorage',{get(){throw Error('Storage denied');}});
   else for(const[k,v]of Object.entries(store))w.localStorage.setItem(k,v);
  }});
  if(dom.window.document.readyState==='loading')await new Promise(r=>dom.window.document.addEventListener('DOMContentLoaded',r,{once:true}));
  await new Promise(r=>setTimeout(r,5));
  return {dom,w:dom.window,d:dom.window.document,errors,requests,scrolls,scrollOptions,animations,clipboard};
 };
 return ctx;
}

export const data=x=>JSON.parse(x.d.getElementById('guide-data').textContent);
export const rowsOf=G=>G.outcomes.flatMap(o=>o.steps);
export const finishAnimations=x=>{for(const a of x.animations)a.finish();};
export const mark=(x,id,val)=>x.d.querySelector(`#step-${id} .r[data-v="${val}"]`).click();
export function contentCommands(G){
 const found=(G.helpers||[]).map(h=>h.code);
 const walk=items=>{for(const item of items||[]){if(item&&typeof item==='object'){if(item.command!=null)found.push(item.command);walk(item.steps);}}};
 walk(G.walkNotes);for(const o of G.outcomes){walk(o.setupPoints);for(const s of o.steps){walk(s.detail?.how);walk(s.detail?.cleanup);}}
 return found;
}
export function contrast(a,b){const luminance=c=>{const rgb=c.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}

// Language: code spans count as one word and command boxes are not prose.
const sentences=t=>[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(t.replace(/\/[^\s]+/g,'ROUTE'))].map(x=>x.segment.trim()).filter(Boolean);
const wordCount=t=>(t.replace(/\*\*|`/g,'').trim().match(/\S+/g)||[]).length;
function prose(node){const clone=node.cloneNode(true);clone.querySelectorAll('.copy-box,.shot-source').forEach(n=>n.remove());clone.querySelectorAll('code').forEach(n=>n.replaceWith('CODE'));return clone;}
export function languageReport(d,rows){
 const language={procedureOverLength:[],descriptionOverLength:[],missingLead:[],denseItems:[],compoundInstructions:[]};
 const procedureNodes=[...d.querySelectorAll('.procedure-item')];
 for(const li of procedureNodes){
  const lead=li.querySelector(':scope > strong.lead'),body=li.querySelector(':scope > .instruction'),sub=li.querySelector(':scope > ol');
  if(!lead||li.firstElementChild!==lead||!lead.textContent.trim())language.missingLead.push(li.textContent.slice(0,100));
  const text=body?prose(body).textContent.trim():'';
  if(sentences(text).length>1&&!sub)language.denseItems.push(text);
  for(const sentence of sentences(text))if(wordCount(sentence)>20)language.procedureOverLength.push({location:li.closest('.step')?.id||li.closest('details')?.id||'walk-notes',words:wordCount(sentence),sentence});
  // Common chained imperatives catch short compound instructions too; conjunctions between objects are allowed.
  const plain=body?.cloneNode(true);plain?.querySelectorAll('strong,code').forEach(n=>n.replaceWith('LABEL'));
  const instruction=(plain?.textContent||'').trim().replace(/^If[^,]+,\s*/i,'');
  if(/(?:,\s*then\s+|\s+(?:and|then)\s+)(?:click|open|select|reload|download|upload|delete|record|save|restore|compare|wait|cancel)\b/i.test(instruction))language.compoundInstructions.push(body.textContent.trim());
 }
 for(const node of d.querySelectorAll('.do')){
  const children=[...node.children];
  if(children[0]?.textContent!=='Do:'||children[1]?.tagName!=='STRONG')language.missingLead.push(node.textContent);
  const clone=prose(node);[...clone.children].slice(0,2).forEach(n=>n.remove());
  const text=clone.textContent.trim();
  if(sentences(text).length>1)language.denseItems.push(text);
  for(const sentence of sentences(text))if(wordCount(sentence)>20)language.procedureOverLength.push({location:node.closest('.step').id+'/Do',words:wordCount(sentence),sentence});
 }
 for(const node of d.querySelectorAll('.warning,.helper-intro,#before li')){
  const clone=prose(node);if(clone.firstElementChild?.tagName==='STRONG')clone.firstElementChild.remove();
  for(const sentence of sentences(clone.textContent.trim()))if(wordCount(sentence)>20)language.procedureOverLength.push({location:node.closest('details')?.id||'overview',words:wordCount(sentence),sentence});
 }
 for(const node of d.querySelectorAll('.check,.hook,.changed,.intro,.legend span,[data-detail="data"],[data-detail="expect"],[data-detail="failure"],[data-detail="why"],figcaption,#out li,.coverage')){
  for(const sentence of sentences(prose(node).textContent))if(wordCount(sentence)>25)language.descriptionOverLength.push({location:node.closest('.step')?.id||'overview',words:wordCount(sentence),sentence});
 }
 return {language,procedureCount:procedureNodes.length};
}

// Generic checks. Returns the booted page and its content for layer checks.
export async function verifyChecklist(file,get,opts,ctx,layer={}){
 const {ok,warn,boot}=ctx;
 const html=readFileSync(file,'utf8');
 const B=await boot(html),{d,w}=B;
 const G=data(B),rows=rowsOf(G),ids=rows.map(s=>String(s.n));
 const prefix=d.querySelector('meta[name="flavour-storage"]')?.content||'html-flavour';
 const api=()=>w.checklist;
 ok(!B.errors.length,'page starts without script errors'+(B.errors.length?': '+B.errors[0]:''));
 ok(rows.length===Number(get('expected-count',rows.length))&&d.querySelectorAll('.step').length===rows.length,'expected check count in content and DOM');
 ok(new Set(ids).size===rows.length&&ids.every(id=>d.getElementById('step-'+id)),'every check ID appears exactly once');

 // Page contract shared with the artifact-design skill.
 const css=[...d.querySelectorAll('style')].map(x=>x.textContent).join('');
 const title=d.title.trim(),words=(title.match(/[\w’'-]+/g)||[]).length;
 if(words<2||words>4)warn(`<title> "${title}" has ${words} words; the page contract asks for 2 to 4 (set pageTitle)`);
 ok(/:root\{[^}]*--bg:/.test(css)&&css.includes(':root[data-theme="dark"]{')&&css.includes('@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){'),'colour tokens on :root; dark tokens for data-theme="dark" and for System when the OS prefers dark');
 ok(/body\{[^}]*background:var\(--bg\)/.test(css),'body has an explicit background');
 ok(/@media\(max-width:600px\)\{\.wrap\{padding-inline:16px\}/.test(css),'phone width uses a 16px side gutter');

 ok([...d.querySelectorAll('details')].every(x=>!x.open),'all areas and nested details start closed');
 ok(d.querySelectorAll('details.area').length===G.outcomes.length,'one area for each outcome');
 ok([...d.querySelectorAll('.index li')].every(li=>li.children.length===1&&li.firstElementChild.matches('button.index-row')&&li.querySelector('.hook')&&li.querySelector('.risk')&&li.querySelector('.count')),'each whole index row is an accessible button with reason, risk and progress');
 const legend=d.getElementById('legend').textContent;
 ok(['High','Med','Low'].every(t=>legend.includes(t)),'risk legend is visible near the index');
 ok(Object.values(G.riskLegend||{}).every(t=>legend.includes(t.replace(/\*\*|`/g,''))),'risk legend wording comes from content');
 for(const button of d.querySelectorAll('.index-row')){
  const id=button.getAttribute('aria-controls');button.click();
  ok(d.getElementById(id).open&&B.scrolls.at(-1)===id&&d.activeElement===d.querySelector('#'+id+' > summary'),`index opens, scrolls and focuses ${id}`);
 }
 d.getElementById('collapse').click();finishAnimations(B);ok([...d.querySelectorAll('details[data-persist]')].every(x=>!x.open),'Collapse all closes every section');
 d.getElementById('expand').click();finishAnimations(B);ok([...d.querySelectorAll('details[data-persist]')].every(x=>x.open),'Expand all opens every section');
 d.getElementById('collapse').click();finishAnimations(B);
 ok([...d.querySelectorAll('.area .setup-list')].every(x=>x.tagName==='OL'),'every Setup and put back list is numbered');
 ok([...d.querySelectorAll('.detail-list dd')].every(dd=>dd.textContent.trim().length>=20||dd.querySelector('.copy-box')),'every More field present is substantive');
 ok(d.querySelectorAll('figure[data-diagram]').length<=1,'at most one flow diagram');
 ok([...d.querySelectorAll('figure[data-diagram] svg')].every(x=>x.querySelector('title')&&x.querySelector('desc')),'diagram has accessible descriptions in both layouts');
 if(get('origin')){const origin=get('origin').replace(/\/$/,'');ok([...d.querySelectorAll('a.open')].every(a=>a.href.startsWith(origin+'/')),'all check links start with the allowed origin');}
 ok(rows.every(s=>!!(s.route!=null&&G.baseUrl)===!!d.querySelector(`#step-${s.n} a.open`)),'checks with a route have a Link; checks without one have none');
 for(const host of opts['forbid-host']||[])ok(!html.includes(host),`zero occurrences of ${host}`);
 ok(!d.querySelector('script[src],link,iframe,video,audio,object,embed,source')&&[...d.querySelectorAll('img[src]')].every(x=>x.src.startsWith('data:image/png;base64,')),'all resources are inline or data URIs');
 const fontSources=[...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m=>m[1]);
 ok(!/@import/i.test(css)&&fontSources.length===4&&fontSources.every(x=>x.startsWith('data:font/woff2;base64,')),'four embedded WOFF2 faces and no external CSS resources');
 ok((css.match(/@font-face/g)||[]).length===4&&[...css.matchAll(/@font-face\{[^}]*font-weight:(\d+)/g)].every(m=>['400','600'].includes(m[1])),'font family uses only regular 400 and semibold 600');
 ok(['IBM Plex Sans','IBM Plex Serif','IBM Plex Mono'].every(name=>css.includes(name))&&d.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes('font-src data:'),'Sans, Serif and Mono are declared and CSP permits only embedded fonts');
 ok(Object.values(JSON.parse(d.getElementById('font-license').textContent)).every(t=>t.includes('SIL OPEN FONT LICENSE')),'embedded fonts include OFL licence text');
 ok(d.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("connect-src 'none'"),'CSP forbids network connections');
 ok(B.requests.length===0,'startup makes no network requests');

 // Command boxes: one per command in content, each copies its exact text, height follows content.
 const commands=contentCommands(G),boxes=[...d.querySelectorAll('.copy-box')];
 ok(JSON.stringify(boxes.map(b=>b.querySelector('pre').textContent).sort())===JSON.stringify([...commands].sort()),`${commands.length} command boxes match the commands in content`);
 let copies=true;
 for(const box of boxes){box.querySelector('.copy-button').click();await new Promise(r=>setTimeout(r,0));copies&&=B.clipboard.at(-1)===box.querySelector('pre').textContent&&box.querySelector('.copy-button').textContent==='Copied';}
 ok(copies,'every Copy button copies its exact command and confirms it');
 ok(!d.querySelector('textarea.helper-code')&&/\.copy-code\{[^}]*max-height:[^}]*\}/.test(css)&&!/\.copy-code\{[^}]*(?:^|[;{])height:/.test(css),'command boxes size to their content up to a scroll limit');
 ok(rows.every(s=>!(s.detail?.cleanup||[]).some(i=>i.command!=null)||d.querySelector(`#step-${s.n} [data-detail="cleanup"] .copy-box.undo`)),'undo commands appear in undo copy boxes');
 ok(rows.every(s=>!s.changes||[...d.querySelectorAll(`#step-${s.n} .tag-changes`)].some(t=>t.textContent===(typeof s.changes==='string'?s.changes:'Changes something'))),'checks that change something carry the Changes tag');
 ok(rows.every(s=>!!s.later===!!d.querySelector(`#step-${s.n} .r[data-v="later"]`)&&(!s.later||d.querySelector(`#step-${s.n} .tag-later`))),'Later is offered only on checks whose content allows it');

 const {language,procedureCount}=languageReport(d,rows);
 ok(language.missingLead.length===0,`all ${procedureCount} procedure items and ${rows.length} checks start with a bold lead-in`);
 ok(language.denseItems.length===0,'no Setup or step item contains multiple instruction sentences without a sub-list');
 ok([...d.querySelectorAll('.substeps')].every(n=>n.tagName==='OL'&&n.type==='a'),'nested procedures use lettered substeps');
 ok(language.procedureOverLength.length===0,'all procedure sentences contain at most 20 words (code spans count as one)');
 ok(language.descriptionOverLength.length===0,'all descriptive sentences contain at most 25 words');
 ok(language.compoundInstructions.length===0,'no common chained imperative verbs remain in a procedure leaf');
 for(const kind of Object.keys(language))for(const issue of language[kind])console.log('LANGUAGE '+kind+' '+JSON.stringify(issue));
 if(get('language-report'))writeFileSync(get('language-report'),JSON.stringify(language,null,2)+'\n');
 if(get('preserve'))ok(createHash('sha256').update(readFileSync(get('preserve'))).digest('hex')===get('preserve-sha256'),'preserved page remains byte-for-byte unchanged');

 // Result controls on every check.
 let controls=true,toggles=true,notes=true;
 for(const id of ids){
  for(const v of['pass','fail','blocked']){mark(B,id,v);const step=d.getElementById('step-'+id);controls&&=step.dataset.r===v&&step.querySelector(`.r[data-v="${v}"]`).getAttribute('aria-pressed')==='true';}
  mark(B,id,'blocked');toggles&&=d.getElementById('step-'+id).dataset.r==='pending';
  const step=d.getElementById('step-'+id);step.querySelector('.note-button').click();notes&&=!step.querySelector('textarea.note').hidden;
 }
 ok(controls,`${ids.length*3} result buttons record the correct result and pressed state`);
 ok(toggles,'clicking a selected result clears it on every check');ok(notes,`${ids.length} Note buttons expose their note fields`);
 const field=(x,k,v)=>{const input=x.d.querySelector(`[data-ph="${k}"]`);input.value=v;input.dispatchEvent(new x.w.Event('input',{bubbles:true}));};
 for(const p of G.placeholders||[])field(B,p.key,p.key==='versions'&&G.versionGate?G.versionGate:'1002-1122');
 d.getElementById('tester').value='Reviewer';d.getElementById('tester').dispatchEvent(new w.Event('input',{bubbles:true}));
 // Later never blocks the verdict: mark every check Works, deferrable ones Later.
 const deferred=rows.filter(s=>s.later).map(s=>String(s.n));
 for(const s of rows)mark(B,s.n,s.later?'later':'pass');
 if(deferred.length){
  ok(!api().verdict().startsWith('no verdict')&&deferred.every(id=>api().verdict().includes(id)),`Later on ${deferred.join(', ')} keeps a verdict and names the deferred checks`);
  ok(deferred.every(id=>d.getElementById('step-'+id).dataset.r==='later'),'Later records its own result state');
 }
 const first=ids[0],second=ids[1]??ids[0];
 mark(B,first,'fail');if(second!==first)mark(B,second,'blocked');
 const ta=d.querySelector(`#step-${first} textarea.note`);ta.value='Observed | detail\nSecond line';ta.dispatchEvent(new w.Event('input',{bubbles:true}));
 d.getElementById('copy').click();await new Promise(r=>setTimeout(r,0));
 const output=d.getElementById('md').value;
 ok(d.getElementById('dlg').open&&output===api().markdown()&&B.clipboard.at(-1)===output,'Copy results opens its dialog and copies the findings');
 ok(output.startsWith('# ')&&output.includes('Verdict: **not green**')&&ids.every(id=>output.split('\n').some(l=>l.startsWith(`| ${id} |`))),'findings contain the verdict and one result row per check');
 ok(output.includes('Observed \\| detail Second line'),'notes in findings are flattened and escaped');
 d.getElementById('dlg-close').click();ok(!d.getElementById('dlg').open,'results dialog closes');

 // Screenshots, thumbnails and lightbox.
 let pictures=true;
 for(const s of rows){
  const node=d.getElementById('step-'+s.n),fig=node.querySelector('.reference-shot');
  pictures&&=s.screenshot?!!fig&&!fig.querySelector('img').alt.trim().startsWith('undefined'):!fig;
  if(s.screenshot){node.querySelector('.image-open').click();pictures&&=d.getElementById('image-dialog').open&&d.getElementById('full-image').src===G.screenshots[s.screenshot].data;d.getElementById('image-close').click();pictures&&=!d.getElementById('image-dialog').open;}
 }
 ok(pictures,'mapped screenshots render and enlarge offline; unmapped checks have no image placeholder');
 const shotIds=rows.filter(s=>s.screenshot).map(s=>String(s.n));
 ok(JSON.stringify([...d.querySelectorAll('.thumbnail')].map(n=>n.closest('.step').dataset.n).sort())===JSON.stringify([...shotIds].sort()),'thumbnails exist for exactly the checks with screenshots');
 ok([...d.querySelectorAll('.thumbnail')].every(n=>!n.closest('.more')&&n.previousElementSibling.matches('.check')),'thumbnails are visible beside Do/Check outside More');
 ok(G.outcomes.every((o,i)=>d.querySelector(`#area-${i} > summary .area-n`).textContent.includes(`${o.steps.filter(s=>s.screenshot).length} with screenshots`)),'every area summary states its screenshot count');
 for(const id of shotIds){
  const thumb=d.querySelector(`#step-${id} .thumbnail`),shot=G.screenshots[rows.find(s=>String(s.n)===id).screenshot];thumb.click();
  ok(d.getElementById('image-dialog').open&&d.getElementById('full-image').src===shot.data&&d.getElementById('image-date').textContent===shot.date&&d.getElementById('image-caption').textContent===shot.caption.replace(/\*\*|`/g,''),`thumbnail ${id} opens full image with caption and date`);
  d.getElementById('image-dialog').dispatchEvent(new w.Event('cancel',{cancelable:true}));
  ok(!d.getElementById('image-dialog').open&&d.activeElement===thumb,`Escape closes reference ${id} and restores focus`);
 }
 if(shotIds.length){d.querySelector('.thumbnail').click();d.getElementById('image-size').click();ok(d.getElementById('image-dialog').classList.contains('actual-size'),'lightbox offers original pixel size');d.getElementById('image-size').click();ok(!d.getElementById('image-dialog').classList.contains('actual-size'),'lightbox returns to fitting the viewport');d.getElementById('image-dialog').dispatchEvent(new w.MouseEvent('click',{clientX:-10,clientY:-10,bubbles:true}));ok(!d.getElementById('image-dialog').open,'outside click closes the lightbox');}

 // Contrast: body, secondary text, links, chips, tags, warnings and diagram strokes in both themes.
 const pairs=[['text','bg'],['muted','bg'],['accent','bg'],['text','surface'],['muted','surface'],['risk-high','risk-high-bg'],['risk-med','risk-med-bg'],['risk-low','risk-low-bg'],['text','soft'],['accent','soft'],['risk-high','bg'],['risk-med','bg']];
 for(const [name,selector]of [['Light',/:root\{([^}]+)\}/],['Dark',/:root\[data-theme="dark"\]\{([^}]+)\}/]]){
  const tokens=Object.fromEntries([...css.match(selector)[1].matchAll(/--([\w-]+):(#[0-9a-f]{3,6})(?:;|$)/g)].map(m=>[m[1],m[2].length===4?'#'+[...m[2].slice(1)].map(c=>c+c).join(''):m[2]]));
  const ratios=pairs.map(([a,b])=>contrast(tokens[a],tokens[b]));
  ok(ratios.every(n=>n>=4.5),`${name} text, muted text, links, chips, tags and diagram contrast >= 4.5:1 (minimum ${Math.min(...ratios).toFixed(2)}:1)`);
 }
 // Theme modes persist across reload, and denied storage never blocks controls.
 for(const mode of ['system','light','dark']){
  const select=d.getElementById('theme');select.value=mode;select.dispatchEvent(new w.Event('change'));
  ok(d.documentElement.dataset.theme===mode&&w.localStorage.getItem(prefix+':theme')===mode,`theme ${mode} sets and persists`);
  const reload=await boot(html,{[prefix+':theme']:mode});
  ok(reload.d.documentElement.dataset.theme===mode&&reload.d.getElementById('theme').value===mode,`theme ${mode} restores on load`);reload.w.close();
 }
 // Disclosure animation and reduced motion.
 finishAnimations(B);d.getElementById('collapse').click();finishAnimations(B);
 for(const selector of ['.area > summary','.more > summary','[id^="setup-"] > summary']){
  const summary=d.querySelector(selector);if(!summary)continue;
  const details=summary.parentElement,before=B.animations.length;summary.click();
  const a=B.animations.at(-1);
  ok(details.open&&B.animations.length>before&&a.options.duration===225&&'height' in a.frames[0]&&'opacity' in a.frames[0],`${selector} opens with height and opacity animation`);finishAnimations(B);
  summary.click();ok(details.open&&B.animations.at(-1).frames.at(-1).height==='0px',`${selector} stays open during collapse animation`);finishAnimations(B);ok(!details.open,`${selector} closes after animation`);
 }
 d.querySelector('.index-row').click();ok(B.scrollOptions.at(-1).behavior==='smooth'&&d.querySelector('.area').classList.contains('landed'),'index uses smooth scrolling and a brief landing highlight');finishAnimations(B);
 const reduced=await boot(html,{},false,true);reduced.d.querySelector('.index-row').click();
 ok(reduced.d.querySelector('.area').open&&reduced.animations.length===0&&reduced.scrollOptions.at(-1).behavior==='instant'&&!reduced.d.querySelector('.landed'),'reduced motion opens instantly without animation or highlight');
 reduced.d.getElementById('expand').click();reduced.d.getElementById('collapse').click();ok(reduced.animations.length===0&&[...reduced.d.querySelectorAll('details')].every(n=>!n.open),'reduced motion skips Expand all and Collapse all animations');reduced.w.close();

 // Example isolation: the other example and the shared files carry no names, hosts or IDs from this page.
 if(get('example')){
  const exampleHtml=readFileSync(get('example'),'utf8'),example=await boot(exampleHtml);
  ok(!example.errors.length&&example.d.querySelectorAll('.step').length===rowsOf(data(example)).length,'second example renders independently without script errors');
  const own=[G.product,G.baseUrl,G.baseUrl&&new URL(G.baseUrl).hostname,...(opts['forbid-host']||[]),...(layer.isolationStrings||[])].filter(s=>s&&!['https://example.invalid','example.invalid'].includes(s));
  ok(own.every(s=>!exampleHtml.includes(s)),'example has no names, hosts or record IDs from this page');
  const files=[path.join(PATTERN_DIR,'template.html'),path.join(FLAVOUR_DIR,'SKILL.md'),path.join(FLAVOUR_DIR,'foundation/flavour.css'),path.join(FLAVOUR_DIR,'foundation/flavour.js'),...(layer.isolationFiles||[])];
  for(const f of files)ok(own.every(s=>!readFileSync(f,'utf8').includes(s)),`${path.relative(path.dirname(FLAVOUR_DIR),f)} has no names, hosts or record IDs from this page`);
  example.w.close();
 }
 // Restore saved results, but begin a fresh visit with every section closed.
 d.querySelector('.index-row').click();d.querySelector('.more')&&(d.querySelector('.more').open=true);
 await new Promise(r=>setTimeout(r,5));
 const store=Object.fromEntries(Array.from({length:w.localStorage.length},(_,i)=>{const k=w.localStorage.key(i);return[k,w.localStorage.getItem(k)];}));
 const restored=await boot(html,store),denied=await boot(html,{},true);
 ok([...restored.d.querySelectorAll('details')].every(x=>!x.open),'all areas also start closed with saved state');
 ok(restored.d.getElementById('step-'+first).dataset.r==='fail'&&restored.d.querySelector(`#step-${first} textarea.note`).value.includes('Observed'),'results and notes survive reload');
 ok((G.placeholders||[]).every(p=>restored.d.querySelector(`[data-ph="${p.key}"]`).value===d.querySelector(`[data-ph="${p.key}"]`).value),'walk input values survive reload');
 for(const mode of ['system','light','dark']){const select=denied.d.getElementById('theme');select.value=mode;select.dispatchEvent(new denied.w.Event('change'));}
 mark(denied,first,'pass');denied.d.getElementById('copy').click();
 ok(!denied.errors.length&&denied.d.getElementById('step-'+first).dataset.r==='pass'&&denied.d.getElementById('dlg').open,'denied local storage still allows marking and copying');
 d.activeElement?.blur();d.getElementById('collapse').click();finishAnimations(B);d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'j',bubbles:true}));
 ok(d.activeElement.matches('.step')&&d.activeElement.closest('details.area').open,'keyboard navigation opens a folded check');
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'1',bubbles:true}));ok(d.activeElement.dataset.r==='pass','keyboard marking works');
 ok([B,restored,denied].every(x=>!x.errors.length&&!x.requests.length),'no late script errors or network requests');
 for(const x of[restored,denied])x.dom.window.close();
 return {B,G,rows,ids,html,css,prefix};
}

export function summarize(ctx){
 console.log(`\n${ctx.count-ctx.failures.length}/${ctx.count} checks passed; ${ctx.failures.length} failures; ${ctx.warnings.length} warnings. Layout requires browser inspection.`);
 if(ctx.failures.length)process.exitCode=1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const {file,opts,get}=parseArgs(process.argv.slice(2));
 if(!file)throw Error('Usage: '+USAGE);
 const ctx=createContext(get);
 const result=await verifyChecklist(file,get,opts,ctx);
 result.B.dom.window.close();
 summarize(ctx);
}
