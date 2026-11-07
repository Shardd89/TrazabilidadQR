// --- Surtido ---
const FAC={mm:1,cm:10,m:1000,in:25.4};
const r4=n=>Math.round(n*1e4)/1e4;
function okU(u){return Object.prototype.hasOwnProperty.call(FAC,u)}
function longBase(m){
  const individual=Number(m.longitudIndividual);
  if(Number.isFinite(individual)&&individual>0)return{L:individual,u:"mm"};
  const L=Number(m.longitud),u0=m.longU||m.longitudUnidad;
  return{L,u:okU(u0)?u0:"mm"};
}
function modoLong(m){return m.esMP&&m.um==="PZ"&&longBase(m).L>0}
function longitudEnBase(d,u){
  const longitud=Number(d.longitud)||0,unidad=okU(d.unidad)?d.unidad:u;
  return longitud*FAC[unidad]/FAC[u];
}
function pesoUnidad(m){const u=m.pesoU||m.pesoUnidad;return m.peso!=null&&!m.pesoUnidadPendiente&&Number.isFinite(Number(m.peso))&&Number(m.peso)>=0&&["LB","KG"].includes(u)?u:""}
function pesoEquivalente(m,longitud,total){
  const u=pesoUnidad(m),peso=Number(m.peso);
  return u&&total>0&&Number.isFinite(peso)?{peso:r4(peso*longitud/total),u}:null;
}
function ajustesEnBase(m,u){
  return(m.ajustesInventario||[]).reduce((s,a)=>{
    const du=String(a.unidad||"");
    if(!FAC[du])return s;
    return s+Number(a.diferencia||0)*FAC[du]/FAC[u];
  },0);
}
function existenciaLocal(m){
  const ds=m.despachos||[];
  if(modoLong(m)){
    const{L,u}=longBase(m),total=m.cantidad*L;
    const surtido=ds.reduce((s,d)=>s+longitudEnBase(d,u),0),rest=r4(total-surtido+ajustesEnBase(m,u));
    return{modo:"long",u,L,total,rest,qty:L>0?r4(rest/L):0,peso:pesoEquivalente(m,rest,total)};
  }
  const ajustes=(m.ajustesInventario||[]).reduce((s,a)=>s+(!a.unidad||a.unidad==="PZ"?Number(a.diferencia||0):0),0);
  return{modo:"pz",u:m.um,rest:r4(m.cantidad-ds.reduce((s,d)=>s+(Number(d.cantidad)||0),0)+ajustes)};
}
function existencia(m){
  const s=m.existenciaServer;
  if(s&&s.modo){
    const total=Number(s.total)||0,rest=r4(Number(s.existencia)||0);
    if(s.modo==="longitud"){
      const L=Number(s.longitud_base)||longBase(m).L;
      return{modo:"long",u:s.unidad||"mm",L,total,rest,qty:L>0?r4(rest/L):0,peso:pesoEquivalente(m,rest,total)};
    }
    return{modo:"pz",u:s.unidad||m.um,rest};
  }
  return existenciaLocal(m);
}
function existTxt(m){const e=existencia(m);return e.modo==="long"?`${fmt(e.rest)} ${e.u} (≈${fmt(e.qty)} pz)${e.peso?` · ${fmt(e.peso.peso)} ${e.peso.u}`:""}`:`${fmt(e.rest)} ${e.u}`}
let surItems=[],nextSurItem=1,stream=null,scanning=false,modoEscaneo="surtido",scanCooldown=new Map(),camMsgT=null;
// Borrador de surtido (sessionStorage) y últimos datos capturados (localStorage)
const K_SUR_BORRADOR="trazabilidad_sur_borrador_v1",K_SUR_DATOS="trazabilidad_sur_datos_v1";
const CAMPOS_SUR=["orden","entrega","recibe","maquina","motivo","observaciones"];
const LISTAS_SUR={entrega:"surEntregaList",recibe:"surRecibeList",maquina:"surMaquinaList"};
let surBorradorT=null,surDatosT=null,filtroHoy=false;
// El campo de máquina/línea del surtido es #area; se acepta #maquina si existe.
function campoSur(id){const el=$(id);if(el)return el;return id==="maquina"?$("area"):null}
function leerGuardado(clave,esSesion){
  try{const v=JSON.parse((esSesion?sessionStorage:localStorage).getItem(clave)||"null");return v&&typeof v==="object"?v:null}catch{return null}
}
function valoresSur(){const o={};CAMPOS_SUR.forEach(id=>{const el=campoSur(id);o[id]=el?el.value:""});return o}
function guardarBorradorSur(){try{sessionStorage.setItem(K_SUR_BORRADOR,JSON.stringify({items:surItems,next:nextSurItem,campos:valoresSur()}))}catch{}}
function programarGuardarSur(){clearTimeout(surBorradorT);surBorradorT=setTimeout(guardarBorradorSur,300)}
function limpiarBorradorSur(){clearTimeout(surBorradorT);try{sessionStorage.removeItem(K_SUR_BORRADOR)}catch{}}
function restaurarBorradorSur(){
  const b=leerGuardado(K_SUR_BORRADOR,true);if(!b)return;
  const campos=b.campos&&typeof b.campos==="object"?b.campos:{};
  CAMPOS_SUR.forEach(id=>{const el=campoSur(id);if(el&&typeof campos[id]==="string")el.value=campos[id]});
  const items=(Array.isArray(b.items)?b.items:[]).filter(it=>it&&it.codigo&&mats.some(m=>m.codigo.toLowerCase()===String(it.codigo).toLowerCase()));
  surItems=items;
  nextSurItem=Math.max(Number(b.next)||1,items.reduce((s,it)=>Math.max(s,Number(it.id)||0),0)+1);
  if(!items.length&&!CAMPOS_SUR.some(id=>campos[id]))limpiarBorradorSur();
  renderSur();
}
function datosSur(){const d=leerGuardado(K_SUR_DATOS,false)||{},o={};Object.keys(LISTAS_SUR).forEach(id=>{o[id]=Array.isArray(d[id])?d[id].filter(x=>typeof x==="string"&&x.trim()):[]});return o}
function guardarDatosSur(){
  try{
    const d=datosSur();
    Object.keys(LISTAS_SUR).forEach(id=>{
      const el=campoSur(id),v=el?el.value.trim():"";
      const vals=[...new Set([...(v?[v]:[]),...d[id]])].slice(0,8);
      d[id]=vals;
      const dl=$(LISTAS_SUR[id]);if(dl)dl.innerHTML=vals.map(x=>`<option value="${esc(x)}"></option>`).join("");
    });
    localStorage.setItem(K_SUR_DATOS,JSON.stringify(d));
  }catch{}
}
function programarGuardarDatosSur(){clearTimeout(surDatosT);surDatosT=setTimeout(guardarDatosSur,300)}
CAMPOS_SUR.forEach(id=>{const el=campoSur(id);if(el)el.addEventListener("input",()=>{programarGuardarSur();if(LISTAS_SUR[id])programarGuardarDatosSur()})});
guardarDatosSur();

