/*
 * SeasonMart storefront.
 *
 * Catalog model
 * -------------
 * Every item carries an explicit `cl` climate code (subset of H/M/C) that is
 * sent to LocalMesh with each return, so routing uses the item's actual
 * suitability (e.g. a sweater = "C") instead of an averaged guess from its
 * seasonal category. Items are grouped by `cat` for the category nav rather
 * than by season — categories map to how a shopper actually browses a WMS
 * catalog (Cooling, Heating, Weather Gear, etc).
 *
 * Fields: n(name), cat(category), cl(climate code), p(price), m(mrp),
 *         r(rating), c(review count), left(stock), cond?(condition),
 *         km?(ships-from distance for open-box).
 * Climate codes: H=Hot, M=Moderate, C=Cold; combos like HM, MC, HMC.
 */
const CAT={cool:'Cooling',heat:'Heating',rain:'Weather Gear',cloth:'Clothing',acc:'Accessories',care:'Personal Care',home:'Home',open:'Open-box deals'};
const CAT_ORDER=['all','cool','heat','rain','cloth','acc','care','home','open'];
const CAT_LABEL={all:'All products',...CAT};

// Climate code → full zone list used by the backend climate-fit rule.
const CL_ZONES={H:['Hot'],M:['Moderate'],C:['Cold'],HM:['Hot','Moderate'],MC:['Moderate','Cold'],HC:['Hot','Cold'],HMC:['Hot','Moderate','Cold']};
function climateLabel(cl){
  if(cl==='HMC')return 'All climates';
  if(cl==='H')return 'Hot only';
  if(cl==='M')return 'Moderate only';
  if(cl==='C')return 'Cold only';
  if(cl==='HM')return 'Hot / Moderate';
  if(cl==='MC')return 'Moderate / Cold';
  return cl;
}
function climateClass(cl){
  if(cl==='HMC')return 'cl-all';
  if(cl.includes('H')&&!cl.includes('C'))return 'cl-hot';
  if(cl.includes('C')&&!cl.includes('H'))return 'cl-cold';
  return 'cl-mod';
}

