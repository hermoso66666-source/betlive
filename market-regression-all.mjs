import assert from 'node:assert/strict';
import { buildVirtualMarkets } from './virtual-market-engine.js';
const sports=['Fútbol','Básquetbol','Béisbol','Tenis','Hockey'];
const sources=['HOT_FOOTBALL','HOT_BASKETBALL','HOT_BASEBALL','HOT_TENNIS','HOT_HOCKEY'];
const cfg={durationMinutes:8};
const american=d=>d>=2?Math.round((d-1)*100):Math.round(-100/(d-1));
for(let i=0;i<sports.length;i++){
 const e={id:`${i}`,external_source:sources[i],sport:sports[i],home_team:'Home',away_team:'Away',status:'LIVE',live_elapsed:4,home_score:2,away_score:0,hot_stats:{winPct:[72,28],possession:[60,40],attacks:[40,25],shots:[15,8]}};
 const markets=buildVirtualMarkets(e,{...cfg,sport:sports[i],source:sources[i]});
 assert.equal(markets.length,5,`${sports[i]} debe tener 5 mercados`);
 for(const m of markets) for(const s of m.selections) assert(Number.isFinite(s.odds)&&s.odds>1&&s.odds<=25,`${sports[i]} cuota inválida`);
 const w=markets.find(m=>m.type==='MATCH_WINNER');
 if(w){ assert(w.selections[0].odds < w.selections[1].odds,`${sports[i]} favorito incorrecto`); assert(american(w.selections[0].odds)<0,`${sports[i]} favorito no negativo`); assert(american(w.selections[1].odds)>0,`${sports[i]} underdog no positivo`); }
 console.log(`${sports[i]} OK`, markets.map(m=>m.type).join(','));
}
