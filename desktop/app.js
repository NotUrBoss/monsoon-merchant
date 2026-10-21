(function () {
  'use strict';
  const E=window.DistrictSim,app=document.getElementById('app');
  const money=n=>'RM '+Math.round(n).toLocaleString('en');
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state=E.create(),panel='overview',view='district',selected=null,buildType='factory',plan=null;
  let speed=0,timer=null,lastSaved=null,locked=false,storageError='',rawRecovery=null,effects=true,noticeTimer=null;
  try {
    lastSaved=localStorage.getItem(E.KEY);
    if(lastSaved){const r=E.deserialize(lastSaved);if(r.ok)state=r.state;else {locked=true;rawRecovery=lastSaved;storageError=r.error+' Export the original backup before starting a new district.';}}
  } catch (_) {storageError='Browser storage is unavailable. Progress is not saved; export a backup before closing.';}
  function pause(){speed=0;if(timer)clearInterval(timer);timer=null;}
  function current(){
    if(locked)return false;
    try{if(localStorage.getItem(E.KEY)!==lastSaved){pause();locked=true;storageError='Another tab changed this district. Reload to use its save; this tab will not overwrite it.';render();return false;}}
    catch(_){/* In-memory export remains possible when browser storage is unavailable. */}
    return true;
  }
  function save(){
    if(!current())return false;
    try{const text=E.serialize(state);localStorage.setItem(E.KEY,text);lastSaved=text;storageError='';return true;}
    catch(_){pause();storageError='Saving failed. The current district remains in memory. Export a backup, or retry saving before continuing.';return false;}
  }
  function tell(text){const n=document.getElementById('notice');n.textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>n.textContent='',6500);}
  function tick(){
    if(!current()){render();return;}
    const r=E.advance(state,1);
    if(!r.ok){pause();tell(r.error);}else{if(r.stop){pause();tell(r.stop);}save();}
    render();
  }
  function play(value){
    pause();
    if(value&&!locked&&!storageError&&!plan){speed=value;timer=setInterval(tick,1600/value);}
    render();
  }
  function review(command,title,description){
    pause();const q=E.preview(state,command);
    if(!q.ok){tell(q.error);render();return;}
    plan={...q,title,description};panel='plan';render();
  }
  function act(command){if(!current())return false;const r=E.command(state,command,state.revision);if(!r.ok)tell(r.error);else save();render();return r.ok;}
  function row(label,value,cls=''){return `<div class="detailrow ${cls}"><span>${label}</span><strong>${value}</strong></div>`;}
  function stats(){return `<div class="chain"><div><small>Food in storage</small><strong>${state.stock.food} <small>t</small></strong></div><div><small>Factory batches</small><strong>${state.jobs.length} <small>active</small></strong></div><div><small>Local sales</small><strong>${state.totals.localSold} <small>t</small></strong></div><div><small>Export sales</small><strong>${state.totals.exportSold} <small>t</small></strong></div></div>`;}
  function overview(){
    const started=E.level(state,'factory')>0;
    return `<span class="eyebrow">YOUR COMPANY, IN MOTION</span><h2>${started?'Let the business work.':'Build once. Keep growing.'}</h2><p>${started?'Approved policies handle the routine work. Your next decision is where to expand—not when to start another batch.':'Start with one food factory and a distribution depot. Ingredients, production and local sales will repeat automatically.'}</p>`+
      (!started?`<div class="card"><span class="pill">First business</span><h3>Port Klang food company</h3>${row('Factory + depot',money(120000))}${row('Fixed costs after opening',money(600)+'/day')}${row('Automatic spending limit',money(20000)+'/day')}${row('Protected purchase reserve',money(100000))}<p>The RM 500,000 starting cash and founding warehouse are supplied. All further investment and running costs are real.</p><button class="primary wide" data-action="starter" ${locked?'disabled':''}>Review food business</button></div>`:
      `<div class="card"><span class="pill ${state.policy.enabled?'':'warn'}">${state.policy.enabled?'Automation approved':'Automation off'}</span><p>${state.policy.sales==='local'?'Local grocers buy up to '+3*E.level(state,'depot')+' t/day. Your factory replenishes ingredients and repeats production.':state.policy.sales==='balanced'?'Serve local grocers with 1 t/day and export surplus to Singapore.':'Send food to Singapore. Local sales are disabled by your policy.'}</p><button class="wide" data-action="panel" data-panel="policy">Adjust operating policy</button></div>`)+stats()+
      (started&&!E.level(state,'port')?`<button class="wide" data-action="export">Review Singapore expansion · RM 85,000</button>`:'')+
      `<h3>A business that grows</h3>${row('Open a working food chain',started?'✓':'—')}${row('Sell 60 t locally',state.totals.localSold>=60?'✓':state.totals.localSold+'/60 t')}${row('Complete 3 export deliveries',state.totals.departures-(state.route.job?1:0)>=3?'✓':'In progress')}${row('Earn RM 100,000 operating profit',E.finance(state).operatingProfit>=100000?'✓':'Growing')}<p class="quiet">No 60-day reset in this prototype. Milestones grant no hidden cash. Best played on a desktop.</p>`;
  }
  function buildPanel(){
    return `<span class="eyebrow">BUILD YOUR DISTRICT</span><h2>Room for ambition.</h2><p>Choose a facility, then a vacant plot on the map. All plots have shared road and utility access. Terminals require waterfront plots 7 or 8.</p>`+
      Object.entries(E.CATALOG).map(([id,b])=>`<button class="buildingchoice ${buildType===id?'selected':''}" data-action="type" data-type="${id}"><span>${b.name}<small>+${money(b.upkeep)}/day · ${state.buildings.filter(x=>x.type===id).length}/${b.max} built</small></span><b>${money(b.cost)}</b></button>`).join('')+
      `<p class="quiet">Placement is visual in this first prototype. Travel-distance and road congestion simulation are not included. Buildings cannot yet be demolished.</p>`;
  }
  function inspect(){
    const b=state.buildings.find(b=>b.plot===selected);
    if(!b)return buildPanel();
    const d=E.CATALOG[b.type],job=state.jobs.find(j=>j.plot===b.plot);
    return `<span class="eyebrow">PLOT ${b.plot+1} · LEVEL ${b.level}</span><h2>${d.name}</h2><span class="pill">${job?'Producing until day '+job.finish:'Connected to district'}</span><p>${b.type==='warehouse'?'Shared stock and production reservations for the whole district.':b.type==='factory'?'4 t rice + 2 t palm oil → 6 t food per level, every two days. Inputs and processing are funded together.':b.type==='depot'?'Connects to local grocers. Capacity is 3 t/day per level. Sales respect your chosen policy.':'One repeating charter route to Singapore. The same vessel must return before the next dispatch.'}</p>`+
      row('Fixed daily cost',money(d.upkeep*b.level))+
      (b.type==='warehouse'?row('Occupied / reserved',`${E.used(state)} / ${E.capacity(state)} t`)+row('Rice',`${state.stock.rice} t`)+row('Palm oil',`${state.stock.palm} t`)+row('Finished food',`${state.stock.food} t`):b.type==='factory'?row('Potential output',`${3*b.level} t/day`)+row('Processing cost per batch',money(1300*b.level)):b.type==='depot'?row('Local service capacity',`${3*b.level} t/day`):row('Vessel capacity',`${18*b.level} t`))+
      (b.level<3?`<button class="wide" data-action="upgrade" data-plot="${b.plot}" ${job?'disabled':''}>Review upgrade · ${money(d.upgrade*b.level)}</button>`:'<p>Maximum prototype level reached.</p>')+
      (job?'<p class="quiet">Pause automation and let this batch finish before upgrading.</p>':'')+
      `<button class="wide" data-action="panel" data-panel="policy">Operating policy</button><button class="wide" data-action="panel" data-panel="overview">Back to overview</button>`;
  }
  function policyPanel(){const p=state.policy;return `<span class="eyebrow">SET THE RULES, NOT EVERY TASK</span><h2>Operating policy</h2><p>The simulation is paused while you edit. These permissions govern future cycles, not work already committed.</p><form id="policy-form"><label class="check"><input type="checkbox" name="enabled" ${p.enabled?'checked':''}> Enable automatic operations</label><label>Cash reserve (RM)<small>Blocks discretionary buying, processing and freight. Fixed upkeep can still use the reserve.</small><input name="reserve" type="number" min="0" max="1000000" step="1000" value="${p.reserve}" required></label><label>Daily automatic spending limit (RM)<small>Combined inputs + processing + freight. Fixed costs and approved construction are separate.</small><input name="dailyBudget" type="number" min="0" max="100000" step="100" value="${p.dailyBudget}" required></label><label>Input buffer<select name="inputBuffer">${[0,1,2,3].map(x=>`<option value="${x}" ${p.inputBuffer===x?'selected':''}>${x} extra production cycle${x===1?'':'s'}</option>`).join('')}</select></label><label>Sales strategy<select name="sales">${[['local','Local market first'],['balanced','1 t/day local + export surplus'],['export','Export only']].map(([k,v])=>`<option value="${k}" ${p.sales===k?'selected':''}>${v}</option>`).join('')}</select></label><button type="submit" class="wide primary" ${locked?'disabled':''}>Apply policy</button></form><p class="quiet">No automatic loans, buildings or new buyers. Procurement is local and instant in this prototype. No simulation runs while the app is closed.</p>`;}
  function routesPanel(){const j=state.route.job,port=E.level(state,'port');return `<span class="eyebrow">A ROUTE, NOT A REPEATED FORM</span><h2>Singapore food service</h2><p>A standing agreement accepts food on arrival and pays automatically. Freight is charged at departure. The vessel must make its return journey.</p>${row('Buyer price',money(3100)+'/t')}${row('Load / minimum',`${port?18*port:18} t / 6 t`)}${row('Freight',money(1800)+' + RM 100/t')}${row('Outbound passage',E.wet(state.day)?'4 days · monsoon':'3 days · calm')}${row('Selling policy',state.policy.sales)}<div class="card"><span class="pill ${port?'':'warn'}">${j?'Outbound':!port?'Not connected':state.route.returnDay>state.day?'Returning':'Ready for cargo'}</span><p>${j?`${j.qty} t reserved for Singapore. Arrives on day ${j.arrive}.`:port?`Next dispatch waits for 6 t of food, available budget and a returned vessel.${state.route.returnDay>state.day?' Returns on day '+state.route.returnDay+'.':''}`:'Build a terminal to enable this route. The expansion plan costs RM 85,000 and selects balanced sales.'}</p></div>${!port?'<button class="primary wide" data-action="export">Review export expansion</button>':'<button class="wide" data-action="panel" data-panel="policy">Change sales strategy</button>'}<p class="quiet">One regional route and one standing export buyer. No detailed carrier schedules, customer negotiations or rivals yet.</p>`;}
  function financePanel(){const f=E.finance(state),t=state.totals,h=state.history;const values=h.map(x=>x.revenue-x.cogs-x.freight-x.upkeep),max=Math.max(1,...values.map(Math.abs));const pts=values.map((v,i)=>`${10+i*260/Math.max(1,values.length-1)},${40-v/max*30}`).join(' ');return `<span class="eyebrow">FOLLOW THE MONEY</span><h2>Company accounts</h2><p>Operating profit is not cash flow. Unsold materials and food hold value; construction is an investment, not a daily expense.</p>${row('Sales revenue',money(t.revenue))}${row('Cost of goods sold','− '+money(t.cogs))}${row('Freight paid','− '+money(t.freight))}${row('Fixed costs','− '+money(t.upkeep))}${row('Operating profit',money(f.operatingProfit),'total')}<svg class="spark" viewBox="0 0 280 80" role="img" aria-label="Daily operating profit over the last 30 days"><path d="M10 40h260" stroke="#52707b" stroke-dasharray="3 4"/><polyline points="${pts}" fill="none" stroke="#b9e7c8" stroke-width="2"/></svg>${row('Construction / upgrades',money(t.capex))}${row('Stock + work in progress',money(f.inventory+f.work))}${row('Goods in transit',money(f.transit))}${row('Net cash change',money(f.cashFlow),'total')}${row('Starting / current cash',money(E.INITIAL_CASH)+' / '+money(state.cash))}<p class="quiet">Food is valued at RM 1,150/t, including processing. Freight is expensed on departure. This simplified prototype excludes depreciation, tax, credit and interest. Prices are game rules, not real market quotations.</p>`;}
  function planPanel(){return `<span class="eyebrow">REVIEW BEFORE COMMITTING</span><h2>${escape(plan.title)}</h2><p>${escape(plan.description)}</p>${row('One-time investment',money(plan.cost))}${row('Cash after approval',money(state.cash-plan.cost))}${row('Fixed costs after approval',money(plan.dailyUpkeep)+'/day')}${row('Automatic daily limit',money(plan.next.policy.dailyBudget))}${row('Purchase reserve',money(plan.next.policy.reserve))}<p class="quiet">Time is paused. Cancelling does not spend money or reserve inventory. Existing campaigns are unaffected.</p><button class="primary wide" data-action="confirm" ${locked?'disabled':''}>Approve · ${money(plan.cost)}</button><button class="wide" data-action="cancel">Cancel plan</button>`;}
  function render(){
    const f=E.finance(state),a=E.alerts(state),has=E.level(state,'factory');
    const content=panel==='plan'&&plan?planPanel():panel==='build'?buildPanel():panel==='policy'?policyPanel():panel==='routes'?routesPanel():panel==='finance'?financePanel():panel==='inspect'?inspect():overview();
    app.innerHTML=`<header class="topbar"><div class="brand"><div class="eyebrow">MONSOON MERCHANT</div><h1>District Builder</h1><span>Build a business. Not a to-do list.</span></div><div class="metrics"><div class="metric"><small>Available cash</small><strong>${money(state.cash)}</strong></div><div class="metric"><small>Operating profit · all time</small><strong class="${f.operatingProfit>=0?'positive':'negative'}">${money(f.operatingProfit)}</strong></div><div class="metric"><small>Stock + reserved</small><strong>${E.used(state)}<small style="display:inline"> / ${E.capacity(state)} t</small></strong></div></div><div class="timebar" aria-label="Simulation speed"><div class="day"><b>Day ${state.day}</b><small>${speed?'Running':'Paused'} · ${E.wet(state.day)?'Monsoon':'Calm seas'}</small></div>${[0,1,3,8].map(v=>`<button data-action="speed" data-speed="${v}" aria-label="${v?'Run at '+v+' times speed':'Pause simulation'}" aria-pressed="${speed===v}" class="${speed===v?'active':''}" ${locked||plan?'disabled':''}>${v?v+'×':'Ⅱ'}</button>`).join('')}<button data-action="step" aria-label="Advance one day" ${locked||plan?'disabled':''}>+1d</button></div></header>${storageError?`<div class="banner" role="alert">${escape(storageError)} <button data-action="backup">Export backup</button> ${locked?'':'<button data-action="retry-save">Retry saving</button>'}</div>`:''}<div class="banner mobile-note">Desktop-first prototype: a wider screen is recommended. Controls remain available below the district.</div><div class="workspace"><main class="world"><div class="worldhead"><div><span class="eyebrow">${view==='district'?'YOUR FIRST BUSINESS DISTRICT':'REGIONAL CONNECTIONS'}</span><h2>${view==='district'?'Port Klang waterfront':'One company. A wider horizon.'}</h2><p>${has?'Your supply chain runs under the policies you approve.':'A warehouse, eight serviced plots and your next big idea.'}</p></div><div class="tabs" aria-label="World view">${['district','region'].map(v=>`<button data-action="view" data-view="${v}" class="${view===v?'active':''}" aria-pressed="${view===v}">${v==='district'?'District':'Trade route'}</button>`).join('')}</div></div><div class="scene ${speed?'running':''} ${effects?'':'reduced'}">${view==='district'?DistrictScene.district(state,selected,panel==='build'?buildType:null,!!plan&&plan.command.type==='starter'):DistrictScene.region(state)}</div><div class="legend"><span><i></i>Approved operations</span><span><i class="amber"></i>Select a building to inspect</span><span>Serviced plots · prototype 0.1</span></div><div class="tasks">${a.filter(x=>x.code!=='paused'||has).slice(0,3).map(x=>`<button class="warning" data-action="alert" data-code="${x.code}">${escape(x.title)} →</button>`).join('')}${!a.length?'<span class="pill">Operations healthy · no action required</span>':''}</div><nav class="toolbar" aria-label="Company tools"><div class="toolgroup">${[['overview','Overview'],['build','Build'],['routes','Routes'],['policy','Policy'],['finance','Accounts']].map(([id,name])=>`<button data-action="panel" data-panel="${id}" class="${panel===id?'active':''}">${name}</button>`).join('')}</div><span class="keyhint">SPACE pause / play · ESC cancel plan</span></nav></main><aside class="inspector" aria-label="Company inspector">${content}<details><summary class="quiet" style="margin-top:24px;cursor:pointer">Recent operations</summary><ul class="feed">${state.events.slice(0,5).map(e=>`<li><time>DAY ${e.day}</time>${escape(e.text)}</li>`).join('')}</ul></details><div class="footerlinks"><button data-action="backup">Export backup</button><button data-action="restore">Import</button><button data-action="effects">Effects ${effects?'on':'off'}</button><button data-action="reset">New district</button><a href="../">Original game ↗</a></div><p class="quiet">Separate prototype save. Reopening always pauses. Keep one active district tab.</p></aside></div>`;
  }
  app.addEventListener('click',event=>{
    const plot=event.target.closest('[data-plot]');
    const button=event.target.closest('button[data-action]');
    if(button?.disabled)return;
    const action=button?.dataset.action;
    if(!action&&plot){selected=Number(plot.dataset.plot);pause();if(panel==='build'&&!state.buildings.some(b=>b.plot===selected))review({type:'build',building:buildType,plot:selected},'Build '+E.CATALOG[buildType].name,'Place this facility on plot '+(selected+1)+'. It joins the shared company ledger.');else{plan=null;panel='inspect';render();}return;}
    if(!action)return;
    if(action==='speed'){play(Number(button.dataset.speed));return;}
    if(action==='step'){pause();tick();return;}
    if(action==='panel'){pause();plan=null;panel=button.dataset.panel;render();return;}
    if(action==='view'){view=button.dataset.view;render();return;}
    if(action==='type'){buildType=button.dataset.type;view='district';panel='build';pause();render();return;}
    if(action==='starter')review({type:'starter'},'Your first food business','Open a factory on plot 2 and a depot on plot 3. Approve repeat procurement, production and local sales within the limits below.');
    if(action==='export')review({type:'export'},'Connect to Singapore','Open an export terminal on the first free waterfront plot. Approve recurring charters and balanced sales: 1 t/day locally, with surplus exported.');
    if(action==='upgrade')review({type:'upgrade',plot:Number(button.dataset.plot)},'Increase building capacity','Expand this facility by one level. Its capacity and daily fixed costs will increase.');
    if(action==='confirm'&&plan&&!locked){const p=plan;plan=null;panel='overview';if(current()){const r=E.command(state,p.command,p.revision);if(!r.ok)tell(r.error);else{save();tell('Plan approved. Press play when you are ready.');}}render();}
    if(action==='cancel'){plan=null;panel='overview';render();}
    if(action==='alert'){const a=E.alerts(state).find(a=>a.code===button.dataset.code);if(a){pause();plan=null;panel=a.target==='policy'?'policy':a.target==='finance'?'finance':a.target==='routes'?'routes':'build';tell(a.detail);render();}}
    if(action==='effects'){effects=!effects;render();}
    if(action==='backup')download();
    if(action==='restore'){pause();render();document.getElementById('restore-file').click();}
    if(action==='retry-save'){save();render();}
    if(action==='reset'){pause();if(confirm('Start a new district? This replaces only the district-builder save. Export a backup first to keep this district.')){try{const fresh=E.create(),text=E.serialize(fresh);localStorage.setItem(E.KEY,text);state=fresh;lastSaved=text;locked=false;rawRecovery=null;storageError='';plan=null;panel='overview';}catch(_){tell('Could not save a new district. Your current state has not been replaced.');}}render();}
  });
  app.addEventListener('submit',event=>{
    if(event.target.id!=='policy-form')return;event.preventDefault();pause();
    const data=new FormData(event.target),policy={enabled:data.get('enabled')==='on',reserve:Number(data.get('reserve')),dailyBudget:Number(data.get('dailyBudget')),inputBuffer:Number(data.get('inputBuffer')),sales:data.get('sales')};
    if(act({type:'policy',policy})){tell('Policy saved. Press play to continue.');panel='overview';render();}
  });
  document.addEventListener('keydown',event=>{
    const plot=event.target.closest?.('[role=button][data-plot]');
    if(plot&&['Enter',' '].includes(event.key)){event.preventDefault();plot.dispatchEvent(new MouseEvent('click',{bubbles:true}));return;}
    if(event.key==='Escape'&&plan){plan=null;panel='overview';render();}
    if(event.code==='Space'&&!event.target.closest?.('input,select,textarea,button,a,summary,[role=button]')){event.preventDefault();play(speed?0:1);}
  });
  function download(){pause();const text=rawRecovery||E.serialize(state);const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='monsoon-district-day-'+state.day+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);render();}
  document.getElementById('restore-file').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    if(file.size>200000){tell('Backup is too large.');return;}
    const r=E.deserialize(await file.text());if(!r.ok){tell(r.error);return;}
    if(!confirm('Replace this district with the selected backup? Original game saves will not be changed.'))return;
    try{const text=E.serialize(r.state);localStorage.setItem(E.KEY,text);state=r.state;lastSaved=text;locked=false;storageError='';rawRecovery=null;plan=null;panel='overview';tell('Backup restored. The simulation is paused.');}
    catch(_){tell('Restore could not be saved. Your current district was kept.');}
    render();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();render();}});
  window.addEventListener('pagehide',pause);
  window.addEventListener('storage',event=>{if(event.key===E.KEY&&event.newValue!==lastSaved){pause();locked=true;storageError='Another tab changed this district. Reload before making further changes.';render();}});
  render();
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>tell('Offline installation is unavailable. Online play still works.'));
})();
