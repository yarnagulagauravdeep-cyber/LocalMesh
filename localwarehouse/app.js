const $=s=>document.querySelector(s);
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The review text decides: a fault word means defect, otherwise personal dissatisfaction.
const DEFECT=/(stopp|broke|snap|crack|damag|defect|faulty|not work|doesn.t work|dead|leak|torn|tear|burn|short.?circuit|malfunction|stuck|rust)/i;
const mSeason=m=>m>=2&&m<=5?'summer':m>=6&&m<=10?'monsoon':'winter';
const NOW=mSeason(new Date().getMonth());
// Mirrors backend/mock_data.py's SEASON_SUITED_CLIMATES — climate fit is
// evaluated against the selected warehouse's real area climate zone (from
// /api/meta), not a one-size-fits-all guess independent of which city is
// open.
const SEASON_SUITED_CLIMATES={summer:['Hot','Moderate'],monsoon:['Hot','Moderate','Cold'],winter:['Cold','Moderate']};
const climateFits=(season,areaCode)=>{
  const area=whAreas.find(a=>a.code===areaCode);
  return area?SEASON_SUITED_CLIMATES[season].includes(area.climate_zone):true;
};
const LABEL={repair:'Local repair',local:'Local warehouse',far:'Far warehouse'};
const COLOR={summer:'#e0a800',monsoon:'#3a9aa8',winter:'#7b6bd6'};
const LOW=10; // units at or below this count as low stock (stock is deliberately thin: 10-15 units per product)

// Local-warehouse stock is fetched from /api/warehouses/{areaCode} — the same
// backend data SeasonMart's storefront and the ops dashboard read from, so
// units here are never a dry, disconnected number. One warehouse per city;
// pick a city with the selector in the header.
let wh=load('warehub_wh','CHE'),whAreas=[],whProducts=[],whTotal=0;
// Returns and admin-override decisions live on the backend (shared by every
// device on the hotspot), not in localStorage — otherwise a return filed on
// one laptop would never show up on another's WareHub. These two caches are
// refreshed by loadReturns()/loadDecisions() below and polled on an interval.
let whReturns=[],whDecisions={};

const skuFor=(name,i)=>{const h=[...name].reduce((a,c)=>a+c.charCodeAt(0),0);return (h%900+100)+'-'+String(i+1).padStart(2,'0')};
const binFor=name=>{const h=[...name].reduce((a,c)=>a+c.charCodeAt(0),0);return String.fromCharCode(65+h%6)+'-'+(h%40+1)};

