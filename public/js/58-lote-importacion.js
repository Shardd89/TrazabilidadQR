function leerTextoArchivo(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result||""));r.onerror=rej;r.readAsText(f,"utf-8")})}
function normalizarClave(c){return String(c||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"")}
function buscarValorFila(obj,claves){if(!obj)return"";const mapa=new Map(Object.entries(obj).map(([k,v])=>[normalizarClave(k),v]));for(const c of claves){const k=normalizarClave(c),v=mapa.get(k);if(v!==undefined&&v!==null&&String(v).trim()!=="")return v}return""}
function obtenerAlmacenCodigo(valor){if(!valor)return"";const v=String(valor).trim();if(!v)return"";const a=almacenes.find(x=>x.codigo.toLowerCase()===v.toLowerCase()||x.nombre.toLowerCase()===v.toLowerCase());return a?a.codigo:v}
async function procesarFilasUbicaciones(filas){
  const existentes=new Set(ubicaciones.map(u=>normalizarCodigoUbicacion(u.codigo).toLowerCase()));
  const porAlmacen=new Map(almacenes.map(a=>[a.codigo.toLowerCase(),a.codigo]));
  const aInsertar=[],duplicados=[],sinAlmacen=[];
  filas.forEach(row=>{
    const valor=String(buscarValorFila(row,["codigo","ubicacion","codigo_ubicacion","codigoubicacion","ubi","clave"])).trim();
    if(!valor)return;
    const codigo=normalizarCodigoUbicacion(valor);
    if(existentes.has(codigo.toLowerCase())){duplicados.push(codigo);return}
    const almacenCodigo=obtenerAlmacenCodigo(buscarValorFila(row,["almacen_codigo","almacencodigo","almacen","clave_almacen","almacen_id"]));
    if(!almacenCodigo||!porAlmacen.has(almacenCodigo.toLowerCase())){sinAlmacen.push(codigo);return}
    aInsertar.push({codigo,nombre:codigo,almacen_codigo:almacenCodigo});
    existentes.add(codigo.toLowerCase());
  });
  if(!aInsertar.length){throw new Error(`No se importaron ubicaciones. Duplicados: ${duplicados.length} · Sin almacén válido: ${sinAlmacen.length}`)}
  const{error}=await sb.from("ubicaciones").insert(aInsertar);
  if(error)throw error;
  await cargarUbicaciones();
  toast(`Ubicaciones importadas: ${aInsertar.length} · Duplicados: ${duplicados.length} · Sin almacén válido: ${sinAlmacen.length}`);
}
async function importarUbicacionesExcel(file){
  if(!esAdmin)throw new Error("Solo el administrador puede importar ubicaciones.");
  if(!window.XLSX)throw new Error("No se pudo cargar el lector de Excel. Revise la conexión y recargue la página.");
  if(almacenesError||ubicacionesError)throw new Error("Corrija los errores de almacenes/ubicaciones antes de importar.");
  const workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true}),nombreHoja=workbook.SheetNames[0],sheet=workbook.Sheets[nombreHoja];
  if(!sheet)throw new Error("El archivo no contiene hojas para importar.");
  const rows=XLSX.utils.sheet_to_json(sheet,{defval:"",raw:true});
  if(!rows.length)throw new Error("No se encontraron filas para importar.");
  await procesarFilasUbicaciones(rows);
}
async function importarUbicacionesJson(file){
  if(!esAdmin)throw new Error("Solo el administrador puede importar ubicaciones.");
  if(almacenesError||ubicacionesError)throw new Error("Corrija los errores de almacenes/ubicaciones antes de importar.");
  const texto=await leerTextoArchivo(file);
  let data;try{data=JSON.parse(texto)}catch{throw new Error("Archivo JSON no válido")}
  const filas=Array.isArray(data)?data:Array.isArray(data?.ubicaciones)?data.ubicaciones:Array.isArray(data?.items)?data.items:[];
  if(!filas.length)throw new Error("No se encontraron ubicaciones en el JSON.");
  await procesarFilasUbicaciones(filas);
}
$("bUbiExcel").onclick=()=>{if(!esAdmin){toast("Solo el administrador puede importar ubicaciones.",1);return}$("fileUbiExcel").click()};
$("bUbiJson").onclick=()=>{if(!esAdmin){toast("Solo el administrador puede importar ubicaciones.",1);return}$("fileUbiJson").click()};
$("fileUbiExcel").onchange=async e=>{const file=e.target.files[0];e.target.value="";if(!file)return;try{await importarUbicacionesExcel(file)}catch(err){toast(err.message||"No se pudo importar ubicaciones",1)}};
$("fileUbiJson").onchange=async e=>{const file=e.target.files[0];e.target.value="";if(!file)return;try{await importarUbicacionesJson(file)}catch(err){toast(err.message||"No se pudo importar ubicaciones",1)}};
$("ubiForm").addEventListener("submit",async e=>{
  e.preventDefault();const codigo=normalizarCodigoUbicacion($("ubiCodigo").value);
  const almacenCodigo=$("ubiAlmacen").value,almacen=almacenesPorCodigo.get(almacenCodigo);
  if(!codigo||!almacen)return;
  if(ubicaciones.some(loc=>loc.almacen_codigo===almacenCodigo&&normalizarCodigoUbicacion(loc.codigo).toLocaleLowerCase()===codigo.toLocaleLowerCase())){
    toast(`La ubicación ${codigo} ya está registrada en ${almacen.nombre}.`,1);return;
  }
  $("ubiGuardar").disabled=true;
  try{const{error}=await sb.from("ubicaciones").insert({codigo,nombre:codigo,almacen_codigo:almacenCodigo});if(error)throw error;
    $("ubiCodigo").value="";siguienteCodigoUbicacion();await cargarUbicaciones();$("ubiAlmacen").value=almacenCodigo;renderUbicaciones();toast(`Ubicación guardada en ${almacen.nombre}: ${codigo}`);
  }catch(err){errDB(err,"No se pudo guardar la ubicación")}
  finally{$("ubiGuardar").disabled=false}
});
function manejarLectorUbicacion(){
  const field=$("ubiScan"),valor=field.value.trim();if(!valor)return;
  procesarEscaneoInventario(valor);field.value="";
}
$("ubiScan").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();manejarLectorUbicacion()}});
$("ubiConfirmar").onclick=confirmarAsignacion;
$("ubiLimpiar").onclick=()=>{asignacionItems=[];ubicacionDestino=null;$("ubiDestino").textContent="Sin seleccionar";renderAsignacion()};
function syncBulkActions(){
  const visible=[...$("tbody").querySelectorAll("[data-select]")],checked=visible.filter(c=>c.checked).length,all=$("selectAll");
  all.hidden=false;$("seleccionInfo").hidden=false;$("bDelSel").hidden=$("bDelAll").hidden=!esAdmin;
  all.checked=visible.length>0&&checked===visible.length;all.indeterminate=checked>0&&checked<visible.length;
  $("seleccionInfo").textContent=`${seleccionados.size} seleccionados`;
  $("bDelSel").disabled=seleccionados.size===0;$("bDelAll").disabled=mats.length===0;
  $("bPrintSel").disabled=seleccionados.size===0;
}
$("buscar").oninput=debounce(render,250);$("ftipo").onchange=render;
document.querySelectorAll("th[data-k]").forEach(th=>th.onclick=()=>{orden={k:th.dataset.k,asc:orden.k===th.dataset.k?!orden.asc:true};render()});
$("selectAll").addEventListener("change",e=>{
  $("tbody").querySelectorAll("[data-select]").forEach(c=>{c.checked=e.target.checked;if(c.checked)seleccionados.add(c.dataset.select);else seleccionados.delete(c.dataset.select)});
  syncBulkActions();
});
$("tbody").addEventListener("change",e=>{
  const c=e.target.closest("[data-select]");if(!c)return;
  if(c.checked)seleccionados.add(c.dataset.select);else seleccionados.delete(c.dataset.select);
  syncBulkActions();
});
function alternarQrMaterial(m){
  const panel=$("vReg").querySelector('[data-module-screen="qr"]');
  if(actual?.codigo===m.codigo&&!panel.hidden){
    panel.hidden=true;actual=null;
    $("vReg").classList.remove("qr-visible");
    $("qrBox").innerHTML="Guarde o seleccione un material para generar su QR";
    $("ficha").innerHTML="";
    $("bPrint").disabled=$("bPng").disabled=true;
    $("piezasBox").hidden=true;
    $("pzGrid").innerHTML="";
    return;
  }
  mostrar(m);
}
$("tbody").addEventListener("click",async e=>{
  const b=e.target.closest("button");
  if(b){
    const i=+b.dataset.i,m=mats[i];
    if(b.dataset.a==="qr"){alternarQrMaterial(m);return}
    if(b.dataset.a==="ed"){if(esAdmin)editar(i);else toast("Solo el administrador puede editar materiales.",1);return}
    if(b.dataset.a==="del"){
      if(!esAdmin){toast("Solo el administrador puede eliminar materiales.",1);return}
      if(confirm(`¿Eliminar el material ${m.codigo}? También se borran sus surtidos.`)){try{const{error}=await sb.from("materiales").delete().eq("codigo",m.codigo);if(error)throw error;await cargar();toast("Material eliminado")}catch(err){errDB(err,"No se pudo eliminar")}}
    }
    return;
  }
  if(e.target.closest("input,select,textarea,a"))return;
  const fila=e.target.closest("tr"),botonQr=fila?.querySelector('button[data-a="qr"]');
  if(!botonQr)return;
  const m=mats[+botonQr.dataset.i];
  if(m)alternarQrMaterial(m);
});
async function eliminarEnLotes(codigos){
 if(!esAdmin)throw new Error("Solo el administrador puede eliminar materiales.");
 for(let i=0;i<codigos.length;i+=100){
   const{error}=await sb.from("materiales").delete().in("codigo",codigos.slice(i,i+100));
   if(error)throw error;
 }
}
$("bDelSel").onclick=async()=>{
 if(!esAdmin){toast("Solo el administrador puede eliminar materiales.",1);return}
 const codigos=[...seleccionados].filter(c=>mats.some(m=>m.codigo===c));
 if(!codigos.length){seleccionados.clear();render();return}
 if(!confirm(`¿Eliminar ${codigos.length} material(es) seleccionado(s)? También se borrarán sus surtidos.`))return;
 $("bDelSel").disabled=$("bDelAll").disabled=true;
 try{await eliminarEnLotes(codigos);codigos.forEach(c=>seleccionados.delete(c));toast(`${codigos.length} material(es) eliminado(s)`)}
 catch(err){errDB(err,"No se pudieron eliminar todos los materiales")}
 try{await cargar()}catch(err){errDB(err,"No se pudo actualizar la lista")}
};
$("bDelAll").onclick=async()=>{
 if(!esAdmin){toast("Solo el administrador puede restablecer el catálogo.",1);return}
 const codigos=mats.map(m=>m.codigo);
 if(!codigos.length)return;
 if(!confirm(`¿Eliminar TODOS los ${codigos.length} materiales? También se borrarán sus surtidos. Esta acción no se puede deshacer.`))return;
 $("bDelSel").disabled=$("bDelAll").disabled=true;
 try{await eliminarEnLotes(codigos);seleccionados.clear();toast(`${codigos.length} material(es) eliminado(s)`)}
 catch(err){errDB(err,"No se pudieron eliminar todos los materiales")}
 try{await cargar()}catch(err){errDB(err,"No se pudo actualizar la lista")}
};
function editar(i){
  if(!esAdmin){toast("Solo el administrador puede editar materiales.",1);return}
  activarSubpantalla("vReg","captura");
  const m=mats[i];resetForm();$("editIndex").value=i;
  const values={codigo:m.codigo,descripcion:m.descripcion,um:m.um,cantidad:m.cantidad,ubicacion:m.ubicacion,fechaRecibo:m.fechaRecibo,tipoRegistro:m.tipoRegistro|| (m.esMP?"MP":"GENERAL"),seccionMaterial:m.noAplica?.seccionMaterial?"":m.seccionMaterial,altoMaterial:m.alto,anchoMaterial:m.ancho,diametroMaterial:m.diametro,
    tipoMaterial:m.tipoMaterial??(m.esMP?"Materia prima":m.tipoRegistro==="CONSUMIBLES"?"Consumibles":"Material general"),especificacionMedida:m.especificacionMedida,longitudIndividual:m.longitudIndividual,manufactura:m.manufactura,
    numeroHeat:m.numeroHeat,numeroLoteMP:m.numeroLoteMP??m.lote,numeroCertificado:m.numeroCertificado,totalMM:m.totalMM,peso:m.peso,ordenMaterial:m.ordenMaterial,poNumber:m.poNumber};
  Object.entries(values).forEach(([id,value])=>$(id).value=value??"");
  actualizarCamposSeccion();
  $("um").value="PZ";
  $("pesoU").value=m.pesoU||m.pesoUnidad||(m.pesoUnidadPendiente?"":(["LB","KG"].includes(m.um)?m.um:"LB"));
  CAMPOS_EXTRA.forEach(([key,id])=>{
    const noAplica=!!m.noAplica?.[key],checkbox=document.querySelector(`input[data-na="${id}"]`),input=$(id);
    checkbox.checked=noAplica;input.value=values[key]??"";
    const wrap=input.closest(".na-field").querySelector(".na-value-wrap")||input;wrap.hidden=noAplica;
  });
  const seccionNoAplica=!!m.noAplica?.seccionMaterial,seccionCheckbox=document.querySelector('input[data-na="seccionMaterial"]');
  seccionCheckbox.checked=seccionNoAplica;$("seccionMaterial").hidden=seccionNoAplica;
  actualizarCamposSeccion();
  $("tituloForm").textContent=`Editando: ${m.codigo}`;$("btnGuardar").textContent="💾 Guardar cambios y regenerar QR";$("btnCancelar").hidden=false;
  establecerFormularioAbierto(true);window.scrollTo({top:0,behavior:"smooth"});
  $("detTraza").open=true;
}

