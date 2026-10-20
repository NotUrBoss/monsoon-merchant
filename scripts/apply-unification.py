from pathlib import Path
root=Path.cwd()
p=root/'logistics.js'
s=p.read_text()
s=s.replace('/* Monsoon Merchant — independent Network Company campaign engine. */','/* Monsoon Merchant — one company ledger for captains, manufacturing and logistics. */')
s=s.replace('const VERSION = 1;', 'const VERSION = 2;')
s=s.replace("  const own = (o,k)","""  // Reuse the captain game's ship catalog; the unified company has one economy.
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
  const own = (o,k)""")
s=s.replace("function create(seed='network') {","function create(seed='network', withCaptain=false) {")
s=s.replace("stats:{trades:0,shipments:0,produced:0,upkeep:0},result:null};", "stats:{trades:0,shipments:0,produced:0,upkeep:0},result:null,captain:withCaptain?newCaptain():null};")
s=s.replace("resetMarket(s); log(s,'Company founded in Port Klang. Build a destination warehouse, buy cargo, then dispatch your first shipment.'); return s;", "resetMarket(s); log(s,'Company founded in Port Klang. Source cargo, manufacture, then deliver by your own ship or chartered freight.'); return s;")
s=s.replace("const stock=sum(w.stock),reserved=s.shipments", "const stock=sum(w.stock),reserved=(s.captain?.voyage?.to===hub?sum(s.captain.cargo):0)+s.shipments")
s=s.replace("Try fewer batches or sell the inputs.","Sell the inputs or choose a shorter recipe at another factory.")
s=s.replace('let value=s.cash-s.debt;', '''let value=s.cash-s.debt;
    if(s.captain){
      const c=s.captain,p=prices(s,c.voyage?c.voyage.to:c.port);
      value+=shipValue(c)+Object.entries(c.cargo).reduce((n,[g,q])=>n+p[g].sell*q,0);
    }''')
s=s.replace('const nextUpkeep=Object.keys(s.warehouses).length*COSTS.warehouseUpkeep+Object.keys(s.factories).length*COSTS.factoryUpkeep;', 'const nextUpkeep=dailyUpkeep(s);')
s=s.replace("s.day++;const events=[];", '''s.day++;const events=[];
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
    }''')
s=s.replace('const upkeep=Object.keys(s.warehouses).length*COSTS.warehouseUpkeep+Object.keys(s.factories).length*COSTS.factoryUpkeep;', 'const upkeep=nextUpkeep;')
s=s.replace("if(!whole(s.debt+Math.max(0,nextUpkeep-s.cash))", "if(s.captain?.voyage?.arrivalDay===s.day+1 && (!whole(s.captain.voyages+1)||!whole(s.captain.transported+sum(s.captain.cargo))))return fail('Captain statistics exceed the supported amount.');\n    if(!whole(s.debt+Math.max(0,nextUpkeep-s.cash))")
s=s.replace('function validate(s) {','function validate(s,legacy=false) {')
s=s.replace("'history','stats','result'];", "'history','stats','result'];\n      if(!legacy)top.push('captain');")
s=s.replace('s.version!==VERSION','s.version!==(legacy?1:VERSION)')
s=s.replace("      for(const hub of Object.keys(s.warehouses))", "      if(!legacy){const cv=validateCaptain(s);if(!cv.ok)return cv;}\n      for(const hub of Object.keys(s.warehouses))")
s=s.replace("if(s.shipments.length||s.production.length||!keysOnly(s.result", "if(s.captain?.voyage||s.shipments.length||s.production.length||!keysOnly(s.result")
s=s.replace("try{const s=JSON.parse(text),v=validate(s);return v.ok?{ok:true,state:s}:v;}","try{const s=JSON.parse(text);if(s?.version===1){const legacy=validate(s,true);if(!legacy.ok)return legacy;s.version=VERSION;s.captain=null;}const v=validate(s);return v.ok?{ok:true,state:s}:v;}")
functions=r'''
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
'''
s=s.replace('  function freeze(o)',functions+'\n  function freeze(o)')
s=s.replace('[HUBS,GOODS,TRANSPORTS,RECIPES,RAIL_LINKS]', '[HUBS,GOODS,TRANSPORTS,RECIPES,RAIL_LINKS,FLEET,ORDERS]')
s=s.replace('const api={VERSION,', 'const api={FLEET,ORDERS,CREDIT_LIMIT,enableCaptain,dailyUpkeep,shipValue,quoteTransfer,transferCargo,quoteVoyage,sail,insure,repairCaptain,upgradeShip,borrow,repay,quoteOrder,fulfillOrder,objectives,VERSION,')
p.write_text(s)
p=root/'tests/logistics.test.cjs';s=p.read_text().replace('s.version=2;','s.version=N.VERSION+1;');p.write_text(s)

