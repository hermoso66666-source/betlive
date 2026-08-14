import assert from 'node:assert/strict';
import { normalizeScoreFeed, canonicalEventKey, chooseScoreSnapshot } from './score-engine.js';
import { generateLEVMarket } from './lev-engine.js';

const apiPayload={response:[{fixture:{id:101,date:'2026-08-12T20:00:00Z',status:{short:'2H',long:'Second Half',elapsed:63}},league:{name:'Liga MX'},teams:{home:{name:'America'},away:{name:'Chivas'}},goals:{home:1,away:0}}]};
const api=normalizeScoreFeed(apiPayload,'API_FOOTBALL');
assert.equal(api.length,1); assert.equal(api[0].status,'LIVE'); assert.equal(api[0].homeScore,1); assert.equal(api[0].elapsed,63);

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
console.log('FAILOVER SIMULATION: PASS');
console.log('API -> LIVE:', api[0].homeScore+'-'+api[0].awayScore, api[0].elapsed+"'");
console.log('BACKUP -> LIVE:', backup[0].homeScore+'-'+backup[0].awayScore, backup[0].elapsed+"'");
console.log('NO API -> L/E/V:', market.selections.map(x=>x.code+':'+x.odds).join(' '));
