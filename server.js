import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import pg from "pg";
import path from "path";
import {fileURLToPath} from "url";

const {Pool}=pg;
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
app.set("trust proxy",1);
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:"100kb"}));
app.use(cookieParser());

if(!process.env.DATABASE_URL) console.warn("DATABASE_URL no configurado");
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false});
const JWT_SECRET=process.env.JWT_SECRET;
if(!JWT_SECRET) console.warn("JWT_SECRET no configurado");
const PORT=process.env.PORT||10000;
const authLimiter=rateLimit({windowMs:15*60*1000,max:40,standardHeaders:true,legacyHeaders:false});
const ticketLimiter=rateLimit({windowMs:60*1000,max:20,standardHeaders:true,legacyHeaders:false});

async function dbInit(){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS users(
   id UUID PRIMARY KEY, name VARCHAR(80) NOT NULL, email VARCHAR(255) UNIQUE, phone VARCHAR(30) UNIQUE,
   password_hash TEXT, provider VARCHAR(20) NOT NULL DEFAULT 'local', provider_subject VARCHAR(255),
   balance_cents BIGINT NOT NULL DEFAULT 0, role VARCHAR(20) NOT NULL DEFAULT 'user', active BOOLEAN NOT NULL DEFAULT TRUE,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
 ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
 CREATE TABLE IF NOT EXISTS balance_transactions(
   id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
   type VARCHAR(30) NOT NULL DEFAULT 'ADJUSTMENT',amount_cents BIGINT NOT NULL CHECK(amount_cents<>0),balance_after_cents BIGINT NOT NULL CHECK(balance_after_cents>=0),
   reason VARCHAR(255) NOT NULL,reference_id UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS type VARCHAR(30) NOT NULL DEFAULT 'ADJUSTMENT';
 ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS reference_id UUID;
 CREATE INDEX IF NOT EXISTS idx_balance_tx_user_created ON balance_transactions(user_id,created_at DESC);
 CREATE TABLE IF NOT EXISTS sports_events(
   id UUID PRIMARY KEY,sport VARCHAR(40) NOT NULL,league VARCHAR(100) NOT NULL,home_team VARCHAR(100) NOT NULL,away_team VARCHAR(100) NOT NULL,
   starts_at TIMESTAMPTZ NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'OPEN',home_score INT DEFAULT 0,away_score INT DEFAULT 0,
   featured BOOLEAN NOT NULL DEFAULT FALSE,video BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE INDEX IF NOT EXISTS idx_events_start ON sports_events(starts_at);
 CREATE TABLE IF NOT EXISTS markets(
   id UUID PRIMARY KEY,event_id UUID NOT NULL REFERENCES sports_events(id) ON DELETE CASCADE,name VARCHAR(100) NOT NULL,market_type VARCHAR(40) NOT NULL,
   status VARCHAR(20) NOT NULL DEFAULT 'OPEN',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS market_selections(
   id UUID PRIMARY KEY,market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,label VARCHAR(100) NOT NULL,code VARCHAR(30) NOT NULL,
   odds NUMERIC(10,3) NOT NULL CHECK(odds>1),status VARCHAR(20) NOT NULL DEFAULT 'OPEN',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE INDEX IF NOT EXISTS idx_market_sel_market ON market_selections(market_id);
 CREATE TABLE IF NOT EXISTS tickets(
   id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,stake_cents BIGINT NOT NULL CHECK(stake_cents>0),
   total_odds NUMERIC(10,3) NOT NULL CHECK(total_odds>0),potential_cents BIGINT NOT NULL CHECK(potential_cents>=0),
   status VARCHAR(20) NOT NULL DEFAULT 'PENDING',selections JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),settled_at TIMESTAMPTZ
 );
 CREATE INDEX IF NOT EXISTS idx_tickets_user_created ON tickets(user_id,created_at DESC);
 CREATE TABLE IF NOT EXISTS quinielas(
   id UUID PRIMARY KEY,name VARCHAR(100) NOT NULL,kind VARCHAR(30) NOT NULL,price_cents BIGINT NOT NULL CHECK(price_cents>=0),description TEXT DEFAULT '',
   active BOOLEAN NOT NULL DEFAULT TRUE,close_at TIMESTAMPTZ,prize_text VARCHAR(255) DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS wallet_requests(
   id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,type VARCHAR(20) NOT NULL CHECK(type IN ('DEPOSIT','WITHDRAWAL')),
   amount_cents BIGINT NOT NULL CHECK(amount_cents>0),status VARCHAR(20) NOT NULL DEFAULT 'PENDING',note VARCHAR(255) DEFAULT '',admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),resolved_at TIMESTAMPTZ
 );
 CREATE INDEX IF NOT EXISTS idx_wallet_req_status ON wallet_requests(status,created_at DESC);
 CREATE TABLE IF NOT EXISTS admin_audit(
   id UUID PRIMARY KEY,admin_id UUID REFERENCES users(id) ON DELETE SET NULL,action VARCHAR(80) NOT NULL,target_type VARCHAR(40),target_id UUID,details JSONB DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 `);
 await seedDemoEvents();
}
async function seedDemoEvents(){
 const c=await pool.query("SELECT COUNT(*)::int n FROM sports_events");
 if(c.rows[0].n>0)return;
 const demos=[
  ["Fútbol","Liga MX","América","Tigres",[1.65,3.90,4.80],true,true],
  ["Fútbol","LaLiga","Barcelona","Real Madrid",[2.15,3.25,3.05],true,false],
  ["Fútbol","Premier League","Man City","Liverpool",[2.05,3.40,2.95],false,true],
  ["Básquetbol","NBA","Lakers","Celtics",[1.80,1.95],true,true],
  ["Tenis","ATP","Alcaraz","Sinner",[1.55,2.35],false,false],
  ["Béisbol","MLB","Dodgers","Yankees",[1.72,2.10],false,true]
 ];
 for(let i=0;i<demos.length;i++){
  const [sport,league,home,away,odds,featured,video]=demos[i];
  const eid=crypto.randomUUID();
  await pool.query("INSERT INTO sports_events(id,sport,league,home_team,away_team,starts_at,status,featured,video) VALUES($1,$2,$3,$4,$5,NOW()+$6::interval,'OPEN',$7,$8)",[eid,sport,league,home,away,`${i+1} hours`,featured,video]);
  const mid=crypto.randomUUID();
  const labels=odds.length===3?[["1","Local"],["X","Empate"],["2","Visitante"]]:[["1","Local"],["2","Visitante"]];
  await pool.query("INSERT INTO markets(id,event_id,name,market_type) VALUES($1,$2,'Ganador','MATCH_WINNER')",[mid,eid]);
  for(let j=0;j<odds.length;j++)await pool.query("INSERT INTO market_selections(id,market_id,label,code,odds) VALUES($1,$2,$3,$4,$5)",[crypto.randomUUID(),mid,labels[j][1],labels[j][0],odds[j]]);
 }
 const q=await pool.query("SELECT COUNT(*)::int n FROM quinielas");
 if(q.rows[0].n===0){
  await pool.query("INSERT INTO quinielas(id,name,kind,price_cents,description,prize_text) VALUES($1,'Quiniela Fácil','FACIL',1500,'Selecciona tus pronósticos de la jornada.','Premios según reglas de la quiniela')",[crypto.randomUUID()]);
  await pool.query("INSERT INTO quinielas(id,name,kind,price_cents,description,prize_text) VALUES($1,'Quiniela Clásica','CLASICA',1200,'La quiniela clásica de BetLive.','Premios según reglas de la quiniela')",[crypto.randomUUID()]);
 }
}
function cleanEmail(v){return typeof v==="string"&&v.trim()?v.trim().toLowerCase():null}
function cleanPhone(v){return typeof v==="string"&&v.trim()?v.trim():null}
function validateName(n){return typeof n==="string"&&n.trim().length>=2&&n.trim().length<=80}
function validatePassword(p){return typeof p==="string"&&p.length>=8&&p.length<=128}
function sign(user){if(!JWT_SECRET)throw new Error("JWT_SECRET no configurado");return jwt.sign({sub:user.id},JWT_SECRET,{expiresIn:"7d"})}
function setAuth(res,user){res.cookie("bl_session",sign(user),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:7*24*60*60*1000,path:"/"})}
async function auth(req,res,next){try{const token=req.cookies.bl_session;if(!token)return res.status(401).json({error:"No autenticado"});const p=jwt.verify(token,JWT_SECRET);const {rows}=await pool.query("SELECT id,name,email,phone,balance_cents,role,active FROM users WHERE id=$1",[p.sub]);if(!rows[0]||!rows[0].active)return res.status(401).json({error:"Sesión inválida o cuenta bloqueada"});req.user=rows[0];next()}catch{return res.status(401).json({error:"Sesión inválida"})}}
function requireAdmin(req,res,next){if(!req.user||req.user.role!=="admin")return res.status(403).json({error:"Acceso de administrador requerido"});next()}
async function audit(admin,action,targetType,targetId,details={}){await pool.query("INSERT INTO admin_audit(id,admin_id,action,target_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)",[crypto.randomUUID(),admin,action,targetType,targetId||null,JSON.stringify(details)])}
async function ensureBootstrapAdmin(){const email=cleanEmail(process.env.ADMIN_EMAIL),password=process.env.ADMIN_PASSWORD,name=(process.env.ADMIN_NAME||"Administrador").trim().slice(0,80)||"Administrador";if(!email||!password){console.warn("ADMIN_EMAIL/ADMIN_PASSWORD no configurados");return}if(!validatePassword(password))throw new Error("ADMIN_PASSWORD debe tener entre 8 y 128 caracteres");const hash=await bcrypt.hash(password,12);const existing=await pool.query("SELECT id FROM users WHERE email=$1 LIMIT 1",[email]);if(existing.rows[0])await pool.query("UPDATE users SET role='admin',active=TRUE,name=$1,password_hash=$2 WHERE id=$3",[name,hash,existing.rows[0].id]);else await pool.query("INSERT INTO users(id,name,email,password_hash,role,active) VALUES($1,$2,$3,$4,'admin',TRUE)",[crypto.randomUUID(),name,email,hash]);}

// Auth
app.post("/api/auth/register",authLimiter,async(req,res)=>{try{const name=req.body.name?.trim(),email=cleanEmail(req.body.email),phone=cleanPhone(req.body.phone),password=req.body.password;if(!validateName(name)||(!email&&!phone)||!validatePassword(password))return res.status(400).json({error:"Datos de registro inválidos"});const exists=await pool.query("SELECT id FROM users WHERE (email=$1 AND $1 IS NOT NULL) OR (phone=$2 AND $2 IS NOT NULL)",[email,phone]);if(exists.rowCount)return res.status(409).json({error:"La cuenta ya existe"});const hash=await bcrypt.hash(password,12),id=crypto.randomUUID();const {rows}=await pool.query("INSERT INTO users(id,name,email,phone,password_hash,balance_cents) VALUES($1,$2,$3,$4,$5,0) RETURNING id,name,email,phone,balance_cents,role",[id,name,email,phone,hash]);setAuth(res,rows[0]);res.status(201).json({user:rows[0]})}catch(e){console.error(e);res.status(500).json({error:"Error del servidor"})}});
app.post("/api/auth/login",authLimiter,async(req,res)=>{try{const identifier=(req.body.identifier||"").trim().toLowerCase(),password=req.body.password;if(identifier.length<3||!validatePassword(password))return res.status(400).json({error:"Datos inválidos"});const {rows}=await pool.query("SELECT * FROM users WHERE lower(coalesce(email,''))=$1 OR phone=$2 LIMIT 1",[identifier,identifier]);if(!rows[0]||!rows[0].active||!rows[0].password_hash||!(await bcrypt.compare(password,rows[0].password_hash)))return res.status(401).json({error:rows[0]&&!rows[0].active?"Cuenta bloqueada":"Credenciales incorrectas"});setAuth(res,rows[0]);res.json({user:{id:rows[0].id,name:rows[0].name,email:rows[0].email,phone:rows[0].phone,balance_cents:rows[0].balance_cents,role:rows[0].role}})}catch(e){console.error(e);res.status(500).json({error:"Error del servidor"})}});
app.post("/api/auth/logout",auth,(req,res)=>{res.clearCookie("bl_session",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/"});res.json({ok:true})});
app.get("/api/me",auth,(req,res)=>res.json({user:req.user}));

// Public catalog
app.get("/api/events",async(req,res)=>{try{const {rows}=await pool.query(`SELECT e.id,e.sport,e.league,e.home_team,e.away_team,e.starts_at,e.status,e.home_score,e.away_score,e.featured,e.video,COALESCE(jsonb_agg(jsonb_build_object('marketId',m.id,'name',m.name,'type',m.market_type,'status',m.status,'selections',(SELECT jsonb_agg(jsonb_build_object('id',s.id,'label',s.label,'code',s.code,'odds',s.odds,'status',s.status) ORDER BY s.created_at) FROM market_selections s WHERE s.market_id=m.id)) ORDER BY m.created_at) FILTER(WHERE m.id IS NOT NULL),'[]'::jsonb) markets FROM sports_events e LEFT JOIN markets m ON m.event_id=e.id WHERE e.status IN ('OPEN','LIVE') GROUP BY e.id ORDER BY e.starts_at LIMIT 200`);res.json({events:rows})}catch(e){console.error(e);res.status(500).json({error:"No se pudieron cargar los eventos"})}});
app.get("/api/quinielas",async(req,res)=>{const {rows}=await pool.query("SELECT id,name,kind,price_cents,description,active,close_at,prize_text FROM quinielas WHERE active=TRUE ORDER BY price_cents");res.json({quinielas:rows})});

// Tickets: server validates selected odds against DB
app.get("/api/tickets",auth,async(req,res)=>{const {rows}=await pool.query("SELECT id,stake_cents,total_odds,potential_cents,status,selections,created_at,settled_at FROM tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[req.user.id]);res.json({tickets:rows})});
app.post("/api/tickets",auth,ticketLimiter,async(req,res)=>{
 const ids=Array.isArray(req.body.selectionIds)?req.body.selectionIds:[];const stake=Math.round(Number(req.body.stakeCents));
 if(!ids.length||ids.length>20||!Number.isSafeInteger(stake)||stake<100||stake>100000000)return res.status(400).json({error:"Ticket inválido"});
 const client=await pool.connect();
 try{await client.query("BEGIN");
  const qs=await client.query(`SELECT s.id,s.label,s.code,s.odds,m.id market_id,m.name market_name,e.id event_id,e.sport,e.league,e.home_team,e.away_team,e.status event_status FROM market_selections s JOIN markets m ON m.id=s.market_id JOIN sports_events e ON e.id=m.event_id WHERE s.id=ANY($1::uuid[]) AND s.status='OPEN' AND m.status='OPEN' AND e.status IN ('OPEN','LIVE')`,[ids]);
  if(qs.rows.length!==ids.length)throw new Error("Una o más selecciones ya no están disponibles");
  const seen=new Set();for(const x of qs.rows){if(seen.has(x.market_id))throw new Error("No puedes elegir dos opciones del mismo mercado");seen.add(x.market_id)}
  const total=qs.rows.reduce((a,x)=>a*Number(x.odds),1);if(!Number.isFinite(total)||total<=0||total>1000000)throw new Error("Cuota inválida");
  const potential=Math.round(stake*total);const u=await client.query("SELECT balance_cents FROM users WHERE id=$1 FOR UPDATE",[req.user.id]);if(!u.rows[0]||BigInt(u.rows[0].balance_cents)<BigInt(stake))throw new Error("Saldo insuficiente");
  const id=crypto.randomUUID();const selections=qs.rows.map(x=>({selectionId:x.id,eventId:x.event_id,marketId:x.market_id,sport:x.sport,league:x.league,home:x.home_team,away:x.away_team,label:x.label,code:x.code,odds:Number(x.odds)}));
  await client.query("INSERT INTO tickets(id,user_id,stake_cents,total_odds,potential_cents,selections) VALUES($1,$2,$3,$4,$5,$6)",[id,req.user.id,stake,total,potential,JSON.stringify(selections)]);
  const next=(BigInt(u.rows[0].balance_cents)-BigInt(stake)).toString();await client.query("UPDATE users SET balance_cents=$1 WHERE id=$2",[next,req.user.id]);
  await client.query("INSERT INTO balance_transactions(id,user_id,type,amount_cents,balance_after_cents,reason,reference_id) VALUES($1,$2,'BET',$3,$4,$5,$6)",[crypto.randomUUID(),req.user.id,-stake,next,"Apuesta "+id,id]);
  await client.query("COMMIT");res.status(201).json({ticket:{id,stake_cents:stake,total_odds:total,potential_cents:potential,status:"PENDING",selections}})
 }catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message||"No se pudo crear el ticket"})}finally{client.release()}
});

// Wallet requests
app.get("/api/wallet/transactions",auth,async(req,res)=>{const {rows}=await pool.query("SELECT id,type,amount_cents,balance_after_cents,reason,created_at FROM balance_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[req.user.id]);res.json({transactions:rows})});
app.get("/api/wallet/requests",auth,async(req,res)=>{const {rows}=await pool.query("SELECT id,type,amount_cents,status,note,created_at,resolved_at FROM wallet_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[req.user.id]);res.json({requests:rows})});
app.post("/api/wallet/requests",auth,async(req,res)=>{const type=req.body.type,amount=Math.trunc(Number(req.body.amountCents)),note=String(req.body.note||"").slice(0,255);if(!['DEPOSIT','WITHDRAWAL'].includes(type)||!Number.isSafeInteger(amount)||amount<100)return res.status(400).json({error:"Solicitud inválida"});const {rows}=await pool.query("INSERT INTO wallet_requests(id,user_id,type,amount_cents,note) VALUES($1,$2,$3,$4,$5) RETURNING *",[crypto.randomUUID(),req.user.id,type,amount,note]);res.status(201).json({request:rows[0]})});

// Admin dashboard
app.get("/api/admin/me",auth,requireAdmin,(req,res)=>res.json({admin:req.user}));
app.get("/api/admin/stats",auth,requireAdmin,async(req,res)=>{try{const [u,t,b,r,e]=await Promise.all([pool.query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE active)::int active,COUNT(*) FILTER(WHERE role='admin')::int admins FROM users"),pool.query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='PENDING')::int pending,COALESCE(SUM(stake_cents),0)::bigint staked FROM tickets"),pool.query("SELECT COALESCE(SUM(balance_cents),0)::bigint balance FROM users WHERE role='user'"),pool.query("SELECT COUNT(*) FILTER(WHERE status='PENDING')::int pending FROM wallet_requests"),pool.query("SELECT COUNT(*) FILTER(WHERE status IN ('OPEN','LIVE'))::int open FROM sports_events")]);res.json({users:u.rows[0],tickets:t.rows[0],balances:b.rows[0],requests:r.rows[0],events:e.rows[0]})}catch(e){res.status(500).json({error:"No se pudieron cargar estadísticas"})}});
app.get("/api/admin/users",auth,requireAdmin,async(req,res)=>{const q=String(req.query.q||"").trim().toLowerCase();const {rows}=await pool.query(`SELECT id,name,email,phone,balance_cents,role,active,created_at FROM users WHERE ($1='' OR lower(name) LIKE '%'||$1||'%' OR lower(coalesce(email,'')) LIKE '%'||$1||'%' OR coalesce(phone,'') LIKE '%'||$1||'%') ORDER BY created_at DESC LIMIT 300`,[q]);res.json({users:rows})});
app.patch("/api/admin/users/:id/status",auth,requireAdmin,async(req,res)=>{const active=Boolean(req.body.active);if(req.params.id===req.user.id&&!active)return res.status(400).json({error:"No puedes bloquear tu propia cuenta"});const {rows}=await pool.query("UPDATE users SET active=$1 WHERE id=$2 RETURNING id,name,email,phone,balance_cents,role,active,created_at",[active,req.params.id]);if(!rows[0])return res.status(404).json({error:"Usuario no encontrado"});await audit(req.user.id,active?"ACTIVATE_USER":"BLOCK_USER","user",req.params.id);res.json({user:rows[0]})});
app.post("/api/admin/users/:id/balance",auth,requireAdmin,async(req,res)=>{const amount=Math.trunc(Number(req.body.amountCents)),reason=String(req.body.reason||"").trim().slice(0,255);if(!Number.isSafeInteger(amount)||amount===0||!reason)return res.status(400).json({error:"Monto o motivo inválido"});const client=await pool.connect();try{await client.query("BEGIN");const u=await client.query("SELECT balance_cents FROM users WHERE id=$1 FOR UPDATE",[req.params.id]);if(!u.rows[0])throw new Error("Usuario no encontrado");const next=BigInt(u.rows[0].balance_cents)+BigInt(amount);if(next<0n)throw new Error("El saldo no puede quedar negativo");await client.query("UPDATE users SET balance_cents=$1 WHERE id=$2",[next.toString(),req.params.id]);await client.query("INSERT INTO balance_transactions(id,user_id,admin_id,type,amount_cents,balance_after_cents,reason) VALUES($1,$2,$3,'ADMIN_ADJUSTMENT',$4,$5,$6)",[crypto.randomUUID(),req.params.id,req.user.id,amount,next.toString(),reason]);await client.query("COMMIT");await audit(req.user.id,"BALANCE_ADJUSTMENT","user",req.params.id,{amount,reason});res.json({ok:true,balance_cents:next.toString()})}catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message})}finally{client.release()}});
app.get("/api/admin/users/:id/transactions",auth,requireAdmin,async(req,res)=>{const {rows}=await pool.query(`SELECT bt.id,bt.type,bt.amount_cents,bt.balance_after_cents,bt.reason,bt.created_at,COALESCE(a.name,'Sistema') admin_name FROM balance_transactions bt LEFT JOIN users a ON a.id=bt.admin_id WHERE bt.user_id=$1 ORDER BY bt.created_at DESC LIMIT 200`,[req.params.id]);res.json({transactions:rows})});
app.get("/api/admin/tickets",auth,requireAdmin,async(req,res)=>{const {rows}=await pool.query(`SELECT t.id,t.stake_cents,t.total_odds,t.potential_cents,t.status,t.selections,t.created_at,t.settled_at,u.name user_name,u.email user_email FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 300`);res.json({tickets:rows})});
app.post("/api/admin/tickets/:id/settle",auth,requireAdmin,async(req,res)=>{const status=String(req.body.status||"").toUpperCase();if(!['WON','LOST','VOID'].includes(status))return res.status(400).json({error:"Estado inválido"});const client=await pool.connect();try{await client.query("BEGIN");const q=await client.query("SELECT * FROM tickets WHERE id=$1 FOR UPDATE",[req.params.id]);if(!q.rows[0])throw new Error("Ticket no encontrado");if(q.rows[0].status!=="PENDING")throw new Error("El ticket ya fue liquidado");const t=q.rows[0];let credit=0;if(status==='WON')credit=Number(t.potential_cents);if(status==='VOID')credit=Number(t.stake_cents);const u=await client.query("SELECT balance_cents FROM users WHERE id=$1 FOR UPDATE",[t.user_id]);const next=(BigInt(u.rows[0].balance_cents)+BigInt(credit)).toString();await client.query("UPDATE tickets SET status=$1,settled_at=NOW() WHERE id=$2",[status,t.id]);if(credit>0){await client.query("UPDATE users SET balance_cents=$1 WHERE id=$2",[next,t.user_id]);await client.query("INSERT INTO balance_transactions(id,user_id,admin_id,type,amount_cents,balance_after_cents,reason,reference_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[crypto.randomUUID(),t.user_id,req.user.id,status,credit,next,`Liquidación ${status} ${t.id}`,t.id])}await client.query("COMMIT");await audit(req.user.id,"SETTLE_TICKET","ticket",t.id,{status,credit});res.json({ok:true,status})}catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message})}finally{client.release()}});

// Admin events / markets
app.get("/api/admin/events",auth,requireAdmin,async(req,res)=>{const {rows}=await pool.query(`SELECT e.id,e.sport,e.league,e.home_team,e.away_team,e.starts_at,e.status,e.home_score,e.away_score,e.featured,e.video,COUNT(ms.id)::int selections_count FROM sports_events e LEFT JOIN markets m ON m.event_id=e.id LEFT JOIN market_selections ms ON ms.market_id=m.id GROUP BY e.id ORDER BY e.starts_at DESC LIMIT 300`);res.json({events:rows})});
app.post("/api/admin/events",auth,requireAdmin,async(req,res)=>{const {sport,league,homeTeam,awayTeam,startsAt,featured=false,video=false}=req.body;if(!sport||!league||!homeTeam||!awayTeam||!startsAt)return res.status(400).json({error:"Completa el evento"});const id=crypto.randomUUID();const {rows}=await pool.query("INSERT INTO sports_events(id,sport,league,home_team,away_team,starts_at,featured,video) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[id,String(sport).slice(0,40),String(league).slice(0,100),String(homeTeam).slice(0,100),String(awayTeam).slice(0,100),startsAt,Boolean(featured),Boolean(video)]);await audit(req.user.id,"CREATE_EVENT","event",id);res.status(201).json({event:rows[0]})});
app.patch("/api/admin/events/:id",auth,requireAdmin,async(req,res)=>{const fields=[],vals=[];const map={sport:"sport",league:"league",homeTeam:"home_team",awayTeam:"away_team",startsAt:"starts_at",status:"status",homeScore:"home_score",awayScore:"away_score",featured:"featured",video:"video"};for(const [k,col] of Object.entries(map))if(req.body[k]!==undefined){fields.push(`${col}=$${vals.length+1}`);vals.push(req.body[k])}if(!fields.length)return res.status(400).json({error:"Sin cambios"});vals.push(req.params.id);const {rows}=await pool.query(`UPDATE sports_events SET ${fields.join(',')} WHERE id=$${vals.length} RETURNING *`,vals);if(!rows[0])return res.status(404).json({error:"Evento no encontrado"});await audit(req.user.id,"UPDATE_EVENT","event",req.params.id,req.body);res.json({event:rows[0]})});
app.delete("/api/admin/events/:id",auth,requireAdmin,async(req,res)=>{await pool.query("DELETE FROM sports_events WHERE id=$1",[req.params.id]);await audit(req.user.id,"DELETE_EVENT","event",req.params.id);res.json({ok:true})});
app.get("/api/admin/events/:id/markets",auth,requireAdmin,async(req,res)=>{const {rows}=await pool.query(`SELECT m.id,m.name,m.market_type,m.status,jsonb_agg(jsonb_build_object('id',s.id,'label',s.label,'code',s.code,'odds',s.odds,'status',s.status) ORDER BY s.created_at) selections FROM markets m LEFT JOIN market_selections s ON s.market_id=m.id WHERE m.event_id=$1 GROUP BY m.id ORDER BY m.created_at`,[req.params.id]);res.json({markets:rows})});
app.post("/api/admin/events/:id/markets",auth,requireAdmin,async(req,res)=>{const {name,marketType="MATCH_WINNER",selections=[]}=req.body;if(!name||!Array.isArray(selections)||!selections.length)return res.status(400).json({error:"Mercado incompleto"});const client=await pool.connect();try{await client.query("BEGIN");const mid=crypto.randomUUID();await client.query("INSERT INTO markets(id,event_id,name,market_type) VALUES($1,$2,$3,$4)",[mid,req.params.id,String(name).slice(0,100),String(marketType).slice(0,40)]);for(const s of selections){const odds=Number(s.odds);if(!s.label||!Number.isFinite(odds)||odds<=1)throw new Error("Cuota inválida");await client.query("INSERT INTO market_selections(id,market_id,label,code,odds) VALUES($1,$2,$3,$4,$5)",[crypto.randomUUID(),mid,String(s.label).slice(0,100),String(s.code||"").slice(0,30),odds])}await client.query("COMMIT");await audit(req.user.id,"CREATE_MARKET","event",req.params.id,{name});res.status(201).json({ok:true,marketId:mid})}catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message})}finally{client.release()}});
app.patch("/api/admin/selections/:id",auth,requireAdmin,async(req,res)=>{const fields=[],vals=[];if(req.body.odds!==undefined){const o=Number(req.body.odds);if(!Number.isFinite(o)||o<=1)return res.status(400).json({error:"Cuota inválida"});fields.push(`odds=$${vals.length+1}`);vals.push(o)}if(req.body.status!==undefined){fields.push(`status=$${vals.length+1}`);vals.push(String(req.body.status).toUpperCase())}if(!fields.length)return res.status(400).json({error:"Sin cambios"});vals.push(req.params.id);const {rows}=await pool.query(`UPDATE market_selections SET ${fields.join(',')} WHERE id=$${vals.length} RETURNING *`,vals);if(!rows[0])return res.status(404).json({error:"Selección no encontrada"});await audit(req.user.id,"UPDATE_ODDS","selection",req.params.id,req.body);res.json({selection:rows[0]})});

// Admin quinielas
app.get("/api/admin/quinielas",auth,requireAdmin,async(req,res)=>{const {rows}=await pool.query("SELECT * FROM quinielas ORDER BY created_at DESC");res.json({quinielas:rows})});
app.post("/api/admin/quinielas",auth,requireAdmin,async(req,res)=>{const {name,kind,priceCents,description="",closeAt=null,prizeText=""}=req.body;const p=Math.trunc(Number(priceCents));if(!name||!kind||!Number.isSafeInteger(p)||p<0)return res.status(400).json({error:"Quiniela inválida"});const id=crypto.randomUUID();const {rows}=await pool.query("INSERT INTO quinielas(id,name,kind,price_cents,description,close_at,prize_text) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[id,String(name).slice(0,100),String(kind).slice(0,30),p,String(description),closeAt, String(prizeText).slice(0,255)]);await audit(req.user.id,"CREATE_QUINIELA","quiniela",id);res.status(201).json({quiniela:rows[0]})});
app.patch("/api/admin/quinielas/:id",auth,requireAdmin,async(req,res)=>{const map={name:"name",kind:"kind",priceCents:"price_cents",description:"description",active:"active",closeAt:"close_at",prizeText:"prize_text"};const f=[],v=[];for(const[k,c]of Object.entries(map))if(req.body[k]!==undefined){f.push(`${c}=$${v.length+1}`);v.push(k==='priceCents'?Math.trunc(Number(req.body[k])):req.body[k])}if(!f.length)return res.status(400).json({error:"Sin cambios"});v.push(req.params.id);const {rows}=await pool.query(`UPDATE quinielas SET ${f.join(',')} WHERE id=$${v.length} RETURNING *`,v);if(!rows[0])return res.status(404).json({error:"Quiniela no encontrada"});await audit(req.user.id,"UPDATE_QUINIELA","quiniela",req.params.id,req.body);res.json({quiniela:rows[0]})});

// Admin wallet requests
app.get("/api/admin/wallet-requests",auth,requireAdmin,async(req,res)=>{const {rows}=await pool.query(`SELECT r.*,u.name user_name,u.email user_email FROM wallet_requests r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 300`);res.json({requests:rows})});
app.post("/api/admin/wallet-requests/:id/resolve",auth,requireAdmin,async(req,res)=>{const status=String(req.body.status||"").toUpperCase();if(!['APPROVED','REJECTED'].includes(status))return res.status(400).json({error:"Estado inválido"});const client=await pool.connect();try{await client.query("BEGIN");const r=await client.query("SELECT * FROM wallet_requests WHERE id=$1 FOR UPDATE",[req.params.id]);if(!r.rows[0])throw new Error("Solicitud no encontrada");if(r.rows[0].status!=="PENDING")throw new Error("La solicitud ya fue resuelta");const x=r.rows[0];if(status==='APPROVED'){const u=await client.query("SELECT balance_cents FROM users WHERE id=$1 FOR UPDATE",[x.user_id]);let next=BigInt(u.rows[0].balance_cents);if(x.type==='DEPOSIT')next+=BigInt(x.amount_cents);else{if(next<BigInt(x.amount_cents))throw new Error("Saldo insuficiente para el retiro");next-=BigInt(x.amount_cents)}await client.query("UPDATE users SET balance_cents=$1 WHERE id=$2",[next.toString(),x.user_id]);await client.query("INSERT INTO balance_transactions(id,user_id,admin_id,type,amount_cents,balance_after_cents,reason,reference_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[crypto.randomUUID(),x.user_id,req.user.id,x.type,x.type==='DEPOSIT'?x.amount_cents:-x.amount_cents,next.toString(),`Solicitud ${x.type} aprobada`,x.id])}await client.query("UPDATE wallet_requests SET status=$1,admin_id=$2,resolved_at=NOW() WHERE id=$3",[status,req.user.id,x.id]);await client.query("COMMIT");await audit(req.user.id,"RESOLVE_WALLET_REQUEST","wallet_request",x.id,{status});res.json({ok:true,status})}catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message})}finally{client.release()}});

app.get("/api/admin/audit",auth,requireAdmin,async(req,res)=>{const {rows}=await pool.query(`SELECT a.id,a.action,a.target_type,a.target_id,a.details,a.created_at,COALESCE(u.name,'Sistema') admin_name FROM admin_audit a LEFT JOIN users u ON u.id=a.admin_id ORDER BY a.created_at DESC LIMIT 300`);res.json({audit:rows})});

let dbReady=false;
app.get("/api/health",(req,res)=>res.status(200).json({ok:true,database:dbReady}));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"admin.html")));
app.get("/admin/",(req,res)=>res.sendFile(path.join(__dirname,"admin.html")));
app.get("/admin.html",(req,res)=>res.sendFile(path.join(__dirname,"admin.html")));
app.use(express.static(path.join(__dirname,".")));
app.use("/api",(req,res)=>res.status(404).json({error:"Endpoint no encontrado"}));
app.get("/{*splat}",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(PORT,()=>{console.log("BetLive API escuchando en "+PORT);dbInit().then(async()=>{await ensureBootstrapAdmin();dbReady=true;console.log("Base de datos inicializada correctamente")}).catch(e=>console.error("Error inicializando la base de datos:",e))});
