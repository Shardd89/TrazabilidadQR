// --- Formulario ---
const CAMPOS_EXTRA=[["tipoMaterial","tipoMaterial"],["especificacionMedida","especificacionMedida"],["longitudIndividual","longitudIndividual"],["manufactura","manufactura"],["numeroHeat","numeroHeat"],["numeroLoteMP","numeroLoteMP"],["numeroCertificado","numeroCertificado"],["totalMM","totalMM"],["peso","peso"],["ordenMaterial","ordenMaterial"],["poNumber","poNumber"]];
const numeroCampo=id=>$(id).value===""?null:Number($(id).value);
function recalcularTotalMM(origen){
  const naTotal=document.querySelector('input[data-na="totalMM"]').checked;
  if(naTotal)return;
  const longInput=$("longitudIndividual"),qtyInput=$("cantidad");
  if(longInput.value===""){
    if(origen==="longitudIndividual")$("totalMM").value="";
    return;
  }
  const longitud=Number(longInput.value),cantidad=Number(qtyInput.value);
  if(Number.isFinite(longitud)&&Number.isFinite(cantidad)&&longitud>=0&&cantidad>=0)
    $("totalMM").value=String(longitud*cantidad);
}
document.querySelectorAll("[data-na]").forEach(c=>c.addEventListener("change",()=>{
  const input=$(c.dataset.na),wrap=input.closest(".na-field").querySelector(".na-value-wrap")||input;
  wrap.hidden=c.checked;if(c.checked)input.value="";
  if(c.dataset.na==="seccionMaterial")actualizarCamposSeccion();
  if(c.dataset.na==="longitudIndividual")recalcularTotalMM("longitudIndividual");
  if(c.dataset.na==="totalMM"&&!c.checked)recalcularTotalMM();
}));
$("longitudIndividual").addEventListener("input",()=>recalcularTotalMM("longitudIndividual"));
$("cantidad").addEventListener("input",()=>recalcularTotalMM("cantidad"));
function actualizarCamposSeccion(){
  const seccion=$("seccionMaterial").value;
  $("dimensionesLineales").hidden=seccion!=="SQ"&&seccion!=="FLAT";
  $("dimensionRedonda").hidden=seccion!=="RND";
}
$("seccionMaterial").addEventListener("change",actualizarCamposSeccion);
$("btnAuto").onclick=()=>{let n=0;mats.forEach(m=>{const x=/^MAT-(\d+)$/i.exec(m.codigo);if(x)n=Math.max(n,+x[1])});$("codigo").value="MAT-"+String(n+1).padStart(4,"0")};

function establecerFormularioAbierto(abierto){$("f").hidden=!abierto;$("tituloForm").setAttribute("aria-expanded",String(abierto))}
$("tituloForm").addEventListener("click",()=>establecerFormularioAbierto($("f").hidden));
$("tituloForm").addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();establecerFormularioAbierto($("f").hidden)}});
function resetForm(){$("f").reset();document.querySelectorAll("[data-na]").forEach(c=>{c.checked=false;$(c.dataset.na).closest(".na-field").querySelector(".na-value-wrap")?.removeAttribute("hidden");$(c.dataset.na).hidden=false});CAMPOS_EXTRA.forEach(([,id])=>$(id).hidden=false);actualizarCamposSeccion();$("editIndex").value="";$("fechaRecibo").value=hoy();$("tituloForm").textContent="Registro de material";$("btnGuardar").textContent="💾 Guardar y generar QR";$("btnCancelar").hidden=true;$("detTraza").open=false;establecerFormularioAbierto(false)}