// 100 curated items. Prices in INR. Each item's climate tag is hand-assigned
// so the warehouse routing demo returns an accurate climate-fit verdict.
const P_RAW=[
  // --- COOLING (15) — Hot only
  ['Tower Air Cooler 40L','cool','H',6499,8999,4.2,1840,4],
  ['Desert Air Cooler 90L','cool','H',11499,15999,4.3,920,3],
  ['Personal Air Cooler 20L','cool','H',4999,6999,4.0,760,8],
  ['Pedestal Fan 400 mm','cool','H',1499,2199,4.1,2310,9],
  ['Industrial Pedestal Fan','cool','H',3499,4999,4.2,540,5],
  ['Wall Mounted Fan 400 mm','cool','H',1899,2499,4.0,870,7],
  ['Portable Neck Fan','cool','H',899,1399,3.9,760,12],
  ['USB Desk Fan','cool','H',599,999,4.0,2130,15],
  ['Mini Rechargeable Fan','cool','H',799,1199,4.1,1820,18],
  ['Tower Fan with Remote','cool','H',3999,5499,4.2,610,6],
  ['Ceiling Fan 1200 mm','cool','H',2199,2999,4.3,1290,7],
  ['BLDC Energy Saver Ceiling Fan','cool','H',3799,4999,4.4,480,5],
  ['Split AC 1.5 Ton','cool','H',28999,35999,4.4,540,3],
  ['Window AC 1.0 Ton','cool','H',22999,27999,4.2,310,4],
  ['Portable Evaporative Cooler','cool','H',7999,10499,4.1,220,6],

  // --- HEATING (14) — Cold only
  ['Room Heater 2000 W','heat','C',1899,2799,4.1,1205,4],
  ['Oil Filled Radiator Heater','heat','C',4499,5999,4.2,610,5],
  ['Infrared Room Heater','heat','C',2499,3299,4.0,380,6],
  ['Halogen Heater','heat','C',1299,1899,3.9,540,9],
  ['Convection Heater','heat','C',2199,2999,4.0,220,7],
  ['Panel Heater 1500 W','heat','C',3499,4499,4.2,180,5],
  ['Space Heater 1500 W','heat','C',2799,3799,4.1,340,6],
  ['Storage Water Heater 15 L','heat','C',5999,8499,4.3,2240,5],
  ['Storage Water Heater 25 L','heat','C',7499,9999,4.3,890,4],
  ['Instant Water Heater 3 L','heat','C',2999,3999,4.0,410,7],
  ['Immersion Water Rod','heat','C',499,799,3.8,1620,20],
  ['Electric Blanket','heat','C',1799,2499,4.3,920,6],
  ['Electric Heating Pad','heat','C',899,1299,4.2,730,10],
  ['Towel Warmer Rail','heat','C',4999,6499,4.1,160,3],

  // --- WEATHER GEAR (10) — weather-neutral: everyone gets rain sometimes
  ['Auto-open Umbrella','rain','HMC',449,699,4.3,2530,5],
  ['Golf Umbrella Oversized','rain','HMC',899,1299,4.4,610,6],
  ['Compact Travel Umbrella','rain','HMC',399,599,4.1,1810,14],
  ['Rain Jacket and Pants Set','rain','HMC',899,1399,4.1,1310,7],
  ['Reusable Rain Poncho','rain','HMC',299,499,4.0,1620,20],
  ['Waterproof Gumboots','rain','HMC',749,1099,4.2,688,3],
  ['Anti-slip Rain Sandals','rain','HMC',649,999,4.1,540,8],
  ['Waterproof Dry Bag 20 L','rain','HMC',549,799,4.4,860,11],
  ['Waterproof Phone Pouch','rain','HMC',199,349,4.0,2100,20],
  ['Rain Cover for Backpack','rain','HMC',299,449,4.1,980,16],

  // --- CLOTHING (24) — climate-specific
  // Summer/warm-weather clothing (Hot, Moderate)
  ['Cotton T-Shirt','cloth','HM',499,799,4.2,3410,22],
  ['Cotton Polo Shirt','cloth','HM',699,1099,4.1,1840,16],
  ['Cotton Summer Shirt','cloth','HM',699,1199,4.0,980,15],
  ['Linen Shirt','cloth','HM',1299,1899,4.3,620,8],
  ['Linen Trousers','cloth','HM',1499,2199,4.1,480,7],
  ['Cotton Shorts','cloth','HM',599,899,4.0,2210,18],
  ['Cotton Bermuda Shorts','cloth','HM',799,1199,4.1,1060,12],
  ['Rayon Blouse','cloth','HM',999,1499,4.0,520,10],
  ['Cotton Kurta','cloth','HM',1199,1799,4.3,1380,9],
  ['Sleeveless Summer Dress','cloth','HM',1499,2199,4.2,760,8],
  ['Cotton Nightwear Set','cloth','HM',899,1299,4.3,1280,14],
  ['Lightweight Cotton Trousers','cloth','HM',999,1499,4.1,840,11],
  // Winter clothing (Cold, Moderate)
  ['Wool Blend Sweater','cloth','MC',1299,1999,4.2,1350,8],
  ['Cashmere Pullover','cloth','MC',3999,5499,4.5,310,4],
  ['Wool Cardigan','cloth','MC',1799,2499,4.2,620,7],
  ['Thermal Innerwear Set','cloth','MC',799,1299,4.2,910,9],
  ['Fleece Jacket','cloth','MC',1699,2499,4.3,1130,8],
  ['Hooded Sweatshirt','cloth','MC',999,1499,4.1,2210,14],
  ['Puffer Jacket','cloth','C',3499,4999,4.3,870,5],
  ['Down Jacket','cloth','C',5999,8499,4.4,540,4],
  ['Winter Overcoat','cloth','C',4999,6999,4.2,310,5],
  ['Flannel Pyjama Set','cloth','MC',1199,1699,4.3,740,10],
  ['Fleece-lined Leggings','cloth','MC',799,1199,4.2,920,13],
  ['Woollen Socks (3-pack)','cloth','MC',399,599,4.3,1810,22],

  // --- ACCESSORIES (14) — climate-specific
  ['Polarised Sunglasses','acc','HM',799,1499,4.3,640,9],
  ['Aviator Sunglasses','acc','HM',999,1599,4.2,520,8],
  ['Wide-brim Sun Hat','acc','HM',399,699,4.0,430,10],
  ['Baseball Cap','acc','HM',349,599,4.1,1820,18],
  ['Sun Visor','acc','H',299,499,4.0,340,15],
  ['UV Protection Arm Sleeves','acc','H',199,399,4.1,560,20],
  ['Cooling Towel','acc','H',249,399,4.1,1210,16],
  ['Thermal Gloves','acc','C',299,499,4.0,1720,15],
  ['Woollen Cap (Beanie)','acc','C',249,449,4.1,830,16],
  ['Woollen Scarf','acc','C',399,699,4.3,620,11],
  ['Earmuffs','acc','C',199,349,4.0,540,18],
  ['Snow Boots','acc','C',2499,3499,4.3,210,4],
  ['Insulated Steel Bottle 1 L','acc','HMC',599,899,4.5,1415,6],
  ['Hand Warmers (10 pack)','acc','C',349,599,4.0,420,20],

  // --- PERSONAL CARE (10) — climate-specific skincare
  ['SPF 50 Sunscreen 100 ml','care','HM',349,499,4.4,3120,14],
  ['SPF 30 Daily Sunscreen 50 ml','care','HM',249,399,4.3,2410,20],
  ['Lip Balm with SPF','care','HM',149,249,4.2,2820,30],
  ['Winter Lip Balm Pack','care','C',199,349,4.2,1430,25],
  ['Aloe Vera Gel','care','HM',249,399,4.3,1920,22],
  ['Sunblock Stick','care','H',299,499,4.1,840,18],
  ['Moisturising Body Lotion 400 ml','care','MC',299,450,4.5,3900,22],
  ['Deep Moisture Cold Cream','care','C',249,399,4.3,1710,16],
  ['Hand & Nail Cream','care','MC',199,349,4.2,920,18],
  ['Petroleum Jelly 100 g','care','C',99,199,4.4,2630,30],

  // --- HOME (8) — climate-dependent and -neutral
  ['Room Dehumidifier 20 L','home','HM',8999,11999,4.0,410,6],
  ['Portable Humidifier','home','C',2499,3499,4.1,620,8],
  ['HEPA Air Purifier','home','HMC',12999,15999,4.4,340,4],
  ['Folding Clothes Drying Stand','home','HMC',1299,1899,4.3,1670,6],
  ['Smart Wi-Fi Thermostat','home','HMC',4999,6499,4.2,220,5],
  ['Essential Oil Diffuser','home','HMC',1499,2199,4.2,1120,12],
  ['Cordless Stick Vacuum','home','HMC',8499,10999,4.3,540,5],
  ['Hot Water Bottle','home','C',349,499,4.3,1260,22],

  // --- OPEN-BOX (5) — like-new returns re-stocked locally
  ['Tower Air Cooler 40L (open-box)','open','H',5199,6499,4.2,40,2,'Like new',4],
  ['Room Heater 2000 W (open-box)','open','C',1499,1899,4.1,28,3,'Like new',4],
  ['Split AC 1.5 Ton (open-box)','open','H',24999,28999,4.4,15,1,'Good',6],
  ['Wool Blend Sweater (open-box)','open','MC',999,1299,4.2,22,2,'Like new',6],
  ['Auto-open Umbrella (open-box)','open','HMC',349,449,4.3,30,3,'Like new',5],
];
const P=P_RAW.map((a,i)=>({id:i,n:a[0],cat:a[1],cl:a[2],p:a[3],m:a[4],r:a[5],c:a[6],left:a[7],cond:a[8],km:a[9]}));