r=Path.cwd()
p=r/'network-ui.js';s=p.read_text()
s=s.replace('/* Monsoon Merchant — a separate, turn-based logistics company campaign. */','/* Monsoon Merchant — unified captain, factory, freight and finance workspaces. */')
s=s.replace("const KEY = 'mm.network.v1';", "const KEY = 'mm.company.v2';\n  const LEGACY_KEY = 'mm.network.v1'; // Read-only migration source; never overwrite an old company.")
s=s.replace("tab: 'market'", "tab: 'world'")
s=s.replace("importText: ''", "importText: '', sailTo:'singapore', direction:'load', amount:'10000'")
s=s.replace('const raw = localStorage.getItem(KEY);', 'const raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);')
s=s.replace("const dailyCost = () => Object.keys(state.warehouses).length * N.COSTS.warehouseUpkeep + Object.keys(state.factories).length * N.COSTS.factoryUpkeep;", "const dailyCost = () => N.dailyUpkeep(state);")
s=s.replace("A new way to trade", "The unified campaign")
s=s.replace('<h1 tabindex="-1">Network Company</h1>','<h1 tabindex="-1">Monsoon Company</h1>')
s=s.replace("One company. Many routes.", "Captain. Manufacture. Deliver.")
s=s.replace("Run simultaneous sea, air and rail shipments across Asia. Build warehouses, source local products and turn raw materials into finished goods.", "Captain your own ship while your factories and sea, air and rail freight keep working. Every workspace uses one company balance, one inventory network and one clock.")
s=s.replace(" and a Klang warehouse. Prices include a buy/sell spread.", " cash, a Klang warehouse and your starter coaster. Prices include a buy/sell spread.")
s=s.replace("Open a destination warehouse, buy cargo and dispatch up to 3 shipments at once.", "Source inputs, manufacture finished goods, then deliver with your own ship or up to 3 chartered shipments at once.")
s=s.replace("Advancing a day moves all shipments and production jobs, and charges upkeep everywhere.", "Advance the shared day, fulfil delivery orders and keep a cash reserve for upkeep and any debt interest.")
s=s.replace("A separate 60-day campaign; classic seasons, Daily Voyage and Legacy keep their own progress.", "One 60-day company campaign. Previous Network Company saves are upgraded without erasing their originals. Classic seasons, Daily Voyage and Legacy remain available as archived challenges.")
s=s.replace("Network Company", "Monsoon Company")
s=s.replace("A new way to trade", "Unified gameplay")
s=s.replace("Sea · Air · Rail", "Captain · Factory · Freight")
s=s.replace("<b>all shipments and factories</b>","<b>captain, freight and factories</b>")
s=s.replace("' upkeep across your company.","' upkeep and interest across your company.")
s=s.replace("Company backups are separate from classic MM1 backups. Copy all text below and keep it somewhere safe.","This backup contains the captain, factories, freight, warehouses, orders and money together. Older company backups are accepted; classic MM1 backups stay separate.")
s=s.replace("ui.view = 'campaign'; message('Company resumed.');", "ui.view = 'campaign'; if(!state.captain && state.status==='active'){const upgraded=N.enableCaptain(state);if(!upgraded.ok){message(upgraded.error,true);render();return;}} save(); message('Company resumed. All workspaces share this save.');")
s=s.replace("ui.view = 'campaign'; ui.backup = false; message('Company restored.');", "ui.view = 'campaign'; ui.backup = false; if(!state.captain && state.status==='active')N.enableCaptain(state); save(); message('Company restored.');")
s=s.replace("N.create('company-' + Date.now())", "N.create('company-' + Date.now(), true)")
s=s.replace("ui.tab = 'market';", "ui.tab = 'world';")
s=s.replace("message('Your company is open. Start with local cargo, then add a destination warehouse.');", "message('Your company is open. Follow the first delivery objective or explore the map.');")
s=s.replace("'batches'].includes", "'batches', 'amount'].includes")
s=s.replace("const next = Math.min(...state.shipments.map(s => s.arrivalDay), ...state.production.map(p => p.finishDay));", "const next = nextEvent();")
s=s.replace("[['market', 'Market'], ['shipments', 'Shipments'], ['industry', 'Industry']]", "[['world','Map'],['market','Trade'],['bridge','Captain'],['shipments','Freight'],['industry','Manufacture'],['orders','Orders & Bank']]")
s=s.replace("(ui.tab === 'market' ? tradePanel() : ui.tab === 'shipments' ? shipmentPanel() : industryPanel())", "(ui.tab === 'world' ? window.MMCompanyWorld.world(state,N,ui.hub) : ui.tab === 'market' ? tradePanel() : ui.tab === 'bridge' ? bridgePanel() : ui.tab === 'shipments' ? shipmentPanel() : ui.tab === 'orders' ? ordersPanel() : industryPanel())")
start=s.index("        (state.day === 1 && state.stats.shipments")
end=s.index("        regionNav +",start)
s=s[:start]+"        objectivePanel() + window.MMCompanyWorld.port(state,N,ui.hub) +\n"+s[end:]
s=s.replace("Future sales repay this before adding spendable cash.", "Sales and order payments repay this before adding spendable cash. Daily interest is 0.5% while the captain is enabled.")
s=s.replace("fact('Shipments completed', result.shipments)", "fact('Chartered shipments completed', result.shipments) + fact('Captain voyages', state.captain?.voyages || 0) + fact('Orders fulfilled', Object.values(state.captain?.orders || {}).filter(x=>x==='fulfilled').length)")
s=s.replace("Company value after liabilities, including cargo at local sale prices and the resale value of facilities.", "Company value after liabilities, including cargo at local sale prices and the resale value of facilities and your ship.")
s=s.replace("This campaign does not award classic Legacy.","Company objectives and valuation are independent of archived classic Legacy rewards.")
s=s.replace("      const shipments = state.shipments.map", """      const captain=state.captain?.voyage;
      const captainJob=captain?['<li><div><span class="net-badge">Your captain</span><b>'+esc(hubName(captain.from))+' → '+esc(hubName(captain.to))+'</b><small>'+Object.values(state.captain.cargo).reduce((a,b)=>a+b,0)+' t aboard</small></div><div class="net-eta"><b>Day '+captain.arrivalDay+'</b><small>'+plural(captain.arrivalDay-state.day,'day')+' left</small></div></li>']:[];
      const shipments = captainJob.concat(state.shipments.map""")
