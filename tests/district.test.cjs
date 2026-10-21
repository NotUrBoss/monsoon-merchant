'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const E=require('../desktop/simulation.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const started=()=>{const s=E.create();assert.equal(E.command(s,{type:'starter'}).ok,true);return s;};
const policy=(s,p)=>E.command(s,{type:'policy',policy:{...s.policy,...p}});
const valid=s=>assert.deepEqual(E.validate(s),{ok:true});
const reconcile=s=>{valid(s);const f=E.finance(s);assert.equal(f.cashFlow+f.capex+f.inventory+f.work+f.transit,f.operatingProfit);};

test('district starts paused-by-UI with automation off and a valid independent save',()=>{
  const s=E.create();valid(s);assert.equal(s.policy.enabled,false);assert.equal(s.cash,500000);
  assert.notEqual(E.KEY,'mm.company.v3');assert.notEqual(E.KEY,'mm.run.v1');
});
test('starter plan is an immutable quote with explicitly priced construction',()=>{
  const s=E.create(),before=clone(s),q=E.preview(s,{type:'starter'});
  assert.equal(q.ok,true);assert.equal(q.cost,120000);assert.equal(q.dailyUpkeep,600);assert.deepEqual(s,before);
});
test('stale and repeated approvals cannot spend twice',()=>{
  const s=E.create(),q=E.preview(s,{type:'starter'});assert.equal(E.command(s,q.command,q.revision).ok,true);
  const before=clone(s);assert.equal(E.command(s,q.command,q.revision).ok,false);assert.deepEqual(s,before);
});
test('invalid construction and prototype keys fail without mutation',()=>{
  const s=E.create();for(const c of [{type:'build',building:'__proto__',plot:1},{type:'build',building:'factory',plot:0},{type:'build',building:'port',plot:3},{type:'build',building:'factory',plot:NaN},{type:'build',building:'factory',plot:1,hidden:true}]){const before=clone(s);assert.equal(E.command(s,c).ok,false);assert.deepEqual(s,before);}
});
test('failed starter intermediate construction rolls back the first building',()=>{
  const s=E.create();policy(s,{reserve:400000});const before=clone(s);
  assert.equal(E.command(s,{type:'starter'}).ok,false);assert.deepEqual(s,before);
});
test('one approved chain makes repeated batches and automatic local sales without commands',()=>{
  const s=started();assert.equal(E.advance(s,120).ok,true);assert.equal(s.day,121);
  assert.ok(s.totals.produced>300);assert.ok(s.totals.localSold>300);assert.ok(E.finance(s).operatingProfit>250000);reconcile(s);
});
test('automatic procurement processing and freight share one daily budget',()=>{
  const s=started();E.command(s,{type:'export'});policy(s,{dailyBudget:8500,inputBuffer:3});
  for(let i=0;i<100;i++){assert.equal(E.advance(s).ok,true);const h=s.history.at(-1);assert.ok(h.purchases+h.processing+h.freight<=8500);reconcile(s);}
});
test('zero spending policy never purchases or starts new work',()=>{
  const s=started();policy(s,{dailyBudget:0});E.advance(s,8);
  assert.equal(s.totals.purchases,0);assert.equal(s.totals.processing,0);assert.equal(s.jobs.length,0);assert.ok(E.alerts(s).some(a=>a.code==='idle'));reconcile(s);
});
test('cash reserve blocks discretionary spending and reports fixed-cost drawdown',()=>{
  const s=started();policy(s,{reserve:s.cash});const before=clone(s);const r=E.advance(s,20);
  assert.ok(r.stop);assert.equal(r.elapsed,1);assert.equal(s.cash,before.cash-600);assert.equal(s.totals.purchases,0);reconcile(s);
});
test('disabling automation stops new work but honors already funded production and exports',()=>{
  const s=started();E.command(s,{type:'export'});while(!s.route.job)E.advance(s);
  policy(s,{enabled:false});const paid=s.totals.purchases,departures=s.totals.departures;
  E.advance(s,10);assert.equal(s.totals.purchases,paid);assert.equal(s.totals.departures,departures);
  assert.ok(s.totals.exportSold>0);assert.equal(s.route.job,null);assert.equal(s.jobs.length,0);reconcile(s);
});
test('recurring export service waits for a returned vessel and pays exactly once',()=>{
  const s=started();E.command(s,{type:'export'});let previousReturn=0,departures=0;
  for(let i=0;i<100;i++){E.advance(s);if(s.totals.departures>departures){assert.ok(s.route.job.depart>=previousReturn);previousReturn=s.route.returnDay;departures=s.totals.departures;}reconcile(s);}
  assert.ok(departures>8);assert.ok(s.totals.exportSold>100);
  assert.equal(s.totals.revenue,s.totals.localSold*2400+s.totals.exportSold*3100);
});
test('monsoon passage timing is assigned on departure and persists through reload',()=>{
  const s=started();E.advance(s,31);E.command(s,{type:'export'});while(!s.route.job)E.advance(s);
  assert.equal(s.route.job.arrive-s.route.job.depart,4);assert.equal(s.route.returnDay-s.route.job.depart,8);
  assert.deepEqual(E.deserialize(E.serialize(s)).state,s);
});
test('warehouses reserve production space and stop safely when demand is disconnected',()=>{
  const s=started();policy(s,{sales:'export'});
  for(let i=0;i<150;i++){E.advance(s);assert.ok(E.used(s)<=E.capacity(s));reconcile(s);}
  assert.ok(E.alerts(s).some(a=>a.code==='space'));assert.equal(s.totals.localSold,0);
});
test('growth creates an explanatory capacity bottleneck',()=>{
  const s=started();E.command(s,{type:'build',building:'factory',plot:3});E.advance(s,5);
  assert.ok(E.alerts(s).some(a=>a.code==='demand'));reconcile(s);
});
test('upgrades are priced once and cannot change a batch already in production',()=>{
  const s=started();E.advance(s);let before=clone(s);assert.equal(E.command(s,{type:'upgrade',plot:1}).ok,false);assert.deepEqual(s,before);
  policy(s,{enabled:false});E.advance(s,2);before=clone(s);assert.equal(E.command(s,{type:'upgrade',plot:1}).ok,true);
  assert.equal(before.cash-s.cash,58500);assert.equal(E.level(s,'factory'),2);reconcile(s);
});
test('one-day stepping and batched advancement are exactly equivalent',()=>{
  const a=started();E.command(a,{type:'export'});const b=clone(a),c=clone(a);
  E.advance(a,240);for(let i=0;i<240;i++)E.advance(b);for(let i=0;i<30;i++)E.advance(c,8);
  assert.deepEqual(a,b);assert.deepEqual(b,c);
});
test('save and restore retain future production cash and exact export timing',()=>{
  const a=started();E.command(a,{type:'export'});E.advance(a,27);const b=E.deserialize(E.serialize(a)).state;
  E.advance(a,180);E.advance(b,180);assert.deepEqual(a,b);reconcile(a);
});
test('malformed legacy and corrupted saves are rejected, not numerically migrated',()=>{
  for(const text of ['null','[]','{}','{"version":3}','nope'])assert.equal(E.deserialize(text).ok,false);
  const s=started();E.advance(s,8);
  for(const mutate of [x=>x.cash++,x=>x.stock.food++,x=>x.policy.reserve=NaN,x=>x.jobs[0].finish+=3,x=>x.buildings.push({...x.buildings[0]}),x=>x.policy.sales='anything',x=>x.totals.cogs++,x=>x.history[0].cash='bad']){
    const n=clone(s);mutate(n);assert.equal(E.validate(n).ok,false);
  }
});
test('invalid policy and day input remain atomic',()=>{
  const s=started();for(const p of [{reserve:-1},{dailyBudget:1e20},{enabled:'yes'},{inputBuffer:0.1},{sales:'__proto__'}]){const b=clone(s);assert.equal(policy(s,p).ok,false);assert.deepEqual(s,b);}
  for(const d of [0,-1,NaN,Infinity,'1',10001]){const b=clone(s);assert.equal(E.advance(s,d).ok,false);assert.deepEqual(s,b);}
});
test('fixed cost insolvency is a rollback not hidden debt or negative cash',()=>{
  const s=E.create();policy(s,{reserve:0});while(s.cash>=180)E.advance(s);
  const b=clone(s);assert.equal(E.advance(s).ok,false);assert.deepEqual(s,b);reconcile(s);
});
test('100 policy sequences reconcile all material and financial balances for 180 days',()=>{
  for(let seed=1;seed<=100;seed++){
    const s=started();if(seed%2)E.command(s,{type:'export'});
    let r=seed;for(let d=0;d<180;d++){
      r=(Math.imul(1664525,r)+1013904223)>>>0;
      if(d%17===0)policy(s,{dailyBudget:[0,7000,15000,30000][r%4],inputBuffer:r%4,sales:['local','balanced','export'][r%3]});
      E.advance(s);reconcile(s);if(d%31===0)assert.deepEqual(E.deserialize(E.serialize(s)).state,s);
    }
  }
});
test('prototype cache is isolated and only references present assets',()=>{
  const sw=fs.readFileSync(require.resolve('../desktop/sw.js'),'utf8');
  assert.match(sw,/startsWith\('district-builder-'\)/);assert.doesNotMatch(sw,/startsWith\('mm-'\)/);
  for(const f of ['index.html','district.css','simulation.js','scene.js','app.js'])assert.ok(fs.existsSync(require.resolve('../desktop/'+f)));
});
