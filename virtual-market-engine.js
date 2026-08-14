// BetLive Virtual Market Engine V2
// Ported/adapted from the standalone virtual-engine-v1 concepts:
// probability model -> margin -> odds -> market definitions.
// This module is deterministic and does not use API-Football.

function clamp(x,min,max){ return Math.max(min,Math.min(max,x)); }
function n(x,f=0){ const v=Number(x); return Number.isFinite(v)?v:f; }
function normalize(values){
  const safe=values.map(v=>Math.max(0.0001,n(v)));
  const sum=safe.reduce((a,b)=>a+b,0);
  return safe.map(v=>v/sum);
}
function hash(value){
  const s=String(value??''); let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return h>>>0;
}
function price(prob,margin=.055){
  const p=clamp(prob,0.01,.97);
  return Number(clamp(1/(p*(1+margin)),1.01,25).toFixed(2));
}
function twoWay(pHome,margin){
  const [h,a]=normalize([pHome,1-pHome]);
  return [price(h,margin),price(a,margin)];
}
function threeWay(probs,margin){ return normalize(probs).map(p=>price(p,margin)); }
function eventProgress(event,duration){
  const elapsed=clamp(n(event.live_elapsed,0)/Math.max(1,duration),0,1);
  return {elapsed,live:String(event.status||'')==='LIVE'};
}
function scoreState(event,duration){
  const home=n(event.home_score),away=n(event.away_score),{elapsed,live}=eventProgress(event,duration);
  const diff=home-away;
  return {home,away,diff,elapsed,live};
}
function strengthBias(event,seed){
  const stats=event.hot_stats||{};
  const wp=Array.isArray(stats.winPct)?n(stats.winPct[0],50):50;
  const poss=Array.isArray(stats.possession)?n(stats.possession[0],50):50;
  const shots=Array.isArray(stats.shots)?n(stats.shots[0],0)-n(stats.shots[1],0):0;
  const deterministic=((hash(`${seed}:strength`)%17)-8)/200;
  return clamp((wp-50)/180+(poss-50)/260+shots/500+deterministic,-.18,.18);
}
function winnerProbs(event,cfg,seed){
  const {diff,elapsed,live}=scoreState(event,cfg.durationMinutes);
  const bias=strengthBias(event,seed);
  if(!live || elapsed<=0) return normalize([.50+bias,.50-bias]);
  if(diff===0){
    const edge=clamp(bias*(1-.45*elapsed),-.10,.10);
    return normalize([.50+edge,.50-edge]);
  }
  const lead=clamp(.57+.22*elapsed+.055*Math.min(Math.abs(diff),3),.57,.91);
  return diff>0?[lead,1-lead]:[1-lead,lead];
}
function threeWayProbs(event,cfg,seed){
  const {diff,elapsed,live}=scoreState(event,cfg.durationMinutes);
  const bias=strengthBias(event,seed);
  if(!live || elapsed<=0){
    const draw=.27;
    return normalize([.50+bias*.7,draw,.50-bias*.7]);
  }
  if(diff===0){
    const draw=clamp(.30+.48*elapsed,.30,.78);
    const side=(1-draw)/2;
    return normalize([side+bias*.15,draw,side-bias*.15]);
  }
  const win=clamp(.57+.22*elapsed+.055*Math.min(Math.abs(diff),3),.57,.92);
  const draw=clamp(.21-.10*elapsed,.07,.21);
  const lose=Math.max(.01,1-win-draw);
  return diff>0?normalize([win,draw,lose]):normalize([lose,draw,win]);
}
function totalProbability(event,cfg,seed,baseTotal){
  const {home,away,elapsed,live}=scoreState(event,cfg.durationMinutes);
  const stats=event.hot_stats||{};
  const attacks=(Array.isArray(stats.attacks)?n(stats.attacks[0])+n(stats.attacks[1]):0);
  const shots=(Array.isArray(stats.shots)?n(stats.shots[0])+n(stats.shots[1]):0);
  const current=home+away;
  const remaining=1-elapsed;
  const expectedFuture=live ? Math.max(0,baseTotal*remaining*(.72+clamp(attacks/Math.max(1,elapsed*100),0,1)*.22+clamp(shots/Math.max(1,elapsed*15),0,1)*.16)) : baseTotal;
  const expected=current+expectedFuture;
  const line=Math.max(.5,Math.floor(expected)+.5);
  const delta=expected-line;
  const over=clamp(.50+delta*.12+(live&&remaining<.35?delta*.05:0),.18,.82);
  return {line,over};
}
function market2(name,type,homeLabel,awayLabel,pHome,margin){
  const [h,a]=twoWay(clamp(pHome,.05,.95),margin);
  return {type,name,selections:[{code:'H',label:homeLabel,odds:h},{code:'A',label:awayLabel,odds:a}]};
}

