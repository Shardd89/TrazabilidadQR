// --- Tabla ---
function actualizarAvisoEntradas(){
  const el=$("entradasAviso");if(!el)return;
  el.hidden=!entradasError;el.textContent=entradasError||"";
}
function render(){
  actualizarAvisoEntradas();
  const claves=new Set(mats.flatMap(m=>(m.entradas?.length?m.entradas:[null]).map(entrada=>claveRegistroHistorial(m,entrada))));
  seleccionados.forEach(c=>{if(!claves.has(c))seleccionados.delete(c)});
  const q=$("buscar").value.toLowerCase().trim(),t=$("ftipo").value;
  let lista=mats.flatMap((m,i)=>(m.entradas?.length?m.entradas:[null]).map((entrada,entradaIndex)=>{
    const material=entrada?materialDeEntrada(m,entrada):m;
    return{m,i,entrada,entradaIndex,material,key:claveRegistroHistorial(m,entrada)};
  })).filter(({m,material})=>(!t||(t==="mp"?m.esMP:t==="consumibles"?m.tipoRegistro==="CONSUMIBLES":m.tipoRegistro==="GENERAL"))&&(!q||[material.codigo,material.descripcion,material.lote,material.proveedor,material.ubicacion,material.tipoMaterial,material.especificacionMedida,material.longitudIndividual,material.manufactura,material.numeroHeat,material.numeroLoteMP,material.numeroCertificado,material.totalMM,material.tipoMoneda,material.ordenMaterial,material.poNumber,material.entradaId].join(" ").toLowerCase().includes(q))&&(!filtroEspecial||FILTROS[filtroEspecial].test(m)));
  if(orden.k)lista.sort((a,b)=>{const x=a.material[orden.k],y=b.material[orden.k];const r=typeof x==="number"?x-y:String(x??"").localeCompare(String(y??""),"es",{numeric:true});return orden.asc?r:-r});
  $("tbody").innerHTML=lista.map(({m,i,entrada,entradaIndex,material,key})=>`<tr>
    <td><input type="checkbox" class="row-select" data-select="${esc(key)}" aria-label="Seleccionar ${esc(m.codigo)}${entrada?` entrada ${esc(entrada.id)}`:""}" ${seleccionados.has(key)?"checked":""}></td>
    <td><b>${esc(m.codigo)}</b>${entrada?`<br><small>Entrada #${esc(entrada.id)}</small>`:""}</td><td class="l">${esc(material.descripcion)}</td><td class="l">${esc(material.proveedor||"—")}</td><td>${esc(material.cantidad)} PZ · ${entrada?esc(existEntradaTxt(m,entrada)):esc(existTxt(m))}</td>
    <td>${material.longitudIndividual==null?"—":esc(fmt(material.longitudIndividual))}</td><td>${material.totalMM!=null?esc(fmt(material.totalMM)):material.longitudIndividual==null?"—":esc(fmt(Number(material.longitudIndividual)*Number(material.cantidad)))}</td>
    <td>${tagTipo(m)}</td>
    <td>${esc(material.ubicacion||"Sin ubicación")}</td><td>${esc(material.fechaRecibo)}</td>
    <td style="white-space:nowrap"><button type="button" class="ic" data-a="qr" data-i="${i}"${entrada?` data-entrada="${esc(entrada.id)}"`:""} title="${entrada?"Ver QR de esta entrada":"Ver QR"}">🔳</button>${esAdmin?`${entrada?`<button type="button" class="ic" data-a="ed" data-i="${i}" data-entrada="${esc(entrada.id)}" title="Editar esta entrada">✏️</button><button type="button" class="ic" data-a="del-entry" data-i="${i}" data-entrada="${esc(entrada.id)}" title="Eliminar esta entrada">🗑️</button>`:entradaIndex===0?`<button type="button" class="ic" data-a="ed" data-i="${i}" title="Editar material">✏️</button><button type="button" class="ic" data-a="del" data-i="${i}" title="Eliminar material">🗑️</button>`:""}`:""}</td></tr>`).join("");
  $("vacio").hidden=lista.length>0;
  const registrosDeMaterial=m=>Math.max(1,m.entradas?.length||0);
  const totalRegistros=mats.reduce((s,m)=>s+registrosDeMaterial(m),0);
  const mp=mats.filter(m=>m.esMP).reduce((s,m)=>s+registrosDeMaterial(m),0),consumibles=mats.filter(m=>m.tipoRegistro==="CONSUMIBLES").reduce((s,m)=>s+registrosDeMaterial(m),0);
  $("sTot").textContent=`${totalRegistros} registros`;$("sMp").textContent=`${mp} materia prima`;$("sConsumibles").textContent=`${consumibles} consumibles`;$("sGen").textContent=`${totalRegistros-mp-consumibles} generales`;
  syncBulkActions();
}
function renderInventario(){
  const selector=$("invAlmacen"),almacenActual=selector.value;
  selector.innerHTML='<option value="">Todos los almacenes</option>'+almacenes.map(a=>`<option value="${esc(a.codigo)}">${esc(a.nombre)}</option>`).join("");
  selector.value=almacenes.some(a=>a.codigo===almacenActual)?almacenActual:"";
  const q=$("invBuscar").value.trim().toLocaleLowerCase(),tipo=$("invTipo").value,almacenFiltro=selector.value;
  const ubiLoc=ubiFiltroCodigo?ubicacionesPorCodigo.get(ubiFiltroCodigo):null;
  const permitidos=ubiLoc?new Set(listaMaterialesEnUbicacion(ubiLoc).map(m=>m.codigo)):null;
  const lista=mats.filter(m=>{const loc=ubicacionDe(m),almacenCodigo=loc?.almacen_codigo||m.ubicacionAlmacenCodigo,alm=almacenDe(m),entradaTexto=(m.entradas||[]).flatMap(e=>[e.proveedor,e.numeroHeat,e.numeroLoteMP,e.lote,e.ubicacion,e.ubicacionCodigo]).join(" ");return(!permitidos||permitidos.has(m.codigo))&&(!tipo||(tipo==="mp"?m.esMP:tipo==="consumibles"?m.tipoRegistro==="CONSUMIBLES":m.tipoRegistro==="GENERAL"))&&(!almacenFiltro||almacenCodigo===almacenFiltro)&&(!q||[m.codigo,m.descripcion,m.ubicacion,m.ubicacionCodigo,loc?.nombre,alm?.nombre,m.lote,m.numeroHeat,m.numeroLoteMP,entradaTexto].join(" ").toLocaleLowerCase().includes(q))});
  if(!lista.some(m=>m.esMP&&m.codigo===invDetalleCodigo))invDetalleCodigo=null;
  $("invBody").innerHTML=lista.map(m=>{const loc=ubicacionDe(m),alm=almacenDe(m),tag=tagTipo(m),expandido=m.esMP&&invDetalleCodigo===m.codigo;return`<tr><td><b>${esc(m.codigo)}</b><br><small>${tag}</small>${m.esMP&&m.entradas?.length?`<br><button type="button" class="bs inv-detail-toggle" data-inv-detalle="${esc(m.codigo)}" aria-expanded="${expandido}">${expandido?"Ocultar":"Ver"} entradas (${m.entradas.length})</button>`:""}</td><td class="l">${esc(m.descripcion)}</td><td>${esc(existTxt(m))}</td><td class="l">${esc(alm?.nombre||m.ubicacionAlmacenNombre||"Sin almacén")} › ${esc(loc?ubicacionConCodigo(loc):m.ubicacion||"Sin ubicación")}</td></tr>${expandido?`<tr class="inv-detail-row"><td colspan="4">${detalleEntradasInventario(m)}</td></tr>`:""}`}).join("");
  $("invVacio").hidden=lista.length>0;
  actualizarEstadoConteoCiclico();
}
function detalleEntradasInventario(m){
  const entradas=m.entradas||[];
  const filas=entradas.map(e=>{
    const stock=existenciaEntrada(m,e),base=entradaEnBase(e);
    const piezas=stock.modo==="long"?stock.qty:stock.rest;
    const longitudInd=base.L>0?base.L*FAC[base.u]:null;
    const totalMm=e.totalMM!=null&&Number.isFinite(Number(e.totalMM))
      ?Number(e.totalMM)
      :longitudInd!=null?Number(e.cantidad)*longitudInd:null;
    const unidadPeso=pesoUnidad(e);
    const peso=stock.peso||(
      unidadPeso&&Number(e.cantidad)>0&&Number.isFinite(Number(e.peso))
        ?{peso:r4(Number(e.peso)*(Number(piezas)||0)/Number(e.cantidad)),u:unidadPeso}
        :null
    );
    return{
      proveedor:e.proveedor||"—",
      piezas:piezas!=null&&Number.isFinite(Number(piezas))?Number(piezas):null,
      peso:peso&&Number.isFinite(Number(peso.peso))?Number(peso.peso):null,
      pesoUnidad:peso?.u||"",
      longitudInd,
      totalMm,
      heat:e.numeroHeat||"—",
      ubicacion:e.ubicacion||"Sin ubicación"
    };
  });
  const pesoUnidades=new Set(filas.map(f=>f.pesoUnidad).filter(Boolean));
  const totalPeso=filas.every(f=>f.peso!=null&&f.pesoUnidad&&pesoUnidades.size===1)
    ?{peso:filas.reduce((s,f)=>s+f.peso,0),unidad:[...pesoUnidades][0]}
    :null;
  const totalPiezas=filas.every(f=>f.piezas!=null)?filas.reduce((s,f)=>s+f.piezas,0):null;
  const totalMm=filas.every(f=>f.totalMm!=null)?filas.reduce((s,f)=>s+f.totalMm,0):null;
  return`<div class="inv-detail"><h3>Detalle de entradas · ${esc(m.codigo)}</h3><div class="tw inv-detail-tw"><table><thead><tr><th>Proveedor</th><th>Cantidad (PZ)</th><th>Peso (LB / KG)</th><th>Longitud IND (mm)</th><th>Longitud total (mm)</th><th>Heat N.º</th><th>Ubicación</th></tr></thead><tbody>${filas.map(f=>`<tr><td class="l">${esc(f.proveedor)}</td><td>${f.piezas==null?"—":esc(fmt(f.piezas))}</td><td>${f.peso==null?"—":`${esc(fmt(f.peso))} ${esc(f.pesoUnidad)}`}</td><td>${f.longitudInd==null?"—":esc(fmt(f.longitudInd))}</td><td>${f.totalMm==null?"—":esc(fmt(f.totalMm))}</td><td>${esc(f.heat)}</td><td class="l">${esc(f.ubicacion)}</td></tr>`).join("")}<tr class="inv-detail-total"><th>Total</th><td>${totalPiezas==null?"—":esc(fmt(totalPiezas))}</td><td>${totalPeso?`${esc(fmt(totalPeso.peso))} ${esc(totalPeso.unidad)}`:"—"}</td><td>—</td><td>${totalMm==null?"—":esc(fmt(totalMm))}</td><td>—</td><td>—</td></tr></tbody></table></div></div>`;
}
let invDetalleCodigo=null;
$("invBody").addEventListener("click",e=>{
  const boton=e.target.closest("[data-inv-detalle]");
  if(!boton)return;
  const codigo=boton.dataset.invDetalle;
  if(!mats.some(m=>m.codigo===codigo&&m.esMP))return;
  invDetalleCodigo=invDetalleCodigo===codigo?null:codigo;
  renderInventario();
});
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
function renderAlmacenes(){
  const estado=$("almacenEstado"),lista=$("almacenLista"),form=$("almacenForm");
  if(almacenesError){estado.innerHTML=`<div class="res bad">${esc(almacenesError)} <a href="./supabase_almacenes.sql" download>Descargar migración</a></div>`;form.hidden=true;lista.innerHTML="";return}
  estado.innerHTML=[ubicacionesError,movimientosError].filter(Boolean).map(error=>`<div class="res bad">${esc(error)} <a href="./supabase_almacenes.sql" download>Ver migración</a></div>`).join("");form.hidden=!esAdmin;
  if(!almacenes.length){lista.innerHTML='<div class="empty">No hay almacenes registrados.</div>';return}
  const abiertas=new Set([...lista.querySelectorAll(".ubicacion-card[open]")].map(item=>item.dataset.codigo));
  lista.innerHTML=almacenes.map(a=>{
    const locs=ubicaciones.filter(loc=>loc.almacen_codigo===a.codigo),tipo={MP:"Materia prima",GENERAL:"Material general",CONSUMIBLES:"Consumibles",OTRO:"Otro"}[a.clasificacion]||"Sin clasificación";
    const materiales=materialesEnAlmacenes([a.codigo]),movimientos=movimientosEnAlmacenes([a.codigo],locs);
    return`<details class="ubicacion-card" data-codigo="${esc(a.codigo)}" ${abiertas.has(a.codigo)?"open":""}><summary><span class="ubicacion-nombre">${esc(a.nombre)}</span><span class="ubicacion-codigo">${esc(a.codigo)} · ${locs.length} ubicaciones</span></summary><div class="ubicacion-detalle"><div class="d"><b>Clasificación</b><span>${esc(tipo)}</span></div><div class="d"><b>Ubicaciones</b><span>${locs.length?locs.map(loc=>esc(ubicacionConCodigo(loc))).join(" · "):"Sin ubicaciones"}</span></div>${esAdmin?`<div class="res bad">Al eliminar se conservarán los materiales, pero se quitará su almacén y ubicación y se borrarán ${movimientos} movimientos del historial${materiales?` (${materiales} material(es) quedarán sin ubicación)`: ""}.</div><div class="ubicacion-admin-actions"><button type="button" class="bd" data-eliminar-almacen="${esc(a.codigo)}">🗑️ Eliminar almacén y su historial</button></div>`:""}</div></details>`
  }).join("");
  lista.querySelectorAll("[data-eliminar-almacen]").forEach(btn=>btn.onclick=()=>eliminarAlmacen(btn.dataset.eliminarAlmacen));
}
function listaMaterialesEnUbicacion(loc){
  return mats.filter(m=>m.ubicacionCodigo===loc.codigo||(!m.ubicacionCodigo&&String(m.ubicacion||"").trim().toLocaleLowerCase()===loc.nombre.toLocaleLowerCase()&&(!m.ubicacionAlmacenCodigo||m.ubicacionAlmacenCodigo===loc.almacen_codigo)));
}
function materialesEnUbicacion(loc){return listaMaterialesEnUbicacion(loc).length}
function movimientosDeUbicacion(loc){
  return movimientosUbicacion.filter(m=>
    m.ubicacion_anterior_codigo===loc.codigo||m.ubicacion_nueva_codigo===loc.codigo||
    (!m.ubicacion_anterior_codigo&&String(m.ubicacion_anterior||"").trim().toLocaleLowerCase()===loc.nombre.toLocaleLowerCase())||
    (!m.ubicacion_nueva_codigo&&String(m.ubicacion_nueva||"").trim().toLocaleLowerCase()===loc.nombre.toLocaleLowerCase())
  ).length;
}
function materialesEnAlmacenes(codigos){
  const codSet=new Set(codigos),locs=ubicaciones.filter(loc=>codSet.has(loc.almacen_codigo));
  return mats.filter(m=>codSet.has(m.ubicacionAlmacenCodigo)||locs.some(loc=>(
    m.ubicacionCodigo===loc.codigo||(!m.ubicacionCodigo&&String(m.ubicacion||"").trim().toLocaleLowerCase()===loc.nombre.toLocaleLowerCase())
  ))).length;
}
function movimientosEnAlmacenes(codigos,locs){
  const codSet=new Set(codigos),locSet=new Set(locs.map(loc=>loc.codigo));
  return movimientosUbicacion.filter(m=>
    codSet.has(m.ubicacion_anterior_almacen_codigo)||codSet.has(m.ubicacion_nueva_almacen_codigo)||
    locSet.has(m.ubicacion_anterior_codigo)||locSet.has(m.ubicacion_nueva_codigo)||
    locs.some(loc=>
      (!m.ubicacion_anterior_codigo&&String(m.ubicacion_anterior||"").trim().toLocaleLowerCase()===loc.nombre.toLocaleLowerCase())||
      (!m.ubicacion_nueva_codigo&&String(m.ubicacion_nueva||"").trim().toLocaleLowerCase()===loc.nombre.toLocaleLowerCase())
    )
  ).length;
}
async function eliminarUbicacion(codigo){
  if(!esAdmin){toast("Solo el administrador puede eliminar ubicaciones.",1);return}
  if(movimientosError){toast("No se pudo verificar el historial. Recarga antes de eliminar esta ubicación.",1);return}
  const loc=ubicacionesPorCodigo.get(codigo);if(!loc)return;
  const materiales=materialesEnUbicacion(loc),movimientos=movimientosDeUbicacion(loc);
  if(materiales){toast("Traspasa primero todo el inventario de esta ubicación.",1);return}
  if(!confirm(`¿Eliminar la ubicación ${ubicacionConCodigo(loc)} del almacén ${almacenesPorCodigo.get(loc.almacen_codigo)?.nombre||"Sin almacén"}?${movimientos?`\n\nSe conservarán ${movimientos} movimiento(s) en el historial con el nombre y código originales.`:""}`))return;
  let movimientosConservados=movimientos;
  try{
    const{data,error}=await sb.rpc("eliminar_ubicacion_vacia",{p_ubicacion_codigo:codigo});if(error)throw error;
    movimientosConservados=Number(data?.movimientos_conservados??movimientos);
  }catch(err){
    if(/UBICACION_NO_VACIA/.test(String(err?.message||err)))toast("La ubicación todavía tiene inventario. Traspásalo antes de eliminarla.",1);
    else errDB(err,"No se pudo eliminar la ubicación");
    return;
  }
  await cargarUbicaciones();toast(`Ubicación eliminada: ${ubicacionConCodigo(loc)}${movimientosConservados?` · ${movimientosConservados} movimiento(s) conservados`:""}`);
}
async function eliminarAlmacen(codigo){
  if(!esAdmin){toast("Solo el administrador puede eliminar almacenes.",1);return}
  const almacen=almacenesPorCodigo.get(codigo);if(!almacen)return;
  const locs=ubicaciones.filter(loc=>loc.almacen_codigo===codigo),materiales=materialesEnAlmacenes([codigo]),movimientos=movimientosEnAlmacenes([codigo],locs);
  const detalle=`\n\nSe eliminarán ${locs.length} ubicación(es) y ${movimientos} movimientos del historial. Los ${materiales} materiales se conservarán, pero quedarán sin almacén ni ubicación. Esta acción no se puede deshacer.`;
  if(!confirm(`¿Eliminar el almacén ${almacen.nombre} (${almacen.codigo})?${detalle}`))return;
  try{
    const{data,error}=await sb.rpc("eliminar_almacen_inventario",{p_almacen_codigo:codigo});if(error)throw error;
    const borrados=Number(data?.movimientos_eliminados??movimientos),liberados=Number(data?.materiales_desvinculados??materiales);
    await cargarUbicaciones();
    toast(`Almacén eliminado. ${liberados} materiales conservados sin ubicación · ${borrados} movimientos eliminados.`);
  }catch(err){errDB(err,"No se pudo eliminar el almacén")}
}
function actualizarSelectorAlmacenes(seleccionActual){
  const selector=$("ubiAlmacen"),valor=seleccionActual||selector.value;
  selector.innerHTML='<option value="">Seleccione un almacén…</option>'+almacenes.map(a=>`<option value="${esc(a.codigo)}">${esc(a.nombre)}${a.clasificacion?` · ${esc(a.clasificacion)}`:""}</option>`).join("");
  const predeterminado=almacenes.some(a=>a.codigo==="ALM-MP")?"ALM-MP":almacenes[0]?.codigo||"";
  selector.value=almacenes.some(a=>a.codigo===valor)?valor:predeterminado;
  $("ubiGuardar").disabled=!selector.value||!!almacenesError||!!ubicacionesError;
}
function actualizarDatalistUbicaciones(){
  const dl=$("ubicacionesDatalist");if(!dl)return;
  const opciones=[...new Map(ubicaciones.map(loc=>{
    const label=ubicacionConCodigo(loc);
    return [label.toLowerCase(), label];
  })).values()].sort((a,b)=>a.localeCompare(b,"es"));
  dl.innerHTML=opciones.map(v=>`<option value="${esc(v)}"></option>`).join("");
}
function normalizarCodigoUbicacion(codigo){
  const valor=String(codigo||"").trim();
  return /^UBI-/i.test(valor)?`UBI-${valor.slice(4)}`:`UBI-${valor}`;
}
const nombreUbicacion=loc=>{if(!loc)return"";const nombre=String(loc.nombre||"").trim();return nombre&&normalizarCodigoUbicacion(nombre).toLocaleLowerCase()!==normalizarCodigoUbicacion(loc.codigo).toLocaleLowerCase()?nombre:normalizarCodigoUbicacion(loc.codigo)};
const ubicacionConCodigo=loc=>{if(!loc)return"";const codigo=normalizarCodigoUbicacion(loc.codigo),n=nombreUbicacion(loc);return n===codigo?codigo:`${n} (${codigo})`};
function renderUbicaciones(){
  const estado=$("ubiEstado"),lista=$("ubiLista"),form=$("ubiForm");
  actualizarSelectorAlmacenes();
  if(almacenesError||ubicacionesError){estado.innerHTML=[almacenesError,ubicacionesError].filter(Boolean).map(error=>`<div class="res bad">${esc(error)} <a href="./supabase_almacenes.sql" download>Descargar migración</a></div>`).join("");form.hidden=true;lista.innerHTML="";return}
  estado.innerHTML=[movimientosError,ubicacionesAliasError?`${ubicacionesAliasError} Los QR nuevos siguen disponibles; los códigos impresos anteriores podrían no reconocerse.`:""].filter(Boolean).map(error=>`<div class="res bad">${esc(error)}</div>`).join("");form.hidden=false;$("ubiCodigoBox").hidden=$("ubiGuardarBox").hidden=!esAdmin;
  const almacenCodigo=$("ubiAlmacen").value,q=($("ubiBuscar")?.value||"").toLowerCase().trim();
  let ubicacionesAlmacen;
  if(q){
    ubicacionesAlmacen=ubicaciones.filter(loc=>{
      const alm=almacenesPorCodigo.get(loc.almacen_codigo);
      return [loc.codigo,loc.nombre,normalizarCodigoUbicacion(loc.codigo),nombreUbicacion(loc),ubicacionConCodigo(loc),alm?.nombre,alm?.codigo].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }else{
    if(!almacenCodigo){lista.innerHTML='<div class="empty">Crea o selecciona un almacén antes de agregar ubicaciones.</div>';return}
    ubicacionesAlmacen=ubicaciones.filter(loc=>loc.almacen_codigo===almacenCodigo);
  }
  if(!ubicacionesAlmacen.length){lista.className="ubicaciones-list";lista.innerHTML=`<div class="empty">${q?"Sin ubicaciones que coincidan con la búsqueda.":"Este almacén todavía no tiene ubicaciones."}</div>`;return}
  const abiertas=new Set([...lista.querySelectorAll(".ubicacion-card[open]")].map(item=>item.dataset.codigo));
  lista.className="ubicaciones-list";
  lista.innerHTML=ubicacionesAlmacen.map(loc=>{
    const i=ubicaciones.indexOf(loc),alm=almacenesPorCodigo.get(loc.almacen_codigo),materiales=listaMaterialesEnUbicacion(loc),existencias=materiales.length,movimientos=movimientosDeUbicacion(loc),ocupada=existencias>0||!!movimientosError;
    const materialesHtml=materiales.length
      ?`<section class="ubicacion-materiales" aria-label="Materiales en esta ubicación"><h3>Materiales en esta ubicación</h3><div class="ubicacion-material-list">${materiales.map(m=>`<div class="ubicacion-material"><span><b>${esc(m.codigo)}</b><span>${esc(m.descripcion)}</span></span><strong>${esc(existTxt(m))}</strong></div>`).join("")}</div></section>`
      :'<p class="ubicaciones-ayuda">No hay materiales en esta ubicación.</p>';
    const codigoVisible=normalizarCodigoUbicacion(loc.codigo),nombreVisible=nombreUbicacion(loc);
    return`<details class="ubicacion-card ubicacion-fila" data-index="${i}" data-codigo="${esc(loc.codigo)}" ${abiertas.has(loc.codigo)?"open":""}><summary><span class="ubicacion-nombre">${esc(codigoVisible)}</span><span class="ubicacion-codigo">${esc(alm?.nombre||"Sin almacén")}${nombreVisible!==codigoVisible?` · ${esc(nombreVisible)}`:""}</span></summary><div class="ubicacion-detalle"><div class="d"><b>Almacén</b><span>${esc(alm?.nombre||"Sin almacén")}</span></div><div class="d"><b>Código</b><span>${esc(codigoVisible)}</span></div><div class="d"><b>Inventario</b><span>${existencias} materiales · ${movimientos} movimientos históricos</span></div>${materialesHtml}${movimientos?`<p class="ubicaciones-ayuda">Al eliminarla, sus movimientos permanecerán en el historial con el nombre y código originales.</p>`:""}<div id="ubiQr-${i}"></div>${esAdmin?`<div class="ubicacion-admin-actions"><button type="button" class="bd ubicacion-delete" data-eliminar-ubicacion="${esc(loc.codigo)}" ${ocupada?`disabled title="${movimientosError?"No se pudo verificar el historial":"Traspasa el inventario antes de eliminar"}"`:""}>🗑️ Eliminar ubicación</button></div>`:""}</div></details>`
  }).join("");
  lista.querySelectorAll(".ubicacion-card").forEach(item=>{
    item.addEventListener("toggle",()=>{
      if(!item.open)return;
      lista.querySelectorAll(".ubicacion-card[open]").forEach(otra=>{if(otra!==item)otra.open=false});
      const i=Number(item.dataset.index);mostrarQrUbicacion(ubicaciones[i],i);
    });
  });
  lista.querySelectorAll(".ubicacion-card[open]").forEach(item=>{
    const i=Number(item.dataset.index);mostrarQrUbicacion(ubicaciones[i],i);
  });
  lista.querySelectorAll("[data-eliminar-ubicacion]").forEach(btn=>btn.onclick=()=>eliminarUbicacion(btn.dataset.eliminarUbicacion));
}
function codigoQrUbicacion(codigo){return`TRAZABILIDAD-UBICACION:${normalizarCodigoUbicacion(codigo)}`}
function generarEtiquetaQrUbicacion(loc){
  const qr=dibujarQR(codigoQrUbicacion(loc.codigo),600);
  if(!qr)return null;
  const almacen=almacenesPorCodigo.get(loc.almacen_codigo),nombre=nombreUbicacion(loc);
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
  if(!ctx)return null;
  canvas.width=800;canvas.height=1080;ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=false;ctx.drawImage(qr,100,35,600,600);
  const texto=(valor,y,tamano,peso="600")=>{
    const limite=720,lineas=[];let linea="";
    ctx.font=`${peso} ${tamano}px Arial,sans-serif`;
    String(valor||"").split(/\s+/).filter(Boolean).forEach(palabra=>{
      const prueba=linea?`${linea} ${palabra}`:palabra;
      if(ctx.measureText(prueba).width<=limite){linea=prueba;return}
      if(linea)lineas.push(linea);
      linea=palabra;
      while(ctx.measureText(linea).width>limite&&linea.length>1){let corte=linea.length-1;while(corte>1&&ctx.measureText(linea.slice(0,corte)).width>limite)corte--;lineas.push(linea.slice(0,corte));linea=linea.slice(corte)}
    });
    if(linea)lineas.push(linea);
    ctx.fillStyle="#111";ctx.textAlign="center";
    lineas.forEach((renglon,i)=>ctx.fillText(renglon,400,y+i*tamano*1.2,limite));
    return lineas.length*tamano*1.2;
  };
  texto(normalizarCodigoUbicacion(loc.codigo),690,48,"700");
  texto("UBICACIÓN",760,38,"700");
  let y=815;
  if(almacen?.nombre)y+=texto(almacen.nombre,y,30);
  if(nombre&&nombre!==normalizarCodigoUbicacion(loc.codigo))texto(nombre,y+8,32);
  return canvas;
}
function mostrarQrUbicacion(loc,i){
  const box=$(`ubiQr-${i}`);if(!box)return;
  if(box.querySelector("canvas"))return;
  const qr=dibujarQR(codigoQrUbicacion(loc.codigo),240);
  if(!qr){toast("No se pudo generar el QR de la ubicación",1);return}
  const almacen=almacenesPorCodigo.get(loc.almacen_codigo);
  box.innerHTML=`<div class="acts"><button type="button" class="bs" data-ubi-descargar>⬇️ Descargar etiqueta QR</button><button type="button" class="bs" data-ubi-imprimir>🖨️ Imprimir QR</button></div>`;
  qr.className="ubicacion-qr";box.prepend(qr);
  box.querySelector("[data-ubi-descargar]").onclick=async()=>{
    const etiqueta=generarEtiquetaQrUbicacion(loc);
    if(!etiqueta){toast(`No se pudo generar la etiqueta QR de ${normalizarCodigoUbicacion(loc.codigo)}.`,1);return}
    await bajarBlob(`QR_${safeN(normalizarCodigoUbicacion(loc.codigo))}.png`,new Blob([durl(etiqueta.toDataURL("image/png"))],{type:"image/png"}));
  };
  box.querySelector("[data-ubi-imprimir]").onclick=()=>imprimirEtiquetaUbicacion(loc,qr.toDataURL("image/png"),almacen);
}
$("bUbiExportar").onclick=()=>{
  if(!esAdmin){toast("Solo el administrador puede exportar información.",1);return}
  if(!ubicaciones.length){toast("No hay ubicaciones para exportar.",1);return}
  const archivos=[];
  for(const loc of ubicaciones){
    const etiqueta=generarEtiquetaQrUbicacion(loc);
    if(!etiqueta){toast(`No se pudo generar la etiqueta QR de ${normalizarCodigoUbicacion(loc.codigo)}. No se exportó el archivo.`,1);return}
    archivos.push({name:`QR_${safeN(normalizarCodigoUbicacion(loc.codigo))}.png`,data:durl(etiqueta.toDataURL("image/png"))});
  }
  bajarBlob("QR_ubicaciones.zip",zipBytes(archivos));
  toast(`${archivos.length} etiquetas QR de ubicaciones exportadas ⬇️`);
};
function imprimirEtiquetaUbicacion(loc,src,almacen){
  const codigoVisible=normalizarCodigoUbicacion(loc.codigo),nombreVisible=nombreUbicacion(loc);
  const e=$("etiqueta");e.className="hoja";e.innerHTML=`<div class="pz"><img src="${src}" alt="QR ${esc(codigoVisible)}"><div class="tx"><b class="cd">${esc(codigoVisible)}</b><span class="tg">UBICACIÓN</span><small>${esc(almacen?.nombre||"Sin almacén")}</small>${nombreVisible!==codigoVisible?`<small>${esc(nombreVisible)}</small>`:""}</div></div>`;
  let st=$("etqCss");if(!st){st=document.createElement("style");st.id="etqCss";document.head.appendChild(st)}
  st.textContent=cssEtq();window.addEventListener("afterprint",limpiarEtqCss,{once:true});window.print();
}
function procesarEscaneoInventario(txt){
  const raw=String(txt||"").trim(),prefijo="TRAZABILIDAD-UBICACION:";
  if(raw.toUpperCase().startsWith(prefijo)){
    const codigo=raw.slice(prefijo.length).trim(),loc=ubicacionPorCodigo(codigo);
    if(!loc){toast(ubicacionesAliasError||`Ubicación no registrada: ${codigo}`,1);return}
    const almacen=almacenesPorCodigo.get(loc.almacen_codigo);
    ubicacionDestino=loc;$("ubiDestino").textContent=`${almacen?.nombre||"Sin almacén"} → ${ubicacionConCodigo(loc)}`;renderAsignacion();toast(`Destino seleccionado: ${almacen?.nombre?almacen.nombre+" → ":""}${ubicacionConCodigo(loc)}`);$("ubiScan").focus();return
  }
  const cod=codDe(raw).toLowerCase(),m=mats.find(x=>x.codigo.toLowerCase()===cod);
  if(!m){toast(`Código no registrado: ${cod}`,1);return}
  if(!ubicacionDestino){toast("Primero escanea el QR de la ubicación destino.",1);return}
  if(asignacionItems.some(x=>x.codigo.toLowerCase()===m.codigo.toLowerCase())){toast(`${m.codigo} ya está en la lista de traspaso`,1);return}
  const e=existencia(m);if(e.rest<=0){toast(`${m.codigo} no tiene existencia disponible`,1);return}
  asignacionItems.push({codigo:m.codigo});renderAsignacion();
}
function renderAsignacion(){
  $("asigLista").innerHTML=asignacionItems.map((item,i)=>{const m=mats.find(x=>x.codigo===item.codigo);if(!m)return"";const origen=ubicacionDe(m),origenTxt=origen?ubicacionConCodigo(origen):m.ubicacion||"Sin ubicación";return`<div class="asig-item"><span><b>${esc(m.codigo)}</b> · ${esc(m.descripcion)} · ${esc(existTxt(m))}<br><small>Desde: ${esc(origenTxt)}</small></span><button type="button" class="bd" data-asig-quitar="${i}">Quitar</button></div>`}).join("");
  $("asigLista").querySelectorAll("[data-asig-quitar]").forEach(b=>b.onclick=()=>{asignacionItems.splice(+b.dataset.asigQuitar,1);renderAsignacion()});
  $("ubiConfirmar").disabled=!ubicacionDestino||!asignacionItems.length||!!ubicacionesError;
}
async function confirmarAsignacion(){
  if(!ubicacionDestino||!asignacionItems.length)return;
  const items=asignacionItems.map(x=>mats.find(m=>m.codigo===x.codigo)).filter(Boolean);
  if(items.length!==asignacionItems.length){toast("Uno o más materiales ya no están disponibles. Actualice e intente de nuevo.",1);await cargar();renderAsignacion();return}
  const mismo=items.filter(m=>m.ubicacionCodigo===ubicacionDestino.codigo||(!m.ubicacionCodigo&&m.ubicacion===ubicacionDestino.nombre&&(!m.ubicacionAlmacenCodigo||m.ubicacionAlmacenCodigo===ubicacionDestino.almacen_codigo)));
  if(mismo.length){toast(`Ya están en ${ubicacionConCodigo(ubicacionDestino)}: ${mismo.map(m=>m.codigo).join(", ")}`,1);return}
  const folio=`UBI-${Date.now()}`;
  const payload=items.map(m=>{const e=existencia(m);return{codigo:m.codigo,existencia:{modo:e.modo,cantidad:e.modo==="pz"?e.rest:e.qty,longitud:e.modo==="long"?e.rest:null,unidad:e.u,peso:e.peso?.peso??null,pesoUnidad:e.peso?.u??null}}});
  $("ubiConfirmar").disabled=true;
  try{
    const{data,error}=await sb.rpc("asignar_inventario_ubicacion",{p_ubicacion_codigo:ubicacionDestino.codigo,p_folio:folio,p_items:payload});
    if(error)throw error;
    if(Number(data)!==items.length)throw new Error(`Respuesta incompleta del servidor (${data??"sin cantidad"})`);
    asignacionItems=[];renderAsignacion();
    try{await Promise.all([cargar(),cargarUbicaciones()])}
    catch(err){errDB(err,"Traspaso registrado, pero no se pudo actualizar la vista")}
    toast(`Traspaso registrado a ${ubicacionConCodigo(ubicacionDestino)} · ${folio}`);
  }catch(err){errDB(err,"No se pudo registrar el traspaso");$("ubiConfirmar").disabled=false}
}
function conteoHistTxt(x,valor){
  const n=Number(valor);
  if(!Number.isFinite(n))return `— ${x.unidad}`;
  const m=mats.find(mat=>mat.codigo===x.codigo_material);
  if(m&&modoLong(m)){
    const{L,u}=longBase(m);
    if(x.unidad===u&&L>0)return `${fmt(n)} ${u} (≈${fmt(r4(n/L))} pz)`;
  }
  return `${fmt(n)} ${x.unidad}`;
}
function renderHistUbicaciones(){
  $("ubiHistEstado").innerHTML=[movimientosError,ajustesInventarioError].filter(Boolean).map(error=>`<div class="res bad">${esc(error)}</div>`).join("");
  const filas=movimientosUbicacion.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  $("ubiHistBody").innerHTML=filas.map(x=>{const anterior=almacenesPorCodigo.get(x.ubicacion_anterior_almacen_codigo),nueva=almacenesPorCodigo.get(x.ubicacion_nueva_almacen_codigo),desde=`${esc(x.ubicacion_anterior||"Sin ubicación")}${x.ubicacion_anterior_codigo?` <small>(${esc(x.ubicacion_anterior_codigo)})</small>`:""}`,hacia=`${esc(x.ubicacion_nueva)}${x.ubicacion_nueva_codigo?` <small>(${esc(x.ubicacion_nueva_codigo)})</small>`:""}`;return`<tr><td>${esc(new Date(x.created_at).toLocaleString("es-MX"))}</td><td>${esc(x.folio)}</td><td>${esc(x.codigo_material)}</td><td>${esc(anterior?.nombre||"Sin almacén")}</td><td>${desde}</td><td>${esc(nueva?.nombre||"Sin almacén")}</td><td>${hacia}</td><td>${esc(resumenExistencia(x.existencia))}</td></tr>`}).join("");
  $("ubiHistVacio").hidden=filas.length>0;
  const conteos=mats.flatMap(m=>(m.ajustesInventario||[]).map(ajuste=>({...ajuste,codigo_material:m.codigo}))).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  $("conteoHistBody").innerHTML=conteos.map(x=>`<tr><td>${esc(new Date(x.created_at).toLocaleString("es-MX"))}</td><td><b>${esc(x.codigo_material)}</b></td><td>${esc(x.ubicacion_nombre||x.ubicacion_codigo||"")}</td><td>${esc(conteoHistTxt(x,x.existencia_anterior))}</td><td>${esc(conteoHistTxt(x,x.existencia_contada))}</td><td>${esc(conteoHistTxt(x,x.diferencia))}</td><td class="l">${esc(x.motivo||"—")}</td><td>${esc(x.usuario||"—")}</td></tr>`).join("");
  $("conteoHistVacio").hidden=conteos.length>0;
}
function resumenExistencia(e){
  if(!e)return"";
  const cantidad=e.modo==="long"?`${fmt(e.longitud)} ${e.unidad||"mm"}`:`${fmt(e.cantidad)} ${e.unidad||"PZ"}`;
  return`${cantidad}${e.peso!=null?` · ${fmt(e.peso)} ${e.pesoUnidad}`:""}`;
}
function siguienteCodigoUbicacion(){
  const max=ubicaciones.reduce((n,l)=>Math.max(n,Number(/^(?:UBI-)?(\d+)$/i.exec(l.codigo)?.[1])||0),0);
  $("ubiCodigo").value=`UBI-${String(max+1).padStart(3,"0")}`;
}
async function resolverUbicacionRegistro(nombre,tipoRegistro,ubicacionAnteriorCodigo){
  const almacenCodigo={MP:"61",CONSUMIBLES:"62"}[tipoRegistro],valor=String(nombre||"").trim(),clave=valor.toLocaleLowerCase(),codigoIngresado=normalizarCodigoUbicacion(valor).toLocaleLowerCase(),codigoManual=/^(?:UBI-)?\d+$/i.test(valor),codigoSolicitado=normalizarCodigoUbicacion(valor);
  if(!clave)throw new Error("La ubicación es obligatoria.");
  if(almacenesError||ubicacionesError)throw new Error("No se pudieron consultar los almacenes y ubicaciones. Recarga antes de guardar.");
  const coincideNombre=loc=>[loc.nombre,loc.codigo].some(texto=>String(texto||"").trim().toLocaleLowerCase()===clave||normalizarCodigoUbicacion(texto).toLocaleLowerCase()===codigoIngresado);
  const anterior=ubicaciones.find(loc=>loc.codigo===ubicacionAnteriorCodigo&&coincideNombre(loc));
  let almacen=almacenesPorCodigo.get(almacenCodigo);
  if(!almacenCodigo){
    if(anterior)almacen=almacenesPorCodigo.get(anterior.almacen_codigo);
    const coincidencias=ubicaciones.filter(coincideNombre);
    const existente=anterior|| (coincidencias.length===1?coincidencias[0]:null);
    if(!existente)throw new Error(coincidencias.length>1?"La ubicación existe en más de un almacén. Selecciona Materia prima o Consumibles para indicar el almacén correcto.":"Para crear una ubicación desde el registro, selecciona Materia prima (almacén 61) o Consumibles (almacén 62).");
    almacen=almacenesPorCodigo.get(existente.almacen_codigo);
    if(!almacen)throw new Error("No se encontró el almacén de la ubicación seleccionada.");
    return{ubicacion:existente,almacen,creada:false};
  }
  if(!almacen)throw new Error(`No se encontró el almacén ${almacenCodigo} para ${nombreTipoRegistro(tipoRegistro)}.`);
  const existentePorCodigo=ubicaciones.find(loc=>loc.almacen_codigo===almacenCodigo&&normalizarCodigoUbicacion(loc.codigo).toLocaleLowerCase()===codigoIngresado);
  if(existentePorCodigo)return{ubicacion:existentePorCodigo,almacen,creada:false};
  if(ubicacionesAlias.some(alias=>alias.codigo_alias.toLocaleLowerCase()===clave||normalizarCodigoUbicacion(alias.codigo_alias).toLocaleLowerCase()===codigoIngresado))
    throw new Error(`El código ${valor} está reservado como QR anterior de otra ubicación.`);
  const existente=ubicaciones.find(loc=>loc.almacen_codigo===almacenCodigo&&coincideNombre(loc));
  if(codigoManual&&existente){
    if(!esAdmin)throw new Error(`La ubicación ${valor} ya existe con el código ${existente.codigo}. Pide al administrador que corrija esa ubicación.`);
    const{data,error}=await sb.rpc("corregir_codigo_ubicacion",{
      p_codigo_actual:existente.codigo,p_codigo_nuevo:codigoSolicitado,p_almacen_codigo:almacenCodigo
    });
    if(error){
      if(/PGRST202|function.*does not exist|schema cache/i.test(String(error.message||"")))
        throw new Error("Falta aplicar la versión actualizada de supabase_almacenes.sql para corregir esta ubicación.");
      throw error;
    }
    if(data?.codigo_nuevo!==codigoSolicitado)throw new Error("El servidor no confirmó la corrección del código de ubicación.");
    const corregida={...existente,codigo:codigoSolicitado,nombre:codigoSolicitado};
    ubicaciones=ubicaciones.map(loc=>loc.codigo===existente.codigo?corregida:loc);
    ubicacionesAlias=ubicacionesAlias.map(alias=>alias.ubicacion_codigo===existente.codigo?{...alias,ubicacion_codigo:codigoSolicitado}:alias);
    if(!ubicacionesAlias.some(alias=>alias.codigo_alias===existente.codigo))ubicacionesAlias.push({codigo_alias:existente.codigo,ubicacion_codigo:codigoSolicitado});
    mats.forEach(material=>{
      if(material.ubicacionCodigo!==existente.codigo)return;
      material.ubicacionCodigo=codigoSolicitado;material.ubicacion=codigoSolicitado;
      material.ubicacionAlmacenCodigo=almacenCodigo;material.ubicacionAlmacenNombre=almacen.nombre;
    });
    $("ubiAlmacen").value=almacenCodigo;renderAlmacenes();renderUbicaciones();
    const indice=ubicaciones.indexOf(corregida),tarjeta=[...$("ubiLista").querySelectorAll(".ubicacion-card")].find(item=>item.dataset.codigo===codigoSolicitado);
    if(tarjeta){tarjeta.open=true;mostrarQrUbicacion(corregida,indice)}
    return{ubicacion:corregida,almacen,creada:false,corregida:true};
  }
  if(existente)return{ubicacion:existente,almacen,creada:false};
  let codigo=codigoManual?codigoSolicitado:valor;
  if(!codigoManual){
    const max=ubicaciones.reduce((n,loc)=>Math.max(n,Number(/^(?:UBI-)?(\d+)$/i.exec(loc.codigo)?.[1])||0),0);
    let numero=max+1;codigo=`UBI-${String(numero).padStart(3,"0")}`;
    while(ubicaciones.some(loc=>loc.codigo.toLocaleLowerCase()===codigo.toLocaleLowerCase())||ubicacionesAlias.some(alias=>alias.codigo_alias.toLocaleLowerCase()===codigo.toLocaleLowerCase())){numero++;codigo=`UBI-${String(numero).padStart(3,"0")}`}
  }
  const{data,error}=await sb.from("ubicaciones").insert({codigo,nombre:valor,almacen_codigo:almacenCodigo}).select("codigo,nombre,almacen_codigo,created_at").single();
  if(error){
    if(error.code==="23505"){
      const actualizadas=await leerTodo("ubicaciones","codigo,nombre,almacen_codigo,created_at",["nombre"]);
      ubicaciones=actualizadas;
      const concurrente=ubicaciones.find(loc=>loc.almacen_codigo===almacenCodigo&&coincideNombre(loc));
      if(concurrente){$("ubiAlmacen").value=almacenCodigo;renderAlmacenes();renderUbicaciones();return{ubicacion:concurrente,almacen,creada:false}}
    }
    throw error;
  }
  if(!data)throw new Error("El servidor no devolvió la ubicación registrada.");
  ubicaciones.push(data);$("ubiAlmacen").value=almacenCodigo;renderAlmacenes();renderUbicaciones();
  const indice=ubicaciones.indexOf(data),tarjeta=[...$("ubiLista").querySelectorAll(".ubicacion-card")].find(item=>item.dataset.codigo===data.codigo);
  if(tarjeta){tarjeta.open=true;mostrarQrUbicacion(data,indice)}
  return{ubicacion:data,almacen,creada:true};
}
function siguienteCodigoAlmacen(){
  const max=almacenes.reduce((n,a)=>Math.max(n,Number(/^ALM-(\d+)$/i.exec(a.codigo)?.[1])||0),0);
  $("almacenCodigo").value=`ALM-${String(max+1).padStart(3,"0")}`;
}
$("almacenAuto").onclick=siguienteCodigoAlmacen;
$("almacenForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const codigo=$("almacenCodigo").value.trim(),nombre=$("almacenNombre").value.trim(),clasificacion=$("almacenTipo").value||null;
  if(!codigo||!nombre)return;
  $("almacenGuardar").disabled=true;
  try{
    const{error}=await sb.from("almacenes").insert({codigo,nombre,clasificacion});if(error)throw error;
    $("almacenNombre").value="";$("almacenTipo").value="";siguienteCodigoAlmacen();
    await cargarUbicaciones();$("ubiAlmacen").value=codigo;renderUbicaciones();
    toast(`Almacén guardado: ${nombre}`);
  }catch(err){errDB(err,"No se pudo guardar el almacén")}
  finally{$("almacenGuardar").disabled=false}
});
$("ubiAuto").onclick=siguienteCodigoUbicacion;
$("ubiAlmacen").onchange=()=>{$("ubiBuscar").value="";renderUbicaciones()};
$("ubiBuscar").oninput=debounce(renderUbicaciones,250);
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
  const visible=[...$("tbody").querySelectorAll("[data-select]")],all=$("selectAll");
  const clavesVisibles=new Set(visible.map(c=>c.dataset.select)),clavesMarcadas=new Set(visible.filter(c=>c.checked).map(c=>c.dataset.select));
  const seleccionSoloMateriales=[...seleccionados].every(c=>c.startsWith("material:"));
  all.hidden=false;$("seleccionInfo").hidden=false;$("bDelSel").hidden=$("bDelAll").hidden=!esAdmin;
  all.checked=clavesVisibles.size>0&&[...clavesVisibles].every(c=>clavesMarcadas.has(c));all.indeterminate=clavesMarcadas.size>0&&!all.checked;
  $("seleccionInfo").textContent=`${seleccionados.size} registro(s) seleccionado(s)`;
  $("bDelSel").disabled=seleccionados.size===0||!seleccionSoloMateriales;
  $("bDelSel").title=seleccionSoloMateriales?"Eliminar materiales seleccionados":"Para evitar borrar otras entradas, elimina el material completo desde su fila";
  $("bDelAll").disabled=mats.length===0;
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
  $("tbody").querySelectorAll("[data-select]").forEach(item=>{if(item.dataset.select===c.dataset.select)item.checked=c.checked});
  syncBulkActions();
});
function alternarQrMaterial(m,entradaId=null){
  mostrar(m,entradaId);
}
$("tbody").addEventListener("click",async e=>{
  const b=e.target.closest("button");
  if(b){
    const i=+b.dataset.i,m=mats[i];
    if(b.dataset.a==="qr"){alternarQrMaterial(m,b.dataset.entrada?Number(b.dataset.entrada):null);return}
    if(b.dataset.a==="ed"){if(esAdmin)editar(i,b.dataset.entrada?Number(b.dataset.entrada):null);else toast("Solo el administrador puede editar materiales.",1);return}
    if(b.dataset.a==="del-entry"){
      if(!esAdmin){toast("Solo el administrador puede eliminar entradas.",1);return}
      const entrada=(m?.entradas||[]).find(x=>Number(x.id)===Number(b.dataset.entrada));
      if(!m||!entrada){toast("No se encontró la entrada que intentas eliminar.",1);return}
      const esUltima=m.entradas.length===1;
      const mensaje=esUltima
        ?`¿Eliminar la entrada #${entrada.id} de ${m.codigo}? Es la última entrada, por lo que también se eliminará el material y su historial asociado. Esta acción no se puede deshacer.`
        :`¿Eliminar únicamente la entrada #${entrada.id} de ${m.codigo}? La existencia se recalculará con las entradas restantes. Esta acción no se puede deshacer.`;
      if(!confirm(mensaje))return;
      b.disabled=true;
      try{
        await eliminarEntradaRegistro(m,entrada);
        seleccionados.delete(claveRegistroHistorial(m,entrada));
        await cargar();
        toast(esUltima?"Entrada y material eliminados":"Entrada eliminada; existencia actualizada");
      }catch(err){errDB(err,"No se pudo eliminar la entrada")}
      finally{b.disabled=false}
      return;
    }
    if(b.dataset.a==="del"){
      if(!esAdmin){toast("Solo el administrador puede eliminar materiales.",1);return}
      if(confirm(`¿Eliminar el material ${m.codigo}? Se eliminarán todas sus entradas y surtidos.`)){try{const{error}=await sb.from("materiales").delete().eq("codigo",m.codigo);if(error)throw error;await cargar();toast("Material eliminado")}catch(err){errDB(err,"No se pudo eliminar")}}
    }
    return;
  }
  if(e.target.closest("input,select,textarea,a"))return;
  const fila=e.target.closest("tr"),botonQr=fila?.querySelector('button[data-a="qr"]');
  if(!botonQr)return;
  const m=mats[+botonQr.dataset.i];
  if(m)alternarQrMaterial(m,botonQr.dataset.entrada?Number(botonQr.dataset.entrada):null);
});
async function eliminarEntradaRegistro(m,entrada){
  if(!esAdmin)throw new Error("Solo el administrador puede eliminar entradas.");
  const[{count:despachos,error:errorDespachos},{count:ajustes,error:errorAjustes}]=await Promise.all([
    sb.from("despachos").select("t",{count:"exact",head:true}).eq("entrada_id",entrada.id),
    sb.from("ajustes_inventario_ciclico").select("id",{count:"exact",head:true}).eq("entrada_id",entrada.id)
  ]);
  if(errorDespachos)throw errorDespachos;
  if(errorAjustes)throw errorAjustes;
  if((despachos||0)>0||(ajustes||0)>0){
    throw new Error(`No se puede eliminar la entrada #${entrada.id}: tiene ${despachos||0} surtido(s) y ${ajustes||0} ajuste(s) ligados. Anula o corrige esos movimientos antes de borrarla.`);
  }
  if((m.entradas||[]).length===1){
    const{error}=await sb.from("materiales").delete().eq("codigo",m.codigo);
    if(error)throw error;
    return;
  }
  const{data,error}=await sb.from("entradas_material").delete()
    .eq("id",entrada.id).eq("codigo_material",m.codigo).select("id");
  if(error)throw error;
  if(!data?.length)throw new Error(`No se eliminó la entrada #${entrada.id}. Actualiza la lista e inténtalo de nuevo.`);
}
async function eliminarEnLotes(codigos){
 if(!esAdmin)throw new Error("Solo el administrador puede eliminar materiales.");
 for(let i=0;i<codigos.length;i+=100){
   const{error}=await sb.from("materiales").delete().in("codigo",codigos.slice(i,i+100));
   if(error)throw error;
 }
}
$("bDelSel").onclick=async()=>{
 if(!esAdmin){toast("Solo el administrador puede eliminar materiales.",1);return}
 if([...seleccionados].some(c=>!c.startsWith("material:"))){toast("La selección contiene entradas individuales. Elimina el material completo desde su fila.",1);return}
 const codigos=[...seleccionados].map(c=>c.slice("material:".length)).filter(c=>mats.some(m=>m.codigo===c));
 if(!codigos.length){seleccionados.clear();render();return}
 if(!confirm(`¿Eliminar ${codigos.length} material(es) seleccionado(s)? También se borrarán sus surtidos.`))return;
 $("bDelSel").disabled=$("bDelAll").disabled=true;
 try{await eliminarEnLotes(codigos);codigos.forEach(c=>seleccionados.delete(`material:${c}`));toast(`${codigos.length} material(es) eliminado(s)`)}
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
function editar(i,entradaId=null){
  if(!esAdmin){toast("Solo el administrador puede editar materiales.",1);return}
  if(modoRegistro!=="unico"){modoRegistro="unico";actualizarModoRegistroUI()}
  activarSubpantalla("vReg","captura");
  const m=mats[i],entrada=entradaId!=null?(m.entradas||[]).find(e=>Number(e.id)===Number(entradaId)):null;
  if(entradaId!=null&&!entrada){toast("No se encontró la entrada que intentas editar.",1);return}
  const registro=entrada?materialDeEntrada(m,entrada):m;
  resetForm();$("editIndex").value=i;editandoEntradaId=entrada?Number(entrada.id):null;
  if(m.entradas?.length&&!entrada){$("cantidad").readOnly=true;$("cantidad").title="La cantidad se controla con las entradas/lotes y los conteos. No se edita directamente."}
  if(entrada){$("codigo").readOnly=true;$("descripcion").readOnly=true;$("tipoRegistro").disabled=true}
  const values={codigo:m.codigo,descripcion:m.descripcion,um:m.um,cantidad:registro.cantidad,ubicacion:registro.ubicacion,fechaRecibo:registro.fechaRecibo,tipoRegistro:m.tipoRegistro|| (m.esMP?"MP":"GENERAL"),seccionMaterial:registro.noAplica?.seccionMaterial?"":registro.seccionMaterial||m.seccionMaterial,altoMaterial:registro.alto,anchoMaterial:registro.ancho,diametroMaterial:registro.diametro,proveedor:registro.proveedor,
    tipoMaterial:registro.tipoMaterial??(m.esMP?"Materia prima":m.tipoRegistro==="CONSUMIBLES"?"Consumibles":"Material general"),especificacionMedida:registro.especificacionMedida,longitudIndividual:registro.longitudIndividual,manufactura:registro.manufactura,
    numeroHeat:registro.numeroHeat,numeroLoteMP:registro.numeroLoteMP??registro.lote,numeroCertificado:registro.numeroCertificado,totalMM:registro.totalMM,peso:registro.peso,ordenMaterial:registro.ordenMaterial,poNumber:registro.poNumber};
  Object.entries(values).forEach(([id,value])=>$(id).value=value??"");
  actualizarCamposSeccion();
  $("um").value="PZ";
  $("pesoU").value=registro.pesoU||registro.pesoUnidad||(registro.pesoUnidadPendiente?"":(["LB","KG"].includes(registro.um)?registro.um:"LB"));
  CAMPOS_EXTRA.forEach(([key,id])=>{
    const noAplica=!!registro.noAplica?.[key],checkbox=document.querySelector(`input[data-na="${id}"]`),input=$(id);
    checkbox.checked=noAplica;input.value=values[key]??"";
    const wrap=input.closest(".na-field").querySelector(".na-value-wrap")||input;wrap.hidden=noAplica;
  });
  const seccionNoAplica=!!registro.noAplica?.seccionMaterial,seccionCheckbox=document.querySelector('input[data-na="seccionMaterial"]');
  seccionCheckbox.checked=seccionNoAplica;$("seccionMaterial").hidden=seccionNoAplica;
  actualizarCamposSeccion();
  $("tituloForm").textContent=entrada?`Editando entrada #${entrada.id} · ${m.codigo}`:`Editando: ${m.codigo}`;$("btnGuardar").textContent=entrada?"💾 Guardar cambios de la entrada":"💾 Guardar cambios y regenerar QR";$("btnCancelar").hidden=false;
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
  const cols=["ENTRADA","UBICACION","CODIGO","CLASIFICACION","TIPO MATERIAL","DESCRIPCION","PROVEEDOR","ESPECIFICACION MEDIDA","SECCION","ALTO (MM)","ANCHO (MM)","DIAMETRO (MM)","LONGITUD IND (MM)","MANUFACTURA","N°HEAT","N°LOTE MP","N°CERT.","TOTAL MM","FECHA DE RECIBO","CTD","PESO","UM","ORDEN","PO NUMBER","EXISTENCIA"];
  const c=v=>{let t=String(v??"");if(/^[=+\-@\t\r]/.test(t))t="'"+t;return `"${t.replace(/"/g,'""')}"`};
  const value=(m,key,v)=>m.noAplica?.[key]?"No aplica":v;
  const rows=[];
  mats.forEach(m=>{
    const entradas=m.entradas?.length?m.entradas:[null];
    entradas.forEach(e=>{
      const x=e?materialDeEntrada(m,e):m;
      rows.push([e?e.id:"",x.ubicacion,x.codigo,nombreTipoRegistro(x.tipoRegistro).toUpperCase(),value(x,"tipoMaterial",x.tipoMaterial),x.descripcion,x.proveedor,
        value(x,"especificacionMedida",x.especificacionMedida),value(x,"seccionMaterial",x.seccionMaterial),x.alto,x.ancho,x.diametro,value(x,"longitudIndividual",x.longitudIndividual),value(x,"manufactura",x.manufactura),value(x,"numeroHeat",x.numeroHeat),
        value(x,"numeroLoteMP",x.numeroLoteMP||x.lote),value(x,"numeroCertificado",x.numeroCertificado),value(x,"totalMM",x.totalMM),
        x.fechaRecibo,x.cantidad,value(x,"peso",x.peso),x.noAplica?.peso?"No aplica":x.pesoUnidadPendiente?"Sin especificar":x.pesoU||x.pesoUnidad||"LB",
        value(x,"ordenMaterial",x.ordenMaterial),value(x,"poNumber",x.poNumber),e?existEntradaTxt(m,e):existTxt(m)]);
    });
  });
  bajar("trazabilidad_materiales.csv","\ufeff"+[cols.join(","),...rows.map(row=>row.map(c).join(","))].join("\r\n"),"text/csv;charset=utf-8");toast("CSV exportado ⬇️");
};
$("bImp").onclick=()=>{if(!esAdmin){toast("Solo el administrador puede restaurar información.",1);return}$("fileImp").click()};
$("bExcel").onclick=()=>{if(!esAdmin){toast("Solo el administrador puede importar información.",1);return}$("fileExcel").click()};
const EXCEL_HEADERS={
  ubicacion:["ubicacion","location"],codigo:["codigo","code"],tipoRegistro:["clasificacion","tiporegistro","categoriaregistro"],tipoMaterial:["tipomaterial","tipo"],descripcion:["descripcion","description"],proveedor:["proveedor","supplier","vendor"],
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
  if(!codigo||!descripcion||cantidad==null||cantidad<=0||!fechaRecibo||(umOriginal&&!pesoUnitMap[umOriginal]&&!umCantidad&&!noAplica.peso))return null;
  const extra=Object.fromEntries(CAMPOS_EXTRA.map(([key])=>[key,noAplica[key]?["peso","totalMM","longitudIndividual"].includes(key)?null:"":["peso","totalMM","longitudIndividual"].includes(key)?numeroExcel(raw[key]):stringValue(key)]));
  if(!noAplica.totalMM&&extra.longitudIndividual!=null)extra.totalMM=cantidad*extra.longitudIndividual;
  return{codigo,descripcion,lote:extra.numeroLoteMP,proveedor:text("proveedor"),um:"PZ",cantidad,ubicacion,fechaRecibo,
    fechaModificacion:new Date().toLocaleString("es-MX"),tipoRegistro:esMP?"MP":esConsumible?"CONSUMIBLES":"GENERAL",seccionMaterial,esMP,peso,pesoU:extra.peso==null?null:(pesoUnitMap[umOriginal]||null),pesoUnidadPendiente:extra.peso!=null&&umCantidad,longitud:null,longU:null,
    seccion:seccionMaterial==="RND"?"redondo":["SQ","FLAT"].includes(seccionMaterial)?"cuadrado":null,secU:"mm",
    diametro:seccionMaterial==="RND"?numeroExcel(get("diametro")):null,
    alto:["SQ","FLAT"].includes(seccionMaterial)?numeroExcel(get("alto")):null,
    ancho:["SQ","FLAT"].includes(seccionMaterial)?numeroExcel(get("ancho")):null,...extra,noAplica,despachos:[]};
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
  if(!filas.length)throw new Error(`No hay filas válidas para importar. Inválidas: ${invalidos}.`);
  const codigosExistentes=new Set(mats.map(m=>m.codigo.toLocaleLowerCase()));
  const codigosNuevos=new Set(),filasExistentes=filas.filter(m=>codigosExistentes.has(m.codigo.toLocaleLowerCase()));
  filas.forEach(m=>{if(!codigosExistentes.has(m.codigo.toLocaleLowerCase()))codigosNuevos.add(m.codigo.toLocaleLowerCase())});
  const cache=new Map();let ubicacionCreada=false,ubicacionCorregida=false,resolviendoUbicacion=true;
  for(const m of filas){
    const clave=`${m.tipoRegistro}|${String(m.ubicacion).trim().toLowerCase()}`;
    let destino=cache.get(clave);
    if(destino===undefined){
      try{
        resolviendoUbicacion=true;
        destino=await resolverUbicacionRegistro(m.ubicacion,m.tipoRegistro,null);
      }catch(err){
        console.warn("Importación: no se pudo registrar la ubicación",m.ubicacion,err);
        destino=null;
      }
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
  try{
    const items=filas.map(m=>({codigo:m.codigo,material:matData(m),entrada:entradaDesdeMaterial(m)}));
    for(let i=0;i<items.length;i+=50)await registrarEntradas(items.slice(i,i+50));
    await cargar();renderHist();
    toast(`Entradas importadas: ${filas.length} · códigos nuevos: ${codigosNuevos.size} · entradas a códigos existentes: ${filasExistentes.length} · inválidas: ${invalidos}${ubicacionCreada?" · ubicación agregada":""}${ubicacionCorregida?" · código de ubicación corregido":""} ✔`);
  }catch(err){
    errDB(err,resolviendoUbicacion?"No se pudo registrar una de las ubicaciones":ubicacionCreada?"No se pudieron importar todas las entradas; algunas ubicaciones quedaron registradas":"No se pudo importar el Excel");
    await cargar().catch(()=>{});
  }
}
$("fileExcel").onchange=async e=>{
  const file=e.target.files[0];e.target.value="";if(!file)return;
  try{await importarExcel(file)}catch(err){toast(err.message||"No se pudo leer el archivo de Excel",1)}
};
$("fileImp").onchange=e=>{
  if(!esAdmin){e.target.value="";toast("Solo el administrador puede restaurar información.",1);return}
  const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=async()=>{try{
    const a=JSON.parse(r.result);if(!Array.isArray(a))throw 0;let nuevos=0,omit=0,surt=0,entradasImportadas=0,entradasOmitidas=0;
    const antesC=new Set(mats.map(x=>x.codigo.toLowerCase())),antesT=new Set(mats.flatMap(x=>(x.despachos||[]).map(d=>x.codigo.toLowerCase()+"|"+d.t)));
    const entradasExistentes=new Set(mats.flatMap(x=>(x.entradas||[]).map(en=>Number(en.id))));
    const itemsEntradas=[];
    a.forEach(raw=>{
      if(!raw||!raw.codigo){omit++;return}
      const m={...raw};Object.assign(m,normalizarMaterial(m));
      m.codigo=String(m.codigo);m.esMP=!!m.esMP;m.cantidad=Number(m.cantidad)||0;
      m.despachos=Array.isArray(m.despachos)?m.despachos.filter(d=>d&&typeof d==="object"):[];
      m.entradas=Array.isArray(m.entradas)?m.entradas.filter(en=>en&&typeof en==="object"&&Number(en.cantidad)>0):[];
      const ex=mats.find(x=>x.codigo.toLowerCase()===String(m.codigo).toLowerCase());
      if(ex){
        const ids=new Set((ex.despachos||[]).map(d=>d.t));let add=0;
        (m.despachos||[]).forEach(d=>{if(!ids.has(d.t)){(ex.despachos=ex.despachos||[]).push(d);add++}});
        if(add)surt+=add;else omit++;
        const firmas=new Set((ex.entradas||[]).map(firmaEntrada));
        for(const en of m.entradas){
          const normalizada=entradaImportada(m,en),firma=firmaEntrada(normalizada);
          if(firmas.has(firma)){entradasOmitidas++;continue}
          firmas.add(firma);
          itemsEntradas.push({codigo:m.codigo,material:matData(m),entrada:entradaDesdeMaterial(normalizada),oldId:en.id});
        }
        return;
      }
      mats.push(m);nuevos++;
      if(m.entradas.length){
        const firmas=new Set();
        for(const en of m.entradas){
          const normalizada=entradaImportada(m,en),firma=firmaEntrada(normalizada);
          if(firmas.has(firma)){entradasOmitidas++;continue}
          firmas.add(firma);
          itemsEntradas.push({codigo:m.codigo,material:matData(m),entrada:entradaDesdeMaterial(normalizada),oldId:en.id});
        }
      }
    });
    const mapaEntradas=new Map();
    try{
      for(let i=0;i<itemsEntradas.length;i+=50){
        const lote=itemsEntradas.slice(i,i+50);
        const res=await registrarEntradas(lote.map(x=>({codigo:x.codigo,material:x.material,entrada:x.entrada})));
        (res?.entradas||[]).forEach((r,j)=>{const old=lote[j]?.oldId;if(old!=null&&r?.id!=null)mapaEntradas.set(Number(old),Number(r.id))});
      }
      entradasImportadas=itemsEntradas.length;
    }catch(err){errDB(err,"No se pudieron restaurar las entradas del respaldo");await cargar().catch(()=>{});return}
    const msN=mats.filter(m=>!antesC.has(m.codigo.toLowerCase())&&!m.entradas?.length);
    const dsN=mats.flatMap(m=>(m.despachos||[]).filter(d=>d&&d.t!=null&&!antesT.has(m.codigo.toLowerCase()+"|"+d.t)).map(d=>{
      let entrada_id=d.entrada_id;
      if(entrada_id!=null){
        const asignada=mapaEntradas.get(Number(entrada_id));
        if(asignada!=null)entrada_id=asignada;
        else if(!entradasExistentes.has(Number(entrada_id)))entrada_id=null;
      }
      return {codigo:m.codigo,d:{...d,entrada_id}};
    }));
    try{await subirLista(msN,dsN)}catch(err){errDB(err,"No se pudo subir a Supabase");await cargar().catch(()=>{});return}
    await cargar().catch(()=>{});renderHist();
    toast(`Nuevos: ${nuevos} · entradas: ${entradasImportadas}${entradasOmitidas?` (${entradasOmitidas} ya existían)`:""} · surtidos fusionados: ${surt} · sin cambios: ${omit}`);
  }catch(err){toast(err?.message||"Archivo JSON no válido",1)}};
  r.readAsText(f);e.target.value="";
};

