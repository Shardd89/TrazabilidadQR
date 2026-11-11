// --- Ficha: página que se abre al escanear el QR con la cámara del celular ---
function limpiaP(o){
  const t=v=>v==null?"":String(v).slice(0,300),n=v=>v==null?null:(Number(v)||0);
  return{codigo:t(o.c),entradaId:n(o.e)||null,descripcion:t(o.d),lote:t(o.l),proveedor:t(o.p),um:"PZ",cantidad:n(o.q)??0,esMP:!!o.m,ubicacion:t(o.ub),fechaRecibo:t(o.fr),fechaModificacion:t(o.fm),
    tipoRegistro:o.tr==="MP"||o.m?"MP":o.tr==="CONSUMIBLES"?"CONSUMIBLES":"GENERAL",seccionMaterial:["SQ","FLAT","RND"].includes(o.sm)?o.sm:"",tipoMaterial:t(o.tm),especificacionMedida:t(o.em),longitudIndividual:n(o.li),manufactura:t(o.mf),numeroHeat:t(o.nh),numeroLoteMP:t(o.nl),numeroCertificado:t(o.nc),totalMM:n(o.tmm),tipoMoneda:t(o.mon),ordenMaterial:t(o.ord),poNumber:t(o.po),noAplica:o.na&&typeof o.na==="object"?o.na:{},
    peso:n(o.pe),pesoU:o.pu==="LB"||o.pu==="KG"?o.pu:o.u==="LB"||o.u==="KG"?o.u:null,pesoUnidadPendiente:o.pu==="?",longitud:n(o.lo),longU:okU(o.lu)?o.lu:"mm",seccion:o.s==="cuadrado"?"cuadrado":"redondo",
    secU:["mm","cm","in"].includes(o.su)?o.su:"mm",diametro:n(o.di),alto:n(o.al),ancho:n(o.an),despachos:[],existSnap:t(o.x)}}
function filasFicha(m,ex,pz){
  const et=pz?`Pieza ${pz.n} de ${pz.t||m.cantidad}`:`MASTER · ${m.cantidad} ${m.um}`;
  const st=pz&&ex?(piezasSurt(m).has(pz.n)?"⚠ SURTIDA":"En existencia"):"";
  return[["Código",m.codigo],["Entrada / lote",m.entradaId?`#${m.entradaId}${m.fechaRecibo?" · "+m.fechaRecibo:""}`:""],["Etiqueta",et],["Estado de la pieza",st],["Clasificación",nombreTipoRegistro(m.tipoRegistro)],["Tipo material",m.tipoMaterial],["Descripción",m.descripcion],["Proveedor",m.proveedor],
    ["Sección / especificación",seccionEspecificacion(m)],["Longitud IND",m.longitudIndividual!=null?`${m.longitudIndividual} mm`:""],["Manufactura",m.manufactura],["N.º Heat",m.numeroHeat],["N.º lote MP",m.numeroLoteMP||m.lote],["N.º cert.",m.numeroCertificado],["Total mm",m.totalMM],["Fecha de recibo",m.fechaRecibo],["Cantidad",`${m.cantidad} ${m.um}`],
    ["Peso",m.peso!=null?`${m.peso}${m.pesoU||m.pesoUnidad?" "+(m.pesoU||m.pesoUnidad):m.pesoUnidadPendiente?" (unidad sin definir)":""}`:""],["Orden",m.ordenMaterial],["PO number",m.poNumber],
    ["Existencia",ex?existTxt(m):""],["Existencia al imprimir la etiqueta",!ex&&m.existSnap?m.existSnap:""],["Últ. modificación",m.fechaModificacion]]}
