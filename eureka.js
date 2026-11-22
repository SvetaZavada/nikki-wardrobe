/* Eureka Sets companion for Nikki Wardrobe V2.
   Collection state is local to this browser; no personal collection uploaded. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const COLOR_NAMES={1:'White',2:'Blue',3:'Green',4:'Purple',5:'Pink',6:'Yellow',7:'Red',8:'Iridescent'};
const COLOR_CLASSES={1:'white',2:'blue',3:'green',4:'purple',5:'pink',6:'yellow',7:'red',8:'iridescent'};
const PARTS=['head','hands','feet'],PART_LABELS={head:'Head',hands:'Hands',feet:'Feet'};
const OPTIONS=[['all','All'],['complete','Complete'],['partial','In progress'],['missing','Not collected']];
const LABEL_COLORS={Warm:'blue',Summer:'pink',Home:'green',Formal:'gold',Simple:'coral',Fantasy:'mint',Intellectual:'orange',Adventure:'coral',Romance:'pink',Retro:'orange',Fashion:'green',Uniform:'blue',Fairy:'mint',Ballroom:'orange',Royal:'coral',Linlang:'gold',Pastoral:'green',Playful:'blue',Trendy:'orange',Cute:'pink',Light:'gold','More Light':'gold',Divine:'orange',Forest:'mint',Spirited:'blue',Classical:'coral',Terra:'gold',Aesthetic:'blue',Whimsy:'pink',Glow:'green'};
const STYLE_CLASSES={Elegant:'style-elegant',Sweet:'style-sweet',Cool:'style-cool',Fresh:'style-fresh',Sexy:'style-sexy'};
const CACHE_KEY='nikki-v2-eureka-progress-v1';
let local;
try {const obj=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}');local={colors:obj.colors||{},copies:obj.copies||{}}}
catch{local={colors:{},copies:{}}}
let all=[],names={},filters={},sets=[],active=false,ready=false;
const setName=s=>s?.replace(/:\s*(Head|Hands|Feet)$/i,'').trim()||'Unknown Set';
const isColorOwned=id=>!!local.colors[id];
const copiesFor=id=>Math.max(0,Number(local.copies[id])||0);
const colorCount=p=>(p.colors||[]).filter(c=>isColorOwned(c.id)).length;
const totalColorCount=p=>(p.colors||[]).length;
const hasPart=p=>!!p&&(colorCount(p)>0||copiesFor(p.id)>0);
const availableParts=set=>PARTS.map(part=>set.parts[part]).filter(Boolean);
const partsToCheck=set=>PARTS.filter(x=>document.querySelector('#eurekaPart')?.value==='all'||document.querySelector('#eurekaPart')?.value===x).map(x=>set.parts[x]).filter(Boolean);
const stats=s=>{
  const parts=availableParts(s),have=parts.filter(hasPart).length,total=parts.length;
  const colors=parts.reduce((a,p)=>a+colorCount(p),0);
  const totalColors=parts.reduce((a,p)=>a+totalColorCount(p),0);
  const spare=parts.reduce((a,p)=>a+copiesFor(p.id),0);
  return {parts,have,total,colors,totalColors,spare};
};
function save(){try{localStorage.setItem(CACHE_KEY,JSON.stringify(local))}catch{}}
function patchStyles(){let el=$('eurekaFilterControls');if(el)return;
  const section=document.createElement('div');section.id='eurekaFilterControls';section.hidden=true;
  section.innerHTML='<details class="filter" open><summary>Body part</summary><div class="eureka-filter-block"><select id="eurekaPart" aria-label="Filter by body part"><option value="all">All parts</option><option value="head">Head</option><option value="hands">Hands</option><option value="feet">Feet</option></select></div></details>'
  +'<details class="filter" open><summary>Collection progress</summary><div class="eureka-filter-block"><select id="eurekaProgress" aria-label="Collection status">'+OPTIONS.map(([id,label])=>'<option value="'+id+'">'+label+'</option>').join('')+'</select></div></details>'
  +'<details class="filter" open><summary>Color collection</summary><div class="eureka-filter-block"><select id="eurekaColors" aria-label="Color progress"><option value="all">All colors</option><option value="incomplete">Colors missing</option><option value="complete">All colors collected</option><option value="none">No colors collected</option></select></div></details>'
  +'<details class="filter" open><summary>Uncolored copies</summary><div class="eureka-filter-block"><select id="eurekaFarm" aria-label="Uncolored copies"><option value="all">Any quantity</option><option value="zero">0 copies — farm</option><option value="low">0–1 copies</option><option value="stocked">2+ copies</option></select></div></details>'
  +'<div class="eureka-filter-block eureka-import-wrap"><button type="button" class="eureka-import" id="eurekaImportCsv">↧ Import Eureka CSV</button><input type="file" id="eurekaCsvFile" accept=".csv,text/csv" hidden><p class="eureka-import-hint">Import your 5★ sheet as CSV. Saved only in this browser.</p></div>';
  $('reset').before(section);
  section.querySelectorAll('select').forEach(el=>el.onchange=draw);
  $('eurekaImportCsv').onclick=()=>$('eurekaCsvFile').click();
  $('eurekaCsvFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{const data=await file.text();const result=importCsv(data);$('notice').textContent='Eureka imported: '+result.parts+' parts, '+result.colors+' colors, '+result.copies+' uncolored copies.';draw()}catch(err){$('notice').textContent='Eureka CSV: '+err.message}};
  const main=$('grid').parentElement;
  const dashboard=document.createElement('div');dashboard.id='eurekaView';dashboard.hidden=true;dashboard.innerHTML='<div id="eurekaStats" class="eureka-stats"></div><div id="eurekaSetGrid" class="eureka-set-grid"></div><div id="eurekaNoResults" class="eureka-no-results" hidden>No sets match the filters.</div>';
  $('grid').before(dashboard);
  ready=true;
}
function buildSets(){
  const map=new Map();
  for(const p of all){
    if(p.kind!=='eureka')continue;
    const id=String(p.suitId||p.id);
    if(!map.has(id))map.set(id,{id,name:setName(names['eureka_'+p.id]||''),style:p.style,stars:p.stars,labels:[],parts:{}});
    const s=map.get(id);
    if(s.name==='Unknown Set'){s.name=setName(names['eureka_'+p.id]||'')}
    if(p.type) s.parts[p.type]=p;
    if(!s.style)s.style=p.style;
    if(p.stars>s.stars)s.stars=p.stars;
    for(const label of p.labels||[])if(!s.labels.includes(label))s.labels.push(label);
  }
  sets=[...map.values()].sort((a,b)=>b.stars-a.stars||a.name.localeCompare(b.name));
}
const sourceImage=p=>{
 const color=p.colors?.[0];
 if(!color)return null;
 return 'https://ik.imagekit.io/gongeous/images/eurekas/'+color.id+'.png';
};
function imageMarkup(p){
  const colors=p.colors||[],src=sourceImage(p);
  if(!src)return '<span class="eureka-image-placeholder">✧</span>';
  const paths=colors.slice(0,3).map(c=>'https://ik.imagekit.io/gongeous/images/eurekas/'+c.id+'.png');
  const suffix='/images/eurekas/'+colors[0].id+'.png';
  paths.push('https://cdn.gongeo.us'+suffix,'https://gongeo.us'+suffix);
  return '<img loading="lazy" decoding="async" alt="" src="'+esc(src)+'" data-sources="'+esc(JSON.stringify(paths))+'" data-image-index="0" onerror="window.nikkiImageFallback(this)"><span class="eureka-image-placeholder" hidden>✧</span>';
}
const getSetStatus=s=>{const subset=partsToCheck(s);const has=subset.filter(hasPart).length;return has===0?'missing':has===subset.length?'complete':'partial'};
function isMatch(set){
  const subset=partsToCheck(set);
  if(!subset.length)return false;
  const search=$('search').value.trim().toLowerCase();
  if(search && !set.name.toLowerCase().includes(search) && !subset.some(p=>(names['eureka_'+p.id]||'').toLowerCase().includes(search)))return false;
  if(filters.rarities.size&&!filters.rarities.has(set.stars))return false;
  if(filters.styles.size&&!filters.styles.has(set.style))return false;
  if(filters.labels.size&&![...filters.labels].every(l=>set.labels.includes(l)))return false;
  const status=$('eurekaProgress').value;
  if(status!=='all'&&getSetStatus(set)!==status)return false;
  const colorFilter=$('eurekaColors').value;
  if(colorFilter==='incomplete'&&!subset.some(p=>colorCount(p)<totalColorCount(p)))return false;
  if(colorFilter==='complete'&&!subset.every(p=>colorCount(p)===totalColorCount(p)))return false;
  if(colorFilter==='none'&&!subset.every(p=>colorCount(p)===0))return false;
  const farm=$('eurekaFarm').value;
  if(farm==='zero'&&!subset.some(p=>copiesFor(p.id)===0))return false;
  if(farm==='low'&&!subset.some(p=>copiesFor(p.id)<=1))return false;
  if(farm==='stocked'&&!subset.every(p=>copiesFor(p.id)>=2))return false;
  return true;
}
function colorButton(p,c){
  const own=isColorOwned(c.id),name=COLOR_NAMES[c.type]||'Color';
  return '<button type="button" class="eureka-color '+(COLOR_CLASSES[c.type]||'white')+(own?' collected':'')+'" data-color-id="'+c.id+'" title="'+esc(name)+(own?' · Collected':' · Missing')+'" aria-label="'+esc(name)+' '+(own?'collected':'missing')+'" aria-pressed="'+own+'">'+(own?'✓':'')+'</button>';
}
function partCard(p,part,chosen){
  if(!p)return '<div class="eureka-part eureka-part-unavailable"><div class="eureka-part-title">'+PART_LABELS[part]+'</div><span>Not in catalog</span></div>';
  const count=colorCount(p),total=totalColorCount(p),copies=copiesFor(p.id),have=hasPart(p);
  return '<div class="eureka-part '+(have?'collected':'missing')+'" data-part="'+part+'"><div class="eureka-part-heading"><span class="eureka-part-title">'+PART_LABELS[part]+'</span><span class="eureka-part-owned">'+(have?'✓ Owned':'○ Missing')+'</span></div>'
   +'<div class="eureka-art">'+imageMarkup(p)+'</div>'
   +'<div class="eureka-part-progress"><span>Colors</span><b>'+count+' / '+total+'</b></div>'
   +'<div class="eureka-colors">'+(p.colors||[]).map(c=>colorButton(p,c)).join('')+'</div>'
   +'<div class="eureka-part-stock"><span>Uncolored copies</span><div class="eureka-stepper"><button type="button" data-step="-1" data-id="'+p.id+'" aria-label="Decrease uncolored copies">−</button><strong>'+copies+'</strong><button type="button" data-step="1" data-id="'+p.id+'" aria-label="Increase uncolored copies">+</button></div></div></div>';
}
function setCard(s){
  const t=stats(s);
  const badges=(s.labels||[]).slice(0,2).map(l=>'<span class="eureka-tag color-'+(LABEL_COLORS[l]||'gold')+'">'+esc(l)+'</span>').join('');
  const partSelected=$('eurekaPart').value;
  return '<article class="eureka-set-card"><div class="eureka-set-header"><div class="eureka-set-heading"><h3>'+esc(s.name)+'</h3><div class="eureka-set-tags"><span class="eureka-rarity">'+('✦'.repeat(Math.min(5,s.stars)))+'</span>'+(s.style?'<span class="eureka-style style-chip '+(STYLE_CLASSES[s.style]||'')+'">'+esc(s.style)+'</span>':'')+badges+'</div></div><div class="eureka-set-progress">'+t.have+' / '+t.total+' <small>parts</small></div></div>'
   +'<div class="eureka-parts">'+PARTS.map(part=>partSelected==='all'||partSelected===part?partCard(s.parts[part],part):'').join('')+'</div>'
   +'<div class="eureka-set-footer"><span>🎨 '+t.colors+' / '+t.totalColors+' colors</span><span>✧ '+t.spare+' uncolored copies</span></div></article>';
}
function makeSummary(){
 const statsAll=sets.map(stats);const parts=statsAll.reduce((a,s)=>a+s.total,0),collected=statsAll.reduce((a,s)=>a+s.have,0),colors=statsAll.reduce((a,s)=>a+s.colors,0),total=statsAll.reduce((a,s)=>a+s.totalColors,0),complete=statsAll.filter(s=>s.total>0&&s.have===s.total).length,zero=sets.reduce((a,s)=>a+availableParts(s).filter(p=>copiesFor(p.id)===0).length,0);
 return '<div class="eureka-summary-item"><strong>'+collected+' <span>/ '+parts+'</span></strong><small>Unique parts</small></div>'
   +'<div class="eureka-summary-item"><strong>'+complete+' <span>/ '+sets.length+'</span></strong><small>Complete sets</small></div>'
   +'<div class="eureka-summary-item"><strong>'+colors+' <span>/ '+total+'</span></strong><small>Colors collected</small></div>'
   +'<div class="eureka-summary-item"><strong>'+zero+'</strong><small>No uncolored copies</small></div>';
}
function draw(){
 if(!active||!ready)return;
 const list=sets.filter(isMatch);
 const sort=$('sort').value;
 if(sort==='rarity')list.sort((a,b)=>b.stars-a.stars||a.name.localeCompare(b.name));
 else if(sort==='id')list.sort((a,b)=>Number(a.id)-Number(b.id));
 else list.sort((a,b)=>Number(b.id)-Number(a.id));
 $('heading').firstChild.textContent='Eureka Sets ';
 $('count').textContent=list.length+' sets';
 $('eurekaStats').innerHTML=makeSummary();
 $('eurekaSetGrid').innerHTML=list.map(setCard).join('');
 $('eurekaNoResults').textContent='No sets match these filters. Reset filters to see all '+sets.length+' catalog sets, including uncollected Eureka.';
 $('eurekaNoResults').hidden=list.length>0;
}
function activate(on){
 patchStyles();active=on;$('eurekaFilterControls').hidden=!on;$('eurekaView').hidden=!on;
 const ownership=$('search').nextElementSibling; // Existing ownership group immediately after search
 if(ownership?.classList.contains('filter'))ownership.hidden=on;
 if(on)draw();
}
function setCatalog(entries,translations,sharedFilters){
 all=entries;names=translations;filters=sharedFilters;buildSets();if(active)draw();
}
function reset(){
 if(!ready)return;
 ['eurekaPart','eurekaProgress','eurekaColors','eurekaFarm'].forEach(id=>$(id).value='all');draw();
}
function parseCsv(text){
 const rows=[],row=[];let cell='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const ch=text[i];
  if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"')quoted=false;else cell+=ch}
  else if(ch==='"')quoted=true;
  else if(ch===','){row.push(cell);cell=''}
  else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push([...row]);row.length=0;cell=''}
  else cell+=ch;
 }
 if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}
 return rows;
}
function importCsv(text){
 if(!sets.length)throw Error('Load catalog first.');
 const rows=parseCsv(text);
 const headers=(rows[0]||[]).map(v=>String(v).toLowerCase().trim());
 if(!headers.includes('iridescent')||!headers.includes('zero quantity')||!headers.includes('green'))throw Error('Expected your Eureka sheet columns (Iridescent, Green, Zero Quantity).');
 const colMap={iridescent:8,green:3,pink:5,red:7,yellow:6,blue:2,white:1,purple:4};
 const grouped=new Map(),nameIndex=new Map(sets.map(s=>[s.name.toLowerCase(),s]));
 let name='',partIndex=0,matched=0,colors=0,copies=0;
 const newColors={...local.colors},newCopies={...local.copies};
 for(const row of rows.slice(1)){
  if(!row.some(x=>String(x??'').trim()))continue;
  if(row[0]&&row[0].trim()){name=row[0].trim().toLowerCase();partIndex=0}
  const set=nameIndex.get(name),part=PARTS[partIndex%3];partIndex++;
  const target=set?.parts?.[part];if(!target)continue;
  matched++;
  const zeroIndex=headers.indexOf('zero quantity');
  const qty=Number(row[zeroIndex]);if(Number.isFinite(qty)&&qty>=0){newCopies[target.id]=Math.floor(qty);copies+=Math.floor(qty)}
  for(const [key,type] of Object.entries(colMap)){
    const idx=headers.indexOf(key),value=(row[idx]??'').toString().trim();
    const choice=target.colors?.find(c=>c.type===type);if(!choice)continue;
    if(value==='1'){newColors[choice.id]=true;colors++}
    else if(value===''||value==='-')delete newColors[choice.id];
  }
 }
 if(!matched)throw Error('No matching set names. Export the 5★ tab as CSV.');
 local.colors=newColors;local.copies=newCopies;save();return {parts:matched,colors,copies};
}
function importIds(ids){
 if(!Array.isArray(ids))return 0;
 const available=new Set(all.filter(i=>i.kind==='eureka').flatMap(i=>(i.colors||[]).map(c=>c.id)));
 let n=0;for(const id of ids){if(available.has(id)){local.colors[id]=true;n++}}
 save();if(active)draw();return n;
}
window.NikkiEureka={activate,setCatalog,draw,reset,importIds};
})();
