let M=[],sport="Todos",filter="all",slip=[],type="single",quick=null,quickMode=false,user=null,liveOnly=true,feedMode="live",hotMode=false,raceMode=false;
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),money=c=>"$"+(Number(c)/100).toLocaleString("es-MX",{minimumFractionDigits:2}),americanOdds=o=>{const d=Number(o);if(!Number.isFinite(d)||d<=1)return "—";const a=d>=2?Math.round((d-1)*100):Math.round(-100/(d-1));return a>0?`+${a}`:`${a}`},displayOdds=o=>`${americanOdds(o)} <small class="decimal-odds">(${Number(o).toFixed(2)})</small>`,toast=t=>{let x=$("#toast");x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),1800)};
async function api(url,opt={}){let r=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(opt.headers||{})},...opt});let d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Error");return d}
function normalizeEvents(events){return events.map(e=>{
  const markets=(e.markets||[]).map(m=>({...m,selections:(m.selections||[]).map(s=>({...s,odds:Number(s.odds)}))}));
  const odds=markets.flatMap(m=>(m.selections||[]).map(s=>({id:s.id,label:`${m.name}: ${s.label}`,code:s.code,odd:Number(s.odds),status:s.status,marketName:m.name,marketId:m.id})));
  return{id:e.id,sport:e.sport,league:e.league,home:e.home_team,away:e.away_team,score:[e.home_score||0,e.away_score||0],featured:e.featured,video:e.video,status:e.status,startsAt:e.starts_at,liveElapsed:e.live_elapsed,liveStatus:e.live_status,source:e.external_source,hotStats:e.hot_stats||null,raceStats:e.race_stats||null,hot:e.hot_enabled===true||String(e.external_source||"").startsWith("HOT_")||e.external_source==="HOT_ENGINE",race:e.race_enabled===true||e.external_source==="RACE_ENGINE",markets,odds}
})}
async function loadEvents(forceLive=true){
  try{
    hotMode=false;raceMode=false;feedMode=forceLive?"live":"all";liveOnly=forceLive;
    const virtualSports=["Básquetbol","Béisbol","Tenis","Hockey"];
    let events=[];
    if(sport==="Todos"){
      // Independent modules: one failed virtual sport must not break the rest of the catalog.
      const results=await Promise.allSettled([
        api(`/api/events?live=${forceLive}`),
        ...virtualSports.map(x=>api(`/api/virtual/${encodeURIComponent(x)}?live=${forceLive}`))
      ]);
      events=results.filter(r=>r.status==="fulfilled").flatMap(r=>r.value?.events||[]);
      if(!results.some(r=>r.status==="fulfilled")) throw new Error("No se pudo cargar ningún motor");
    }else if(virtualSports.includes(sport)){
      const d=await api(`/api/virtual/${encodeURIComponent(sport)}?live=${forceLive}`);
      events=d.events||[];
    }else if(sport==="Fútbol"){
      // Only this branch touches the real football/API-Football event feed.
      const d=await api(`/api/events?live=${forceLive}`);
      events=d.events||[];
    }else{
      events=[];
    }
    M=normalizeEvents(events);$("#viewTitle").textContent=sport==="Todos"?(forceLive?"🔴 EN VIVO AHORA":"EVENTOS"):`${forceLive?"🔴":"📅"} ${sport}`;$("#feedNotice").classList.add("hidden");render();
  }catch(e){toast(e.message)}
}
async function loadUpcoming(){try{hotMode=false;raceMode=false;feedMode="upcoming";liveOnly=false;$("#matches").innerHTML="<div class=empty>Cargando partidos reales...</div>";const d=await api("/api/events/upcoming-real");M=normalizeEvents(d.events);$("#viewTitle").textContent="📅 PRÓXIMOS PARTIDOS";const src=d.source||"BETLIVE";$("#feedNotice").textContent=d.error?`BetLive conserva los partidos disponibles. Fuente adicional no disponible: ${d.error}`:`Fuente: ${src}. Los mercados internos de BetLive no dependen de las cuotas externas.`;$("#feedNotice").classList.remove("hidden");render()}catch(e){$("#matches").innerHTML=`<div class=empty>No se pudieron cargar los próximos partidos.<br><small>${escapeHtml(e.message)}</small><br><button id="retryUpcoming" class="red" style="margin-top:12px">Reintentar</button></div>`;const b=$("#retryUpcoming");if(b)b.onclick=loadUpcoming;toast(e.message)}}
async function loadHot(live=true){
  try{
    hotMode=true;raceMode=false;feedMode=live?"hot-live":"hot-upcoming";liveOnly=live;
    $("#events").classList.remove("hidden");$("#bets").classList.add("hidden");
    $("#matches").innerHTML="<div class=empty>Cargando HOT 2H2...</div>";
    const d=await api(live?"/api/events/hot?live=true":"/api/events/hot/upcoming");
    M=normalizeEvents(d.events);$("#viewTitle").textContent=live?"🔥 HOT 2H2 · EN VIVO":"🔥 HOT 2H2 · PRÓXIMOS";
    $("#feedNotice").textContent="🔥 HOT · partidos 2H2 de 8 minutos. Cada evento usa personajes y datos propios de la categoría HOT.";if(d.warning)$("#feedNotice").textContent+=" · Motor: "+d.warning;
    $("#feedNotice").classList.remove("hidden");render();
  }catch(e){$("#matches").innerHTML=`<div class=empty>No se pudo cargar HOT 2H2.<br><small>${escapeHtml(e.message)}</small><br><button id="retryHot" class="red" style="margin-top:12px">Reintentar</button></div>`;$("#retryHot")?.addEventListener("click",()=>loadHot(live));toast(e.message)}
}
async function loadRaces(upcoming=false){try{hotMode=false;raceMode=true;feedMode=upcoming?'race-upcoming':'race-live';liveOnly=!upcoming;$('#matches').innerHTML='<div class=empty>Cargando carreras...</div>';const d=await api(upcoming?'/api/races/upcoming':'/api/events/races');M=normalizeEvents(d.events);$('#viewTitle').textContent=upcoming?'🏎️ PRÓXIMAS CARRERAS':'🏎️ CARRERAS · EN VIVO';$('#feedNotice').textContent='🏎️ HOT · Carreras virtuales con motor propio y estadísticas generadas.';$('#feedNotice').classList.remove('hidden');render()}catch(e){toast(e.message)}}
async function loadMe(){try{let d=await api("/api/me");user=d.user;$("#balance").textContent=money(user.balance_cents);$("#account").textContent=(user.name||"U")[0].toUpperCase()}catch{user=null;$("#balance").textContent="$0.00"}}
async function loadTickets(mode="all"){
  if(!user){$("#history").innerHTML="<div class=empty>Inicia sesión para ver tus apuestas.</div>";return}
  try{
    const endpoint=mode==="pending"?"/api/bets/pending":"/api/bets/history";
    const d=await api(endpoint);
    const title=mode==="pending"?"Apuestas pendientes":"Historial de apuestas";
    $("#bets h2").textContent=title;
    $("#history").innerHTML=d.tickets.length?d.tickets.map(t=>{const status=t.status==='PENDING'?'Pendiente':t.status==='WON'?'Ganada':t.status==='LOST'?'Perdida':t.status==='VOID'?'Anulada':t.status;const sels=(t.selections||[]).map(s=>`<div><b>${escapeHtml(s.home||'')}</b> vs <b>${escapeHtml(s.away||'')}</b><small>${escapeHtml(s.league||'')} · ${escapeHtml(s.label||'')} · Cuota ${Number(s.odds||0).toFixed(2)}</small></div>`).join('');return `<div class="bet-card"><div class="bet-card-top"><b>${money(t.stake_cents)} · Cuota ${Number(t.total_odds).toFixed(2)}</b><span class="bet-status ${t.status.toLowerCase()}">${status}</span></div><small>${new Date(t.created_at).toLocaleString('es-MX')} · Potencial ${money(t.potential_cents)}</small><div class="bet-selections">${sels}</div></div>`}).join(""):"<div class=empty>No hay apuestas en esta sección.</div>";
  }catch(e){toast(e.message)}
}
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function render(){
  let q=$("#search").value.toLowerCase(),a=M.filter(m=>(hotMode?m.hot:(raceMode?m.race:(sport==="Todos"||m.sport===sport)))&&(!q||(`${m.home} ${m.away} ${m.league}`).toLowerCase().includes(q))).filter(m=>filter==="all"||filter==="featured"&&m.featured||filter==="video"&&m.video||filter==="goals"&&(m.score[0]+m.score[1]>0));
  $("#count").textContent=a.length+" eventos";
  $("#matches").innerHTML=a.map(m=>{
    const isLive=m.status==="LIVE";
    const time=isLive?(m.liveStatus?`${m.liveStatus}${m.liveElapsed!=null?` · ${m.liveElapsed}'`:""}`:"● EN VIVO"):(m.status==="OPEN"?"● PRÓXIMO":"● CERRADO");
    const visibleMarkets=(m.markets||[]).filter(x=>(x.selections||[]).length).slice(0,8);
    const raceStatsHtml=m.race&&m.raceStats?`<div class="hot-stats"><b>🏎️ HOT · Carrera</b><div><span>Vuelta: ${m.raceStats.lap??0}</span><span>${(m.raceStats.drivers||[]).slice().sort((a,b)=>a.position-b.position).slice(0,5).map(d=>`${escapeHtml(d.position)}. ${escapeHtml(d.name)}`).join(' · ')}</span></div></div>`:'';
    const marketHtml=visibleMarkets.map(mk=>`<div class="live-market"><b>${escapeHtml(mk.name)}</b><div class="live-market-options">${(mk.selections||[]).slice(0,6).map(s=>{
      const selected=slip.some(x=>x.selectionId===s.id);
      const marketCode = s.code === 'L' ? 'L' : s.code === 'E' ? 'E' : s.code === 'V' ? 'V' : '';
      return `<button class="odd ${selected?"sel":""}" data-id="${m.id}" data-sid="${s.id}" ${s.status!=="OPEN"||m.status==="CLOSED"?"disabled":""}><small>${marketCode?`<b class="lev-code">${marketCode}</b> `:''}${escapeHtml(s.label)}</small><b>${displayOdds(s.odds)}</b></button>`;
    }).join("")}</div></div>`).join("");
    return `<article class="match">
      <div class="matchtop"><span>${escapeHtml(m.league)}</span><span class="live">${isLive?"🔴 ":""}${escapeHtml(time)}</span><span>${m.video?"▶ VIDEO":""}</span></div>
      <div class="event"><span>☆</span><div class="team">${escapeHtml(m.home)}<small>${m.score[0]}</small></div></div>
      <div class="scoreline">${isLive?`Marcador en vivo · ${m.score[0]} - ${m.score[1]}`:""} </div>
      <div class="event" style="padding-top:0"><span></span><div class="team">${escapeHtml(m.away)}<small>${m.score[1]}</small></div></div>
      ${raceStatsHtml}${m.hot && m.hotStats ? `<div class="hot-stats"><b>🔥 HOT · Datos del partido</b><div><span>Win: ${m.hotStats.winPct?.[0]??0}% / ${m.hotStats.winPct?.[1]??0}% / ${m.hotStats.winPct?.[2]??0}%</span><span>Posesión: ${m.hotStats.possession?.[0]??0}% - ${m.hotStats.possession?.[1]??0}%</span><span>Tiros: ${m.hotStats.shots?.[0]??0} - ${m.hotStats.shots?.[1]??0}</span><span>Ataques: ${m.hotStats.attacks?.[0]??0} - ${m.hotStats.attacks?.[1]??0}</span></div></div>` : ''}
      ${marketHtml||'<div class="empty">Sin mercados disponibles en este momento.</div>'}
    </article>`;
  }).join("")||(liveOnly?"<div class=empty>🔴 No hay partidos en vivo disponibles en este momento.</div>":"<div class=empty>No hay eventos disponibles.</div>");
  $$('.odd').forEach(b=>b.onclick=()=>pickSelection(b.dataset.id,b.dataset.sid));
  renderSlip()
}
function pickSelection(eventId,selectionId){
  const m=M.find(x=>x.id===eventId), s=m?.markets?.flatMap(x=>x.selections||[]).find(x=>x.id===selectionId);
  if(!m||!s)return;
  const market=m.markets.find(x=>(x.selections||[]).some(y=>y.id===selectionId));
  const x={id:eventId,selectionId,odd:Number(s.odds),home:m.home,away:m.away,league:m.league,label:`${market?.name||"Mercado"}: ${s.label}`,code:s.code};
  if(quickMode){quick=x;$("#qselection").innerHTML=`<b>${escapeHtml(x.home)} vs ${escapeHtml(x.away)}</b><br>${escapeHtml(x.league)} · ${escapeHtml(x.label)} · ${americanOdds(x.odd)} (${x.odd.toFixed(2)})`;$("#qbet").disabled=false;return}
  const p=slip.findIndex(y=>y.id===selectionId);
  if(p>=0)slip.splice(p,1);else{if(type==="single")slip=[];slip.push(x)}
  render()
}
function pick(id,i){let m=M.find(x=>x.id===id),o=m?.odds[i];if(!o)return;let x={id,i,selectionId:o.id,odd:o.odd,home:m.home,away:m.away,league:m.league,label:o.label,code:o.code};if(quickMode){quick=x;$("#qselection").innerHTML=`<b>${x.home} vs ${x.away}</b><br>${x.league} · ${x.label} · ${americanOdds(x.odd)} (${x.odd.toFixed(2)})`;$("#qbet").disabled=false;return}let p=slip.findIndex(y=>y.id===id);if(p>=0)slip.splice(p,1);else{if(type==="single")slip=[];slip.push(x)}render()}
function renderSlip(){let o=slip.reduce((a,x)=>a*x.odd,1),st=Math.round(Number($("#stake").value)*100)||0;$("#slipItems").innerHTML=slip.length?slip.map((x,i)=>`<div class=slip-item><button class=remove data-r=${i}>×</button><b>${x.home} vs ${x.away}</b><small>${x.league} · ${x.label} · ${americanOdds(x.odd)} (${x.odd.toFixed(2)})</small></div>`).join(""):"<div class=empty>Selecciona un momio para agregarlo.</div>";$$('.remove').forEach(b=>b.onclick=()=>{slip.splice(+b.dataset.r,1);render()});$("#odds").textContent=slip.length?o.toFixed(2):"0.00";$("#potential").textContent=money(st*o);$("#ticketCount").textContent=slip.length;$("#mobileCount").textContent=slip.length;$("#mobilePot").textContent=money(st*o);$("#bet").disabled=!user||!slip.length||st<100||!user.balance_cents||st>Number(user.balance_cents)}
async function submitTicket(items,stakeCents){if(!user)return openAuth();if(!items.length)return toast("Selecciona un momio");try{const d=await api("/api/tickets",{method:"POST",body:JSON.stringify({stakeCents,selectionIds:items.map(x=>x.selectionId)})});await loadMe();await loadTickets();slip=[];render();toast("Ticket creado ✓") }catch(e){toast(e.message)}}
$("#bet").onclick=()=>submitTicket(slip,Math.round(Number($("#stake").value)*100));$("#qbet").onclick=()=>{let s=Math.round(Number($("#qstake").value)*100);if(!quick)return;if(s<100)return toast("Importe mínimo: $1");submitTicket([quick],s);quick=null;$("#qselection").textContent="Ningún momio seleccionado.";$("#qbet").disabled=true};
async function loadWithdrawalRequests(){
  if(!user){return openAuth()}
  try{
    const d=await api("/api/wallet/requests");
    const rows=(d.requests||[]).filter(r=>r.type==="WITHDRAWAL");
    $("#events").classList.add("hidden");$("#bets").classList.remove("hidden");
    $("#bets h2").textContent="Retiros pendientes";
    $("#history").innerHTML=rows.length?rows.map(r=>{
      const st=r.status==='PENDING'?'Pendiente':r.status==='APPROVED'?'Pago autorizado':r.status==='PAID'?'Pagado':r.status==='REJECTED'?'Rechazado':r.status;
      const cls=r.status==='PAID'?'ok':r.status==='REJECTED'?'bad':'pending';
      return `<div class="ticket-card"><div class="ticket-head"><b>Retiro ${money(r.amount_cents)}</b><span class="pill ${cls}">${st}</span></div><small>${new Date(r.created_at).toLocaleString('es-MX')}</small>${r.payout_details?`<div class="ticket-selections"><b>Datos de pago</b><br>${escapeHtml(r.payout_details.method||'')} · ${escapeHtml(r.payout_details.bank||'')}<br>${escapeHtml(r.payout_details.accountHolder||'')} · ${escapeHtml(r.payout_details.clabe||r.payout_details.accountNumber||'')}<br>Tel. ${escapeHtml(r.payout_details.phone||'')}</div>`:''}${r.admin_note?`<div class="ticket-note">${escapeHtml(r.admin_note)}</div>`:''}</div>`}).join(''):'<div class=empty>No tienes retiros registrados.</div>';
  }catch(e){toast(e.message)}
}

$$('[data-sport]').forEach(b=>b.onclick=()=>{hotMode=false;raceMode=false;sport=b.dataset.sport;$("#drawer").classList.add("hidden");loadEvents(true)});
$$('[data-hot]').forEach(b=>b.onclick=()=>{raceMode=false;loadHot(true)});$$('[data-races]').forEach(b=>b.onclick=()=>loadRaces(false));$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle("active",x===b));render()});$("#search").oninput=render;$("#stake").oninput=renderSlip;$$('.quickmoney button').forEach(b=>b.onclick=()=>{$("#stake").value=Number(b.dataset.a);renderSlip()});$("#clear").onclick=()=>{slip=[];render()};$$('[data-type]').forEach(b=>b.onclick=()=>{type=b.dataset.type;$$('[data-type]').forEach(x=>x.classList.toggle("active",x===b));if(type==="single"&&slip.length>1)slip=slip.slice(-1);render()});
$$('[data-tab]').forEach(b=>b.onclick=()=>{quickMode=b.dataset.tab==="quick";$("#normalPanel").classList.toggle("hidden",quickMode);$("#quickPanel").classList.toggle("hidden",!quickMode);$$('[data-tab]').forEach(x=>x.classList.toggle("active",x===b))});
$("#menu").onclick=()=>$("#drawer").classList.remove("hidden");$("#closeDrawer").onclick=()=>$("#drawer").classList.add("hidden");$("#drawerLive").onclick=async()=>{$("#bets").classList.add("hidden");$("#events").classList.remove("hidden");$("#drawer").classList.add("hidden");await loadEvents(true)};$("#drawerUpcoming").onclick=async()=>{$("#bets").classList.add("hidden");$("#events").classList.remove("hidden");$("#drawer").classList.add("hidden");await loadUpcoming()};$("#showUpcoming").onclick=async()=>{hotMode=false;$("#bets").classList.add("hidden");$("#events").classList.remove("hidden");await loadUpcoming()};$("#showHotUpcoming").onclick=async()=>{raceMode=false;await loadHot(false)};$("#showRaceUpcoming").onclick=async()=>loadRaces(true);$("#drawerPromos").onclick=()=>openPromos();$("#drawerNotifications").onclick=()=>openNotifications();$("#drawerBets").onclick=()=>{$("#events").classList.add("hidden");$("#bets").classList.remove("hidden");$("#drawer").classList.add("hidden");loadTickets("all")};$("#drawerPending").onclick=()=>{$("#drawer").classList.add("hidden");loadWithdrawalRequests()};$("#drawerProfile").onclick=()=>{$("#drawer").classList.add("hidden");openProfile()};$("#drawerHelp").onclick=()=>{$("#drawer").classList.add("hidden");openSupport()};$("#mobileSlip").onclick=()=>$("#betSlip").classList.toggle("mobile-open");$("#ticketTop").onclick=()=>{if(window.innerWidth<=700)$("#mobileSlip").click();else document.querySelector(".slip").scrollIntoView({behavior:"smooth"})};
$("#showBets").onclick=()=>{$("#events").classList.add("hidden");$("#bets").classList.remove("hidden");loadTickets("all")};$("#showLive").onclick=async()=>{$("#bets").classList.add("hidden");$("#events").classList.remove("hidden");await loadEvents(true)};
function openAuth(){if(user){toast("Sesión activa");return}$("#auth").classList.remove("hidden");$("#loginBox").classList.remove("hidden");$("#registerBox").classList.add("hidden")}$("#account").onclick=openAuth;$("#closeAuth").onclick=()=>$("#auth").classList.add("hidden");$("#registerLink").onclick=()=>{$("#loginBox").classList.add("hidden");$("#registerBox").classList.remove("hidden")};$("#loginLink").onclick=()=>{$("#registerBox").classList.add("hidden");$("#loginBox").classList.remove("hidden")};
$("#register").onclick=async()=>{try{let n=$("#rn").value.trim(),c=$("#rc").value.trim(),p=$("#rp").value;if(!n||!c||p.length<8)return toast("Completa los datos");let body=c.includes("@")?{name:n,email:c,password:p}:{name:n,phone:c,password:p};let d=await api("/api/auth/register",{method:"POST",body:JSON.stringify(body)});user=d.user;$("#auth").classList.add("hidden");await loadMe();renderSlip();toast("Cuenta creada ✓")}catch(e){toast(e.message)}};
$("#login").onclick=async()=>{try{let d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({identifier:$("#lc").value.trim(),password:$("#lp").value})});user=d.user;$("#auth").classList.add("hidden");await loadMe();renderSlip();toast("Sesión iniciada ✓")}catch(e){toast(e.message)}};
$$('[data-oauth]').forEach(b=>b.onclick=()=>{ window.location.href="/api/auth/google?action=login"; });
$$('[data-link-oauth]').forEach(b=>b.onclick=()=>{ const provider=b.dataset.linkOauth; if(provider==="google") window.location.href="/api/auth/google?action=link"; });
setInterval(()=>{if(document.visibilityState!=="visible")return;if(hotMode)loadHot(liveOnly);else if(raceMode)loadRaces(!liveOnly);else if(["live","all"].includes(feedMode))loadEvents(liveOnly)},15000);
renderSlip();

