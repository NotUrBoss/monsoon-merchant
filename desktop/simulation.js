/* District Builder prototype. One deterministic ledger; no timers, DOM or storage here. */
(function (root) {
  'use strict';
  const VERSION = 1, INITIAL_CASH = 500000, KEY = 'monsoon.district.v1';
  const CATALOG = Object.freeze({
    warehouse: Object.freeze({ name:'Warehouse', cost:70000, upkeep:180, upgrade:45500, max:2 }),
    factory: Object.freeze({ name:'Food factory', cost:90000, upkeep:300, upgrade:58500, max:3 }),
    depot: Object.freeze({ name:'Distribution depot', cost:30000, upkeep:120, upgrade:19500, max:1 }),
    port: Object.freeze({ name:'Export terminal', cost:85000, upkeep:240, upgrade:55250, max:1 })
  });
  const ECONOMY = Object.freeze({ rice:800, palm:1200, localPrice:2400, exportPrice:3100,
    foodCost:1150, processing:1300, freightFixed:1800, freightPerTonne:100 });
  const TOTAL_KEYS = ['purchases','processing','freight','upkeep','capex','revenue','cogs',
    'boughtRice','boughtPalm','produced','localSold','exportSold','departures'];
  const POLICY_KEYS = ['enabled','reserve','dailyBudget','inputBuffer','sales'];
  const copy = x => JSON.parse(JSON.stringify(x));
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  const int = (x,min=0,max=1e12) => Number.isSafeInteger(x) && x>=min && x<=max;
  const rec = o => o && typeof o==='object' && !Array.isArray(o) && [Object.prototype,null].includes(Object.getPrototypeOf(o));
  const keys = (o,ks) => rec(o) && Object.keys(o).length===ks.length && ks.every(k=>own(o,k));
  const fail = error => ({ok:false,error});
  const buildings = (s,type) => s.buildings.filter(b=>b.type===type);
  const level = (s,type) => buildings(s,type).reduce((n,b)=>n+b.level,0);
  const capacity = s => level(s,'warehouse')*160;
  const used = s => Object.values(s.stock).reduce((n,q)=>n+q,0)+s.jobs.reduce((n,j)=>n+j.qty,0);
  const upkeep = s => s.buildings.reduce((n,b)=>n+CATALOG[b.type].upkeep*b.level,0);
  const wet = day => (day-1)%60>=30;
  const investment = b => CATALOG[b.type].cost + CATALOG[b.type].upgrade*b.level*(b.level-1)/2;
  function note(s,text) { s.events.unshift({day:s.day,text}); s.events=s.events.slice(0,12); }
  function create() {
    return {kind:'monsoon-district',version:VERSION,revision:0,day:1,cash:INITIAL_CASH,
      buildings:[{plot:0,type:'warehouse',level:1}],stock:{rice:0,palm:0,food:0},jobs:[],
      route:{job:null,returnDay:0},policy:{enabled:false,reserve:100000,dailyBudget:20000,inputBuffer:1,sales:'local'},
      totals:Object.fromEntries(TOTAL_KEYS.map(k=>[k,0])),history:[],events:[{day:1,text:'Your serviced waterfront district is ready. Review a food business to begin.'}]};
  }
  function finance(s) {
    const t=s.totals;
    const inventory=s.stock.rice*800+s.stock.palm*1200+s.stock.food*1150;
    const work=s.jobs.reduce((n,j)=>n+j.qty*1150,0);
    const transit=(s.route.job?.qty||0)*1150;
    return {operatingProfit:t.revenue-t.cogs-t.freight-t.upkeep,cashFlow:s.cash-INITIAL_CASH,
      inventory,work,transit,capex:t.capex,upkeep:upkeep(s),
      last7:s.history.slice(-7).reduce((n,h)=>n+h.revenue-h.cogs-h.freight-h.upkeep,0)};
  }
  function validate(s) {
    try {
      if(!keys(s,['kind','version','revision','day','cash','buildings','stock','jobs','route','policy','totals','history','events']) ||
        s.kind!=='monsoon-district'||s.version!==VERSION||!int(s.revision)||!int(s.day,1,1000000)||!int(s.cash))return fail('Unsupported or malformed district save.');
      if(!Array.isArray(s.buildings)||s.buildings.length<1||s.buildings.length>8)return fail('Invalid district buildings.');
      const plots=new Set();
      for(const b of s.buildings) {
        if(!keys(b,['plot','type','level'])||!int(b.plot,0,7)||!own(CATALOG,b.type)||!int(b.level,1,3)||plots.has(b.plot))return fail('Invalid or overlapping plot.');
        if(b.type==='port'&&b.plot<6)return fail('Export terminals require a waterfront plot.');
        plots.add(b.plot);
      }
      if(!s.buildings.some(b=>b.plot===0&&b.type==='warehouse'))return fail('The founding warehouse is missing.');
      if(Object.keys(CATALOG).some(t=>buildings(s,t).length>CATALOG[t].max))return fail('District building limit exceeded.');
      if(!keys(s.stock,['rice','palm','food'])||Object.values(s.stock).some(q=>!int(q)))return fail('Invalid inventory.');
      if(!keys(s.policy,POLICY_KEYS)||typeof s.policy.enabled!=='boolean'||!int(s.policy.reserve,0,1000000)||!int(s.policy.dailyBudget,0,100000)||!int(s.policy.inputBuffer,0,3)||!['local','balanced','export'].includes(s.policy.sales))return fail('Invalid operating policy.');
      if(!keys(s.totals,TOTAL_KEYS)||Object.values(s.totals).some(n=>!int(n)))return fail('Invalid accounts.');
      if(!Array.isArray(s.jobs)||s.jobs.length>3)return fail('Invalid production jobs.');
      const running=new Set();
      for(const j of s.jobs) {
        const b=s.buildings.find(b=>b.plot===j.plot&&b.type==='factory');
        if(!keys(j,['plot','finish','qty'])||!b||running.has(j.plot)||j.qty!==6*b.level||!int(j.finish,s.day+1,s.day+2))return fail('Invalid production reservation.');
        running.add(j.plot);
      }
      if(used(s)>capacity(s))return fail('Warehouse capacity exceeded.');
      if(!keys(s.route,['job','returnDay'])||!int(s.route.returnDay,0,s.day+8))return fail('Invalid vessel return.');
      const j=s.route.job;
      if(j!==null && (!keys(j,['qty','depart','arrive'])||!int(j.qty,6,18*level(s,'port'))||!int(j.depart,1,s.day)||!int(j.arrive,s.day+1,s.day+4)||
        j.arrive!==j.depart+(wet(j.depart)?4:3)||s.route.returnDay!==j.arrive+(wet(j.depart)?4:3)))return fail('Invalid export reservation.');
      const t=s.totals, pending=s.jobs.reduce((n,j)=>n+j.qty,0), sent=j?.qty||0;
      if(t.produced%6||t.boughtRice!==s.stock.rice+(t.produced+pending)*2/3||t.boughtPalm!==s.stock.palm+(t.produced+pending)/3||
        t.produced!==s.stock.food+sent+t.localSold+t.exportSold)return fail('Inventory conservation failed.');
      if(t.purchases!==t.boughtRice*800+t.boughtPalm*1200||t.processing!==(t.produced+pending)/6*1300||
        t.cogs!==(t.localSold+t.exportSold)*1150||t.revenue!==t.localSold*2400+t.exportSold*3100||
        t.freight!==t.departures*1800+(t.exportSold+sent)*100||
        t.capex!==s.buildings.reduce((n,b)=>n+investment(b),0)-70000 ||
        s.cash!==INITIAL_CASH+t.revenue-t.purchases-t.processing-t.freight-t.upkeep-t.capex)return fail('Company ledger does not reconcile.');
      if(!Array.isArray(s.history)||s.history.length>30||!Array.isArray(s.events)||s.events.length>12)return fail('Invalid history.');
      let prev=0;
      for(const h of s.history) {
        if(!keys(h,['day','cash','revenue','cogs','upkeep','freight','purchases','processing'])||!int(h.day,2,s.day)||h.day<=prev||Object.values(h).some(x=>!int(x)))return fail('Invalid daily report.');
        prev=h.day;
      }
      for(const e of s.events)if(!keys(e,['day','text'])||!int(e.day,1,s.day)||typeof e.text!=='string'||e.text.length>220)return fail('Invalid event.');
      return {ok:true};
    } catch (_) { return fail('Malformed district save.'); }
  }
  function commit(s,next) {
    const v=validate(next);if(!v.ok)return v;
    Object.assign(s,next);return {ok:true};
  }
  function payCapital(s,amount) {
    if(s.cash-amount<s.policy.reserve)throw new Error('Construction would breach your cash reserve. Reduce the reserve explicitly or earn more cash.');
    s.cash-=amount;s.totals.capex+=amount;
  }
  function construct(s,type,plot) {
    if(!own(CATALOG,type)||!int(plot,1,7)||s.buildings.some(b=>b.plot===plot))throw new Error('Choose a vacant serviced plot.');
    if(type==='port'&&plot<6)throw new Error('The export terminal needs waterfront plot 7 or 8.');
    if(buildings(s,type).length>=CATALOG[type].max)throw new Error('This prototype has reached its limit for that building type.');
    payCapital(s,CATALOG[type].cost);s.buildings.push({plot,type,level:1});note(s,`${CATALOG[type].name} opened on plot ${plot+1}.`);
  }
  function command(s,c,expected=s.revision) {
    const valid=validate(s);if(!valid.ok)return valid;
    if(expected!==s.revision)return fail('The district changed. Review this plan again.');
    const n=copy(s);
    try {
      if(!rec(c)||typeof c.type!=='string')return fail('Invalid command.');
      if(c.type==='starter'&&keys(c,['type'])) {
        if(n.buildings.length!==1)throw new Error('The starter plan requires the original empty district.');
        construct(n,'factory',1);construct(n,'depot',2);n.policy.enabled=true;
        note(n,'Local food business approved. Procurement, repeat production and local sales are enabled.');
      } else if(c.type==='build'&&keys(c,['type','building','plot']))construct(n,c.building,c.plot);
      else if(c.type==='upgrade'&&keys(c,['type','plot'])) {
        const b=n.buildings.find(b=>b.plot===c.plot);
        if(!b||b.level>=3)throw new Error('Choose a building below level 3.');
        if(n.jobs.some(j=>j.plot===b.plot))throw new Error('Finish this factory batch before upgrading. Pause automation first.');
        payCapital(n,CATALOG[b.type].upgrade*b.level);b.level++;note(n,`${CATALOG[b.type].name} upgraded to level ${b.level}.`);
      } else if(c.type==='export'&&keys(c,['type'])) {
        const plot=[6,7].find(p=>!n.buildings.some(b=>b.plot===p));
        if(level(n,'port'))throw new Error('An export terminal already exists. Change the sales policy instead.');
        construct(n,'port',plot);n.policy.sales='balanced';n.policy.enabled=true;
        note(n,'Recurring Singapore route approved. Sell 1 t locally per day; charter surplus in loads of at least 6 t.');
      } else if(c.type==='policy'&&keys(c,['type','policy'])) {
        if(!keys(c.policy,POLICY_KEYS))throw new Error('Provide a complete operating policy.');
        n.policy=copy(c.policy);note(n,'Operating policy updated. Existing batches and cargo retain their commitments.');
      } else return fail('Unknown or incomplete command.');
      n.revision++;
      return commit(s,n);
    } catch(e) { return fail(e.message); }
  }
  function preview(s,c) {
    const v=validate(s);if(!v.ok)return v;
    const n=copy(s),result=command(n,c,s.revision);
    return result.ok ? {ok:true,revision:s.revision,command:copy(c),cost:s.cash-n.cash,dailyUpkeep:upkeep(n),next:n} : result;
  }
  function advanceOne(s) {
    const valid=validate(s);if(!valid.ok)return valid;
    if(s.day>=1000000)return fail('Prototype day limit reached. Export your backup.');
    const n=copy(s),before=copy(n.totals);n.day++;
    const done=n.jobs.filter(j=>j.finish<=n.day);
    for(const j of done){n.stock.food+=j.qty;n.totals.produced+=j.qty;note(n,`Factory completed ${j.qty} t of food.`);}
    n.jobs=n.jobs.filter(j=>j.finish>n.day);
    if(n.route.job&&n.route.job.arrive<=n.day) {
      const q=n.route.job.qty;n.cash+=q*3100;n.totals.revenue+=q*3100;n.totals.cogs+=q*1150;n.totals.exportSold+=q;
      n.route.job=null;note(n,`Singapore accepted ${q} t; RM ${(q*3100).toLocaleString('en')} received. Vessel returning.`);
    }
    if(n.policy.enabled&&n.policy.sales!=='export') {
      const cap=3*level(n,'depot'),limit=n.policy.sales==='balanced'?Math.min(1,cap):cap;
      const q=Math.min(n.stock.food,limit);
      if(q){n.stock.food-=q;n.cash+=q*2400;n.totals.revenue+=q*2400;n.totals.cogs+=q*1150;n.totals.localSold+=q;}
    }
    const fixed=upkeep(n);
    if(n.cash<fixed)return fail('Not enough cash for fixed daily costs. The simulation is paused; no part of this day was committed.');
    n.cash-=fixed;n.totals.upkeep+=fixed;
    let budget=n.policy.dailyBudget;
    const affordable=cost=>cost<=budget&&n.cash-cost>=n.policy.reserve;
    const spend=(cost,field)=>{n.cash-=cost;n.totals[field]+=cost;budget-=cost;};
    if(n.policy.enabled) {
      if(n.policy.sales!=='local'&&level(n,'port')&&!n.route.job&&n.route.returnDay<=n.day&&n.stock.food>=6) {
        const q=Math.min(n.stock.food,18*level(n,'port')),cost=1800+q*100;
        if(affordable(cost)) {
          spend(cost,'freight');n.stock.food-=q;n.totals.departures++;
          const days=wet(n.day)?4:3;n.route.job={qty:q,depart:n.day,arrive:n.day+days};n.route.returnDay=n.day+2*days;
          note(n,`Export departed with ${q} t. Arrival day ${n.day+days}; return day ${n.route.returnDay}.`);
        }
      }
      // Buy missing inputs and start each batch atomically. Buffer top-up is lower priority.
      for(const b of buildings(n,'factory').sort((a,b)=>a.plot-b.plot)) {
        if(n.jobs.some(j=>j.plot===b.plot))continue;
        const r=4*b.level,p=2*b.level,qr=Math.max(0,r-n.stock.rice),qp=Math.max(0,p-n.stock.palm);
        const purchase=qr*800+qp*1200,fee=1300*b.level;
        if(used(n)+qr+qp>capacity(n)||!affordable(purchase+fee))continue;
        spend(purchase,'purchases');spend(fee,'processing');n.totals.boughtRice+=qr;n.totals.boughtPalm+=qp;
        n.stock.rice+=qr-r;n.stock.palm+=qp-p;n.jobs.push({plot:b.plot,finish:n.day+2,qty:6*b.level});
      }
      const scale=level(n,'factory')*n.policy.inputBuffer;
      const qr=Math.max(0,4*scale-n.stock.rice),qp=Math.max(0,2*scale-n.stock.palm),cost=qr*800+qp*1200;
      if(cost&&affordable(cost)&&used(n)+qr+qp<=capacity(n)) {
        spend(cost,'purchases');n.totals.boughtRice+=qr;n.totals.boughtPalm+=qp;n.stock.rice+=qr;n.stock.palm+=qp;
      }
    }
    const row={day:n.day,cash:n.cash};
    for(const k of ['revenue','cogs','upkeep','freight','purchases','processing'])row[k]=n.totals[k]-before[k];
    n.history.push(row);n.history=n.history.slice(-30);n.revision++;
    const result=commit(s,n);
    return {...result,stop:result.ok&&n.cash<n.policy.reserve?'Cash is below your reserve. Fixed costs still apply; discretionary spending is blocked.':null};
  }
  function advance(s,days=1) {
    if(!int(days,1,10000))return fail('Choose 1–10,000 simulation days.');
    let elapsed=0;
    while(elapsed<days){const r=advanceOne(s);if(!r.ok)return {...r,elapsed};elapsed++;if(r.stop)return {...r,elapsed};}
    return {ok:true,elapsed};
  }
  function alerts(s) {
    const a=[];
    if(!s.policy.enabled)a.push({code:'paused',title:'Automation is off',detail:'Existing work can finish. New purchasing, production and local sales wait for your approval.',target:'policy'});
    if(s.cash<upkeep(s)*3+s.policy.reserve)a.push({code:'cash',title:'Cash reserve needs attention',detail:'Fixed costs continue. Reduce investment or review the reserve before resuming.',target:'finance'});
    if(s.policy.enabled&&level(s,'factory')===0)a.push({code:'factory',title:'No production capacity',detail:'Build a food factory to start a supply chain.',target:'build'});
    if(s.policy.enabled&&!level(s,'depot')&&s.policy.sales!=='export')a.push({code:'depot',title:'No local distribution',detail:'A depot connects production to the local buyer. Build one or use an export-only policy.',target:'build'});
    if(s.policy.enabled&&s.policy.sales!=='local'&&!level(s,'port'))a.push({code:'port',title:'No export connection',detail:'Build an export terminal on a waterfront plot to serve Singapore.',target:'routes'});
    if(used(s)>capacity(s)*0.8)a.push({code:'space',title:'Storage is filling up',detail:`${used(s)} of ${capacity(s)} t occupied or reserved. Expand storage or improve sales.`,target:'build'});
    const output=3*level(s,'factory'),local=s.policy.sales==='export'?0:s.policy.sales==='balanced'?Math.min(1,3*level(s,'depot')):3*level(s,'depot');
    const transport=s.policy.sales==='local'?0:18*level(s,'port')/(wet(s.day)?8:6);
    if(s.policy.enabled&&output>local+transport)a.push({code:'demand',title:'Sales / transport bottleneck',detail:`Potential output ${output} t/day exceeds approximately ${(local+transport).toFixed(1)} t/day of selling capacity. Add distribution or exports before another factory.`,target:'routes'});
    if(s.policy.enabled&&buildings(s,'factory').some(b=>!s.jobs.some(j=>j.plot===b.plot)))a.push({code:'idle',title:'A factory is waiting',detail:'Check the daily spending limit, cash reserve and warehouse space. Inputs and processing are funded together.',target:'policy'});
    return a;
  }
  function serialize(s){const v=validate(s);if(!v.ok)throw new Error(v.error);return JSON.stringify(s);}
  function deserialize(text){try{if(typeof text!=='string'||text.length>200000)return fail('Backup is too large or not text.');const s=JSON.parse(text),v=validate(s);return v.ok?{ok:true,state:s}:v;}catch(_){return fail('This file is not a valid district backup.');}}
  const api=Object.freeze({VERSION,KEY,CATALOG,ECONOMY,INITIAL_CASH,create,validate,command,preview,advance,finance,alerts,capacity,used,upkeep,level,wet,serialize,deserialize});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DistrictSim=api;
})(typeof window!=='undefined'?window:globalThis);