const COPY={
 all:['Everything the season asks for','Appliances and essentials across every climate, with free 7-day returns.'],
 cool:['Cooling appliances','Coolers, fans, ACs and other hot-weather appliances.'],
 heat:['Heating appliances','Heaters, radiators, water heaters and warmth essentials.'],
 rain:['Weather gear','Umbrellas, rainwear and damp-weather essentials.'],
 cloth:['Clothing','Everyday clothing across seasons and climates.'],
 acc:['Accessories','Sunglasses, caps, gloves, bottles and more.'],
 care:['Personal care','Skincare and daily care for every climate.'],
 home:['Home','Appliances, humidity control and household essentials.'],
 open:['Open-box deals','Returned items that passed inspection and ship from a store near you.'],
};
const REASONS=['Stopped working','Arrived damaged','Wrong size or fit','Not as described','Changed my mind','Does not suit my weather'];
const REASON_TEXT={
 'Stopped working':n=>`${n} stopped working after a few days of normal use, seems like a hardware fault.`,
 'Arrived damaged':n=>`${n} arrived with visible damage, looks like a manufacturing defect.`,
 'Wrong size or fit':n=>`${n} doesn't fit right, but it works fine otherwise. Just not the right fit for me.`,
 'Not as described':n=>`${n} isn't quite what I expected from the listing, though it works fine.`,
 'Changed my mind':n=>`${n} works fine, I just changed my mind and don't need it anymore.`,
 'Does not suit my weather':n=>`${n} works fine but doesn't really suit the weather here.`,
};
const $=s=>document.querySelector(s);
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const inr=n=>'₹'+n.toLocaleString('en-IN');
const off=p=>Math.round(100-p.p/p.m*100);
let cat='all',query='',retId=null,chip='',CITIES=[],LOCAL_STOCK=new Set(),lastStockFingerprint='';
let retStep='review',chosenResolution=null;
// City-specific local-warehouse stock (from /api/warehouses/{areaCode}),
// network-wide available stock (central + every local warehouse, from
// /api/stock), and the season/city ad order (from /api/ads) — all read
// from the same backend data WareHub's admin app and the ops dashboard
// use, so nothing here is a disconnected, hard-coded number.
let CITY_STOCK=new Set(),CITY_NAME='',STOCK_TOTALS={},PURCHASED={},AD_ORDER=[];
const eta=()=>{const d=new Date();d.setDate(d.getDate()+3);return d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})};
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),3000)};

// Display-only — shown in the deliver-to dialog alongside the city picker,
// which is the only field that actually affects delivery.
const CITY_STATE={RAJ:'Rajasthan',DEL:'Delhi',BLR:'Karnataka',PUN:'Maharashtra',SHM:'Himachal Pradesh',MUM:'Maharashtra',CHE:'Tamil Nadu',KOL:'West Bengal',LKO:'Uttar Pradesh',LEH:'Ladakh'};

// Season → category shown in the seasonal ad rail (coolers/fans in summer,
// heaters in winter, rain gear in monsoon).
const SEASON_AD_CAT={summer:'cool',monsoon:'rain',winter:'heat'};

