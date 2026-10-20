/* Direct interaction views. Rendering creates previews only; every purchase,
   voyage and time advance is committed by the authoritative command layer. */
(function(root){
  'use strict';
  function create({N,A,money,esc,btn,select,input,productList}){
    const name=id=>N.HUBS[id].name;
    const goods=Object.keys(N.GOODS),hubs=Object.keys(N.HUBS);
    const lines=q=>'<ul class="plan-costs">'+q.lines.map(l=>'<li><span>'+esc(l.label)+'</span><b>'+money(l.cost)+'</b></li>').join('')+'</ul>';
    function route(s,ui){
      const p=ui.route;if(!p)return '';
      const froms=Object.keys(s.warehouses);
      ui.routeQuotes={};
      const cards=['captain','sea','rail','air'].map(mode=>{
        const q=A.quoteDelivery(s,{...p,qty:/^\d+$/.test(p.qty)?Number(p.qty):NaN,mode});ui.routeQuotes[mode]=q;
        const label=mode==='captain'?'Your own ship':N.TRANSPORTS[mode].name;
        return '<article class="route-option '+(q.ok?'available':'unavailable')+'"><h3>'+esc(label)+'</h3>'+(q.ok?'<p class="route-total">'+money(q.totalCost)+'</p><p>Arrives <b>day '+q.arrivalDay+'</b> · '+q.days+' days</p>'+'<details class="route-cost-detail"><summary>Cost breakdown ▾</summary>'+lines(q)+'</details><p class="net-note">Cash after confirmation: '+money(q.cashAfter)+'.</p>'+ (q.deadline?'<p class="'+(q.late?'net-warning':'net-note')+'">Order due day '+q.deadline+' · '+(q.late?'Too late for this order.':(q.deadline-q.arrivalDay)+' days of deadline margin.')+'</p>':'')+'<p class="net-note">'+esc(q.revenueType)+': '+money(q.revenue)+'.</p><p class="net-note">Contribution estimate: '+money(q.contribution)+' ▾</summary><p class="net-note">Uses current replacement cargo cost and transport; excludes facilities and upkeep. Not historical profit.'+(p.orderId?' Order payment still requires fulfilment.':' Future prices can change.')+'</p></details>'+(q.reserveWarning?'<p class="net-warning">Leaves less than three days of upkeep in cash.</p>':'')+btn('Confirm '+esc(label),'route-confirm','primary',' data-mode="'+mode+'"'+(q.late?' disabled':'')):'<p class="net-note">'+esc(q.error)+'</p>')+'</article>';
      }).join('');
      return '<section class="net-card route-planner" aria-label="Delivery planner"><div class="net-card-head"><div><span class="net-kicker">One reviewed transaction</span><h2>Plan a delivery</h2></div>'+btn('Cancel plan','route-cancel','ghost')+'</div><p class="net-note">Tap a hub on the map to set the destination. Changing or cancelling this plan spends nothing. Confirm once to perform only the listed actions.</p><div class="net-form">'+select('routeFrom','Origin warehouse',p.from,froms.map(id=>[id,name(id)]))+select('routeTo','Delivery destination',p.to,hubs.filter(id=>id!==p.from).map(id=>[id,name(id)]))+select('routeGood','Delivery cargo',p.good,goods.map(id=>[id,N.GOODS[id].name]))+input('routeQty','Delivery tonnes',p.qty)+'</div><div class="plan-toggles">'+btn((p.buyMissing?'✓ ':'')+'Buy missing cargo locally','route-buy','',' aria-pressed="'+p.buyMissing+'"')+btn((p.buildDestination?'✓ ':'')+'Include destination warehouse if needed','route-build','',' aria-pressed="'+p.buildDestination+'"')+'</div>'+(p.orderId?'<p class="net-guidance">Planning '+esc(N.orderTerms(s,p.orderId).name)+'. Changing cargo, tonnes or destination switches to a market delivery.</p>':'')+'<div class="route-options">'+cards+'</div></section>';
    }
    function factory(s,ui,hub,batches,build=false,recipe='food'){
      const q=A.quoteProduction(s,hub,Number(batches),build,recipe);
      ui.factoryQuote=q;ui.factoryArgs={hub,batches:Number(batches),build,recipe};
      return '<section class="net-card smart-factory" aria-label="Production shortcut"><span class="net-kicker">Source + manufacture</span><h2>'+(build?'Start your food chain':'Buy missing inputs & produce')+'</h2><p class="net-note">Uses your existing stock first. Buys only the missing inputs at this hub, then starts '+esc(batches)+' batches. No automatic loans or ongoing spending policy.</p>'+(q.ok?lines(q)+'<div class="plan-summary"><b>Total '+money(q.totalCost)+'</b><span>Finishes day '+q.finishDay+' · '+esc(productList(q.output))+'</span></div>'+(q.reserveWarning?'<p class="net-warning">Leaves less than three days of upkeep in cash.</p>':'')+btn(build?'Build, source & produce':'Buy inputs & start production','smart-produce','primary'):'<p class="net-warning">'+esc(q.error)+'</p>')+'</section>';
    }
    function decision(s){
      if(!N.customerOffer(s))return '';
      return '<section class="net-card customer-decision" aria-label="Customer decision"><span class="net-kicker">A commercial choice · no immediate payout</span><h2>The pantry buyer needs an earlier delivery</h2><p>"Can you prioritise our 30 tonnes of packaged food? We can pay more for delivery by day 18. Otherwise, let’s keep our agreement—or extend it at a lower price."</p><div class="decision-options">'+btn('Priority · RM 130,000 · due day 18','customer-choice','',' data-choice="priority"'+(s.day>18?' disabled':''))+btn('Keep original · RM 110,000 · due day 30','customer-choice','',' data-choice="standard"')+btn('Extend · RM 95,000 · due day 35','customer-choice','',' data-choice="extension"')+'</div><p class="net-note">One choice per company. Payment is earned only by fulfilling the order from delivered stock. Ignoring this offer retains the original terms; next-event advance pauses here, but one-day advance remains available.</p></section>';
    }
    function briefing(s,ui){
      const ready=A.readyOrders(s);
      let task='';
      if(ready.length){task='<h2>Ready to close the sale</h2>'+ready.map(id=>{const o=N.orderTerms(s,id);return btn('Fulfil '+esc(o.name)+' · '+money(o.payment),'fulfill-order','primary',' data-order="'+id+'"');}).join('');}
      else if(s.captain?.orders.straits==='open'){
        const moving=s.shipments.some(j=>j.to==='singapore'&&j.good==='palm')||s.captain.voyage?.to==='singapore'&&s.captain.cargo.palm>0;
        task=moving?'<h2>Your first delivery is on its way</h2><p>Use Next event below to reach the next completion. Factories and other freight advance with it.</p>':'<h2>Your first delivery, without the paperwork</h2><p>Review 20 t palm oil from Klang to Singapore. The planner can include the warehouse, missing cargo and transport in one confirmation.</p>'+btn('Plan the Straits delivery','plan-order','primary',' data-order="straits"');
      }else if(!s.factories.klang&&!s.stats.produced){task='<h2>Build your first production chain</h2><p>Review a food processor, missing inputs and 10 production batches together.</p>'+btn('Review food chain','food-chain','primary');}
      else if(s.captain?.orders.pantry==='open'){
        const origin=Object.keys(s.warehouses).find(id=>id!=='singapore'&&s.warehouses[id].stock.food>=30);
        task=origin?'<h2>Your finished goods are ready</h2><p>Plan delivery to the pantry buyer using your own ship or chartered freight.</p>'+btn('Plan pantry delivery','plan-order','primary',' data-order="pantry" data-from="'+origin+'"'):'<h2>Keep the company moving</h2><p>Inspect a factory or shipment below. Next event stops for completed work, orders and decisions.</p>';
      }else task='<h2>Choose the next profitable move</h2><p>Plan a route from any owned warehouse, or inspect orders for the next delivery opportunity.</p>'+btn('Plan a delivery','route-open','primary');
      return '<section class="net-card company-briefing"><span class="net-kicker">Operations desk</span>'+task+'</section>';
    }
    function ready(s){
      const ids=A.readyOrders(s);if(!ids.length)return '';
      return '<section class="net-guidance ready-orders" aria-label="Ready orders"><b>Delivered stock is ready for an order.</b>'+ids.map(id=>btn('Fulfil '+esc(N.orderTerms(s,id).name),'fulfill-order','',' data-order="'+id+'"')).join('')+'</section>';
    }
    function report(s,ui){
      const r=ui.report;if(!r)return '';
      const effect=ui.effects&&!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      return '<section class="net-card operations-report'+(effect?' report-enter':'')+'" aria-label="Operations report"><div class="net-card-head"><b>Day '+r.fromDay+' → '+r.toDay+' · '+money(r.upkeep)+' upkeep</b>'+btn('Dismiss','report-close','ghost')+'</div><details><summary>'+esc(r.message||'Company advanced.')+' '+r.events.length+' updates ▾</summary>'+(r.events.length?'<ul>'+r.events.map(e=>'<li><b>Day '+e.day+'</b> '+esc(e.text)+'</li>').join('')+'</ul>':'<p>No arrivals or factory completions.</p>')+'<p class="net-note">The ledger is already updated. Animation or dismissal never changes the outcome.</p></details></section>';
    }
    function daybar(s,ui){
      const q=A.quoteAdvance(s);ui.advanceQuote=q;
      return '<footer class="net-daybar smart-daybar"><div><b>'+(q.ok?'Next event · day '+q.toDay:'Time is in your hands')+'</b><p>'+(q.ok?q.days+' days · '+money(q.upkeep)+' upkeep / interest · '+esc(q.message):esc(q.error))+'</p></div><div class="day-actions">'+btn(q.ok?'Next event · day '+q.toDay:'Next event','advance-next','primary',q.ok?'':' disabled')+btn('Advance to day '+(s.day+1),'advance','ghost')+'</div></footer>';
    }
    return {route,factory,decision,briefing,ready,report,daybar};
  }
  root.MMCompanyPlay={create};
})(typeof window!=='undefined'?window:globalThis);
