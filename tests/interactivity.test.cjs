'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const N=require('../logistics.js'),A=require('../company-actions.js');
const ok=q=>{assert.equal(q.ok,true,q.error);return q;};
const fresh=()=>N.create('less-clicking',true);
const copy=s=>JSON.parse(N.serialize(s));
const until=(s,day)=>{while(s.day<day)ok(N.advanceDay(s));};
const plan=(extra={})=>({from:'klang',to:'singapore',good:'palm',qty:20,mode:'captain',buyMissing:true,buildDestination:true,orderId:'straits',...extra});
const rejects=(s,fn)=>{const before=N.serialize(s);assert.equal(fn().ok,false);assert.equal(N.serialize(s),before);};

test('route quotes for all four modes never change company state',()=>{
 const s=fresh(),before=N.serialize(s);
 for(const mode of ['captain','sea','air','rail']){const q=A.quoteDelivery(s,plan({mode}));assert.equal(N.serialize(s),before);if(mode==='rail')assert.equal(q.ok,false);else{ok(q);assert.equal(q.totalCost,q.lines.reduce((n,l)=>n+l.cost,0));}}
});
test('one delivery equals warehouse, purchase, load and sail through original commands',()=>{
 const s=fresh(),manual=copy(s),p=plan(),q=ok(A.quoteDelivery(s,p));
 ok(N.buildWarehouse(manual,p.to));ok(N.trade(manual,p.from,p.good,p.qty,'buy'));ok(N.transferCargo(manual,p.good,p.qty,'load'));ok(N.sail(manual,p.to));
 ok(A.deliver(s,p,q.snapshot));assert.deepEqual(s,manual);assert.equal(N.warehouseUsage(s,'singapore').reserved,20);
});
test('one charter uses the original cost and does not move the captain',()=>{
 const s=fresh(),p=plan({mode:'sea'}),q=ok(A.quoteDelivery(s,p));ok(A.deliver(s,p,q.snapshot));
 assert.equal(s.captain.port,'klang');assert.equal(s.captain.voyage,null);assert.equal(s.shipments.length,1);assert.equal(s.cash,500000-q.totalCost);
});
test('stale and duplicate confirmations cannot repeat money or cargo mutations',()=>{
 const s=fresh(),p=plan(),q=ok(A.quoteDelivery(s,p));ok(A.deliver(s,p,q.snapshot));rejects(s,()=>A.deliver(s,p,q.snapshot));
 const t=fresh(),old=ok(A.quoteDelivery(t,p));ok(N.trade(t,'klang','rice',1,'buy'));rejects(t,()=>A.deliver(t,p,old.snapshot));
});
test('invalid routes and quantities reject atomically including prototype keys',()=>{
 for(const change of [{from:'__proto__'},{to:'constructor'},{good:'prototype'},{mode:'rocket'},{qty:0},{qty:-1},{qty:1.2},{qty:NaN},{qty:'20'},{qty:Infinity},{orderId:'constructor'},{from:'singapore'}]){
  const s=fresh();rejects(s,()=>A.deliver(s,plan(change),N.serialize(s)));
 }
});
test('insufficient freight cash after provisional construction and purchase rolls everything back',()=>{
 const s=fresh(),p=plan({mode:'air'});s.cash=105000;rejects(s,()=>A.deliver(s,p,N.serialize(s)));assert.deepEqual(Object.keys(s.warehouses),['klang']);
});
test('warehouse overbooking and unavailable rail never spend provisional funds',()=>{
 const s=fresh();ok(N.buildWarehouse(s,'singapore'));ok(N.trade(s,'singapore','coal',150,'buy'));rejects(s,()=>A.deliver(s,plan(),N.serialize(s)));
 const t=fresh();rejects(t,()=>A.deliver(t,plan({mode:'rail'}),N.serialize(t)));
});
test('owned ship cannot teleport or unexpectedly dispatch existing hold cargo',()=>{
 const s=fresh();ok(N.buildWarehouse(s,'singapore'));rejects(s,()=>A.deliver(s,plan({from:'singapore',to:'klang',orderId:null}),N.serialize(s)));
 ok(N.trade(s,'klang','rice',1,'buy'));ok(N.transferCargo(s,'rice',1,'load'));rejects(s,()=>A.deliver(s,plan(),N.serialize(s)));
});
test('existing cargo is reused and never repurchased',()=>{
 const s=fresh();ok(N.trade(s,'klang','palm',15,'buy'));const q=ok(A.quoteDelivery(s,plan()));assert.equal(q.missing,5);ok(A.deliver(s,plan(),q.snapshot));assert.equal(s.captain.cargo.palm,20);
});
test('warehouse and purchase options are explicit permissions',()=>{
 for(const patch of [{buildDestination:false},{buyMissing:false}]){const s=fresh();rejects(s,()=>A.deliver(s,plan(patch),N.serialize(s)));}
});
test('late order routes may be previewed but never confirmed as an on-time contract delivery',()=>{
 const s=fresh();until(s,14);const p=plan(),q=ok(A.quoteDelivery(s,p));assert.equal(q.late,true);rejects(s,()=>A.deliver(s,p,q.snapshot));
});
test('order route must match the contracted destination, product and quantity',()=>{
 for(const patch of [{to:'bangkok'},{good:'rice'},{qty:21}]){const s=fresh();rejects(s,()=>A.deliver(s,plan(patch),N.serialize(s)));}
});
test('smart manufacturing is identical to all original manual steps',()=>{
 const s=fresh(),m=copy(s),q=ok(A.quoteProduction(s,'klang',10,true,'food'));
 ok(N.buildFactory(m,'klang','food'));ok(N.trade(m,'klang','rice',20,'buy'));ok(N.trade(m,'klang','palm',10,'buy'));ok(N.startProduction(m,'klang','food',10));
 ok(A.produce(s,'klang',10,true,'food',q.snapshot));assert.deepEqual(s,m);assert.equal(q.totalCost,q.lines.reduce((n,l)=>n+l.cost,0));
});
test('smart manufacturing buys missing inputs only and refuses a duplicate job',()=>{
 const s=fresh();ok(N.buildFactory(s,'klang','food'));ok(N.trade(s,'klang','rice',10,'buy'));
 const q=ok(A.quoteProduction(s,'klang',10));assert(q.lines.some(l=>l.label==='Buy 10 t Rice'));
 ok(A.produce(s,'klang',10,false,'food',q.snapshot));rejects(s,()=>A.produce(s,'klang',10,false,'food',N.serialize(s)));
});
test('a failed production fee leaves newly purchased inputs and cash unchanged',()=>{
 const s=fresh();ok(N.buildFactory(s,'klang','food'));s.cash=1;rejects(s,()=>A.produce(s,'klang',10,false,'food',N.serialize(s)));
});
test('manufacturing rejects invalid batches, unknown hubs and missing factory permission',()=>{
 for(const batches of [0,-1,1.5,11,NaN,Infinity]){const s=fresh();rejects(s,()=>A.produce(s,'klang',batches,true,'food',N.serialize(s)));}
 const s=fresh();rejects(s,()=>A.produce(s,'__proto__',1,true,'food',N.serialize(s)));rejects(s,()=>A.produce(s,'klang',1,false,'food',N.serialize(s)));
});
test('next-event preview is pure and its result equals daily advancement',()=>{
 const s=fresh(),q=ok(A.quoteDelivery(s,plan()));ok(A.deliver(s,plan(),q.snapshot));const before=N.serialize(s),next=ok(A.quoteAdvance(s)),m=copy(s);
 assert.equal(N.serialize(s),before);until(m,next.toDay);ok(A.advanceNext(s,next.snapshot));assert.deepEqual(s,m);assert.equal(s.captain.orders.straits,'open');assert.equal(A.quoteAdvance(s).ok,false);
});
test('next-event cannot be used without work in progress',()=>{const s=fresh();rejects(s,()=>A.advanceNext(s,N.serialize(s)));});
test('next-event chooses the earliest concurrent factory or cargo completion',()=>{
 const s=fresh(),p=plan({to:'sydney',good:'coal',qty:10,mode:'sea',orderId:null});ok(A.deliver(s,p,ok(A.quoteDelivery(s,p)).snapshot));
 ok(A.produce(s,'klang',1,true,'food',ok(A.quoteProduction(s,'klang',1,true,'food')).snapshot));
 const q=ok(A.quoteAdvance(s));assert.equal(q.toDay,3);ok(A.advanceNext(s,q.snapshot));assert.equal(s.stats.produced,3);assert.equal(s.shipments.length,1);
});
test('next-event stops on the customer decision and persists the reply',()=>{
 const s=fresh();until(s,7);const p=plan({to:'sydney',qty:10,good:'coal',orderId:null,mode:'sea'});ok(A.deliver(s,p,ok(A.quoteDelivery(s,p)).snapshot));
 const q=ok(A.quoteAdvance(s));assert.equal(q.toDay,8);assert.equal(q.reason,'customer');ok(A.advanceNext(s,q.snapshot));rejects(s,()=>A.advanceNext(s,N.serialize(s)));
 ok(N.chooseCustomer(s,'extension'));assert.equal(N.orderTerms(s,'pantry').deadline,35);assert.deepEqual(ok(N.deserialize(N.serialize(s))).state,s);
});
test('next-event stops at an order deadline before expiry even with long freight in transit',()=>{
 const s=fresh();until(s,14);ok(N.chooseCustomer(s,'standard'));const p=plan({to:'sydney',qty:10,good:'coal',orderId:null,mode:'sea'});ok(A.deliver(s,p,ok(A.quoteDelivery(s,p)).snapshot));
 const q=ok(A.quoteAdvance(s));assert.equal(q.toDay,15);assert.equal(q.reason,'deadline');ok(A.advanceNext(s,q.snapshot));assert.equal(s.captain.orders.straits,'open');
});
test('cash-reserve stop never silently borrows or skips upkeep',()=>{
 const s=fresh();ok(A.deliver(s,plan(),ok(A.quoteDelivery(s,plan())).snapshot));s.cash=1500;rejects(s,()=>A.advanceNext(s,N.serialize(s)));assert.equal(s.debt,0);
});
test('customer reply changes terms but pays no cash and cannot be repeated',()=>{
 const s=fresh();until(s,8);const before=s.cash;ok(N.chooseCustomer(s,'priority'));assert.equal(s.cash,before);assert.equal(N.orderTerms(s,'pantry').payment,130000);
 rejects(s,()=>N.chooseCustomer(s,'extension'));assert.equal(N.orderTerms(fresh(),'pantry').payment,110000);
});
test('priority deadline-day fulfilment pays the selected contract exactly once, debt first',()=>{
 const s=fresh();until(s,8);ok(N.chooseCustomer(s,'priority'));ok(N.buildWarehouse(s,'singapore'));ok(N.trade(s,'singapore','food',30,'buy'));until(s,18);ok(N.borrow(s,10000));const before=s.cash;
 ok(N.fulfillOrder(s,'pantry'));assert.equal(s.cash,before+120000);assert.equal(s.debt,0);assert.equal(s.warehouses.singapore.stock.food,0);rejects(s,()=>N.fulfillOrder(s,'pantry'));
});
test('agreed priority and extension deadlines are also enforced by expiry and save validation',()=>{
 for(const [choice,deadline] of [['priority',18],['extension',35],['standard',30]]){
  const s=fresh();until(s,8);ok(N.chooseCustomer(s,choice));until(s,deadline);assert.equal(s.captain.orders.pantry,'open');until(s,deadline+1);assert.equal(s.captain.orders.pantry,'expired');ok(N.deserialize(N.serialize(s)));
 }
});
test('late priority and malformed customer agreements reject without changing the company',()=>{
 const s=fresh();until(s,19);rejects(s,()=>N.chooseCustomer(s,'priority'));rejects(s,()=>N.chooseCustomer(s,'__proto__'));
 for(const customer of [{choice:'priority',decidedDay:1},{choice:'standard',decidedDay:0},{choice:'bad',decidedDay:8},{choice:'pending',decidedDay:8},{choice:'priority',decidedDay:19},{choice:'standard',decidedDay:8,bonus:999}]){const t=copy(s);t.customer=customer;assert.equal(N.deserialize(JSON.stringify(t)).ok,false);}
});
test('v1 and v2 migration preserves money, cargo, concurrent clocks and original text',()=>{
 for(const version of [1,2]){
  const s=N.create('old',version===2);ok(N.buildWarehouse(s,'singapore'));ok(N.trade(s,'klang','rice',10,'buy'));ok(N.dispatch(s,'klang','singapore','sea','rice',10));
  const old=copy(s);old.version=version;delete old.customer;if(version===1)delete old.captain;
  const raw=JSON.stringify(old),m=ok(N.deserialize(raw)).state;assert.equal(m.version,3);assert.equal(m.cash,s.cash);assert.deepEqual(m.shipments,s.shipments);assert.deepEqual(m.warehouses,s.warehouses);assert.equal(raw,JSON.stringify(old));
 }
});
test('all three customer paths can finish a full season and restore a valid settlement',()=>{
 for(const choice of ['priority','extension','standard']){const s=fresh();until(s,8);ok(N.chooseCustomer(s,choice));until(s,60);ok(N.deserialize(N.serialize(s)));rejects(s,()=>A.advanceNext(s,N.serialize(s)));}
});
test('100 seeded smart-operation campaigns stay valid through previews, confirmations, saves and season settlement',()=>{
 for(let i=0;i<100;i++){
  let s=N.create('smart-'+i,true);const p=plan({mode:i%2?'sea':'captain'});ok(A.deliver(s,p,ok(A.quoteDelivery(s,p)).snapshot));
  for(let day=1;day<60;day++){
   if(N.customerOffer(s))ok(N.chooseCustomer(s,['standard','priority','extension'][i%3]));
   for(const id of A.readyOrders(s))ok(N.fulfillOrder(s,id));
   if(!s.factories.klang){const q=A.quoteProduction(s,'klang',10,true,'food');if(q.ok)ok(A.produce(s,'klang',10,true,'food',q.snapshot));}
   const q=A.quoteAdvance(s);if(q.ok)ok(A.advanceNext(s,q.snapshot));else ok(N.advanceDay(s));
   ok(N.validate(s));s=ok(N.deserialize(N.serialize(s))).state;if(s.status==='finished')break;
  }
  assert.equal(s.status,'finished');
 }
});
test('offline shell includes both interaction modules and release versions remain aligned',()=>{
 const root=path.join(__dirname,'..'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const name of ['company-actions.js','company-play.js']){assert(sw.includes(name));assert(html.includes(name));}
 assert(sw.includes('mm-2.0.0'));
 for(const name of ['art.js','pixel.js','sfx.js']){assert(sw.includes(name));assert(html.includes(name));}
});
