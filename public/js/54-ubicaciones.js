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