s=s.replace("' left</small></div></li>');\n      const jobs", "' left</small></div></li>'));\n      const jobs")
new=r'''
    function nextEvent(){return Math.min(...state.shipments.map(j=>j.arrivalDay),...state.production.map(j=>j.finishDay),state.captain?.voyage?.arrivalDay||Infinity);}
    function objectivePanel(){
      const objectives=N.objectives(state),next=objectives.find(o=>!o.done),completed=objectives.filter(o=>o.done).length;
      return '<section class="net-guidance company-objectives" aria-label="Campaign objectives"><div class="net-card-head"><b>Your trading company · '+completed+'/5 milestones</b><span class="net-badge">'+(next?'Next objective':'Supply chain established')+'</span></div><div class="objective-track">'+objectives.map(o=>'<button data-n="objective" data-objective="'+o.id+'" class="'+(o.done?'done':'')+'">'+(o.done?'✓ ':'○ ')+esc(o.name)+'</button>').join('')+'</div><p>'+esc(next?next.hint:'Keep growing your network, finish outstanding orders and protect your net worth through day 60.')+'</p></section>';
    }
    function bridgePanel(){
      const c=state.captain;
      if(!c)return '<section class="net-card"><h2>Captain bridge</h2><p>Add the starter coaster to this company without changing its cash or deleting the old save.</p>'+btn('Enable captain bridge','enable-captain','primary')+'</section>';
      const fleet=N.FLEET[c.ship],aboard=Object.values(c.cargo).reduce((a,b)=>a+b,0);
      let h='<section class="net-card"><div class="net-card-head"><h2>'+esc(fleet.name)+'</h2><span class="net-badge">Hull '+c.hull+'%</span></div><p class="net-note">Captain '+(c.voyage?'at sea to '+esc(hubName(c.voyage.to)):'docked at '+esc(hubName(c.port)))+'. The regional hub selector manages remote facilities; it does not move your ship.</p><dl class="facts">'+fact('Hold used',aboard+' / '+fleet.capacity+' t')+fact('Captain deliveries',c.transported+' t across '+c.voyages+' voyages')+'</dl>';
      if(c.voyage)return h+'<p class="net-guidance">Arrives on day '+c.voyage.arrivalDay+'. Cargo will unload automatically into the reserved destination warehouse. Keep trading and manufacturing while the captain sails.</p>'+btn('Manage destination warehouse','captain-destination')+'</section>';
      if(ui.sailTo===c.port||!N.HUBS[ui.sailTo])ui.sailTo=ids.find(id=>id!==c.port);
      const transfer=N.quoteTransfer(state,ui.good,whole(ui.qty),ui.direction),voyage=N.quoteVoyage(state,ui.sailTo);
      h+='<h3>Load or unload at '+esc(hubName(c.port))+'</h3><div class="net-form">'+select('good','Ship cargo',ui.good,goods.map(id=>[id,goodName(id)]))+select('direction','Transfer',ui.direction,[['load','Warehouse → ship'],['unload','Ship → warehouse']])+input('qty','Quantity (whole tonnes)',ui.qty)+'</div><p class="net-note">Warehouse: '+state.warehouses[c.port].stock[ui.good]+' t · Aboard: '+c.cargo[ui.good]+' t</p>'+(transfer.ok?'':'<p class="net-warning">'+esc(transfer.error)+'</p>')+btn(ui.direction==='load'?'Load cargo':'Unload cargo','transfer','primary',transfer.ok?'':' disabled');
      h+='<hr class="company-divider"><h3>Plan your voyage</h3>'+select('sailTo','Captain destination',ui.sailTo,ids.filter(id=>id!==c.port).map(id=>[id,hubName(id)+(state.warehouses[id]?'':' · warehouse needed')]))+'<p class="net-note">Voyage cost includes fuel and crew. Insurance includes storm-damage repair on arrival; ordinary repairs cost RM 120 per hull point. Quotes use the monsoon at departure.</p>'+btn('Voyage insurance: '+(c.insured?'on':'off'),'insurance','', ' aria-pressed="'+c.insured+'"')+(voyage.ok?'<dl class="facts">'+fact('Departure','Day '+state.day)+fact('Arrival','Day '+voyage.arrivalDay+' · '+plural(voyage.days,'day'))+fact('Voyage cost',money(voyage.cost))+fact('Weather',esc(voyage.monsoon))+fact('Cargo reservation',aboard+' t at destination')+'</dl>':'<p class="net-warning">'+esc(voyage.error)+'</p>')+btn('Sail to '+esc(hubName(ui.sailTo)),'sail','primary',voyage.ok?'':' disabled');
      if(!aboard)h+='<p class="net-note">Your hold is empty. Sailing empty repositions the captain; load cargo first for a delivery.</p>';
      h+='<hr class="company-divider"><h3>Shipyard</h3>'+btn('Repair to 100% · '+money((100-c.hull)*120),'repair-captain','', c.hull===100||state.cash<(100-c.hull)*120?' disabled':'');
      for(const [id,f]of Object.entries(N.FLEET))if(f.cost>fleet.cost){const cost=f.cost-N.shipValue(c);h+=btn('Upgrade: '+esc(f.name)+' · '+f.capacity+' t · '+money(cost),'upgrade-ship','', ' data-ship="'+id+'"'+(cost>state.cash?' disabled':''));}
      return h+'</section>';
    }
    function ordersPanel(){
      const c=state.captain;if(!c)return bridgePanel();
      const orders=Object.entries(N.ORDERS).map(([id,o])=>{const q=N.quoteOrder(state,id),status=c.orders[id];return '<article class="company-order"><div class="net-card-head"><h3>'+esc(o.name)+'</h3><span class="net-badge">'+esc(status)+'</span></div><p>'+o.qty+' t '+esc(goodName(o.good))+' → '+esc(hubName(o.hub))+'</p><dl class="facts">'+fact('Payment',money(o.payment))+fact('Delivery deadline','Day '+o.deadline)+'</dl>'+(status==='open'?'<p class="net-note">'+(q.ok?'Warehouse cargo is ready. Payment consumes it once.':esc(q.error))+'</p>'+btn('Fulfil order','fulfill-order','primary',' data-order="'+id+'"'+(q.ok?'':' disabled'))+btn('Manage delivery hub','order-hub','ghost',' data-order="'+id+'"'):'')+'</article>';}).join('');
      const amount=whole(ui.amount),canBorrow=Number.isSafeInteger(amount)&&amount>0&&amount+state.debt<=N.CREDIT_LIMIT,canRepay=Number.isSafeInteger(amount)&&amount>0&&amount<=state.debt&&amount<=state.cash;
      return '<section class="net-card"><h2>Delivery orders</h2><p class="net-note">Deliver into the named warehouse, then fulfil the order. Its payment replaces a market sale, not an extra payout. Orders expire without penalty; deadline-day arrivals can fulfil an order before advancing again.</p>'+orders+'</section><section class="net-card"><h2>Company finance</h2><dl class="facts">'+fact('Outstanding debt',money(state.debt))+fact('Shared credit limit',money(N.CREDIT_LIMIT))+fact('Daily interest',money(Math.ceil(state.debt*0.005)))+'</dl><p class="net-warning">Loans are game money. Interest is 0.5% per game day. Upkeep shortfalls also become debt. Sales and order payments repay debt automatically before increasing spendable cash.</p>'+input('amount','Loan or repayment (whole RM)',ui.amount)+btn('Borrow','borrow','',canBorrow?'':' disabled')+btn('Repay','repay','',canRepay?'':' disabled')+'</section>';
    }
'''
s=s.replace('    function backupPanel() {',new+'\n    function backupPanel() {')
s=s.replace("      if (action === 'region') {", """      if(action==='world-hub'){ui.hub=el.dataset.hub;ui.tab='market';message('Managing '+hubName(ui.hub)+'.');render();return;}
      if(action==='objective'){const objective=N.objectives(state).find(o=>o.id===el.dataset.objective);if(objective){ui.tab=objective.tab;ui.hub=objective.hub;message(objective.hint);render();}return;}
      if(action==='captain-destination'){ui.hub=state.captain.voyage.to;ui.tab='market';render();return;}
      if(action==='order-hub'){ui.hub=N.ORDERS[el.dataset.order].hub;ui.tab='market';render();return;}
      if(action==='enable-captain'){apply(N.enableCaptain(state),'Captain enabled. This is the same company, cash balance and day.');return;}
      if(action==='transfer'){apply(N.transferCargo(state,ui.good,whole(ui.qty),ui.direction),'Cargo transferred at the captain’s port.');return;}
      if(action==='sail'){apply(N.sail(state,ui.sailTo),'Captain underway. All operations share the Advance day button.');return;}
      if(action==='insurance'){apply(N.insure(state,!state.captain.insured),'Voyage insurance updated.');return;}
      if(action==='repair-captain'){apply(N.repairCaptain(state),'Ship repaired.');return;}
      if(action==='upgrade-ship'){apply(N.upgradeShip(state,el.dataset.ship),'Ship upgraded.');return;}
      if(action==='fulfill-order'){apply(N.fulfillOrder(state,el.dataset.order),'Order fulfilled. Cargo consumed and payment received.');return;}
      if(action==='borrow'){apply(N.borrow(state,whole(ui.amount)),'Loan added to the shared company balance.');return;}
      if(action==='repay'){apply(N.repay(state,whole(ui.amount)),'Company debt repaid.');return;}
      if (action === 'region') {""")
