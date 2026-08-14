function clamp(x,min,max){return Math.max(min,Math.min(max,x));}
function safeNum(x,fallback=0){const n=Number(x);return Number.isFinite(n)?n:fallback;}
function normalize3(a,b,c){const s=a+b+c;return s>0?[a/s,b/s,c/s]:[1/3,1/3,1/3];}
export function generateLEVMarket({historical={},live={},betting={},config={}}={}){
  const cfg={margin:.045,historyWeight:.25,formWeight:.10,liveWeight:.65,bettingWeight:.10,minOdds:1.01,maxOdds:30,...config};
  const hs=clamp(safeNum(historical.homeStrength,.5),0,1),as=clamp(safeNum(historical.awayStrength,.5),0,1);
  const hf=clamp(safeNum(historical.homeForm,.5),0,1),af=clamp(safeNum(historical.awayForm,.5),0,1);
  const hg=Math.max(0,safeNum(live.homeGoals)),ag=Math.max(0,safeNum(live.awayGoals));
  const minute=clamp(safeNum(live.minute),0,120);
  const elapsed=Math.min(1,minute/90);
  const baseEdge=clamp((hs-as)*.30+(hf-af)*.20,-.25,.25);
  const base=normalize3(.45+baseEdge,.28-Math.abs(baseEdge)*.10,.27-baseEdge);

  // Live-aware pricing: current score and remaining time dominate after kickoff.
  // This prevents 1-1 late in the match from receiving the same draw price as 1-1 early.
  const diff=hg-ag;
  let liveP;
  if(diff===0){
    const draw=clamp(.30+.52*elapsed,.30,.84);
    const nonDraw=1-draw;
    const homeBias=clamp(.50+baseEdge*.60,.35,.65);
    liveP=[nonDraw*homeBias,draw,nonDraw*(1-homeBias)];
  }else{
    const winner=Math.max(0,Math.min(1,.48+.25*elapsed+.06*Math.min(Math.abs(diff),2)));
    const draw=clamp((1-winner)*(.72-.22*elapsed),.035,.28);
    const loser=Math.max(.01,1-winner-draw);
    liveP=diff>0?[winner,draw,loser]:[loser,draw,winner];
  }

  const ba=Math.max(0,safeNum(betting.homeAmount)),bd=Math.max(0,safeNum(betting.drawAmount)),bv=Math.max(0,safeNum(betting.awayAmount));
  const betP=(ba+bd+bv)>0?normalize3(ba,bd,bv):[1/3,1/3,1/3];
  const totalW=Math.max(.0001,cfg.historyWeight+cfg.formWeight+cfg.liveWeight+cfg.bettingWeight);
  const hw=(cfg.historyWeight+cfg.formWeight)/totalW,lw=cfg.liveWeight/totalW,bw=cfg.bettingWeight/totalW;
  let p=normalize3(base[0]*hw+liveP[0]*lw+betP[0]*bw,base[1]*hw+liveP[1]*lw+betP[1]*bw,base[2]*hw+liveP[2]*lw+betP[2]*bw);
  // In-play rule: the team currently leading must not receive the underdog price.
  // The score/time signal gets a strong final say so a one-goal lead cannot remain
  // accidentally priced as a negative (favorite) outcome for the trailing team.
  if(diff!==0){
    const drawTarget=clamp(.22-.10*elapsed,.08,.22);
    const winTarget=clamp(.60+.18*elapsed+.045*Math.min(Math.abs(diff),3),.56,.90);
    const loseTarget=Math.max(.01,1-winTarget-drawTarget);
    const target=diff>0?[winTarget,drawTarget,loseTarget]:[loseTarget,drawTarget,winTarget];
    const scoreWeight=.72;
    p=normalize3(
      p[0]*(1-scoreWeight)+target[0]*scoreWeight,
      p[1]*(1-scoreWeight)+target[1]*scoreWeight,
      p[2]*(1-scoreWeight)+target[2]*scoreWeight
    );
  }
  const priced=normalize3(p[0]*(1+cfg.margin),p[1]*(1+cfg.margin),p[2]*(1+cfg.margin));
  const odds=priced.map(x=>clamp(1/Math.max(x,.0001),cfg.minOdds,cfg.maxOdds));
  return {selections:[
    {code:'L',probability:+priced[0].toFixed(6),odds:+odds[0].toFixed(2)},
    {code:'E',probability:+priced[1].toFixed(6),odds:+odds[1].toFixed(2)},
    {code:'V',probability:+priced[2].toFixed(6),odds:+odds[2].toFixed(2)}
  ]};
}