// Product photos live in /product_imgs, one per catalog item, filed under a
// slug of the exact product name (see that folder's own naming). onerror
// removes a missing image so the name placeholder underneath still shows.
function slugify(s){
  return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}
function productImg(name){
  return `<img src="product_imgs/${slugify(name)}.png" alt="${name}" loading="lazy" onerror="this.remove()">`;
}

// `ad` renders this as a sponsored placement — a bordered, tinted card with
// a bold "Ad" chip, sized up slightly so it's clearly distinguishable from
// organic product listings rather than blending in with them.
function card(p,{ad=false}={}){
  const st=Math.round(p.r);
  const cityHit=CITY_STOCK.has(p.n),retHit=LOCAL_STOCK.has(p.n),inStock=cityHit||retHit;
  const delivery=cityHit?`<span class="instock">⚡ In stock — ${CITY_NAME||'your city'} local warehouse</span>`
    :retHit?'<span class="instock">⚡ In stock — local warehouse</span>'
    :(p.km?'Ships from '+p.km+' km away':'Free delivery by '+eta());
  const climateBadge=`<span class="climate-badge ${climateClass(p.cl)}" title="Climate suitability">${climateLabel(p.cl)}</span>`;
  const total=STOCK_TOTALS[p.n];
  const netStock=total!==undefined?`<div class="netstock">Available stock (local + central warehouses): <b>${total.toLocaleString('en-IN')}</b></div>`:'';
  // p.left is the catalog's starting "units left" countdown; purchases made
  // through checkout (tracked server-side, shared across every device) are
  // subtracted from it so this figure actually moves, same as the network
  // stock total above — and so is whatever's currently sitting in your own
  // cart, reserved the moment you tap "Add to cart", not just at checkout.
  const left=Math.max(0,p.left-(PURCHASED[p.n]||0)-cartQtyFor(p.id));
  const outOfStock=left<=0;
  const lowStock=outOfStock?'Out of stock':left<=6?'Only '+left+' left in stock':'';
  // Out of stock here just means SeasonMart's own countdown is empty — a
  // nearby Local Brand Center's warehouse (a separate stock pool) may
  // still have it, so offer a search instead of a dead end.
  const brandSearch=outOfStock?`<button class="btn ghost brand-search" data-search="${p.id}">Search local brand centers</button><div class="brand-search-result"></div>`:'';
  return `<article class="card${inStock?' local-stock':''}${ad?' ad-card':''}">
    ${ad?'<p class="ad-flag" aria-label="Advertisement">Ad &middot; seasonmart.example</p>':''}
    <div class="ph">${productImg(p.n)}<span>${p.n}</span>${p.cond?`<b class="tag">${p.cond}</b>`:`<b class="off">${off(p)}% off</b>`}${inStock?'<b class="loc">Local stock</b>':''}</div>
    <h3>${p.n}</h3>
    <div class="meta-row">${climateBadge}</div>
    <div class="stars">${'★'.repeat(st)+'☆'.repeat(5-st)}<i>${p.r} (${p.c.toLocaleString('en-IN')})</i></div>
    <div class="price">${inr(p.p)}<s>${inr(p.m)}</s></div>
    <div class="del">${delivery}</div>
    ${netStock}
    <div class="low">${lowStock}</div>
    <div class="acts"><button class="btn" data-add="${p.id}" ${outOfStock?'disabled':''}>Add to cart</button><button class="btn buy" data-buy="${p.id}" ${outOfStock?'disabled':''}>Buy now</button></div>
    ${brandSearch}
  </article>`;
}

// Out-of-stock product: this posts a live notification straight to the
// Local Brand Center console (see /brandcenter/ — Stock tab). It isn't
// auto-decided any more — it sits there until a staff member taps "available"
// or "not available", so this waits and polls for their answer instead of
// getting an immediate result back.
async function searchBrandCenters(id,btn){
  const p=P.find(x=>x.id===id);if(!p)return;
  const areaCode=currentAreaCode();
  if(!areaCode){toast('Set your delivery location first.');$('#locBtn').click();return}
  const out=btn.nextElementSibling;
  btn.disabled=true;btn.textContent='Checking local brand centers…';
  out.className='brand-search-result';out.textContent='';
  try{
    const res=await fetch('/api/service/stock-check',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({product:p.n,area_code:areaCode,origin:'storefront'})});
    if(!res.ok)throw new Error('stock check failed');
    let data=await res.json();
    out.textContent='Request sent — waiting for the local brand center to confirm…';
    btn.textContent='Waiting for brand center…';
    for(let i=0;i<40&&data.pending;i++){
      await new Promise(r=>setTimeout(r,3000));
      const poll=await fetch('/api/service/stock-checks/'+data.id);
      if(!poll.ok)break;
      data=await poll.json();
    }
    if(data.pending){
      out.className='brand-search-result bad';
      out.textContent='The local brand center has not responded yet. Try again shortly.';
      btn.disabled=false;btn.textContent='Search local brand centers';
      return;
    }
    if(data.route==='dispatch'){
      // Found — but don't place the order silently. Ask the customer to
      // reconfirm before it's final.
      const ok=confirm(`Found at the ${data.found_at.area_name} local brand center — place the order for ${p.n} (${inr(p.p)})?`);
      if(!ok){
        fetch('/api/service/stock-checks/'+data.id+'/cancel',{method:'POST'}).catch(()=>{});
        out.className='brand-search-result bad';
        out.textContent='Order not placed — you can search again any time.';
        btn.disabled=false;btn.textContent='Search local brand centers';
        toast('Order not placed.');
        return;
      }
      out.className='brand-search-result ok';
      out.textContent=`Order placed — ships from the ${data.found_at.area_name} local brand center. Delivery by ${eta()}.`;
      btn.textContent='Order placed ✓';
      const o=load('seasonmart_orders',[]);
      o.push({uid:Date.now(),pid:p.id,n:p.n,p:p.p,q:1,cat:p.cat,cl:p.cl,returned:false});
      save('seasonmart_orders',o);
      renderOrders();
      toast('Order placed. Delivery by '+eta()+'.');
      loadStockTotals();
    }else{
      out.className='brand-search-result bad';
      out.textContent="Couldn't place order — unavailable at every local brand center checked.";
      btn.disabled=false;btn.textContent='Search local brand centers';
      toast('Unavailable at the local brand center.');
    }
  }catch(e){
    out.className='brand-search-result bad';
    out.textContent='Could not reach the local brand center. Try again.';
    btn.disabled=false;btn.textContent='Search local brand centers';
  }
}

