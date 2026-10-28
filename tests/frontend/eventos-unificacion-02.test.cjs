/** Revisión de paginación, meses de Perú y enlaces individuales sin datos inventados. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = filename=>fs.readFileSync(path.join(process.cwd(),filename),'utf8');
const event=read('apps/web/src/modules/eventos/EventCatalog.tsx');
const history=read('apps/web/src/modules/historico-igp/Page.tsx');
const pag=read('apps/web/src/components/ui/TablePagination.tsx');
const source=read('services/api/app/igp/history_catalog.py');

test('Ambas tablas muestran 10 resultados por página al abrirse',()=>{
  assert.match(event,/useState<TablePageSize>\(10\)/);
  assert.match(history,/useState<TablePageSize>\(10\)/);
  assert.match(event,/<TablePagination/);
  assert.match(history,/<TablePagination/);
  assert.match(pag,/pageSize/);
});
test('Eventos solo muestra la tabla operativa y no la segunda tabla IGP Live',()=>{
  assert.doesNotMatch(event,/IGPLivePanel/);
  assert.equal((event.match(/<table\b/g)||[]).length,1);
  assert.match(event,/source:'IGP\/CENSIS'/);
});
test('Filtro rápido de meses es independiente del Modal de filtros',()=>{
  assert.match(event,/Mes de consulta/);
  assert.match(event,/aria-label="Filtro rápido de mes"/);
  assert.match(event,/MONTH_NAMES\.map/);
  assert.ok(event.indexOf('Mes de consulta')<event.indexOf('<Modal open='));
});
test('Meses futuros se bloquean tomando el calendario de Perú',()=>{
  assert.match(event,/timeZone:'America\/Lima'/);
  assert.match(event,/disabled=\{index\+1>clock\.month\}/);
  assert.match(event,/month>clock\.month/);
  assert.doesNotMatch(event,/Próximamente/);
  assert.match(event,/>\{name\}<\/option>/);
});
test('El rango rápido contempla el primer y último instante del mes de Lima',()=>{
  assert.match(event,/Date\.UTC\(year,month-1,1,5,0,0\)/);
  assert.match(event,/Date\.UTC\(year,month,1,5,0,0\)/);
  assert.match(event,/\.replace\('\.999Z','\.999999Z'\)/);
});
test('Cambio de mes reinicia paginación, detalles y condiciones avanzadas',()=>{
  assert.match(event,/function setQuickMonth\(month: number\)/);
  assert.match(event,/setDraft\(blank\)/);
  assert.match(event,/setCustomPeriod\(false\);setPage\(1\);setExpanded\(null\)/);
});
test('Solo magnitud o profundidad en Filtros conserva el mes seleccionado',()=>{
  assert.match(event,/\(!draft\.from&&!draft\.to\)/);
  assert.match(event,/monthTimeRange\(clock\.year,selectedMonth\)/);
});
test('Cada ficha operativa usa el código IGP para un enlace específico, sin portal genérico',()=>{
  assert.match(event,/function individualIGPReport/);
  assert.match(event,/`https:\/\/ultimosismo\.igp\.gob\.pe\/evento\/\$\{match\[1\]\}`/);
  assert.match(event,/individualIGPReport\(item\.external_id,item\.source_url\)/);
  assert.match(event,/Sin ficha individual/);
  assert.doesNotMatch(event,/https:\/\/ultimosismo\.igp\.gob\.pe\/productos\/reportes-sismicos/);
});
test('Histórico conserva el catálogo oficial sin inventar fichas por fila',()=>{
  assert.match(source,/['"]url_origen['"]:\s*SOURCE_PAGE/);
  assert.doesNotMatch(history,/href=\{item\.url_origen\}/);
  assert.match(history,/href=\{result\.source\.resource_url\}/);
  assert.match(history,/IDs del catálogo histórico no son códigos/);
});
test('La tabla y su paginación siguen en un único panel en ambas pestañas',()=>{
  for(const text of [event,history]){
    assert.match(text,/<TablePagination/);
    assert.match(text,/overflow-hidden rounded-(?:xl|2xl) border border-border-ui bg-panel/);
  }
});
