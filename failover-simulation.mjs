import assert from 'node:assert/strict';
import { normalizeScoreFeed, normalizeEspnScoreboard, canonicalEventKey, chooseScoreSnapshot } from './score-engine.js';
import { generateLEVMarket, priceProgressively } from './lev-engine.js';

const apiPayload={response:[{fixture:{id:101,date:'2026-08-12T20:00:00Z',status:{short:'2H',long:'Second Half',elapsed:63}},league:{name:'Liga MX'},teams:{home:{name:'America'},away:{name:'Chivas'}},goals:{home:1,away:0}}]};
const api=normalizeScoreFeed(apiPayload,'API_FOOTBALL');
assert.equal(api.length,1);
assert.equal(api[0].status,'LIVE');
assert.equal(api[0].homeScore,1);
assert.equal(api[0].elapsed,63);

const espnPayload={
  leagues:[{name:'Liga MX'}],
  events:[{
    id:'999',
    date:'2026-08-15T23:00:00Z',
    competitions:[{
      competitors:[
        {homeAway:'home',team:{displayName:'America'},score:'0'},
        {homeAway:'away',team:{displayName:'Chivas'},score:'0'}
      ],
      status:{type:{state:'pre',description:'Scheduled'},displayClock:'0:00'}
    }]
  }]
};
const espn=normalizeEspnScoreboard(espnPayload,'mex.1');
assert.equal(espn.length,1);
assert.equal(espn[0].status,'OPEN');
assert.equal(espn[0].home,'America');
assert.equal(espn[0].away,'Chivas');

const backup=normalizeScoreFeed({events:[{id:'b1',sport:'Fútbol',league:'Liga MX',home:'America',away:'Chivas',startsAt:'2026-08-12T20:00:00Z',status:'LIVE',homeScore:1,awayScore:0,elapsed:64}]},'BACKUP');
assert.equal(backup[0].status,'LIVE');
assert.equal(canonicalEventKey(api[0]),canonicalEventKey(backup[0]));
assert.equal(chooseScoreSnapshot(null,[null,backup[0]]).homeScore,1);

// API fails -> backup data still produces a market.
let market=generateLEVMarket({live:{minute:64,homeGoals:1,awayGoals:0},historical:{},betting:{}});
assert.deepEqual(market.selections.map(x=>x.code),['L','E','V']);
assert.ok(market.selections.every(x=>x.odds>1));

// No external data -> baseline market still exists.
market=generateLEVMarket({live:{minute:0,homeGoals:0,awayGoals:0},historical:{},betting:{}});
assert.equal(market.selections.length,3);

// Betting distribution changes pricing but cannot remove a selection.
market=generateLEVMarket({live:{minute:40,homeGoals:0,awayGoals:0},historical:{},betting:{homeAmount:10000,drawAmount:100,awayAmount:100}});
assert.equal(market.selections.length,3);

// Progressive pricing: a normal 2-0 score at 58' must not explode to +500/+600.
const normalLead=generateLEVMarket({live:{minute:58,homeGoals:2,awayGoals:0},historical:{},betting:{}});
const normalOdds=Object.fromEntries(normalLead.selections.map(x=>[x.code,x.odds]));
assert.ok(normalOdds.E < 5.0, `58' draw too high: ${normalOdds.E}`);
assert.ok(normalOdds.V < 5.5, `58' visitor too high: ${normalOdds.V}`);

// Late extreme lead: 5-0 near the end may reach the extreme range.
const extreme=generateLEVMarket({live:{minute:89,homeGoals:5,awayGoals:0},historical:{},betting:{}});
const extremeOdds=Object.fromEntries(extreme.selections.map(x=>[x.code,x.odds]));
assert.ok(extremeOdds.L <= 1.12, `late favorite not compressed enough: ${extremeOdds.L}`);
assert.ok(extremeOdds.V >= 20, `late loser not sufficiently long: ${extremeOdds.V}`);

// Direct progression sanity: later pricing must not be more aggressive early.
const early=priceProgressively([1.55,5.0,6.0],30,1);
const late=priceProgressively([1.55,5.0,6.0],88,1);
assert.ok(early[1] < late[1]);
assert.ok(early[2] < late[2]);

console.log('BETLIVE RESILIENCE + PROGRESSIVE ODDS SIMULATION: PASS');
console.log('ESPN fallback:', espn[0].home+' vs '+espn[0].away, espn[0].status);
console.log("58' 2-0:", normalLead.selections.map(x=>x.code+":"+x.odds).join(" "));
console.log("89' 5-0:", extreme.selections.map(x=>x.code+":"+x.odds).join(" "));
