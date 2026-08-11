let M=[],sport="Todos",filter="all",slip=[],type="single",quick=null,quickMode=false,user=null;
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),money=c=>"$"+(Number(c)/100).toLocaleString("es-MX",{minimumFractionDigits:2}),toast=t=>{let x=$("#toast");x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),1800)};
async function api(url,opt={}){let r=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(opt.headers||{})},...opt});let d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Error");return d}
function normalizeEvents(events){return events.map(e=>{const markets=e.markets||[];const odds=markets.flatMap(m=>(m.selections||[]).map(s=>({id:s.id,label:`${m.name}: ${s.label}`,code:s.code,odd:Number(s.odds),status:s.status,marketName:m.name,marketId:m.id})));return{id:e.id,sport:e.sport,league:e.league,home:e.home_team,away:e.away_team,score:[e.home_score||0,e.away_score||0],featured:e.featured,video:e.video,status:e.status,startsAt:e.starts_at,odds}})}
async function loadEvents(){try{const d=await api("/api/events");M=normalizeEvents(d.events);render()}catch(e){toast(e.message)}}
async function loadMe(){try{let d=await api("/api/me");user=d.user;$("#balance").textContent=money(user.balance_cents);$("#account").textContent=(user.name||"U")[0].toUpperCase()}catch{user=null;$("#balance").textContent="$0.00"}}
async function loadTickets(){if(!user){$("#history").innerHTML="<div class=empty>Inicia sesión para ver tus tickets.</div>";return}try{let d=await api("/api/tickets");$("#history").innerHTML=d.tickets.length?d.tickets.map(t=>`<div class=slip-item><b>${money(t.stake_cents)} · Cuota ${Number(t.total_odds).toFixed(2)} · ${t.status}</b><small>${new Date(t.created_at).toLocaleString("es-MX")} · Potencial ${money(t.potential_cents)}</small></div>`).join(""):"<div class=empty>No hay tickets.</div>"}catch(e){toast(e.message)}}
function render(){let q=$("#search").value.toLowerCase(),a=M.filter(m=>(sport==="Todos"||m.sport===sport)&&(!q||(`${m.home} ${m.away} ${m.league}`).toLowerCase().includes(q))).filter(m=>filter==="all"||filter==="featured"&&m.featured||filter==="video"&&m.video||filter==="goals"&&(m.score[0]+m.score[1]>0));$("#count").textContent=a.length+" eventos";$("#matches").innerHTML=a.map(m=>`<article class=match><div class=matchtop><span>${m.league}</span><span class=live>${m.status==="LIVE"?"● EN VIVO":"● ABIERTO"}</span><span>${m.video?"▶ VIDEO":""}</span></div><div class=event><span>☆</span><div class=team>${m.home}<small>${m.score[0]}</small></div>${m.odds.map((o,i)=>`<button class="odd ${slip.some(x=>x.id===m.id&&x.i===i)?"sel":""}" data-id="${m.id}" data-i="${i}" ${o.status!=="OPEN"?"disabled":""}><small>${m.odds.length===3?["1","X","2"][i]:o.code||"1/2"}</small><b>${o.odd.toFixed(2)}</b></button>`).join("")}<span class=more>+ mercados</span></div><div class=event style="padding-top:0"><span></span><div class=team>${m.away}<small>${m.score[1]}</small></div></div></article>`).join("")||"<div class=empty>No hay eventos disponibles.</div>";$$('.odd').forEach(b=>b.onclick=()=>pick(b.dataset.id,+b.dataset.i));renderSlip()}
function pick(id,i){let m=M.find(x=>x.id===id),o=m?.odds[i];if(!o)return;let x={id,i,selectionId:o.id,odd:o.odd,home:m.home,away:m.away,league:m.league,label:o.label,code:o.code};if(quickMode){quick=x;$("#qselection").innerHTML=`<b>${x.home} vs ${x.away}</b><br>${x.league} · ${x.label} · ${x.odd.toFixed(2)}`;$("#qbet").disabled=false;return}let p=slip.findIndex(y=>y.id===id);if(p>=0)slip.splice(p,1);else{if(type==="single")slip=[];slip.push(x)}render()}
function renderSlip(){let o=slip.reduce((a,x)=>a*x.odd,1),st=Math.round(Number($("#stake").value)*100)||0;$("#slipItems").innerHTML=slip.length?slip.map((x,i)=>`<div class=slip-item><button class=remove data-r=${i}>×</button><b>${x.home} vs ${x.away}</b><small>${x.league} · ${x.label} · ${x.odd.toFixed(2)}</small></div>`).join(""):"<div class=empty>Selecciona un momio para agregarlo.</div>";$$('.remove').forEach(b=>b.onclick=()=>{slip.splice(+b.dataset.r,1);render()});$("#odds").textContent=slip.length?o.toFixed(2):"0.00";$("#potential").textContent=money(st*o);$("#ticketCount").textContent=slip.length;$("#mobileCount").textContent=slip.length;$("#mobilePot").textContent=money(st*o);$("#bet").disabled=!user||!slip.length||st<100||!user.balance_cents||st>Number(user.balance_cents)}
async function submitTicket(items,stakeCents){if(!user)return openAuth();if(!items.length)return toast("Selecciona un momio");try{const d=await api("/api/tickets",{method:"POST",body:JSON.stringify({stakeCents,selectionIds:items.map(x=>x.selectionId)})});await loadMe();await loadTickets();slip=[];render();toast("Ticket creado ✓") }catch(e){toast(e.message)}}
$("#bet").onclick=()=>submitTicket(slip,Math.round(Number($("#stake").value)*100));$("#qbet").onclick=()=>{let s=Math.round(Number($("#qstake").value)*100);if(!quick)return;if(s<100)return toast("Importe mínimo: $1");submitTicket([quick],s);quick=null;$("#qselection").textContent="Ningún momio seleccionado.";$("#qbet").disabled=true};
$$('[data-sport]').forEach(b=>b.onclick=()=>{sport=b.dataset.sport;$("#drawer").classList.add("hidden");render()});$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle("active",x===b));render()});$("#search").oninput=render;$("#stake").oninput=renderSlip;$$('.quickmoney button').forEach(b=>b.onclick=()=>{$("#stake").value=Number(b.dataset.a);renderSlip()});$("#clear").onclick=()=>{slip=[];render()};$$('[data-type]').forEach(b=>b.onclick=()=>{type=b.dataset.type;$$('[data-type]').forEach(x=>x.classList.toggle("active",x===b));if(type==="single"&&slip.length>1)slip=slip.slice(-1);render()});
$$('[data-tab]').forEach(b=>b.onclick=()=>{quickMode=b.dataset.tab==="quick";$("#normalPanel").classList.toggle("hidden",quickMode);$("#quickPanel").classList.toggle("hidden",!quickMode);$$('[data-tab]').forEach(x=>x.classList.toggle("active",x===b))});
$("#menu").onclick=()=>$("#drawer").classList.remove("hidden");$("#closeDrawer").onclick=()=>$("#drawer").classList.add("hidden");$("#drawerLive").onclick=()=>{$("#bets").classList.add("hidden");$("#events").classList.remove("hidden");$("#drawer").classList.add("hidden")};$("#drawerBets").onclick=()=>{$("#events").classList.add("hidden");$("#bets").classList.remove("hidden");$("#drawer").classList.add("hidden");loadTickets()};$("#mobileSlip").onclick=()=>$("#betSlip").classList.toggle("mobile-open");$("#ticketTop").onclick=()=>{if(window.innerWidth<=700)$("#mobileSlip").click();else document.querySelector(".slip").scrollIntoView({behavior:"smooth"})};
$("#showBets").onclick=()=>{$("#events").classList.add("hidden");$("#bets").classList.remove("hidden");loadTickets()};$("#showLive").onclick=()=>{$("#bets").classList.add("hidden");$("#events").classList.remove("hidden")};
function openAuth(){if(user){toast("Sesión activa");return}$("#auth").classList.remove("hidden");$("#loginBox").classList.remove("hidden");$("#registerBox").classList.add("hidden")}$("#account").onclick=openAuth;$("#closeAuth").onclick=()=>$("#auth").classList.add("hidden");$("#registerLink").onclick=()=>{$("#loginBox").classList.add("hidden");$("#registerBox").classList.remove("hidden")};$("#loginLink").onclick=()=>{$("#registerBox").classList.add("hidden");$("#loginBox").classList.remove("hidden")};
$("#register").onclick=async()=>{try{let n=$("#rn").value.trim(),c=$("#rc").value.trim(),p=$("#rp").value;if(!n||!c||p.length<8)return toast("Completa los datos");let body=c.includes("@")?{name:n,email:c,password:p}:{name:n,phone:c,password:p};let d=await api("/api/auth/register",{method:"POST",body:JSON.stringify(body)});user=d.user;$("#auth").classList.add("hidden");await loadMe();renderSlip();toast("Cuenta creada ✓")}catch(e){toast(e.message)}};
$("#login").onclick=async()=>{try{let d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({identifier:$("#lc").value.trim(),password:$("#lp").value})});user=d.user;$("#auth").classList.add("hidden");await loadMe();renderSlip();toast("Sesión iniciada ✓")}catch(e){toast(e.message)}};
$$('[data-oauth]').forEach(b=>b.onclick=()=>{ window.location.href="/api/auth/google?action=login"; });
$$('[data-link-oauth]').forEach(b=>b.onclick=()=>{ const provider=b.dataset.linkOauth; if(provider==="google") window.location.href="/api/auth/google?action=link"; });
setInterval(()=>loadEvents(),15000);
(async()=>{await loadMe();await loadEvents();renderSlip()})();

