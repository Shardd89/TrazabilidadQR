// --- QR ---
function dimsTxt(m){
  if(!m.esMP)return"";
  const seccion=m.seccionMaterial|| (m.seccion==="cuadrado"?"SQ":"RND");
  if(!seccion)return"";
  const etiqueta=seccion==="FLAT"?"FLAT":seccion==="SQ"?"CUADRADO":"REDONDO";
  const medidas=seccion==="RND"?m.diametro!=null?` ⌀ ${m.diametro} ${m.secU||m.diametroUnidad||"mm"}`:"":m.alto!=null||m.ancho!=null?` ${m.alto??"—"} × ${m.ancho??"—"} ${m.secU||"mm"} (alto×ancho)`:"";
  const largo=m.longitud>0?`, L: ${m.longitud} ${m.longU||m.longitudUnidad||"mm"}`:"";
  return `${etiqueta}${medidas}${largo}`;
}
function seccionEspecificacion(m){
  const seccion=m.seccionMaterial|| (m.seccion==="cuadrado"?"SQ":m.seccion==="redondo"?"RND":"");
  const etiqueta=seccion==="SQ"?"SQ":seccion==="FLAT"?"FLAT":seccion==="RND"?"RND":"";
  const especificacion=String(m.especificacionMedida||"").trim();
  const dimension=etiqueta&&especificacion?`${etiqueta} · ${especificacion}`:especificacion||dimsTxt(m);
  return dimension;
}
// Dominio que se graba en el QR. Se puede cambiar sin tocar código con
// <meta name="qr-base"> en index.html (útil al mover el sitio de dominio).
const BASE=(document.querySelector('meta[name="qr-base"]')?.content||"https://shardd89.github.io/TrazabilidadQR/").replace(/\/*$/,"/");
const b64e=t=>btoa(encodeURIComponent(t).replace(/%([0-9A-F]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const b64d=t=>{t=t.replace(/-/g,"+").replace(/_/g,"/");while(t.length%4)t+="=";return decodeURIComponent(Array.from(atob(t),c=>"%"+c.charCodeAt(0).toString(16).padStart(2,"0")).join(""))};
function payload(m){
  const o={c:m.codigo,d:m.descripcion,l:m.lote,p:m.proveedor,u:"PZ",q:m.cantidad,m:m.esMP?1:0,ub:m.ubicacion,fr:m.fechaRecibo,fm:m.fechaModificacion};
  if(m.esMP)Object.assign(o,{lo:m.longitud,lu:m.longU||m.longitudUnidad,s:m.seccion,su:m.secU||m.diametroUnidad,di:m.diametro,al:m.alto,an:m.ancho});
  if(m.peso!=null){o.pe=m.peso;o.pu=m.pesoUnidadPendiente?"?":m.pesoU||m.pesoUnidad}
  const extras={tipoRegistro:"tr",seccionMaterial:"sm",tipoMaterial:"tm",especificacionMedida:"em",longitudIndividual:"li",manufactura:"mf",numeroHeat:"nh",numeroLoteMP:"nl",numeroCertificado:"nc",totalMM:"tmm",ordenMaterial:"ord",poNumber:"po"};
  Object.entries(extras).forEach(([key,short])=>{if(m[key])o[short]=m[key]});
  if(m.noAplica&&Object.values(m.noAplica).some(Boolean))o.na=m.noAplica;
  Object.keys(o).forEach(k=>{if(o[k]===""||o[k]==null)delete o[k]});return o}
// Master + piezas individuales: según la cantidad (entera, 1 a MAX_IND), sin importar la UM
const MAX_IND=100;
function esIndividual(m){return !!m&&Number.isInteger(m.cantidad)&&m.cantidad>=1&&m.cantidad<=MAX_IND}
// n = nº de pieza (sin n → QR master del registro completo)
function qrTexto(m,n){
  if(compacto())return `${BASE}#c=${encodeURIComponent(m.codigo)}${n?`&p=${n}-${m.cantidad}`:""}`;
  const o=payload(m);if(n){o.pn=n;o.pt=m.cantidad}else if((m.despachos||[]).length)o.x=existTxt(m)
  return `${BASE}#d=${b64e(JSON.stringify(o))}`}
// Devuelve {n,t} si el QR leído es de una pieza individual
function pzDe(txt){
  txt=String(txt||"");let x=/#(?:[^#]*&)?d=([^&\s]+)/.exec(txt);
  if(x){try{const o=JSON.parse(b64d(x[1]));return o.pn>0?{n:+o.pn,t:+o.pt||0}:null}catch{return null}}
  x=/#(?:[^#]*&)?p=(\d+)-(\d+)/.exec(txt);return x?{n:+x[1],t:+x[2]}:null}
function piezasSurt(m){const s=new Set();(m.despachos||[]).forEach(d=>(d.piezas||[]).forEach(n=>s.add(n)));return s}
// Extrae el código de un QR nuevo (enlace) o de uno antiguo (texto "Código: ...")
function codDe(txt){
  txt=String(txt||"");let x=/#(?:[^#]*&)?d=([^&\s]+)/.exec(txt);
  if(x){try{return String(JSON.parse(b64d(x[1])).c||"")}catch{return ""}}
  x=/#(?:[^#]*&)?c=([^&\s]+)/.exec(txt);
  if(x){try{return decodeURIComponent(x[1])}catch{return x[1]}}
  x=/C[óo]digo:\s*(.+)/i.exec(txt);return(x?x[1]:txt).split("\n")[0].trim()}
function qrURL(){const c=$("qrBox").querySelector("canvas");if(c)return c.toDataURL("image/png");const i=$("qrBox").querySelector("img");return i?i.src:""}

function dibujarQR(txt,px=240){
  let qr=null;
  for(const lvl of ["M","L"]){try{qr=qrcode(0,lvl);qr.addData(txt,"Byte");qr.make();break}catch(e){qr=null}}
  if(!qr)return null;
  const n=qr.getModuleCount(),cell=Math.max(4,Math.floor(px/n)),q=4,size=(n+2*q)*cell;
  const c=document.createElement("canvas");c.width=c.height=size;
  const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,size,size);x.fillStyle="#000";
  for(let r=0;r<n;r++)for(let k=0;k<n;k++)if(qr.isDark(r,k))x.fillRect((k+q)*cell,(r+q)*cell,cell,cell);
  c.style.cssText="width:220px;height:220px;image-rendering:pixelated";
  return c;
}
function mostrar(m){
  const pagina=document.querySelector('.section-tab[data-module="vReg"][aria-current="page"]')?.dataset.page;
  activarSubpantalla("vReg",pagina==="historial"?"historial":"captura");
  $("vReg").classList.add("qr-visible");
  actual=m;const box=$("qrBox");box.innerHTML="";
  const txt=qrTexto(m);
  const c=dibujarQR(txt);
  if(c)box.appendChild(c);else{box.textContent="No se pudo generar el QR: los datos son demasiado largos. Acorte descripción o ubicación.";actual=null}
  const rows=[["Código",m.codigo],["Almacén",m.ubicacionAlmacenNombre||almacenesPorCodigo.get(m.ubicacionAlmacenCodigo)?.nombre],["Ubicación",m.ubicacion],["Clasificación",nombreTipoRegistro(m.tipoRegistro)],["Tipo material",m.tipoMaterial],["Descripción",m.descripcion],
    ["Sección / especificación",seccionEspecificacion(m)],["Longitud IND",m.longitudIndividual!=null?`${m.longitudIndividual} mm`:""],["Manufactura",m.manufactura],["N.º Heat",m.numeroHeat],["N.º lote MP",m.numeroLoteMP||m.lote],["N.º cert.",m.numeroCertificado],["Total mm",m.totalMM],["Fecha de recibo",m.fechaRecibo],["Cantidad",`${m.cantidad} ${m.um}`],
    ["Etiqueta",`MASTER · ${m.cantidad} ${m.um}`+(esIndividual(m)?` (+ ${m.cantidad} QR individuales)`:` (sin QR individuales: la cantidad debe ser entera y de 1 a ${MAX_IND})`)],
    ["Peso",m.peso!=null?`${m.peso}${m.pesoU||m.pesoUnidad?" "+(m.pesoU||m.pesoUnidad):m.pesoUnidadPendiente?" (unidad sin definir)":""}`:""],["Orden",m.ordenMaterial],["PO number",m.poNumber],
    ["Existencia",existTxt(m)],["Últ. modificación",m.fechaModificacion]];
  $("ficha").innerHTML=rows.filter(r=>r[1]).map(r=>`<div class="d"><b>${r[0]}</b><span>${esc(r[1])}</span></div>`).join("");
  $("bPrint").disabled=$("bPng").disabled=!actual;
  const ind=!!actual&&esIndividual(m);$("piezasBox").hidden=!ind;$("pzDet").open=false;$("pzGrid").innerHTML="";
  if(ind)$("piezasInfo").innerHTML=`<b>${m.cantidad} ${esc(m.um)}</b> (≤ ${MAX_IND}): además del QR master se generan <b>${m.cantidad} QR individuales</b>, uno por pieza (1/${m.cantidad} … ${m.cantidad}/${m.cantidad}).`;
}
function qrPieza(m,n){return dibujarQR(qrTexto(m,n))}
$("pzDet").addEventListener("toggle",()=>{
  const g=$("pzGrid");if(!$("pzDet").open||g.childElementCount||!actual||!esIndividual(actual))return;
  const m=actual;
  for(let n=1;n<=m.cantidad;n++){const c=qrPieza(m,n);if(!c)continue;c.style.cssText="width:96px;height:96px;image-rendering:pixelated";
    const d=document.createElement("div");d.className="pzi";d.dataset.n=n;d.style.cursor="pointer";d.title="Clic para descargar este PNG";d.appendChild(c);const t=document.createElement("div");t.textContent=`${n} / ${m.cantidad}`;d.appendChild(t);g.appendChild(d)}
});
// --- Impresión en Brother QL-800: 1 etiqueta por página; el papel se elige en el controlador ---
const ETQ={qr:50,lv:2,fs:11,cl:3};
function qrData(m,n){const c=dibujarQR(qrTexto(m,n),600);return c?c.toDataURL("image/png"):null}
function etqHTML(m,n,src){
  const f=ETQ,N=m.cantidad,tag=n?`PIEZA ${n} / ${N}`:`MASTER · ${esc(N)} ${esc(m.um)}`;
  let t=`<b class="cd">${esc(m.codigo)}</b><span class="tg">${tag}</span>`;
  if(f.lv>=1)t+=`<small class="ds">${esc(m.descripcion)}</small>`;
  if(f.lv>=2)t+=[m.lote?"Lote: "+m.lote:"",seccionEspecificacion(m),m.longitudIndividual!=null?`Long IND: ${m.longitudIndividual} mm`:"",m.peso!=null?`Peso: ${m.peso}${m.pesoU||m.pesoUnidad?" "+(m.pesoU||m.pesoUnidad):m.pesoUnidadPendiente?" (unidad sin definir)":""}`:"",m.ubicacion?"Ubic: "+m.ubicacion:"",m.fechaRecibo?"Recibo: "+m.fechaRecibo:""].filter(Boolean).map(x=>`<small>${esc(x)}</small>`).join("");
  return `<div class="pz${n?"":" mst"}"><img src="${src}" alt="QR"><div class="tx">${t}</div></div>`}
function cssEtq(){const f=ETQ;
  return `@media print{@page{size:auto;margin:0}
#etiqueta.hoja .pz{width:100%;height:100%;padding:1.5mm;gap:1.2mm;font-size:${f.fs}pt;flex-direction:column;align-items:center;justify-content:center;text-align:center}
#etiqueta.hoja .pz img{width:min(${f.qr}mm, 80vw);height:auto;aspect-ratio:1}
#etiqueta.hoja .pz .tx{width:100%;align-items:center}
#etiqueta.hoja .pz .ds{-webkit-line-clamp:${f.cl}}}`}
function limpiarEtqCss(){const st=$("etqCss");if(st)st.textContent=""}
function imprimirEtq(lista){
  const e=$("etiqueta");e.className="hoja";e.innerHTML=lista.map(x=>etqHTML(x.m,x.n,x.src)).join("");
  let st=$("etqCss");if(!st){st=document.createElement("style");st.id="etqCss";document.head.appendChild(st)}
  st.textContent=cssEtq();window.addEventListener("afterprint",limpiarEtqCss,{once:true});
  Promise.all([...e.querySelectorAll("img")].map(i=>i.decode?i.decode().catch(()=>{}):0)).then(()=>window.print());
}
function imprimirPiezas(conMaster){
  if(!actual||!esIndividual(actual))return;const m=actual,L=[];
  if(conMaster){const u=qrData(m,0);if(!u)return;L.push({m,n:0,src:u})}
  for(let n=1;n<=m.cantidad;n++){const u=qrData(m,n);if(!u){toast("No se pudo generar el QR de la pieza "+n,1);return}L.push({m,n,src:u})}
  imprimirEtq(L);
}
$("bPrintPz").onclick=()=>imprimirPiezas(false);
// --- Descarga de PNG: ZIP (sin compresión) con un PNG por pieza ---
const CRCT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRCT[(c^b[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
function zipBytes(files){ // files: [{name,data:Uint8Array}]
  const enc=new TextEncoder(),now=new Date(),tm=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1),dt=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  const parts=[],cen=[];let off=0;
  files.forEach(f=>{
    const nm=enc.encode(f.name),crc=crc32(f.data),sz=f.data.length;
    const lh=new DataView(new ArrayBuffer(30));lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);lh.setUint16(10,tm,true);lh.setUint16(12,dt,true);lh.setUint32(14,crc,true);lh.setUint32(18,sz,true);lh.setUint32(22,sz,true);lh.setUint16(26,nm.length,true);lh.setUint16(28,0,true);
    parts.push(new Uint8Array(lh.buffer),nm,f.data);
    const ch=new DataView(new ArrayBuffer(46));ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);ch.setUint16(12,tm,true);ch.setUint16(14,dt,true);ch.setUint32(16,crc,true);ch.setUint32(20,sz,true);ch.setUint32(24,sz,true);ch.setUint16(28,nm.length,true);ch.setUint32(42,off,true);
    cen.push(new Uint8Array(ch.buffer),nm);off+=30+nm.length+sz});
  const cs=cen.reduce((a,b)=>a+b.length,0),end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,cs,true);end.setUint32(16,off,true);
  return new Blob([...parts,...cen,new Uint8Array(end.buffer)],{type:"application/zip"})}
const durl=u=>Uint8Array.from(atob(u.split(",")[1]),c=>c.charCodeAt(0));
const safeN=t=>String(t).replace(/[^\w.\-]+/g,"_");
const nomPz=(m,n)=>`QR_${safeN(m.codigo)}_pieza_${String(n).padStart(String(m.cantidad).length,"0")}_de_${m.cantidad}.png`;
async function bajarBlob(nombre,blob){
  if(matchMedia("(pointer:coarse)").matches){try{const f=new File([blob],nombre,{type:blob.type});if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:nombre});return}}catch(e){if(e.name==="AbortError")return}}
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=nombre;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$("bPngPz").onclick=()=>{
  if(!actual||!esIndividual(actual))return;const m=actual,F=[];
  for(let n=1;n<=m.cantidad;n++){const u=qrData(m,n);if(!u){toast("No se pudo generar el QR de la pieza "+n,1);return}F.push({name:nomPz(m,n),data:durl(u)})}
  bajarBlob(`QR_${safeN(m.codigo)}_piezas.zip`,zipBytes(F));toast(`${F.length} PNG en ZIP ⬇️`);
};
$("pzGrid").addEventListener("click",e=>{
  const d=e.target.closest(".pzi");if(!d||!actual)return;const n=+d.dataset.n,u=qrData(actual,n);if(!u)return;
  bajarBlob(nomPz(actual,n),new Blob([durl(u)],{type:"image/png"}));
});
$("bPrintAll").onclick=()=>imprimirPiezas(true);
$("bPng").onclick=()=>{const u=qrURL();if(!u||!actual)return;const a=document.createElement("a");a.href=u;a.download=`QR_${actual.codigo}.png`;a.click()};
$("bPrint").onclick=()=>{if(!actual)return;const u=qrData(actual,0);if(!u){toast("No se pudo generar el QR",1);return}imprimirEtq([{m:actual,n:0,src:u}])};
// Etiquetas de los materiales seleccionados en el historial
function imprimirSeleccionados(){
  const lista=mats.filter(m=>seleccionados.has(m.codigo));
  if(!lista.length){toast("Seleccione al menos un material para imprimir sus etiquetas.",1);return}
  const conPiezas=$("incluirPiezasSel").checked;
  const piezas=conPiezas?lista.filter(esIndividual).reduce((s,m)=>s+m.cantidad,0):0;
  const total=lista.length+piezas;
  if(total>50&&!confirm(`Se van a imprimir ${total} etiquetas (${lista.length} master${piezas?` + ${piezas} de piezas`:""}). ¿Desea continuar?`))return;
  const L=[];
  for(const m of lista){
    const u=qrData(m,0);if(!u){toast(`No se pudo generar el QR de ${m.codigo}`,1);return}
    L.push({m,n:0,src:u});
    if(conPiezas&&esIndividual(m))for(let n=1;n<=m.cantidad;n++){
      const up=qrData(m,n);if(!up){toast(`No se pudo generar el QR de la pieza ${n} de ${m.codigo}`,1);return}
      L.push({m,n,src:up});
    }
  }
  imprimirEtq(L);
}
$("bPrintSel").onclick=imprimirSeleccionados;

