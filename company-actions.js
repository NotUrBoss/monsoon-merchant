/* Fewer clicks, same ledger. Composite commands simulate existing commands on a
   validated copy. Quotes never mutate; commits re-quote and reject stale state.
   No automatic borrowing, selling, order payout or real-time advancement. */
(function(root){
  'use strict';
  const N=typeof module!=='undefined'&&module.exports?require('./logistics.js'):root.MMNetwork;
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const fail=error=>({ok:false,error});
  const whole=n=>Number.isSafeInteger(n)&&n>0&&n<=100000;
  const total=o=>Object.values(o).reduce((a,b)=>a+b,0);
  function copy(s){return JSON.parse(N.serialize(s));}
  function guard(s){const v=N.validate(s);return !v.ok?v:s.status!=='active'?fail('This company season has ended.'):{ok:true};}
  function commit(s,expected,simulate){
    const v=guard(s);if(!v.ok)return v;
    if(typeof expected!=='string'||expected!==N.serialize(s))return fail('This plan is out of date. Review the refreshed quote before confirming.');
    const q=simulate();if(!q.ok)return q;
    if(q.late)return fail('This delivery would miss the selected order deadline. Choose another mode or a market delivery.');
    const valid=N.validate(q.nextState);if(!valid.ok)return valid;
    const {nextState,snapshot,...result}=q;Object.assign(s,nextState);return result;
  }
  function quoteDelivery(s,p){
    const v=guard(s);if(!v.ok)return v;
    if(!p||!own(N.HUBS,p.from)||!own(N.HUBS,p.to)||p.from===p.to||!own(N.GOODS,p.good)||!whole(p.qty)||!['sea','rail','air','captain'].includes(p.mode)||typeof p.buyMissing!=='boolean'||typeof p.buildDestination!=='boolean')return fail('Choose two different hubs, a product, transport and positive whole tonnes.');
    if(p.orderId!==null&&p.orderId!==undefined&&!own(N.ORDERS,p.orderId))return fail('Choose a valid delivery order.');
    if(!s.warehouses[p.from])return fail('The origin needs an existing warehouse.');
    if(p.mode==='captain'&&(!s.captain||s.captain.voyage||s.captain.port!==p.from))return fail('Your captain must be docked at the origin. Charter freight or reposition from Captain.');
    if(p.mode==='captain'&&total(s.captain.cargo))return fail('Your hold already contains cargo. Use Captain to sail or unload before making a combined plan.');
    const draft=copy(s),lines=[];
    if(!draft.warehouses[p.to]){
      if(!p.buildDestination)return fail('The destination needs a warehouse. Enable the warehouse option to include its cost.');
      const b=N.buildWarehouse(draft,p.to);if(!b.ok)return b;
      lines.push({label:'Destination warehouse',cost:b.cost});
    }
    const missing=Math.max(0,p.qty-draft.warehouses[p.from].stock[p.good]);
    if(missing){
      if(!p.buyMissing)return fail(`Origin is short of ${missing} t. Enable buy missing cargo to include a local purchase.`);
      const b=N.trade(draft,p.from,p.good,missing,'buy');if(!b.ok)return b;
      lines.push({label:`Buy ${missing} t ${N.GOODS[p.good].name}`,cost:b.cost});
    }
    let trip;
    if(p.mode==='captain'){
      const t=N.transferCargo(draft,p.good,p.qty,'load');if(!t.ok)return t;
      trip=N.sail(draft,p.to);
    }else trip=N.dispatch(draft,p.from,p.to,p.mode,p.good,p.qty);
    if(!trip.ok)return trip;
    lines.push({label:p.mode==='captain'?'Own ship: fuel, crew and selected insurance':'Chartered freight',cost:trip.cost});
    const order=p.orderId?N.orderTerms(s,p.orderId):null;
    if(order&&(order.good!==p.good||order.hub!==p.to||order.qty!==p.qty||s.captain?.orders[p.orderId]!=='open'))return fail('This plan no longer matches the selected open order.');
    const late=!!order&&trip.arrivalDay>order.deadline;
    const revenue=order?order.payment:N.prices(s,p.to)[p.good].sell*p.qty;
    const replacementCost=N.prices(s,p.from)[p.good].buy*p.qty;
    return {ok:true,snapshot:N.serialize(s),nextState:draft,lines,totalCost:s.cash-draft.cash,cashAfter:draft.cash,arrivalDay:trip.arrivalDay,days:trip.days,mode:p.mode,missing,deadline:order?.deadline||null,late,revenue,revenueType:order?'Fixed order payment on fulfilment':'Estimate at today’s destination market',contribution:revenue-replacementCost-trip.cost,reserveWarning:draft.cash<N.dailyUpkeep(draft)*3};
  }
  function deliver(s,p,expected){return commit(s,expected,()=>quoteDelivery(s,p));}
  function quoteProduction(s,hub,batches,build=false,recipeId='food'){
    const v=guard(s);if(!v.ok)return v;
    if(!own(N.HUBS,hub)||!s.warehouses[hub]||!whole(batches)||typeof build!=='boolean'||!own(N.RECIPES,recipeId))return fail('Choose a warehouse and positive whole batches.');
    const draft=copy(s),lines=[];
    if(!draft.factories[hub]){
      if(!build)return fail('Build a factory first.');
      const r=N.buildFactory(draft,hub,recipeId);if(!r.ok)return r;lines.push({label:'Build '+N.RECIPES[recipeId].name,cost:r.cost});
    }
    const id=draft.factories[hub].recipeId,r=N.RECIPES[id];
    if(batches>r.maxBatches)return fail(`This factory supports at most ${r.maxBatches} batches.`);
    if(draft.production.some(j=>j.hub===hub))return fail('This factory is already producing.');
    for(const [good,n]of Object.entries(r.inputs)){
      const missing=Math.max(0,n*batches-draft.warehouses[hub].stock[good]);
      if(missing){const b=N.trade(draft,hub,good,missing,'buy');if(!b.ok)return b;lines.push({label:`Buy ${missing} t ${N.GOODS[good].name}`,cost:b.cost});}
    }
    const job=N.startProduction(draft,hub,id,batches);if(!job.ok)return job;
    lines.push({label:'Processing fee',cost:job.cost});
    return {ok:true,snapshot:N.serialize(s),nextState:draft,lines,totalCost:s.cash-draft.cash,cashAfter:draft.cash,finishDay:job.finishDay,output:job.output,reserveWarning:draft.cash<N.dailyUpkeep(draft)*3};
  }
  function produce(s,hub,batches,build,recipeId,expected){return commit(s,expected,()=>quoteProduction(s,hub,batches,build,recipeId));}
  function readyOrders(s){return Object.keys(N.ORDERS).filter(id=>N.quoteOrder(s,id).ok);}
  function stopNow(s){
    if(N.customerOffer(s))return {reason:'customer',message:'Customer decision ready. Keep the original terms or choose a new agreement.'};
    const ready=readyOrders(s);if(ready.length)return {reason:'order',orderId:ready[0],message:'An order is ready to fulfil. Review it before advancing further.'};
    const due=Object.keys(N.ORDERS).find(id=>s.captain?.orders[id]==='open'&&N.orderTerms(s,id).deadline===s.day);
    if(due)return {reason:'deadline',orderId:due,message:'An open order is due today. Review it, or explicitly advance one day.'};
    return null;
  }
  function quoteAdvance(s){
    const v=guard(s);if(!v.ok)return v;
    const blocked=stopNow(s);if(blocked)return {ok:false,...blocked,error:blocked.message};
    if(!s.shipments.length&&!s.production.length&&!s.captain?.voyage)return fail('No work is in progress. Plan a job or advance one day manually.');
    const draft=copy(s),events=[];let upkeep=0,reason='completion',message='Operations updated.';
    while(draft.day<N.SEASON_DAYS){
      const cost=N.dailyUpkeep(draft);
      // A conservative three-day operating reserve; one-day advance remains an explicit override.
      if(draft.cash-cost<cost*3){reason='reserve';message='Stopped before spending below a three-day upkeep reserve.';break;}
      const day=N.advanceDay(draft);if(!day.ok)return day;
      upkeep+=day.upkeep;events.push(...day.events.map(text=>({day:draft.day,text})));
      if(day.finished){reason='season';message='Season settled.';break;}
      const stop=stopNow(draft);if(stop){reason=stop.reason;message=stop.message;break;}
      if(day.events.length){reason='completion';message='A shipment arrived or a factory completed work.';break;}
      if(draft.day===31){reason='monsoon';message='The monsoon changed. Review your next routes.';break;}
    }
    if(draft.day===s.day)return {ok:false,error:message,reason};
    return {ok:true,snapshot:N.serialize(s),nextState:draft,fromDay:s.day,toDay:draft.day,days:draft.day-s.day,upkeep,events,reason,message,finished:draft.status==='finished'};
  }
  function advanceNext(s,expected){return commit(s,expected,()=>quoteAdvance(s));}
  const api={quoteDelivery,deliver,quoteProduction,produce,readyOrders,quoteAdvance,advanceNext};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MMCompanyActions=api;
})(typeof window!=='undefined'?window:globalThis);