// The selected delivery city's own climate zone (Hot/Moderate/Cold) — the
// same field WareHub and the ops dashboard use for climate-fit routing, so
// "sorted by geographic location" here means the same thing it means there.
function cityClimateZone(){
  const city=CITIES.find(c=>c.code===currentAreaCode());
  return city?city.climate_zone:null;
}
function fitsCityClimate(p){
  const zone=cityClimateZone();
  if(!zone)return false;
  return (CL_ZONES[p.cl||'HMC']||CL_ZONES.HMC).includes(zone);
}

// LocalMesh-routed items (demand-driven, climate-fit, or repaired defects
// that landed back at the local warehouse) and items the selected city's
// local warehouse actually stocks always surface first, in every view, so
// the storefront visibly favors stock that's already nearby. Within what's
// left, items suited to the selected city's own climate zone — its actual
// geographic location — sort ahead of items that aren't.
function sortLocalStockFirst(list){
  const inStock=n=>CITY_STOCK.has(n)||LOCAL_STOCK.has(n);
  return [...list].sort((a,b)=>{
    const stockDiff=(inStock(b.n)?1:0)-(inStock(a.n)?1:0);
    if(stockDiff)return stockDiff;
    return (fitsCityClimate(b)?1:0)-(fitsCityClimate(a)?1:0);
  });
}

function filterByCategory(items){
  if(cat==='all')return items.filter(p=>p.cat!=='open');
  if(cat==='open')return items.filter(p=>p.cat==='open');
  return items.filter(p=>p.cat===cat);
}

function renderGrid(){
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.cat===cat));
  let list=filterByCategory(P);
  if(query)list=P.filter(p=>p.n.toLowerCase().includes(query)&&p.cat!=='open');
  list=sortLocalStockFirst(list);
  $('#secT').textContent=query?`Results for "${query}" (${list.length})`:(COPY[cat]?.[0]||CAT_LABEL[cat]);
  $('#grid').innerHTML=list.length?list.map(p=>card(p)).join(''):'<p class="empty">No products match this filter.</p>';
  const showOb=!query&&cat!=='open';
  $('#obw').hidden=!showOb;
  if(showOb)$('#obGrid').innerHTML=sortLocalStockFirst(P.filter(p=>p.cat==='open')).map(p=>card(p)).join('');
  renderAds();
}

// "Sponsored" slots in the rail — the season's fixed product picks (same 4
// products in every city for a given season) in the order /api/ads returns.
// That order is shuffled per city, so the same season advertises the same
// products everywhere but which ones land where swaps city to city, as a
// stand-in for local demand ranking. Rendered via card()'s `ad` option,
// which visibly marks them as ads rather than organic listings.
function renderAds(){
  const rail=$('#adRail');
  if(!rail)return;
  const season=currentSeason();
  let names=AD_ORDER;
  if(!names.length){
    const adCat=SEASON_AD_CAT[season]||'cool';
    names=P.filter(p=>p.cat===adCat&&p.cond===undefined).sort((a,b)=>b.r-a.r).slice(0,4).map(p=>p.n);
  }
  const picks=names.map(n=>P.find(p=>p.n===n)).filter(Boolean);
  rail.innerHTML=picks.map(p=>card(p,{ad:true})).join('');
}

// Same season, same 4 products everywhere; /api/ads shuffles their order
// deterministically per city so the top/bottom ad slots swap city to city.
async function loadAds(){
  const season=currentSeason(),code=currentAreaCode();
  try{
    const res=await fetch(`/api/ads?season=${encodeURIComponent(season)}&area_code=${encodeURIComponent(code||'')}`);
    if(!res.ok)throw new Error('ads fetch failed');
    const data=await res.json();
    AD_ORDER=data.products||[];
  }catch(e){ AD_ORDER=[]; /* renderAds() falls back to a client-side pick */ }
  renderAds();
}

