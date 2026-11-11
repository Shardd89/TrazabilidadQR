// --- Registro múltiple: lista temporal de hasta 50 materiales ---
function actualizarModoRegistroUI(){
  const multi=modoRegistro==="multiple";
  document.querySelectorAll(".reg-modo-btn").forEach(b=>{
    const activo=b.dataset.modo===modoRegistro;
    b.setAttribute("aria-pressed",String(activo));
    b.classList.toggle("activo",activo);
  });
  $("regMultipleBox").hidden=!multi;
  $("regModoHint").textContent=multi?`Captura cada material y agrégalo a la lista (máximo ${MAX_REGISTRO_MULTIPLE} filas). Al final guarda todo el lote de una vez.`:"Captura un material a la vez; al guardar se genera su QR.";
  $("btnGuardar").textContent=multi?`➕ Agregar a la lista (${regMulti.length}/${MAX_REGISTRO_MULTIPLE})`:"💾 Guardar y generar QR";
  $("btnCancelar").hidden=multi||$("editIndex").value==="";
  $("tituloForm").textContent=multi?"Registro múltiple de materiales":"Registro de material";
}
function establecerModoRegistro(modo){
  modo=modo==="multiple"?"multiple":"unico";
  if(modo===modoRegistro){actualizarModoRegistroUI();return}
  if(modo==="unico"&&regMulti.length&&!confirm(`Hay ${regMulti.length} material(es) en la lista sin guardar. ¿Descartarlos?`))return;
  modoRegistro=modo;
  if(modo==="unico"){regMulti=[];renderRegMulti()}
  resetForm();
  actualizarModoRegistroUI();
}
function renderRegMulti(){
  $("regMultiBody").innerHTML=regMulti.map((m,i)=>`<tr>
    <td>${i+1}</td>
    <td><b>${esc(m.codigo)}</b></td>
    <td>${esc(m.descripcion)}</td>
    <td>${esc(nombreTipoRegistro(m.tipoRegistro))}</td>
    <td>${esc(m.ubicacion)}</td>
    <td class="num">${esc(m.cantidad)} ${esc(m.um||"PZ")}</td>
    <td class="l">${esc(trazabilidadEntrada(m)||"—")}</td>
    <td>${esc(m.fechaRecibo)}</td>
    <td><button type="button" class="reg-multi-del" data-quitar="${i}" title="Quitar fila" aria-label="Quitar ${esc(m.codigo)}">✕</button></td>
  </tr>`).join("");
  $("regMultiVacio").hidden=regMulti.length>0;
  $("regMultiCount").textContent=`${regMulti.length} / ${MAX_REGISTRO_MULTIPLE}`;
  $("btnGuardarLista").disabled=!regMulti.length;
  $("btnGuardarLista").textContent=regMulti.length?`💾 Guardar ${regMulti.length} material(es)`:"💾 Guardar los materiales";
  if(modoRegistro==="multiple")$("btnGuardar").textContent=`➕ Agregar a la lista (${regMulti.length}/${MAX_REGISTRO_MULTIPLE})`;
}
function limpiarCamposFilaMultiple(){
  ["codigo","descripcion","cantidad"].forEach(id=>$(id).value="");
  if(!document.querySelector('input[data-na="peso"]').checked)$("peso").value="";
  $("totalMM").value="";
  $("codigo").focus();
}
function agregarFilaMultiple(){
  if(regMulti.length>=MAX_REGISTRO_MULTIPLE){toast(`Máximo ${MAX_REGISTRO_MULTIPLE} filas por lote. Guarda la lista antes de agregar más.`,1);return}
  const {m}=materialDesdeFormulario();
  if(!m.codigo){toast("El código es obligatorio.",1);return}
  if(!(Number(m.cantidad)>0)){toast("La cantidad debe ser mayor que cero.",1);return}
  regMulti.push(m);
  renderRegMulti();
  limpiarCamposFilaMultiple();
  toast(`Fila ${regMulti.length} agregada a la lista ✔`);
}
$("regMultiBody").addEventListener("click",e=>{
  const b=e.target.closest("[data-quitar]");if(!b)return;
  const i=Number(b.dataset.quitar);
  if(!Number.isInteger(i)||i<0||i>=regMulti.length)return;
  regMulti.splice(i,1);renderRegMulti();
});
$("btnLimpiarLista").onclick=()=>{
  if(!regMulti.length)return;
  if(!confirm(`¿Quitar las ${regMulti.length} fila(s) de la lista?`))return;
  regMulti=[];renderRegMulti();toast("Lista vacía");
};
$("btnGuardarLista").onclick=async()=>{
  if(!esAdmin){toast("Solo el administrador puede registrar materiales.",1);return}
  if(!regMulti.length){toast("Agrega al menos una fila a la lista.",1);return}
  for(const m of regMulti){
    if(!m.codigo){toast("Todas las filas deben tener código.",1);return}
    if(!(Number(m.cantidad)>0)){toast(`La cantidad de ${m.codigo} debe ser mayor que cero.`,1);return}
  }
  const btn=$("btnGuardarLista");btn.disabled=true;
  let ubicacionCreada=false,ubicacionCorregida=false,resolviendoUbicacion=true;
  const cache=new Map();
  try{
    for(const m of regMulti){
      const clave=`${m.tipoRegistro}|${String(m.ubicacion).trim().toLowerCase()}`;
      let destino=cache.get(clave);
      if(destino===undefined){
        resolviendoUbicacion=true;
        destino=await resolverUbicacionRegistro(m.ubicacion,m.tipoRegistro,null);
        cache.set(clave,destino);
      }
      resolviendoUbicacion=false;
      if(destino){
        m.ubicacion=destino.ubicacion.nombre;m.ubicacionCodigo=destino.ubicacion.codigo;
        m.ubicacionAlmacenCodigo=destino.ubicacion.almacen_codigo;m.ubicacionAlmacenNombre=destino.almacen.nombre;
        if(destino.creada)ubicacionCreada=true;
        if(destino.corregida)ubicacionCorregida=true;
      }
    }
    const items=regMulti.map(m=>({codigo:m.codigo,material:matData(m),entrada:entradaDesdeMaterial(m)}));
    await registrarEntradas(items);
  }catch(err){
    errDB(err,resolviendoUbicacion?"No se pudo registrar una de las ubicaciones":ubicacionCreada?"No se pudieron guardar todos los materiales; algunas ubicaciones quedaron registradas":"No se pudieron guardar los materiales");
    await cargar().catch(()=>{});
    renderRegMulti();
    return;
  }
  const total=regMulti.length;
  regMulti=[];
  renderRegMulti();
  await cargar().catch(()=>{});
  limpiarCamposFilaMultiple();
  render();
  toast(`${total} entrada(s) registradas${ubicacionCreada?" · ubicación agregada a Ubicaciones y QR":""}${ubicacionCorregida?" · código de ubicación corregido":""} ✔`);
};
document.querySelectorAll(".reg-modo-btn").forEach(b=>b.addEventListener("click",()=>establecerModoRegistro(b.dataset.modo)));
renderRegMulti();