function salirFicha(){document.body.classList.remove("ficha");$("fichaView").hidden=true;document.title="Trazabilidad de Material · QR";try{history.replaceState(null,"",location.pathname+location.search)}catch{}}
async function iniciarFicha(){
  const x=/#(?:[^#]*&)?(d|c)=([^&\s]+)/.exec(location.hash);if(!x)return;
  const pz=pzDe(location.hash);let snap=null,cod="",entradaId=null;
  try{if(x[1]==="d"){snap=limpiaP(JSON.parse(b64d(x[2])));cod=snap.codigo;entradaId=snap.entradaId!=null?Number(snap.entradaId):null}else{cod=decodeURIComponent(x[2]);entradaId=entradaDeQR(location.hash)}}catch{}
  document.body.classList.add("ficha");$("fichaView").hidden=false;window.scrollTo(0,0);
  $("fApp").onclick=salirFicha;$("fPdf").onclick=()=>{limpiarEtqCss();window.print()};
  if(!cod){$("fCod").textContent="QR no válido";$("fDatos").innerHTML='<div class="res bad">No se pudo leer la información de este QR. Genere la etiqueta de nuevo.</div>';$("fNota").textContent="";$("fPdf").hidden=true;return}
  const titulo=cod+(entradaId!=null?` · Entrada #${entradaId}`:"");
  $("fCod").textContent=titulo;document.title="Ficha "+titulo;$("fDatos").innerHTML='<div class="res">Consultando…</div>';$("fNota").textContent="";$("fPdf").hidden=true;$("fSur").hidden=true;
  let m=mats.find(k=>String(k.codigo).toLowerCase()===cod.toLowerCase())||null,live=!!m,red=false,noReg=false;
  if(!m){
    try{
      if(!sb)throw 0;
      if(entradaId!=null){
        const r=await sb.rpc("ficha_entrada_publica",{p_entrada_id:entradaId});if(r.error)throw r.error;
        if(r.data){
          const entrada=entradaDeFila(r.data.e);
          const base={...r.data.m,codigo:(r.data.m&&r.data.m.codigo)||entrada.codigo,entradas:[entrada],despachos:(r.data.d||[]).map(desDeFila)};
          m=materialDeEntrada(base,entrada);
          const a=await sb.rpc("ficha_existencia_entrada_publica",{p_entrada_id:entradaId});if(a.error)throw a.error;
          const diferencia=Number(a.data);if(a.data==null||!Number.isFinite(diferencia))throw new Error("La respuesta del ajuste de inventario no es válida.");
          m.ajustesInventario=[{diferencia,entrada_id:Number(entradaId),unidad:"PZ"}];
          live=true;
        }else noReg=true;
      }else{
        const r=await sb.rpc("ficha_publica",{p_codigo:cod});if(r.error)throw r.error;
        if(r.data){
          const a=await sb.rpc("ficha_existencia_publica",{p_codigo:cod});if(a.error)throw a.error;
          const diferencia=Number(a.data);if(a.data==null||!Number.isFinite(diferencia))throw new Error("La respuesta del ajuste de inventario no es válida.");
          m={...r.data.m,despachos:(r.data.d||[]).map(desDeFila),ajustesInventario:[{diferencia}]};live=true
        }else noReg=true
      }
    }catch{red=true}
  }
  if(m&&entradaId!=null){
    const e=(m.entradas||[]).find(x=>Number(x.id)===Number(entradaId));
    if(e)m=materialDeEntrada(m,e);
    else{
      entradaId=null;
      $("fCod").textContent=cod;document.title="Ficha "+cod;
    }
  }
  let solo=false;if(!m){if(snap)m=snap;else{m={codigo:cod};solo=true}}
  const hora=new Date().toLocaleString("es-MX");
  if(solo){
    $("fDatos").innerHTML=`<div class="res bad">${red?"No se pudo consultar el sistema. Revise su conexión a internet e intente de nuevo.":`El código <b>${esc(cod)}</b> no está registrado en el sistema.`}</div>`;
    $("fNota").textContent="";return}
  $("fPdf").hidden=false;
  $("fDatos").innerHTML=filasFicha(m,live,pz).filter(r=>r[1]).map(r=>`<div class="d"><b>${r[0]}</b><span>${esc(r[1])}</span></div>`).join("");
  $("fNota").textContent=live?`Datos en línea${entradaId!=null?` de la entrada #${entradaId}`:""} del sistema de trazabilidad. Consultado: ${hora}.`:`${noReg?"Este código ya no está registrado en el sistema.":"No se pudo consultar el sistema."} Se muestran los datos grabados al generar la etiqueta${m.fechaModificacion?" (últ. modificación: "+m.fechaModificacion+")":""}, que no reflejan surtidos posteriores. Consultado: ${hora}.`;
  $("fSur").hidden=!(esStaff&&live);
  $("fSur").onclick=()=>{const c=pz?location.hash:m.codigo;salirFicha();document.querySelector('.tab[data-v="vSur"]').click();escanear(c)};
}
// Navegación con hash
const HASH_MODULOS={inicio:"vInicio",registro:"vReg",surtido:"vSur",inventario:"vInv"};
const HASH_PAGINAS={registro:{captura:"captura",historial:"historial",qr:"qr"},surtido:{preparar:"preparar",borrador:"borrador",historial:"historial"},inventario:{existencias:"existencias",almacenes:"almacenes",asignar:"asignar"}};
function actualizarHashNavegacion(modulo,pagina){
  const nombre={vInicio:"inicio",vReg:"registro",vSur:"surtido",vInv:"inventario"}[modulo];
  if(!nombre)return;
  const ruta=nombre==="inicio"?"/inicio":pagina?`/${nombre}/${pagina}`:`/${nombre}`;
  if(location.hash===`#${ruta}`)return;
  history.replaceState(null,"",`#${ruta}`);
}
function navegarDesdeHash(){
  const h=location.hash;
  if(!h||h==="#"||/#(?:[^#]*&)?[dc]=/.test(h))return;
  const m=/^#\/([^\/]+)(?:\/([^\/]+))?/.exec(h);
  if(!m)return;
  const modulo=HASH_MODULOS[m[1]],pagina=m[2];
  if(!modulo)return;
  const tab=document.querySelector(`.tab[data-v="${modulo}"]`);
  if(tab)tab.click();
  if(pagina&&modulo!=="vInicio"){
    const paginaNormalizada=HASH_PAGINAS[m[1]]?.[pagina];
    if(paginaNormalizada)activarSubpantalla(modulo,paginaNormalizada);
  }
}
window.addEventListener("hashchange",()=>{if(/#(?:[^#]*&)?[dc]=/.test(location.hash))location.reload();else navegarDesdeHash()});

resetForm();render();arrancar();