document.querySelectorAll("#vInicio .home-card").forEach(b=>b.onclick=()=>{
  const ir=v=>document.querySelector(`.tab[data-v="${v}"]`).click();
  const a=b.dataset.home;
  if(a==="sinUbicacion"){ir("vReg");aplicarFiltroEspecial("sinUbicacion")}
  else if(a==="cero"){ir("vReg");aplicarFiltroEspecial("cero")}
  else if(a==="movimientos"){ir("vInv");activarSubpantalla("vInv","asignar")}
  else if(a==="surtidosHoy"){ir("vSur");activarSubpantalla("vSur","historial");aplicarFiltroHoy(true)}
});
const buscarEl=$("buscar");
if(buscarEl)buscarEl.addEventListener("input",()=>{if(filtroEspecial)aplicarFiltroEspecial(null)});
if($("filtroQuitar"))$("filtroQuitar").onclick=()=>aplicarFiltroEspecial(null);
if($("histHoyQuitar"))$("histHoyQuitar").onclick=()=>aplicarFiltroHoy(false);
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tab").forEach(x=>{x.classList.toggle("on",x===b);if(x===b)x.setAttribute("aria-current","page");else x.removeAttribute("aria-current")});
  const vista=b.dataset.v;
  $("vInicio").hidden=vista!=="vInicio";
  $("vReg").hidden=vista!=="vReg";$("vSur").hidden=vista!=="vSur";$("vInv").hidden=vista!=="vInv";
  if(vista!=="vInv")limpiarConsultaUbicacion();
  if(vista==="vInicio"){camOff();renderInicio();actualizarHashNavegacion("vInicio")}else if(vista==="vSur"){activarSubpantalla("vSur","preparar");modoEscaneo="surtido";renderSur();renderHist();enfocar()}else{camOff();if(vista==="vInv"){activarSubpantalla("vInv","existencias");modoEscaneo="inventario";renderInventario();renderUbicaciones();renderHistUbicaciones();renderAsignacion()}else{activarSubpantalla("vReg","captura");modoEscaneo="surtido";render()}}
});
const MAPA_SUBPANTALLAS={vInv:{existencias:["existencias"],almacenes:["almacenes","ubicaciones"],asignar:["asignar","historial"]}};
function aplicarFiltroHoy(encender){
  filtroHoy=!!encender;
  const chip=$("histHoyChip");if(chip)chip.hidden=!filtroHoy;
  renderHist();
}
function activarSubpantalla(modulo,pagina){
  const vista=$(modulo);if(!vista)return;
  const visibles=MAPA_SUBPANTALLAS[modulo]?.[pagina]||[pagina];
  vista.querySelectorAll("[data-module-screen]").forEach(panel=>{panel.hidden=!visibles.includes(panel.dataset.moduleScreen)&&!(modulo==="vReg"&&(pagina==="captura"||pagina==="historial")&&panel.dataset.moduleScreen==="qr")});
  vista.querySelectorAll(".section-tab").forEach(b=>{if(b.dataset.page===pagina)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  if(modulo==="vInv"){
    if(pagina==="almacenes"){renderAlmacenes();renderUbicaciones();}
    if(pagina==="asignar"){renderAsignacion();renderHistUbicaciones();}
    if(pagina==="existencias"){renderInventario();}
    if(pagina!=="asignar"&&modoEscaneo==="inventario")camOff();
  }
  if(modulo==="vSur"&&pagina!=="preparar")camOff();
  actualizarHashNavegacion(modulo,pagina);
}
document.querySelectorAll(".section-tab").forEach(b=>b.onclick=()=>activarSubpantalla(b.dataset.module,b.dataset.page));
function enfocar(){if(matchMedia("(pointer:fine)").matches)$("scanIn").focus()}

function conteosSurtido(){
  const matsUnicos=new Set(surItems.map(x=>String(x.codigo||"").toLowerCase())).size;
  const piezas=surItems.reduce((n,x)=>n+((x.piezas||[]).length),0);
  return{materiales:matsUnicos,piezas};
}
function camPanelUpdate(){
  const foot=$("camFoot");
  if(modoEscaneo!=="surtido"){foot.hidden=true;return}
  const{materiales,piezas}=conteosSurtido();
  $("camContMat").textContent=`${materiales} ${materiales===1?"material":"materiales"}`;
  $("camContPz").textContent=`${piezas} ${piezas===1?"pieza escaneada":"piezas escaneadas"}`;
  foot.hidden=false;
}
function camUltimo(txt){
  const box=$("camUltimo");if(!box)return;
  const t=String(txt||"");box.textContent=`Último: ${t.length>70?t.slice(0,70)+"…":t}`;box.title=t;
}
function camAvisoSc(txt,tipo){
  const box=$("camMsg");if(!box)return;
  clearTimeout(camMsgT);box.classList.toggle("ok",tipo==="ok");box.textContent=txt;box.hidden=false;
  navigator.vibrate&&navigator.vibrate(tipo==="ok"?[60]:[70,50,70]);
  camMsgT=setTimeout(()=>{box.hidden=true;box.classList.remove("ok")},4000);
}
function escanear(txt){
  if(modoEscaneo==="ubiConsulta"){procesarEscaneoUbiConsulta(txt);return}
  if(modoEscaneo==="inventario"){procesarEscaneoInventario(txt);return}
  const cod=codDe(txt).toLowerCase();
  if(modoEscaneo==="registro"){
    camOff();
    const material=mats.find(m=>m.codigo.toLowerCase()===cod);
    if(!material){toast(cod?`Código no registrado: ${cod}`:"El QR no contiene un código de material válido.",1);return}
    mostrar(material);
    $("vReg").querySelector('[data-module-screen="qr"]').scrollIntoView({behavior:"smooth",block:"start"});
    toast(`Material encontrado: ${material.codigo}`);return
  }
  const i=mats.findIndex(m=>m.codigo.toLowerCase()===cod);
  if(i<0){camUltimo(txt);camAvisoSc(cod?`Código no registrado: ${cod}`:"El QR no contiene un código de material válido.");return}
  const pz=pzDe(txt);if(pz){escanearPieza(i,pz.n,txt);return}
  camUltimo(txt);
  agregarSurItem(i);renderSur();
}
// Los QR de pieza se acumulan en un solo renglón por material y no permiten duplicados.
function escanearPieza(i,n,txt){
  const m=mats[i];
  camUltimo(txt||String(n));
  if(!esIndividual(m)||n<1||n>m.cantidad){camAvisoSc(`Pieza ${n} no válida para ${m.codigo}`);return}
  if(piezasSurt(m).has(n)){camAvisoSc(`⚠ La pieza ${n}/${m.cantidad} de ${m.codigo} ya fue surtida`);return}
  if(surItems.some(x=>x.codigo.toLowerCase()===m.codigo.toLowerCase()&&x.piezas?.includes(n))){camAvisoSc(`La pieza ${n} ya está en el surtido actual`);return}
  agregarSurItem(i,n);renderSur();
}
// Ajusta cantidad/longitud del renglón según las piezas escaneadas.
function recalcularPiezasSur(item,m){
  const e=existencia(m),n=item.piezas?.length||0;
  if(e.modo==="long"){item.longitud=String(r4(n*e.L));item.unidad=e.u}
  else item.longitud="";
  item.cantidad=n;
}
function agregarSurItem(i,pieza=null){
  const m=mats[i],e=existencia(m);
  if(pieza!=null){
    const clave=m.codigo.toLowerCase();
    let item=surItems.find(x=>x.codigo.toLowerCase()===clave&&x.piezas?.length);
    if(!item){
      item={id:nextSurItem++,codigo:m.codigo,cantidad:1,longitud:e.modo==="long"?String(e.L):"",unidad:e.modo==="long"?e.u:"",piezas:[]};
      surItems.push(item);
    }
    if(!item.piezas.includes(pieza)){
      item.piezas.push(pieza);
      item.piezas.sort((a,b)=>a-b);
    }
    recalcularPiezasSur(item,m);
  }else{
    surItems.push({id:nextSurItem++,codigo:m.codigo,cantidad:1,longitud:"",unidad:e.modo==="long"?e.u:"",piezas:[]});
  }
  programarGuardarSur();
}
const sc=$("scanIn");let sT,ubiScanT;
sc.addEventListener("input",()=>{clearTimeout(sT);if(/Código:/.test(sc.value)||/#[dc]=/.test(sc.value)||(modoEscaneo==="ubiConsulta"&&/^TRAZABILIDAD/i.test(sc.value)))sT=setTimeout(()=>{if(sc.value){escanear(sc.value);sc.value=""}},250)});
sc.addEventListener("keydown",e=>{
  if(e.key!=="Enter"||e.shiftKey)return;const v=sc.value.trim();
  if(!v||(/^TRAZABILIDAD/i.test(v)&&modoEscaneo!=="ubiConsulta"))return;
  e.preventDefault();clearTimeout(sT);escanear(v);sc.value="";
});
$("ubiScan").addEventListener("input",()=>{clearTimeout(ubiScanT);if($("ubiScan").value.includes("TRAZABILIDAD-UBICACION:")||/#[dc]=/.test($("ubiScan").value))ubiScanT=setTimeout(manejarLectorUbicacion,250)});

// Cámara (BarcodeDetector si existe; si no, jsQR)
let det=null,audioCtx=null,wake=null,torchOn=false,busy=false,tUlt=0,txtUlt="",vistoUlt=0;
try{if("BarcodeDetector" in window)det=new BarcodeDetector({formats:["qr_code"]})}catch{}
function compacto(){try{return localStorage.getItem("qr_compacto2")!=="0"}catch{return true}}
$("qrCompacto").checked=compacto();
$("qrCompacto").onchange=()=>{try{localStorage.setItem("qr_compacto2",$("qrCompacto").checked?"1":"0")}catch{}if(actual)mostrar(actual)};
if(!window.isSecureContext||!navigator.mediaDevices){$("camAviso").hidden=false;$("invCamAviso").hidden=false;$("regCamAviso").hidden=false}
if(matchMedia("(pointer:fine)").matches)$("manual").open=true;
function feedback(){
  navigator.vibrate&&navigator.vibrate(60);
  if(audioCtx){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=880;g.gain.value=.15;o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.09)}
  const w=$("camWrap");w.classList.add("ok");setTimeout(()=>w.classList.remove("ok"),300);
}
async function camOn(){
  if(!window.isSecureContext||!navigator.mediaDevices){$("camAviso").hidden=false;$("invCamAviso").hidden=false;$("regCamAviso").hidden=false;toast("La cámara en vivo requiere HTTPS",1);return}
  try{
    audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},audio:false});
    const tr=stream.getVideoTracks()[0],cap=tr.getCapabilities?tr.getCapabilities():{};
    if(cap.focusMode&&cap.focusMode.includes("continuous"))tr.applyConstraints({advanced:[{focusMode:"continuous"}]}).catch(()=>{});
    torchOn=false;$("bTorch").hidden=!cap.torch;
    $("video").srcObject=stream;await $("video").play();$("camWrap").hidden=false;scanning=true;$("bCam").textContent="⏹ Detener cámara";$("bCamInv").textContent="⏹ Detener cámara";$("bCamReg").textContent="⏹ Detener cámara";
    const msgBox=$("camMsg");msgBox.hidden=true;msgBox.classList.remove("ok");
    camPanelUpdate();
    try{wake=await navigator.wakeLock.request("screen")}catch{}
    bucle();
  }catch(e){toast(e.name==="NotAllowedError"?"Permiso de cámara denegado. Actívelo en los ajustes del navegador.":"No se pudo abrir la cámara.",1)}
}
function camOff(){scanning=false;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;if(wake){wake.release().catch(()=>{});wake=null}clearTimeout(camMsgT);const msgBox=$("camMsg");if(msgBox){msgBox.hidden=true;msgBox.classList.remove("ok")}const foot=$("camFoot");if(foot)foot.hidden=true;$("camWrap").hidden=true;$("bCam").textContent="📷 Escanear con cámara";$("bCamInv").textContent="📷 Escanear ubicación y materiales";$("bCamReg").textContent="📷 Escanear código y ver información"}
$("bCam").onclick=()=>{if(scanning){camOff();return}modoEscaneo="surtido";camOn()};
$("bCamInv").onclick=()=>{if(scanning){camOff();return}modoEscaneo="inventario";camOn()};
$("bCamReg").onclick=()=>{if(scanning){camOff();return}modoEscaneo="registro";camOn()};
$("bCamClose").onclick=camOff;
$("bTorch").onclick=()=>{torchOn=!torchOn;stream.getVideoTracks()[0].applyConstraints({advanced:[{torch:torchOn}]}).catch(()=>toast("Linterna no disponible",1))};
document.addEventListener("visibilitychange",()=>{if(document.hidden)camOff()});
async function leer(v){
  if(det){try{const r=await det.detect(v);return r[0]?r[0].rawValue:null}catch{det=null}}
  const w=Math.min(v.videoWidth,1100),hh=Math.round(v.videoHeight*w/v.videoWidth),cv=$("camCv");
  cv.width=w;cv.height=hh;const x=cv.getContext("2d",{willReadFrequently:true});x.drawImage(v,0,0,w,hh);
  const r=jsQR(x.getImageData(0,0,w,hh).data,w,hh,{inversionAttempts:"dontInvert"});return r&&r.data}
function bucle(){
  if(!scanning)return;const v=$("video"),now=Date.now();
  if(!busy&&v.readyState===4&&now-tUlt>120){busy=true;tUlt=now;
    leer(v).then(t=>{
      const n=Date.now();
      if(t){vistoUlt=n;if(t!==txtUlt&&n-(scanCooldown.get(t)||0)>=1500){scanCooldown.set(t,n);txtUlt=t;feedback();escanear(t)}}
      else if(n-vistoUlt>700)txtUlt=""}).catch(()=>{}).finally(()=>{busy=false})}
  requestAnimationFrame(bucle);
}
// Panel de surtido
function renderSur(){
  const P=$("sPanel");
  if(!surItems.length){P.innerHTML='<div class="empty">Escanee los QR de los materiales para agregarlos a la salida</div>';return}
  let h="";
  h+=surItems.map((item,n)=>{
    const m=mats.find(x=>x.codigo.toLowerCase()===item.codigo.toLowerCase());if(!m)return"";
    const e=existencia(m),lote=m.numeroLoteMP||m.lote||"";
    return`<section class="mp"><div class="sur-item-head"><b>${n+1}. ${esc(m.codigo)} · ${esc(m.descripcion)}</b><button type="button" class="bd" data-quitar="${item.id}">Quitar</button></div>
      ${lote||m.numeroHeat?`<small class="sur-item-meta">Lote / Heat: ${esc([lote,m.numeroHeat].filter(Boolean).join(" / "))}</small>`:""}
      <div class="sur-item-qty"><span><b>Existencia actual:</b> ${esc(existTxt(m))}</span>
      ${e.modo==="long"?`<div class="sur-entry"><label for="sLen-${item.id}">Longitud (pieza de ${esc(fmt(e.L))} ${esc(e.u)})</label><input type="number" id="sLen-${item.id}" min="0" step="any" inputmode="decimal" placeholder="Longitud" value="${esc(item.longitud)}"><select id="sU-${item.id}">${["mm","cm","m","in"].map(u=>`<option value="${u}"${(item.unidad||e.u)===u?" selected":""}>${u}</option>`).join("")}</select></div>`:
      `<label class="sur-entry"><span>Cantidad (${esc(m.um)})</span><input type="number" id="sCnt-${item.id}" min="0" step="any" value="${esc(item.cantidad)}"${item.piezas?.length?' readonly title="Se calcula con las piezas escaneadas"':""}></label>`}</div>
      ${item.piezas?.length?`<div class="sur-chips" aria-label="Piezas escaneadas">${item.piezas.map(n=>`<span class="sur-chip">Pieza ${esc(n)}<button type="button" data-quitar-pieza="${esc(n)}" data-item="${item.id}" aria-label="Quitar pieza ${esc(n)}" title="Quitar pieza ${esc(n)}">✕</button></span>`).join("")}</div>`:""}
      <div class="res" id="sItemRes-${item.id}"></div></section>`;
  }).join("");
  h+=`<div class="res" id="sRes"></div><div class="acts sur-actions"><button type="button" class="bp" id="sOk">✅ Confirmar salida múltiple</button><button type="button" class="bd" id="sNo">Vaciar salida</button></div>`;
  P.innerHTML=h;
  surItems.forEach(item=>{
    const len=$(`sLen-${item.id}`),unit=$(`sU-${item.id}`),cnt=$(`sCnt-${item.id}`);
    if(len)len.oninput=()=>{item.longitud=len.value;programarGuardarSur();calcSur()};
    if(unit)unit.onchange=()=>{item.unidad=unit.value;programarGuardarSur();calcSur()};
    if(cnt)cnt.oninput=()=>{item.cantidad=Number(cnt.value);programarGuardarSur();calcSur()};
  });
  P.querySelectorAll("[data-quitar]").forEach(b=>b.onclick=()=>{surItems=surItems.filter(x=>x.id!==Number(b.dataset.quitar));programarGuardarSur();renderSur()});
  P.querySelectorAll("[data-quitar-pieza]").forEach(b=>b.onclick=()=>{
    const item=surItems.find(x=>x.id===Number(b.dataset.item));if(!item)return;
    item.piezas=(item.piezas||[]).filter(x=>x!==Number(b.dataset.quitarPieza));
    if(!item.piezas.length)surItems=surItems.filter(x=>x!==item);
    else{const m=mats.find(x=>x.codigo.toLowerCase()===item.codigo.toLowerCase());if(m)recalcularPiezasSur(item,m)}
    programarGuardarSur();renderSur();
  });
  $("sNo").onclick=()=>{surItems=[];limpiarBorradorSur();renderSur();enfocar()};$("sOk").onclick=confirmarSur;calcSur();camPanelUpdate();
}
function calcSur(){
  const totalPorCodigo=new Map(),salidas=[],errores=[];
  surItems.forEach(item=>{
    const m=mats.find(x=>x.codigo.toLowerCase()===item.codigo.toLowerCase());
    if(!m){errores.push(`${esc(item.codigo)} ya no está registrado`);return}
    const e=existencia(m),anterior=totalPorCodigo.get(m.codigo.toLowerCase())||0;
    if(item.errorPieza){errores.push(`${esc(m.codigo)}: una pieza seleccionada ya fue surtida`);return}
    let d=null,html="";
    if(e.modo==="long"){
      const len=Number(item.longitud)||0,u=okU(item.unidad)?item.unidad:e.u;
      const lr=r4(len*FAC[u]/FAC[e.u]),disponible=r4(e.rest-anterior),quedan=r4(disponible-lr);
      if(len<=0){html="Capture la longitud a surtir."}
      else if(quedan<0){html=`⚠ Excede la existencia disponible para este renglón (${fmt(disponible)} ${esc(e.u)}).`;errores.push(`${esc(m.codigo)}: longitud total excedida`)}
      else{
        const peso=pesoEquivalente(m,lr,e.total),pesoRest=pesoEquivalente(m,quedan,e.total);
        const piezas=item.piezas?.length===r4(lr/e.L)?item.piezas.slice():undefined;
        d={modo:"longitud",longitud:lr,unidad:e.u,cantidad:r4(lr/e.L),piezasEq:r4(lr/e.L),...(piezas?{piezas}:{}),...(peso?{pesoSurtido:peso.peso,pesoU:peso.u}:{})};
        html=`Surtir: <b>${fmt(lr)} ${esc(e.u)}</b>${peso?` · ≈ ${fmt(peso.peso)} ${peso.u}`:""}<br>Restante después de este renglón: ${fmt(quedan)} ${esc(e.u)}${pesoRest?` · ≈ ${fmt(pesoRest.peso)} ${pesoRest.u}`:""}`;
        if(!piezas&&item.piezas?.length)html+=`<br><small class="sur-item-meta">⚠ La longitud no coincide con ${item.piezas.length} pieza(s) de ${fmt(e.L)} ${esc(e.u)}; las piezas escaneadas no se marcarán como surtidas.</small>`;
        totalPorCodigo.set(m.codigo.toLowerCase(),anterior+lr);
      }
    }else{
      const qty=Number(item.cantidad)||0,disponible=r4(e.rest-anterior),quedan=r4(disponible-qty);
      if(qty<=0){html="Indique una cantidad mayor que cero."}
      else if(quedan<0){html=`⚠ Excede la existencia disponible para este renglón (${fmt(disponible)} ${esc(e.u)}).`;errores.push(`${esc(m.codigo)}: cantidad total excedida`)}
      else{
        d={modo:"pieza",cantidad:qty,...(item.piezas?.length===qty?{piezas:item.piezas.slice()}:{})};
        html=`Surtir: <b>${fmt(qty)} ${esc(e.u)}</b><br>Restante después de este renglón: ${fmt(quedan)} ${esc(e.u)}`;
        totalPorCodigo.set(m.codigo.toLowerCase(),anterior+qty);
      }
    }
    const R=$(`sItemRes-${item.id}`);if(R){R.innerHTML=html;R.classList.toggle("bad",!d)}
    item.d=d;
    if(d)salidas.push({item,m,d});
  });
  const R=$("sRes");
  if(R){R.innerHTML=errores.length?`⚠ Revise antes de confirmar:<br>${errores.map(x=>`• ${x}`).join("<br>")}`:`${salidas.length} renglón(es) listos para registrar en una salida.`;R.classList.toggle("bad",errores.length>0)}
  $("sOk").disabled=!salidas.length||errores.length>0||salidas.length!==surItems.length;
  calcSur.items=errores.length?null:salidas;
}
async function confirmarSur(){
  const lineas=calcSur.items;if(!lineas?.length)return;const orden=$("orden").value.trim();
  if(!orden){toast("Capture la orden de producción para generar el comprobante de salida.",1);$("orden").focus();return}
  guardarDatosSur();
  const t=Date.now(),folio=folioSalida(t),fecha=new Date(t).toLocaleString("es-MX"),registros=[];
  lineas.forEach(({m,d},i)=>{
    const reg={...d,t:t+i,folio,fecha,orden,
      entrega:$("entrega").value.trim(),recibe:$("recibe").value.trim(),maquina:(campoSur("maquina")?.value||"").trim(),
      motivo:$("motivo").value.trim(),observaciones:$("observaciones").value.trim(),
      material:{codigo:m.codigo,descripcion:m.descripcion,tipoRegistro:m.tipoRegistro,lote:m.numeroLoteMP||m.lote,numeroHeat:m.numeroHeat,ubicacion:m.ubicacion,seccionMaterial:m.seccionMaterial,especificacionMedida:m.especificacionMedida}};
    registros.push({m,d:reg});
  });
  $("sOk").disabled=true;
  try{
    const items=registros.map(({m,d})=>({codigo:m.codigo,t:d.t,data:desData(d),piezas:d.piezas||[]}));
    const{data,error}=await sb.rpc("registrar_salida",{p_folio:folio,p_items:items});
    if(error)throw error;
    if(!data||Number(data.registrados)!==registros.length)throw new Error(`Se esperaban ${registros.length} renglones, pero el servidor confirmó ${data?.registrados??0}`);
  }catch(err){
    let msg="No se pudo registrar la salida";
    const errTxt=String(err?.message||err||"");
    if(/EXISTENCIA_INSUFICIENTE/i.test(errTxt)){
      const match=/EXISTENCIA_INSUFICIENTE:\s*([^\s·]+)\s*·\s*Disponible:\s*([^\s]+)\s*([^\s·]+)\s*·\s*Solicitado:\s*([^\s]+)/.exec(errTxt);
      if(match)msg=`Existencia insuficiente de ${match[1]} · Disponible: ${match[2]} ${match[3]} · Solicitado: ${match[4]}`;
      else msg="Existencia insuficiente. Otro usuario pudo haber surtido este material mientras preparabas la salida.";
    }else if(/PIEZA_YA_SURTIDA/i.test(errTxt)){
      const match=/PIEZA_YA_SURTIDA:\s*([^\s·]+)/.exec(errTxt);
      msg=match?`Una o más piezas de ${match[1]} ya fueron surtidas`:"Una o más piezas ya fueron surtidas. Otro usuario pudo haberlas escaneado mientras preparabas la salida.";
    }else if(/NO_AUTORIZADO/i.test(errTxt)){
      msg="No tienes autorización para registrar salidas";
    }else if(/MATERIAL_NO_ENCONTRADO/i.test(errTxt)){
      const match=/MATERIAL_NO_ENCONTRADO:\s*(.+)/.exec(errTxt);
      msg=match?`Material no encontrado: ${match[1]}`:"Uno o más materiales ya no existen en el sistema";
    }
    errDB(err,msg);
    await cargar().catch(()=>{});
    renderSur();
    return;
  }
  await cargar().catch(()=>{});
  const porCodigo=new Map();
  registros.forEach(({m,d})=>{
    const anteriores=porCodigo.get(m.codigo.toLowerCase())||[];
    const temporal={...m,existenciaServer:null,despachos:[...(m.despachos||[]),...anteriores]};
    const exPost=existencia({...temporal,despachos:[...temporal.despachos,d]});
    d.existenciaRestante=exPost.rest;d.existenciaUnidad=exPost.u;
    if(exPost.peso){d.pesoRestante=exPost.peso.peso;d.pesoRestanteU=exPost.peso.u}
    porCodigo.set(m.codigo.toLowerCase(),[...anteriores,d]);
  });
  const confirmados=registros.map(({m,d})=>({m:mats.find(x=>x.codigo.toLowerCase()===m.codigo.toLowerCase())||m,d}));
  imprimirSalidaGrupo(confirmados,folio);
  toast(`Salida registrada ✔ · ${registros.length} renglón(es) · Folio ${folio}`);
  surItems=[];limpiarBorradorSur();renderSur();renderHist();enfocar();
}
function folioSalida(t){
  const fecha=new Date(t),dia=`${fecha.getFullYear()}${String(fecha.getMonth()+1).padStart(2,"0")}${String(fecha.getDate()).padStart(2,"0")}`;
  return`SAL-${dia}-${t}`;
}
function movs(){const L=[];mats.forEach((m,i)=>(m.despachos||[]).forEach((d,j)=>L.push({m,i,j,d})));return L.sort((a,b)=>b.d.t-a.d.t)}
