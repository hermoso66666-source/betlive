import assert from 'node:assert/strict';
import { buildVirtualMarkets } from './virtual-market-engine.js';

const cfg={durationMinutes:8};
const base={id:'demo',external_source:'HOT_BASKETBALL',sport:'Básquetbol',home_team:'A',away_team:'B',status:'LIVE',live_elapsed:4,home_score:30,away_score:20,hot_stats:{winPct:[68,32],possession:[58,42],attacks:[45,35],shots:[20,14]}};
const m=buildVirtualMarkets(base,{...cfg,sport:'Básquetbol',source:'HOT_BASKETBALL'});
assert(m.length>=5,'Debe haber al menos 5 mercados');
for(const market of m){
  assert(market.selections.length>=2,`Mercado incompleto: ${market.name}`);
  for(const s of market.selections){assert(Number.isFinite(s.odds)&&s.odds>1,`Cuota inválida en ${market.name}`);}
}
const winner=m.find(x=>x.type==='MATCH_WINNER');
assert(winner.selections[0].odds < winner.selections[1].odds,'El equipo que va ganando debe ser favorito en un mercado 2-vías');
const american=d=>d>=2?Math.round((d-1)*100):Math.round(-100/(d-1));
assert(american(winner.selections[0].odds)<0,'Favorito debe mostrar momio americano negativo');
assert(american(winner.selections[1].odds)>0,'Underdog debe mostrar momio americano positivo');
console.log('MARKET_REGRESSION_OK', {markets:m.length, winner:winner.selections.map(x=>({label:x.label,odds:x.odds,american:american(x.odds)}))});
