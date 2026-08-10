const initialMatches = [
  {id:1, league:"Liga Internacional", home:"Barcelona", away:"Real Madrid", minute:67, score:[1,0], odds:[1.72,3.80,4.50]},
  {id:2, league:"Premier Virtual", home:"Manchester City", away:"Liverpool", minute:82, score:[2,2], odds:[2.10,3.20,2.85]},
  {id:3, league:"Serie Virtual", home:"Milan", away:"Inter", minute:54, score:[0,1], odds:[3.15,3.25,2.05]},
  {id:4, league:"Liga Virtual MX", home:"América", away:"Tigres", minute:39, score:[1,1], odds:[2.25,3.35,2.70]}
];

let matches = JSON.parse(JSON.stringify(initialMatches));
let balance = Number(localStorage.getItem("betlive_balance") || 10000);
let history = JSON.parse(localStorage.getItem("betlive_history") || "[]");
let slip = [];

const $ = s => document.querySelector(s);
const money = n => "$" + Number(n).toLocaleString("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2});

function save(){
  localStorage.setItem("betlive_balance", balance);
  localStorage.setItem("betlive_history", JSON.stringify(history));
}
function renderBalance(){ $("#balance").textContent = money(balance); }

function renderMatches(){
  $("#eventCount").textContent = `${matches.length} eventos`;
  $("#matches").innerHTML = matches.map(m=>`
    <article class="match">
      <div class="match-top">
        <div><span class="live-label">● EN VIVO</span> <span class="clock">${m.minute}′</span></div>
        <span class="league">${m.league}</span>
      </div>
      <div class="teams">
        <div class="team">${m.home}</div>
        <div class="score">${m.score[0]} - ${m.score[1]}</div>
        <div class="team">${m.away}</div>
      </div>
      <div class="markets">
        ${["1","X","2"].map((label,i)=>`
          <button class="odd ${slip.some(x=>x.matchId===m.id&&x.market===label)?"selected":""}"
            data-id="${m.id}" data-market="${label}" data-odd="${m.odds[i]}">
            <small>${label}</small><b>${m.odds[i].toFixed(2)}</b>
          </button>`).join("")}
      </div>
    </article>`).join("");
  document.querySelectorAll(".odd").forEach(b=>b.addEventListener("click",()=>{
    addToSlip(Number(b.dataset.id),b.dataset.market,Number(b.dataset.odd));
  }));
}

function addToSlip(matchId, market, odd){
  const m=matches.find(x=>x.id===matchId);
  const same=slip.findIndex(x=>x.matchId===matchId);
  if(same>=0){
    if(slip[same].market===market){ slip.splice(same,1); }
    else slip[same]={matchId,market,odd,home:m.home,away:m.away};
  } else {
    slip.push({matchId,market,odd,home:m.home,away:m.away});
  }
  renderSlip(); renderMatches();
}

function renderSlip(){
  $("#slipCount").textContent = `${slip.length} selección${slip.length===1?"":"es"}`;
  if(!slip.length){
    $("#slipItems").innerHTML=`<div class="empty">Selecciona una cuota para agregarla al cupón.</div>`;
    $("#totalOdds").textContent="0.00"; $("#potential").textContent="$0.00"; $("#placeBet").disabled=true; return;
  }
  $("#slipItems").innerHTML=slip.map((x,i)=>`
    <div class="slip-item"><div><b>${x.home} vs ${x.away}</b><small>Mercado ${x.market} · Cuota ${x.odd.toFixed(2)}</small></div>
    <button class="remove" data-remove="${i}">×</button></div>`).join("");
  document.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{slip.splice(Number(b.dataset.remove),1);renderSlip();renderMatches()});
  const total=slip.reduce((a,x)=>a*x.odd,1);
  const stake=Math.max(0,Number($("#stake").value)||0);
  $("#totalOdds").textContent=total.toFixed(2);
  $("#potential").textContent=money(stake*total);
  $("#placeBet").disabled=stake<1 || stake>balance;
}
$("#stake").addEventListener("input",renderSlip);

$("#clearSlip").onclick=()=>{slip=[];renderSlip();renderMatches()};
$("#placeBet").onclick=()=>{
  const stake=Number($("#stake").value)||0;
  if(!slip.length||stake<1||stake>balance)return;
  const total=slip.reduce((a,x)=>a*x.odd,1);
  balance-=stake;
  history.unshift({id:Date.now(),date:new Date().toLocaleString("es-MX"), selections:[...slip],stake,total,potential:stake*total,status:"pending"});
  slip=[]; save(); renderBalance(); renderSlip(); renderMatches(); renderHistory();
  toast("Apuesta virtual confirmada 🎟");
};

function renderHistory(){
  if(!history.length){$("#history").innerHTML=`<div class="empty">Todavía no tienes apuestas.</div>`;return}
  $("#history").innerHTML=history.map(h=>`
    <div class="history-card">
      <div class="row"><b>${money(h.stake)} · Cuota ${h.total.toFixed(2)}</b><span class="status ${h.status}">${h.status==="pending"?"PENDIENTE":h.status.toUpperCase()}</span></div>
      <small>${h.date} · Ganancia potencial ${money(h.potential)}</small>
      <div style="margin-top:8px;font-size:11px;color:#aaa">${h.selections.map(x=>`${x.home} ${x.market} ${x.odd.toFixed(2)}`).join(" · ")}</div>
    </div>`).join("");
}

function simulate(){
  matches.forEach(m=>{
    if(Math.random()<.32) m.minute++;
    if(m.minute>=90){
      m.minute=1; m.score=[0,0];
    }
    // Small random movement of virtual odds.
    m.odds=m.odds.map(o=>Math.max(1.08,Math.min(15,o*(1+(Math.random()-.5)*.025))));
    if(Math.random()<.035){
      const side=Math.random()<.5?0:1;
      m.score[side]++;
      toast(`⚽ Gol virtual: ${side===0?m.home:m.away}`);
    }
  });
  renderMatches();
}
setInterval(simulate,3000);

function showView(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  $(`#${view}View`).classList.remove("hidden");
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.view===view));
  $("#drawer").classList.add("hidden");
  if(view==="bets")renderHistory();
}
document.querySelectorAll(".tab,.drawer-link[data-view]").forEach(b=>b.onclick=()=>showView(b.dataset.view));
$("#menuBtn").onclick=()=>$("#drawer").classList.remove("hidden");
$("#closeDrawer").onclick=()=>$("#drawer").classList.add("hidden");
$("#profileBtn").onclick=()=>toast("Perfil demo: usuario virtual");
$("#resetBtn").onclick=()=>{
  balance=10000;history=[];slip=[];save();renderBalance();renderSlip();renderHistory();toast("Saldo demo reiniciado");
};

function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove("show"),2200)}
renderBalance();renderMatches();renderSlip();renderHistory();