export function buildVirtualMarkets(event,cfg={}){
  const margin=clamp(n(cfg.margin,.055),.02,.12);
  const seed=`${cfg.source||event.external_source||'VIRTUAL'}:${event.id}`;
  const stats=event.hot_stats||{};
  const {diff,elapsed,live}=scoreState(event,cfg.durationMinutes||8);
  const markets=[];

  if(cfg.sport==='Fútbol'){
    const p=threeWayProbs(event,cfg,seed);
    const odds=threeWay(p,margin);
    const total=totalProbability(event,cfg,seed,2.35);
    const btts=clamp(.47+(n(event.home_score)+n(event.away_score))*-.04+(live?elapsed*.08:0)+strengthBias(event,seed)*.2,.18,.82);
    markets.push({type:'MATCH_WINNER',name:'Ganador 1X2',selections:[{code:'1',label:event.home_team,odds:odds[0]},{code:'X',label:'Empate',odds:odds[1]},{code:'2',label:event.away_team,odds:odds[2]}]});
    markets.push({type:'TOTAL_GOALS',name:`Total de goles ${total.line}`,selections:[{code:'O',label:`Más de ${total.line}`,odds:price(total.over,margin)},{code:'U',label:`Menos de ${total.line}`,odds:price(1-total.over,margin)}]});
    markets.push({type:'HANDICAP',name:'Hándicap -1/+1',selections:[{code:'H1',label:`${event.home_team} -1`,odds:price(clamp(p[0]*.82,.08,.82),margin)},{code:'H2',label:`${event.away_team} +1`,odds:price(clamp(1-p[0]*.82,.08,.92),margin)}]});
    markets.push({type:'BOTH_SCORE',name:'Ambos marcan',selections:[{code:'BTTS_Y',label:'Sí',odds:price(btts,margin)},{code:'BTTS_N',label:'No',odds:price(1-btts,margin)}]});
    markets.push({type:'DOUBLE_CHANCE',name:'Doble oportunidad',selections:[{code:'1X',label:`${event.home_team} o Empate`,odds:price(clamp(p[0]+p[1],.05,.95),margin)},{code:'X2',label:`Empate o ${event.away_team}`,odds:price(clamp(p[1]+p[2],.05,.95),margin)},{code:'12',label:'Local o Visitante',odds:price(clamp(p[0]+p[2],.05,.95),margin)}]});
  } else if(cfg.sport==='Básquetbol'){
    const [ph]=winnerProbs(event,cfg,seed); const total=totalProbability(event,cfg,seed,165.5);
    const pace=Array.isArray(stats.attacks)?n(stats.attacks[0])+n(stats.attacks[1]):0;
    const team=clamp(.50+(ph-.5)*.7+(pace>100?.025:0),.18,.82);
    markets.push(market2('Ganador del partido','MATCH_WINNER',event.home_team,event.away_team,ph,margin));
    markets.push({type:'SPREAD',name:'Hándicap',selections:[{code:'HS',label:`${event.home_team} -4.5`,odds:price(clamp(ph*.88,.08,.9),margin)},{code:'AS',label:`${event.away_team} +4.5`,odds:price(clamp(1-ph*.88,.08,.92),margin)}]});
    markets.push({type:'TOTAL_POINTS',name:`Total de puntos ${total.line}`,selections:[{code:'O',label:`Más de ${total.line}`,odds:price(total.over,margin)},{code:'U',label:`Menos de ${total.line}`,odds:price(1-total.over,margin)}]});
    markets.push({type:'TEAM_TOTAL',name:'Puntos local',selections:[{code:'HO',label:'Más de 82.5',odds:price(team,margin)},{code:'HU',label:'Menos de 82.5',odds:price(1-team,margin)}]});
    markets.push({type:'ALT_SPREAD',name:'Hándicap alternativo',selections:[{code:'HA',label:`${event.home_team} -1.5`,odds:price(clamp(ph*.76,.08,.9),margin)},{code:'AA',label:`${event.away_team} +7.5`,odds:price(clamp(1-ph*.76,.08,.92),margin)}]});
  } else if(cfg.sport==='Béisbol'){
    const [ph]=winnerProbs(event,cfg,seed); const total=totalProbability(event,cfg,seed,8.5);
    const inning=clamp(.50+(ph-.5)*.55+(live?elapsed*.04:0),.2,.8);
    markets.push(market2('Ganador del juego','MATCH_WINNER',event.home_team,event.away_team,ph,margin));
    markets.push({type:'RUN_LINE',name:'Carrera de ventaja',selections:[{code:'RLH',label:`${event.home_team} -1.5`,odds:price(clamp(ph*.78,.08,.9),margin)},{code:'RLA',label:`${event.away_team} +1.5`,odds:price(clamp(1-ph*.78,.08,.92),margin)}]});
    markets.push({type:'TOTAL_RUNS',name:`Total de carreras ${total.line}`,selections:[{code:'O',label:`Más de ${total.line}`,odds:price(total.over,margin)},{code:'U',label:`Menos de ${total.line}`,odds:price(1-total.over,margin)}]});
    markets.push({type:'TEAM_RUNS',name:'Carreras local',selections:[{code:'HO',label:'Más de 3.5',odds:price(inning,margin)},{code:'HU',label:'Menos de 3.5',odds:price(1-inning,margin)}]});
    markets.push({type:'FIRST_INNING',name:'Primera entrada',selections:[{code:'Y',label:'Ambos anotan',odds:price(.42+(live?elapsed*.08:0),margin)},{code:'N',label:'No anotan ambos',odds:price(.58-(live?elapsed*.08:0),margin)}]});
  } else if(cfg.sport==='Tenis'){
    const [ph]=winnerProbs(event,cfg,seed); const games=totalProbability(event,cfg,seed,21.5);
    markets.push(market2('Ganador del partido','MATCH_WINNER',event.home_team,event.away_team,ph,margin));
    markets.push({type:'SETS',name:'Total de sets',selections:[{code:'O',label:'Más de 2.5',odds:price(clamp(.42+(1-Math.abs(ph-.5)*1.2)*.08,.18,.78),margin)},{code:'U',label:'Menos de 2.5',odds:price(clamp(.58+(Math.abs(ph-.5)*1.2)*.08,.18,.82),margin)}]});
    markets.push({type:'GAMES',name:`Total de juegos ${games.line}`,selections:[{code:'O',label:`Más de ${games.line}`,odds:price(games.over,margin)},{code:'U',label:`Menos de ${games.line}`,odds:price(1-games.over,margin)}]});
    markets.push({type:'SET1',name:'Ganador set 1',selections:[{code:'H1',label:event.home_team,odds:price(clamp(ph*.96,.08,.92),margin)},{code:'A1',label:event.away_team,odds:price(clamp(1-ph*.96,.08,.92),margin)}]});
    markets.push({type:'HANDICAP_GAMES',name:'Hándicap de juegos',selections:[{code:'HG1',label:`${event.home_team} -2.5`,odds:price(clamp(ph*.84,.08,.9),margin)},{code:'HG2',label:`${event.away_team} +2.5`,odds:price(clamp(1-ph*.84,.08,.92),margin)}]});
  } else {
    const [ph]=winnerProbs(event,cfg,seed); const total=totalProbability(event,cfg,seed,5.5);
    markets.push(market2('Ganador del partido','MATCH_WINNER',event.home_team,event.away_team,ph,margin));
    markets.push({type:'PUCK_LINE',name:'Línea de puck',selections:[{code:'PH',label:`${event.home_team} -1.5`,odds:price(clamp(ph*.78,.08,.9),margin)},{code:'PA',label:`${event.away_team} +1.5`,odds:price(clamp(1-ph*.78,.08,.92),margin)}]});
    markets.push({type:'TOTAL_GOALS',name:`Total de goles ${total.line}`,selections:[{code:'O',label:`Más de ${total.line}`,odds:price(total.over,margin)},{code:'U',label:`Menos de ${total.line}`,odds:price(1-total.over,margin)}]});
    markets.push({type:'TEAM_TOTAL',name:'Goles local',selections:[{code:'HO',label:'Más de 2.5',odds:price(clamp(ph*.74,.08,.9),margin)},{code:'HU',label:'Menos de 2.5',odds:price(clamp(1-ph*.74,.08,.92),margin)}]});
    markets.push({type:'PERIOD1',name:'Primer periodo',selections:[{code:'H1',label:event.home_team,odds:price(clamp(ph*.88,.08,.9),margin)},{code:'A1',label:event.away_team,odds:price(clamp(1-ph*.88,.08,.92),margin)}]});
  }
  return markets;
}

export const virtualMarketEngineMeta={version:'2.0.0',margin:.055,source:'BETLIVE_VIRTUAL_ENGINE_V2'};
