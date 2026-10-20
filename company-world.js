/* Monsoon Merchant — dependency-free, state-driven environment and route views.
   Geography is deliberately schematic. All selectable hubs, routes and activity
   come from the same catalog and state used by the simulation. */
(function (root) {
  'use strict';
  const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const point = (lon,lat) => [45+(lon-50)/110*810,40+(40-lat)/80*470];
  const xy = hub => point(hub.lon,hub.lat);
  const shape = points => points.map(([lon,lat],i)=>(i?'L':'M')+point(lon,lat).map(n=>n.toFixed(1)).join(',')).join(' ')+' Z';
  const land = [
    [[49,39],[137,39],[135,33],[122,25],[115,22],[109,20],[110,15],[106,9],[104,12],[102,14],[100,13],[99,20],[96,17],[92,22],[89,22],[86,19],[82,16],[78,8],[75,11],[72,21],[66,25],[61,25],[56,21],[52,17],[49,17]],
    [[100,13],[103,7],[104,2],[102,1],[100,5],[99,10]],
    [[95,5],[100,1],[106,-6],[105,-8],[100,-4],[96,1]],
    [[106,-6],[112,-7],[117,-9],[113,-10],[107,-8]],
    [[109,6],[116,7],[119,2],[116,-4],[111,-3],[108,1]],
    [[121,18],[124,14],[125,9],[122,7],[120,12]],
    [[135,34],[139,38],[142,40],[143,36],[140,34],[135,32]],
    [[115,-23],[120,-18],[129,-14],[136,-12],[143,-13],[146,-20],[153,-26],[153,-34],[145,-39],[134,-34],[125,-35],[115,-31]],
    [[80,9],[82,7],[81,5],[79,7]]
  ];
  const offsets={klang:[-12,-12,'end'],singapore:[13,17,'start'],bangkok:[-12,-5,'end'],hcmc:[12,14,'start'],haiphong:[-12,-14,'end'],shenzhen:[14,2,'start'],shanghai:[12,-9,'start'],jakarta:[12,17,'start'],tokyo:[14,3,'start'],colombo:[-12,18,'end'],mumbai:[-12,-10,'end'],kolkata:[-12,-12,'end'],dubai:[12,-10,'start'],sydney:[-12,20,'end']};
  function curve(a,b){return {d:`M ${a[0]} ${a[1]} Q ${(a[0]+b[0])/2} ${(a[1]+b[1])/2-28} ${b[0]} ${b[1]}`,mid:[(a[0]+b[0])/2,(a[1]+b[1])/2-28]};}
  function world(s,N,selected){
    const hubPoint=id=>xy(N.HUBS[id]);
    let routes=N.RAIL_LINKS.map(([from,to])=>{const a=hubPoint(from),b=hubPoint(to);return `<path class="world-rail" d="M${a} L${b}"/>`;}).join('');
    const jobs=s.shipments.map(j=>({...j,label:N.TRANSPORTS[j.mode].name}));
    if(s.captain?.voyage)jobs.push({...s.captain.voyage,mode:'captain',label:'Your captain'});
    for(const j of jobs){
      const a=hubPoint(j.from),b=hubPoint(j.to),q=curve(a,b),t=Math.max(0,Math.min(1,(s.day-j.departDay)/(j.arrivalDay-j.departDay)));
      const x=(1-t)**2*a[0]+2*(1-t)*t*q.mid[0]+t*t*b[0],y=(1-t)**2*a[1]+2*(1-t)*t*q.mid[1]+t*t*b[1];
      routes+=`<g class="world-route route-${j.mode}"><title>${esc(j.label)}: ${esc(N.HUBS[j.from].name)} to ${esc(N.HUBS[j.to].name)}, arrives day ${j.arrivalDay}</title><path d="${q.d}"/><circle cx="${x}" cy="${y}" r="5"/></g>`;
    }
    const hubs=Object.entries(N.HUBS).map(([id,h])=>{
      const [x,y]=xy(h),[dx,dy,anchor]=offsets[id],owned=!!s.warehouses[id],here=s.captain?.port===id&&!s.captain.voyage;
      return `<g class="world-hub${id===selected?' selected':''}${owned?' owned':''}" role="button" tabindex="0" data-n="world-hub" data-hub="${id}" aria-label="Manage ${esc(h.name)}${owned?', warehouse owned':''}${here?', captain docked':''}"><title>${esc(h.name)} · ${esc(h.region)}</title><circle class="world-hit" cx="${x}" cy="${y}" r="15"/><circle class="world-node" cx="${x}" cy="${y}" r="${id===selected?7:5}"/>${here?`<circle class="world-captain" cx="${x}" cy="${y}" r="11"/>`:''}<text x="${x+dx}" y="${y+dy}" text-anchor="${anchor}">${esc(h.name)}</text></g>`;
    }).join('');
    return `<section class="net-card company-world"><div class="net-card-head"><h2>Company route map</h2><span class="net-badge">Day ${s.day} · ${s.day<=30?'Southwest':'Northeast'} monsoon</span></div><p class="net-note">Choose a hub to manage its warehouse. Solid nodes are owned; the gold ring is your docked captain.</p><svg viewBox="0 0 900 550" role="group" aria-label="Interactive company route map"><defs><pattern id="world-grid" width="60" height="55" patternUnits="userSpaceOnUse"><path d="M60 0H0V55" fill="none" stroke="#234459" stroke-width="0.5"/></pattern></defs><rect width="900" height="550" rx="16" fill="#081d2c"/><rect width="900" height="550" fill="url(#world-grid)"/>${land.map(poly=>`<path d="${shape(poly)}" class="world-land"/>`).join('')}<text x="170" y="370" class="world-ocean">INDIAN OCEAN</text><text x="695" y="225" class="world-ocean">PACIFIC</text>${routes}${hubs}<text x="24" y="528" class="world-caption">SCHEMATIC TRADE MAP · NOT A NAVIGATION CHART</text></svg><div class="world-legend"><span>— Rail corridor</span><span>◌ Chartered sea / air</span><span>◉ Your captain</span></div><p class="net-note">Routes are simplified game connections, not real carrier schedules. Use the hub selector below on small screens.</p></section>`;
  }
  function port(s,N,hub){
    const h=N.HUBS[hub],warehouse=s.warehouses[hub],factory=s.factories[hub],busy=s.production.some(p=>p.hub===hub),docked=s.captain?.port===hub&&!s.captain.voyage;
    const stock=warehouse?Object.values(warehouse.stock).reduce((a,b)=>a+b,0):0;
    const stacks=warehouse?Math.min(9,Math.ceil(stock/12)):0;
    const containers=Array.from({length:stacks},(_,i)=>`<g transform="translate(${295+(i%3)*45},${147-Math.floor(i/3)*19})"><rect width="41" height="17" rx="1" fill="${['#bc7548','#4e9692','#d4b66e'][i%3]}"/><path d="M8 2v13m9-13v13m9-13v13m8-13v13" stroke="#183447" opacity=".4"/></g>`).join('');
    const building=warehouse?`<g class="port-warehouse"><path d="M75 140l52-32 62 32v38H75Z" fill="#719095"/><path d="M68 139l59-38 69 38-6 7-63-34-53 34Z" fill="#b5b6a0"/><rect x="112" y="147" width="39" height="31" fill="#213c4b"/><path d="M113 150h37m-37 7h37m-37 7h37" stroke="#68858c"/></g>`:`<path d="M75 178v-40l52-35 63 35v40Z" fill="none" stroke="#77979a" stroke-dasharray="5 5"/>`;
    const industry=factory?`<g class="port-factory"><path d="M466 175v-48l30 16v-18l29 17v-18l36 20v31Z" fill="#638487"/><rect x="536" y="88" width="12" height="57" fill="#b98469"/><path d="M537 102h10m-10 7h10" stroke="#e6bf92"/>${busy?'<g class="port-smoke"><circle cx="542" cy="75" r="9"/><circle cx="548" cy="61" r="13"/><circle cx="561" cy="46" r="17"/></g>':''}<path d="M477 155h12v10h-12Zm27 0h12v10h-12Zm28 0h12v10h-12Z" fill="${busy?'#f3d58b':'#254957'}"/></g>`:'';
    const boat=docked?'<g class="port-ship"><path d="M196 198h145l-18 25H215Z" fill="#ca875b"/><path d="M225 182h48v16h-48Z" fill="#bbccb6"/><path d="M233 169h30v13h-30Z" fill="#e7d8b5"/><path d="M242 164v-11m0 5h12" stroke="#edd8ac" stroke-width="2"/><path d="M285 187h25v11h-25Zm-57-12h8v5h-8Zm12 0h8v5h-8Z" fill="#345c68"/></g>':'';
    return `<section class="company-port" aria-label="${esc(h.name)} port environment"><svg viewBox="0 0 640 255" role="img" aria-label="${esc(h.name)}: ${warehouse?'warehouse built':'unbuilt warehouse'}, ${factory?(busy?'factory producing':'factory idle'):'no factory'}, ${docked?'captain docked':'captain away'}"><defs><linearGradient id="port-sky" x2="0" y2="1"><stop stop-color="#173b53"/><stop offset="1" stop-color="#58878a"/></linearGradient><linearGradient id="port-water" x2="0" y2="1"><stop stop-color="#2b6370"/><stop offset="1" stop-color="#123b50"/></linearGradient></defs><rect width="640" height="255" fill="url(#port-sky)"/><circle cx="556" cy="49" r="20" fill="#ecd397"/><path d="M0 129L50 102 88 117 134 91 183 120 228 101 276 129 343 110 405 132 463 107 517 125 583 103 640 126V184H0Z" fill="#305b63"/><path d="M22 63h67m325 12h68m-242-36h57" stroke="#a4bcaf" stroke-width="5" opacity=".25" stroke-linecap="round"/><path d="M0 171H640V192H0Z" fill="#93a39a"/><path d="M0 185H640V255H0Z" fill="url(#port-water)"/>${building}${industry}${containers}<g stroke="#d8b877" fill="none" stroke-width="4"><path d="M232 176V82h66m-66 0-19 24m19-24 54 36m-32-36v42m-13 10v41m-18-42h40"/><path d="M411 175V91h48m-48 0 39 30m-25-30v38"/></g><path d="M0 179H640" stroke="#cfbf94" stroke-width="5"/>${boat}<g class="port-ripples" stroke="#9bbbb3" opacity=".3"><path d="M25 212h73m260 18h80m51-27h47m-430 36h58m378-2h50"/></g><text x="22" y="29" fill="#e8e5d3" font-size="13" letter-spacing="2">${esc(h.name.toUpperCase())}</text></svg><div class="port-caption"><span>${esc(h.region)} · ${stock} t on hand</span><span>${busy?'Manufacturing active':factory?'Factory ready':'Industrial district'}${docked?' · Captain docked':''}</span></div></section>`;
  }
  root.MMCompanyWorld={world,port};
})(typeof window!=='undefined'?window:globalThis);
