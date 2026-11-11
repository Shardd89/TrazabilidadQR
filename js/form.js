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
$("btnAuto").onclick=()=>{let n=0;const usados=[...mats,...regMulti].map(m=>String(m.codigo||"").toLowerCase());usados.forEach(cod=>{const x=/^MAT-(\d+)$/i.exec(cod);if(x)n=Math.max(n,+x[1])});let codigo;do{n++;codigo="MAT-"+String(n).padStart(4,"0")}while(usados.includes(codigo.toLowerCase()));$("codigo").value=codigo};

function establecerFormularioAbierto(abierto){$("f").hidden=!abierto;$("tituloForm").setAttribute("aria-expanded",String(abierto))}
$("tituloForm").addEventListener("click",()=>establecerFormularioAbierto($("f").hidden));
$("tituloForm").addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();establecerFormularioAbierto($("f").hidden)}});
function resetForm(){$("f").reset();document.querySelectorAll("[data-na]").forEach(c=>{c.checked=false;$(c.dataset.na).closest(".na-field").querySelector(".na-value-wrap")?.removeAttribute("hidden");$(c.dataset.na).hidden=false});CAMPOS_EXTRA.forEach(([,id])=>$(id).hidden=false);actualizarCamposSeccion();$("editIndex").value="";editandoEntradaId=null;$("codigo").readOnly=false;$("descripcion").readOnly=false;$("tipoRegistro").disabled=false;$("fechaRecibo").value=hoy();$("cantidad").readOnly=false;$("cantidad").title="";$("tituloForm").textContent=modoRegistro==="multiple"?"Registro múltiple de materiales":"Registro de material";$("btnGuardar").textContent=modoRegistro==="multiple"?"➕ Agregar a la lista":"💾 Guardar y generar QR";$("btnCancelar").hidden=true;$("detTraza").open=false;establecerFormularioAbierto(modoRegistro==="multiple")}

