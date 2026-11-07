const $=id=>document.getElementById(id);
const K="trazabilidad_materiales_v2";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function debounce(fn,ms){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms)}}
const hoy=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
const fmt=n=>Number(n).toLocaleString("es-MX",{maximumFractionDigits:3});
function totalTxt(m){return m.esMP&&m.um==="PZ"&&m.cantidad>0&&m.longitud>0?`${fmt(m.cantidad*m.longitud)} ${m.longU||m.longitudUnidad||"mm"}`:""}
let mats=[],actual=null,orden={k:null,asc:true},esStaff=false,esAdmin=false,almacenes=[],ubicaciones=[],ubicacionesAlias=[],movimientosUbicacion=[],ajustesInventarioError="",almacenesError="",ubicacionesError="",ubicacionesAliasError="",movimientosError="",ubicacionDestino=null,asignacionItems=[];
let ubicacionesPorCodigo=new Map(),almacenesPorCodigo=new Map();
function reconstruirIndices(){
  ubicacionesPorCodigo=new Map(ubicaciones.map(u=>[String(u.codigo),u]));
  almacenesPorCodigo=new Map(almacenes.map(a=>[String(a.codigo),a]));
}
function ubicacionDe(m){return m?ubicacionesPorCodigo.get(m.ubicacionCodigo):undefined}
function almacenDe(m){const loc=ubicacionDe(m);const almCodigo=loc?.almacen_codigo||m?.ubicacionAlmacenCodigo;return almCodigo?almacenesPorCodigo.get(almCodigo):undefined}
function tagTipo(m){return m.esMP?'<span class="tag t1">M. PRIMA</span>':m.tipoRegistro==="CONSUMIBLES"?'<span class="tag t2">CONSUMIBLES</span>':'<span class="tag t2">GENERAL</span>'}
const seleccionados=new Set();

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
const matData=m=>{const{despachos,ajustesInventario,...r}=m;return r};
const desData=d=>{const{t,piezas,...r}=d;return r};
const desFila=(codigo,d)=>({codigo,t:d.t,data:desData(d),piezas:d.piezas||[]});
const desDeFila=r=>({...r.data,t:Number(r.t),...(r.piezas&&r.piezas.length?{piezas:r.piezas}:{})});
function errDB(e,msg){console.error(e);const t=String((e&&e.message)||e||"");
  toast(/EXISTENCIA_CAMBIO_DURANTE_CONTEO/.test(t)?"La existencia cambió mientras realizabas el conteo. Actualiza la consulta e inténtalo de nuevo.":/PIEZA_YA_SURTIDA/.test(t)?"⚠ Una de esas piezas ya fue surtida desde otro equipo":/duplicate|23505/.test(t+((e&&e.code)||""))?"⚠ El código ya existe, use otro.":`${msg} (${t.slice(0,90)})`,1)}
async function leerTodo(tabla,cols,ord){const out=[];
  for(let i=0;;i+=1000){let q=sb.from(tabla).select(cols);ord.forEach(o=>{q=q.order(o)});const{data,error}=await q.range(i,i+999);if(error)throw error;out.push(...data);if(data.length<1000)break}
  return out}
