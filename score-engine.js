function clean(v, fallback='') { return typeof v === 'string' ? v.trim() : fallback; }
function num(v, fallback=0) { const n=Number(v); return Number.isFinite(n) ? n : fallback; }

function normalizeStatus(v) {
  const s=clean(v).toUpperCase();
  if(['LIVE','1H','HT','2H','ET','BT','P'].includes(s)) return 'LIVE';
  if(['FT','AET','PEN','FINISHED','ENDED','CLOSED','POST'].includes(s)) return 'FINISHED';
  return 'OPEN';
}

function canonicalEventKey(x) {
  const home=clean(x.home).toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const away=clean(x.away).toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const starts=new Date(x.startsAt||0);
  if(!home || !away || Number.isNaN(starts.getTime())) return '';
  const bucket=Math.floor(starts.getTime()/(6*60*60*1000));
  return `${clean(x.sport,'football').toLowerCase()}:${home}:${away}:${bucket}`.slice(0,220);
}

function fromApiFootball(payload, options={}) {
  const forceLive=Boolean(options.forceLive);
  const rows=Array.isArray(payload?.response) ? payload.response : [];
  return rows.map(f=>({
    externalId: f?.fixture?.id ? String(f.fixture.id) : null,
    sport: 'Fútbol', league: clean(f?.league?.name,'Fútbol'),
    home: clean(f?.teams?.home?.name), away: clean(f?.teams?.away?.name),
    startsAt: f?.fixture?.date || new Date().toISOString(),
    status: (forceLive && !['FT','AET','PEN','CANC','PST','ABD','AWD','WO'].includes(String(f?.fixture?.status?.short||'').toUpperCase())) ? 'LIVE' : normalizeStatus(f?.fixture?.status?.short),
    homeScore: num(f?.goals?.home), awayScore: num(f?.goals?.away),
    elapsed: num(f?.fixture?.status?.elapsed,0), liveStatus: clean(f?.fixture?.status?.long), confidence: 95
  })).filter(x=>x.home&&x.away);
}

function espnClockToMinute(clock) {
  const s=clean(clock);
  const m=s.match(/^(\d+):(\d{2})$/);
  if(!m) return 0;
  return Math.min(120,Number(m[1]) + Number(m[2])/60);
}

/**
 * ESPN's public scoreboard is used only as a score/event fallback.
 * It does not provide bookmaker odds and therefore never replaces the
 * independent BetLive market engine.
 */
function normalizeEspnScoreboard(payload, leagueCode='ESPN') {
  const rows=Array.isArray(payload?.events) ? payload.events : [];
  const leagueName=clean(payload?.leagues?.[0]?.name,leagueCode);
  return rows.map(ev=>{
    const comp=Array.isArray(ev?.competitions)?ev.competitions[0]:null;
    const competitors=Array.isArray(comp?.competitors)?comp.competitors:[];
    const home=competitors.find(c=>c?.homeAway==='home')||competitors[0];
    const away=competitors.find(c=>c?.homeAway==='away')||competitors[1];
    const state=String(comp?.status?.type?.state||ev?.status?.type?.state||'pre').toLowerCase();
    const status=state==='in'?'LIVE':state==='post'?'FINISHED':'OPEN';
    const minute=espnClockToMinute(comp?.status?.displayClock||ev?.status?.displayClock);
    return {
      externalId: ev?.id ? `ESPN:${ev.id}` : null,
      sport:'Fútbol',
      league:leagueName,
      home:clean(home?.team?.displayName||home?.team?.shortDisplayName||home?.athlete?.displayName),
      away:clean(away?.team?.displayName||away?.team?.shortDisplayName||away?.athlete?.displayName),
      startsAt:ev?.date||comp?.date||new Date().toISOString(),
      status,
      homeScore:num(home?.score), awayScore:num(away?.score),
      elapsed:status==='LIVE'?minute:0,
      liveStatus:clean(comp?.status?.type?.detail||comp?.status?.type?.shortDetail||comp?.status?.type?.description),
      confidence:80
    };
  }).filter(x=>x.home&&x.away);
}

function normalizeScoreFeed(payload, source='GENERIC', options={}) {
  if(source==='API_FOOTBALL') return fromApiFootball(payload, options);
  const raw=Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : Array.isArray(payload?.fixtures) ? payload.fixtures : [];
  return raw.map(x=>({
    externalId: clean(x.externalId || x.id || x.fixtureId, '' ) || null,
    sport: clean(x.sport,'Fútbol'), league: clean(x.league || x.competition,''),
    home: clean(x.home || x.homeTeam || x.teams?.home?.name),
    away: clean(x.away || x.awayTeam || x.teams?.away?.name),
    startsAt: x.startsAt || x.startTime || x.date || x.fixture?.date || new Date().toISOString(),
    status: normalizeStatus(x.status || x.state || x.fixture?.status?.short),
    homeScore: num(x.homeScore ?? x.score?.home ?? x.goals?.home),
    awayScore: num(x.awayScore ?? x.score?.away ?? x.goals?.away),
    elapsed: num(x.elapsed ?? x.minute ?? x.fixture?.status?.elapsed,0),
    liveStatus: clean(x.liveStatus || x.statusText || x.fixture?.status?.long),
    confidence: num(x.confidence, source==='BACKUP'?85:60)
  })).filter(x=>x.home&&x.away);
}

function chooseScoreSnapshot(current, candidates=[]) {
  const valid=candidates.filter(Boolean).sort((a,b)=>num(b.confidence)-num(a.confidence));
  if(valid[0]) return valid[0];
  return current || null;
}

export { normalizeScoreFeed, normalizeEspnScoreboard, chooseScoreSnapshot, canonicalEventKey };