function materialDesdeFormulario(){
  recalcularTotalMM();
  const idx=$("editIndex").value;
  const noAplica=Object.fromEntries(CAMPOS_EXTRA.map(([key,id])=>[key,document.querySelector(`input[data-na="${id}"]`).checked]));
  noAplica.seccionMaterial=document.querySelector('input[data-na="seccionMaterial"]').checked;
  const extra=Object.fromEntries(CAMPOS_EXTRA.map(([key,id])=>[key,noAplica[key]?(["totalMM","longitudIndividual","peso"].includes(key)?null:""): (["totalMM","longitudIndividual","peso"].includes(key)?($(id).value===""?null:Number($(id).value)):$(id).value.trim())]));
  const tipoRegistro=$("tipoRegistro").value;
  const anterior=idx!==""?mats[idx]:null;
  const entradaAnterior=editandoEntradaId!=null?(anterior?.entradas||[]).find(e=>Number(e.id)===Number(editandoEntradaId)):null;
  const baseAnterior=entradaAnterior||anterior;
  const m={codigo:$("codigo").value.trim(),descripcion:$("descripcion").value.trim(),lote:extra.numeroLoteMP||"",proveedor:$("proveedor").value.trim(),
    um:$("um").value,cantidad:parseFloat($("cantidad").value),ubicacion:$("ubicacion").value.trim(),fechaRecibo:$("fechaRecibo").value,
    fechaModificacion:new Date().toLocaleString("es-MX"),tipoRegistro,esMP:tipoRegistro==="MP",seccionMaterial:noAplica.seccionMaterial?"":$("seccionMaterial").value,
    ubicacionCodigo:baseAnterior&&$("ubicacion").value.trim()===baseAnterior.ubicacion?baseAnterior.ubicacionCodigo||null:null,
    ubicacionAlmacenCodigo:baseAnterior&&$("ubicacion").value.trim()===baseAnterior.ubicacion?baseAnterior.ubicacionAlmacenCodigo||null:null,
    ubicacionAlmacenNombre:baseAnterior&&$("ubicacion").value.trim()===baseAnterior.ubicacion?baseAnterior.ubicacionAlmacenNombre||null:null,
    peso:extra.peso,pesoU:extra.peso==null?null:$("pesoU").value,pesoUnidadPendiente:extra.peso!=null&&!$("pesoU").value,
    longitud:baseAnterior?.longitud??null,longU:baseAnterior?.longU||baseAnterior?.longitudUnidad||null,
    seccion:tipoRegistro==="MP"?({SQ:"cuadrado",FLAT:"cuadrado",RND:"redondo"}[$("seccionMaterial").value]||null):null,
    secU:tipoRegistro==="MP"?"mm":null,
    diametro:tipoRegistro==="MP"&&$("seccionMaterial").value==="RND"?numeroCampo("diametroMaterial"):null,
    alto:tipoRegistro==="MP"&&["SQ","FLAT"].includes($("seccionMaterial").value)?numeroCampo("altoMaterial"):null,
    ancho:tipoRegistro==="MP"&&["SQ","FLAT"].includes($("seccionMaterial").value)?numeroCampo("anchoMaterial"):null,
    ...extra,noAplica};
  m.despachos=anterior?(anterior.despachos||[]):[];
  return {m,idx,anterior};
}
$("f").addEventListener("invalid",()=>{$("detTraza").open=true},true);
$("f").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!esAdmin){toast("Solo el administrador puede registrar o editar materiales.",1);return}
  if(modoRegistro==="multiple"){agregarFilaMultiple();return}
  const {m,idx,anterior}=materialDesdeFormulario();
  if(!m.codigo){toast("El código es obligatorio.",1);return}
  if(!(Number(m.cantidad)>0)){toast("La cantidad debe ser mayor que cero.",1);return}
  const oldCod=idx!==""?mats[idx].codigo:null,entradaIdEditada=editandoEntradaId;$("btnGuardar").disabled=true;
  let registrandoUbicacion=true,ubicacionCreada=false,ubicacionCorregida=false,entradaId=null;
  try{
    const entradaAnterior=entradaIdEditada!=null?(anterior?.entradas||[]).find(e=>Number(e.id)===Number(entradaIdEditada)):null;
    const destino=await resolverUbicacionRegistro(m.ubicacion,m.tipoRegistro,entradaAnterior?.ubicacionCodigo||anterior?.ubicacionCodigo);
    registrandoUbicacion=false;
    if(destino){m.ubicacion=destino.ubicacion.nombre;m.ubicacionCodigo=destino.ubicacion.codigo;m.ubicacionAlmacenCodigo=destino.ubicacion.almacen_codigo;m.ubicacionAlmacenNombre=destino.almacen.nombre;ubicacionCreada=destino.creada;ubicacionCorregida=!!destino.corregida}
    if(entradaIdEditada!=null){
      const{error}=await sb.from("entradas_material").update({
        cantidad:m.cantidad,
        longitud_individual:m.longitudIndividual,
        longitud:m.longitud,
        longitud_unidad:m.longU||m.longitudUnidad||null,
        peso:m.peso,
        peso_unidad:m.pesoU||m.pesoUnidad||null,
        ubicacion_codigo:m.ubicacionCodigo,
        ubicacion_nombre:m.ubicacion,
        almacen_codigo:m.ubicacionAlmacenCodigo,
        fecha_recibo:m.fechaRecibo||null,
        data:matData(m)
      }).eq("id",entradaIdEditada).eq("codigo_material",oldCod);
      if(error)throw error;
      entradaId=entradaIdEditada;
    }else if(idx!==""){
      // Edición de datos base: la cantidad no se toca cuando el material ya
      // tiene entradas; se controla con recepciones y conteos.
      if(anterior?.entradas?.length)m.cantidad=anterior.cantidad;
      const{error}=await sb.from("materiales").update({codigo:m.codigo,data:matData(m)}).eq("codigo",oldCod);if(error)throw error;
    }else{
      const r=await registrarEntradas([{codigo:m.codigo,material:matData(m),entrada:entradaDesdeMaterial(m)}]);
      entradaId=r?.entradas?.[0]?.id??null;
    }
  }catch(err){errDB(err,registrandoUbicacion?"No se pudo registrar la ubicación":ubicacionCreada?"No se pudo guardar el material; la ubicación quedó registrada":ubicacionCorregida?"No se pudo guardar el material; el código de ubicación y sus materiales anteriores ya se corrigieron":"No se pudo guardar");$("btnGuardar").disabled=false;await cargar().catch(()=>{});return}
  $("btnGuardar").disabled=false;await cargar().catch(()=>{});
  const m2=mats.find(x=>x.codigo===m.codigo)||m;
  const entrada=entradaId?m2.entradas?.find(x=>Number(x.id)===Number(entradaId)):null;
  toast(`${entradaIdEditada!=null?"Entrada actualizada":idx!==""?"Material actualizado":entrada?"Entrada agregada":"Material guardado"}${idx===""?` · Existencia total: ${existTxt(m2)}`:""}${ubicacionCreada?" · ubicación agregada a Ubicaciones y QR":ubicacionCorregida?" · código de ubicación corregido a "+m.ubicacionCodigo:""} ✔`);
  resetForm();render();try{mostrar(m2,entrada?entrada.id:null)}catch(err){console.error(err);toast("Guardado, pero falló el QR",1)}
});
$("btnCancelar").onclick=()=>{resetForm();toast("Edición cancelada")};