let supportTimer=null;
function supportBubble(m){const mine=m.sender_role==='USER';return `<div class="support-msg ${mine?'mine':'admin'}"><b>${mine?'Tú':'Soporte BetLive'}</b><p>${escapeHtml(m.message)}</p><small>${new Date(m.created_at).toLocaleString('es-MX')}</small></div>`}
async function loadSupport(){if(!user)return openAuth();try{const d=await api('/api/support/messages');$("#supportMessages").innerHTML=d.messages.map(supportBubble).join('')||'<div class="empty">Hola 👋. ¿En qué podemos ayudarte?</div>';const box=$("#supportMessages");box.scrollTop=box.scrollHeight}catch(e){toast(e.message)}}
function openSupport(){if(!user)return openAuth();$("#supportModal").classList.remove('hidden');loadSupport();clearInterval(supportTimer);supportTimer=setInterval(loadSupport,5000)}
$("#closeSupport").onclick=()=>{$("#supportModal").classList.add('hidden');clearInterval(supportTimer)};
$("#supportSend").onclick=async()=>{try{const input=$("#supportInput"),message=input.value.trim();if(!message)return toast('Escribe un mensaje');await api('/api/support/messages',{method:'POST',body:JSON.stringify({message})});input.value='';await loadSupport()}catch(e){toast(e.message)}};
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