function currentAreaCode(){
  const pin=load('seasonmart_profile',{}).pin;
  const city=CITIES.find(c=>c.pincode===pin);
  return city?city.code:null;
}

// The selected delivery city's own local warehouse (from WareHub's shared
// backend data) — used to highlight exactly the items actually stocked
// nearby, not just items LocalMesh has ever routed there.
async function loadCityStock(){
  const code=currentAreaCode();
  if(!code){CITY_STOCK=new Set();CITY_NAME='';renderGrid();return}
  try{
    const res=await fetch('/api/warehouses/'+encodeURIComponent(code));
    if(!res.ok)throw new Error('warehouse fetch failed');
    const data=await res.json();
    CITY_STOCK=new Set(data.products.map(p=>p.name));
    CITY_NAME=data.area_name;
  }catch(e){CITY_STOCK=new Set();CITY_NAME=''}
  renderGrid();
}

// Network-wide "available stock" per product: the central warehouse's
// buffer plus every local warehouse's units, added together — not a
// static per-product number baked into the catalog. Asks for every
// product in the catalog by name (not just the curated subset the
// backend defaults to) so every card gets a live figure.
async function loadStockTotals(){
  try{
    const names=P.map(p=>encodeURIComponent(p.n)).join(',');
    const res=await fetch('/api/stock?products='+names);
    if(!res.ok)throw new Error('stock fetch failed');
    const data=await res.json();
    STOCK_TOTALS=data.totals||{};
    PURCHASED=data.purchased||{};
  }catch(e){ /* keep whatever we last had */ }
  renderGrid();
}

// Polls LocalMesh's public returns queue to know which products it has
// routed back to the local warehouse, so this storefront always reflects
// the latest routing decisions.
async function loadLocalStock(){
  try{
    const res=await fetch('/api/returns');
    if(!res.ok)throw new Error('returns fetch failed');
    const returns=await res.json();
    const names=returns.filter(r=>r.status==='routed_local'||r.status==='defect_repaired').map(r=>r.product);
    const fingerprint=JSON.stringify([...new Set(names)].sort());
    if(fingerprint!==lastStockFingerprint){
      lastStockFingerprint=fingerprint;
      LOCAL_STOCK=new Set(names);
      renderGrid();
    }
  }catch(e){ /* LocalMesh unreachable — storefront still works */ }
}

const cart=()=>load('seasonmart_cart',[]);
function renderCart(){
  const c=cart().filter(x=>P[x.id]);
  $('#cartN').textContent=c.reduce((a,x)=>a+x.q,0);
  let sum=0;
  $('#cartList').innerHTML=c.length?c.map(x=>{const p=P[x.id];sum+=p.p*x.q;return `<div class="row"><div class="ph">${productImg(p.n)}<span>${p.n}</span></div>
   <div class="t">${p.n}<small>${inr(p.p)} each</small><div class="qty"><button data-dec="${x.id}" aria-label="Decrease">-</button>${x.q}<button data-inc="${x.id}" aria-label="Increase">+</button></div></div>
   <button class="x" data-rm="${x.id}" aria-label="Remove">×</button></div>`}).join('')+
   `<div class="tot"><span>Subtotal</span><span>${inr(sum)}</span></div>
    <button class="btn buy" style="width:100%" data-place>Place order</button>
    <button class="btn ghost" style="width:100%;margin-top:.4rem" data-clear-cart>Clear cart</button>`
   :'<p class="empty">Your cart is empty. Add something to get started.</p>';
}
const cartQtyFor=id=>{const x=cart().find(i=>i.id===id);return x?x.q:0};
// Adding to cart reserves units immediately — the product card's "left in
// stock" count (see card() above) subtracts the cart's own quantity, not
// just past purchases, so it visibly moves the moment you add to cart
// instead of only at checkout. Clamped to what's actually left so the cart
// can never reserve more than the product has.
function addCart(id,n=1){
  const c=cart(),x=c.find(i=>i.id===id),p=P[id];
  const avail=p?Math.max(0,p.left-(PURCHASED[p.n]||0)):Infinity;
  const next=Math.max(0,Math.min(avail,(x?x.q:0)+n));
  if(x)x.q=next;else if(next>0)c.push({id,q:next});
  save('seasonmart_cart',c.filter(i=>i.q>0));
  renderCart();renderGrid();
}

