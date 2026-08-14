import crypto from 'crypto';

const DEFAULT_PLAYERS = [
  'Aaron Avila','Bruno Castillo','Carlos Mendoza','Damián Reyes','Emilio Torres','Fabio Navarro','Gael Romero','Héctor Salinas','Iván Duarte','Julián Vega',
  'Kevin Montes','Leo Carranza','Marco Silva','Nico Valdés','Óscar Molina','Pablo Ríos','Raúl Cabrera','Santiago Cruz','Tomás Herrera','Uriel Santos',
  'Víctor Luna','William Prado','Xavier Mora','Yahir Campos','Zaid Flores','Adrián Solís','Bastián León','César Fuentes','Diego Aranda','Enzo Vargas',
  'Fabián Ponce','Gonzalo Meza','Hugo Treviño','Isaac Beltrán','Jairo Castañeda','Karlo Medina','Lautaro Nieto','Matías Peralta','Nando Lozano','Oliver Rivas',
  'Patricio Cano','Ramiro Ibarra','Samuel Vela','Thiago Peña','Ulises Franco','Valentín Soto','Walter Lara','Ximena Paredes','Yosef Bravo','Zacarías Mora',
  'Alonso Vidal','Benjamín Orozco','Cristóbal Vera','Darío Escalante','Esteban Patiño','Félix Nájera','Gerardo Acosta','Horacio Gil','Iker Zamora','Joaquín Parra',
  'Kenzo Rangel','Lucas Figueroa','Manuel Cárdenas','Néstor Vázquez','Octavio Rosales','Pedro Alvarado','Rafael Cordero','Sergio Palacios','Tadeo Márquez','Valerio Robles',
  'Agustín Valle','Baltazar Quiroz','Ciro Estrada','Dante Zamudio','Ezequiel Prado','Franco Téllez','Germán Lara','Hernán Rubio','Ismael Pineda','Jerónimo Cano',
  'Lisandro Mora','Máximo Trejo','Noé Valdez','Omar Carrillo','Primo Sosa','Renato Nava','Salvador Leal','Teo Murillo','Urias Ponce','Vasco Rojas',
  'Alan Escobar','Braulio Mena','Cayetano Rivas','Darwin Soto','Emanuel Vega','Fermín Rocha','Gustavo Linares','Héctor Prado','Ignacio Serra','Jorge Castaño',
  'Leandro Vela','Mauricio Tapia','Nicolás Roldán','Orlando Paz','Pascual Moya','Rodrigo Beltrán','Simón Aguirre','Tristán Paredes','Valentín Mora','Yago Herrera'
];
const ALIASES=['Madness','Tom','Blaze','Raptor','Nova','Flash','Titan','Ghost','Fury','Ace','Storm','Viper','Rocket','Shadow','Wolf','Cobra','Joker','Phoenix','Zero','Legend'];

function hash(value){
  const s=String(value??''); let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return h>>>0;
}
function slotAt(date,rotationHours){return Math.floor(new Date(date).getTime()/(rotationHours*3600000));}
function player(slot,index,pool,aliases){const people=pool?.length?pool:DEFAULT_PLAYERS;const tags=aliases?.length?aliases:ALIASES;return `${people[hash(`${slot}:p:${index}`)%people.length]}(${tags[hash(`${slot}:a:${index}`)%tags.length]})`;}
function allowedHour(iso,startHour,endHour,tz='America/Mexico_City'){
  const h=Number(new Intl.DateTimeFormat('en-US',{timeZone:tz,hour:'2-digit',hour12:false}).format(new Date(iso)));
  return h>=startHour && h<endHour;
}
function winnerOdds(home,away){
  const hp=Math.max(.12,Math.min(.82,.50+(home-away)*.035));
  const ap=1-hp;
  return [
    {code:'H',label:'Local',odds:Number((1/(hp*1.06)).toFixed(2))},
    {code:'A',label:'Visitante',odds:Number((1/(ap*1.06)).toFixed(2))}
  ];
}

