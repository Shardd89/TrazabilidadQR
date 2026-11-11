const $=id=>document.getElementById(id);
const K="trazabilidad_materiales_v2";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function debounce(fn,ms){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms)}}
const hoy=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
const fmt=n=>Number(n).toLocaleString("es-MX",{maximumFractionDigits:3});
function totalTxt(m){return m.esMP&&m.um==="PZ"&&m.cantidad>0&&m.longitud>0?`${fmt(m.cantidad*m.longitud)} ${m.longU||m.longitudUnidad||"mm"}`:""}
let mats=[],actual=null,actualBase=null,actualEntradaId=null,orden={k:null,asc:true},esStaff=false,esAdmin=false,almacenes=[],ubicaciones=[],ubicacionesAlias=[],movimientosUbicacion=[],ajustesInventarioError="",entradasError="",almacenesError="",ubicacionesError="",ubicacionesAliasError="",movimientosError="",ubicacionDestino=null,asignacionItems=[];
let ubicacionesPorCodigo=new Map(),almacenesPorCodigo=new Map();
function reconstruirIndices(){
  ubicacionesPorCodigo=new Map(ubicaciones.map(u=>[String(u.codigo),u]));
  almacenesPorCodigo=new Map(almacenes.map(a=>[String(a.codigo),a]));
}
function ubicacionDe(m){return m?ubicacionesPorCodigo.get(m.ubicacionCodigo):undefined}
function almacenDe(m){const loc=ubicacionDe(m);const almCodigo=loc?.almacen_codigo||m?.ubicacionAlmacenCodigo;return almCodigo?almacenesPorCodigo.get(almCodigo):undefined}
function tagTipo(m){return m.esMP?'<span class="tag t1">M. PRIMA</span>':m.tipoRegistro==="CONSUMIBLES"?'<span class="tag t2">CONSUMIBLES</span>':'<span class="tag t2">GENERAL</span>'}
const seleccionados=new Set();
const claveRegistroHistorial=(m,entrada)=>entrada?`entrada:${entrada.id}`:`material:${m.codigo}`;
// --- Registro múltiple (hasta 50 filas por lote) ---
const MAX_REGISTRO_MULTIPLE=50;
let modoRegistro="unico",regMulti=[];
let editandoEntradaId=null;

// --- Supabase ---
const SB_URL="https://olbcepxgzqtmiqdqpbha.supabase.co",SB_KEY="sb_publishable_kdySoe6yEpOSmx4-zEOk-w_EHIMnaEC";
const sb=window.supabase?window.supabase.createClient(SB_URL,SB_KEY):null;
function normalizarMaterial(m){
  const pesoU=m.pesoU||m.pesoUnidad||(["LB","KG"].includes(m.um)?m.um:m.peso!=null&&!m.pesoUnidadPendiente?"LB":null);
  const tipoRegistro=/^(?:MP|MATERIA PRIMA)$/.test(String(m.tipoRegistro??"").toUpperCase())||m.esMP?"MP":/^CONSUMIBLES?$/.test(String(m.tipoRegistro??"").trim().toUpperCase())?"CONSUMIBLES":"GENERAL";
  const seccionMaterial=normalizarSeccion(m.seccionMaterial)||(m.seccion==="cuadrado"?"SQ":m.seccion==="redondo"?"RND":"");
  return{...m,um:"PZ",pesoU,tipoRegistro,esMP:tipoRegistro==="MP",seccionMaterial};
}
const nombreTipoRegistro=tipo=>({MP:"Materia prima",GENERAL:"Material general",CONSUMIBLES:"Consumibles"}[tipo]||"Material general");
const matData=m=>{const{despachos,ajustesInventario,entradas,existenciaServer,entradaId,...r}=m;return r};
const desData=d=>{const{t,piezas,entrada_id,...r}=d;return r};
const desFila=(codigo,d)=>({codigo,t:d.t,data:desData(d),piezas:d.piezas||[],...(d.entrada_id!=null?{entrada_id:Number(d.entrada_id)}:{})});
const desDeFila=r=>({...r.data,t:Number(r.t),...(r.piezas&&r.piezas.length?{piezas:r.piezas}:{}),...(r.entrada_id!=null?{entrada_id:Number(r.entrada_id)}:{})});

