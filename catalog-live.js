/* Nikki Wardrobe V2 — live public catalog. Names, rarity, styles and tags:
   dastrokes/gongeo.us-nikki-tracker (MIT); artwork © respective owners.
   Personal ownership is kept separately in this browser. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const ROOT='https://raw.githubusercontent.com/dastrokes/gongeo.us-nikki-tracker/master/';
const CDN='https://cdn.gongeo.us';
const CATS=[['outfits','Outfits'],['hair','Hair'],['dresses','Dresses'],['outerwear','Outerwear'],['tops','Tops'],['bottoms','Bottoms'],['socks','Socks'],['shoes','Shoes'],['accessories','Accessories'],['makeup','Makeup']];
const SUB={
  accessories:[['hairAccessories','Hair Accessories'],['headwear','Headwear'],['earrings','Earrings'],['neckwear','Neckwear'],['bracelets','Bracelets'],['chokers','Chokers'],['gloves','Gloves'],['faceDecorations','Face Decorations'],['chestAccessories','Chest Accessories'],['pendants','Pendants'],['backpieces','Backpieces'],['rings','Rings'],['armDecorations','Arm Decorations'],['handhelds','Handhelds'],['bodyPaint','Body Paint']],
  makeup:[['all','All Makeup'],['full','Full Makeup'],['base','Base Makeup'],['eyebrows','Eyebrows'],['eyelashes','Eyelashes'],['contacts','Contact Lenses'],['lips','Lips']],
  outfits:[['all','All Outfits'],['limited','Limited'],['permanent','Permanent'],['event','Event'],['collab','Collab']]
};
const ITEM_TYPES=['hair','outerwear','shoes','hairAccessories','headwear','earrings','neckwear','chokers','dresses','chestAccessories','handhelds','socks','gloves','faceDecorations','backpieces','tops','bracelets','armDecorations','pendants','bottoms','bodyPaint','rings'];
const MAKEUP_TYPES=['full','base','eyebrows','eyelashes','contacts','lips'];
const STYLES=['Sweet','Sexy','Fresh','Cool','Elegant'];
const LABELS=['Warm','Summer','Home','Formal','Simple','Fantasy','Intellectual','Adventure','Romance','Retro','Fashion','Uniform','Fairy','Ballroom','Royal','Linlang','Pastoral','Playful','Trendy','Cute','Light','More Light','Divine','Forest','Spirited','Classical','Terra','Aesthetic','Whimsy','Glow'];
const LABEL_COLORS={
  Warm:'blue',Summer:'pink',Home:'green',Formal:'gold',Simple:'coral',
  Fantasy:'mint',Intellectual:'orange',Adventure:'coral',Romance:'pink',Retro:'orange',
  Fashion:'green',Uniform:'blue',Fairy:'mint',Ballroom:'orange',Royal:'coral',
  Linlang:'gold',Pastoral:'green',Playful:'blue',Trendy:'orange',Cute:'pink',
  Light:'gold','More Light':'gold',Divine:'orange',Forest:'mint',Spirited:'blue',
  Classical:'coral',Terra:'gold',Aesthetic:'blue',Whimsy:'pink',Glow:'green'
};
const ALL_LABEL_IDS=[1,2,3,4,5,6,7,8,9,10,11,12,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117];
const idLabel=Object.fromEntries(ALL_LABEL_IDS.map((id,i)=>[id,LABELS[i]]));
const accessoryTypes=new Set(SUB.accessories.map(x=>x[0]));
let page='wardrobe',category='dresses',sub='all',catalog=null,items=[],names={},filtered=[],visibleLimit=48;
let selectedStyles=new Set(),selectedLabels=new Set(),selectedRarities=new Set();
const safeSet=(key)=>{try{return new Set(JSON.parse(localStorage.getItem(key)||'[]').map(Number).filter(Number.isSafeInteger))}catch{return new Set()}};
let owned=safeSet('nikki-v2-owned'),ownedMakeup=safeSet('nikki-v2-makeup');
let currentLoad=null;
let wardrobeObserver=null,scrollingMore=false;
function ensureWardrobeSentinel(){
  let sentinel=$('wardrobeScrollSentinel');
  if(!sentinel){
    sentinel=document.createElement('div');sentinel.id='wardrobeScrollSentinel';
    sentinel.className='catalog-scroll-sentinel';sentinel.setAttribute('aria-hidden','true');
    $('grid').after(sentinel);
  }
  if(!wardrobeObserver&&'IntersectionObserver' in window){
    wardrobeObserver=new IntersectionObserver(entries=>{
      if(!entries.some(e=>e.isIntersecting)||scrollingMore||page!=='wardrobe'||visibleLimit>=filtered.length)return;
      scrollingMore=true;visibleLimit+=48;render();
      requestAnimationFrame(()=>{scrollingMore=false});
    },{rootMargin:'850px 0px',threshold:0});
    wardrobeObserver.observe(sentinel);
  }
  return sentinel;
}
function updateWardrobeSentinel(){
  const sentinel=ensureWardrobeSentinel();
  sentinel.hidden=page!=='wardrobe'||visibleLimit>=filtered.length;
}
const safe=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notice(s){$('notice').textContent=s}
function showModal(title,message,action){
  $('modalTitle').textContent=title;$('modalText').textContent=message;
  $('modalConfirm').hidden=!action;
  $('modalConfirm').onclick=()=>{action?.();$('modal').close()};
  $('modal').showModal();
}
$('modalClose').onclick=()=>$('modal').close();
function persist(){
  localStorage.setItem('nikki-v2-owned',JSON.stringify([...owned]));
  localStorage.setItem('nikki-v2-makeup',JSON.stringify([...ownedMakeup]));
  $('collectionStatus').textContent='✓ Owned · '+owned.size+' clothes · '+ownedMakeup.size+' makeup (local)';
}
function isOwned(i){return i.kind==='makeup'?ownedMakeup.has(i.id):owned.has(i.id)}
function setOwned(i,yes){const set=i.kind==='makeup'?ownedMakeup:owned;yes?set.add(i.id):set.delete(i.id);persist()}
const STARS=[5,4,3,2];
$('rarities').classList.add('rarity-chips');
$('rarities').innerHTML=STARS.map(n=>'<button type="button" class="rarity-chip" data-rarity="'+n+'" aria-pressed="false">'+('✦'.repeat(n))+'</button>').join('');
function renderLabelPicker(){
  $('labelList').innerHTML=LABELS.map(label=>'<button type="button" class="label-chip color-'+LABEL_COLORS[label]+(selectedLabels.has(label)?' selected':'')+'" data-label="'+label+'" aria-pressed="'+selectedLabels.has(label)+'">'+label+'</button>').join('');
  $('labelList').querySelectorAll('[data-label]').forEach(b=>b.onclick=()=>{
    const label=b.dataset.label;selectedLabels.has(label)?selectedLabels.delete(label):selectedLabels.add(label);
    b.classList.toggle('selected',selectedLabels.has(label));b.setAttribute('aria-pressed',String(selectedLabels.has(label)));
    visibleLimit=48;render();
  });
}
function initCategories(){
  $('categories').innerHTML=CATS.map(([id,label])=>'<button class="cat '+(id===category?'active':'')+'" data-cat="'+id+'"><span class="glyph icon-'+id+'" aria-hidden="true"></span><span>'+label+'</span></button>').join('');
  $('categories').querySelectorAll('button').forEach(b=>b.onclick=()=>{category=b.dataset.cat;sub='all';visibleLimit=48;render()});
  const subs=SUB[category]||[];
  $('subcategories').innerHTML=subs.map(([id,label])=>'<button class="pill '+(sub===id?'active':'')+'" data-sub="'+id+'">'+label+'</button>').join('');
  $('subcategories').querySelectorAll('button').forEach(b=>b.onclick=()=>{sub=b.dataset.sub;visibleLimit=48;render()});
}
function categoryMatch(i){
  if(page==='analysis')return false;
  if(page==='eureka')return i.kind==='eureka';
  if(category==='outfits')return i.kind==='outfit';
  if(category==='makeup')return i.kind==='makeup'&&(sub==='all'||i.type===sub);
  if(i.kind!=='item')return false;
  if(category==='accessories')return accessoryTypes.has(i.type)&&(sub==='all'||i.type===sub);
  return i.type===category;
}
function getName(i){return names[i.kind+'_'+i.id]||i.name||'Item #'+i.id}
function getImagePath(i){
  if(i.kind==='outfit')return '/images/outfits/'+i.id+'.png';
  if(i.kind==='eureka')return '/images/eurekas/'+i.id+'.png';
  if(i.kind==='makeup')return (i.type==='full'?'/images/items/makeups/':'/images/items/icons/')+i.id+'.png';
  return '/images/items/icons/'+i.id+'.png';
}
function imageSources(i){
  const path=getImagePath(i);
  return ['https://ik.imagekit.io/gongeous'+path,CDN+path,'https://gongeo.us'+path];
}
function imageFallback(img){
  const sources=JSON.parse(img.dataset.sources||'[]');
  const next=Number(img.dataset.imageIndex||0)+1;
  if(next<sources.length){img.dataset.imageIndex=String(next);img.src=sources[next]}
  else{img.hidden=true;img.nextElementSibling.hidden=false}
}
window.nikkiImageFallback=imageFallback;
const STYLE_CLASSES={Elegant:'style-elegant',Sweet:'style-sweet',Cool:'style-cool',Fresh:'style-fresh',Sexy:'style-sexy'};
function render(){
  // Eureka currently has only 3★, 4★, 5★; keep 2★ available in Wardrobe.
  const twoStar=$('rarities').querySelector('[data-rarity="2"]');
  if(twoStar){twoStar.hidden=page==='eureka';twoStar.style.display=page==='eureka'?'none':'';
    if(page==='eureka'&&selectedRarities.has(2)){selectedRarities.delete(2);twoStar.classList.remove('active');twoStar.setAttribute('aria-pressed','false');}}
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  $('categories').style.display=page==='wardrobe'?'grid':'none';
  $('subcategories').style.display=page==='wardrobe'?'flex':'none';
  initCategories();
  if(page==='eureka'){
    $('grid').hidden=true;$('grid').style.display='none';
    $('empty').hidden=true;
    const sentinel=$('wardrobeScrollSentinel');if(sentinel)sentinel.hidden=true;
    window.NikkiEureka?.activate(true);
    return;
  }
  window.NikkiEureka?.activate(false);
  $('grid').hidden=false;
  let list=items.filter(categoryMatch);
  const search=$('search').value.trim().toLowerCase();
  if(search)list=list.filter(i=>getName(i).toLowerCase().includes(search)||String(i.id).includes(search));
  const o=document.querySelector('input[name=owned]:checked')?.value||'all';
  if(o==='owned')list=list.filter(isOwned);
  if(o==='missing')list=list.filter(i=>!isOwned(i));
  if(selectedRarities.size)list=list.filter(i=>selectedRarities.has(i.stars));
  if(selectedStyles.size)list=list.filter(i=>selectedStyles.has(i.style));
  if(selectedLabels.size)list=list.filter(i=>[...selectedLabels].every(l=>i.labels.includes(l)));
  const sort=$('sort').value;
  if(sort==='rarity')list.sort((a,b)=>b.stars-a.stars||Number(b.id)-Number(a.id));
  else if(sort==='id')list.sort((a,b)=>Number(a.id)-Number(b.id));
  else list.sort((a,b)=>Number(b.id)-Number(a.id));
  filtered=list;
  const heading=page==='eureka'?'Eureka':page==='analysis'?'Analysis':(CATS.find(a=>a[0]===category)?.[1]||'Wardrobe');
  $('heading').firstChild.textContent=heading+' ';
  $('count').textContent=list.length+' items';
  const shown=list.slice(0,visibleLimit);
  $('grid').innerHTML=shown.map(i=>{
    const itemName=safe(getName(i)),id=String(i.id),o=isOwned(i);
    const sources=imageSources(i);
    const image='<img loading="lazy" decoding="async" src="'+safe(sources[0])+'" data-sources="'+safe(JSON.stringify(sources))+'" data-image-index="0" alt="" onerror="window.nikkiImageFallback(this)"><span class="placeholder" hidden>✧</span>';
    const mainStyle=i.style?'<span class="card-style '+(STYLE_CLASSES[i.style]||'')+'">'+safe(i.style)+'</span>':'';
    const labels=(i.labels||[]).slice(0,2).map(label=>'<span class="card-label label-chip color-'+(LABEL_COLORS[label]||'gold')+'">'+safe(label)+'</span>').join('');
    return '<article class="item '+(o?'':'not-owned')+'"><input class="owned" type="checkbox" data-kind="'+i.kind+'" data-owned="'+id+'" aria-label="Owned: '+itemName+'" '+(o?'checked':'')+'><div class="frame">'+image+'<span class="stars">'+('✦'.repeat(Math.min(i.stars||0,5)))+'</span></div><h3 title="'+itemName+'">'+itemName+'</h3><div class="badges">'+mainStyle+'<div class="card-labels">'+labels+'</div></div></article>';
  }).join('');
  $('grid').querySelectorAll('[data-owned]').forEach(b=>b.onchange=()=>{
    const i=items.find(item=>item.id===Number(b.dataset.owned)&&item.kind===b.dataset.kind);
    if(i){setOwned(i,b.checked);render();}
  });
  $('empty').hidden=list.length>0;
  $('grid').style.display=list.length?'grid':'none';
  updateWardrobeSentinel();
  if(page==='analysis'){
    $('empty').querySelector('h3').textContent='Analysis is the next chapter';
    $('empty').querySelector('p').textContent='The style × label matrix is still under construction.';
  }else{
    $('empty').querySelector('h3').textContent=catalog?'No matching items':'Your wardrobe awaits';
    $('empty').querySelector('p').textContent=catalog?'Try another category or reset the filters.':'Loading game catalog…';
  }
}
async function loadCatalog(checkOnly=false){
  if(currentLoad&&!checkOnly)return currentLoad;
  const task=(async()=>{
    $('syncFoot').textContent='Checking catalog…';
    try{
      const r=await fetch(ROOT+'public/catalog/index.json',{cache:'no-store'});
      if(!r.ok)throw Error('Catalog HTTP '+r.status);
      const m=await r.json();
      if(checkOnly){
        $('syncFoot').textContent='Source '+m.gameVersion;
        showModal('Catalog updates','Current public catalog: '+m.gameVersion+'. '+(catalog?.gameVersion===m.gameVersion?'You already have this version loaded.':'Choose Sync with gongeo to refresh the items.'));
        return;
      }
      const required=['items','outfits','eurekas','makeups'];
      const parts=await Promise.all(required.map(async k=>{
        const url=ROOT+'public'+m.files[k].path;
        const res=await fetch(url);
        if(!res.ok)throw Error('Failed to fetch '+k+': '+res.status);
        const body=await res.json();
        return [k,Array.isArray(body)?body:body.r||[]];
      }));
      const dictionaries=await Promise.all(['item','outfit','eureka','makeup','misc'].map(async k=>{
        const res=await fetch(ROOT+'app/locales/en/'+k+'.json');
        if(!res.ok)throw Error('Failed to fetch '+k+' names: '+res.status);
        return [k,await res.json()];
      }));
      const db=Object.fromEntries(parts),tr=Object.fromEntries(dictionaries),newNames={};
      const unpack=x=>Array.isArray(x)?x:[x];
      const mapped=[];
      const append=(kind,ids,quality,styleIndex,labels,type,translation)=>{
        for(const rawId of unpack(ids)){
          const id=Number(rawId);if(!Number.isSafeInteger(id))continue;
          const style=STYLES[styleIndex]||'';
          const entry={id,kind,stars:Number(quality)||0,style,labels, type};
          mapped.push(entry);
          const translationKey=(kind==='makeup'&&type!=='full'?'item':kind)+'.'+id+'.name';
          const label=translation[translationKey];
          if(label)newNames[kind+'_'+id]=label;
        }
      };
      db.items.forEach(row=>append('item',row[0],row[1],row[3],(row[4]||[]).map(id=>tr.misc['label.'+id+'.name']||idLabel[id]).filter(Boolean),ITEM_TYPES[row[2]]||'',tr.item));
      db.outfits.forEach(row=>append('outfit',row[0],row[1],row[2],(row[3]||[]).map(id=>tr.misc['label.'+id+'.name']||idLabel[id]).filter(Boolean),'',tr.outfit));
      db.makeups.forEach(row=>{
        const type=MAKEUP_TYPES[row[2]]||'';
        append('makeup',row[0],row[1],row[3],[],type,type==='full'?tr.makeup:tr.item);
      });
      db.eurekas.forEach(row=>{
        const id=Number(row[0]),type=['head','hands','feet'][row[2]]||'';
        const labels=(row[6]||[]).map(labelId=>tr.misc['label.'+labelId+'.name']||idLabel[labelId]).filter(Boolean);
        const colors=(row[8]||[]).filter(color=>Array.isArray(color)&&Number.isSafeInteger(color[0])).map(color=>({id:color[0],type:color[1]}));
        mapped.push({id,kind:'eureka',suitId:Number(row[1]),type,stars:Number(row[3]),style:STYLES[row[5]]||'',labels,colors});
        const label=tr.eureka['eureka.'+id+'.name'];if(label)newNames['eureka_'+id]=label;
      });
      if(mapped.length<3000)throw Error('Unexpectedly small catalog ('+mapped.length+')');
      items=mapped;names=newNames;catalog=m;
      window.NikkiEureka?.setCatalog(items,names,{styles:selectedStyles,labels:selectedLabels,rarities:selectedRarities});
      $('catalogVersion').textContent='✧ Catalog · '+m.gameVersion;
      $('syncFoot').textContent='Catalog '+m.gameVersion+' · '+items.length+' records';
      notice('Loaded '+items.length.toLocaleString()+' catalog records. Clothing images © Infinity Nikki.');
      render();
    }catch(e){
      notice('Catalog could not be loaded: '+e.message);
      $('syncFoot').textContent='Catalog unavailable — retry Sync';
      if(!catalog)showModal('Catalog unavailable','Could not load the public catalog. Check your connection and try Sync again. '+e.message);
    }
  })();
  currentLoad=task;
  try{await task}finally{if(currentLoad===task)currentLoad=null}
}
$('syncToggle').onclick=()=>{
  const open=$('syncMenu').classList.toggle('open');
  $('syncToggle').setAttribute('aria-expanded',String(open));
};
document.addEventListener('click',e=>{
  if(!e.target.closest('.sync-wrap')){$('syncMenu').classList.remove('open');$('syncToggle').setAttribute('aria-expanded','false')}
});
$('syncCatalog').onclick=()=>loadCatalog();
$('checkUpdates').onclick=()=>loadCatalog(true);
function importJSON(){$('fileInput').click()}
$('importJson').onclick=importJSON;$('emptyImport').onclick=importJSON;
$('fileInput').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{
    const obj=JSON.parse(await file.text()),wardrobe=obj?.wardrobe;
    if(!Array.isArray(wardrobe?.ownedItemIds))throw Error('No wardrobe.ownedItemIds found');
    const newClothes=new Set(wardrobe.ownedItemIds.filter(Number.isSafeInteger));
    const newMakeup=Array.isArray(wardrobe.ownedMakeupIds)?new Set(wardrobe.ownedMakeupIds.filter(Number.isSafeInteger)):new Set(ownedMakeup);
    const eurekaColorIds=Array.isArray(wardrobe.ownedEurekaColorIds)?wardrobe.ownedEurekaColorIds:null;
    const suffix=Array.isArray(wardrobe.ownedMakeupIds)?' and '+newMakeup.size+' makeup IDs':'';
    showModal('Import gongeo JSON','Found '+newClothes.size+' clothing IDs'+suffix+'. Replace your local owned lists? The file is not uploaded anywhere.',()=>{
      owned=newClothes;ownedMakeup=newMakeup;
      const n=eurekaColorIds?window.NikkiEureka?.importIds(eurekaColorIds)||0:0;
      persist();render();notice('Imported ownership: '+owned.size+' clothing, '+ownedMakeup.size+' makeup'+(eurekaColorIds?', '+n+' Eureka colors':''));
    });
  }catch(err){showModal('Import failed',err.message)}
};
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;visibleLimit=48;render()});
$('search').oninput=()=>{visibleLimit=48;render()};
$('sort').onchange=render;
$('rarities').querySelectorAll('[data-rarity]').forEach(b=>b.onclick=()=>{
  const n=Number(b.dataset.rarity);selectedRarities.has(n)?selectedRarities.delete(n):selectedRarities.add(n);
  b.classList.toggle('active',selectedRarities.has(n));b.setAttribute('aria-pressed',String(selectedRarities.has(n)));
  visibleLimit=48;render();
});
document.querySelectorAll('input[name=owned]').forEach(b=>b.onchange=()=>{visibleLimit=48;render()});
$('styleChips').querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>{
  const v=b.dataset.style;selectedStyles.has(v)?selectedStyles.delete(v):selectedStyles.add(v);
  b.classList.toggle('active',selectedStyles.has(v));b.setAttribute('aria-pressed',String(selectedStyles.has(v)));
  visibleLimit=48;render();
});
$('reset').onclick=()=>{
  $('search').value='';document.querySelector('input[name=owned][value=all]').checked=true;
  selectedRarities.clear();selectedStyles.clear();selectedLabels.clear();
  $('rarities').querySelectorAll('[data-rarity]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false')});
  $('styleChips').querySelectorAll('[data-style]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false')});
  renderLabelPicker();visibleLimit=48;window.NikkiEureka?.reset();render();
};
renderLabelPicker();persist();render();loadCatalog();
})();