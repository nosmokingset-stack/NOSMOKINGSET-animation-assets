/* NSM geometry: hydrate existing path nodes; never insert a second SVG DOM. */
(() => {
 'use strict';
 if(window.NSMGeometryLoader)return;
 const roots=[...document.querySelectorAll('svg[data-nsm-geometry]')],cache=new Map(),jobs=new Map();
 const SVG='http://www.w3.org/2000/svg';
 function selected(svg){const scene=svg.closest('[data-scene]');return !scene||!scene.hidden&&scene.getAttribute('aria-hidden')!=='true';}
 function near(svg){const r=svg.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>=-700&&r.top<=(window.innerHeight||0)+700;}
 function request(svg,reload=false){
  const url=svg.getAttribute('data-nsm-geometry');
  if(cache.has(url))return cache.get(url);
  const promise=fetch(url,{mode:'cors',credentials:'omit',cache:reload?'reload':'force-cache'})
   .then(response=>{if(!response.ok)throw new Error('HTTP '+response.status);const type=(response.headers.get('Content-Type')||'').split(';')[0];if(type!=='image/svg+xml')throw new Error('Unexpected SVG MIME '+type);return response.text();})
   .then(async text=>{
    const expected=svg.getAttribute('data-nsm-geometry-sha256');
    if(expected&&window.crypto?.subtle){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));const hex=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');if(hex!==expected)throw new Error('SVG integrity mismatch');}
    if(/<!DOCTYPE|<!ENTITY|<script\b/i.test(text))throw new Error('Unexpected active SVG content');
    const xml=new DOMParser().parseFromString(text,'image/svg+xml');
    if(xml.querySelector('parsererror')||xml.documentElement.namespaceURI!==SVG||xml.documentElement.localName!=='svg')throw new Error('Invalid SVG document');
    if(xml.documentElement.getAttribute('viewBox')!==svg.getAttribute('viewBox'))throw new Error('SVG viewBox mismatch');
    const paths=[...xml.getElementsByTagNameNS(SVG,'path')];
    if(paths.length!==Number(svg.getAttribute('data-nsm-geometry-count')))throw new Error('SVG path count mismatch');
    return paths.map(path=>path.getAttribute('d'));
   });
  cache.set(url,promise);promise.catch(()=>{if(cache.get(url)===promise)cache.delete(url);});return promise;
 }
 function ensure(svg,reset=false){
  if(svg.getAttribute('data-nsm-geometry-ready')==='1'||!selected(svg)||!near(svg))return;
  let job=jobs.get(svg);if(!job){job={pending:false,attempts:0,timer:0};jobs.set(svg,job);}
  if(job.pending||job.timer)return;if(reset)job.attempts=0;if(job.attempts>=3)return;
  job.pending=true;job.attempts++;svg.setAttribute('aria-busy','true');
  request(svg,job.attempts>1).then(values=>{
   const paths=[...svg.getElementsByTagNameNS(SVG,'path')];
   if(paths.length!==values.length)throw new Error('Target SVG DOM changed before hydration');
   // Validate the entire mapping before mutating any node. Identity/listeners stay intact.
   values.forEach((value,i)=>{if(value!==null&&typeof value!=='string')throw new Error('Invalid path '+i);});
   values.forEach((value,i)=>{if(value!==null)paths[i].setAttribute('d',value);});
   svg.setAttribute('data-nsm-geometry-ready','1');svg.removeAttribute('data-nsm-geometry-error');svg.removeAttribute('aria-busy');
   svg.dispatchEvent(new CustomEvent('nsm:geometryready',{bubbles:true}));
  }).catch(error=>{
   svg.setAttribute('data-nsm-geometry-error','load');svg.removeAttribute('aria-busy');
   console.warn('[NSM geometry] '+(svg.getAttribute('data-nsm-geometry-name')||'SVG')+': '+error.message);
   if(job.attempts<3)job.timer=setTimeout(()=>{job.timer=0;ensure(svg);},job.attempts*1000);
  }).finally(()=>{job.pending=false;});
 }
 function scan(reset=false){if(document.hidden)return;roots.forEach(svg=>ensure(svg,reset));}
 let observer;
 if('IntersectionObserver'in window){observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)ensure(entry.target);}),{rootMargin:'700px 0px',threshold:0});roots.forEach(svg=>observer.observe(svg));}
 else{let frame=0;window.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;scan();});},{passive:true});}
 document.getElementById('program-story')?.addEventListener('nsm:storychange',()=>scan(true));
 window.addEventListener('online',()=>scan(true));window.addEventListener('pageshow',()=>scan(true));window.addEventListener('resize',()=>scan());
 document.addEventListener('visibilitychange',()=>scan(true));
 window.NSMGeometryLoader={scan:()=>scan(true)};scan();
})();