async function openPromos(){try{const d=await api('/api/promotions');const c=user?await api('/api/promo-calendar'):null;$('#promoList').innerHTML=d.promotions.length?d.promotions.map(p=>`<div class="bet-card"><b>🎁 ${escapeHtml(p.title)}</b><p>${escapeHtml(p.body)}</p><small>${p.bonus_cents?`Beneficio: ${money(p.bonus_cents)} · `:''}${p.min_deposit_cents?`Mínimo: ${money(p.min_deposit_cents)} · `:''}${escapeHtml(p.terms||'')}</small></div>`).join(''):'<div class=empty>No hay promociones activas.</div>';$('#promoCalendar').innerHTML=c?.days?.length?c.days.map(x=>`<div class="profile-row"><b>Día ${x.day_no}</b> · ${escapeHtml(x.title)}<small>${escapeHtml(x.reward_label)} · ${escapeHtml(x.body)}</small></div>`).join(''):'<div class=empty>Inicia sesión para consultar el calendario.</div>';$('#promoModal').classList.remove('hidden')}catch(e){toast(e.message)}}
async function openNotifications(){if(!user)return openAuth();try{const d=await api('/api/notifications');$('#notifList').innerHTML=d.notifications.length?d.notifications.map(n=>`<div class="bet-card ${n.read_at?'':'unread'}"><b>${escapeHtml(n.title)}</b><p>${escapeHtml(n.body)}</p><small>${new Date(n.created_at).toLocaleString('es-MX')}</small>${!n.read_at?`<button class="social" data-read-notif="${n.id}">Marcar como leída</button>`:''}</div>`).join(''):'<div class=empty>No tienes notificaciones.</div>';$$('[data-read-notif]').forEach(b=>b.onclick=async()=>{await api('/api/notifications/'+b.dataset.readNotif+'/read',{method:'POST'});openNotifications()});$('#notifModal').classList.remove('hidden')}catch(e){toast(e.message)}}
$('#closePromo')?.addEventListener('click',()=>$('#promoModal').classList.add('hidden'));$('#closeNotif')?.addEventListener('click',()=>$('#notifModal').classList.add('hidden'));
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
async function bootSplash(){const splash=$('#splash');if(!splash)return;const status=$('#splashStatus');status.textContent='BetLive lista';setTimeout(()=>splash.classList.add('hidden'),700);Promise.allSettled([loadMe(),loadEvents(true)]).catch(()=>{});}
bootSplash();