// --- Exportar / Importar ---
async function bajar(nombre,contenido,tipo){
  if(matchMedia("(pointer:coarse)").matches){try{const f=new File([contenido],nombre,{type:tipo.split(";")[0]});if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:nombre});return}}catch(e){if(e.name==="AbortError")return}}
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([contenido],{type:tipo}));a.download=nombre;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$("bJson").onclick=()=>{if(!esAdmin){toast("Solo el administrador puede exportar información.",1);return}bajar("trazabilidad_materiales.json",JSON.stringify(mats,null,2),"application/json");toast("JSON exportado ⬇️")};
$("bCsv").onclick=()=>{
  if(!esAdmin){toast("Solo el administrador puede exportar información.",1);return}
  const cols=["UBICACION","CODIGO","CLASIFICACION","TIPO MATERIAL","DESCRIPCION","ESPECIFICACION MEDIDA","SECCION","ALTO (MM)","ANCHO (MM)","DIAMETRO (MM)","LONGITUD IND (MM)","MANUFACTURA","N°HEAT","N°LOTE MP","N°CERT.","TOTAL MM","FECHA DE RECIBO","CTD","PESO","UM","ORDEN","PO NUMBER"];
  const c=v=>{let t=String(v??"");if(/^[=+\-@\t\r]/.test(t))t="'"+t;return `"${t.replace(/"/g,'""')}"`};
  const value=(m,key,v)=>m.noAplica?.[key]?"No aplica":v;
  const rows=mats.map(m=>[m.ubicacion,m.codigo,nombreTipoRegistro(m.tipoRegistro).toUpperCase(),value(m,"tipoMaterial",m.tipoMaterial),m.descripcion,
    value(m,"especificacionMedida",m.especificacionMedida),value(m,"seccionMaterial",m.seccionMaterial),m.alto,m.ancho,m.diametro,value(m,"longitudIndividual",m.longitudIndividual),value(m,"manufactura",m.manufactura),value(m,"numeroHeat",m.numeroHeat),
    value(m,"numeroLoteMP",m.numeroLoteMP||m.lote),value(m,"numeroCertificado",m.numeroCertificado),value(m,"totalMM",m.totalMM),
    m.fechaRecibo,m.cantidad,value(m,"peso",m.peso),m.noAplica?.peso?"No aplica":m.pesoUnidadPendiente?"Sin especificar":m.pesoU||m.pesoUnidad||"LB",
    value(m,"ordenMaterial",m.ordenMaterial),value(m,"poNumber",m.poNumber)]);
  bajar("trazabilidad_materiales.csv","\ufeff"+[cols.join(","),...rows.map(row=>row.map(c).join(","))].join("\r\n"),"text/csv;charset=utf-8");toast("CSV exportado ⬇️");
};
$("bImp").onclick=()=>{if(!esAdmin){toast("Solo el administrador puede restaurar información.",1);return}$("fileImp").click()};
$("bExcel").onclick=()=>{if(!esAdmin){toast("Solo el administrador puede importar información.",1);return}$("fileExcel").click()};
const EXCEL_HEADERS={
  ubicacion:["ubicacion","location"],codigo:["codigo","code"],tipoRegistro:["clasificacion","tiporegistro","categoriaregistro"],tipoMaterial:["tipomaterial","tipo"],descripcion:["descripcion","description"],
  seccionMaterial:["seccion","seccionmaterial","forma","shape"],alto:["alto","altomm","height"],ancho:["ancho","anchomm","width"],diametro:["diametro","diametromm","diameter"],
  especificacionMedida:["especificacionmedida","especificacion","medida"],longitudIndividual:["longitudind","longitudindmm","longituddelmaterial","longitudinddelmaterial","longitudindividual","longitudindividualmm","longitudindividualdelmaterial","longitudpza","longitudpieza","longitudporpieza","longind","longindmm"],manufactura:["manufactura","fabricacion"],
  numeroHeat:["nheat","numeroheat","heat"],numeroLoteMP:["nlotemp","numerolotemp","lotemp"],
  numeroCertificado:["ncert","ncertificado","numerocertificado","certificado"],totalMM:["totalmm"],
  fechaRecibo:["fechaderecibo","fecharecibo","fecha"],cantidad:["ctd","cantidad","quantity"],
  peso:["peso","weight"],um:["um","unidadmedida","unidad"],
  ordenMaterial:["orden","ordenmaterial","order"],poNumber:["ponumber","po"]
};
function normalizarEncabezado(v){return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"")}
function buscarEncabezados(rows){
  for(let i=0;i<Math.min(rows.length,20);i++){
    const headers=rows[i].map(normalizarEncabezado),mapped={};
    Object.entries(EXCEL_HEADERS).forEach(([key,aliases])=>{const index=headers.findIndex(h=>aliases.includes(h));if(index>=0)mapped[key]=index});
    if(["codigo","descripcion","ubicacion","cantidad","fechaRecibo"].every(key=>mapped[key]!=null))return{index:i,mapped};
  }
  throw new Error("No se encontraron los encabezados requeridos: UBICACION, CODIGO, DESCRIPCION, FECHA DE RECIBO y CTD.");
}
function valorCelda(row,mapped,key){return mapped[key]==null?"":row[mapped[key]]??""}
function numeroExcel(value){
  if(typeof value==="number")return Number.isFinite(value)?value:null;
  let s=String(value??"").trim().replace(/\s/g,"");if(!s)return null;
  if(s.includes(",")&&s.includes("."))s=s.lastIndexOf(",")>s.lastIndexOf(".")?s.replace(/\./g,"").replace(",","."):s.replace(/,/g,"");
  else if(s.includes(","))s=s.replace(",",".");
  const n=Number(s);return Number.isFinite(n)?n:null;
}
function fechaExcel(value){
  if(value instanceof Date&&!isNaN(value))return value.toISOString().slice(0,10);
  if(typeof value==="number"){const d=XLSX.SSF.parse_date_code(value);return d?`${String(d.y).padStart(4,"0")}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`:""}
  const s=String(value??"").trim();let m;
  if(m=/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s))return`${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  if(m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))return`${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  return"";
}
function esNoAplica(value){return["na","n/a","n.a.","no aplica","noaplica","no aplica."].includes(String(value??"").trim().toLowerCase())}
function normalizarSeccion(value){
  const s=String(value??"").trim().toUpperCase();
  if(["SQ","SQUARE","CUADRADA","CUADRADO"].includes(s))return"SQ";
  if(["FLAT","PLANA","PLANO"].includes(s))return"FLAT";
  if(["RND","ROUND","REDONDA","REDONDO","RD"].includes(s))return"RND";
  return"";
}
function inferirSeccion(texto){
  const s=String(texto??"").toUpperCase();
  if(/\b(?:SQ|SQUARE|CUADRADA|CUADRADO)\b/.test(s))return"SQ";
  if(/\b(?:FLAT|PLANA|PLANO)\b/.test(s))return"FLAT";
  if(/\b(?:RND|ROUND|REDONDA|REDONDO)\b/.test(s))return"RND";
  return"";
}
function materialDesdeExcel(row,mapped,esMateriaPrima=false){
  const get=key=>valorCelda(row,mapped,key),text=key=>String(get(key)??"").trim(),raw={};
  Object.keys(EXCEL_HEADERS).forEach(key=>raw[key]=get(key));
  const noAplica=Object.fromEntries(CAMPOS_EXTRA.map(([key])=>[key,esNoAplica(raw[key])]));
  noAplica.seccionMaterial=esNoAplica(get("seccionMaterial"));
  if(esNoAplica(get("um")))noAplica.peso=true;
  const stringValue=key=>noAplica[key]?"":String(raw[key]??"").trim();
  const codigo=text("codigo"),descripcion=text("descripcion"),ubicacion=text("ubicacion");
  const cantidad=numeroExcel(get("cantidad")),peso=numeroExcel(get("peso")),umOriginal=text("um").toUpperCase();
  const pesoUnitMap={LB:"LB",LBS:"LB",LIBRA:"LB",LIBRAS:"LB",KG:"KG",KGS:"KG",KILOGRAM:"KG",KILOGRAMO:"KG",KILOGRAMOS:"KG"};
  const umCantidad=["PZ","PZA","PIEZA","PIEZAS"].includes(umOriginal);
  const tipoArchivo=text("tipoRegistro").toUpperCase(),esMP=/^(?:MP|MATERIA PRIMA)$/.test(tipoArchivo)||esMateriaPrima||/materia\s*prima|^mp$/i.test(text("tipoMaterial")),esConsumible=/^CONSUMIBLES?$/.test(tipoArchivo);
  const seccionMaterial=noAplica.seccionMaterial?"":normalizarSeccion(get("seccionMaterial"))||inferirSeccion(`${text("especificacionMedida")} ${text("descripcion")}`);
  const fechaRecibo=fechaExcel(get("fechaRecibo"));
  if(!codigo||!descripcion||cantidad==null||cantidad<0||!fechaRecibo||(umOriginal&&!pesoUnitMap[umOriginal]&&!umCantidad&&!noAplica.peso))return null;
  const extra=Object.fromEntries(CAMPOS_EXTRA.map(([key])=>[key,noAplica[key]?["peso","totalMM","longitudIndividual"].includes(key)?null:"":["peso","totalMM","longitudIndividual"].includes(key)?numeroExcel(raw[key]):stringValue(key)]));
  if(!noAplica.totalMM&&extra.longitudIndividual!=null)extra.totalMM=cantidad*extra.longitudIndividual;
  return{codigo,descripcion,lote:extra.numeroLoteMP,proveedor:"",um:"PZ",cantidad,ubicacion,fechaRecibo,
    fechaModificacion:new Date().toLocaleString("es-MX"),tipoRegistro:esMP?"MP":esConsumible?"CONSUMIBLES":"GENERAL",seccionMaterial,esMP,peso,pesoU:extra.peso==null?null:(pesoUnitMap[umOriginal]||null),pesoUnidadPendiente:extra.peso!=null&&umCantidad,longitud:null,longU:null,
    seccion:seccionMaterial==="RND"?"redondo":["SQ","FLAT"].includes(seccionMaterial)?"cuadrado":null,secU:"mm",
    diametro:seccionMaterial==="RND"?numeroExcel(get("diametro")):null,
    alto:["SQ","FLAT"].includes(seccionMaterial)?numeroExcel(get("alto")):null,
    ancho:["SQ","FLAT"].includes(seccionMaterial)?numeroExcel(get("ancho")):null,...extra,noAplica,despachos:[]};
}
function consolidarExcelPorCodigo(materiales){
  const porCodigo=new Map();let filasAgrupadas=0;
  const camposIguales=["tipoRegistro","seccionMaterial","tipoMaterial","especificacionMedida","manufactura","totalMM","ubicacion","alto","ancho","diametro"];
  const camposCombinables=["numeroHeat","numeroLoteMP","numeroCertificado"];
  materiales.forEach(m=>{
    const clave=m.codigo.toLocaleLowerCase(),anterior=porCodigo.get(clave);
    if(!anterior){porCodigo.set(clave,m);return}
    for(const campo of camposIguales.filter(c=>c!=="totalMM")){
      const a=String(anterior[campo]??"").trim(),b=String(m[campo]??"").trim();
      if(a&&b&&a!==b)throw new Error(`El código ${m.codigo} aparece con valores distintos en "${campo}". Corrija esas filas antes de importar.`);
      if(!a&&b)anterior[campo]=m[campo];
    }
    if(anterior.longitudIndividual!=null&&m.longitudIndividual!=null&&anterior.longitudIndividual!==m.longitudIndividual)
      throw new Error(`El código ${m.codigo} aparece con longitudes individuales distintas. Corrija esas filas antes de importar.`);
    if(anterior.longitudIndividual==null)anterior.longitudIndividual=m.longitudIndividual;
    camposCombinables.forEach(campo=>{
      const valores=[...new Set([anterior[campo],m[campo]].flatMap(v=>String(v??"").split(" / ")).map(v=>v.trim()).filter(Boolean))];
      anterior[campo]=valores.join(" / ");
    });
    anterior.lote=anterior.numeroLoteMP;
    if(anterior.peso!=null&&m.peso!=null&&anterior.pesoU!==m.pesoU)
      throw new Error(`El código ${m.codigo} tiene pesos con unidades distintas o sin unidad. No se pueden sumar con seguridad.`);
    anterior.cantidad+=m.cantidad;
    if(m.peso!=null){
      anterior.peso=anterior.peso==null?m.peso:anterior.peso+m.peso;
      if(!anterior.pesoU)anterior.pesoU=m.pesoU;
    }
    anterior.pesoUnidadPendiente=anterior.peso!=null&&!anterior.pesoU;
    if(anterior.longitudIndividual!=null&&!anterior.noAplica?.totalMM)
      anterior.totalMM=anterior.cantidad*anterior.longitudIndividual;
    else if(anterior.totalMM!=null&&m.totalMM!=null)anterior.totalMM+=m.totalMM;
    const descripciones=[...new Set([anterior.descripcion,m.descripcion].filter(Boolean))];
    anterior.descripcion=descripciones.join(" / ");
    anterior.fechaRecibo=[anterior.fechaRecibo,m.fechaRecibo].sort()[0];
    const ordenes=[...new Set([anterior.ordenMaterial,m.ordenMaterial].flatMap(v=>String(v??"").split(" / ")).map(v=>v.trim()).filter(Boolean))];
    anterior.ordenMaterial=ordenes.join(" / ");
    filasAgrupadas++;
  });
  return{materiales:[...porCodigo.values()],filasAgrupadas};
}
async function importarExcel(file){
  if(!esAdmin)throw new Error("Solo el administrador puede importar información.");
  if(!window.XLSX)throw new Error("No se pudo cargar el lector de Excel. Revise la conexión y recargue la página.");
  const workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true}),nombreHoja=workbook.SheetNames[0],sheet=workbook.Sheets[nombreHoja];
  if(!sheet)throw new Error("El archivo no contiene hojas para importar.");
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true}),{index,mapped}=buscarEncabezados(rows);
  const esMateriaPrima=/materia[\s_-]*prima|\bmp\b/i.test(`${nombreHoja} ${file.name||""}`);
  let invalidos=0;const filas=[];
  rows.slice(index+1).forEach(row=>{
    if(!row.some(v=>String(v??"").trim()))return;
    const material=materialDesdeExcel(row,mapped,esMateriaPrima);if(!material){invalidos++;return}
    filas.push(material);
  });
  const{materiales:consolidados,filasAgrupadas}=consolidarExcelPorCodigo(filas);
  const codigosExistentes=new Set(mats.map(m=>m.codigo.toLocaleLowerCase()));
  const nuevos=consolidados.filter(m=>!codigosExistentes.has(m.codigo.toLocaleLowerCase()));
  const existentes=consolidados.length-nuevos.length;
  if(!nuevos.length){toast(`No se agregaron materiales. Ya existentes: ${existentes} · filas agrupadas: ${filasAgrupadas} · inválidas: ${invalidos}`,1);return}
  try{await subirLista(nuevos,[]);await cargar();renderHist();toast(`Importados: ${nuevos.length} · filas agrupadas: ${filasAgrupadas} · ya existentes: ${existentes} · inválidas: ${invalidos}`)}
  catch(err){errDB(err,"No se pudo importar el Excel");await cargar().catch(()=>{})}
}
$("fileExcel").onchange=async e=>{
  const file=e.target.files[0];e.target.value="";if(!file)return;
  try{await importarExcel(file)}catch(err){toast(err.message||"No se pudo leer el archivo de Excel",1)}
};
$("fileImp").onchange=e=>{
  if(!esAdmin){e.target.value="";toast("Solo el administrador puede restaurar información.",1);return}
  const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=async()=>{try{
    const a=JSON.parse(r.result);if(!Array.isArray(a))throw 0;let nuevos=0,omit=0,surt=0;
    const antesC=new Set(mats.map(x=>x.codigo.toLowerCase())),antesT=new Set(mats.flatMap(x=>(x.despachos||[]).map(d=>x.codigo.toLowerCase()+"|"+d.t)));
    a.forEach(m=>{if(!m||!m.codigo){omit++;return}Object.assign(m,normalizarMaterial(m));m.codigo=String(m.codigo);m.esMP=!!m.esMP;m.cantidad=Number(m.cantidad)||0;m.despachos=Array.isArray(m.despachos)?m.despachos.filter(d=>d&&typeof d==="object"):[];const ex=mats.find(x=>x.codigo.toLowerCase()===String(m.codigo).toLowerCase());if(ex){const ids=new Set((ex.despachos||[]).map(d=>d.t));let add=0;(m.despachos||[]).forEach(d=>{if(!ids.has(d.t)){(ex.despachos=ex.despachos||[]).push(d);add++}});if(add)surt+=add;else omit++;return}mats.push(m);nuevos++});
    const msN=mats.filter(m=>!antesC.has(m.codigo.toLowerCase())),dsN=mats.flatMap(m=>(m.despachos||[]).filter(d=>d&&d.t!=null&&!antesT.has(m.codigo.toLowerCase()+"|"+d.t)).map(d=>({codigo:m.codigo,d})));
    try{await subirLista(msN,dsN)}catch(err){errDB(err,"No se pudo subir a Supabase");await cargar().catch(()=>{});return}
    await cargar().catch(()=>{});renderHist();toast(`Nuevos: ${nuevos} · surtidos fusionados: ${surt} · sin cambios: ${omit}`);
  }catch{toast("Archivo JSON no válido",1)}};
  r.readAsText(f);e.target.value="";
};