let tab='queue',sel=null,ovId=null,povName=null,invQ='',invS='all',invLow=false;
const cfg=()=>Object.assign({cap:Math.max(90,whTotal+30)},load('warehub_cfg',{}));
// /api/returns already comes back newest-first (see returns_store.list_returns).
const rets=()=>whReturns.map(r=>({returnId:r.id,product:r.product,season:r.season||'summer',reasonText:r.review_text,at:r.submitted_at}));
const st=()=>whDecisions;
const stockList=()=>whProducts.map((p,i)=>Object.assign({sku:skuFor(p.name,i),bin:binFor(p.name)},p));
const stockTotal=()=>whTotal;
const localUsed=()=>stockTotal()+Object.values(st()).filter(x=>x.dest==='local').length;
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2500)};
const when=r=>new Date(r.at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const inr=n=>n===''?'-':'₹'+n.toLocaleString('en-IN');

async function api(path,opts){
  const res=await fetch('/api'+path,opts);
  if(!res.ok)throw new Error(path+' failed');
  return res.json();
}
async function loadMeta(){
  try{const meta=await api('/meta');whAreas=meta.areas}catch(e){whAreas=[{code:'CHE',name:'Chennai'}]}
  const sel2=$('#whSel');
  if(sel2)sel2.innerHTML=whAreas.map(a=>`<option value="${a.code}" ${a.code===wh?'selected':''}>${esc(a.name)}</option>`).join('');
}
async function loadWarehouse(){
  try{
    const data=await api('/warehouses/'+wh);
    whProducts=data.products;whTotal=data.total_units;
  }catch(e){whProducts=[];whTotal=0}
}
// Polled so a return filed from SeasonMart on another device, or a decision
// made from WareHub on another device, shows up here within a few seconds.
async function loadReturns(){
  try{whReturns=await api('/returns')}catch(e){ /* keep whatever we last had */ }
}
async function loadDecisions(){
  try{whDecisions=await api('/returns/decisions')}catch(e){ /* keep whatever we last had */ }
}
function areaName(code){return (whAreas.find(a=>a.code===code)||{}).name||code}

function classify(r){const m=DEFECT.exec(r.reasonText||'');return m?{cls:'Defect',hit:m[0].toLowerCase()}:{cls:'Dissatisfaction'}}
function recommend(r){
  const c=classify(r),cf=cfg(),used=localUsed();
  if(c.cls==='Defect')return {c,dest:'repair',steps:[`Review mentions "${c.hit}", so it is classed as a defect.`,'Defects go to a local repair shop.','After repair, the unit is re-checked for local demand if the customer wants a refund.']};
  const high=r.season===NOW,fit=climateFits(r.season,wh);
  const steps=['Review does not describe a fault, so it is classed as dissatisfaction.',`Local demand for ${r.season} items is ${high?'high':'low'} this month.`];
  let dest;
  if(high)dest='local';else{steps.push(`${areaName(wh)} climate ${fit?'suits':'does not suit'} ${r.season} items.`);dest=fit?'local':'far'}
  if(dest==='local'&&used>=cf.cap){steps.push(`Local warehouse is full (${used}/${cf.cap} units), so it goes to the far warehouse.`);dest='far'}
  return {c,dest,steps};
}
function logAct(type,text){const L=load('warehub_log',[]);L.unshift({t:new Date().toISOString(),type,text});save('warehub_log',L.slice(0,100))}
// There is no "approve" step — every return is decided through Override, so
// a manager always explicitly states the destination (pre-filled with the
// system's recommendation) rather than one-click rubber-stamping it.
async function decide(id,dest){
  try{
    const d=await api('/returns/'+id+'/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dest})});
    whDecisions[id]=d;
    logAct('override','Overridden '+id+': '+LABEL[dest]);toast('Return '+id+' sent to: '+LABEL[dest]);render();
  }catch(e){toast('Could not save the decision — check the connection.')}
}

function renderKpi(){
  const R=rets(),s=st(),cf=cfg(),used=localUsed(),pct=Math.round(used/cf.cap*100);
  const today=R.filter(r=>new Date(r.at).toDateString()===new Date().toDateString()).length;
  const far=Object.values(s).filter(x=>x.dest==='far').length;
  const low=stockList().filter(p=>p.qty<=LOW).length;
  $('#kp').innerHTML=`<div class="k"><small>New returns today</small><b>${today}</b></div>
  <div class="k"><small>Sent to far warehouse</small><b>${far}</b></div>
  <div class="k"><small>Low stock products</small><b>${low}</b></div>
  <div class="k"><small>Capacity used (${used.toLocaleString('en-IN')}/${cf.cap.toLocaleString('en-IN')})</small><b>${pct}%</b><div class="bar"><i style="width:${Math.min(pct,100)}%;background:${pct>=90?'#c0392b':'#e8710a'}"></i></div></div>`;
}

function seasonBars(){
  const s=st(),cnt={summer:0,monsoon:0,winter:0};
  stockList().forEach(p=>cnt[p.season]+=p.qty);
  rets().forEach(r=>{const x=s[r.returnId];if(x&&x.dest==='local'&&cnt[r.season]!==undefined)cnt[r.season]++});
  const mx=Math.max(...Object.values(cnt),1);
  return Object.keys(cnt).map(k=>`<div class="row"><span>${k[0].toUpperCase()+k.slice(1)}</span><div class="b"><i style="width:${cnt[k]/mx*100}%;background:${COLOR[k]}"></i></div><b>${cnt[k]}</b></div>`).join('');
}

function viewQueue(){
  const R=rets(),s=st();
  if(!R.length)return '<div class="p"><p class="empty">No returns yet. Submit one from the store to see it here.</p></div>';
  if(!sel||!R.find(r=>r.returnId===sel))sel=(R.find(r=>!s[r.returnId])||R[0]).returnId;
  const r0=R.find(r=>r.returnId===sel),rec=recommend(r0),done=s[sel];
  const rows=R.map(r=>{const c=classify(r),x=s[r.returnId];return `<tr data-sel="${esc(r.returnId)}" class="${r.returnId===sel?'sel':''}">
   <td>${esc(r.returnId)}</td><td>${esc(r.product)}</td><td>${esc(r.reasonText)}</td>
   <td><span class="t ${c.cls==='Defect'?'d':'s'}">${c.cls}</span></td>
   <td>${x?'<span class="btn done">Done</span>':`<button class="btn p1" data-ov="${esc(r.returnId)}">Override</button>`}</td></tr>`}).join('');
  return `<div class="g"><div class="p"><h4>Returns queue</h4><div class="sc"><table>
   <tr><th>Return</th><th>Product</th><th>Customer reason</th><th>Class</th><th></th></tr>${rows}</table></div></div>
   <div class="p"><h4>Why this decision? (${esc(sel)})</h4>
   ${rec.steps.map((t,i)=>`<div class="step"><i>${i+1}</i><span>${esc(t)}</span></div>`).join('')}
   <div class="rec">${done?'Placed: '+LABEL[done.dest]:'Recommended: '+LABEL[rec.dest]+' — click Override to confirm or change it'}</div>
   <div class="cap"><b>Units in stock by season (${esc(areaName(wh))})</b>${seasonBars()}</div></div></div>`;
}

// The warehouse's own stocked item with the lowest recent average monthly
// purchases (see backend decision.product_demand_strength) — excludes
// open-box returned items, which aren't regular catalog stock.
function leastDemanded(){
  const L=stockList();
  if(!L.length)return null;
  return L.reduce((min,p)=>p.recent_demand<min.recent_demand?p:min,L[0]);
}

function invRows(){
  const s=st(),low=leastDemanded();
  let L=stockList();
  rets().filter(r=>s[r.returnId]&&s[r.returnId].dest==='local').forEach(r=>L.push({sku:r.returnId,name:r.product,season:r.season,category:'Returned (open-box)',qty:1,price:'',bin:'R-'+String(r.returnId).slice(-4),ret:true}));
  const q=invQ.toLowerCase();
  L=L.filter(p=>(invS==='all'||(invS==='ret'?p.ret:p.season===invS))&&(!q||(p.name+p.sku+p.category).toLowerCase().includes(q))&&(!invLow||(!p.ret&&p.qty<=LOW)));
  const status=p=>p.ret?['Open-box','s']:p.qty===0?['Out of stock','bad']:p.qty<=LOW?['Low','wn']:['In stock','ok'];
  return {n:L.length,html:L.map(p=>{const t=status(p),isLeast=!p.ret&&low&&p.name===low.name;return `<tr class="${isLeast?'least':''}"><td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${esc(p.season)}</td><td>${esc(p.category)}</td><td>${esc(p.bin)}</td><td>${inr(p.price)}</td>
   <td>${p.ret?'1':`<span class="qb"><button data-adj="${esc(p.name)}|-1" aria-label="Decrease">-</button>${p.qty}<button data-adj="${esc(p.name)}|1" aria-label="Increase">+</button></span>`}</td>
   <td>${p.ret?'—':`${p.recent_demand}/mo${isLeast?' <span class="t wn">Least demand</span>':''}`}</td>
   <td><span class="t ${t[1]}">${t[0]}</span></td>
   <td>${p.ret?'':`<button class="btn" data-pov="${esc(p.name)}">Override</button>`}</td></tr>`}).join('')||'<tr><td colspan="10" class="empty">No products match.</td></tr>'};
}
function viewInv(){
  const r=invRows(),cf=cfg(),low=leastDemanded();
  const lowBanner=low?`<div class="rec low-rec">Least in demand here: <b>${esc(low.name)}</b> — ${low.recent_demand} units/month recent average. Consider transferring it out to make room for faster movers.</div>`:'';
  return `<div class="g"><div class="p"><h4>Local warehouse inventory — ${esc(areaName(wh))} <span id="invCount">(${r.n})</span></h4>
   <p class="empty" style="padding:0 0 .5rem">${stockList().length} product types stocked here, 10-15 units each — by design a small, fast-moving local range, not a full catalog.</p>
   ${lowBanner}
   <div class="flt"><input type="search" id="invQ" placeholder="Search product, SKU or category" value="${esc(invQ)}">
   <select id="invS" aria-label="Filter"><option value="all">All seasons</option>${['summer','monsoon','winter'].map(k=>`<option value="${k}" ${invS===k?'selected':''}>${k[0].toUpperCase()+k.slice(1)}</option>`).join('')}<option value="ret" ${invS==='ret'?'selected':''}>Returned items</option></select>
   <label><input type="checkbox" id="invLow" ${invLow?'checked':''}> Low stock only</label></div>
   <div class="sc tall"><table><thead><tr><th>SKU</th><th>Product</th><th>Season</th><th>Category</th><th>Bin</th><th>Price</th><th>In stock</th><th>Demand</th><th>Status</th><th></th></tr></thead><tbody id="invBody">${r.html}</tbody></table></div></div>
   <div class="p"><h4>Units in stock by season</h4>${seasonBars()}
   <div class="cap">Total: <b>${localUsed().toLocaleString('en-IN')}</b> of ${cf.cap.toLocaleString('en-IN')} units across ${stockList().length} products.</div></div></div>`;
}
function invUpdate(){const r=invRows();$('#invBody').innerHTML=r.html;$('#invCount').textContent='('+r.n+')'}

function listView(title,filter,extra){
  const R=rets(),s=st(),L=R.filter(r=>s[r.returnId]&&filter(s[r.returnId]));
  return `<div class="p"><h4>${title} (${L.length})</h4>${L.length?`<div class="sc"><table><tr><th>Return</th><th>Product</th><th>Season</th><th>Customer reason</th><th>Date</th><th></th></tr>
   ${L.map(r=>`<tr><td>${esc(r.returnId)}</td><td>${esc(r.product)}</td><td>${esc(r.season)}</td><td>${esc(r.reasonText)}</td><td>${when(s[r.returnId])}</td><td>${extra(r)}</td></tr>`).join('')}</table></div>`:'<p class="empty">Nothing here yet.</p>'}</div>`;
}
function render(){
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===tab));
  renderKpi();
  $('#view').innerHTML=tab==='queue'?viewQueue():tab==='inv'?viewInv()
   :listView('Sent to far warehouse',x=>x.dest==='far',()=>'Central hub');
}

