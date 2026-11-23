/* Direct PearlPal import. Credentials stay in this dialog and are never persisted. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const byId=()=>window.NikkiPearpalBridge;
const API={global:'https://pearpal-api.infoldgames.com',china:'https://myl-api.nuanpaper.com'};
function decodeSnappy(bytes){
 let offset=0, size=0,shift=0;
 for(let n=0;n<5;n++){
  if(offset>=bytes.length)throw Error('Invalid compressed response');
  const b=bytes[offset++];size+=(b&127)*2**shift;
  if(!(b&128))break;shift+=7;
  if(n===4)throw Error('Invalid Snappy length');
 }
 if(!Number.isSafeInteger(size)||size<0||size>64*1024*1024)throw Error('Unexpected PearlPal data size');
 const out=new Uint8Array(size);let pos=0;
 while(offset<bytes.length&&pos<size){
  const tag=bytes[offset++],type=tag&3;let length=0,dist=0;
  if(type===0){
   const short=tag>>>2;
   if(short<60)length=short+1;
   else{
    const count=short-59;
    if(offset+count>bytes.length)throw Error('Truncated Snappy literal');
    let n=0;for(let j=0;j<count;j++)n+=bytes[offset++]*(2**(8*j));
    length=n+1;
   }
   if(offset+length>bytes.length||pos+length>size)throw Error('Invalid Snappy literal');
   out.set(bytes.subarray(offset,offset+length),pos);offset+=length;pos+=length;continue;
  }
  if(type===1){length=4+((tag>>>2)&7);dist=((tag&0xe0)<<3)|bytes[offset++];}
  else if(type===2){length=(tag>>>2)+1;dist=bytes[offset]|(bytes[offset+1]<<8);offset+=2;}
  else{length=(tag>>>2)+1;dist=(bytes[offset]|(bytes[offset+1]<<8)|(bytes[offset+2]<<16)|(bytes[offset+3]<<24))>>>0;offset+=4;}
  if(!dist||dist>pos||pos+length>size||offset>bytes.length)throw Error('Invalid Snappy copy');
  for(let j=0;j<length;j++){out[pos]=out[pos-dist];pos++;}
 }
 if(pos!==size)throw Error('Incomplete compressed response');
 return JSON.parse(new TextDecoder().decode(out));
}
const html='<dialog id="pearpalDialog" class="pearpal-dialog"><form method="dialog" id="pearpalForm">'
 +'<h2>✧ Import from PearlPal</h2>'
 +'<p>One check for clothing, completed outfits and Eurekas. Existing ownership is kept. Credentials are used only for this request and are not saved.</p>'
 +'<label>Region<select id="pearpalRegion"><option value="global">Global (America / Europe / Asia / TW)</option><option value="china">China</option></select></label>'
 +'<label>Momo Token<input id="pearpalToken" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="momoToken" required></label>'
 +'<label>Momo ID<input id="pearpalId" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="momoNid" required></label>'
 +'<small>Get these values from your own logged-in PearlPal session (browser DevTools → Application → Cookies). Do not paste them into chat or share them with others.</small>'
 +'<p class="pearpal-note">A single PearlPal response may contain only completed outfits and may omit Eurekas. Missing information will be reported, never treated as unowned.</p>'
 +'<div id="pearpalResult" role="status" aria-live="polite"></div>'
 +'<div class="pearpal-actions"><button type="button" id="pearpalCancel">Close</button><button type="button" id="pearpalCheck">Check PearlPal</button><button type="button" id="pearpalApply" hidden>Import found items</button></div>'
 +'</form></dialog>';
function init(){
 const sync=$('syncMenu');if(!sync||$('pearpalOpen'))return;
 const button=document.createElement('button');button.type='button';button.id='pearpalOpen';button.textContent='↧ Import from PearlPal';
 sync.insertBefore(button,$('syncCatalog'));
 document.body.insertAdjacentHTML('beforeend',html);
 const dialog=$('pearpalDialog'),result=$('pearpalResult'),check=$('pearpalCheck'),apply=$('pearpalApply');
 let candidate=null;
 const wipe=()=>{$('pearpalToken').value='';$('pearpalId').value='';candidate=null;apply.hidden=true;};
 dialog.addEventListener('close',wipe);
 $('pearpalCancel').onclick=()=>dialog.close();
 button.onclick=()=>{$('syncMenu').classList.remove('open');wipe();result.textContent='';dialog.showModal();};
 ['pearpalToken','pearpalId','pearpalRegion'].forEach(id=>$(id).addEventListener('input',()=>{candidate=null;apply.hidden=true;result.textContent=''}));
 check.onclick=async()=>{
  const token=$('pearpalToken').value.trim(),id=$('pearpalId').value.trim(),region=$('pearpalRegion').value;
  if(!token||!id){result.textContent='Please enter Momo Token and Momo ID.';return}
  if(!byId()?.preview([]).catalogReady){result.textContent='Catalog is still loading. Try again when it finishes.';return}
  candidate=null;apply.hidden=true;check.disabled=true;result.textContent='Connecting directly to PearlPal…';
  try{
   const client_id=region==='china'?1106:1116;
   const endpoint=API[region];
   const opts={method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id,token,openid:id})};
   const user=await fetch(endpoint+'/v1/strategy/user/info/get',opts);
   if(!user.ok)throw Error('Login check HTTP '+user.status);
   const account=await user.json();
   if(account.code!==0)throw Error('PearlPal rejected this session. Please sign in again.');
   const res=await fetch(endpoint+'/v1/strategy/user/note/book/info',opts);
   if(!res.ok)throw Error('PearlPal notebook HTTP '+res.status);
   const data=decodeSnappy(new Uint8Array(await res.arrayBuffer()));
   const clothes=data?.info_from_gm?.clothes;
   const suitList=data?.info_from_self?.suit_list;
   const eurekaList=data?.info_from_self?.magic_ball_list;
   let source='',ids=[],outfitIds=[];
   const completed=Array.isArray(suitList)?[...new Set(suitList.map(Number).filter(Number.isSafeInteger))]:[];
   outfitIds=completed;
   if(Array.isArray(clothes)&&clothes.length){
    ids=clothes.map(x=>Number(x?.item_id)).filter(Number.isSafeInteger);
    source='Direct clothing list';
   }else if(Array.isArray(suitList)){
    source='Completed outfits only (partial wardrobe)';
    result.textContent='Loading completed outfit mappings…';
    const index=await fetch('https://raw.githubusercontent.com/dastrokes/gongeo.us-nikki-tracker/master/public/catalog/index.json').then(r=>{if(!r.ok)throw Error('Catalog lookup failed');return r.json()});
    const outfits=await fetch('https://raw.githubusercontent.com/dastrokes/gongeo.us-nikki-tracker/master/public'+index.files.outfitItems.path).then(r=>{if(!r.ok)throw Error('Outfit mapping failed');return r.json()});
    const byOutfit=new Map(outfits.map(row=>[Number(row[0]),row[1]]));
    ids=completed.flatMap(x=>byOutfit.get(x)||[]);
   }else{
    source='No clothing data';
   }
   const clothing=byId().preview(ids,outfitIds);
   const eureka=Array.isArray(eurekaList)?window.NikkiEureka?.previewPearpalColors(eurekaList):null;
   candidate={ids,outfitIds,eurekaRows:Array.isArray(eurekaList)?eurekaList:[]};
   const eurekaStatus=!Array.isArray(eurekaList)?'not provided by PearlPal':
     !eureka?.catalogReady?'catalog not ready':
     eureka.received+' entries; '+eureka.recognized+' recognized; '+eureka.newColors.length+' new colors'+(eureka.invalid?', '+eureka.invalid+' unrecognized':'');
   result.textContent=source
     +'\nClothes: '+clothing.clothes.length+' identified, '+clothing.newClothes.length+' new.'
     +'\nCompleted outfits: '+clothing.outfits.length+' identified, '+clothing.newOutfits.length+' new.'
     +'\nEureka: '+eurekaStatus+'.'
     +'\nHeartfelt Blues: '+(clothing.heartfeltBlues||clothing.heartfeltBluesVariant?'reported':'not reported')+'.'
     +'\nExisting ownership will be preserved.';
   apply.hidden=clothing.newClothes.length+clothing.newMakeup.length+clothing.newOutfits.length+(eureka?.newColors.length||0)===0;

  }catch(err){
   const cors=err instanceof TypeError;
   result.textContent=cors?'Browser blocked the direct request (possibly CORS or network). No data was changed.':'Import failed: '+(err?.message||'Unknown error')+'. No data was changed.';
  }finally{
   check.disabled=false;$('pearpalToken').value='';$('pearpalId').value='';
  }
 };
 apply.onclick=()=>{
  if(!candidate)return;
  try{
   const clothing=byId().merge(candidate.ids,candidate.outfitIds);
   const colors=window.NikkiEureka?.mergePearpalColors(candidate.eurekaRows);
   result.textContent='Added '+clothing.newClothes.length+' clothes, '+clothing.newOutfits.length+' outfits, '+clothing.newMakeup.length+' makeup, and '+(colors?.newColors.length||0)+' Eureka colors. Previous ownership remains intact.';
   candidate=null;apply.hidden=true;
  }catch(err){result.textContent='Import error: '+(err?.message||'Unknown error')+'. Check the collection before retrying.'}
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();