$("f").addEventListener("invalid",()=>{$("detTraza").open=true},true);
$("f").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!esAdmin){toast("Solo el administrador puede registrar o editar materiales.",1);return}
  recalcularTotalMM();
  const idx=$("editIndex").value;
  const noAplica=Object.fromEntries(CAMPOS_EXTRA.map(([key,id])=>[key,document.querySelector(`input[data-na="${id}"]`).checked]));
  noAplica.seccionMaterial=document.querySelector('input[data-na="seccionMaterial"]').checked;
  const extra=Object.fromEntries(CAMPOS_EXTRA.map(([key,id])=>[key,noAplica[key]?(["totalMM","longitudIndividual","peso"].includes(key)?null:""): (["totalMM","longitudIndividual","peso"].includes(key)?($(id).value===""?null:Number($(id).value)):$(id).value.trim())]));
  const tipoMaterial=noAplica.tipoMaterial?"":$("tipoMaterial").value.trim(),tipoRegistro=$("tipoRegistro").value;
  const anterior=idx!==""?mats[idx]:null;
  const m={codigo:$("codigo").value.trim(),descripcion:$("descripcion").value.trim(),lote:extra.numeroLoteMP||"",proveedor:"",
    um:$("um").value,cantidad:parseFloat($("cantidad").value),ubicacion:$("ubicacion").value.trim(),fechaRecibo:$("fechaRecibo").value,
    fechaModificacion:new Date().toLocaleString("es-MX"),tipoRegistro,esMP:tipoRegistro==="MP",seccionMaterial:noAplica.seccionMaterial?"":$("seccionMaterial").value,
    ubicacionCodigo:anterior&&$("ubicacion").value.trim()===anterior.ubicacion?anterior.ubicacionCodigo||null:null,
    ubicacionAlmacenCodigo:anterior&&$("ubicacion").value.trim()===anterior.ubicacion?anterior.ubicacionAlmacenCodigo||null:null,
    ubicacionAlmacenNombre:anterior&&$("ubicacion").value.trim()===anterior.ubicacion?anterior.ubicacionAlmacenNombre||null:null,
    peso:extra.peso,pesoU:extra.peso==null?null:$("pesoU").value,pesoUnidadPendiente:extra.peso!=null&&!$("pesoU").value,
    longitud:anterior?.longitud??null,longU:anterior?.longU||anterior?.longitudUnidad||null,
    seccion:tipoRegistro==="MP"?({SQ:"cuadrado",FLAT:"cuadrado",RND:"redondo"}[$("seccionMaterial").value]||null):null,
    secU:tipoRegistro==="MP"?"mm":null,
    diametro:tipoRegistro==="MP"&&$("seccionMaterial").value==="RND"?numeroCampo("diametroMaterial"):null,
    alto:tipoRegistro==="MP"&&["SQ","FLAT"].includes($("seccionMaterial").value)?numeroCampo("altoMaterial"):null,
    ancho:tipoRegistro==="MP"&&["SQ","FLAT"].includes($("seccionMaterial").value)?numeroCampo("anchoMaterial"):null,
    ...extra,noAplica};
  m.despachos=anterior?(anterior.despachos||[]):[];
  const dup=mats.findIndex(x=>x.codigo.toLowerCase()===m.codigo.toLowerCase());
  if(dup!==-1&&String(dup)!==idx){toast("⚠ El código ya existe, use otro.",1);return}
  const oldCod=idx!==""?mats[idx].codigo:null;$("btnGuardar").disabled=true;
  let registrandoUbicacion=true,ubicacionCreada=false,ubicacionCorregida=false;
  try{
    const destino=await resolverUbicacionRegistro(m.ubicacion,tipoRegistro,anterior?.ubicacionCodigo);
    registrandoUbicacion=false;
    if(destino){m.ubicacion=destino.ubicacion.nombre;m.ubicacionCodigo=destino.ubicacion.codigo;m.ubicacionAlmacenCodigo=destino.ubicacion.almacen_codigo;m.ubicacionAlmacenNombre=destino.almacen.nombre;ubicacionCreada=destino.creada;ubicacionCorregida=!!destino.corregida}
    if(idx!==""){
      const{error}=await sb.from("materiales").update({codigo:m.codigo,data:matData(m)}).eq("codigo",oldCod);if(error)throw error;
    }else{const{error}=await sb.from("materiales").insert({codigo:m.codigo,data:matData(m)});if(error)throw error}
  }catch(err){errDB(err,registrandoUbicacion?"No se pudo registrar la ubicación":ubicacionCreada?"No se pudo guardar el material; la ubicación quedó registrada":ubicacionCorregida?"No se pudo guardar el material; el código de ubicación y sus materiales anteriores ya se corrigieron":"No se pudo guardar");$("btnGuardar").disabled=false;await cargar().catch(()=>{});return}
  $("btnGuardar").disabled=false;await cargar().catch(()=>{});
  toast(`${idx!==""?"Material actualizado":"Material guardado"}${ubicacionCreada?" · ubicación agregada a Ubicaciones y QR":ubicacionCorregida?" · código de ubicación corregido a "+m.ubicacionCodigo:""} ✔`);
  const m2=mats.find(x=>x.codigo===m.codigo)||m;resetForm();render();try{mostrar(m2)}catch(err){console.error(err);toast("Guardado, pero falló el QR",1)}
});
$("btnCancelar").onclick=()=>{resetForm();toast("Edición cancelada")};

