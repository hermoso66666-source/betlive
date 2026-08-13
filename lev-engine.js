function clamp(x,min,max){return Math.max(min,Math.min(max,x));}
function safeNum(x,fallback=0){const n=Number(x);return Number.isFinite(n)?n:fallback;}
function normalize3(a,b,c){const s=a+b+c;return s>0?[a/s,b/s,c/s]:[1/3,1/3,1/3];}
export function generateLEVMarket({historical={},live={},betting={},config={}}={}){
  const cfg={margin:.06,historyWeight:.45,formWeight:.20,liveWeight:.25,bettingWeight:.10,minOdds:1.05,maxOdds:25,...config};
  const hs=clamp(safeNum(historical.homeStrength,.5),0,1),as=clamp(safeNum(historical.awayStrength,.5),0,1);
  const hf=clamp(safeNum(historical.homeForm,.5),0,1),af=clamp(safeNum(historical.awayForm,.5),0,1);
  const hg=safeNum(live.homeGoals),ag=safeNum(live.awayGoals),minute=clamp(safeNum(live.minute),0,120);
  const baseEdge=clamp((hs-as)*.30+(hf-af)*.20,-.25,.25);
  const base=normalize3(.45+baseEdge,.28-Math.abs(baseEdge)*.10,.27-baseEdge);
  const scoreEdge=clamp((hg-ag)*.20,-.40,.40);
  const pressureEdge=clamp((safeNum(live.homePressure,.5)-safeNum(live.awayPressure,.5))*.12,-.12,.12);
  const liveP=minute>0?normalize3(.40+scoreEdge+pressureEdge,.30-Math.abs(scoreEdge)*.20,.30-scoreEdge-pressureEdge):base;
  const ba=Math.max(0,safeNum(betting.homeAmount)),bd=Math.max(0,safeNum(betting.drawAmount)),bv=Math.max(0,safeNum(betting.awayAmount));
  const betP=(ba+bd+bv)>0?normalize3(ba,bd,bv):[1/3,1/3,1/3];
  const totalW=Math.max(.0001,cfg.historyWeight+cfg.formWeight+cfg.liveWeight+cfg.bettingWeight);
  const hw=(cfg.historyWeight+cfg.formWeight)/totalW,lw=cfg.liveWeight/totalW,bw=cfg.bettingWeight/totalW;
  const p=normalize3(base[0]*hw+liveP[0]*lw+betP[0]*bw,base[1]*hw+liveP[1]*lw+betP[1]*bw,base[2]*hw+liveP[2]*lw+betP[2]*bw);
  // Normalize after margin so the three quoted probabilities form a coherent market.
  const priced=normalize3(p[0]*(1+cfg.margin),p[1]*(1+cfg.margin),p[2]*(1+cfg.margin));
  const odds=priced.map(x=>clamp(1/Math.max(x,.0001),cfg.minOdds,cfg.maxOdds));
  return {selections:[
    {code:'L',probability:+priced[0].toFixed(6),odds:+odds[0].toFixed(2)},
    {code:'E',probability:+priced[1].toFixed(6),odds:+odds[1].toFixed(2)},
    {code:'V',probability:+priced[2].toFixed(6),odds:+odds[2].toFixed(2)}
  ]};
}
