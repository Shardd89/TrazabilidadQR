// --- Tabla ---
function render(){
  const codigos=new Set(mats.map(m=>m.codigo));seleccionados.forEach(c=>{if(!codigos.has(c))seleccionados.delete(c)});
  const q=$("buscar").value.toLowerCase().trim(),t=$("ftipo").value;
  let lista=mats.map((m,i)=>({m,i})).filter(({m})=>(!t||(t==="mp"?m.esMP:t==="consumibles"?m.tipoRegistro==="CONSUMIBLES":m.tipoRegistro==="GENERAL"))&&(!q||[m.codigo,m.descripcion,m.lote,m.proveedor,m.ubicacion,m.tipoMaterial,m.especificacionMedida,m.longitudIndividual,m.manufactura,m.numeroHeat,m.numeroLoteMP,m.numeroCertificado,m.totalMM,m.tipoMoneda,m.ordenMaterial,m.poNumber].join(" ").toLowerCase().includes(q))&&(!filtroEspecial||FILTROS[filtroEspecial].test(m)));
  if(orden.k)lista.sort((a,b)=>{const x=a.m[orden.k],y=b.m[orden.k];const r=typeof x==="number"?x-y:String(x??"").localeCompare(String(y??""),"es",{numeric:true});return orden.asc?r:-r});
  $("tbody").innerHTML=lista.map(({m,i})=>`<tr>
    <td><input type="checkbox" class="row-select" data-select="${esc(m.codigo)}" aria-label="Seleccionar ${esc(m.codigo)}" ${seleccionados.has(m.codigo)?"checked":""}></td>
    <td><b>${esc(m.codigo)}</b></td><td class="l">${esc(m.descripcion)}</td><td>${esc(m.cantidad)} PZ · ${esc(existTxt(m))}</td>
    <td>${tagTipo(m)}</td>
    <td>${esc(m.ubicacion||"Sin ubicación")}</td><td>${esc(m.fechaRecibo)}</td>
    <td style="white-space:nowrap"><button type="button" class="ic" data-a="qr" data-i="${i}" title="Ver QR">🔳</button>${esAdmin?`<button type="button" class="ic" data-a="ed" data-i="${i}" title="Editar">✏️</button><button type="button" class="ic" data-a="del" data-i="${i}" title="Eliminar">🗑️</button>`:""}</td></tr>`).join("");
  $("vacio").hidden=lista.length>0;
  const mp=mats.filter(m=>m.esMP).length,consumibles=mats.filter(m=>m.tipoRegistro==="CONSUMIBLES").length;
  $("sTot").textContent=`${mats.length} registros`;$("sMp").textContent=`${mp} materia prima`;$("sConsumibles").textContent=`${consumibles} consumibles`;$("sGen").textContent=`${mats.length-mp-consumibles} generales`;
  syncBulkActions();
}
function renderInventario(){
  const selector=$("invAlmacen"),almacenActual=selector.value;
  selector.innerHTML='<option value="">Todos los almacenes</option>'+almacenes.map(a=>`<option value="${esc(a.codigo)}">${esc(a.nombre)}</option>`).join("");
  selector.value=almacenes.some(a=>a.codigo===almacenActual)?almacenActual:"";
  const q=$("invBuscar").value.trim().toLocaleLowerCase(),tipo=$("invTipo").value,almacenFiltro=selector.value;
  const ubiLoc=ubiFiltroCodigo?ubicacionesPorCodigo.get(ubiFiltroCodigo):null;
  const permitidos=ubiLoc?new Set(listaMaterialesEnUbicacion(ubiLoc).map(m=>m.codigo)):null;
  const lista=mats.filter(m=>{const loc=ubicacionDe(m),almacenCodigo=loc?.almacen_codigo||m.ubicacionAlmacenCodigo,alm=almacenDe(m);return(!permitidos||permitidos.has(m.codigo))&&(!tipo||(tipo==="mp"?m.esMP:tipo==="consumibles"?m.tipoRegistro==="CONSUMIBLES":m.tipoRegistro==="GENERAL"))&&(!almacenFiltro||almacenCodigo===almacenFiltro)&&(!q||[m.codigo,m.descripcion,m.ubicacion,m.ubicacionCodigo,loc?.nombre,alm?.nombre,m.lote,m.numeroHeat,m.numeroLoteMP].join(" ").toLocaleLowerCase().includes(q))});
  $("invBody").innerHTML=lista.map(m=>{const loc=ubicacionDe(m),alm=almacenDe(m),tag=tagTipo(m);return`<tr><td><b>${esc(m.codigo)}</b><br><small>${tag}</small></td><td class="l">${esc(m.descripcion)}</td><td>${esc(existTxt(m))}</td><td class="l">${esc(alm?.nombre||m.ubicacionAlmacenNombre||"Sin almacén")} › ${esc(loc?ubicacionConCodigo(loc):m.ubicacion||"Sin ubicación")}</td></tr>`}).join("");
  $("invVacio").hidden=lista.length>0;
  actualizarEstadoConteoCiclico();
}
function actualizarEstadoConteoCiclico(){
  const estado=$("conteoEstado");
  estado.hidden=!ajustesInventarioError;
  estado.textContent=ajustesInventarioError;
}
$("invBuscar").oninput=debounce(renderInventario,250);$("invTipo").onchange=$("invAlmacen").onchange=renderInventario;
let ubiConsultaCodigo=null,ubiFiltroCodigo=null,conteoTrasladadoPendiente=false;
function limpiarConsultaUbicacion(){
  ubiConsultaCodigo=null;
  ubiFiltroCodigo=null;
  $("ubiConsultaBox").hidden=true;
  $("bUbiConsultaLimpiar").hidden=true;
  $("bConteoLote").hidden=true;
  $("ubiConsultaInfo").textContent="-";
  $("ubiConsultaCnt").textContent="0 materiales";
  $("ubiConsultaBody").innerHTML="";
  $("ubiConsultaVacio").hidden=true;
  $("ubiConsultaBuscar").value="";
  $("ubiConsultaBusqueda").hidden=true;
  $("ubiConsultaResultados").innerHTML="";
  renderInventario();
}
function ubicacionPorCodigo(codigo){
  const clave=String(codigo||"").trim().toLocaleLowerCase();
  const canonica=normalizarCodigoUbicacion(codigo).toLocaleLowerCase();
  const directa=ubicaciones.find(loc=>loc.codigo.toLocaleLowerCase()===clave);
  if(directa)return directa;
  const alias=ubicacionesAlias.find(item=>item.codigo_alias.toLocaleLowerCase()===clave);
  const destinoAlias=alias&&ubicacionesPorCodigo.get(alias.ubicacion_codigo);
  if(destinoAlias)return destinoAlias;
  const directaCanonica=ubicaciones.find(loc=>normalizarCodigoUbicacion(loc.codigo).toLocaleLowerCase()===canonica);
  if(directaCanonica)return directaCanonica;
  const aliasCanonico=ubicacionesAlias.find(item=>normalizarCodigoUbicacion(item.codigo_alias).toLocaleLowerCase()===canonica);
  const destinoCanonico=aliasCanonico&&ubicacionesPorCodigo.get(aliasCanonico.ubicacion_codigo);
  if(destinoCanonico)return destinoCanonico;
  return ubicaciones.find(loc=>String(loc.nombre||"").trim().toLocaleLowerCase()===clave)||null;
}
function mostrarMaterialesPorUbicacion(codigo){
  const loc=ubicacionPorCodigo(codigo);
  if(!loc){toast(ubicacionesError||ubicacionesAliasError||`Ubicación no registrada: ${codigo}`,1);return}
  const almacen=almacenesPorCodigo.get(loc.almacen_codigo);
  const lista=listaMaterialesEnUbicacion(loc);
  ubiConsultaCodigo=loc.codigo;
  ubiFiltroCodigo=loc.codigo;
  $("ubiConsultaInfo").innerHTML=`${esc(almacen?.nombre||"Sin almacén")} · <b>${esc(ubicacionConCodigo(loc))}</b>`;
  $("ubiConsultaCnt").textContent=`${lista.length} material${lista.length===1?"":"es"}`;
  actualizarEstadoConteoCiclico();
  $("ubiConsultaBusqueda").hidden=!esAdmin;
  $("bConteoLote").hidden=!esAdmin||!lista.length;
  $("ubiConsultaBuscar").value="";
  $("ubiConsultaResultados").innerHTML='<p class="ubicaciones-ayuda">Busca en el catálogo del módulo Registro. Para ajustar existencias, el material debe estar asignado a esta ubicación.</p>';
  $("ubiConsultaBody").innerHTML=lista.map(m=>{const almM=almacenesPorCodigo.get(ubicacionDe(m)?.almacen_codigo||m.ubicacionAlmacenCodigo);return`<tr><td><b>${esc(m.codigo)}</b></td><td class="l">${esc(m.descripcion||"")}</td><td>${tagTipo(m)}</td><td>${esc(existTxt(m))}</td><td>${esc(almM?.nombre||m.ubicacionAlmacenNombre||almacen?.nombre||"Sin almacén")}</td><td>${esAdmin?`<button type="button" class="bs" data-conteo="${esc(m.codigo)}" ${ajustesInventarioError?"disabled title=\"No se pudo cargar el historial de conteos\"":""}>📋 Conteo cíclico</button>`:"—"}</td></tr>`}).join("");
  $("ubiConsultaBody").querySelectorAll("[data-conteo]").forEach(btn=>btn.onclick=()=>abrirConteoCiclico(btn.dataset.conteo,loc));
  $("ubiConsultaVacio").hidden=lista.length>0;
  $("ubiConsultaBox").hidden=false;
  $("bUbiConsultaLimpiar").hidden=false;
  document.querySelector('.tab[data-v="vInv"]').click();
  const tab=document.querySelector('.section-tab[data-module="vInv"][data-page="existencias"]');if(tab)tab.click();
  $("ubiConsultaBox").scrollIntoView({behavior:"smooth",block:"nearest"});
  renderInventario();
}
$("bCamUbiConsulta").onclick=()=>{modoEscaneo="ubiConsulta";camOn()};
$("bCamListo").onclick=()=>{camOff();const tab=document.querySelector('.section-tab[data-module="vSur"][data-page="preparar"]');if(tab)tab.click();const list=$("sPanel");if(list)list.scrollIntoView({behavior:"smooth",block:"start"})};
$("bUbiConsultaLimpiar").onclick=()=>{limpiarConsultaUbicacion()};
function buscarMaterialesParaConteo(){
  const resultados=$("ubiConsultaResultados"),consulta=$("ubiConsultaBuscar").value.trim().toLocaleLowerCase();
  if(!consulta){
    resultados.innerHTML='<p class="ubicaciones-ayuda">Busca en el catálogo del módulo Registro por código o descripción.</p>';
    return;
  }
  const coincidencias=mats.filter(material=>[material.codigo,material.descripcion].some(valor=>String(valor||"").toLocaleLowerCase().includes(consulta)));
  if(!coincidencias.length){
    resultados.innerHTML='<p class="ubicaciones-ayuda">No se encontró ningún material registrado con ese código o descripción.</p>';
    return;
  }
  const ubicacion=ubicacionesPorCodigo.get(ubiConsultaCodigo);
  if(!ubicacion){resultados.innerHTML='<p class="ubicaciones-ayuda">Escanea de nuevo una ubicación para consultar los materiales.</p>';return}
  const visibles=coincidencias.slice(0,20);
  resultados.innerHTML=visibles.map(material=>{
    const enUbicacion=listaMaterialesEnUbicacion(ubicacion).some(item=>item.codigo===material.codigo);
    const ubicacionActual=ubicacionDe(material)
      ||ubicaciones.find(loc=>!material.ubicacionCodigo&&String(material.ubicacion||"").trim().toLocaleLowerCase()===loc.nombre.toLocaleLowerCase()&&(!material.ubicacionAlmacenCodigo||material.ubicacionAlmacenCodigo===loc.almacen_codigo));
    const ubicacionTexto=ubicacionActual?ubicacionConCodigo(ubicacionActual):material.ubicacion||"Sin ubicación";
    const accion=enUbicacion?"📋 Conteo cíclico":ubicacionActual||material.ubicacion?"Mover y contar":"Agregar y contar";
    return`<div class="ubicacion-material"><span><b>${esc(material.codigo)}</b><span>${esc(material.descripcion||"Sin descripción")} · ${esc(existTxt(material))}<br><small>${enUbicacion?"Asignado a esta ubicación":`Ubicación actual: ${esc(ubicacionTexto)}`}</small></span></span><button type="button" class="bs" data-conteo-busqueda="${esc(material.codigo)}" ${ajustesInventarioError?"disabled title=\"No se pudo cargar el historial de conteos\"":""}>${accion}</button></div>`;
  }).join("")+(coincidencias.length>visibles.length?`<p class="ubicaciones-ayuda">Se muestran los primeros ${visibles.length} resultados de ${coincidencias.length}. Afina la búsqueda para encontrar el material.</p>`:"");
  resultados.querySelectorAll("[data-conteo-busqueda]").forEach(btn=>btn.onclick=()=>agregarMoverMaterialParaConteo(btn.dataset.conteoBusqueda,ubicacion,btn));
}
$("ubiConsultaBuscar").addEventListener("input",debounce(buscarMaterialesParaConteo,250));
async function agregarMoverMaterialParaConteo(codigo,ubicacion,boton){
  if(!esAdmin){toast("Solo el administrador puede agregar materiales o ajustar existencias.",1);return}
  if(ajustesInventarioError){toast(ajustesInventarioError,1);return}
  const material=mats.find(item=>item.codigo===codigo);
  if(!material){toast("No se encontró el material. Actualiza el inventario e inténtalo de nuevo.",1);return}
  if(listaMaterialesEnUbicacion(ubicacion).some(item=>item.codigo===codigo)){
    abrirConteoCiclico(codigo,ubicacion);
    return;
  }
  const anterior=ubicacionDe(material)
    ||ubicaciones.find(loc=>!material.ubicacionCodigo&&String(material.ubicacion||"").trim().toLocaleLowerCase()===loc.nombre.toLocaleLowerCase()&&(!material.ubicacionAlmacenCodigo||material.ubicacionAlmacenCodigo===loc.almacen_codigo));
  const anteriorTexto=anterior?ubicacionConCodigo(anterior):material.ubicacion||"Sin ubicación";
  const accion=anterior?"mover":"agregar";
  if(!confirm(`¿${anterior?"Mover":"Agregar"} ${material.codigo} a ${ubicacionConCodigo(ubicacion)} y después hacer el conteo manual?\n\nUbicación actual: ${anteriorTexto}\nExistencia disponible actual: ${existTxt(material)}\n\n${anterior?"Se registrará el traspaso en el historial.":"El material quedará asignado a esta ubicación."}`))return;
  const actual=existencia(material);
  const folio=`CONTEO-${Date.now()}`;
  const payload=[{codigo:material.codigo,existencia:{modo:actual.modo,cantidad:actual.modo==="pz"?actual.rest:actual.qty,longitud:actual.modo==="long"?actual.rest:null,unidad:actual.u,peso:actual.peso?.peso??null,pesoUnidad:actual.peso?.u??null}}];
  boton.disabled=true;
  try{
    const{data,error}=await sb.rpc("asignar_inventario_ubicacion",{p_ubicacion_codigo:ubicacion.codigo,p_folio:folio,p_items:payload});
    if(error)throw error;
    if(Number(data)!==1)throw new Error(`Respuesta incompleta del servidor (${data??"sin cantidad"})`);
  }catch(err){
    errDB(err,`No se pudo ${accion} el material a la ubicación`);
    boton.disabled=false;
    return;
  }
  try{
    await Promise.all([cargar(),cargarUbicaciones()]);
  }catch(err){
    errDB(err,`${material.codigo} ya se agregó a ${ubicacionConCodigo(ubicacion)}, pero no se pudo actualizar la vista`);
    return;
  }
  const consulta=$("ubiConsultaBuscar").value;
  mostrarMaterialesPorUbicacion(ubicacion.codigo);
  $("ubiConsultaBuscar").value=consulta;
  buscarMaterialesParaConteo();
  if(abrirConteoCiclico(material.codigo,ubicacion))conteoTrasladadoPendiente=true;
}
async function rpcConteo(codigo,ubicacion,anterior,contada,unidad,motivo,base){
  const args={p_codigo_material:codigo,p_ubicacion_codigo:ubicacion,p_existencia_anterior:anterior,p_existencia_contada:contada,p_unidad:unidad,p_motivo:motivo};
  let resultado=await sb.rpc("registrar_conteo_ciclico",args);
  if(resultado.error&&unidad==="PZ"&&base&&/UNIDAD_DE_CONTEO_INVALIDA/.test(String(resultado.error.message||""))){
    // Servidor anterior al conteo en piezas: reintenta en la unidad base.
    resultado=await sb.rpc("registrar_conteo_ciclico",{...args,p_existencia_anterior:base.rest,p_existencia_contada:r4(contada*base.L),p_unidad:base.u});
  }
  return resultado;
}
function abrirConteoCiclico(codigo,loc){
  if(!esAdmin){toast("Solo el administrador puede ajustar existencias.",1);return false}
  if(ajustesInventarioError){toast(ajustesInventarioError,1);return false}
  const material=mats.find(m=>m.codigo===codigo);
  if(!material||!listaMaterialesEnUbicacion(loc).some(m=>m.codigo===codigo)){toast("El material ya no está asignado a esta ubicación. Actualiza la consulta.",1);return false}
  const e=existencia(material);
  const capturaPz=e.modo==="long";
  const anterior=capturaPz?e.qty:e.rest;
  const unidad=capturaPz?"PZ":e.u;
  $("conteoCodigo").value=material.codigo;
  $("conteoUbicacion").value=loc.codigo;
  $("conteoAnterior").value=String(anterior);
  $("conteoMaterial").textContent=`${material.codigo} · ${material.descripcion||""} · ${ubicacionConCodigo(loc)}`;
  $("conteoActual").textContent=existTxt(material);
  $("conteoUnidad").textContent=unidad;
  $("conteoCantidad").value=String(Math.max(0,anterior));
  $("conteoMotivo").value="";
  conteoTrasladadoPendiente=false;
  $("conteoDialog").showModal();
  $("conteoCantidad").focus();
  return true;
}
$("conteoCancelar").onclick=()=>$("conteoDialog").close();
$("conteoForm").addEventListener("submit",async event=>{
  event.preventDefault();
  if(!esAdmin){toast("Solo el administrador puede ajustar existencias.",1);$("conteoDialog").close();return}
  const codigo=$("conteoCodigo").value,ubicacionCodigo=$("conteoUbicacion").value,anterior=Number($("conteoAnterior").value),contada=r4(Number($("conteoCantidad").value));
  const material=mats.find(m=>m.codigo===codigo),ubicacion=ubicacionesPorCodigo.get(ubicacionCodigo);
  if(!material||!ubicacion||!listaMaterialesEnUbicacion(ubicacion).some(m=>m.codigo===codigo)){toast("El material cambió de ubicación. Escanea la ubicación de nuevo.",1);$("conteoDialog").close();return}
  if(!Number.isFinite(contada)||contada<0){toast("Ingresa una existencia contada válida.",1);return}
  const actualCalculado=existencia(material);
  const capturaPz=actualCalculado.modo==="long";
  const actual=capturaPz?actualCalculado.qty:actualCalculado.rest;
  const unidad=capturaPz?"PZ":actualCalculado.u;
  if(Math.abs(actual-anterior)>0.0001){toast("La existencia cambió mientras realizabas el conteo. Vuelve a abrir el ajuste.",1);$("conteoDialog").close();return}
  $("conteoGuardar").disabled=true;
  try{
    const{error}=await rpcConteo(codigo,ubicacionCodigo,anterior,contada,unidad,$("conteoMotivo").value.trim(),capturaPz?actualCalculado:null);
    if(error)throw error;
    $("conteoDialog").close();
    conteoTrasladadoPendiente=false;
    try{await cargar()}catch(err){errDB(err,"Conteo guardado, pero no se pudo actualizar el inventario");return}
    renderHistUbicaciones();
    if(ubiConsultaCodigo)mostrarMaterialesPorUbicacion(ubiConsultaCodigo);
    toast(`Conteo guardado para ${codigo}. Ajuste: ${fmt(contada-anterior)} ${unidad}`);
  }catch(err){errDB(err,conteoTrasladadoPendiente?"El material ya se agregó a la ubicación, pero no se pudo guardar el conteo cíclico":"No se pudo guardar el conteo cíclico")}
  finally{$("conteoGuardar").disabled=false}
});
let conteoLoteItems=[];
function abrirConteoLote(){
  if(!esAdmin){toast("Solo el administrador puede ajustar existencias.",1);return}
  if(ajustesInventarioError){toast(ajustesInventarioError,1);return}
  const loc=ubicacionesPorCodigo.get(ubiConsultaCodigo);
  if(!loc){toast("Escanea una ubicación para consultar sus materiales.",1);return}
  const lista=listaMaterialesEnUbicacion(loc);
  conteoLoteItems=[];
  const tbody=$("conteoLoteBody");tbody.innerHTML="";
  for(const material of lista){
    const e=existencia(material);
    const capturaPz=e.modo==="long";
    const actual=capturaPz?e.qty:e.rest;
    const unidad=capturaPz?"PZ":e.u;
    const actualTxt=capturaPz?`${fmt(e.qty)} PZ`:`${fmt(e.rest)} ${e.u}`;
    const tr=document.createElement("tr");
    tr.innerHTML=`<td><b>${esc(material.codigo)}</b></td><td class="l">${esc(material.descripcion||"")}</td><td class="num" title="${esc(existTxt(material))}">${esc(actualTxt)}</td><td class="num"><input type="number" class="conteo-lote-input" min="0" step="any" inputmode="decimal" aria-label="Contado de ${esc(material.codigo)}"></td><td class="num conteo-lote-diff">—</td>`;
    tbody.appendChild(tr);
    conteoLoteItems.push({material,snapshot:r4(actual),capturaPz,unidad,input:tr.querySelector("input"),diff:tr.querySelector(".conteo-lote-diff")});
    tr.querySelector("input").addEventListener("input",function(){actualizarDifLote(this)});
  }
  $("conteoLoteUbi").textContent=ubicacionConCodigo(loc);
  $("conteoLoteDesc").textContent=`${lista.length} material${lista.length===1?"":"es"} en la ubicación · los campos vacíos no se guardan`;
  $("conteoLoteAviso").hidden=true;
  $("conteoLoteMotivo").value="";
  $("conteoLoteGuardar").disabled=!lista.length;
  $("conteoLoteDialog").dataset.ubicacion=loc.codigo;
  $("conteoLoteDialog").showModal();
}
function actualizarDifLote(input){
  const item=conteoLoteItems.find(x=>x.input===input);if(!item)return;
  const v=String(input.value).trim();
  if(v===""){item.diff.textContent="—";item.diff.classList.remove("diferente","ok");item.diff.title="";return}
  const contado=Number(v);
  if(!Number.isFinite(contado)||contado<0){item.diff.textContent="?";item.diff.title="Ingresa un número válido (≥ 0)";item.diff.classList.remove("diferente","ok");return}
  const diff=r4(contado-item.snapshot);
  item.diff.textContent=`${diff>0?"+":""}${fmt(diff)} ${item.unidad}`;
  item.diff.title=Math.abs(diff)<=0.0001?"Sin cambio":diff>0?"Hay más piezas que la existencia actual":"Hay menos piezas que la existencia actual";
  const cambio=Math.abs(diff)>0.0001;
  item.diff.classList.toggle("diferente",cambio);
  item.diff.classList.toggle("ok",!cambio);
}
async function guardarConteoLote(){
  const dlg=$("conteoLoteDialog");
  if(!esAdmin){dlg.close();toast("Solo el administrador puede ajustar existencias.",1);return}
  const locCodigo=dlg.dataset.ubicacion,motivo=$("conteoLoteMotivo").value.trim();
  const loc=ubicacionesPorCodigo.get(locCodigo);
  if(!loc){toast("Ubicación no encontrada. Escanea de nuevo.",1);return}
  const filas=conteoLoteItems.filter(x=>String(x.input.value).trim()!=="");
  if(!filas.length){toast("Escribe al menos un conteo.",1);return}
  const errores=[],aGuardar=[];
  for(const item of filas){
    const contado=Number(item.input.value);
    if(!Number.isFinite(contado)||contado<0){errores.push(`${item.material.codigo}: valor inválido`);continue}
    const fresh=mats.find(m=>m.codigo===item.material.codigo);
    if(!fresh||!listaMaterialesEnUbicacion(loc).some(m=>m.codigo===item.material.codigo)){errores.push(`${item.material.codigo}: ya no está en esta ubicación`);continue}
    const actual=existencia(fresh);
    if((item.capturaPz?"long":"pz")!==actual.modo){errores.push(`${item.material.codigo}: la forma de conteo cambió, vuelve a abrir el conteo`);continue}
    const actualValor=item.capturaPz?actual.qty:actual.rest;
    if(Math.abs(actualValor-item.snapshot)>0.0001){errores.push(`${item.material.codigo}: la existencia cambió mientras contabas`);continue}
    aGuardar.push({item,contado,unidad:item.capturaPz?"PZ":actual.u,base:item.capturaPz?actual:null});
  }
  $("conteoLoteGuardar").disabled=true;
  let guardados=0;
  for(const{item,contado,unidad,base}of aGuardar){
    try{
      const{error}=await rpcConteo(item.material.codigo,locCodigo,item.snapshot,r4(contado),unidad,motivo,base);
      if(error)throw error;
      guardados++;
    }catch(err){const msg=String(err?.message||err||"Error").replace(/\s+/g," ").slice(0,140);errores.push(`${item.material.codigo}: ${msg}`)}
  }
  $("conteoLoteGuardar").disabled=false;
  try{await cargar()}catch(err){errDB(err,"Conteo guardado, pero no se pudo actualizar el inventario")}
  renderHistUbicaciones();
  if(ubiConsultaCodigo)mostrarMaterialesPorUbicacion(ubiConsultaCodigo);
  if(errores.length){
    const aviso=$("conteoLoteAviso");
    aviso.textContent=`Guardados: ${guardados} · Errores: ${errores.length} — ${errores.slice(0,4).join(" · ")}${errores.length>4?`… y ${errores.length-4} más`:""}`;
    aviso.className="res bad";aviso.hidden=false;
    toast(`Conteo parcial: ${guardados} guardado(s) y ${errores.length} con error.`,1);
    return;
  }
  dlg.close();
  toast(`Conteo guardado (${guardados} ${guardados===1?"material":"materiales"}).`);
}
$("bConteoLote").onclick=()=>abrirConteoLote();
$("conteoLoteCancelar").onclick=()=>$("conteoLoteDialog").close();
$("conteoLoteGuardar").onclick=guardarConteoLote;
function procesarEscaneoUbiConsulta(txt){
  const raw=String(txt||"").replace(/^\uFEFF/,"").trim(),prefijo="TRAZABILIDAD-UBICACION:";
  if(raw.toUpperCase().startsWith(prefijo)){modoEscaneo="inventario";mostrarMaterialesPorUbicacion(raw.slice(prefijo.length).trim());camOff();return true}
  const loc=ubicacionPorCodigo(raw);if(loc){modoEscaneo="inventario";mostrarMaterialesPorUbicacion(loc.codigo);camOff();return true}
  toast("Escanee un QR de ubicación válido",1);return false;
}