function renderOrders(){
  const o=load('seasonmart_orders',[]);
  const list=o.length?o.slice().reverse().map(x=>`<div class="row"><div class="ph">${productImg(x.n)}<span>${x.n}</span></div>
   <div class="t">${x.n}<small>Qty ${x.q} · ${inr(x.p*x.q)} · ${x.returned?'Return requested':'Delivered'}</small></div>
   ${x.returned?'<span class="rtag">Return requested</span>':`<button class="btn" data-ret="${x.uid}">Return</button>`}</div>`).join('')
   :'<p class="empty">No orders yet.</p>';
  $('#ordList').innerHTML=list+(o.length?'<button class="btn ghost" style="width:100%;margin-top:.8rem" data-clear-orders>Clear all orders &amp; returns</button>':'');
}
async function placeOrder(items){
  const o=load('seasonmart_orders',[]);
  items.forEach((x,i)=>{const p=P[x.id];o.push({uid:Date.now()+i,pid:p.id,n:p.n,p:p.p,q:x.q,cat:p.cat,cl:p.cl,returned:false})});
  save('seasonmart_orders',o);toast('Order placed. Delivery by '+eta()+'.');
  // Draw the purchased units down from the central warehouse buffer so
  // "available stock" on the product card actually moves after checkout.
  try{
    await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({items:items.map(x=>({product:P[x.id].n,qty:x.q}))})});
    loadStockTotals();
  }catch(e){ /* stock totals just won't refresh immediately */ }
}

async function loadCities(){
  try{
    const res=await fetch('/api/meta');
    if(!res.ok)throw new Error('meta fetch failed');
    const meta=await res.json();
    CITIES=meta.areas;
  }catch(e){
    CITIES=[
      {code:'RAJ',name:'Jaipur',pincode:'302001',climate_zone:'Hot'},
      {code:'DEL',name:'Delhi',pincode:'110001',climate_zone:'Hot'},
      {code:'BLR',name:'Bengaluru',pincode:'560001',climate_zone:'Moderate'},
      {code:'PUN',name:'Pune',pincode:'411001',climate_zone:'Moderate'},
      {code:'SHM',name:'Shimla',pincode:'171001',climate_zone:'Cold'},
    ];
  }
  const sel=$('#pCity');
  if(sel)sel.innerHTML='<option value="">Select a city…</option>'+CITIES.map(c=>`<option value="${c.pincode}">${c.name} (${c.climate_zone})</option>`).join('');
  renderProfile();renderGrid();
}

function renderProfile(){
  const f=load('seasonmart_profile',{});
  const city=CITIES.find(c=>c.pincode===f.pin);
  $('#locTxt').textContent=city?city.name:'Set location';
  if($('#pCity'))$('#pCity').value=f.pin||'';
  if($('#seasonSel'))$('#seasonSel').value=f.season||'summer';
  updateProfileInfo();
}

// Name/state/zone shown in the deliver-to dialog are informational only —
// they follow the selected city but don't feed into any routing logic.
function updateProfileInfo(){
  const code=$('#pCity')?.value||'';
  const city=CITIES.find(c=>c.pincode===code);
  if($('#pState'))$('#pState').textContent=city?(CITY_STATE[city.code]||'—'):'—';
  if($('#pZoneTxt'))$('#pZoneTxt').textContent=city?city.climate_zone:'—';
}
const currentSeason=()=>load('seasonmart_profile',{}).season||'summer';

function renderTabs(){
  $('#tabs').innerHTML=CAT_ORDER.map(k=>`<button data-cat="${k}"${k==='open'?' class="hot"':''}>${CAT_LABEL[k]}</button>`).join('');
}

function resetReturnDialog(){
  retStep='review';chosenResolution=null;
  $('#resolveStep').hidden=true;$('#resErr').hidden=true;
  document.querySelectorAll('.resolve-opt').forEach(b=>b.classList.remove('on'));
  $('#retSubmitBtn').disabled=false;$('#retSubmitBtn').textContent='Submit return';
}

// Theme — respects prefers-color-scheme on first load, then user's choice.
function applyTheme(mode){
  document.documentElement.dataset.theme=mode;
  const btn=$('#themeBtn');
  if(btn)btn.textContent=mode==='dark'?'☀️ Light':'🌙 Dark';
}
function initTheme(){
  const saved=localStorage.getItem('seasonmart_theme');
  if(saved){applyTheme(saved);return}
  applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
}
function toggleTheme(){
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  localStorage.setItem('seasonmart_theme',next);
  applyTheme(next);
}