// --- Entradas / recepciones de un material ---
function entradaDeFila(r){
  const d=r.data&&typeof r.data==="object"?r.data:{};
  const base=normalizarMaterial(d);
  return{...base,...d,
    id:Number(r.id),
    codigo:r.codigo_material,
    cantidad:Number(r.cantidad)||0,
    longitudIndividual:r.longitud_individual!=null?Number(r.longitud_individual):d.longitudIndividual,
    longitud:r.longitud!=null?Number(r.longitud):d.longitud,
    longitudUnidad:r.longitud_unidad||d.longU||d.longitudUnidad,
    longU:r.longitud_unidad||d.longU||d.longitudUnidad,
    peso:r.peso!=null?Number(r.peso):d.peso,
    pesoU:r.peso_unidad||d.pesoU||d.pesoUnidad,
    pesoUnidad:r.peso_unidad||d.pesoUnidad,
    ubicacion:r.ubicacion_nombre||d.ubicacion||"",
    ubicacionCodigo:r.ubicacion_codigo||d.ubicacionCodigo||null,
    ubicacionAlmacenCodigo:r.almacen_codigo||d.ubicacionAlmacenCodigo||null,
    fechaRecibo:r.fecha_recibo||d.fechaRecibo||"",
    entradaId:Number(r.id),
    created_at:r.created_at||d.created_at||""
  };
}
function entradaDesdeMaterial(m){
  return{
    cantidad:Number(m.cantidad)||0,
    longitudIndividual:m.longitudIndividual,
    longitud:m.longitud,
    longitudUnidad:m.longU||m.longitudUnidad||null,
    peso:m.peso,
    pesoUnidad:m.pesoU||m.pesoUnidad||null,
    ubicacionCodigo:m.ubicacionCodigo||null,
    ubicacion:m.ubicacion||"",
    almacenCodigo:m.ubicacionAlmacenCodigo||null,
    fechaRecibo:m.fechaRecibo||"",
    data:matData(m)
  };
}
function materialDeEntrada(m,e){
  if(!e)return m;
  return{...m,...e,
    codigo:m.codigo,
    descripcion:m.descripcion,
    um:m.um,
    tipoRegistro:m.tipoRegistro,
    esMP:m.esMP,
    entradas:[e],
    existenciaServer:null,
    entradaId:Number(e.id),
    cantidad:Number(e.cantidad)||0,
    proveedor:e.proveedor||"",
    lote:e.lote||e.numeroLoteMP||"",
    tipoMaterial:e.tipoMaterial||"",
    especificacionMedida:e.especificacionMedida||"",
    longitudIndividual:e.longitudIndividual,
    longitud:e.longitud,
    longU:e.longitudUnidad||e.longU||null,
    longitudUnidad:e.longitudUnidad||e.longU||null,
    totalMM:e.totalMM,
    manufactura:e.manufactura||"",
    numeroHeat:e.numeroHeat||"",
    numeroLoteMP:e.numeroLoteMP||"",
    numeroCertificado:e.numeroCertificado||"",
    peso:e.peso,
    pesoU:e.pesoU||e.pesoUnidad||null,
    pesoUnidad:e.pesoU||e.pesoUnidad||null,
    ordenMaterial:e.ordenMaterial||"",
    poNumber:e.poNumber||"",
    noAplica:e.noAplica||{},
    ubicacion:e.ubicacion||"",
    ubicacionCodigo:e.ubicacionCodigo||null,
    ubicacionAlmacenCodigo:e.ubicacionAlmacenCodigo||null,
    fechaRecibo:e.fechaRecibo||"",
    despachos:(m.despachos||[]).filter(d=>Number(d.entrada_id)===Number(e.id)),
    ajustesInventario:(m.ajustesInventario||[]).filter(a=>Number(a.entrada_id)===Number(e.id))
  };
}
function longBaseEntrada(e){
  const individual=Number(e.longitudIndividual);
  if(Number.isFinite(individual)&&individual>0)return{L:individual,u:"mm"};
  const L=Number(e.longitud),u0=e.longitudUnidad||e.longU;
  return{L,u:okU(u0)?u0:"mm"};
}
function entradaEnBase(e){
  const{L,u}=longBaseEntrada(e);
  const cantidad=Number(e.cantidad)||0;
  return{mode:L>0?"long":"pz",u,L,total:L>0?cantidad*L:cantidad,cantidad};
}
function existenciaEntrada(m,e){
  const entrada={
    ...e,
    esMP:m.esMP
  };
  const b=entradaEnBase(entrada);
  const ds=(m.despachos||[]).filter(d=>Number(d.entrada_id)===Number(e.id));
  const usar=(m.entradas?.length===1)?(m.despachos||[]):ds;
  const usarAjustes=(m.entradas?.length===1)?(m.ajustesInventario||[]):(m.ajustesInventario||[]).filter(a=>Number(a.entrada_id)===Number(e.id));
  if(b.mode==="long"){
    const surtido=usar.reduce((s,d)=>s+longitudEnBase(d,b.u),0);
    const ajustes=usarAjustes.reduce((s,a)=>s+ajustesEnBase({ajustesInventario:[a]},b.u),0);
    const rest=r4(b.total-surtido+ajustes);
    return{modo:"long",u:b.u,L:b.L,total:b.total,rest,qty:b.L>0?r4(rest/b.L):0,peso:pesoEquivalente(entrada,rest,b.total)};
  }
  const surtido=usar.reduce((s,d)=>s+(Number(d.cantidad)||0),0);
  const ajustes=usarAjustes.reduce((s,a)=>s+(!a.unidad||a.unidad==="PZ"?Number(a.diferencia||0):0),0);
  return{modo:"pz",u:"PZ",rest:r4(b.cantidad-surtido+ajustes)};
}
function entradaTxt(e){
  const b=entradaEnBase(e);
  return b.mode==="long"?`${fmt(b.cantidad)} PZ · ${fmt(b.total)} ${b.u}`:`${fmt(b.cantidad)} PZ`;
}
function existEntradaTxt(m,e){
  const x=existenciaEntrada(m,e);
  return x.modo==="long"?`${fmt(x.rest)} ${x.u}${x.qty==null?"":" (≈"+fmt(x.qty)+" pz)"}`:`${fmt(x.rest)} PZ`;
}
function trazabilidadEntrada(e){
  return[e?.manufactura,e?.numeroHeat?`Heat ${e.numeroHeat}`:"",e?.numeroLoteMP||e?.lote?`Lote ${e.numeroLoteMP||e.lote}`:"",e?.numeroCertificado?`Cert ${e.numeroCertificado}`:"",e?.ordenMaterial?`Orden ${e.ordenMaterial}`:"",e?.poNumber?`PO ${e.poNumber}`:""].filter(Boolean).join(" · ");
}
function firmaEntrada(e){
  return[e?.cantidad,e?.longitudIndividual,e?.longitud,e?.longitudUnidad||e?.longU,e?.ubicacionCodigo||e?.ubicacion,e?.fechaRecibo,e?.numeroHeat,e?.numeroLoteMP||e?.lote,e?.numeroCertificado,e?.manufactura,e?.ordenMaterial,e?.poNumber].map(v=>String(v??"").trim()).join("|");
}
function entradaImportada(m,e){
  return entradaDeFila({
    id:e.id,
    codigo_material:m.codigo,
    cantidad:e.cantidad,
    longitud_individual:e.longitudIndividual,
    longitud:e.longitud,
    longitud_unidad:e.longitudUnidad||e.longU,
    peso:e.peso,
    peso_unidad:e.pesoU||e.pesoUnidad,
    ubicacion_codigo:e.ubicacionCodigo,
    ubicacion_nombre:e.ubicacion,
    almacen_codigo:e.ubicacionAlmacenCodigo,
    fecha_recibo:e.fechaRecibo,
    data:e.data&&typeof e.data==="object"?e.data:{}
  });
}
async function registrarEntradas(items){
  if(!sb)throw new Error("Supabase no está disponible.");
  const{data,error}=await sb.rpc("registrar_entradas",{p_items:items});
  if(error)throw error;
  return data;
}
function errDB(e,msg){console.error(e);const t=String((e&&e.message)||e||"");
  toast(/EXISTENCIA_CAMBIO_DURANTE_CONTEO/.test(t)?"La existencia cambió mientras realizabas el conteo. Actualiza la consulta e inténtalo de nuevo.":/PIEZA_YA_SURTIDA/.test(t)?"⚠ Una de esas piezas ya fue surtida desde otro equipo":/duplicate|23505/.test(t+((e&&e.code)||""))?"⚠ El código ya existe, use otro.":`${msg} (${t.slice(0,90)})`,1)}