export function createVirtualSportEngine({pool,deterministicUuid,config}){
  const cfg={
    sport:config.sport,
    source:config.source,
    marketType:config.marketType,
    league:config.league||`🔥 HOT · ${config.sport} 2H2`,
    intervalMs:config.intervalMs||4*60000,
    durationMinutes:config.durationMinutes||8,
    rollingHours:config.rollingHours||24,
    rotationHours:config.rotationHours||4,
    startHour:config.startHour??8,
    endHour:config.endHour??20,
    players:config.players||DEFAULT_PLAYERS,
    aliases:config.aliases||ALIASES,
    pairPool:config.pairPool||[['Aston Avila','New Castel'],['Madri Nova','Barceluna'],['Munich Red','Paris Azul'],['Milan Norte','Londres City']],
    scoreModel:config.scoreModel||((minute,seed)=>[Math.min(20,Math.floor(2+minute*.8+(seed%4))),Math.min(20,Math.floor(2+minute*.7+((seed>>3)%4)))])
  };
  const state={sport:cfg.sport,source:cfg.source,enabled:true,lastRunAt:null,lastRunMs:0,lastError:null,created:0,updated:0,closed:0};

  function pair(slot,index){
    const p=cfg.pairPool[(slot+index)%cfg.pairPool.length];
    return {home:`${p[0]} (${player(slot,index*2,cfg.players,cfg.aliases)})`,away:`${p[1]} (${player(slot,index*2+1,cfg.players,cfg.aliases)})`};
  }
  function stats(event,minute,home,away){
    const seed=hash(`${cfg.source}:${event.id}`), pct=Math.max(15,Math.min(85,50+(home-away)*4+(seed%9)-4));
    return {
      elapsed:minute,
      winPct:[pct,100-pct],
      possession:[pct,100-pct],
      attacks:[Math.floor(10+minute*4+(seed%8)),Math.floor(9+minute*3.8+((seed>>4)%8))],
      shots:[Math.floor(2+minute*.8+(seed%5)),Math.floor(2+minute*.7+((seed>>5)%5))],
      fouls:[Math.floor(seed%5+minute/2),Math.floor((seed>>3)%5+minute/2)],
      form:[Math.max(0,pct-12),Math.min(100,pct+12)]
    };
  }
  function clampOdd(v){return Number(Math.max(1.18,Math.min(8.00,v)).toFixed(2));}
  function winnerProbabilities(event, seed){
    const h=Number(event.home_score)||0,a=Number(event.away_score)||0;
    const diff=h-a;
    const elapsed=cfg.durationMinutes>0?Math.max(0,Math.min(1,Number(event.live_elapsed||0)/cfg.durationMinutes)):0;
    const randomBias=.50+(((seed%21)-10)/500);
    if(String(event.status||'')!=='LIVE' || elapsed<=0){
      return [randomBias,1-randomBias];
    }
    if(diff===0){
      const bias=.50+(((seed>>5)%17)-8)/300;
      return [bias,1-bias];
    }
    const lead=clamp(.60+.18*elapsed+.045*Math.min(Math.abs(diff),3),.56,.90);
    return diff>0?[lead,1-lead]:[1-lead,lead];
  }
  function winnerOdds(event, seed){
    const [hp,ap]=winnerProbabilities(event,seed);
    return [clampOdd(1/(hp*1.06)),clampOdd(1/(ap*1.06))];
  }
  function winnerOdds1X2(event, seed){
    const [hp,ap]=winnerProbabilities(event,seed);
    const elapsed=cfg.durationMinutes>0?Math.max(0,Math.min(1,Number(event.live_elapsed||0)/cfg.durationMinutes)):0;
    let draw=String(event.status||'')==='LIVE' && (Number(event.home_score)||0)!==(Number(event.away_score)||0)
      ? clamp(.22-.10*elapsed,.08,.22)
      : .30;
    const scale=1-draw;
    const probs=[hp*scale,draw,ap*scale];
    return probs.map(p=>clampOdd(1/(Math.max(.01,p)*1.045)));
  }
  function markets(event){
    const h=Number(event.home_score)||0,a=Number(event.away_score)||0;
    const seed=hash(`${cfg.source}:${event.id}`);
    const [fav,dog]=winnerOdds(event,seed);
    const totalBase=Math.max(1,(h+a)+0.5);
    const over=clampOdd(1.58+(((seed>>8)%22)/100));
    const under=clampOdd(1.72+(((seed>>12)%28)/100));
    const handicapFav=clampOdd(1.62+(((seed>>16)%24)/100));
    const handicapDog=clampOdd(1.88+(((seed>>20)%34)/100));
    const altFav=clampOdd(1.78+(((seed>>24)%28)/100));
    const altDog=clampOdd(2.02+(((seed>>2)%48)/100));
    const markets=[];
    if(cfg.sport==='Fútbol'){
      const [fav1x2,draw1x2,dog1x2]=winnerOdds1X2(event,seed);
      markets.push({type:'MATCH_WINNER',name:'Ganador 1X2',selections:[
        {code:'1',label:'Local',odds:fav1x2},{code:'X',label:'Empate',odds:draw1x2},{code:'2',label:'Visitante',odds:dog1x2}
      ]});
      markets.push({type:'TOTAL_GOALS',name:`Total de goles ${Math.floor(totalBase)}`,selections:[{code:'O',label:`Más de ${Math.floor(totalBase)}`,odds:over},{code:'U',label:`Menos de ${Math.floor(totalBase)}`,odds:under}]});
      markets.push({type:'HANDICAP',name:'Hándicap',selections:[{code:'H1',label:'Local -1',odds:handicapFav},{code:'H2',label:'Visitante +1',odds:handicapDog}]});
      markets.push({type:'BOTH_SCORE',name:'Ambos marcan',selections:[{code:'BTTS_Y',label:'Sí',odds:1.68},{code:'BTTS_N',label:'No',odds:2.08}]});
      markets.push({type:'TOTAL_GOALS_ALT',name:'Línea alternativa',selections:[{code:'O15',label:'Más de 1.5',odds:1.43},{code:'U25',label:'Menos de 2.5',odds:1.77}]});
    } else if(cfg.sport==='Básquetbol'){
      markets.push({type:'MATCH_WINNER',name:'Ganador del partido',selections:[{code:'H',label:'Local',odds:fav},{code:'A',label:'Visitante',odds:dog}]});
      markets.push({type:'SPREAD',name:'Hándicap',selections:[{code:'HS',label:'Local -4.5',odds:handicapFav},{code:'AS',label:'Visitante +4.5',odds:handicapDog}]});
      markets.push({type:'TOTAL_POINTS',name:'Total de puntos',selections:[{code:'O',label:'Más de 165.5',odds:over},{code:'U',label:'Menos de 165.5',odds:under}]});
      markets.push({type:'TEAM_TOTAL',name:'Puntos local',selections:[{code:'HO',label:'Más de 82.5',odds:1.64},{code:'HU',label:'Menos de 82.5',odds:2.04}]});
      markets.push({type:'ALT_SPREAD',name:'Hándicap alternativo',selections:[{code:'HA',label:'Local -1.5',odds:1.48},{code:'AA',label:'Visitante +7.5',odds:2.32}]});
    } else if(cfg.sport==='Béisbol'){
      markets.push({type:'MATCH_WINNER',name:'Ganador del juego',selections:[{code:'H',label:'Local',odds:fav},{code:'A',label:'Visitante',odds:dog}]});
      markets.push({type:'RUN_LINE',name:'Carrera de ventaja',selections:[{code:'RLH',label:'Local -1.5',odds:2.05},{code:'RLA',label:'Visitante +1.5',odds:1.67}]});
      markets.push({type:'TOTAL_RUNS',name:'Total de carreras',selections:[{code:'O',label:'Más de 8.5',odds:1.76},{code:'U',label:'Menos de 8.5',odds:1.78}]});
      markets.push({type:'TEAM_RUNS',name:'Carreras local',selections:[{code:'HO',label:'Más de 3.5',odds:1.72},{code:'HU',label:'Menos de 3.5',odds:2.02}]});
      markets.push({type:'FIRST_INNING',name:'Primera entrada',selections:[{code:'Y',label:'Ambos anotan',odds:2.18},{code:'N',label:'No anotan ambos',odds:1.58}]});
    } else if(cfg.sport==='Tenis'){
      markets.push({type:'MATCH_WINNER',name:'Ganador del partido',selections:[{code:'H',label:'Local',odds:fav},{code:'A',label:'Visitante',odds:dog}]});
      markets.push({type:'SETS',name:'Total de sets',selections:[{code:'O',label:'Más de 2.5',odds:2.02},{code:'U',label:'Menos de 2.5',odds:1.66}]});
      markets.push({type:'GAMES',name:'Total de juegos',selections:[{code:'O',label:'Más de 21.5',odds:1.82},{code:'U',label:'Menos de 21.5',odds:1.84}]});
      markets.push({type:'SET1',name:'Ganador set 1',selections:[{code:'H1',label:'Local',odds:1.57},{code:'A1',label:'Visitante',odds:2.25}]});
      markets.push({type:'HANDICAP_GAMES',name:'Hándicap de juegos',selections:[{code:'HG1',label:'Local -2.5',odds:1.88},{code:'HG2',label:'Visitante +2.5',odds:1.74}]});
    } else {
      markets.push({type:'MATCH_WINNER',name:'Ganador del partido',selections:[{code:'H',label:'Local',odds:fav},{code:'A',label:'Visitante',odds:dog}]});
      markets.push({type:'PUCK_LINE',name:'Línea de puck',selections:[{code:'PH',label:'Local -1.5',odds:2.04},{code:'PA',label:'Visitante +1.5',odds:1.69}]});
      markets.push({type:'TOTAL_GOALS',name:'Total de goles',selections:[{code:'O',label:'Más de 5.5',odds:1.71},{code:'U',label:'Menos de 5.5',odds:1.93}]});
      markets.push({type:'TEAM_TOTAL',name:'Goles local',selections:[{code:'HO',label:'Más de 2.5',odds:1.73},{code:'HU',label:'Menos de 2.5',odds:1.91}]});
      markets.push({type:'PERIOD1',name:'Primer periodo',selections:[{code:'H1',label:'Local',odds:1.81},{code:'A1',label:'Visitante',odds:2.12}]});
    }
    return markets;
  }
  async function ensureMarkets(event){
    const defs=markets(event);
    for(const def of defs){
      const key=`${cfg.source}:${event.id}:${def.type}`;
      const mid=deterministicUuid(key);
      await pool.query(`INSERT INTO markets(id,event_id,name,market_type,status,external_key,pricing_source,pricing_updated_at)
        VALUES($1,$2,$3,$4,'OPEN',$5,$6,NOW())
        ON CONFLICT(external_key) WHERE external_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name,status='OPEN',pricing_source=EXCLUDED.pricing_source,pricing_updated_at=NOW()`,
        [mid,event.id,def.name,`${cfg.marketType}_${def.type}`,key,cfg.source]);
      const seen=[];
      for(const o of def.selections){
        const sk=`${key}:${o.code}`;seen.push(sk);
        await pool.query(`INSERT INTO market_selections(id,market_id,label,code,odds,status,external_key)
          VALUES($1,$2,$3,$4,$5,'OPEN',$6)
          ON CONFLICT(external_key) WHERE external_key IS NOT NULL DO UPDATE SET market_id=EXCLUDED.market_id,label=EXCLUDED.label,odds=EXCLUDED.odds,status='OPEN'`,
          [deterministicUuid(sk),mid,o.label,o.code,o.odds,sk]);
      }
      await pool.query(`UPDATE market_selections SET status='CLOSED' WHERE market_id=$1 AND external_key IS NOT NULL AND NOT (external_key=ANY($2::text[]))`,[mid,seen]);
    }
  }
  async function create(start,slot,index){
    const p=pair(slot,index),eid=deterministicUuid(`${cfg.source}:${start}:${index}`),externalId=`${cfg.source}:${start}`;
    const st=stats({id:eid},0,0,0);
    await pool.query(`INSERT INTO sports_events(id,sport,league,home_team,away_team,starts_at,status,home_score,away_score,featured,video,external_source,external_id,live_elapsed,live_status,score_source,score_confidence,hot_enabled,hot_locked,hot_stats,hot_rotation)
      VALUES($1,$2,$3,$4,$5,$6,'OPEN',0,0,FALSE,FALSE,$7,$8,0,'Próximo HOT',$7,100,TRUE,FALSE,$9,$10)
      ON CONFLICT(external_source,external_id) WHERE external_id IS NOT NULL DO NOTHING`,
      [eid,cfg.sport,cfg.league,p.home,p.away,start,cfg.source,externalId,JSON.stringify(st),slot]);
    const q=await pool.query('SELECT * FROM sports_events WHERE external_source=$1 AND external_id=$2 LIMIT 1',[cfg.source,externalId]);
    if(q.rows[0]) await ensureMarkets(q.rows[0]);
  }
  async function seed(){
    const now=Date.now(),start=Math.ceil(now/cfg.intervalMs)*cfg.intervalMs,end=now+cfg.rollingHours*3600000;let created=0,index=0;
    for(let t=start;t<=end;t+=cfg.intervalMs){const iso=new Date(t).toISOString();if(!allowedHour(iso,cfg.startHour,cfg.endHour))continue;const key=`${cfg.source}:${iso}`;const ex=await pool.query('SELECT 1 FROM sports_events WHERE external_source=$1 AND external_id=$2 LIMIT 1',[cfg.source,key]);if(!ex.rows[0]){await create(iso,slotAt(iso,cfg.rotationHours),index++);created++;}}
    state.created+=created;return created;
  }
  async function advance(){
    const q=await pool.query(`SELECT * FROM sports_events WHERE external_source=$1 AND status IN ('OPEN','LIVE') AND starts_at<=NOW()+INTERVAL '1 minute' ORDER BY starts_at LIMIT 500`,[cfg.source]);
    let updated=0,closed=0;
    for(const e of q.rows){if(e.hot_locked)continue;const elapsed=Math.floor((Date.now()-new Date(e.starts_at).getTime())/60000);if(elapsed<0)continue;const minute=Math.min(cfg.durationMinutes,elapsed),seed=hash(`${cfg.source}:${e.id}`);const [home,away]=cfg.scoreModel(minute,seed,e);const s=stats(e,minute,home,away);const status=minute>=cfg.durationMinutes?'CLOSED':'LIVE';await pool.query(`UPDATE sports_events SET status=$1,home_score=$2,away_score=$3,live_elapsed=$4,live_status=$5,score_source=$6,score_confidence=100,score_updated_at=NOW(),hot_stats=$7 WHERE id=$8`,[status,home,away,minute,status==='LIVE'?`En vivo HOT · ${minute}'`:'Finalizado HOT',cfg.source,JSON.stringify(s),e.id]);await ensureMarkets({...e,home_score:home,away_score:away});updated++;if(status==='CLOSED'){closed++;await pool.query(`UPDATE markets SET status='CLOSED',pricing_updated_at=NOW() WHERE event_id=$1 AND market_type LIKE $2 || '%'`,[e.id,cfg.marketType]);await pool.query(`UPDATE market_selections SET status='CLOSED' WHERE market_id IN (SELECT id FROM markets WHERE event_id=$1 AND market_type LIKE $2 || '%')`,[e.id,cfg.marketType]);}}
    const created=await seed();state.updated+=updated;state.closed+=closed;state.lastRunAt=new Date().toISOString();state.lastRunMs=Date.now();state.lastError=null;return {updated,closed,created};
  }
  async function refreshMarkets(){
    const q=await pool.query(`SELECT * FROM sports_events WHERE external_source=$1 AND status IN ('OPEN','LIVE') ORDER BY starts_at LIMIT 500`,[cfg.source]);
    for(const e of q.rows) await ensureMarkets(e);
    return q.rowCount||0;
  }
  async function start(){try{await seed();await advance();}catch(e){state.lastError=e.message;console.error(`${cfg.sport} engine bootstrap:`,e.message)}setInterval(()=>advance().catch(e=>{state.lastError=e.message;console.error(`${cfg.sport} engine cycle:`,e.message)}),60000);}
  async function list(live=false){const q=await pool.query(`SELECT e.*,COALESCE(json_agg(DISTINCT jsonb_build_object('id',m.id,'name',m.name,'market_type',m.market_type,'status',m.status,'selections',(SELECT COALESCE(json_agg(jsonb_build_object('id',s.id,'label',s.label,'code',s.code,'odds',s.odds,'status',s.status) ORDER BY s.created_at),'[]'::json) FROM market_selections s WHERE s.market_id=m.id))) FILTER(WHERE m.id IS NOT NULL),'[]'::json) markets FROM sports_events e LEFT JOIN markets m ON m.event_id=e.id AND m.market_type LIKE $1 || '_%' WHERE e.external_source=$2 AND e.status IN ('OPEN','LIVE') AND ($3::boolean=false OR e.status='LIVE') GROUP BY e.id ORDER BY e.starts_at LIMIT 200`,[cfg.marketType,cfg.source,live]);return q.rows;}
  return {config:cfg,state,list,start,seed,advance,ensureMarkets,refreshMarkets};
}