s=s.replace("function close() { disposed", "function close() { mount.removeEventListener('keydown', keyboard); disposed")
s=s.replace("    mount.addEventListener('click', click);", "    function keyboard(event){const hub=event.target.closest('svg [data-n=\"world-hub\"]');if(hub&&['Enter',' '].includes(event.key)){event.preventDefault();click({target:hub});}}\n    mount.addEventListener('keydown',keyboard);\n    mount.addEventListener('click', click);")
p.write_text(s)
p=r/'ui.js';s=p.read_text().replace("const APP_VERSION = '1.1.0';","const APP_VERSION = '1.2.0';")
old="      '<button class=\"btn ' + (normal ? 'ghost' : 'primary big') + '\" data-a=\"new-season\">' + I.play + '<span>New season</span></button>' +\n      '<button class=\"daily-card network-entry\" data-a=\"network\"><div class=\"dc-l\">' + I.box + '</div><div class=\"dc-m\"><b>Network Company <span class=\"new-tag\">NEW</span></b><small>Sea, air &amp; rail · warehouses &amp; factories</small></div><span aria-hidden=\"true\">→</span></button>' +"
new="      '<button class=\"daily-card network-entry company-entry\" data-a=\"network\"><div class=\"dc-l\">' + I.play + '</div><div class=\"dc-m\"><b>Play Monsoon Company <span class=\"new-tag\">UNIFIED</span></b><small>Captain · manufacture · ship · deliver · one campaign</small></div><span aria-hidden=\"true\">→</span></button>' +\n      '<button class=\"btn ghost\" data-a=\"new-season\">' + I.play + '<span>Classic captain season</span></button>' +"
assert old in s;s=s.replace(old,new).replace('Network Company','Monsoon Company');p.write_text(s)
p=r/'engine.js';s=p.read_text().replace("const VERSION = '1.1.0';", "const VERSION = '1.2.0';");p.write_text(s)
p=r/'index.html';s=p.read_text().replace('<script src="network-ui.js"></script>', '<script src="company-world.js"></script>\n<script src="network-ui.js"></script>')
s=s.replace('Sail as a captain or manage parallel sea, air and rail shipments, warehouses and manufacturing.', 'Captain your ship alongside parallel sea, air and rail shipments, warehouses and manufacturing in one campaign.')
s=s.replace('Sail as a captain across Southeast Asia or run a Network Company with parallel sea, air and rail shipments, regional warehouses and manufacturing over 60-day campaigns.', 'Captain your ship while running parallel sea, air and rail shipments, regional warehouses and manufacturing in one shared 60-day campaign. Classic captain challenges are also preserved.')
s=s.replace('<link rel="stylesheet" href="style.css">','<link rel="stylesheet" href="style.css">\n<link rel="stylesheet" href="company.css">')
p.write_text(s)
p=r/'sw.js';s=p.read_text().replace("'mm-1.1.0'", "'mm-1.2.0'").replace("'./network-ui.js'", "'./network-ui.js', './company-world.js', './company.css'");p.write_text(s)
p=r/'tests/offline.test.cjs';s=p.read_text().replace("['mm-1.0.1', 'mm-1.1.0', 'another-app']", "['mm-1.0.1', 'mm-1.1.0', 'mm-1.2.0', 'another-app']").replace('cached.size, 13','cached.size, 15').replace("deleted, ['mm-1.0.1']", "deleted, ['mm-1.0.1','mm-1.1.0']");p.write_text(s)
