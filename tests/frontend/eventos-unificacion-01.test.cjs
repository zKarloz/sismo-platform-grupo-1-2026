/** Regresiones de navegación, consultas y modales tras unificar los catálogos. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.cwd();
const read = file=>fs.readFileSync(path.join(base,file),'utf8');
const router=read('apps/web/src/app/router.tsx');
const nav=read('apps/web/src/lib/navigation.ts');
const wrapper=read('apps/web/src/modules/eventos/Page.tsx');
const events=read('apps/web/src/modules/eventos/EventCatalog.tsx');
const history=read('apps/web/src/modules/historico-igp/Page.tsx');
const hs=read('apps/web/src/services/igpHistory.ts');
const backend=read('services/api/app/routes/events.py');

test('una entrada del sidebar y ruta directa al histórico con redirección antigua',()=>{
  assert.equal((nav.match(/label: 'Eventos sísmicos'/g)||[]).length,1);
  assert.doesNotMatch(nav,/label: 'IGP histórico 1960–2025'/);
  assert.match(router,/path: 'eventos\/historico'/);
  assert.match(router,/path: 'historico-igp'.*Navigate/);
});
test('tabs subrayadas con rutas y ARIA igual que Centro de alertas',()=>{
  assert.match(wrapper,/role="tablist"/);
  assert.match(wrapper,/border-b-2 border-accent/);
  assert.match(wrapper,/to="\/eventos\/historico"/);
  assert.match(wrapper,/IGP histórico/);
});
test('histórico: título 1960–2025 y año completo fuera del modal',()=>{
  assert.match(history,/Catálogo histórico IGP 1960–2025/);
  assert.match(history,/Año completo \(1960–2025\)/);
  assert.ok(history.indexOf('Año completo (1960–2025)') < history.indexOf('<Modal '));
  assert.match(history,/Consultar año/);
});
test('dos botones Filtros usan el modal compartido',()=>{
  for(const input of [events,history]) {
    assert.match(input,/import Modal from/);
    assert.match(input,/<Modal open=/);
    assert.match(input,/> Filtros/);
  }
});
test('filtros del histórico: fechas UTC, magnitud, profundidad y zona dentro del modal',()=>{
  for(const key of ['start','end','min_magnitude','max_depth','south','west','north','east']) {
    assert.ok(history.includes(key),key);
  }
  assert.match(history,/T23:59:59\.999999Z/);
});
test('histórico consulta solo bajo demanda y conserva exportación CSV XLSX PDF',()=>{
  assert.match(history,/if\(!applied\)/);
  assert.match(history,/exportHistory\(applied,format\)/);
  assert.match(history,/\['csv','xlsx','pdf'\]/);
});
test('paginación compartida con 10 registros iniciales y opciones 5, 10, 20',()=>{
  assert.match(events,/useState<TablePageSize>\(10\)/);
  assert.match(history,/useState<TablePageSize>\(10\)/);
  assert.match(events,/<TablePagination/);
  assert.match(history,/<TablePagination/);
  assert.match(hs,/page_size:String\(pageSize\)/);
});
test('tabla operativa solo IGP con enlace al mapa y detalle no redundante',()=>{
  assert.match(events,/source:'IGP\/CENSIS'/);
  assert.doesNotMatch(events,/>USGS</);
  assert.match(events,/mapNavigationState/);
  assert.match(events,/Ver en el mapa/);
  assert.doesNotMatch(events,/Hash de origen/);
  assert.match(events,/ChevronDown/);
});
test('backend valida profundidad y cuatro coordenadas sin migraciones',()=>{
  for(const item of ['min_depth','max_depth','south','west','north','east'])assert.ok(backend.includes(item));
  assert.match(backend,/Zona incompleta o invertida/);
  assert.match(backend,/Rango de profundidad inválido/);
});