export function createVirtualSportsManager({pool,deterministicUuid}){
  const sportPeople={
    'Fútbol':['Mateo Cárdenas','Sergio Valdés','Diego Lozano','Ángel Rivas','Brayan Soto','Julián Paredes','Nicolás Vera','Esteban Mora','Marco Téllez','Andrés Luna','Gael Fuentes','Tomás Roldán'],
    'Básquetbol':['LeBron Vega','Damián Brooks','Kobe Salas','Jayson Cruz','Nikola Reyes','Stephen Mora','Jaime Torres','Anthony Ríos','Luka Navarro','Giannis Prado','Devin Silva','Victor Medina'],
    'Béisbol':['Héctor Ramírez','Julio Pineda','Manny Castillo','Rafael Solano','Beto Fuentes','Carlos Molina','Derek Vargas','Luis Cordero','Marco Beltrán','Óscar Díaz','Pedro Reyes','Alex Zamora'],
    'Tenis':['Rafael Serrano','Carlos Nadal','Dani Alarcón','Lucas Federer','Mateo Djokovic','Andrés Sinner','Pablo Zverev','Diego Medvedev','Leo Ruud','Marco Fritz','Álex Rune','Iván Dimitrov'],
    'Hockey':['Connor Salas','Ethan Ríos','Mason Vega','Liam Torres','Noah Cárdenas','Owen Mora','Jack Navarro','Logan Cruz','Ryan Fuentes','Evan Silva','Cole Medina','Tyler Prado']
  };
  const sportAliases={
    'Fútbol':['Tigre','Rayo','Mago','Fiera','Cometa','Zurdo','Trueno','Chispa'],
    'Básquetbol':['Dunk','Clutch','Ace','Splash','Sky','Flash','Hoop','MVP'],
    'Béisbol':['Slugger','Bate','Guante','MVP','Cañón','Rayo','Bull','Power'],
    'Tenis':['Ace','Slice','Serve','Drop','Volley','Baseline','Topspin','Smash'],
    'Hockey':['Ice','Blizzard','Puck','Storm','Glacier','Flash','Blade','Frost']
  };
  const configs=[
    // HOT 2H2 football is a separate internal module. Real football remains exclusively
    // under API-Football in server.js and never shares this engine's event feed.
    {sport:'Fútbol',players:sportPeople['Fútbol'],aliases:sportAliases['Fútbol'],source:'HOT_FOOTBALL',marketType:'HOT_FOOTBALL_2H2',startHour:0,endHour:24,pairPool:[['Aston Avila','New Castel'],['Madri Nova','Barceluna'],['Munich Red','Paris Azul'],['Milan Norte','Londres City']],scoreModel:(m,s)=>[Math.min(9,Math.floor(1+m*.55+(s%3))),Math.min(9,Math.floor(1+m*.48+((s>>3)%3)))]},
    {sport:'Básquetbol',players:sportPeople['Básquetbol'],aliases:sportAliases['Básquetbol'],source:'HOT_BASKETBALL',marketType:'HOT_BASKETBALL_2H2',startHour:0,endHour:24,pairPool:[['Los Angeles Stars','Boston Greens'],['Golden Bay','Chicago Bullsmen'],['Miami Waves','New York Knights'],['Dallas Rockets','Phoenix Sunside']],scoreModel:(m,s)=>[Math.min(99,Math.floor(8+m*2.4+(s%5))),Math.min(99,Math.floor(7+m*2.2+((s>>3)%5)))]},
    {sport:'Béisbol',players:sportPeople['Béisbol'],aliases:sportAliases['Béisbol'],source:'HOT_BASEBALL',marketType:'HOT_BASEBALL_2H2',startHour:0,endHour:24,pairPool:[['Los Angeles Bats','New York Kings'],['Boston Redcaps','Chicago Cubsmen'],['Texas Rangers FC','Miami Marlinside'],['San Diego Padres Club','Atlanta Bravesmen']],scoreModel:(m,s)=>[Math.min(8,Math.floor(((s%8)+m)/6)),Math.min(8,Math.floor((((s>>5)%8)+m)/7))]},
    {sport:'Tenis',players:sportPeople['Tenis'],aliases:sportAliases['Tenis'],source:'HOT_TENNIS',marketType:'HOT_TENNIS_2H2',startHour:0,endHour:24,pairPool:[['Madrid Open','London Aces'],['Paris Smash','New York Serve'],['Roma Masters','Tokyo Rackets'],['Miami Open','Toronto Nets']],scoreModel:(m,s)=>[Math.min(3,Math.floor(((s%5)+m)/4)),Math.min(3,Math.floor((((s>>5)%5)+m)/5))]},
    {sport:'Hockey',players:sportPeople['Hockey'],aliases:sportAliases['Hockey'],source:'HOT_HOCKEY',marketType:'HOT_HOCKEY_2H2',startHour:0,endHour:24,pairPool:[['Toronto Ice','Montreal North'],['New York Blades','Boston Frost'],['Dallas Wolves','Colorado Peaks'],['Detroit Motors','Chicago Ice']],scoreModel:(m,s)=>[Math.min(8,Math.floor(1+m*.5+(s%3))),Math.min(8,Math.floor(1+m*.45+((s>>4)%3)))]}
  ].map(c=>createVirtualSportEngine({pool,deterministicUuid,config:c}));
  const bySport=new Map(configs.map(e=>[e.config.sport,e]));
  return {engines:configs,bySport,startAll:async()=>Promise.all(configs.map(e=>e.start())),list:async(sport,live=false)=>bySport.get(sport)?.list(live)||[],engineForEvent:externalSource=>configs.find(e=>e.config.source===externalSource)||null,health:()=>configs.map(e=>({sport:e.config.sport,source:e.config.source,marketType:e.config.marketType,state:e.state})),refreshMarkets:async()=>Promise.all(configs.map(e=>e.refreshMarkets()))};
}
