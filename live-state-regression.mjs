import {normalizeScoreFeed} from "../score-engine.js";
const payload={response:[{fixture:{id:123,date:new Date().toISOString(),status:{short:"NS",long:"Not Started",elapsed:null}},league:{name:"Test League"},teams:{home:{name:"Local FC"},away:{name:"Visitante FC"}},goals:{home:1,away:0}}]};
const rows=normalizeScoreFeed(payload,"API_FOOTBALL",{forceLive:true});
if(rows.length!==1 || rows[0].status!=="LIVE") throw new Error("live=all fixture was not promoted to LIVE");
console.log("LIVE STATE REGRESSION: PASS");