document.addEventListener('click',e=>{
  const t=e.target.closest('button')||e.target,d=t.dataset||{};
  if(d.cat){cat=d.cat;query='';$('#q').value='';renderGrid();return}
  if(d.close!==undefined)t.closest('dialog').close();
  if(d.add){addCart(+d.add);toast('Added to cart.')}
  if(d.buy){placeOrder([{id:+d.buy,q:1}])}
  if(d.search){searchBrandCenters(+d.search,t)}
  if(d.inc)addCart(+d.inc);
  if(d.dec)addCart(+d.dec,-1);
  if(d.rm){save('seasonmart_cart',cart().filter(i=>i.id!==+d.rm));renderCart();renderGrid()}
  if(t.hasAttribute&&t.hasAttribute('data-place')){placeOrder(cart());save('seasonmart_cart',[]);renderCart();renderGrid();$('#cartDlg').close()}
  if(t.hasAttribute&&t.hasAttribute('data-clear-cart')){
    if(cart().length&&confirm('Empty your cart?')){save('seasonmart_cart',[]);renderCart();renderGrid();toast('Cart cleared.')}
  }
  if(t.hasAttribute&&t.hasAttribute('data-clear-orders')){
    if(confirm('Clear all orders and return history? This cannot be undone.')){
      localStorage.removeItem('seasonmart_orders');localStorage.removeItem('seasonmart_returns');
      renderOrders();toast('Orders and returns cleared.');
    }
  }
  if(d.ret){
    retId=+d.ret;chip='';const x=load('seasonmart_orders',[]).find(o=>o.uid===retId);
    $('#rItem').textContent=x.n;$('#reason').value='';$('#err').hidden=true;
    $('#chips').innerHTML=REASONS.map(r=>`<button type="button" class="chip">${r}</button>`).join('');
    resetReturnDialog();
    $('#ordDlg').close();$('#retDlg').showModal();
  }
  if(t.classList&&t.classList.contains('chip')){
    chip=t.textContent;document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===t));
    const r=$('#reason'),gen=REASON_TEXT[chip];
    r.value=gen?gen($('#rItem').textContent):chip+'. ';
    r.focus();
  }
  if(d.res){
    chosenResolution=d.res;
    document.querySelectorAll('.resolve-opt').forEach(b=>b.classList.toggle('on',b===t));
    $('#resErr').hidden=true;
  }
});
$('#cartBtn').onclick=()=>{renderCart();$('#cartDlg').showModal()};
$('#ordBtn').onclick=()=>{renderOrders();$('#ordDlg').showModal()};
$('#locBtn').onclick=()=>{renderProfile();$('#profDlg').showModal()};
$('#themeBtn').onclick=toggleTheme;
$('#pCity').onchange=updateProfileInfo;
$('#searchForm').onsubmit=e=>{e.preventDefault();query=$('#q').value.trim().toLowerCase();cat='all';renderGrid()};
$('#seasonSel').onchange=e=>{
  save('seasonmart_profile',{...load('seasonmart_profile',{}),season:e.target.value});
  toast(`Season set to ${e.target.options[e.target.selectedIndex].text}.`);
  loadAds();
};

$('#profForm').onsubmit=e=>{
  e.preventDefault();
  save('seasonmart_profile',{...load('seasonmart_profile',{}),pin:$('#pCity').value});
  renderProfile();renderGrid();$('#profDlg').close();toast('Delivery location saved.');
  loadCityStock();loadAds();
};

function finalizeReturn(text){
  const o=load('seasonmart_orders',[]),x=o.find(i=>i.uid===retId);
  x.returned=true;save('seasonmart_orders',o);
  const r=load('seasonmart_returns',[]);
  r.push({returnId:'R'+Date.now(),orderUid:x.uid,product:x.n,cat:x.cat,cl:x.cl,season:currentSeason(),category:chip,reasonText:text,pincode:(load('seasonmart_profile',{}).pin||''),resolution:chosenResolution,at:new Date().toISOString()});
  save('seasonmart_returns',r);
  // Hand the return off to LocalMesh. The customer's own selected "current
  // season" (header picker) is sent as-is — it's their stated context, not
  // a guess. Climate fit itself still uses the catalog's per-item
  // suited_climates below, so routing accuracy doesn't depend on season.
  fetch('/api/returns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    product:x.n,
    season:currentSeason(),
    pincode:(load('seasonmart_profile',{}).pin||''),
    review_text:text,
    preferred_resolution:chosenResolution,
    suited_climates:CL_ZONES[x.cl||'HMC'],
  })}).catch(()=>{});
  $('#retDlg').close();
  toast(chosenResolution?`Return requested — ${chosenResolution} will be processed.`:'Return requested. We will arrange a pickup within 2 days.');
  resetReturnDialog();
}

$('#retForm').onsubmit=async e=>{
  e.preventDefault();
  const text=$('#reason').value.trim();
  if(text.length<10){$('#err').hidden=false;return}
  $('#err').hidden=true;

  if(retStep==='review'){
    $('#retSubmitBtn').disabled=true;$('#retSubmitBtn').textContent='Checking…';
    let label='personal_dissatisfaction';
    try{
      const res=await fetch('/api/classify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({review_text:text})});
      if(res.ok){const data=await res.json();label=data.label}
    }catch(err){}
    $('#retSubmitBtn').disabled=false;

    if(label==='hardware_defect'){
      retStep='resolve';
      $('#resolveStep').hidden=false;
      $('#retSubmitBtn').textContent='Confirm return';
      $('#resolveStep').scrollIntoView({behavior:'smooth',block:'nearest'});
      return;
    }
    $('#retSubmitBtn').textContent='Submit return';
  }else if(retStep==='resolve'&&!chosenResolution){
    $('#resErr').hidden=false;
    return;
  }

  finalizeReturn(text);
};

initTheme();
renderTabs();
renderGrid();renderCart();renderProfile();
loadCities().then(()=>{loadCityStock();loadAds()});
loadLocalStock();loadStockTotals();
setInterval(loadLocalStock,8000);
setInterval(loadStockTotals,8000);
