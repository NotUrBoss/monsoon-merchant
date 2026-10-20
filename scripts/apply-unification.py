from pathlib import Path
_integration_source=Path('scripts/apply-unification-base.py')
exec(compile(_integration_source.read_text(),str(_integration_source),'exec'),globals())
r=Path.cwd()
p=r/'logistics.js';s=p.read_text()
s=s.replace('  function upgradeWarehouse(s,hub) {','  function warehouseMaxLevel(s){return s.captain ? 10 : 3;}\n  function upgradeWarehouse(s,hub) {')
s=s.replace('if(w.level>=3)', 'if(w.level>=warehouseMaxLevel(s))')
s=s.replace('!whole(w.level,1,3)', '!whole(w.level,1,warehouseMaxLevel(s))')
s=s.replace('Object.values(w.stock).some(n=>!whole(n,0,400))', 'Object.values(w.stock).some(n=>!whole(n,0,w.capacity))')
s=s.replace('const api={FLEET,', 'const api={warehouseMaxLevel,FLEET,')
p.write_text(s)
p=r/'network-ui.js';s=p.read_text()
s=s.replace('w.level < 3', 'w.level < N.warehouseMaxLevel(state)')
s=s.replace('Upkeep debt:', 'Company debt:').replace('outstanding upkeep debt first.', 'outstanding company debt first.')
s=s.replace('Incoming &amp; production reserved', 'Incoming, captain &amp; production reserved')
s=s.replace("let notice = '', badNotice = false;", "let notice = '', badNotice = false, rendering = false;")
s=s.replace('if (disposed) return;\n      normalizeDestination();', 'if (disposed || rendering) return;\n      rendering = true;\n      try {\n      normalizeDestination();')
end="        if (selection && next.matches('input,textarea') && selection[0] !== null) next.setSelectionRange(selection[0], selection[1]);\n      }\n    }\n    function close()"
new="        if (selection && next.matches('input,textarea') && selection[0] !== null) next.setSelectionRange(selection[0], selection[1]);\n      }\n      } finally { rendering = false; }\n    }\n    function close()"
assert end in s;s=s.replace(end,new)
s=s.replace("      if (!field) return;\n      ui[field] = event.target.value;", "      // Replacing a focused form can synchronously dispatch change/blur in Chromium.\n      if (rendering || !field || ui[field] === event.target.value) return;\n      ui[field] = event.target.value;")
s=s.replace("        objectivePanel() + window.MMCompanyWorld.port(state,N,ui.hub) +\n", "")
s=s.replace("        '<div class=\"net-layout\"><div class=\"net-main-column\">'", "        objectivePanel() + (ui.tab === 'world' ? window.MMCompanyWorld.port(state,N,ui.hub) : '') +\n        '<div class=\"net-layout\"><div class=\"net-main-column\">'")
s=s.replace("(o.done?'done':'')", "(o.done?'done':o.id===next?.id?'current':'')")
s=s.replace('Previous Monsoon Company saves are upgraded', 'Previous Network Company saves are upgraded')
p.write_text(s)
p=r/'company.css';s=p.read_text().replace('#b8cc9d','#b8cc9e')+'''\n/* Navigation stays above decorative scenery; mobile shows the next useful objective. */
.net-tabs { order: -1; }
@media(max-width:760px) {
  .net-regions { display:none; }
  .objective-track button:not(.current) { display:none; }
  .company-port svg { max-height:150px; }
}
''';p.write_text(s)
_integration_source.unlink()
