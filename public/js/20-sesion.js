// --- Sesión ---
function lgMostrar(msg){$("lgCarga").hidden=true;$("lgF").hidden=false;$("lgMsg").hidden=!msg;$("lgMsg").textContent=msg||""}
function limpiarSesionLocal(){try{Object.keys(localStorage).filter(k=>k.indexOf("sb-")===0&&k.indexOf("-auth-token")>0).forEach(k=>localStorage.removeItem(k))}catch{}}
function errorSesion(e){const c=Number(e?.status||e?.code||0);return c===401||c===403||/jwt|token|session|sesi[oó]n/i.test(String(e?.message||""))}
async function cerrarSesion(){try{const{error}=await sb.auth.signOut();if(error)throw error}catch(e){console.warn("No se pudo revocar la sesión en el servidor; se cierra localmente.",e)}limpiarSesionLocal();salirUI()}
function actualizarVisibilidadAdmin(){["bJson","bCsv","bImp","bExcel","bCsvS","bUbiExportar","ubicacionesImportar","btnGuardar"].forEach(id=>$(id).hidden=!esAdmin);$("registroAdminAviso").hidden=esAdmin}
function salirUI(){esStaff=false;esAdmin=false;actualizarVisibilidadAdmin();seleccionados.clear();$("rolUsuario").hidden=true;$("conteoEstado").hidden=true;document.body.classList.remove("auth");dejarCanal();camOff();if($("conteoDialog").open)$("conteoDialog").close();mats=[];surItems=[];almacenes=[];ubicaciones=[];ubicacionesAlias=[];movimientosUbicacion=[];reconstruirIndices();ajustesInventarioError="";almacenesError="";ubicacionesError="";ubicacionesAliasError="";movimientosError="";ubicacionDestino=null;asignacionItems=[];actual=null;render();renderInicio();lgMostrar()}
let entrando=false;
async function entrar(){
  if(!sb||entrando)return false;
  entrando=true;
  try{
    const admin=await sb.rpc("is_admin");
    if(admin.error){const expirada=errorSesion(admin.error);await cerrarSesion();lgMostrar(expirada?"Tu sesión expiró. Vuelve a iniciar sesión.":"No se pudieron verificar los permisos del administrador. Ejecute la migración actualizada supabase_almacenes.sql.");return false}
    const r=await sb.rpc("is_staff");
    if((r.error||r.data!==true)&&admin.data!==true){const expirada=errorSesion(r.error);await cerrarSesion();lgMostrar(expirada?"Tu sesión expiró. Vuelve a iniciar sesión.":"Este usuario no tiene autorización. Pida al administrador que agregue su correo.");return false}
    esStaff=true;esAdmin=admin.data===true;document.body.classList.add("auth");
    $("rolUsuario").textContent=esAdmin?"Administrador":"Personal";$("rolUsuario").hidden=false;
    $("bDelSel").hidden=$("bDelAll").hidden=!esAdmin;
    actualizarVisibilidadAdmin();
    let datosCargados=false;
    try{await cargar();datosCargados=true}catch(e){errDB(e,"No se pudo cargar los datos")}
    if(datosCargados)restaurarBorradorSur();
    await cargarUbicaciones();
    suscribir();await migrarLocal();return true;
  }finally{entrando=false}
}
// Datos que el navegador tenía guardados antes de usar Supabase
async function migrarLocal(){
  if(mats.length||sessionStorage.getItem("mig_omitido"))return;
  let loc=[];try{if(localStorage.getItem(K+"_migrado"))return;loc=JSON.parse(localStorage.getItem(K)||localStorage.getItem("materiales_v1")||"[]")}catch{}
  loc=(Array.isArray(loc)?loc:[]).filter(m=>m&&m.codigo);if(!loc.length)return;
  if(!esAdmin){toast("La restauración de datos guardados en este navegador requiere al administrador.",1);return}
  if(!confirm(`Se encontraron ${loc.length} registro(s) guardados en este navegador (de antes de usar Supabase).\n\n¿Subirlos ahora a la base de datos compartida?`)){try{sessionStorage.setItem("mig_omitido","1")}catch{}return}
  loc.forEach(m=>{Object.assign(m,normalizarMaterial(m));m.codigo=String(m.codigo);m.esMP=!!m.esMP;m.cantidad=Number(m.cantidad)||0;m.despachos=Array.isArray(m.despachos)?m.despachos.filter(d=>d&&typeof d==="object"&&d.t!=null):[]});
  try{await subirLista(loc,loc.flatMap(m=>m.despachos.map(d=>({codigo:m.codigo,d}))));try{localStorage.setItem(K+"_migrado","1")}catch{}await cargar();toast(`${loc.length} registro(s) subidos a Supabase ✔`)}
  catch(e){errDB(e,"No se pudo subir")}
}
$("lgF").addEventListener("submit",async e=>{
  e.preventDefault();if($("lgBtn").disabled)return;
  $("lgMsg").hidden=true;$("lgBtn").disabled=true;
  try{
    const{error}=await sb.auth.signInWithPassword({email:$("lgMail").value.trim(),password:$("lgPass").value});
    if(error){lgMostrar("Correo o contraseña incorrectos.");return}
    $("lgPass").value="";await entrar();
  }finally{$("lgBtn").disabled=false}
});
$("bSalir").onclick=()=>{cerrarSesion()};
async function arrancar(){
  const ficha=/#(?:[^#]*&)?[dc]=/.test(location.hash);if(ficha)document.body.classList.add("ficha");
  if(!sb){lgMostrar("No se pudo cargar Supabase. Revise su conexión a internet y recargue la página.");if(ficha)iniciarFicha();return}
  sb.auth.onAuthStateChange(ev=>{if(ev==="SIGNED_OUT")salirUI()});
  let ses=null;try{ses=(await sb.auth.getSession()).data.session}catch{}
  if(ses){await entrar();if(!ficha)navegarDesdeHash()}else lgMostrar();
  if(ficha)iniciarFicha();
}

function toast(msg,err){const t=$("toast");t.textContent=msg;t.classList.toggle("err",!!err);t.classList.add("show");clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove("show"),2400)}

