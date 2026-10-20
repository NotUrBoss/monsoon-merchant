/* Monsoon Merchant — one company ledger for captains, manufacturing and logistics. */
(function (root) {
  'use strict';
  const VERSION = 2;
  const SEASON_DAYS = 60;
  const INITIAL_CASH = 500000;
  const COSTS = Object.freeze({ warehouse:70000, warehouseUpgrade:45000, factory:90000, laneUpgrade:55000, warehouseUpkeep:220, factoryUpkeep:300 });
  const HUBS = {
    klang:{name:'Port Klang',region:'Southeast Asia',lat:3.0,lon:101.4},
    singapore:{name:'Singapore',region:'Southeast Asia',lat:1.3,lon:103.8},
    bangkok:{name:'Bangkok',region:'Southeast Asia',lat:13.7,lon:100.5},
    hcmc:{name:'Ho Chi Minh City',region:'Southeast Asia',lat:10.8,lon:106.7},
    haiphong:{name:'Haiphong',region:'Southeast Asia',lat:20.9,lon:106.7},
    jakarta:{name:'Jakarta',region:'Southeast Asia',lat:-6.2,lon:106.8},
    shenzhen:{name:'Shenzhen',region:'East Asia',lat:22.5,lon:114.1},
    shanghai:{name:'Shanghai',region:'East Asia',lat:31.2,lon:121.5},
    tokyo:{name:'Tokyo',region:'East Asia',lat:35.7,lon:139.7},
    mumbai:{name:'Mumbai',region:'Indian Ocean',lat:19.0,lon:72.8},
    kolkata:{name:'Kolkata',region:'Indian Ocean',lat:22.6,lon:88.4},
    colombo:{name:'Colombo',region:'Indian Ocean',lat:6.9,lon:79.9},
    dubai:{name:'Dubai',region:'Middle East',lat:25.2,lon:55.3},
    sydney:{name:'Sydney',region:'Australia',lat:-33.9,lon:151.2}
  };
  const GOODS = {
    rice:{name:'Rice',base:1200},palm:{name:'Palm oil',base:2400},rubber:{name:'Rubber',base:4200},
    steel:{name:'Steel',base:2600},coffee:{name:'Coffee',base:9000},electronics:{name:'Electronics',base:18000},
    coal:{name:'Coal',base:600},cotton:{name:'Cotton',base:3000},textiles:{name:'Textiles',base:5200},
    food:{name:'Packaged food',base:2300},machinery:{name:'Machinery',base:39000},fertilizer:{name:'Fertilizer',base:1800}
  };
  const TRANSPORTS = {
    sea:{name:'Cargo ship',capacity:120,speed:650,baseCost:1800,perKm:0.3,perTonneKm:0.018},
    rail:{name:'Freight train',capacity:100,speed:900,baseCost:900,perKm:0.18,perTonneKm:0.014},
    air:{name:'Cargo plane',capacity:25,speed:7000,baseCost:7000,perKm:0.7,perTonneKm:0.2}
  };
  // These are represented freight corridors with terminal transfers included in the quote.
  // No route can cross an ocean by rail.
  const RAIL_LINKS = [['klang','bangkok'],['hcmc','haiphong'],['haiphong','shenzhen'],['shenzhen','shanghai'],['mumbai','kolkata']];
  const RECIPES = {
    textiles:{name:'Textile mill',inputs:{cotton:2},output:{textiles:2},days:3,cost:900,maxBatches:10},
    food:{name:'Food processor',inputs:{rice:2,palm:1},output:{food:3},days:2,cost:650,maxBatches:10},
    electronics:{name:'Electronics assembly',inputs:{steel:1,rubber:1},output:{electronics:1},days:4,cost:2500,maxBatches:10},
    machinery:{name:'Machinery works',inputs:{steel:3,electronics:1},output:{machinery:1},days:5,cost:4500,maxBatches:10}
  };
  const PROFILES = {
    klang:{palm:0.69,rubber:0.79,electronics:1.08},singapore:{food:1.25,coal:1.2,electronics:1.04},
    bangkok:{rice:0.72,rubber:0.76,food:0.9},hcmc:{coffee:0.73,rice:0.79,steel:1.2},
    haiphong:{steel:1.17,coal:0.83,machinery:1.16},jakarta:{coal:0.68,palm:0.74,rice:1.15},
    shenzhen:{electronics:0.72,steel:0.87,rubber:1.3},shanghai:{steel:0.76,machinery:0.8,cotton:1.2},
    tokyo:{food:1.35,coffee:1.28,machinery:0.91,electronics:0.87},
    mumbai:{cotton:0.68,textiles:0.81,fertilizer:1.17},kolkata:{cotton:0.78,rice:0.81,coal:0.82},
    colombo:{textiles:1.21,food:1.18,coffee:1.08},dubai:{food:1.44,textiles:1.35,fertilizer:0.75,steel:1.24},
    sydney:{coal:0.72,cotton:0.85,food:1.23,machinery:1.25}
  };
  // Reuse the captain game's ship catalog; the unified company has one economy.
  const Classic = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.MM;
  const FLEET = Object.fromEntries(['coaster','freighter','feeder'].map(id => {
    const ship=Classic.SHIPS[id];
    return [id,{name:ship.name,capacity:ship.cap,speed:ship.speed,cost:ship.price,daily:ship.daily}];
  }));
  const CREDIT_LIMIT=150000;
  const ORDERS = {
    straits:{name:'Straits starter order',hub:'singapore',good:'palm',qty:20,payment:52000,deadline:15},
    pantry:{name:'Singapore pantry supply',hub:'singapore',good:'food',qty:30,payment:110000,deadline:30},
    fabrics:{name:'Colombo textile order',hub:'colombo',good:'textiles',qty:20,payment:150000,deadline:45},
    works:{name:'Sydney machinery order',hub:'sydney',good:'machinery',qty:5,payment:280000,deadline:59}
  };
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  const whole = (n,min=0,max=1e12) => Number.isSafeInteger(n) && n >= min && n <= max;
  const record = o => !!o && typeof o === 'object' && !Array.isArray(o) && [Object.prototype,null].includes(Object.getPrototypeOf(o));
  const keysOnly = (o,allowed) => record(o) && Object.keys(o).every(k => allowed.includes(k));
  const fail = error => ({ok:false,error});
  const sum = o => Object.values(o).reduce((a,b) => a+b,0);
  const inventory = () => Object.fromEntries(Object.keys(GOODS).map(g => [g,0]));
  function hash(str) { let h = 2166136261; for (let i=0;i<str.length;i++) h=Math.imul(h ^ str.charCodeAt(i),16777619); return h >>> 0; }
  function fraction(str) { return hash(str) / 4294967296; }
  function resetMarket(s) { s.market = Object.fromEntries(Object.keys(HUBS).map(h => [h,Object.fromEntries(Object.keys(GOODS).map(g => [g,80+hash(`${s.seed}|stock|${s.day}|${h}|${g}`)%141]))])); }
  function log(s,text) { s.history.unshift({day:s.day,text}); s.history.length=Math.min(s.history.length,40); }
  function active(s) { const v=validate(s); if(!v.ok)return v; return s.status === 'active' ? {ok:true} : fail('This company season has ended. Start a new company to continue.'); }
  function create(seed='network', withCaptain=false) {
    seed=String(seed).slice(0,100) || 'network';
    const s={version:VERSION,seed,day:1,status:'active',cash:INITIAL_CASH,debt:0,home:'klang',laneLimit:3,nextId:1,
      warehouses:{klang:{level:1,capacity:160,stock:inventory()}},factories:{},shipments:[],production:[],market:{},history:[],stats:{trades:0,shipments:0,produced:0,upkeep:0},result:null,captain:withCaptain?newCaptain():null};
    resetMarket(s); log(s,'Company founded in Port Klang. Source cargo, manufacture, then deliver by your own ship or chartered freight.'); return s;
  }
  function prices(s,hub) {
    if (!own(HUBS,hub)) return {};
    return Object.fromEntries(Object.keys(GOODS).map(g => {
      const wave=(fraction(`${s.seed}|price|${Math.floor((s.day-1)/3)}|${hub}|${g}`)-0.5)*0.14;
      const center=GOODS[g].base*(PROFILES[hub][g] || 1)*(1+wave);
      return [g,{buy:Math.ceil(center*1.06),sell:Math.floor(center*0.94),available:s.market[hub][g]}];
    }));
  }
  function warehouseUsage(s,hub) {
    const w=own(HUBS,hub)&&own(s.warehouses,hub)?s.warehouses[hub]:null; if (!w) return {stock:0,reserved:0,used:0,capacity:0,free:0};
    const stock=sum(w.stock),reserved=(s.captain?.voyage?.to===hub?sum(s.captain.cargo):0)+s.shipments.filter(j=>j.to===hub).reduce((n,j)=>n+j.qty,0)+s.production.filter(j=>j.hub===hub).reduce((n,j)=>n+sum(j.output),0);
    return {stock,reserved,used:stock+reserved,capacity:w.capacity,free:w.capacity-stock-reserved};
  }
  function quoteTrade(s,hub,good,qty,side) {
    const a=active(s); if(!a.ok) return a;
    if(!own(HUBS,hub)||!own(GOODS,good)||!['buy','sell'].includes(side)) return fail('Choose a valid hub, product and trade direction.');
    if(!whole(qty,1,100000)) return fail('Enter a positive whole number of tonnes.');
    const w=s.warehouses[hub]; if(!w) return fail('Build a warehouse at this hub before trading.');
    const p=prices(s,hub)[good],unitPrice=p[side],cost=unitPrice*qty;
    if(side==='buy') {
      if(qty>p.available) return fail('The local market does not have that much stock today.');
      if(qty>warehouseUsage(s,hub).free) return fail('Not enough warehouse space. Incoming cargo and production reserve space.');
      if(cost>s.cash) return fail('Not enough cash for this purchase.');
    } else {
      if(qty>w.stock[good]) return fail('Not enough stock in this warehouse.');
      if(!whole(s.cash+Math.max(0,cost-s.debt))) return fail('Company cash would exceed the supported amount.');
      if(s.market[hub][good]+qty>100000) return fail('The local market cannot accept more cargo today.');
    }
    if(!whole(s.stats.trades+1))return fail('Trade counter exceeds the supported amount.');
    return {ok:true,cost,unitPrice,qty,side};
  }
  function receive(s,amount) { const repayment=Math.min(s.debt,amount);s.debt-=repayment;s.cash+=amount-repayment; }
  function trade(s,hub,good,qty,side) {
    const q=quoteTrade(s,hub,good,qty,side); if(!q.ok)return q;
    const d=side==='buy'?1:-1; s.warehouses[hub].stock[good]+=d*qty; s.market[hub][good]-=d*qty;
    if(side==='buy')s.cash-=q.cost;else receive(s,q.cost);
    s.stats.trades++; log(s,`${side==='buy'?'Bought':'Sold'} ${qty} t ${GOODS[good].name} in ${HUBS[hub].name}.`); return q;
  }
  function distance(from,to) {
    const a=HUBS[from],b=HUBS[to],r=Math.PI/180,dp=(b.lat-a.lat)*r,dl=(b.lon-a.lon)*r;
    const x=Math.sin(dp/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dl/2)**2;
    return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  }
  function quoteShipment(s,from,to,mode,good,qty) {
    const a=active(s); if(!a.ok)return a;
    if(!own(HUBS,from)||!own(HUBS,to)||from===to||!own(TRANSPORTS,mode)||!own(GOODS,good)) return fail('Choose two different hubs, a transport mode and product.');
    if(!whole(qty,1,100000))return fail('Enter a positive whole number of tonnes.');
    if(!s.warehouses[from]||!s.warehouses[to])return fail('A warehouse is required at both ends of the route.');
    if(mode==='rail'&&!RAIL_LINKS.some(p=>p.includes(from)&&p.includes(to)))return fail('No rail freight corridor connects these hubs. Choose sea or air.');
    const t=TRANSPORTS[mode]; if(qty>t.capacity)return fail(`${t.name} capacity is ${t.capacity} t per shipment.`);
    if(!whole(s.nextId+1,1,1e9))return fail('Company job counter exceeds the supported amount.');
    if(s.shipments.length>=s.laneLimit)return fail('All shipment slots are busy. Advance a day or upgrade your dispatch office.');
    if(s.warehouses[from].stock[good]<qty)return fail('Not enough stock at the departure warehouse.');
    if(warehouseUsage(s,to).free<qty)return fail('The destination warehouse has insufficient unreserved space.');
    const km=Math.ceil(distance(from,to)*(mode==='sea'?1.2:mode==='rail'?1.25:1.05));
    const days=Math.max(1,Math.ceil(km/t.speed))+(mode==='sea'?1:0),arrivalDay=s.day+days;
    const cost=Math.ceil(t.baseCost+km*t.perKm+qty*km*t.perTonneKm);
    if(arrivalDay>SEASON_DAYS)return fail('This shipment would arrive after day 60. Choose a faster mode or sell locally.');
    if(cost>s.cash)return fail('Not enough cash to pay freight before departure.');
    return {ok:true,cost,days,distance:km,arrivalDay,qty};
  }
  function dispatch(s,from,to,mode,good,qty) {
    const q=quoteShipment(s,from,to,mode,good,qty);if(!q.ok)return q;
    const shipment={id:s.nextId++,from,to,mode,good,qty,cost:q.cost,departDay:s.day,arrivalDay:q.arrivalDay};
    s.cash-=q.cost;s.warehouses[from].stock[good]-=qty;s.shipments.push(shipment);
    log(s,`Dispatched ${qty} t ${GOODS[good].name} to ${HUBS[to].name}; arrives day ${q.arrivalDay}.`);return {...q,shipment};
  }
  function buildWarehouse(s,hub) {
    const a=active(s);if(!a.ok)return a;
    if(!own(HUBS,hub))return fail('Choose a valid hub.');
    if(s.warehouses[hub])return fail('This hub already has a warehouse.');
    if(s.cash<COSTS.warehouse)return fail('Not enough cash to build a warehouse.');
    s.cash-=COSTS.warehouse;s.warehouses[hub]={level:1,capacity:160,stock:inventory()};log(s,`Opened a warehouse in ${HUBS[hub].name}.`);return {ok:true,cost:COSTS.warehouse};
  }
  function warehouseMaxLevel(s){return s.captain ? 10 : 3;}
  function upgradeWarehouse(s,hub) {
    const a=active(s);if(!a.ok)return a;if(!own(HUBS,hub))return fail('Choose a valid hub.');const w=s.warehouses[hub];
    if(!w)return fail('Build a warehouse at this hub first.');
    if(w.level>=warehouseMaxLevel(s))return fail('This warehouse is already at maximum capacity.');
    if(s.cash<COSTS.warehouseUpgrade)return fail('Not enough cash to expand the warehouse.');
    s.cash-=COSTS.warehouseUpgrade;w.level++;w.capacity+=120;log(s,`Expanded ${HUBS[hub].name} warehouse to ${w.capacity} t.`);return {ok:true,cost:COSTS.warehouseUpgrade};
  }
  function upgradeLanes(s) {
    const a=active(s);if(!a.ok)return a;
    if(s.laneLimit===6)return fail('Your dispatch office already has six shipment slots.');
    if(s.cash<COSTS.laneUpgrade)return fail('Not enough cash to upgrade your dispatch office.');
    s.cash-=COSTS.laneUpgrade;s.laneLimit=6;log(s,'Dispatch office expanded to six parallel shipment slots.');return {ok:true,cost:COSTS.laneUpgrade};
  }
  function buildFactory(s,hub,recipeId) {
    const a=active(s);if(!a.ok)return a;
    if(!own(HUBS,hub)||!own(RECIPES,recipeId))return fail('Choose a valid hub and factory type.');
    if(!s.warehouses[hub])return fail('A factory needs a local warehouse.');
    if(s.factories[hub])return fail('This hub already has a specialized factory.');
    if(s.cash<COSTS.factory)return fail('Not enough cash to build a factory.');
    s.cash-=COSTS.factory;s.factories[hub]={recipeId};log(s,`Opened ${RECIPES[recipeId].name} in ${HUBS[hub].name}.`);return {ok:true,cost:COSTS.factory};
  }
  function quoteProduction(s,hub,recipeId,batches) {
    const a=active(s);if(!a.ok)return a;
    if(!own(HUBS,hub)||!own(RECIPES,recipeId))return fail('Choose a valid hub and recipe.');
    if(!whole(batches,1,RECIPES[recipeId].maxBatches))return fail(`Enter 1–${RECIPES[recipeId].maxBatches} whole batches per factory job.`);
    if(!whole(s.nextId+1,1,1e9))return fail('Company job counter exceeds the supported amount.');
    if(!s.factories[hub]||s.factories[hub].recipeId!==recipeId)return fail('Build the matching specialized factory at this hub first.');
    if(s.production.some(j=>j.hub===hub))return fail('This factory is already producing. Advance a day to make progress.');
    const recipe=RECIPES[recipeId],inputs=Object.fromEntries(Object.entries(recipe.inputs).map(([g,n])=>[g,n*batches])),output=Object.fromEntries(Object.entries(recipe.output).map(([g,n])=>[g,n*batches]));
    const cost=recipe.cost*batches,days=recipe.days+Math.floor((batches-1)/10),finishDay=s.day+days;
    if(Object.entries(inputs).some(([g,n])=>s.warehouses[hub].stock[g]<n))return fail('The local warehouse is missing manufacturing inputs.');
    if(warehouseUsage(s,hub).free+sum(inputs)<sum(output))return fail('Not enough warehouse space to reserve the finished goods.');
    if(finishDay>SEASON_DAYS)return fail('This batch would finish after day 60. Sell the inputs or choose a shorter recipe at another factory.');
    if(cost>s.cash)return fail('Not enough cash to fund production.');
    return {ok:true,cost,days,finishDay,inputs,output};
  }
  function startProduction(s,hub,recipeId,batches) {
    const q=quoteProduction(s,hub,recipeId,batches);if(!q.ok)return q;
    for(const [g,n]of Object.entries(q.inputs))s.warehouses[hub].stock[g]-=n;
    s.cash-=q.cost;const job={id:s.nextId++,hub,recipeId,batches,cost:q.cost,startDay:s.day,finishDay:q.finishDay,output:{...q.output}};
    s.production.push(job);log(s,`Started ${batches} ${RECIPES[recipeId].name} batches; finishes day ${q.finishDay}.`);return {...q,job};
  }
  function netWorth(s) {
    let value=s.cash-s.debt;
    if(s.captain){
      const c=s.captain,p=prices(s,c.voyage?c.voyage.to:c.port);
      value+=shipValue(c)+Object.entries(c.cargo).reduce((n,[g,q])=>n+p[g].sell*q,0);
    }
    for(const [hub,w]of Object.entries(s.warehouses)) { const p=prices(s,hub);value+=sum(Object.fromEntries(Object.entries(w.stock).map(([g,n])=>[g,p[g].sell*n])));value+=Math.floor((COSTS.warehouse+(w.level-1)*COSTS.warehouseUpgrade)*0.6); }
    value+=Object.keys(s.factories).length*Math.floor(COSTS.factory*0.5)+(s.laneLimit===6?Math.floor(COSTS.laneUpgrade*0.5):0);
    for(const j of s.shipments)value+=prices(s,j.to)[j.good].sell*j.qty;
    // Work in progress is valued at its consumed inputs, never the yet-unearned finished output.
    for(const j of s.production)for(const [g,n]of Object.entries(RECIPES[j.recipeId].inputs))value+=prices(s,j.hub)[g].sell*n*j.batches;
    return Math.round(value);
  }
  const INITIAL_NET_WORTH = INITIAL_CASH+Math.floor(COSTS.warehouse*0.6);
  function advanceDay(s) {
    const a=active(s);if(!a.ok)return a;
    const nextUpkeep=dailyUpkeep(s);
    const arrivals=s.shipments.filter(j=>j.arrivalDay===s.day+1).length;
    const output=s.production.filter(j=>j.finishDay===s.day+1).reduce((n,j)=>n+sum(j.output),0);
    if(s.captain?.voyage?.arrivalDay===s.day+1 && (!whole(s.captain.voyages+1)||!whole(s.captain.transported+sum(s.captain.cargo))))return fail('Captain statistics exceed the supported amount.');
    if(!whole(s.debt+Math.max(0,nextUpkeep-s.cash))||!whole(s.stats.upkeep+nextUpkeep)||!whole(s.stats.shipments+arrivals)||!whole(s.stats.produced+output))return fail('Company accounting exceeds the supported amount.');
    s.day++;const events=[];
    const captain=s.captain;
    if(captain?.voyage && captain.voyage.arrivalDay===s.day){
      const v=captain.voyage,tonnes=sum(captain.cargo);
      for(const [g,n] of Object.entries(captain.cargo))s.warehouses[v.to].stock[g]+=n;
      captain.cargo=inventory();captain.port=v.to;captain.voyage=null;
      captain.hull=Math.max(0,captain.hull-v.damage);captain.voyages++;captain.transported+=tonnes;
      events.push(`Captain arrived in ${HUBS[v.to].name}. ${tonnes} t unloaded; hull ${captain.hull}%.`);
    }
    if(captain)for(const [id,order]of Object.entries(ORDERS)){
      if(captain.orders[id]==='open'&&s.day>order.deadline){captain.orders[id]='expired';events.push(`${order.name} expired; no penalty.`);}
    }
    const arriving=s.shipments.filter(j=>j.arrivalDay<=s.day);s.shipments=s.shipments.filter(j=>j.arrivalDay>s.day);
    for(const j of arriving){s.warehouses[j.to].stock[j.good]+=j.qty;s.stats.shipments++;events.push(`${j.qty} t ${GOODS[j.good].name} arrived in ${HUBS[j.to].name}.`);}
    const completed=s.production.filter(j=>j.finishDay<=s.day);s.production=s.production.filter(j=>j.finishDay>s.day);
    for(const j of completed){for(const [g,n]of Object.entries(j.output))s.warehouses[j.hub].stock[g]+=n;s.stats.produced+=sum(j.output);events.push(`${RECIPES[j.recipeId].name} completed in ${HUBS[j.hub].name}.`);}
    const upkeep=nextUpkeep;
    const paid=Math.min(s.cash,upkeep);s.cash-=paid;s.debt+=upkeep-paid;s.stats.upkeep+=upkeep;
    resetMarket(s);for(const text of events)log(s,text);
    if(s.day===SEASON_DAYS){s.status='finished';const value=netWorth(s),profit=value-INITIAL_NET_WORTH; s.result={netWorth:value,profit,rank:profit>=500000?'Global operator':profit>=150000?'Regional builder':profit>0?'Growing company':'Learning season',shipments:s.stats.shipments,produced:s.stats.produced};log(s,`Day 60: company valued at RM ${value}. Cargo and facilities are included; debt is deducted.`);}
    return {ok:true,events,finished:s.status==='finished',upkeep};
  }
  function validate(s,legacy=false) {
    try {
      const top=['version','seed','day','status','cash','debt','home','laneLimit','nextId','warehouses','factories','shipments','production','market','history','stats','result'];
      if(!legacy)top.push('captain');
      if(!keysOnly(s,top)||Object.keys(s).length!==top.length||s.version!==(legacy?1:VERSION))return fail('Unsupported or malformed company save version.');
      if(typeof s.seed!=='string'||s.seed.length<1||s.seed.length>100||!whole(s.day,1,60)||!['active','finished'].includes(s.status)||((s.status==='finished')!==(s.day===60)))return fail('Invalid company calendar.');
      if(!whole(s.cash)||!whole(s.debt)||s.home!=='klang'||![3,6].includes(s.laneLimit)||!whole(s.nextId,1,1e9))return fail('Invalid company finances or dispatch office.');
      if(!record(s.warehouses)||!own(s.warehouses,'klang')||Object.keys(s.warehouses).some(h=>!own(HUBS,h)))return fail('Invalid warehouse network.');
      for(const w of Object.values(s.warehouses)){
        if(!keysOnly(w,['level','capacity','stock'])||!whole(w.level,1,warehouseMaxLevel(s))||w.capacity!==160+(w.level-1)*120||!keysOnly(w.stock,Object.keys(GOODS))||Object.keys(w.stock).length!==Object.keys(GOODS).length||Object.values(w.stock).some(n=>!whole(n,0,w.capacity)))return fail('Invalid warehouse stock or capacity.');
      }
      if(!record(s.factories)||Object.entries(s.factories).some(([h,f])=>!own(s.warehouses,h)||!keysOnly(f,['recipeId'])||!own(RECIPES,f.recipeId)))return fail('Invalid factory network.');
      if(!record(s.market)||Object.keys(s.market).length!==Object.keys(HUBS).length||Object.entries(s.market).some(([h,m])=>!own(HUBS,h)||!keysOnly(m,Object.keys(GOODS))||Object.keys(m).length!==Object.keys(GOODS).length||Object.values(m).some(n=>!whole(n,0,100000))))return fail('Invalid local market.');
      if(!Array.isArray(s.shipments)||s.shipments.length>s.laneLimit||!Array.isArray(s.production)||s.production.length>Object.keys(s.factories).length)return fail('Invalid shipment or production list.');
      const ids=new Set();
      function validId(j){if(!whole(j.id,1,s.nextId-1)||ids.has(j.id))return false;ids.add(j.id);return true;}
      for(const j of s.shipments){
        if(!keysOnly(j,['id','from','to','mode','good','qty','cost','departDay','arrivalDay'])||!validId(j)||!own(s.warehouses,j.from)||!own(s.warehouses,j.to)||j.from===j.to||!own(TRANSPORTS,j.mode)||!own(GOODS,j.good)||!whole(j.qty,1,TRANSPORTS[j.mode].capacity)||!whole(j.cost,1)||!whole(j.departDay,1,s.day)||!whole(j.arrivalDay,s.day+1,60))return fail('Invalid active shipment.');
        if(j.mode==='rail'&&!RAIL_LINKS.some(p=>p.includes(j.from)&&p.includes(j.to)))return fail('Invalid rail corridor in saved shipment.');
        const t=TRANSPORTS[j.mode],km=Math.ceil(distance(j.from,j.to)*(j.mode==='sea'?1.2:j.mode==='rail'?1.25:1.05));
        if(j.arrivalDay!==j.departDay+Math.max(1,Math.ceil(km/t.speed))+(j.mode==='sea'?1:0)||j.cost!==Math.ceil(t.baseCost+km*t.perKm+j.qty*km*t.perTonneKm))return fail('Shipment timing or freight cost is invalid.');
      }
      const factories=new Set();
      for(const j of s.production){
        if(!keysOnly(j,['id','hub','recipeId','batches','cost','startDay','finishDay','output'])||!validId(j)||!own(s.factories,j.hub)||factories.has(j.hub)||s.factories[j.hub].recipeId!==j.recipeId||!whole(j.batches,1,RECIPES[j.recipeId].maxBatches)||!whole(j.startDay,1,s.day)||!whole(j.finishDay,s.day+1,60))return fail('Invalid active production batch.');
        factories.add(j.hub);const r=RECIPES[j.recipeId];
        if(j.cost!==r.cost*j.batches||j.finishDay!==j.startDay+r.days+Math.floor((j.batches-1)/10)||!keysOnly(j.output,Object.keys(r.output))||Object.keys(j.output).length!==Object.keys(r.output).length||Object.entries(r.output).some(([g,n])=>j.output[g]!==n*j.batches))return fail('Invalid production inputs, output or timing.');
      }
      if(!legacy){const cv=validateCaptain(s);if(!cv.ok)return cv;}
      for(const hub of Object.keys(s.warehouses))if(warehouseUsage(s,hub).used>s.warehouses[hub].capacity)return fail('Stored and reserved cargo exceeds warehouse capacity.');
      if(!keysOnly(s.stats,['trades','shipments','produced','upkeep'])||Object.keys(s.stats).length!==4||Object.values(s.stats).some(n=>!whole(n)))return fail('Invalid company statistics.');
      if(!Array.isArray(s.history)||s.history.length>40||s.history.some(e=>!keysOnly(e,['day','text'])||!whole(e.day,1,s.day)||typeof e.text!=='string'||e.text.length>300))return fail('Invalid company history.');
      if(s.status==='active'&&s.result!==null)return fail('An active company cannot have final results.');
      if(s.status==='finished'){
        if(s.captain?.voyage||s.shipments.length||s.production.length||!keysOnly(s.result,['netWorth','profit','rank','shipments','produced'])||s.result.netWorth!==netWorth(s)||s.result.profit!==s.result.netWorth-INITIAL_NET_WORTH||typeof s.result.rank!=='string'||s.result.rank.length>60||s.result.shipments!==s.stats.shipments||s.result.produced!==s.stats.produced)return fail('Invalid final company settlement.');
      }
      return {ok:true};
    }catch(_){return fail('Malformed company save.');}
  }
  function serialize(s){const v=validate(s);if(!v.ok)throw new Error(v.error);return JSON.stringify(s);}
  function deserialize(text){if(typeof text!=='string'||text.length>1000000)return fail('Company backup is too large or is not text.');try{const s=JSON.parse(text);if(s?.version===1){const legacy=validate(s,true);if(!legacy.ok)return legacy;s.version=VERSION;s.captain=null;}const v=validate(s);return v.ok?{ok:true,state:s}:v;}catch(_){return fail('Company backup is not valid JSON.');}}

  /* Captain, contracts and finance commands all use the company cash, stock and clock.
     Each command validates before mutation. Cargo is in exactly one location: a
     warehouse, charter, factory work-in-progress, or the captain's hold. */
  function newCaptain(){return {ship:'coaster',port:'klang',hull:100,cargo:inventory(),voyage:null,voyages:0,transported:0,insured:false,orders:Object.fromEntries(Object.keys(ORDERS).map(id=>[id,'open']))};}
  function enableCaptain(s){
    const a=active(s);if(!a.ok)return a;if(s.captain)return fail('Your captain is already part of this company.');
    s.captain=newCaptain();for(const [id,o]of Object.entries(ORDERS))if(s.day>o.deadline)s.captain.orders[id]='expired';
    log(s,'Captain joined the company with a starter coaster. One cash balance, inventory network and calendar.');return {ok:true};
  }
  function shipValue(c){return Math.floor(FLEET[c.ship].cost*0.5*c.hull/100);}
  function dailyUpkeep(s){return Object.keys(s.warehouses).length*COSTS.warehouseUpkeep+Object.keys(s.factories).length*COSTS.factoryUpkeep+(s.captain?Math.ceil(s.debt*0.005):0);}
  function captainReady(s){const a=active(s);if(!a.ok)return a;if(!s.captain)return fail('Enable the captain bridge first.');if(s.captain.voyage)return fail('Your captain is at sea. Advance the shared day until arrival.');return {ok:true};}
  function quoteTransfer(s,good,qty,direction){
    const a=captainReady(s);if(!a.ok)return a;
    if(!own(GOODS,good)||!whole(qty,1,100000)||!['load','unload'].includes(direction))return fail('Choose a product, direction and positive whole tonnes.');
    const c=s.captain,w=s.warehouses[c.port];
    if(direction==='load'){
      if(w.stock[good]<qty)return fail('Not enough stock at the captain’s current port.');
      if(sum(c.cargo)+qty>FLEET[c.ship].capacity)return fail('The ship hold has insufficient capacity.');
    }else{
      if(c.cargo[good]<qty)return fail('Not enough cargo aboard the ship.');
      if(warehouseUsage(s,c.port).free<qty)return fail('The local warehouse has insufficient unreserved space.');
    }
    return {ok:true,qty,direction,hub:c.port};
  }
  function transferCargo(s,good,qty,direction){
    const q=quoteTransfer(s,good,qty,direction);if(!q.ok)return q;
    const d=direction==='load'?1:-1,c=s.captain;c.cargo[good]+=d*qty;s.warehouses[c.port].stock[good]-=d*qty;
    log(s,`${direction==='load'?'Loaded':'Unloaded'} ${qty} t ${GOODS[good].name} at ${HUBS[c.port].name}.`);return q;
  }
  function passage(s,to,departDay){
    const c=s.captain,ship=FLEET[c.ship],from=c.port;
    const km=Math.ceil(distance(from,to)*1.2),southwest=departDay<=30;
    const following=southwest?HUBS[to].lat>=HUBS[from].lat:HUBS[to].lat<HUBS[from].lat;
    const days=Math.max(1,Math.ceil(km/(ship.speed*1.852*24*(c.hull<50?0.8:1))*(following?0.9:1.15)))+1;
    const premium=c.insured?Math.max(400,Math.ceil(ship.cost*0.002)):0;
    const damage=c.insured?0:3+hash(`${s.seed}|captain|${departDay}|${from}|${to}`)%7+(following?0:4);
    return {from,to,days,arrivalDay:departDay+days,cost:Math.ceil(km*0.16+days*ship.daily*0.35)+premium,damage,insured:c.insured,monsoon:southwest?'Southwest monsoon':'Northeast monsoon'};
  }
  function quoteVoyage(s,to){
    const a=captainReady(s);if(!a.ok)return a;const c=s.captain;
    if(!own(HUBS,to)||to===c.port)return fail('Choose a different destination for your captain.');
    if(!s.warehouses[to])return fail('Build a warehouse at the destination before sailing.');
    if(c.hull<20)return fail('Repair the ship to at least 20% hull before sailing.');
    if(warehouseUsage(s,to).free<sum(c.cargo))return fail('The destination cannot reserve enough space for your ship’s cargo.');
    const q=passage(s,to,s.day);
    if(q.arrivalDay>SEASON_DAYS)return fail('This voyage would arrive after day 60. Sell locally or charter faster freight.');
    if(q.cost>s.cash)return fail('Not enough company cash for this voyage.');
    return {ok:true,...q};
  }
  function sail(s,to){
    const q=quoteVoyage(s,to);if(!q.ok)return q;
    s.cash-=q.cost;s.captain.voyage={from:q.from,to,departDay:s.day,arrivalDay:q.arrivalDay,cost:q.cost,damage:q.damage,insured:q.insured};
    log(s,`Captain sailed to ${HUBS[to].name}; arrives day ${q.arrivalDay}. Factories and chartered freight continue on the same clock.`);return q;
  }
  function insure(s,enabled){const a=captainReady(s);if(!a.ok)return a;if(typeof enabled!=='boolean')return fail('Insurance must be on or off.');s.captain.insured=enabled;return {ok:true};}
  function repairCaptain(s){
    const a=captainReady(s);if(!a.ok)return a;const cost=(100-s.captain.hull)*120;
    if(!cost)return fail('Your ship is already fully repaired.');if(cost>s.cash)return fail('Not enough company cash for repairs.');
    s.cash-=cost;s.captain.hull=100;log(s,`Captain’s ship repaired for RM ${cost}.`);return {ok:true,cost};
  }
  function upgradeShip(s,id){
    const a=captainReady(s);if(!a.ok)return a;
    if(!own(FLEET,id)||FLEET[id].cost<=FLEET[s.captain.ship].cost)return fail('Choose a larger ship upgrade.');
    const cost=FLEET[id].cost-shipValue(s.captain);if(cost>s.cash)return fail('Not enough company cash for this ship upgrade.');
    s.cash-=cost;s.captain.ship=id;s.captain.hull=100;log(s,`Captain upgraded to ${FLEET[id].name}.`);return {ok:true,cost};
  }
  function borrow(s,amount){
    const a=active(s);if(!a.ok)return a;if(!s.captain)return fail('Enable the unified company first.');
    if(!whole(amount,1,CREDIT_LIMIT)||s.debt+amount>CREDIT_LIMIT)return fail('Enter whole RM within the RM 150,000 shared credit limit.');
    if(!whole(s.cash+amount))return fail('Company cash would exceed the supported amount.');
    s.cash+=amount;s.debt+=amount;log(s,`Borrowed RM ${amount}. Daily interest is 0.5% of outstanding debt; sales repay debt first.`);return {ok:true};
  }
  function repay(s,amount){
    const a=active(s);if(!a.ok)return a;if(!s.captain||!whole(amount,1)||amount>s.cash||amount>s.debt)return fail('Enter whole RM not exceeding available cash and debt.');
    s.cash-=amount;s.debt-=amount;log(s,`Repaid RM ${amount} of company debt.`);return {ok:true};
  }
  function quoteOrder(s,id){
    const a=active(s);if(!a.ok)return a;if(!s.captain||!own(ORDERS,id))return fail('Choose a valid company order.');
    const o=ORDERS[id];if(s.captain.orders[id]!=='open'||s.day>o.deadline)return fail('This order is already fulfilled or expired.');
    if(!s.warehouses[o.hub]||s.warehouses[o.hub].stock[o.good]<o.qty)return fail(`Deliver ${o.qty} t ${GOODS[o.good].name} into the ${HUBS[o.hub].name} warehouse first.`);
    if(!whole(s.cash+Math.max(0,o.payment-s.debt)))return fail('Company cash would exceed the supported amount.');
    return {ok:true,...o};
  }
  function fulfillOrder(s,id){
    const q=quoteOrder(s,id);if(!q.ok)return q;
    s.warehouses[q.hub].stock[q.good]-=q.qty;receive(s,q.payment);s.captain.orders[id]='fulfilled';
    log(s,`${q.name} fulfilled for RM ${q.payment}. Cargo consumed once; proceeds repay debt first.`);return q;
  }
  function objectives(s){
    return [
      {id:'source',name:'1 · Source your cargo',done:s.stats.trades>0,tab:'market',hub:'klang',hint:'Buy 20 t palm oil at Klang, then open a Singapore warehouse.'},
      {id:'deliver',name:'2 · Deliver across the Straits',done:s.stats.shipments>0||(s.captain?.transported||0)>0,tab:'shipments',hub:'klang',hint:'Charter sea freight or load your own ship. Advance the shared day; cargo unloads automatically.'},
      {id:'manufacture',name:'3 · Build a production chain',done:s.stats.produced>0,tab:'industry',hub:'klang',hint:'Build a food processor. Buy 20 t rice and 10 t palm oil; produce 10 batches to obtain 30 t food.'},
      {id:'captain',name:'4 · Captain a delivery',done:(s.captain?.transported||0)>0,tab:'bridge',hub:s.captain?.port||'klang',hint:'Load finished goods from the captain’s port, reserve a destination warehouse and sail while factories keep working.'},
      {id:'orders',name:'5 · Close the sale',done:Object.values(s.captain?.orders||{}).includes('fulfilled'),tab:'orders',hub:'singapore',hint:'Fulfil an order using delivered warehouse stock. Orders consume cargo; do not sell it twice.'}
    ];
  }
  function validateCaptain(s){
    const c=s.captain;if(c===null)return {ok:true};
    const fields=['ship','port','hull','cargo','voyage','voyages','transported','insured','orders'];
    if(!keysOnly(c,fields)||Object.keys(c).length!==fields.length||!own(FLEET,c.ship)||!own(s.warehouses,c.port)||!whole(c.hull,0,100)||!whole(c.voyages)||!whole(c.transported)||typeof c.insured!=='boolean')return fail('Invalid captain or ship.');
    if(!keysOnly(c.cargo,Object.keys(GOODS))||Object.keys(c.cargo).length!==Object.keys(GOODS).length||Object.values(c.cargo).some(n=>!whole(n,0,FLEET[c.ship].capacity))||sum(c.cargo)>FLEET[c.ship].capacity)return fail('Invalid captain cargo or hold capacity.');
    if(!keysOnly(c.orders,Object.keys(ORDERS))||Object.keys(c.orders).length!==Object.keys(ORDERS).length||Object.entries(c.orders).some(([id,status])=>!['open','fulfilled','expired'].includes(status)||(status==='open'&&s.day>ORDERS[id].deadline)||(status==='expired'&&s.day<=ORDERS[id].deadline)))return fail('Invalid company order state.');
    if(c.voyage!==null){
      const v=c.voyage,keys=['from','to','departDay','arrivalDay','cost','damage','insured'];
      if(!keysOnly(v,keys)||Object.keys(v).length!==keys.length||v.from!==c.port||!own(s.warehouses,v.to)||v.to===v.from||!whole(v.departDay,1,s.day)||!whole(v.arrivalDay,s.day+1,60)||v.insured!==c.insured||c.hull<20)return fail('Invalid captain voyage.');
      const expected=passage(s,v.to,v.departDay);
      if(v.arrivalDay!==expected.arrivalDay||v.cost!==expected.cost||v.damage!==expected.damage)return fail('Invalid captain voyage timing or accounting.');
    }
    return {ok:true};
  }

  function freeze(o){Object.values(o).forEach(v=>{if(v&&typeof v==='object')freeze(v);});return Object.freeze(o);}
  [HUBS,GOODS,TRANSPORTS,RECIPES,RAIL_LINKS,FLEET,ORDERS].forEach(freeze);
  const api={warehouseMaxLevel,FLEET,ORDERS,CREDIT_LIMIT,enableCaptain,dailyUpkeep,shipValue,quoteTransfer,transferCargo,quoteVoyage,sail,insure,repairCaptain,upgradeShip,borrow,repay,quoteOrder,fulfillOrder,objectives,VERSION,SEASON_DAYS,INITIAL_CASH,INITIAL_NET_WORTH,COSTS,HUBS,GOODS,TRANSPORTS,RECIPES,RAIL_LINKS,create,prices,warehouseUsage,quoteTrade,trade,quoteShipment,dispatch,buildWarehouse,upgradeWarehouse,upgradeLanes,buildFactory,quoteProduction,startProduction,advanceDay,netWorth,validate,serialize,deserialize};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MMNetwork=api;
})(typeof window!=='undefined'?window:globalThis);