async function loadProfile(){
  if(!user)return;
  try{
    const d=await api("/api/profile"),p=d.profile;
    $("#profileName").textContent=p.name||"Mi perfil";
    $("#profileEmail").textContent=p.email||p.phone||"";
    $("#pfName").value=p.name||"";
    $("#pfPhone").value=p.phone||"";
    $("#pfEmail").value=p.email||"";
    $("#profileBalance").textContent=money(p.balance_cents);
    const av=$("#profileAvatar");
    av.innerHTML=p.avatar_url?`<img src="${p.avatar_url}" alt="">`:(p.name||"U")[0].toUpperCase();
    $("#walletHistory").innerHTML=d.transactions.length?d.transactions.map(x=>`<div class="profile-row"><b>${x.type}</b> · ${money(x.amount_cents)}<small>${x.reason} · ${new Date(x.created_at).toLocaleString("es-MX")}</small></div>`).join(""):"<div class=empty>Sin movimientos todavía.</div>";
  }catch(e){toast(e.message)}
}
function openProfile(){if(!user)return openAuth();$("#profileModal").classList.remove("hidden");loadProfile()}
$("#account").onclick=openProfile;
$("#closeProfile").onclick=()=>$("#profileModal").classList.add("hidden");
$("#editProfile").onclick=()=>{
  ["#pfName","#pfPhone"].forEach(s=>$(s).disabled=false);
  $("#pfEmail").disabled=true;$("#saveProfile").classList.remove("hidden");
};
$("#saveProfile").onclick=async()=>{
  try{
    const d=await api("/api/profile",{method:"PATCH",body:JSON.stringify({name:$("#pfName").value,phone:$("#pfPhone").value})});
    user=d.user;await loadMe();await loadProfile();$("#saveProfile").classList.add("hidden");["#pfName","#pfPhone"].forEach(s=>$(s).disabled=true);toast("Perfil actualizado ✓");
  }catch(e){toast(e.message)}
};
$("#logout").onclick=async()=>{try{await api("/api/auth/logout",{method:"POST"});user=null;$("#profileModal").classList.add("hidden");await loadMe();renderSlip();toast("Sesión cerrada")}catch(e){toast(e.message)}};
let walletType="DEPOSIT";
async function loadWalletSettings(){try{const d=await api("/api/wallet/settings");const s=d.settings;$("#depositInstructions").innerHTML=s?`<b>${s.title||"Datos para depósito"}</b><p>${s.instructions||""}</p>${s.bank_name?`<div><b>Banco:</b> ${s.bank_name}</div>`:""}${s.account_holder?`<div><b>Titular:</b> ${s.account_holder}</div>`:""}${s.account_number?`<div><b>Cuenta:</b> ${s.account_number}</div>`:""}${s.clabe?`<div><b>CLABE:</b> ${s.clabe}</div>`:""}${s.card_number?`<div><b>Tarjeta:</b> ${s.card_number}</div>`:""}${s.reference_text?`<div><b>Referencia:</b> ${s.reference_text}</div>`:""}`:"Sin datos de depósito configurados."}catch(e){$("#depositInstructions").textContent="No se pudieron cargar las instrucciones."}}
function openWallet(type){
  if(!user)return openAuth();
  walletType=type;$("#walletTitle").textContent=type==="DEPOSIT"?"Solicitar depósito":"Solicitar retiro";
  $("#walletAmount").value="";$("#walletNote").value="";
  $("#withdrawFields").classList.toggle("hidden",type!=="WITHDRAWAL");
  $("#depositInstructions").classList.toggle("hidden",type!=="DEPOSIT");
  if(type==="DEPOSIT")loadWalletSettings();
  $("#walletModal").classList.remove("hidden");
}
$("#depositBtn").onclick=()=>openWallet("DEPOSIT");$("#withdrawBtn").onclick=()=>openWallet("WITHDRAWAL");
$("#closeWallet").onclick=()=>$("#walletModal").classList.add("hidden");
$("#walletSubmit").onclick=async()=>{
  try{
    const amount=Number($("#walletAmount").value);
    if(!Number.isFinite(amount)||amount<=0)return toast("Cantidad inválida");
    const payoutDetails=walletType==="WITHDRAWAL"?{method:$("#withdrawMethod").value,accountHolder:$("#withdrawHolder").value,bank:$("#withdrawBank").value,accountNumber:$("#withdrawAccount").value,clabe:$("#withdrawClabe").value,phone:$("#withdrawPhone").value}:{};
    await api("/api/wallet/requests",{method:"POST",body:JSON.stringify({type:walletType,amount,note:$("#walletNote").value,payoutDetails})});
    $("#walletModal").classList.add("hidden");await loadProfile();await loadMe();toast("Solicitud enviada ✓");
  }catch(e){toast(e.message)}
};
$("#changePasswordBtn").onclick=()=>$("#passwordModal").classList.remove("hidden");
$("#closePassword").onclick=()=>$("#passwordModal").classList.add("hidden");
$("#passwordSubmit").onclick=async()=>{
  try{
    await api("/api/profile/password",{method:"POST",body:JSON.stringify({currentPassword:$("#currentPassword").value,newPassword:$("#newPassword").value})});
    $("#passwordModal").classList.add("hidden");$("#currentPassword").value="";$("#newPassword").value="";toast("Contraseña actualizada ✓");
  }catch(e){toast(e.message)}
};
(async()=>{
  const q=new URLSearchParams(location.search);
  if(q.get("oauth")==="success"){history.replaceState({},document.title,"/");toast("Sesión OAuth iniciada ✓")}
  if(q.get("oauth_error")){const msg=q.get("oauth_error");history.replaceState({},document.title,"/");setTimeout(()=>toast(msg),300)}
})();
