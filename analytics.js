/* Competition coverage analytics — counts are factual catalog/owned data, NOT styling scores. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const STYLES=['Elegant','Fresh','Sweet','Sexy','Cool'];
const RARITIES=[5,4,3,2];
const SLOTS=[['hair','Hair'],['dresses','Dresses'],['outerwear','Outerwear'],['tops','Tops'],['bottoms','Bottoms'],['socks','Socks'],['shoes','Shoes'],['accessories','Accessories']];
const ACCESSORY=new Set(['hairAccessories','headwear','earrings','neckwear','bracelets','chokers','gloves','faceDecorations','chestAccessories','pendants','backpieces','rings','armDecorations','handhelds','bodyPaint']);
let data=[],ownedIds=new Set(),labels=[],active=false;
let style='Sweet',rarity='5',mode='items',order='missing',selectedLabel=null,slot='all';
function owned(i){return ownedIds.has(i.id)}
function valid(){return data.filter(i=>(mode==='outfits'?i.kind==='outfit':i.kind==='item')&&(rarity==='all'||i.stars===Number(rarity)))}
function withStyle(arr,s){return arr.filter(i=>i.style===s)}
function withLabel(arr,l){return arr.filter(i=>i.labels?.includes(l))}
function slotName(i){if(ACCESSORY.has(i.type))return 'accessories';return i.type}
function summaryRows(){
 const base=valid(),byStyle=withStyle(base,style);
 return labels.map(label=>{
  const entries=withLabel(byStyle,label),mine=entries.filter(owned);
  const can=entries.length,have=mine.length;
  return {label,can,have,missing:Math.max(0,can-have),coverage:can?have/can:0};
 }).filter(r=>r.can>0);
}
function ensure(){
 if($('analysisPanel'))return;
 const section=document.createElement('section');section.id='analysisPanel';section.className='analysis-panel';section.hidden=true;
 section.innerHTML='<div class="analysis-intro"><div><span class="analysis-overline">✧ Competition planning</span><h2>Wardrobe Strengths & Gaps</h2><p>Find which style × label × rarity combinations you own — and which exist in the catalog but are missing from your collection.</p></div><span class="analysis-caveat">Coverage, not styling score</span></div>'
 +'<div class="analysis-toolbar"><label>Collection type<select id="anMode"><option value="items">Individual items</option><option value="outfits">Outfit entries</option></select></label><label>Rarity<select id="anRarity"><option value="5">5 ✦</option><option value="4">4 ✦</option><option value="3">3 ✦</option><option value="2">2 ✦</option><option value="all">All rarities</option></select></label><label>Order labels<select id="anOrder"><option value="missing">Weakest coverage first</option><option value="strong">Best coverage first</option><option value="name">Alphabetical</option></select></label></div>'
 +'<div id="anStats" class="analysis-stats"></div>'
 +'<div class="analysis-board"><div class="analysis-card"><div class="analysis-card-title"><h3>Style coverage</h3><small>Owned / catalog items by primary style</small></div><div id="anStyles" class="analysis-style-chart"></div></div><div class="analysis-card"><div class="analysis-card-title"><h3>Label gaps</h3><small id="anLabelSubtitle"></small></div><div id="anLabels" class="analysis-label-chart"></div></div></div>'
 +'<div class="analysis-card analysis-detail"><div class="analysis-card-title"><h3 id="anDetailTitle">Collection breakdown</h3><small id="anDetailSubtitle"></small></div><div class="analysis-detail-tools"><label>Category<select id="anSlot"></select></label></div><div id="anSlotChart" class="analysis-slot-chart"></div><div id="anExamples"></div></div>'
 +'<p class="analysis-footnote">Counts use the public gongeo catalog and ownership imported into this browser. Outfit entries are ownership markers, not verification that every piece of a single outfit is available. Base style values, Glow Up levels, battle bonuses and final scores are not included yet.</p>';
 $('grid').parentElement.append(section);
 $('anMode').onchange=e=>{mode=e.target.value;selectedLabel=null;slot='all';draw()};
 $('anRarity').onchange=e=>{rarity=e.target.value;selectedLabel=null;draw()};
 $('anOrder').onchange=e=>{order=e.target.value;draw()};
 $('anSlot').onchange=e=>{slot=e.target.value;draw()};
 $('anStyles').addEventListener('click',e=>{const btn=e.target.closest('button[data-style]');if(btn){style=btn.dataset.style;selectedLabel=null;slot='all';draw()}});
 $('anLabels').addEventListener('click',e=>{const btn=e.target.closest('button[data-label]');if(btn){selectedLabel=btn.dataset.label;draw()}});
}
function bar(have,total,klass=''){
 const percent=total?Math.round(100*have/total):0;
 return '<span class="analysis-track '+klass+'"><span class="analysis-fill" style="width:'+percent+'%"></span></span>';
}
function draw(){
 if(!active)return;
 ensure();
 const base=valid(),mine=base.filter(owned),rows=summaryRows();
 const present=rows.filter(r=>r.have>0).length,empty=rows.filter(r=>r.have===0).length;
 const totalStyles=STYLES.filter(s=>withStyle(base,s).length>0).length;
 $('anMode').value=mode;$('anRarity').value=rarity;$('anOrder').value=order;
 $('anStats').innerHTML='<div><strong>'+mine.length+' <small>/ '+base.length+'</small></strong><span>Owned '+(mode==='items'?'items':'outfit entries')+'</span></div>'
  +'<div><strong>'+present+' <small>/ '+rows.length+'</small></strong><span>'+style+' labels covered</span></div>'
  +'<div><strong>'+empty+'</strong><span>Missing combinations</span></div>'
  +'<div><strong>'+totalStyles+' <small>/ 5</small></strong><span>Styles in catalog</span></div>';
 $('anStyles').innerHTML=STYLES.map(s=>{
   const entries=withStyle(base,s),have=entries.filter(owned).length;
   const selected=s===style;
   return '<button type="button" class="analysis-style-row '+(selected?'selected':'')+'" data-style="'+s+'" aria-pressed="'+selected+'"><span class="analysis-style-name">'+s+'</span>'+bar(have,entries.length,'analysis-style-'+s.toLowerCase())+'<span class="analysis-numeric">'+have+' / '+entries.length+'</span></button>';
 }).join('');
 const ordered=[...rows].sort((a,b)=>order==='name'?a.label.localeCompare(b.label):order==='strong'?(b.coverage-a.coverage||b.have-a.have):(a.coverage-b.coverage||a.have-b.have));
 $('anLabelSubtitle').textContent=style+' · '+(rarity==='all'?'all rarities':rarity+'★')+' · '+rows.length+' possible labels';
 $('anLabels').innerHTML=ordered.length?ordered.map(r=>{
  const chosen=selectedLabel===r.label;
  return '<button type="button" class="analysis-label-row '+(chosen?'selected ':'')+(r.have===0?'is-gap':'')+'" data-label="'+esc(r.label)+'" aria-pressed="'+chosen+'"><span class="analysis-label-name">'+esc(r.label)+'</span>'+bar(r.have,r.can,r.have===0?'empty':'')+'<span class="analysis-numeric">'+r.have+' / '+r.can+'</span><span class="analysis-row-note">'+(r.have===0?'MISSING':Math.round(100*r.have/r.can)+'%')+'</span></button>';
 }).join(''):'<div class="analysis-no-results">No combinations in the catalog for these conditions.</div>';
 if(!selectedLabel||!rows.some(r=>r.label===selectedLabel))selectedLabel=ordered[0]?.label||null;
 $('anLabels').querySelectorAll('[data-label]').forEach(b=>{b.classList.toggle('selected',b.dataset.label===selectedLabel);b.setAttribute('aria-pressed',String(b.dataset.label===selectedLabel))});
 const matched=selectedLabel?withLabel(withStyle(base,style),selectedLabel):[];
 const selectedOwned=matched.filter(owned);
 $('anDetailTitle').textContent=selectedLabel?style+' + '+selectedLabel:'Collection breakdown';
 $('anDetailSubtitle').textContent=selectedLabel?selectedOwned.length+' owned / '+matched.length+' in catalog · '+(rarity==='all'?'all rarities':rarity+'★'):'Choose a label above';
 const chosenSlots=[['all','All categories'],...(mode==='outfits'?[['outfit','Outfits']]:SLOTS)];
 $('anSlot').innerHTML=chosenSlots.map(([id,name])=>'<option value="'+id+'">'+name+'</option>').join('');
 if(!chosenSlots.some(([id])=>id===slot))slot='all';
 $('anSlot').value=slot;
 const chartSlots=mode==='outfits'?[['outfit','Outfits']]:SLOTS;
 $('anSlotChart').innerHTML=chartSlots.map(([id,name])=>{
  const list=matched.filter(i=>mode==='outfits'||slotName(i)===id);
  const have=list.filter(owned).length;
  return '<div class="analysis-slot-row '+(!list.length?'unavailable':have===0?'is-gap':'')+'"><span>'+name+'</span>'+bar(have,list.length)+'<b>'+have+' / '+list.length+'</b><small>'+(list.length===0?'Not in catalog':have===0?'Missing':'')+'</small></div>';
 }).join('');
 const details=matched.filter(i=>slot==='all'||mode==='outfits'||slotName(i)===slot);
 const samples=details.filter(owned).slice(0,12);
 const unowned=details.filter(i=>!owned(i)).slice(0,8);
 const title=i=>(window.NikkiAnalysisData?.names?.[i.kind+'_'+i.id]||'Item '+i.id);
 const renderList=arr=>arr.length?'<div class="analysis-examples">'+arr.map(i=>'<div class="analysis-example"><span class="analysis-example-stars">'+('✦'.repeat(Math.min(i.stars,5)))+'</span><span>'+esc(title(i))+'</span></div>').join('')+'</div>':'<p class="analysis-muted">None in this category.</p>';
 $('anExamples').innerHTML='<div class="analysis-example-columns"><div><h4>✓ In your collection ('+details.filter(owned).length+')</h4>'+renderList(samples)+'</div><div><h4>✧ Missing from collection ('+details.filter(i=>!owned(i)).length+')</h4>'+renderList(unowned)+'</div></div>';
}
function activate(on,entries,ownedSet,nameMap){
 ensure();active=!!on;$('analysisPanel').hidden=!active;
 if(!active)return;
 data=entries||[];ownedIds=ownedSet||new Set();
 labels=[...new Set(data.filter(i=>i.kind==='item'||i.kind==='outfit').flatMap(i=>i.labels||[]))].sort();
 window.NikkiAnalysisData={names:nameMap||{}};
 draw();
}
window.NikkiAnalysis={activate,refresh:()=>{if(active)draw()}};
})();