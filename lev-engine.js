function clamp(x,min,max){return Math.max(min,Math.min(max,x));}
function safeNum(x,fallback=0){const n=Number(x);return Number.isFinite(n)?n:fallback;}
function normalize3(a,b,c){const s=a+b+c;return s>0?[a/s,b/s,c/s]:[1/3,1/3,1/3];}

/*
 * Progressive live pricing.
 *
 * The old model allowed the non-winning side to jump too quickly to +500/+600
 * after an ordinary goal. We first calculate probabilities, then compress the
 * long prices during the first/middle parts of the match. As the clock advances,
 * the compression is relaxed. A large goal difference unlocks the steeper
 * late-game range only when the match is genuinely close to finishing.
 */
function progressiveCompression(minute,diff){
  if(minute<30) return Math.min(1,.62 + (Math.max(0,Math.abs(diff)-2)*.04));
  if(minute<60) return Math.min(1,.68 + ((minute-30)/30)*.08 + Math.max(0,Math.abs(diff)-2)*.04);
  if(minute<75) return Math.min(1,.76 + ((minute-60)/15)*.10 + Math.max(0,Math.abs(diff)-2)*.04);
  if(minute<85) return Math.min(1,.86 + ((minute-75)/10)*.06 + Math.max(0,Math.abs(diff)-2)*.05);
  return Math.min(1,.92 + ((minute-85)/5)*.08 + Math.max(0,Math.abs(diff)-2)*.04);
}

function lateMaxOdds(minute,diff){
  const d=Math.abs(diff);
  if(minute<60) return d>=3?6.0:4.5;
  if(minute<75) return d>=3?9.0:5.5;
  if(minute<85) return d>=3?16.0:7.5;
  if(d<=2) return 10.0;
  if(d===3) return 30.0;
  return 61.0; // approximately +6000 in American format
}

function priceProgressively(rawOdds,minute,diff){
  const compression=progressiveCompression(minute,diff);
  const maxOdds=lateMaxOdds(minute,diff);
  const d=Math.abs(diff);
  const out=rawOdds.map(o=>{
    const raw=Math.max(1.0001,o);
    // Pull long prices toward 1 during the earlier/middle game.
    let priced=1+(raw-1)*compression;
    priced=Math.min(priced,maxOdds);
    return priced;
  });

  // A huge late lead can legitimately become an extreme favorite, but only
  // after 85' and at least a 4-goal lead. This is the only state where we allow
  // the decimal price to approach 1.0167 (~ -6000).
  if(minute>=85 && d>=4){
    const favoriteIndex=diff>0?0:2;
    out[favoriteIndex]=Math.max(1.0165,Math.min(out[favoriteIndex],1.12));
  }
  return out;
}

export function generateLEVMarket({historical={},live={},betting={},config={}}={}){
  const cfg={
    margin:.045,
    historyWeight:.25,
    formWeight:.10,
    liveWeight:.65,
    bettingWeight:.10,
    minOdds:1.01,
    maxOdds:61,
    ...config
  };

  const hs=clamp(safeNum(historical.homeStrength,.5),0,1),as=clamp(safeNum(historical.awayStrength,.5),0,1);
  const hf=clamp(safeNum(historical.homeForm,.5),0,1),af=clamp(safeNum(historical.awayForm,.5),0,1);
  const hg=Math.max(0,safeNum(live.homeGoals)),ag=Math.max(0,safeNum(live.awayGoals));
  const minute=clamp(safeNum(live.minute),0,120);
  const elapsed=Math.min(1,minute/90);
  const diff=hg-ag;

  const baseEdge=clamp((hs-as)*.30+(hf-af)*.20,-.25,.25);
  const base=normalize3(.45+baseEdge,.28-Math.abs(baseEdge)*.10,.27-baseEdge);

  let liveP;
  if(diff===0){
    const draw=clamp(.30+.52*elapsed,.30,.84);
    const nonDraw=1-draw;
    const homeBias=clamp(.50+baseEdge*.60,.35,.65);
    liveP=[nonDraw*homeBias,draw,nonDraw*(1-homeBias)];
  }else{
    const lead=Math.abs(diff);
    // One goal is meaningful, but extra goals only become very powerful late.
    const winner=clamp(
      .48+.25*elapsed+
      .06*Math.min(lead,2)+
      .04*Math.max(lead-2,0)+
      .03*Math.max(lead-3,0),
      .45,.975
    );
    const draw=clamp((1-winner)*(.72-.22*elapsed),.01,.28);
    const loser=Math.max(.01,1-winner-draw);
    liveP=diff>0?[winner,draw,loser]:[loser,draw,winner];
  }

  const ba=Math.max(0,safeNum(betting.homeAmount)),bd=Math.max(0,safeNum(betting.drawAmount)),bv=Math.max(0,safeNum(betting.awayAmount));
  const betP=(ba+bd+bv)>0?normalize3(ba,bd,bv):[1/3,1/3,1/3];
  // Late + large leads deserve more live-state weight. This is deliberately
  // gated behind 75' and 3+ goals so an ordinary 1-0/2-0 does not jump to
  // extreme prices early in the match.
  const lateLeadBoost=minute>=75 && Math.abs(diff)>=3
    ? Math.min(.25,((minute-75)/15)*.18+(Math.abs(diff)-3)*.04)
    : 0;
  const effectiveLiveWeight=cfg.liveWeight+lateLeadBoost;
  const totalW=Math.max(.0001,cfg.historyWeight+cfg.formWeight+effectiveLiveWeight+cfg.bettingWeight);
  const hw=(cfg.historyWeight+cfg.formWeight)/totalW,lw=effectiveLiveWeight/totalW,bw=cfg.bettingWeight/totalW;
  const stateDominance =
    minute>=85 && Math.abs(diff)>=4 ? .98 :
    minute>=85 && Math.abs(diff)>=3 ? .92 :
    0;
  const p=stateDominance>0
    ? normalize3(
        liveP[0]*stateDominance + base[0]*(1-stateDominance)*.8 + betP[0]*(1-stateDominance)*.2,
        liveP[1]*stateDominance + base[1]*(1-stateDominance)*.8 + betP[1]*(1-stateDominance)*.2,
        liveP[2]*stateDominance + base[2]*(1-stateDominance)*.8 + betP[2]*(1-stateDominance)*.2
      )
    : normalize3(
        base[0]*hw+liveP[0]*lw+betP[0]*bw,
        base[1]*hw+liveP[1]*lw+betP[1]*bw,
        base[2]*hw+liveP[2]*lw+betP[2]*bw
      );

  const priced=normalize3(p[0]*(1+cfg.margin),p[1]*(1+cfg.margin),p[2]*(1+cfg.margin));
  const rawOdds=priced.map(x=>1/Math.max(x,.0001));
  const progressive=priceProgressively(rawOdds,minute,diff);
  const odds=progressive.map(x=>clamp(x,cfg.minOdds,Math.min(cfg.maxOdds,lateMaxOdds(minute,diff))));

  return {selections:[
    {code:'L',probability:+priced[0].toFixed(6),odds:+odds[0].toFixed(2)},
    {code:'E',probability:+priced[1].toFixed(6),odds:+odds[1].toFixed(2)},
    {code:'V',probability:+priced[2].toFixed(6),odds:+odds[2].toFixed(2)}
  ]};
}

export { priceProgressively };
