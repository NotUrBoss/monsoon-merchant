/* Original SVG scenery. Presentation never modifies the simulation. */
(function(root){
  'use strict';
  const PLOTS=[[0,0],[1,0],[0,1],[3,0],[4,0],[3,1],[5,3],[5,4]];
  const iso=(c,r)=>[425+(c-r)*72,72+(c+r)*36];
  const poly=(p,fill,extra='')=>`<polygon points="${p.map(p=>p.join(',')).join(' ')}" fill="${fill}" ${extra}/>`;
  const rect=(x,y,w,h,c)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  function block(x,y,w,d,h,colors){return poly([[x-w,y],[x,y+d],[x,y+d-h],[x-w,y-h]],colors[0])+poly([[x,y+d],[x+w,y],[x+w,y-h],[x,y+d-h]],colors[1])+poly([[x-w,y-h],[x,y-d-h],[x+w,y-h],[x,y+d-h]],colors[2]);}
  function tree(x,y){return rect(x-2,y-14,4,18,'#665e48')+`<ellipse cx="${x}" cy="${y-18}" rx="12" ry="16" fill="#367b68"/><ellipse cx="${x-4}" cy="${y-22}" rx="8" ry="12" fill="#50937a"/>`;}
  function ship(x,y,small=false){return `<g transform="translate(${x} ${y}) scale(${small?.65:1})"><path class="wake" d="M-57 12l-22 2m24 5l-30 3m25 5l-18 3" stroke="#8db7b9" stroke-width="2"/><path d="M-53 0l25-13 80 28-17 22-63-13z" fill="#193b47"/><path d="M-53 0l25-13 80 28-21 10-61-20z" fill="#b0c7bc"/>${block(-21,-3,12,6,16,['#c8d3c7','#a5bcae','#e5e9d9'])}${block(4,7,12,6,13,['#bd694f','#8c5344','#df9672'])}${block(25,15,12,6,13,['#e1bc68','#ac8b49','#efd996'])}</g>`;}
  function building(b,s,x,y){
    const E=root.DistrictSim,active=s.jobs.some(j=>j.plot===b.plot),lv=b.level;
    let art='';
    if(b.type==='warehouse'){
      art=block(x,y+8,45,24,31+lv*3,['#a09a82','#727e75','#d0c6a2'])+poly([[x-45,y-23-lv*3],[x-5,y-58-lv*3],[x+45,y-23-lv*3],[x,y+1-lv*3]],'#d8d1b4');
      art+=`<path d="M${x+8} ${y+4}v-20l17-8v20" fill="#364e52" stroke="#dbd5b9" stroke-width="2"/>`;
      const count=Math.min(4,Math.ceil(E.used(s)/40));
      for(let k=0;k<count;k++)art+=block(x-28+k*17,y+23+k*5,9,4,9,['#69958e','#47716d','#9fc2aa']);
    }else if(b.type==='factory'){
      art=block(x,y+12,45,24,43+lv*5,['#b6baa8','#819892','#d4d4b6']);
      for(let k=0;k<3;k++)art+=poly([[x-43+k*25,y-32-lv*5],[x-31+k*25,y-48-lv*5],[x-18+k*25,y-35-lv*5],[x-30+k*25,y-20-lv*5]],'#88afab');
      art+=block(x+23,y-26,7,4,47,['#b0ad93','#7a8f87','#d9d2ae']);
      if(active)art+=`<g class="smoke" fill="#b6cbc4"><circle cx="${x+23}" cy="${y-82}" r="6"/><circle cx="${x+20}" cy="${y-94}" r="9"/></g>`;
      art+=`<path d="M${x-31} ${y-9}l25 13m-25-4l25 13m14-8l22-11" stroke="#385e64" stroke-width="5"/>`;
    }else if(b.type==='depot'){
      art=block(x,y+10,44,23,24,['#ba9b70','#8e8e6f','#d8ba85']);
      art+=`<path d="M${x-32} ${y-7}l22 12m-22-4l22 12m18-2l18-9" stroke="#344f55" stroke-width="8"/>`;
      art+=block(x+25,y+29,14,7,9,['#d9b861','#aa8e4d','#f2d78a'])+block(x+9,y+20,8,5,10,['#bed2c7','#7c9f9d','#dfebe0']);
    }else{
      art=block(x,y+16,46,23,12,['#8d9d95','#608083','#bac5ae']);
      art+=`<path d="M${x-23} ${y}v-62l62 31v55M${x-30} ${y-65}l77 38M${x-23} ${y-60}l38 50m-38-26l38 50" fill="none" stroke="#dfb565" stroke-width="5"/><path d="M${x+34} ${y-30}v25l-5 4" fill="none" stroke="#e2ddbd" stroke-width="2"/>`;
      art+=block(x-19,y+12,11,5,10,['#b56751','#885144','#d5926d']);
    }
    return art+`<circle cx="${x+41}" cy="${y-44}" r="5" fill="${active?'#c2ecba':'#edcd80'}"/>`;
  }
  function district(s,selected,buildType,planned){
    let art=`<defs><linearGradient id="sea" x2="1" y2="1"><stop stop-color="#244e5b"/><stop offset="1" stop-color="#183b49"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="9" stdDeviation="10" flood-opacity=".2"/></filter></defs><rect width="1100" height="650" fill="url(#sea)"/>`;
    for(let i=0;i<13;i++)art+=`<path d="M${650+i%3*60} ${80+i*42}l140 0" stroke="#426874" stroke-width="1" opacity=".35"/>`;
    art+=`<g filter="url(#shadow)">`;
    for(let r=0;r<6;r++)for(let c=0;c<6;c++){
      const [x,y]=iso(c,r),road=c===2||r===2;
      art+=poly([[x,y],[x+72,y+36],[x,y+72],[x-72,y+36]],road?'#526a66':(c+r)%2?'#789581':'#819b86','stroke="#708d7f" stroke-width="1"');
      if(road)art+=`<path d="M${x-22} ${y+25}l44 22" stroke="#afbaa0" stroke-dasharray="8 8" opacity=".7"/>`;
    }
    const [qx,qy]=iso(6,0),[ex,ey]=iso(6,6);
    art+=poly([[qx,qy],[ex,ey],[ex,ey+15],[qx,qy+15]],'#496c6b');
    art+='</g>';
    for(const [c,r]of [[0,3],[0,4],[1,5],[3,4],[3,5],[4,5],[4,1],[1,3]]){const[x,y]=iso(c,r);art+=tree(x,y+35);}
    const bmap=new Map(s.buildings.map(b=>[b.plot,b]));
    for(let p=0;p<PLOTS.length;p++){
      const [c,r]=PLOTS[p],[x,ty]=iso(c,r),y=ty+37,b=bmap.get(p);
      const valid=!b&&(!buildType||buildType!=='port'||p>=6);
      const name=b?`${root.DistrictSim.CATALOG[b.type].name}, level ${b.level}`:`Vacant ${p>=6?'waterfront':'serviced'} plot`;
      art+=`<g role="button" tabindex="0" data-plot="${p}" aria-label="Plot ${p+1}: ${name}" class="${selected===p?'selected':''}"><title>Plot ${p+1}: ${name}</title>`;
      art+=poly([[x-62,y],[x,y-30],[x+62,y],[x,y+30]],valid&&buildType?'#a0bf91':'#567a6b','opacity=".55"');
      art+=poly([[x-65,y],[x,y-32],[x+65,y],[x,y+32]],'none','class="plot-focus" stroke="#ffe49e" stroke-width="3"');
      if(b)art+=building(b,s,x,y);
      else {
        art+=poly([[x-48,y],[x,y-24],[x+48,y],[x,y+24]],'none',`stroke="${planned?'#dcecc6':'#adc2a3'}" stroke-dasharray="5 5" stroke-width="1.5"`);
        art+=`<text x="${x}" y="${y+4}" text-anchor="middle" fill="#e0e8cf" font-size="13">${planned&&[1,2].includes(p)?(p===1?'FACTORY':'DEPOT'):`+ ${p+1}`}</text>`;
      }
      art+='</g>';
    }
    if(root.DistrictSim.level(s,'port'))art+=ship(929,s.route.job?288:410,true);
    art+=`<text x="810" y="538" fill="#a8c8c8" font-size="12" letter-spacing="3">STRAITS OF MALACCA</text><path d="M920 565l30-14 30 14-30 15z" fill="none" stroke="#729ba1"/><text x="950" y="550" text-anchor="middle" fill="#9cbbbe" font-size="10">N</text>`;
    return `<svg viewBox="0 0 1100 650" aria-label="Interactive Port Klang industrial district">${art}</svg>`;
  }
  function region(s){
    const j=s.route.job,progress=j?Math.min(1,(s.day-j.depart)/(j.arrive-j.depart)):0;
    const t=progress,x=(1-t)**2*285+2*(1-t)*t*410+t*t*770,y=(1-t)**2*235+2*(1-t)*t*475+t*t*430;
    return `<svg viewBox="0 0 1100 650" aria-label="Schematic Port Klang to Singapore export route"><rect width="1100" height="650" fill="#204552"/><path d="M90 0h380l80 100-28 70 92 100 5 120 130 110-45 47-121-140-49-115-70-50-57-114-159-42z" fill="#6e9481"/><path d="M0 350l220 70 240 210H0z" fill="#537e74"/><path d="M285 235Q410 475 770 430" stroke="#c4dcba" stroke-width="3" stroke-dasharray="9 9" fill="none"/><circle cx="285" cy="235" r="12" fill="#efd28b"/><circle cx="770" cy="430" r="12" fill="#c4e9c4"/><text x="200" y="203" fill="#f3e7c7" font-size="25" font-weight="600">Port Klang</text><text x="790" y="427" fill="#e0eee0" font-size="23" font-weight="600">Singapore</text><text x="790" y="455" fill="#b8cdd0" font-size="13">Recurring food buyer</text><text x="105" y="559" fill="#9fbbbe" font-size="12">SCHEMATIC • ${root.DistrictSim.wet(s.day)?'MONSOON: 4-DAY OUTBOUND':'CALM: 3-DAY OUTBOUND'} • NOT TO SCALE</text>${j?ship(x,y):''}<g><rect x="85" y="55" width="280" height="80" rx="12" fill="#122f3d"/><text x="106" y="84" fill="#b7d6c6" font-size="12">SINGAPORE FOOD SERVICE</text><text x="106" y="111" fill="#f2e2bf" font-size="19">${j?`${j.qty} t • arrives day ${j.arrive}`:s.route.returnDay>s.day?`Vessel returns day ${s.route.returnDay}`:'Awaiting approved cargo'}</text></g></svg>`;
  }
  root.DistrictScene={district,region};
})(window);
