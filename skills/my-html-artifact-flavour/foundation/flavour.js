/* my-html-artifact-flavour behaviours: theme switch, disclosures, copy boxes and procedures.
   Exposes window.Flavour. Storage is optional: every call survives denied localStorage. */
(function(){
'use strict';
var F=window.Flavour={};
var meta=document.querySelector('meta[name="flavour-storage"]');
F.prefix=meta&&meta.content||'html-flavour';
F.store={
 get:function(k){try{return localStorage.getItem(F.prefix+':'+k);}catch(e){return null;}},
 set:function(k,v){try{localStorage.setItem(F.prefix+':'+k,v);}catch(e){}}
};
F.esc=function(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');};
/* Inline Markdown subset: **bold** and `code`; everything else is escaped. Paths in code may wrap after a slash. */
F.md=function(t){return F.esc(t).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,function(m,c){return '<code>'+c.replace(/\//g,'/<wbr>')+'</code>';});};
F.el=function(tag,attrs,html){var n=document.createElement(tag);Object.keys(attrs||{}).forEach(function(k){n.setAttribute(k,attrs[k]);});if(html!=null)n.innerHTML=html;return n;};

/* Theme: System follows the OS; Light and Dark override it. The head script restores it before paint. */
F.bindTheme=function(select){
 select.value=document.documentElement.dataset.theme||'system';
 select.addEventListener('change',function(){document.documentElement.dataset.theme=select.value;F.store.set('theme',select.value);});
};

/* Disclosures: one 225 ms height and opacity animation; reduced motion opens and closes instantly. */
F.motion=window.matchMedia('(prefers-reduced-motion: reduce)');
F.onOpenChange=function(){};
var transitions=new Map();
F.bindDetails=function(node,keepOpen){
 if(!keepOpen)node.open=false;
 node.querySelector('summary').addEventListener('click',function(e){e.preventDefault();var active=transitions.get(node);F.setOpen(node,active?!active.open:!node.open);});
};
F.details=function(id,title,cls){var n=F.el('details',{id:id,class:cls||'nested','data-persist':''});n.appendChild(F.el('summary',{},title));F.bindDetails(n);return n;};
F.setOpen=function(node,value,complete){
 var active=transitions.get(node),body=node.querySelector(':scope > :not(summary)');
 if(!active&&node.open===value){if(complete)complete();return;}
 var height=body&&node.open?body.getBoundingClientRect().height:0;
 var opacity=body&&node.open?getComputedStyle(body).opacity:0;
 if(active){active.animation.cancel();transitions.delete(node);}
 F.onOpenChange(node.id,value);
 if(!body||F.motion.matches||!body.animate){node.open=value;if(body)body.style.overflow='';if(complete)complete();return;}
 node.open=true;body.style.overflow='hidden';
 var animation=body.animate([{height:height+'px',opacity:opacity},{height:(value?body.scrollHeight:0)+'px',opacity:value?1:0}],{duration:225,easing:'ease-out'});
 transitions.set(node,{animation:animation,open:value});
 animation.onfinish=function(){node.open=value;body.style.overflow='';transitions.delete(node);if(complete)complete();};
};
if(F.motion.addEventListener)F.motion.addEventListener('change',function(){if(F.motion.matches)transitions.forEach(function(active,node){F.setOpen(node,active.open);});});
F.reveal=function(node){var parents=[],parent=node.parentElement;while(parent){if(parent.tagName==='DETAILS')parents.unshift(parent);parent=parent.parentElement;}parents.forEach(function(p){F.setOpen(p,true);});};
/* Jump: open a section, scroll to it smoothly, focus its summary and highlight it briefly. */
F.jump=function(id){var target=document.getElementById(id);F.setOpen(target,true);target.scrollIntoView({block:'start',behavior:F.motion.matches?'instant':'smooth'});target.querySelector('summary').focus({preventScroll:true});if(!F.motion.matches){target.classList.add('landed');setTimeout(function(){target.classList.remove('landed');},900);}};
/* Expand or collapse every data-persist disclosure; animate only the visible roots. */
F.setAll=function(value){
 transitions.forEach(function(active){active.animation.finish();});
 var all=Array.from(document.querySelectorAll('details[data-persist]'));
 var roots=all.filter(function(d){var parent=d.parentElement.closest('details');return value?!d.open&&!all.some(function(p){return p!==d&&!p.open&&p.contains(d);}):!parent;});
 roots.forEach(function(root){
  var children=Array.from(root.querySelectorAll('details[data-persist]'));
  function prepare(){children.forEach(function(d){d.open=value;F.onOpenChange(d.id,value);});}
  if(value)prepare();
  F.setOpen(root,value,value?null:prepare);
 });
};

/* Copy box: the exact text in a pre block, a Copy button, and a status for screen readers. */
F.copyText=function(text,button,node,status){
 function done(ok){button.textContent=ok?'Copied':'Select and copy';button.classList.toggle('copied',ok);if(status)status.textContent=ok?'Copied.':'Select the text and copy it.';clearTimeout(button._reset);button._reset=setTimeout(function(){button.textContent='Copy';button.classList.remove('copied');},1600);}
 function fallback(){var ok=false;try{var range=document.createRange();range.selectNodeContents(node);var selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);ok=document.execCommand('copy');}catch(e){}done(ok);}
 if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(text).then(function(){done(true);},fallback);else fallback();
};
F.copyBox=function(text,label,kind){
 var box=F.el('div',{class:'copy-box'+(kind?' '+kind:'')}),head=F.el('div',{class:'copy-head'});
 head.appendChild(F.el('span',{class:'copy-label'},F.esc(label||'Command')));
 var status=F.el('span',{class:'copy-status',role:'status'});
 var button=F.el('button',{type:'button',class:'copy-button','aria-label':'Copy '+(label||'command').toLowerCase()},'Copy');
 var pre=F.el('pre',{class:'copy-code',tabindex:'0'}),code=document.createElement('code');code.textContent=text;pre.appendChild(code);
 button.addEventListener('click',function(){F.copyText(text,button,pre,status);});
 head.appendChild(status);head.appendChild(button);box.appendChild(head);box.appendChild(pre);return box;
};

/* Procedure: numbered items with a bold lead-in; children are lettered. An item may carry a command box. */
F.procedure=function(items,nested,options){
 options=options||{};
 var list=F.el('ol',{class:'procedure-list'+(nested?' substeps':''),type:nested?'a':'1'});
 items.forEach(function(item){
  var li=F.el('li',{class:'procedure-item'});
  li.appendChild(F.el('strong',{class:'lead'},F.esc(item.lead)));
  if(item.text)li.appendChild(F.el('span',{class:'instruction'},' '+F.md(item.text)));
  if(item.command!=null)li.appendChild(F.copyBox(item.command,item.commandLabel||options.commandLabel||'Command',options.commandKind||''));
  if(item.steps&&item.steps.length)li.appendChild(F.procedure(item.steps,true,options));
  list.appendChild(li);
 });
 return list;
};

/* Hand-written pages (page.py): bind the theme switch, disclosures, Expand/Collapse and copy boxes. */
F.enhance=function(root){
 root=root||document;
 var theme=root.querySelector('#theme');if(theme)F.bindTheme(theme);
 root.querySelectorAll('details[data-persist]').forEach(function(d){F.bindDetails(d,d.hasAttribute('data-open'));});
 var expand=root.querySelector('#expand'),collapse=root.querySelector('#collapse');
 if(expand)expand.addEventListener('click',function(){F.setAll(true);});
 if(collapse)collapse.addEventListener('click',function(){F.setAll(false);});
 root.querySelectorAll('pre[data-copy]').forEach(function(pre){pre.replaceWith(F.copyBox(pre.textContent.replace(/^\n|\n$/g,''),pre.getAttribute('data-copy')||'Command',pre.getAttribute('data-kind')||''));});
};
})();
