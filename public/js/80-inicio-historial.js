// --- Inicio: tarjetas de alertas (cliente, sobre datos cargados) ---
let filtroEspecial=null;
const FILTROS={sinUbicacion:{nombre:"Sin ubicación",test:m=>!m.ubicacion&&!m.ubicacionCodigo},cero:{nombre:"Existencia ≤ 0",test:m=>existencia(m).rest<=0}};
function aplicarFiltroEspecial(clave){
  filtroEspecial=clave&&FILTROS[clave]?clave:null;
  const chip=$("filtroChip");
  if(chip){chip.hidden=!filtroEspecial;if(filtroEspecial)$("filtroNombre").textContent=FILTROS[filtroEspecial].nombre}
  render();
}
function renderInicio(){
  const sinUbi=mats.filter(m=>!m.ubicacion&&!m.ubicacionCodigo);
  $("homeSinUbiNum").textContent=sinUbi.length;
  $("homeSinUbiLista").innerHTML=sinUbi.slice(0,4).map(m=>`<li><b>${esc(m.codigo)}</b> ${esc(m.descripcion||"")}</li>`).join("")+(sinUbi.length>4?`<li class="home-more">+${sinUbi.length-4} más</li>`:(sinUbi.length?"":`<li class="home-more">Todo asignado</li>`));
  const cero=mats.filter(m=>existencia(m).rest<=0);
  $("homeCeroNum").textContent=cero.length;
  $("homeCeroLista").innerHTML=cero.slice(0,4).map(m=>`<li><b>${esc(m.codigo)}</b> ${esc(existTxt(m))}</li>`).join("")+(cero.length>4?`<li class="home-more">+${cero.length-4} más</li>`:(cero.length?"":`<li class="home-more">Todo en existencia</li>`));
  const movsAll=movs();
  const tras=(movimientosUbicacion||[]).slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const merged=[];
  movsAll.forEach(({m,d})=>merged.push({t:d.t,tipo:"Surtido",desc:`${m.codigo} · ${fmt(d.cantidad||0)} ${m.um}`,fecha:d.fecha,clase:"sur"}));
  tras.forEach(x=>merged.push({t:new Date(x.created_at).getTime(),tipo:"Traspaso",desc:`${x.codigo_material} → ${x.ubicacion_nueva||""}`,fecha:new Date(x.created_at).toLocaleString("es-MX"),clase:"tr"}));
  merged.sort((a,b)=>b.t-a.t);
  $("homeMovimientosNum").textContent=merged.length;
  $("homeMovimientosLista").innerHTML=merged.slice(0,5).map(x=>`<li><span class="home-mov-tag ${x.clase}">${x.tipo}</span><span class="home-mov-desc">${esc(x.desc)}</span></li>`).join("")||`<li class="home-more">Sin movimientos aún</li>`;
  const tHoy=new Date().setHours(0,0,0,0);
  const hoyMovs=movsAll.filter(({d})=>d.t>=tHoy);
  $("homeHoyNum").textContent=hoyMovs.length;
  $("homeHoyLista").innerHTML=hoyMovs.slice(0,4).map(({m,d})=>`<li><b>${esc(m.codigo)}</b> · ${esc(d.folio||folioSalida(d.t))}</li>`).join("")+(hoyMovs.length>4?`<li class="home-more">+${hoyMovs.length-4} más</li>`:(hoyMovs.length?"":`<li class="home-more">Sin surtidos hoy</li>`));
}
function pesoSurtido(m,d){
  const u=d.pesoU||pesoUnidad(m);
  if(d.pesoSurtido!=null&&["LB","KG"].includes(u))return{peso:Number(d.pesoSurtido),u};
  if(d.modo==="longitud"){
    const e=existencia(m);
    return pesoEquivalente(m,longitudEnBase(d,e.u),e.total);
  }
  return null;
}
function surTxt(m,d){
  const base=d.modo==="longitud"?`${fmt(d.longitud)} ${d.unidad} ≈ ${fmt(d.piezasEq)} pz`:`${fmt(d.cantidad)} ${m.um}`;
  const peso=d.modo==="longitud"?pesoSurtido(m,d):null;
  return base+(peso?` · ≈ ${fmt(peso.peso)} ${peso.u}`:"")+(d.piezas&&d.piezas.length?` (pzas ${d.piezas.join(",")})`:"");
}
function imprimirSalida(m,d){
  imprimirSalidaGrupo([{m,d}],d.folio||folioSalida(d.t));
}
function imprimirSalidaGrupo(items,folio){
  if(!items.length)return;
  const {d:base}=items[0];
  const encabezados=[
    ["Fecha y hora",base.fecha],["Orden de producción",base.orden],
    ["Máquina / línea",base.maquina],["Motivo / uso",base.motivo]
  ];
  const renglones=items.map(({m,d})=>{
    const p=d.modo==="longitud"?pesoSurtido(m,d):null;
    const surtido=d.modo==="longitud"?`${fmt(d.longitud)} ${d.unidad} (${fmt(d.piezasEq)} pz eq.)`:`${fmt(d.cantidad)} ${m.um}`;
    const despues={...m,despachos:[...(m.despachos||[]).filter(x=>x.t!==d.t),d]},rest=existencia(despues);
    const restL=d.existenciaRestante??rest.rest,restU=d.existenciaUnidad||rest.u;
    const restPeso=d.pesoRestante!=null?{peso:d.pesoRestante,u:d.pesoRestanteU}:rest.peso;
    const restantes=`${fmt(restL)} ${restU}${restPeso?` (≈ ${fmt(restPeso.peso)} ${restPeso.u})`:""}`;
    const material=d.material||m;
    return`<tr><td>${esc(material.codigo)}</td><td>${esc(nombreTipoRegistro(material.tipoRegistro||(m.esMP?"MP":"GENERAL")))}</td><td>${esc(material.descripcion)}</td>
      <td>${esc([material.lote,material.numeroHeat].filter(Boolean).join(" / ")||"—")}</td>
      <td>${esc([material.seccionMaterial,material.especificacionMedida].filter(Boolean).join(" · ")||"—")}</td>
      <td>${esc(material.ubicacion||"—")}</td><td>${esc(surtido)}</td>
      <td>${esc(p?`${fmt(p.peso)} ${p.u}`:"—")}</td><td>${esc(restantes)}</td></tr>`;
  }).join("");
  $("salidaView").innerHTML=`<article class="salida">
    <div class="salida-top"><div><h1>Comprobante de salida de materiales</h1><div>Trazabilidad de materiales · Surtido a Producción</div></div><div class="salida-meta"><div class="doc-code">Doc-N-FAL-0102R0</div><div class="folio">Folio ${esc(folio)}</div></div></div>
    <h2>Datos de la salida</h2><table class="datos"><tbody>${encabezados.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v||"—")}</td></tr>`).join("")}
      <tr><th>Entrega · Almacén</th><td>${esc(base.entrega||"—")}</td></tr><tr><th>Recibe · Producción</th><td>${esc(base.recibe||"—")}</td></tr></tbody></table>
    <h2>Materiales surtidos · ${items.length} renglón(es)</h2><table class="renglones"><colgroup><col style="width:10%"><col style="width:10%"><col style="width:21%"><col style="width:10%"><col style="width:12%"><col style="width:8%"><col style="width:9%"><col style="width:8%"><col style="width:12%"></colgroup><thead><tr><th>Código</th><th>Clasificación</th><th>Descripción</th><th>Lote /<br>Heat</th><th>Sección /<br>especificación</th><th>Ubicación</th><th>Surtido</th><th>Peso eq.</th><th>Existencia<br>restante</th></tr></thead><tbody>${renglones}</tbody></table>
    <h2>Observaciones</h2><div class="salida-nota">${esc(base.observaciones||"")}</div>
    <div class="firmas"><div><div class="firma-linea"></div><div>Firma de quien entrega · Almacén ${esc(base.entrega||"")}</div></div>
    <div><div class="firma-linea"></div><div>Firma de quien recibe · Producción ${esc(base.recibe||"")}</div></div></div>
    <p class="salida-pie">Conserve este comprobante como evidencia de entrega. El folio identifica todos los movimientos agrupados en esta salida.</p>
  </article>`;
  $("salidaView").hidden=false;
  const estiloImpresion=document.createElement("style");
  estiloImpresion.textContent="@page salida{size:A4 portrait;margin:8mm}";
  document.head.append(estiloImpresion);
  const tituloAnterior=document.title;
  document.title=folio;
  try{window.print()}
  finally{$("salidaView").hidden=true;estiloImpresion.remove();document.title=tituloAnterior}
}
function imprimirFolio(folio){
  const items=movs().filter(({d})=>(d.folio||folioSalida(d.t))===folio);
  if(items.length)imprimirSalidaGrupo(items,folio);
}
function renderHist(){
  let L=movs().slice(0,100);
  if(filtroHoy){const hoy=new Date().setHours(0,0,0,0);L=L.filter(({d})=>d.t>=hoy)}
  const groups=new Map();
  L.forEach(row=>{
    const order=String(row.d.orden||"").trim(),key=order?`orden:${order.toLocaleLowerCase()}`:`sin-orden:${row.m.codigo}:${row.d.t}`;
    if(!groups.has(key))groups.set(key,{orden:order,items:[]});
    groups.get(key).items.push(row);
  });
  $("hBody").innerHTML=[...groups.values()].map(g=>{
    const materiales=new Set(g.items.map(({m})=>m.codigo)),ultima=g.items[0].d.fecha||"";
    const detalles=g.items.map(({m,i,j,d})=>`<tr><td>${esc(d.fecha)}</td><td><b>${esc(m.codigo)}</b><br><small>${esc(d.folio||folioSalida(d.t))}</small></td><td>${esc(surTxt(m,d))}</td><td><button type="button" class="ic" data-action="pdf" data-folio="${esc(d.folio||folioSalida(d.t))}" title="PDF / Imprimir salida completa">📄</button>${esAdmin?` <button type="button" class="ic" data-action="anular" data-i="${i}" data-j="${j}" title="Anular este renglón">↩️</button>`:""}</td></tr>`).join("");
    return`<details class="sur-group"><summary><span class="sur-date">${esc(ultima)}</span><span class="sur-order">Orden: ${esc(g.orden||"Sin orden")}</span><span class="sur-count">${g.items.length} surtido(s) · ${materiales.size} material(es)</span></summary>
      <div class="sur-group-body"><table><thead><tr><th>Fecha</th><th>Código / folio</th><th>Surtido</th><th>Acciones</th></tr></thead><tbody>${detalles}</tbody></table></div></details>`;
  }).join("");
  $("hVacio").hidden=L.length>0;
}
$("hBody").addEventListener("click",async e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.action==="pdf"){imprimirFolio(b.dataset.folio);return}
  if(!esAdmin){toast("Solo el administrador puede anular surtidos.",1);return}
  const m=mats[+b.dataset.i],d=m.despachos[+b.dataset.j];
  if(confirm(`¿Anular el surtido de ${m.codigo} (${surTxt(m,d)})? La existencia se restituye.`)){try{const{error}=await sb.from("despachos").delete().eq("codigo",m.codigo).eq("t",d.t);if(error)throw error;await cargar();renderHist();renderSur();toast("Surtido anulado")}catch(err){errDB(err,"No se pudo anular")}}
});
$("bCsvS").onclick=()=>{
  if(!esAdmin){toast("Solo el administrador puede exportar información.",1);return}
  const c=v=>{let t=String(v??"");if(/^[=+\-@\t\r]/.test(t))t="'"+t;return `"${t.replace(/"/g,'""')}"`};
  const f=movs().map(({m,d})=>{const p=d.modo==="longitud"?pesoSurtido(m,d):null;return[d.folio||folioSalida(d.t),d.fecha,d.orden,d.entrega,d.recibe,d.maquina,d.motivo,d.observaciones,m.codigo,m.descripcion,d.modo,d.cantidad,m.um,d.longitud??"",d.unidad??"",p?.peso??"",p?.u??"",(d.piezas||[]).join(" ")].map(c).join(",")});
  bajar("surtidos.csv","\ufeff"+["folio,fecha,orden,entrega,recibe,maquina,motivo,observaciones,codigo,descripcion,modo,cantidad,um,longitud,unidad,peso_equivalente,peso_um,piezas",...f].join("\r\n"),"text/csv;charset=utf-8");toast("CSV exportado ⬇️");
};

