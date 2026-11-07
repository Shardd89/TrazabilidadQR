// --- Existencias calculadas en el servidor (con fallback local) ---
let existenciasServidorError=false,existenciasT=null;
async function leerExistenciasServidor(codigos){
  if(!sb)return null;
  try{
    const{data,error}=await sb.rpc("obtener_existencias_materiales",codigos?.length?{p_codigos:codigos}:undefined);
    if(error)throw error;
    return Array.isArray(data)?data:null;
  }catch(e){
    if(!existenciasServidorError){existenciasServidorError=true;console.warn("Existencias del servidor no disponibles; se usa el cálculo local.",e)}
    return null;
  }
}
function aplicarExistenciasServidor(lista){
  if(!Array.isArray(lista))return;
  const por=new Map(lista.map(e=>[String(e.codigo),e]));
  mats.forEach(m=>{m.existenciaServer=por.get(String(m.codigo))||null});
  existenciasServidorError=false;
}
function invalidarExistencias(){mats.forEach(m=>{m.existenciaServer=null})}
function programarExistencias(){
  clearTimeout(existenciasT);
  existenciasT=setTimeout(async()=>{
    const lista=await leerExistenciasServidor();
    if(lista){aplicarExistenciasServidor(lista);renderVisible()}
  },400);
}
// Recarga los datos y conserva la edición, el QR y los renglones pendientes.
let cargasActivas=0;
function filasSkeleton(columnas,filas=4){
  return Array.from({length:filas},()=>`<tr class="skeleton-row" aria-hidden="true">${"<td><span class=\"skeleton\"></span></td>".repeat(columnas)}</tr>`).join("");
}
function mostrarCarga(){
  cargasActivas++;
  if(cargasActivas>1)return;
  const t=$("tbody"),iv=$("invBody"),al=$("almacenLista"),ul=$("ubiLista");
  if(t){t.setAttribute("aria-busy","true");t.innerHTML=filasSkeleton(8)}
  if(iv){iv.setAttribute("aria-busy","true");iv.innerHTML=filasSkeleton(4)}
  if(al){al.setAttribute("aria-busy","true");al.innerHTML='<div class="empty cargando">Cargando…</div>'}
  if(ul){ul.setAttribute("aria-busy","true");ul.innerHTML='<div class="empty cargando">Cargando…</div>'}
}
function ocultarCarga(){
  cargasActivas=Math.max(0,cargasActivas-1);
  if(cargasActivas)return;
  ["tbody","invBody","almacenLista","ubiLista"].forEach(id=>{
    const el=$(id);if(!el)return;
    el.removeAttribute("aria-busy");
    if(el.querySelector(".skeleton-row,.cargando"))el.innerHTML="";
  });
}
async function cargar(){
  mostrarCarga();
  try{
  const existenciasServidor=leerExistenciasServidor();
  const[materialesResultado,despachosResultado,ajustesResultado]=await Promise.allSettled([
    leerTodo("materiales","codigo,data",["codigo"]),
    leerTodo("despachos","codigo,t,data,piezas",["t","id"]),
    leerTodo("ajustes_inventario_ciclico","id,codigo_material,ubicacion_codigo,ubicacion_nombre,existencia_anterior,existencia_contada,diferencia,unidad,motivo,usuario,created_at",["id"])
  ]);
  if(materialesResultado.status==="rejected")throw materialesResultado.reason;
  if(despachosResultado.status==="rejected")throw despachosResultado.reason;
  const A=materialesResultado.value,B=despachosResultado.value;
  ajustesInventarioError=ajustesResultado.status==="rejected"
    ?(/PGRST205|42P01|does not exist|schema cache/i.test(String(ajustesResultado.reason?.message||ajustesResultado.reason))?"Falta aplicar o actualizar la migración supabase_almacenes.sql para habilitar los conteos cíclicos.":`No se pudieron cargar los conteos cíclicos: ${String(ajustesResultado.reason?.message||ajustesResultado.reason)}`)
    :"";
  if(ajustesResultado.status==="rejected")console.error(ajustesResultado.reason);
  const ajustesPor={};
  if(ajustesResultado.status==="fulfilled")ajustesResultado.value.forEach(a=>{(ajustesPor[a.codigo_material]=ajustesPor[a.codigo_material]||[]).push(a)});
  const por={};B.forEach(r=>{(por[r.codigo]=por[r.codigo]||[]).push(desDeFila(r))});
  const edI=$("editIndex").value,edCod=edI!==""&&mats[+edI]?mats[+edI].codigo:null;
  const act=actual,actAntes=act?JSON.stringify(act):"";
  mats=A.map(r=>({...normalizarMaterial(r.data),codigo:r.codigo,despachos:por[r.codigo]||[],ajustesInventario:ajustesPor[r.codigo]||[]}));
  aplicarExistenciasServidor(await existenciasServidor);
  if(edCod){const i=mats.findIndex(x=>x.codigo===edCod);if(i<0)resetForm();else $("editIndex").value=i}
  surItems=surItems.filter(item=>mats.some(x=>x.codigo.toLowerCase()===item.codigo.toLowerCase()));
  surItems.forEach(item=>{const m=mats.find(x=>x.codigo.toLowerCase()===item.codigo.toLowerCase());if(item.piezas?.some(n=>piezasSurt(m).has(n)))item.errorPieza=true});
  render();
  if(!$("vInv").hidden)renderInventario();
  if(!$("vSur").hidden){renderHist();renderSur()}
  renderInicio();
  if(act){const a=mats.find(x=>x.codigo===act.codigo);if(a){if(JSON.stringify(a)!==actAntes)mostrar(a);else actual=a}}
  }finally{ocultarCarga()}
}
async function cargarUbicaciones(){
  mostrarCarga();
  try{
  const resultados=await Promise.allSettled([
    leerTodo("almacenes","codigo,nombre,clasificacion,created_at",["nombre"]),
    leerTodo("ubicaciones","codigo,nombre,almacen_codigo,created_at",["nombre"]),
    leerTodo("movimientos_ubicacion","id,folio,codigo_material,ubicacion_anterior_codigo,ubicacion_anterior,ubicacion_nueva_codigo,ubicacion_nueva,ubicacion_anterior_almacen_codigo,ubicacion_nueva_almacen_codigo,existencia,created_at",["id"]),
    leerTodo("ubicaciones_codigos_alias","codigo_alias,ubicacion_codigo,created_at",["codigo_alias"])
  ]);
  const mensajeError=(resultado,nombre)=>{
    if(resultado.status==="fulfilled")return"";
    const detalle=String(resultado.reason?.message||resultado.reason||"Error desconocido");
    if(/PGRST205|42P01|does not exist|schema cache/i.test(detalle))return`Falta aplicar o actualizar la migración: no se pudo consultar ${nombre}.`;
    return`No se pudo consultar ${nombre}: ${detalle}`;
  };
  almacenesError=mensajeError(resultados[0],"almacenes");
  ubicacionesError=mensajeError(resultados[1],"ubicaciones");
  movimientosError=mensajeError(resultados[2],"el historial de movimientos");
  ubicacionesAliasError=mensajeError(resultados[3],"los códigos anteriores de QR de ubicaciones");
  almacenes=resultados[0].status==="fulfilled"?resultados[0].value:[];
  ubicaciones=resultados[1].status==="fulfilled"?resultados[1].value:[];
  movimientosUbicacion=resultados[2].status==="fulfilled"?resultados[2].value:[];
  ubicacionesAlias=resultados[3].status==="fulfilled"?resultados[3].value:[];
  resultados.forEach(resultado=>{if(resultado.status==="rejected")console.error(resultado.reason)});
  if(!$("ubiCodigo").value)siguienteCodigoUbicacion();
  if(!$("almacenCodigo").value)siguienteCodigoAlmacen();
  reconstruirIndices();
  renderAlmacenes();renderUbicaciones();renderHistUbicaciones();renderInventario();actualizarDatalistUbicaciones();
  }finally{ocultarCarga()}
}
async function subirLista(ms,ds){
  if(!esAdmin)throw new Error("Solo el administrador puede restaurar información.");
  for(let i=0;i<ms.length;i+=200){const{error}=await sb.from("materiales").upsert(ms.slice(i,i+200).map(m=>({codigo:m.codigo,data:matData(m)})),{onConflict:"codigo"});if(error)throw error}
  const filas=ds.map(x=>desFila(x.codigo,x.d));
  for(let i=0;i<filas.length;i+=200){const{error}=await sb.from("despachos").upsert(filas.slice(i,i+200),{onConflict:"codigo,t",ignoreDuplicates:true});if(error)throw error}
}
let rtT=null,canalRT=null;
function dejarCanal(){const c=canalRT;canalRT=null;if(!sb||!c)return;try{sb.removeChannel(c).catch(()=>{})}catch{}}
// --- Realtime incremental: actualiza solo lo que llegó de Supabase ---
const TABLAS_INCR=new Set(["materiales","despachos","ajustes_inventario_ciclico"]);
function renderVisible(){
  if(!$("vInicio").hidden)renderInicio();
  if(!$("vReg").hidden)render();
  if(!$("vSur").hidden){renderHist();renderSur()}
  if(!$("vInv").hidden)renderInventario()
}
function syncSurItems(){
  surItems=surItems.filter(item=>mats.some(m=>String(m.codigo).toLowerCase()===String(item.codigo).toLowerCase()));
  surItems.forEach(item=>{const m=mats.find(x=>String(x.codigo).toLowerCase()===String(item.codigo).toLowerCase());if(m&&item.piezas?.some(n=>piezasSurt(m).has(n)))item.errorPieza=true})
}
const edCodActual=()=>{const i=+$("editIndex").value;return i>=0&&mats[i]?mats[i].codigo:null};
const edSet=cod=>{if(!cod)return;const i=mats.findIndex(m=>String(m.codigo).toLowerCase()===String(cod).toLowerCase());if(i<0){resetForm()}else $("editIndex").value=i};
const keyMin=s=>String(s??"").toLowerCase();
function upsyncMat(type,p){
  if(type==="DELETE"){
    const codigo=p.old?.codigo;if(!codigo)return false;
    const i=mats.findIndex(m=>keyMin(m.codigo)===keyMin(codigo));
    if(i>=0)mats.splice(i,1);
    const st=edCodActual();if(st&&keyMin(st)===keyMin(codigo))resetForm();
    if(actual&&keyMin(actual.codigo)===keyMin(codigo)){actual=null;resetForm()}
    syncSurItems();return true;
  }
  const cod=p.new?.codigo;if(!cod)return false;
  const st=edCodActual();
  const i=mats.findIndex(m=>keyMin(m.codigo)===keyMin(cod));
  const prev=i>=0?mats[i]:null;
  const nuevo={...normalizarMaterial(p.new.data||{}),codigo:cod,despachos:prev?prev.despachos:[],ajustesInventario:prev?prev.ajustesInventario:[]};
  if(i>=0)mats.splice(i,1,nuevo);else mats.push(nuevo);
  if(st)edSet(st);
  if(actual&&prev&&keyMin(actual.codigo)===keyMin(cod))actual=nuevo;
  syncSurItems();return true;
}
function upsyncDesp(type,p){
  const cod=p.new?.codigo||p.old?.codigo;if(!cod)return false;
  const i=mats.findIndex(m=>keyMin(m.codigo)===keyMin(cod));if(i<0)return false;
  const m=mats[i];
  if(type==="DELETE"){
    const t=p.old?.t;if(t==null)return false;
    m.despachos=(m.despachos||[]).filter(d=>Number(d.t)!==Number(t));
    return true;
  }
  if(type==="INSERT"||type==="UPDATE"){
    const row=desDeFila(p.new);
    const j=(m.despachos||[]).findIndex(d=>Number(d.t)===Number(row.t));
    if(j>=0)m.despachos[j]=row;else m.despachos=[...(m.despachos||[]),row].sort((a,b)=>Number(a.t)-Number(b.t));
    return true;
  }
  return false;
}
function upsyncAjuste(type,p){
  const cod=p.new?.codigo_material||p.old?.codigo_material;if(!cod)return false;
  const i=mats.findIndex(m=>keyMin(m.codigo)===keyMin(cod));if(i<0)return false;
  const m=mats[i];
  if(type==="DELETE"){
    const id=p.old?.id;if(id==null)return false;
    m.ajustesInventario=(m.ajustesInventario||[]).filter(a=>a.id!==id);
    return true;
  }
  const a={...p.new};
  const j=(m.ajustesInventario||[]).findIndex(x=>x.id===a.id);
  if(j>=0)m.ajustesInventario[j]=a;else m.ajustesInventario=[...(m.ajustesInventario||[]),a];
  return true;
}
function aplicarCambio(payload){
  try{
    const tabla=payload?.table,type=payload?.eventType;
    if(!tabla||!type)return false;
    if(tabla==="materiales")return upsyncMat(type,payload);
    if(tabla==="despachos")return upsyncDesp(type,payload);
    if(tabla==="ajustes_inventario_ciclico")return upsyncAjuste(type,payload);
    return false;
  }catch(e){console.error("realtime incremental:",e);return false}
}
function suscribir(){
  if(!sb||canalRT)return;
  const fallback=()=>{clearTimeout(rtT);rtT=setTimeout(()=>{cargar().catch(()=>{});cargarUbicaciones()},400)};
  const handler=payload=>{
    const tabla=payload?.table;
    if(tabla&&TABLAS_INCR.has(tabla)){
      if(aplicarCambio(payload)){
        invalidarExistencias();
        programarExistencias();
        renderVisible();
        return;
      }
      fallback();
      return;
    }
    fallback();
  };
  canalRT=sb.channel("cambios").on("postgres_changes",{event:"*",schema:"public",table:"materiales"},handler).on("postgres_changes",{event:"*",schema:"public",table:"despachos"},handler).on("postgres_changes",{event:"*",schema:"public",table:"almacenes"},handler).on("postgres_changes",{event:"*",schema:"public",table:"ubicaciones"},handler).on("postgres_changes",{event:"*",schema:"public",table:"ubicaciones_codigos_alias"},handler).on("postgres_changes",{event:"*",schema:"public",table:"movimientos_ubicacion"},handler).on("postgres_changes",{event:"*",schema:"public",table:"ajustes_inventario_ciclico"},handler).subscribe(estado=>{if((estado==="CHANNEL_ERROR"||estado==="TIMED_OUT")&&canalRT){const c=canalRT;canalRT=null;try{sb.removeChannel(c).catch(()=>{})}catch{}}});
}