async function leerTodo(tabla,cols,ord){const out=[];
  for(let i=0;;i+=1000){let q=sb.from(tabla).select(cols);ord.forEach(o=>{q=q.order(o)});const{data,error}=await q.range(i,i+999);if(error)throw error;out.push(...data);if(data.length<1000)break}
  return out}
async function leerTodoCompat(tabla,cols,ord,colsSinEntrada){
  try{return await leerTodo(tabla,cols,ord)}
  catch(err){
    if(!colsSinEntrada||!/entrada_id|PGRST204|42703|schema cache|column/i.test(String(err?.message||err)))throw err;
    return leerTodo(tabla,colsSinEntrada,ord);
  }
}
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
  if(t){t.setAttribute("aria-busy","true");t.innerHTML=filasSkeleton(11)}
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
  const[materialesResultado,despachosResultado,ajustesResultado,entradasResultado]=await Promise.allSettled([
    leerTodo("materiales","codigo,data",["codigo"]),
    leerTodoCompat("despachos","codigo,t,data,piezas,entrada_id",["t","id"],"codigo,t,data,piezas"),
    leerTodoCompat("ajustes_inventario_ciclico","id,codigo_material,entrada_id,ubicacion_codigo,ubicacion_nombre,existencia_anterior,existencia_contada,diferencia,unidad,motivo,usuario,created_at",["id"],"id,codigo_material,ubicacion_codigo,ubicacion_nombre,existencia_anterior,existencia_contada,diferencia,unidad,motivo,usuario,created_at"),
    leerTodo("entradas_material","id,codigo_material,cantidad,longitud_individual,longitud,longitud_unidad,peso,peso_unidad,ubicacion_codigo,ubicacion_nombre,almacen_codigo,fecha_recibo,data,created_at",["id"])
  ]);
  if(materialesResultado.status==="rejected")throw materialesResultado.reason;
  if(despachosResultado.status==="rejected")throw despachosResultado.reason;
  const A=materialesResultado.value,B=despachosResultado.value;
  entradasError=entradasResultado.status==="rejected"
    ?(/PGRST205|42P01|does not exist|schema cache/i.test(String(entradasResultado.reason?.message||entradasResultado.reason))?"Falta aplicar la migración supabase_entradas_material.sql para habilitar el registro acumulado por lote.":`No se pudieron cargar las entradas de material: ${String(entradasResultado.reason?.message||entradasResultado.reason)}`)
    :"";
  if(entradasResultado.status==="rejected")console.error(entradasResultado.reason);
  ajustesInventarioError=ajustesResultado.status==="rejected"
    ?(/PGRST205|42P01|does not exist|schema cache/i.test(String(ajustesResultado.reason?.message||ajustesResultado.reason))?"Falta aplicar o actualizar la migración supabase_almacenes.sql para habilitar los conteos cíclicos.":`No se pudieron cargar los conteos cíclicos: ${String(ajustesResultado.reason?.message||ajustesResultado.reason)}`)
    :"";
  if(ajustesResultado.status==="rejected")console.error(ajustesResultado.reason);
  const ajustesPor={};
  if(ajustesResultado.status==="fulfilled")ajustesResultado.value.forEach(a=>{(ajustesPor[a.codigo_material]=ajustesPor[a.codigo_material]||[]).push(a)});
  const entradasPor={};
  if(entradasResultado.status==="fulfilled")entradasResultado.value.forEach(e=>{(entradasPor[e.codigo_material]=entradasPor[e.codigo_material]||[]).push(entradaDeFila(e))});
  const por={};B.forEach(r=>{(por[r.codigo]=por[r.codigo]||[]).push(desDeFila(r))});
  const edI=$("editIndex").value,edCod=edI!==""&&mats[+edI]?mats[+edI].codigo:null;
  const act=actualBase,actEntrada=actualEntradaId,actAntes=act?JSON.stringify(act):"";
  mats=A.map(r=>({...normalizarMaterial(r.data),codigo:r.codigo,despachos:por[r.codigo]||[],ajustesInventario:ajustesPor[r.codigo]||[],entradas:entradasPor[r.codigo]||[]}));
  aplicarExistenciasServidor(await existenciasServidor);
  if(edCod){const i=mats.findIndex(x=>x.codigo===edCod);if(i<0)resetForm();else $("editIndex").value=i}
  sincronizarBorradoresSur();
  render();
  if(!$("vInv").hidden)renderInventario();
  if(!$("vSur").hidden){renderHist();renderSur()}
  renderInicio();
  if(act){const a=mats.find(x=>x.codigo===act.codigo);if(a){
    const e=actEntrada?a.entradas?.find(x=>Number(x.id)===Number(actEntrada)):null;
    if(JSON.stringify(a)!==actAntes||!e)mostrar(a,e?e.id:null);
    else{actualBase=a;actualEntradaId=e.id;actual=materialDeEntrada(a,e)}
  }else{actual=null;actualBase=null;actualEntradaId=null}}
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
const TABLAS_INCR=new Set(["materiales","despachos","ajustes_inventario_ciclico","entradas_material"]);
function renderVisible(){
  if(!$("vInicio").hidden)renderInicio();
  if(!$("vReg").hidden)render();
  if(!$("vSur").hidden){renderHist();renderSur()}
  if(!$("vInv").hidden)renderInventario()
}
function syncSurItems(){
  sincronizarBorradoresSur();
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
    if(actual&&keyMin(actual.codigo)===keyMin(codigo)){actual=null;actualBase=null;actualEntradaId=null;resetForm()}
    syncSurItems();return true;
  }
  const cod=p.new?.codigo;if(!cod)return false;
  const st=edCodActual();
  const i=mats.findIndex(m=>keyMin(m.codigo)===keyMin(cod));
  const prev=i>=0?mats[i]:null;
  const nuevo={...normalizarMaterial(p.new.data||{}),codigo:cod,despachos:prev?prev.despachos:[],ajustesInventario:prev?prev.ajustesInventario:[],entradas:prev?prev.entradas:[]};
  if(i>=0)mats.splice(i,1,nuevo);else mats.push(nuevo);
  if(st)edSet(st);
  if(actualBase&&prev&&keyMin(actualBase.codigo)===keyMin(cod)){
    const e=actualEntradaId?(nuevo.entradas||[]).find(x=>Number(x.id)===Number(actualEntradaId)):null;
    actualBase=nuevo;actual=e?materialDeEntrada(nuevo,e):nuevo;
  }else if(actual&&prev&&keyMin(actual.codigo)===keyMin(cod))actual=nuevo;
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
function upsyncEntrada(type,p){
  const cod=p.new?.codigo_material||p.old?.codigo_material;if(!cod)return false;
  const i=mats.findIndex(m=>keyMin(m.codigo)===keyMin(cod));if(i<0)return false;
  const m=mats[i];
  if(type==="DELETE"){
    const id=p.old?.id;if(id==null)return false;
    m.entradas=(m.entradas||[]).filter(e=>Number(e.id)!==Number(id));
  }else{
    const e=entradaDeFila(p.new);
    const j=(m.entradas||[]).findIndex(x=>Number(x.id)===Number(e.id));
    if(j>=0)m.entradas[j]=e;else m.entradas=[...(m.entradas||[]),e].sort((a,b)=>Number(a.id)-Number(b.id));
  }
  m.cantidad=(m.entradas||[]).reduce((s,e)=>s+(Number(e.cantidad)||0),0);
  if(actualBase&&keyMin(actualBase.codigo)===keyMin(cod)){
    const panel=$("vReg")?.querySelector('[data-module-screen="qr"]');
    if(panel&&!panel.hidden){
      const e=actualEntradaId?(m.entradas||[]).find(x=>Number(x.id)===Number(actualEntradaId)):null;
      if(actualEntradaId&&!e)actualEntradaId=null;
      mostrar(m,actualEntradaId);
    }
  }
  return true;
}
function aplicarCambio(payload){
  try{
    const tabla=payload?.table,type=payload?.eventType;
    if(!tabla||!type)return false;
    if(tabla==="materiales")return upsyncMat(type,payload);
    if(tabla==="despachos")return upsyncDesp(type,payload);
    if(tabla==="ajustes_inventario_ciclico")return upsyncAjuste(type,payload);
    if(tabla==="entradas_material")return upsyncEntrada(type,payload);
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
  canalRT=sb.channel("cambios").on("postgres_changes",{event:"*",schema:"public",table:"materiales"},handler).on("postgres_changes",{event:"*",schema:"public",table:"despachos"},handler).on("postgres_changes",{event:"*",schema:"public",table:"almacenes"},handler).on("postgres_changes",{event:"*",schema:"public",table:"ubicaciones"},handler).on("postgres_changes",{event:"*",schema:"public",table:"ubicaciones_codigos_alias"},handler).on("postgres_changes",{event:"*",schema:"public",table:"movimientos_ubicacion"},handler).on("postgres_changes",{event:"*",schema:"public",table:"ajustes_inventario_ciclico"},handler).on("postgres_changes",{event:"*",schema:"public",table:"entradas_material"},handler).subscribe(estado=>{if((estado==="CHANNEL_ERROR"||estado==="TIMED_OUT")&&canalRT){const c=canalRT;canalRT=null;try{sb.removeChannel(c).catch(()=>{})}catch{}}});
}