document.addEventListener('click',async e=>{
  const t=e.target.closest('button,tr')||e.target,d=t.dataset||{};
  if(d.close!==undefined){t.closest('dialog').close()}
  else if(d.t){tab=d.t;render()}
  else if(d.ov){
    ovId=d.ov;
    const r=rets().find(x=>x.returnId===d.ov),rec=recommend(r);
    $('#ovTitle').textContent='Override '+d.ov;
    document.querySelectorAll('#ovForm input[name=d]').forEach(radio=>radio.checked=radio.value===rec.dest);
    $('#ovDlg').showModal();
  }
  else if(d.pov){
    povName=d.pov;const p=stockList().find(x=>x.name===d.pov);if(!p)return;
    $('#povTitle').textContent='Override '+d.pov;
    $('#povName').value=p.name;$('#povQty').value=p.qty;$('#povPrice').value=p.price;
    $('#povDlg').showModal();
  }
  else if(d.adj){
    const [name,n]=d.adj.split('|'),p=stockList().find(x=>x.name===name),newQty=Math.max(0,p.qty+ +n);
    try{
      const data=await api('/warehouses/'+wh+'/override',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:name,qty:newQty})});
      whProducts=data.products;whTotal=data.total_units;
      logAct('stock',p.name+': '+p.qty+' to '+newQty+' units');render();
    }catch(e){toast('Could not update stock.')}
  }
  else if(d.sel){sel=d.sel;render()}
});
document.addEventListener('input',e=>{if(e.target.id==='invQ'){invQ=e.target.value;invUpdate()}});
document.addEventListener('change',e=>{
  if(e.target.id==='invS'){invS=e.target.value;invUpdate()}
  if(e.target.id==='invLow'){invLow=e.target.checked;invUpdate()}
});
$('#ovForm').onsubmit=e=>{e.preventDefault();decide(ovId,new FormData(e.target).get('d'));$('#ovDlg').close()};
$('#ovCancel').onclick=()=>$('#ovDlg').close();
$('#povForm').onsubmit=async e=>{
  e.preventDefault();
  const fd=new FormData(e.target),newName=fd.get('name').trim(),qty=Math.max(0,+fd.get('qty')||0),price=Math.max(0,+fd.get('price')||0);
  try{
    const body={product:povName,qty,price};if(newName&&newName!==povName)body.new_name=newName;
    const data=await api('/warehouses/'+wh+'/override',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    whProducts=data.products;whTotal=data.total_units;
    logAct('override','Overridden '+povName+' — qty '+qty+', price ₹'+price+(body.new_name?', renamed to '+body.new_name:''));
    toast('Product overridden.');$('#povDlg').close();render();
  }catch(e){toast('Could not override product.')}
};
$('#povCancel').onclick=()=>$('#povDlg').close();
$('#whSel').onchange=async e=>{
  wh=e.target.value;save('warehub_wh',wh);
  $('#whName').textContent=areaName(wh)+' Local Warehouse Administration';
  await loadWarehouse();invQ='';invS='all';invLow=false;render();
};
window.addEventListener('storage',render);

// ---- Dark mode ----
function setTheme(m){document.documentElement.dataset.theme=m;localStorage.setItem('warehub_theme',m);$('#themeBtn').textContent=m==='dark'?'Light mode':'Dark mode'}
$('#themeBtn').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
setTheme(localStorage.getItem('warehub_theme')||'dark');

(async function init(){
  await loadMeta();
  $('#whName').textContent=areaName(wh)+' Local Warehouse Administration';
  await Promise.all([loadWarehouse(),loadReturns(),loadDecisions()]);
  render();
  setInterval(async()=>{await Promise.all([loadReturns(),loadDecisions()]);render()},5000);
})();
