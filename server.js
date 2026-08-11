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
const API_FOOTBALL_KEY=process.env.API_FOOTBALL_KEY||"";
const API_FOOTBALL_BASE=(process.env.API_FOOTBALL_BASE_URL||"https://v3.football.api-sports.io").replace(/\/$/,"");
const LIVE_SYNC_ENABLED=String(process.env.LIVE_SYNC_ENABLED??"true").toLowerCase()!=="false";
const LIVE_SYNC_INTERVAL_MS=Math.max(600000,Number(process.env.LIVE_SYNC_INTERVAL_MS||7200000));
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
 ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
 ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
 ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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
 ALTER TABLE sports_events ADD COLUMN IF NOT EXISTS external_source VARCHAR(30) NOT NULL DEFAULT 'LOCAL';
 ALTER TABLE sports_events ADD COLUMN IF NOT EXISTS external_id VARCHAR(100);
 ALTER TABLE sports_events ADD COLUMN IF NOT EXISTS live_elapsed INT;
 ALTER TABLE sports_events ADD COLUMN IF NOT EXISTS live_status VARCHAR(100) DEFAULT '';
 ALTER TABLE sports_events ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
 CREATE UNIQUE INDEX IF NOT EXISTS uq_sports_events_external ON sports_events(external_source,external_id) WHERE external_id IS NOT NULL;
 CREATE TABLE IF NOT EXISTS markets(
   id UUID PRIMARY KEY,event_id UUID NOT NULL REFERENCES sports_events(id) ON DELETE CASCADE,name VARCHAR(100) NOT NULL,market_type VARCHAR(40) NOT NULL,
   status VARCHAR(20) NOT NULL DEFAULT 'OPEN',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS market_selections(
   id UUID PRIMARY KEY,market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,label VARCHAR(100) NOT NULL,code VARCHAR(30) NOT NULL,
   odds NUMERIC(10,3) NOT NULL CHECK(odds>1),status VARCHAR(20) NOT NULL DEFAULT 'OPEN',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE INDEX IF NOT EXISTS idx_market_sel_market ON market_selections(market_id);
 ALTER TABLE markets ADD COLUMN IF NOT EXISTS external_key VARCHAR(160);
 CREATE UNIQUE INDEX IF NOT EXISTS uq_markets_external_key ON markets(external_key) WHERE external_key IS NOT NULL;
 ALTER TABLE market_selections ADD COLUMN IF NOT EXISTS external_key VARCHAR(240);
 CREATE UNIQUE INDEX IF NOT EXISTS uq_market_selections_external_key ON market_selections(external_key) WHERE external_key IS NOT NULL;
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
 ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS payout_details JSONB NOT NULL DEFAULT '{}'::jsonb;
 ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS admin_note VARCHAR(500) DEFAULT '';
 CREATE TABLE IF NOT EXISTS wallet_settings(
   id INTEGER PRIMARY KEY DEFAULT 1,
   enabled BOOLEAN NOT NULL DEFAULT TRUE,
   title VARCHAR(120) NOT NULL DEFAULT 'Depósitos por transferencia',
   instructions TEXT NOT NULL DEFAULT 'Realiza tu transferencia y registra la solicitud.',
   bank_name VARCHAR(120) DEFAULT '',
   account_holder VARCHAR(160) DEFAULT '',
   account_number VARCHAR(80) DEFAULT '',
   clabe VARCHAR(30) DEFAULT '',
   card_number VARCHAR(30) DEFAULT '',
   reference_text VARCHAR(120) DEFAULT '',
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 INSERT INTO wallet_settings(id) VALUES(1) ON CONFLICT (id) DO NOTHING;
 CREATE TABLE IF NOT EXISTS oauth_accounts(
   id UUID PRIMARY KEY,
   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   provider VARCHAR(20) NOT NULL,
   provider_subject VARCHAR(255) NOT NULL,
   email VARCHAR(255),
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   UNIQUE(provider,provider_subject),
   UNIQUE(user_id,provider)
 );
 CREATE TABLE IF NOT EXISTS password_change_log(
   id UUID PRIMARY KEY,
   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );

 CREATE TABLE IF NOT EXISTS admin_audit(
   id UUID PRIMARY KEY,admin_id UUID REFERENCES users(id) ON DELETE SET NULL,action VARCHAR(80) NOT NULL,target_type VARCHAR(40),target_id UUID,details JSONB DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS support_messages(
   id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, sender_role VARCHAR(20) NOT NULL CHECK(sender_role IN ('USER','ADMIN')),
   message TEXT NOT NULL CHECK(length(trim(message))>0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ
 );
 CREATE INDEX IF NOT EXISTS idx_support_messages_user_created ON support_messages(user_id,created_at ASC);
 `);
 await seedDemoEvents();
}
async function ensureMarketTemplates(){
  const {rows:events}=await pool.query("SELECT e.id,e.sport FROM sports_events e");
  const templates={
    "Fútbol":[
      ["Doble oportunidad","DOUBLE_CHANCE",[["1X","1X",1.28],["X2","X2",1.32],["12","12",1.30]]],
      ["Más/Menos 2.5 goles","TOTAL_GOALS",[["Más 2.5","OVER",1.85],["Menos 2.5","UNDER",1.85]]],
      ["Ambos marcan","BOTH_SCORE",[["Sí","YES",1.72],["No","NO",1.92]]],
      ["Primer equipo en marcar","FIRST_GOAL",[["Local","HOME",1.75],["Ninguno","NONE",8.0],["Visitante","AWAY",2.05]]],
      ["Total de córners 8.5","TOTAL_CORNERS",[["Más 8.5","OVER",1.80],["Menos 8.5","UNDER",1.90]]],
      ["Total de tarjetas 4.5","TOTAL_CARDS",[["Más 4.5","OVER",1.85],["Menos 4.5","UNDER",1.85]]]
    ],
    "Básquetbol":[
      ["Handicap","SPREAD",[["Local -4.5","HOME",-1],["Visitante +4.5","AWAY",-1]]],
      ["Total de puntos 210.5","TOTAL_POINTS",[["Más 210.5","OVER",1.85],["Menos 210.5","UNDER",1.85]]],
      ["Ganador 1er tiempo","HALF_WINNER",[["Local","HOME",1.75],["Visitante","AWAY",2.05]]]
    ],
    "Tenis":[
      ["Handicap de juegos","GAME_SPREAD",[["Local -2.5","HOME",1.85],["Visitante +2.5","AWAY",1.85]]],
      ["Total de juegos 22.5","TOTAL_GAMES",[["Más 22.5","OVER",1.85],["Menos 22.5","UNDER",1.85]]],
      ["Ganador del 1er set","SET_WINNER",[["Local","HOME",1.75],["Visitante","AWAY",2.05]]]
    ],
    "Béisbol":[
      ["Línea de carreras","RUN_LINE",[["Local -1.5","HOME",2.10],["Visitante +1.5","AWAY",1.70]]],
      ["Total de carreras 8.5","TOTAL_RUNS",[["Más 8.5","OVER",1.85],["Menos 8.5","UNDER",1.85]]],
      ["Ganador de 1ra entrada","FIRST_INNING",[["Local","HOME",1.90],["Visitante","AWAY",1.90]]]
    ]
  };
  for(const e of events){
    const templates=templatesFor(e.sport,templates);
    for(const [name,type,sel] of templates){
      const exists=await pool.query("SELECT 1 FROM markets WHERE event_id=$1 AND name=$2 LIMIT 1",[e.id,name]);
      if(exists.rowCount)continue;
      const mid=crypto.randomUUID();
      await pool.query("INSERT INTO markets(id,event_id,name,market_type) VALUES($1,$2,$3,$4)",[mid,e.id,name,type]);
      for(const [label,code,odd] of sel){
        const value=odd>1?odd:1.85;
        await pool.query("INSERT INTO market_selections(id,market_id,label,code,odds) VALUES($1,$2,$3,$4,$5)",[crypto.randomUUID(),mid,label,code,value]);
      }
    }
  }
}
function templatesFor(sport,all){return all[sport]||[];}

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
async function auth(req,res,next){try{const token=req.cookies.bl_session;if(!token)return res.status(401).json({error:"No autenticado"});const p=jwt.verify(token,JWT_SECRET);const {rows}=await pool.query("SELECT id,name,email,phone,balance_cents,role,active,avatar_url,email_verified,provider FROM users WHERE id=$1",[p.sub]);if(!rows[0]||!rows[0].active)return res.status(401).json({error:"Sesión inválida o cuenta bloqueada"});req.user=rows[0];next()}catch{return res.status(401).json({error:"Sesión inválida"})}}
function requireAdmin(req,res,next){if(!req.user||req.user.role!=="admin")return res.status(403).json({error:"Acceso de administrador requerido"});next()}
async function audit(admin,action,targetType,targetId,details={}){await pool.query("INSERT INTO admin_audit(id,admin_id,action,target_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)",[crypto.randomUUID(),admin,action,targetType,targetId||null,JSON.stringify(details)])}
async function ensureBootstrapAdmin(){const email=cleanEmail(process.env.ADMIN_EMAIL),password=process.env.ADMIN_PASSWORD,name=(process.env.ADMIN_NAME||"Administrador").trim().slice(0,80)||"Administrador";if(!email||!password){console.warn("ADMIN_EMAIL/ADMIN_PASSWORD no configurados");return}if(!validatePassword(password))throw new Error("ADMIN_PASSWORD debe tener entre 8 y 128 caracteres");const hash=await bcrypt.hash(password,12);const existing=await pool.query("SELECT id FROM users WHERE email=$1 LIMIT 1",[email]);if(existing.rows[0])await pool.query("UPDATE users SET role='admin',active=TRUE,name=$1,password_hash=$2,email_verified=TRUE,updated_at=NOW() WHERE id=$3",[name,hash,existing.rows[0].id]);else await pool.query("INSERT INTO users(id,name,email,password_hash,role,active,email_verified) VALUES($1,$2,$3,$4,'admin',TRUE,TRUE)",[crypto.randomUUID(),name,email,hash]);}


// OAuth helpers. Secrets/credentials stay only in environment variables.
const APP_BASE_URL=(process.env.APP_BASE_URL||"").replace(/\/$/,"");
function baseUrl(req){
  return APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
}
function oauthConfigured(provider){
  if(provider==="google") return !!(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);
  return false;
}
function oauthRedirect(req,provider){
  return `${baseUrl(req)}/api/auth/${provider}/callback`;
}
function setOAuthState(res,provider,action="login"){
  const state=crypto.randomBytes(32).toString("hex");
  res.cookie("bl_oauth_state",`${provider}.${action}.${state}`,{
    httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",
    maxAge:10*60*1000,path:"/"
  });
  return state;
}
function takeOAuthState(req,res,provider,action){
  const raw=req.cookies.bl_oauth_state||"";
  res.clearCookie("bl_oauth_state",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/"});
  const parts=raw.split(".");
  if(parts.length!==3||parts[0]!==provider||parts[1]!==action||!req.query.state)return false;
  try{return crypto.timingSafeEqual(Buffer.from(parts[2]),Buffer.from(String(req.query.state)))}catch{return false}
}
async function currentUserFromCookie(req){
  try{
    const token=req.cookies.bl_session;if(!token||!JWT_SECRET)return null;
    const p=jwt.verify(token,JWT_SECRET);
    const r=await pool.query("SELECT id,name,email,phone,balance_cents,role,active,avatar_url,email_verified,provider FROM users WHERE id=$1",[p.sub]);
    return r.rows[0]||null;
  }catch{return null}
}
function oauthError(res,msg){return res.redirect("/?oauth_error="+encodeURIComponent(msg));}
async function findOrCreateOAuthUser({provider,subject,name,email,avatar,emailVerified,linkUserId=null}){
  const normalized=cleanEmail(email);
  if(linkUserId){
    const existing=await pool.query("SELECT user_id FROM oauth_accounts WHERE provider=$1 AND provider_subject=$2",[provider,subject]);
    if(existing.rows[0]&&existing.rows[0].user_id!==linkUserId)throw new Error("Esa cuenta ya está vinculada a otro usuario");
    await pool.query(`INSERT INTO oauth_accounts(id,user_id,provider,provider_subject,email) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(provider,provider_subject) DO UPDATE SET email=EXCLUDED.email`,[crypto.randomUUID(),linkUserId,provider,subject,normalized]);
    await pool.query(`UPDATE users SET provider_subject=COALESCE(provider_subject,$1),avatar_url=COALESCE($2,avatar_url),
      email_verified=CASE WHEN $3 THEN TRUE ELSE email_verified END,updated_at=NOW() WHERE id=$4`,
      [subject,avatar||null,!!emailVerified,linkUserId]);
    return (await pool.query("SELECT id,name,email,phone,balance_cents,role,active,avatar_url,email_verified,provider FROM users WHERE id=$1",[linkUserId])).rows[0];
  }
  const byProvider=await pool.query("SELECT u.* FROM users u JOIN oauth_accounts a ON a.user_id=u.id WHERE a.provider=$1 AND a.provider_subject=$2 LIMIT 1",[provider,subject]);
  if(byProvider.rows[0]){
    if(!byProvider.rows[0].active)throw new Error("Cuenta bloqueada");
    return byProvider.rows[0];
  }
  if(normalized){
    const byEmail=await pool.query("SELECT * FROM users WHERE email=$1 LIMIT 1",[normalized]);
    if(byEmail.rows[0]){
      if(provider==="google" && emailVerified){
        await pool.query("INSERT INTO oauth_accounts(id,user_id,provider,provider_subject,email) VALUES($1,$2,$3,$4,$5) ON CONFLICT(provider,provider_subject) DO NOTHING",
          [crypto.randomUUID(),byEmail.rows[0].id,provider,subject,normalized]);
        await pool.query("UPDATE users SET email_verified=TRUE,avatar_url=COALESCE($1,avatar_url),updated_at=NOW() WHERE id=$2",[avatar||null,byEmail.rows[0].id]);
        return (await pool.query("SELECT * FROM users WHERE id=$1",[byEmail.rows[0].id])).rows[0];
      }
      throw new Error("Ya existe una cuenta con ese correo. Inicia sesión con tu contraseña y vincula la cuenta desde Perfil.");
    }
  }
  const id=crypto.randomUUID();
  const r=await pool.query(`INSERT INTO users(id,name,email,password_hash,provider,provider_subject,avatar_url,email_verified,balance_cents)
    VALUES($1,$2,$3,NULL,$4,$5,$6,$7,0) RETURNING *`,
    [id,(name||"Usuario").trim().slice(0,80)||"Usuario",normalized,provider,subject,avatar||null,!!emailVerified]);
  await pool.query("INSERT INTO oauth_accounts(id,user_id,provider,provider_subject,email) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
    [crypto.randomUUID(),id,provider,subject,normalized]);
  return r.rows[0];
}

app.get("/api/auth/google",authLimiter,(req,res)=>{
  if(!oauthConfigured("google"))return res.status(503).send("Google OAuth no está configurado.");
  const action=req.query.action==="link"?"link":"login",state=setOAuthState(res,"google",action);
  const u=new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id",process.env.GOOGLE_CLIENT_ID);
  u.searchParams.set("redirect_uri",oauthRedirect(req,"google"));
  u.searchParams.set("response_type","code");
  u.searchParams.set("scope","openid email profile");
  u.searchParams.set("state",state);
  u.searchParams.set("access_type","online");
  u.searchParams.set("prompt","select_account");
  res.redirect(u.toString());
});
app.get("/api/auth/google/callback",async(req,res)=>{
  try{
    const action=(req.cookies.bl_oauth_state||"").split(".")[1]||"login";
    if(!takeOAuthState(req,res,"google",action))return oauthError(res,"Estado OAuth inválido o expirado");
    if(req.query.error)return oauthError(res,"Google canceló el inicio de sesión");
    if(!req.query.code)return oauthError(res,"Google no devolvió el código");
    const body=new URLSearchParams({code:req.query.code,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:oauthRedirect(req,"google"),grant_type:"authorization_code"});
    const tr=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
    const tokens=await tr.json();
    if(!tr.ok||!tokens.access_token)throw new Error("No se pudo obtener el token de Google");
    const ur=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${tokens.access_token}`}});
    const info=await ur.json();
    if(!ur.ok||!info.sub||!info.email)throw new Error("Google no devolvió un perfil válido");
    let linkUserId=null;
    if(action==="link"){const me=await currentUserFromCookie(req);if(!me)return oauthError(res,"Debes iniciar sesión para vincular Google");linkUserId=me.id;}
    const u=await findOrCreateOAuthUser({provider:"google",subject:info.sub,name:info.name,email:info.email,avatar:info.picture,emailVerified:!!info.email_verified,linkUserId});
    if(!linkUserId)setAuth(res,u);
    res.redirect("/?oauth=success");
  }catch(e){console.error("Google OAuth:",e);oauthError(res,e.message||"No se pudo iniciar sesión con Google")}
});

// Profile / wallet
app.get("/api/profile",auth,async(req,res)=>{
  const r=await pool.query(`SELECT id,name,email,phone,balance_cents,role,active,avatar_url,email_verified,provider,created_at FROM users WHERE id=$1`,[req.user.id]);
  const tx=await pool.query(`SELECT id,type,amount_cents,balance_after_cents,reason,created_at FROM balance_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[req.user.id]);
  const wr=await pool.query(`SELECT id,type,amount_cents,status,note,payout_details,admin_note,created_at,resolved_at FROM wallet_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`,[req.user.id]);
  res.json({profile:r.rows[0],transactions:tx.rows,requests:wr.rows});
});
app.patch("/api/profile",auth,async(req,res)=>{
  try{
    const name=req.body.name?.trim(),phone=cleanPhone(req.body.phone);
    if(!validateName(name)||phone&&phone.length>30)return res.status(400).json({error:"Datos de perfil inválidos"});
    const duplicate=await pool.query("SELECT id FROM users WHERE phone=$1 AND id<>$2",[phone,req.user.id]);
    if(phone&&duplicate.rowCount)return res.status(409).json({error:"Ese teléfono ya está registrado"});
    const r=await pool.query(`UPDATE users SET name=$1,phone=$2,updated_at=NOW() WHERE id=$3
      RETURNING id,name,email,phone,balance_cents,role,active,avatar_url,email_verified,provider`,[name,phone||null,req.user.id]);
    res.json({user:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({error:"No se pudo actualizar el perfil"})}
});
app.post("/api/profile/password",auth,authLimiter,async(req,res)=>{
  try{
    const current=req.body.currentPassword,newPassword=req.body.newPassword;
    if(!validatePassword(newPassword))return res.status(400).json({error:"La nueva contraseña debe tener entre 8 y 128 caracteres"});
    const r=await pool.query("SELECT password_hash FROM users WHERE id=$1",[req.user.id]);
    if(!r.rows[0]?.password_hash||!(await bcrypt.compare(current||"",r.rows[0].password_hash)))return res.status(401).json({error:"Contraseña actual incorrecta"});
    const hash=await bcrypt.hash(newPassword,12);
    await pool.query("UPDATE users SET password_hash=$1,provider='local',updated_at=NOW() WHERE id=$2",[hash,req.user.id]);
    await pool.query("INSERT INTO password_change_log(id,user_id) VALUES($1,$2)",[crypto.randomUUID(),req.user.id]);
    res.json({ok:true});
  }catch(e){console.error(e);res.status(500).json({error:"No se pudo cambiar la contraseña"})}
});
app.get("/api/wallet/settings",async(req,res)=>{
  try{const {rows}=await pool.query("SELECT * FROM wallet_settings WHERE id=1");res.json({settings:rows[0]||null})}
  catch(e){res.status(500).json({error:"No se pudieron cargar los datos de depósito"})}
});
app.post("/api/wallet/requests",auth,async(req,res)=>{
  const type=req.body.type,amount=Math.round(Number(req.body.amount)*100);
  if(!["DEPOSIT","WITHDRAWAL"].includes(type)||!Number.isSafeInteger(amount)||amount<=0)return res.status(400).json({error:"Solicitud inválida"});
  if(amount>100000000)return res.status(400).json({error:"Cantidad fuera de rango"});
  const note=String(req.body.note||"").trim().slice(0,255);
  const raw=req.body.payoutDetails||{};
  const payout=type==="WITHDRAWAL"?{
    method:String(raw.method||"").slice(0,40),
    accountHolder:String(raw.accountHolder||"").trim().slice(0,160),
    bank:String(raw.bank||"").trim().slice(0,120),
    accountNumber:String(raw.accountNumber||"").trim().slice(0,80),
    clabe:String(raw.clabe||"").trim().slice(0,30),
    phone:String(raw.phone||"").trim().slice(0,30)
  }:{};
  if(type==="WITHDRAWAL" && (!payout.method||!payout.accountHolder||(!payout.clabe&&!payout.accountNumber)))
    return res.status(400).json({error:"Completa los datos de pago para el retiro"});
  if(type==="WITHDRAWAL"){
    const u=await pool.query("SELECT balance_cents FROM users WHERE id=$1",[req.user.id]);
    if(!u.rows[0]||BigInt(u.rows[0].balance_cents)<BigInt(amount))return res.status(400).json({error:"Saldo insuficiente para solicitar ese retiro"});
  }
  const r=await pool.query("INSERT INTO wallet_requests(id,user_id,type,amount_cents,note,payout_details) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
    [crypto.randomUUID(),req.user.id,type,amount,note,JSON.stringify(payout)]);
  res.status(201).json({request:r.rows[0]});
});

// Auth
app.post("/api/auth/register",authLimiter,async(req,res)=>{try{const name=req.body.name?.trim(),email=cleanEmail(req.body.email),phone=cleanPhone(req.body.phone),password=req.body.password;if(!validateName(name)||(!email&&!phone)||!validatePassword(password))return res.status(400).json({error:"Datos de registro inválidos"});const exists=await pool.query("SELECT id FROM users WHERE (email=$1 AND $1 IS NOT NULL) OR (phone=$2 AND $2 IS NOT NULL)",[email,phone]);if(exists.rowCount)return res.status(409).json({error:"La cuenta ya existe"});const hash=await bcrypt.hash(password,12),id=crypto.randomUUID();const {rows}=await pool.query("INSERT INTO users(id,name,email,phone,password_hash,balance_cents) VALUES($1,$2,$3,$4,$5,0) RETURNING id,name,email,phone,balance_cents,role,avatar_url,email_verified,provider",[id,name,email,phone,hash]);setAuth(res,rows[0]);res.status(201).json({user:rows[0]})}catch(e){console.error(e);res.status(500).json({error:"Error del servidor"})}});
app.post("/api/auth/login",authLimiter,async(req,res)=>{try{const identifier=(req.body.identifier||"").trim().toLowerCase(),password=req.body.password;if(identifier.length<3||!validatePassword(password))return res.status(400).json({error:"Datos inválidos"});const {rows}=await pool.query("SELECT * FROM users WHERE lower(coalesce(email,''))=$1 OR phone=$2 LIMIT 1",[identifier,identifier]);if(!rows[0]||!rows[0].active||!rows[0].password_hash||!(await bcrypt.compare(password,rows[0].password_hash)))return res.status(401).json({error:rows[0]&&!rows[0].active?"Cuenta bloqueada":"Credenciales incorrectas"});setAuth(res,rows[0]);res.json({user:{id:rows[0].id,name:rows[0].name,email:rows[0].email,phone:rows[0].phone,balance_cents:rows[0].balance_cents,role:rows[0].role,avatar_url:rows[0].avatar_url,email_verified:rows[0].email_verified,provider:rows[0].provider}})}catch(e){console.error(e);res.status(500).json({error:"Error del servidor"})}});
app.post("/api/auth/logout",auth,(req,res)=>{res.clearCookie("bl_session",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/"});res.json({ok:true})});
app.get("/api/me",auth,(req,res)=>res.json({user:req.user}));

// Public catalog
app.get("/api/events",async(req,res)=>{try{const {rows}=await pool.query(`SELECT e.id,e.sport,e.league,e.home_team,e.away_team,e.starts_at,e.status,e.home_score,e.away_score,e.featured,e.video,e.live_elapsed,e.live_status,e.external_source,COALESCE(jsonb_agg(jsonb_build_object('marketId',m.id,'name',m.name,'type',m.market_type,'status',m.status,'selections',(SELECT jsonb_agg(jsonb_build_object('id',s.id,'label',s.label,'code',s.code,'odds',s.odds,'status',s.status) ORDER BY s.created_at) FROM market_selections s WHERE s.market_id=m.id)) ORDER BY m.created_at) FILTER(WHERE m.id IS NOT NULL),'[]'::jsonb) markets FROM sports_events e LEFT JOIN markets m ON m.event_id=e.id WHERE e.status IN ('OPEN','LIVE') AND (COALESCE($1::boolean,FALSE)=FALSE OR (e.external_source='API_FOOTBALL' AND e.status='LIVE')) GROUP BY e.id ORDER BY e.starts_at LIMIT 200`,[req.query.live === "true"]);res.json({events:rows})}catch(e){console.error(e);res.status(500).json({error:"No se pudieron cargar los eventos"})}});
const UPCOMING_CACHE_MS=Math.max(30*60*1000, Number(process.env.UPCOMING_CACHE_MS||3*60*60*1000));
let upcomingSyncState={lastSuccessAt:0,lastAttemptAt:0,lastResult:null,lastError:null};
async function upsertUpcomingFixtures(fixtures){
  let count=0;
  for(const f of fixtures){
    const fid=String(f?.fixture?.id||""); if(!fid) continue;
    const status=apiFixtureStatus(f);
    if(status!=="OPEN") continue;
    const leagueName=f.league?.name||`Liga ${f.league?.id||""}`;
    const home=f.teams?.home?.name||`Local ${f.teams?.home?.id||""}`;
    const away=f.teams?.away?.name||`Visitante ${f.teams?.away?.id||""}`;
    const starts=f.fixture?.date||new Date().toISOString();
    await pool.query(`
      INSERT INTO sports_events(id,sport,league,home_team,away_team,starts_at,status,home_score,away_score,featured,video,external_source,external_id,last_synced_at)
      VALUES($1,'Fútbol',$2,$3,$4,$5,'OPEN',0,0,FALSE,FALSE,'API_FOOTBALL',$6,NOW())
      ON CONFLICT (external_source,external_id) WHERE external_id IS NOT NULL
      DO UPDATE SET league=EXCLUDED.league,home_team=EXCLUDED.home_team,away_team=EXCLUDED.away_team,starts_at=EXCLUDED.starts_at,status=CASE WHEN sports_events.status='LIVE' THEN 'LIVE' ELSE 'OPEN' END,last_synced_at=NOW()
    `,[deterministicUuid(`event:${fid}`),leagueName,home,away,starts,fid]);
    count++;
  }
  return count;
}
async function syncUpcomingOdds(days=3){
  const now=new Date();
  const fixturesData=await apiFootballGet(`/fixtures?from=${now.toISOString().slice(0,10)}&to=${new Date(now.getTime()+days*86400000).toISOString().slice(0,10)}&timezone=America/Mexico_City`);
  const fixtures=Array.isArray(fixturesData.response)?fixturesData.response:[];
  await upsertUpcomingFixtures(fixtures);
  const dateSet=[...new Set(fixtures.filter(f=>apiFixtureStatus(f)==='OPEN'&&f?.fixture?.date).map(f=>String(f.fixture.date).slice(0,10)))];
  let oddsRows=0,markets=0,selections=0;
  for(const date of dateSet){
    let rows=[];
    for(let page=1;page<=3;page++){
      const oddsData=await apiFootballGet(`/odds?date=${date}&timezone=America/Mexico_City&page=${page}`);
      const pageRows=Array.isArray(oddsData.response)?oddsData.response:[];
      rows.push(...pageRows);
      if(!oddsData?.paging?.total || page>=Number(oddsData.paging.total)) break;
    }
    oddsRows+=rows.length;
    for(const row of rows){
      const fid=String(row?.fixture?.id||""); if(!fid) continue;
      const eventQ=await pool.query("SELECT id FROM sports_events WHERE external_source='API_FOOTBALL' AND external_id=$1 LIMIT 1",[fid]);
      if(!eventQ.rows[0]) continue;
      const bookmaker=Array.isArray(row.bookmakers)?row.bookmakers[0]:null;
      const bets=Array.isArray(bookmaker?.bets)?bookmaker.bets:[];
      for(const bet of bets){
        const betId=String(bet?.id||""); if(!betId) continue;
        const marketKey=`api-football:prematch:${fid}:${betId}`;
        const marketId=deterministicUuid(marketKey);
        await pool.query(`INSERT INTO markets(id,event_id,name,market_type,status,external_key) VALUES($1,$2,$3,$4,'OPEN',$5) ON CONFLICT (external_key) WHERE external_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name,event_id=EXCLUDED.event_id,status='OPEN'`,[marketId,eventQ.rows[0].id,cleanMarketName(bet.name),`API_PRE_${betId}`,marketKey]);
        markets++;
        const seen=[];
        for(const v of (Array.isArray(bet.values)?bet.values:[])){
          const value=String(v?.value??'').trim(), odd=Number(v?.odd);
          if(!value||!Number.isFinite(odd)||odd<=1) continue;
          const key=`api-football:prematch:${fid}:${betId}:${value}`; seen.push(key);
          const sid=deterministicUuid(key);
          await pool.query(`INSERT INTO market_selections(id,market_id,label,code,odds,status,external_key) VALUES($1,$2,$3,$4,$5,'OPEN',$6) ON CONFLICT (external_key) WHERE external_key IS NOT NULL DO UPDATE SET market_id=EXCLUDED.market_id,label=EXCLUDED.label,code=EXCLUDED.code,odds=EXCLUDED.odds,status='OPEN'`,[sid,marketId,value,`API:${betId}:${value}`.slice(0,30),odd,key]);
          selections++;
        }
        if(seen.length) await pool.query("UPDATE market_selections SET status='CLOSED' WHERE market_id=$1 AND external_key IS NOT NULL AND NOT (external_key = ANY($2::text[]))",[marketId,seen]);
      }
    }
  }
  return {fixtures:fixtures.length,odds:oddsRows,markets,selections,dates:dateSet};
}
async function queryUpcomingEvents(){
  const {rows}=await pool.query(`
    SELECT e.id,e.sport,e.league,e.home_team,e.away_team,e.starts_at,e.status,e.home_score,e.away_score,e.featured,e.video,e.live_elapsed,e.live_status,e.external_source,
    COALESCE(jsonb_agg(jsonb_build_object('marketId',m.id,'name',m.name,'type',m.market_type,'status',m.status,'selections',(SELECT jsonb_agg(jsonb_build_object('id',s.id,'label',s.label,'code',s.code,'odds',s.odds,'status',s.status) ORDER BY s.created_at) FROM market_selections s WHERE s.market_id=m.id AND s.status='OPEN')) ORDER BY m.created_at) FILTER(WHERE m.id IS NOT NULL),'[]'::jsonb) markets
    FROM sports_events e LEFT JOIN markets m ON m.event_id=e.id
    WHERE e.external_source='API_FOOTBALL' AND e.status='OPEN' AND e.starts_at>=NOW()
    GROUP BY e.id ORDER BY e.starts_at LIMIT 100
  `);
  return rows;
}
app.get("/api/events/upcoming-real",async(req,res)=>{
  try{
    if(!API_FOOTBALL_KEY) return res.status(503).json({error:"API-Football no configurada"});
    const force=String(req.query.refresh||"") === "1";
    const fresh=!force && upcomingSyncState.lastSuccessAt && (Date.now()-upcomingSyncState.lastSuccessAt)<UPCOMING_CACHE_MS;
    let sync=upcomingSyncState.lastResult;
    if(!fresh){
      try{
        upcomingSyncState.lastAttemptAt=Date.now();
        sync=await syncUpcomingOdds(3);
        upcomingSyncState={lastSuccessAt:Date.now(),lastAttemptAt:upcomingSyncState.lastAttemptAt,lastResult:sync,lastError:null};
      }catch(e){
        upcomingSyncState.lastError=e.message;
        console.error("upcoming-real sync",e.message);
        // If the provider is temporarily rate-limited, return cached DB data instead of breaking the page.
        if(!upcomingSyncState.lastSuccessAt) throw e;
      }
    }
    const rows=await queryUpcomingEvents();
    res.json({events:rows,source:"API_FOOTBALL",cached:fresh||Boolean(upcomingSyncState.lastError),sync,cacheMs:UPCOMING_CACHE_MS,error:upcomingSyncState.lastError||null});
  }catch(e){console.error("upcoming-real",e);res.status(502).json({error:e.message||"No se pudieron cargar partidos reales"})}
});

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
// Player betting history / pending bets
app.get("/api/bets/history",auth,async(req,res)=>{
  const {rows}=await pool.query("SELECT id,stake_cents,total_odds,potential_cents,status,selections,created_at,settled_at FROM tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200",[req.user.id]);
  res.json({tickets:rows});
});
app.get("/api/bets/pending",auth,async(req,res)=>{
  const {rows}=await pool.query("SELECT id,stake_cents,total_odds,potential_cents,status,selections,created_at FROM tickets WHERE user_id=$1 AND status='PENDING' ORDER BY created_at DESC LIMIT 100",[req.user.id]);
  res.json({tickets:rows});
});

// Support chat
app.get("/api/support/messages",auth,async(req,res)=>{
  const {rows}=await pool.query("SELECT id,sender_role,message,created_at,read_at FROM support_messages WHERE user_id=$1 ORDER BY created_at ASC LIMIT 300",[req.user.id]);
  await pool.query("UPDATE support_messages SET read_at=NOW() WHERE user_id=$1 AND sender_role='ADMIN' AND read_at IS NULL",[req.user.id]);
  res.json({messages:rows});
});
app.post("/api/support/messages",auth,async(req,res)=>{
  const message=String(req.body.message||"").trim().slice(0,1000);
  if(!message)return res.status(400).json({error:"Escribe un mensaje"});
  const {rows}=await pool.query("INSERT INTO support_messages(id,user_id,sender_role,message) VALUES($1,$2,'USER',$3) RETURNING id,sender_role,message,created_at,read_at",[crypto.randomUUID(),req.user.id,message]);
  res.status(201).json({message:rows[0]});
});

app.get("/api/wallet/transactions",auth,async(req,res)=>{const {rows}=await pool.query("SELECT id,type,amount_cents,balance_after_cents,reason,created_at FROM balance_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[req.user.id]);res.json({transactions:rows})});
app.get("/api/wallet/requests",auth,async(req,res)=>{const {rows}=await pool.query("SELECT id,type,amount_cents,status,note,payout_details,admin_note,created_at,resolved_at FROM wallet_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[req.user.id]);res.json({requests:rows})});
app.post("/api/wallet/requests",auth,async(req,res)=>{const type=req.body.type,amount=Math.trunc(Number(req.body.amountCents)),note=String(req.body.note||"").slice(0,255);if(!['DEPOSIT','WITHDRAWAL'].includes(type)||!Number.isSafeInteger(amount)||amount<100)return res.status(400).json({error:"Solicitud inválida"});const {rows}=await pool.query("INSERT INTO wallet_requests(id,user_id,type,amount_cents,note) VALUES($1,$2,$3,$4,$5) RETURNING *",[crypto.randomUUID(),req.user.id,type,amount,note]);res.status(201).json({request:rows[0]})});

// Admin dashboard
app.get("/api/admin/me",auth,requireAdmin,(req,res)=>res.json({admin:req.user}));
app.get("/api/admin/stats",auth,requireAdmin,async(req,res)=>{try{const [u,t,b,r,e]=await Promise.all([pool.query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE active)::int active,COUNT(*) FILTER(WHERE role='admin')::int admins FROM users"),pool.query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='PENDING')::int pending,COALESCE(SUM(stake_cents),0)::bigint staked FROM tickets"),pool.query("SELECT COALESCE(SUM(balance_cents),0)::bigint balance FROM users WHERE role='user'"),pool.query("SELECT COUNT(*) FILTER(WHERE status='PENDING')::int pending FROM wallet_requests"),pool.query("SELECT COUNT(*) FILTER(WHERE status IN ('OPEN','LIVE'))::int open FROM sports_events")]);res.json({users:u.rows[0],tickets:t.rows[0],balances:b.rows[0],requests:r.rows[0],events:e.rows[0]})}catch(e){res.status(500).json({error:"No se pudieron cargar estadísticas"})}});
app.get("/api/admin/users",auth,requireAdmin,async(req,res)=>{const q=String(req.query.q||"").trim().toLowerCase();const {rows}=await pool.query(`SELECT id,name,email,phone,balance_cents,role,active,created_at FROM users WHERE ($1='' OR lower(name) LIKE '%'||$1||'%' OR lower(coalesce(email,'')) LIKE '%'||$1||'%' OR coalesce(phone,'') LIKE '%'||$1||'%') ORDER BY created_at DESC LIMIT 300`,[q]);res.json({users:rows})});
app.get("/api/admin/users/:id",auth,requireAdmin,async(req,res)=>{
  try{
    const u=await pool.query(`SELECT id,name,email,phone,balance_cents,role,active,avatar_url,email_verified,provider,created_at FROM users WHERE id=$1`,[req.params.id]);
    if(!u.rows[0])return res.status(404).json({error:"Usuario no encontrado"});
    const [tx,wr,tickets]=await Promise.all([
      pool.query(`SELECT id,type,amount_cents,balance_after_cents,reason,created_at FROM balance_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[req.params.id]),
      pool.query(`SELECT id,type,amount_cents,status,note,payout_details,admin_note,created_at,resolved_at FROM wallet_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`,[req.params.id]),
      pool.query(`SELECT id,stake_cents,total_odds,potential_cents,status,created_at,settled_at FROM tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`,[req.params.id])
    ]);
    res.json({user:u.rows[0],transactions:tx.rows,requests:wr.rows,tickets:tickets.rows});
  }catch(e){console.error(e);res.status(500).json({error:"No se pudo cargar el perfil"})}
});
app.patch("/api/admin/users/:id",auth,requireAdmin,async(req,res)=>{
  const name=String(req.body.name||"").trim().slice(0,80),phone=String(req.body.phone||"").trim().slice(0,30);
  if(!name)return res.status(400).json({error:"El nombre es obligatorio"});
  const {rows}=await pool.query("UPDATE users SET name=$1,phone=$2,updated_at=NOW() WHERE id=$3 RETURNING id,name,email,phone,balance_cents,role,active,created_at",[name,phone||null,req.params.id]);
  if(!rows[0])return res.status(404).json({error:"Usuario no encontrado"});
  await audit(req.user.id,"UPDATE_USER","user",req.params.id,{name,phone});
  res.json({user:rows[0]});
});
app.patch("/api/admin/users/:id/status",auth,requireAdmin,async(req,res)=>{const active=Boolean(req.body.active);if(req.params.id===req.user.id&&!active)return res.status(400).json({error:"No puedes bloquear tu propia cuenta"});const {rows}=await pool.query("UPDATE users SET active=$1 WHERE id=$2 RETURNING id,name,email,phone,balance_cents,role,active,created_at",[active,req.params.id]);if(!rows[0])return res.status(404).json({error:"Usuario no encontrado"});await audit(req.user.id,active?"ACTIVATE_USER":"BLOCK_USER","user",req.params.id);res.json({user:rows[0]})});
app.post("/api/admin/users/:id/balance",auth,requireAdmin,async(req,res)=>{const amount=Math.trunc(Number(req.body.amountCents)),reason=String(req.body.reason||"").trim().slice(0,255);if(!Number.isSafeInteger(amount)||amount===0||!reason)return res.status(400).json({error:"Monto o motivo inválido"});const client=await pool.connect();try{await client.query("BEGIN");const u=await client.query("SELECT balance_cents FROM users WHERE id=$1 FOR UPDATE",[req.params.id]);if(!u.rows[0])throw new Error("Usuario no encontrado");const next=BigInt(u.rows[0].balance_cents)+BigInt(amount);if(next<0n)throw new Error("El saldo no puede quedar negativo");await client.query("UPDATE users SET balance_cents=$1 WHERE id=$2",[next.toString(),req.params.id]);await client.query("INSERT INTO balance_transactions(id,user_id,admin_id,type,amount_cents,balance_after_cents,reason) VALUES($1,$2,$3,'ADMIN_ADJUSTMENT',$4,$5,$6)",[crypto.randomUUID(),req.params.id,req.user.id,amount,next.toString(),reason]);await client.query("COMMIT");await audit(req.user.id,"BALANCE_ADJUSTMENT","user",req.params.id,{amount,reason});res.json({ok:true,balance_cents:next.toString()})}catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message})}finally{client.release()}});
app.get("/api/admin/users/:id/transactions",auth,requireAdmin,async(req,res)=>{const {rows}=await pool.query(`SELECT bt.id,bt.type,bt.amount_cents,bt.balance_after_cents,bt.reason,bt.created_at,COALESCE(a.name,'Sistema') admin_name FROM balance_transactions bt LEFT JOIN users a ON a.id=bt.admin_id WHERE bt.user_id=$1 ORDER BY bt.created_at DESC LIMIT 200`,[req.params.id]);res.json({transactions:rows})});
app.get("/api/admin/tickets",auth,requireAdmin,async(req,res)=>{const {rows}=await pool.query(`SELECT t.id,t.stake_cents,t.total_odds,t.potential_cents,t.status,t.selections,t.created_at,t.settled_at,u.name user_name,u.email user_email FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 300`);res.json({tickets:rows})});
app.post("/api/admin/tickets/:id/settle",auth,requireAdmin,async(req,res)=>{const status=String(req.body.status||"").toUpperCase();if(!['WON','LOST','VOID'].includes(status))return res.status(400).json({error:"Estado inválido"});const client=await pool.connect();try{await client.query("BEGIN");const q=await client.query("SELECT * FROM tickets WHERE id=$1 FOR UPDATE",[req.params.id]);if(!q.rows[0])throw new Error("Ticket no encontrado");if(q.rows[0].status!=="PENDING")throw new Error("El ticket ya fue liquidado");const t=q.rows[0];let credit=0;if(status==='WON')credit=Number(t.potential_cents);if(status==='VOID')credit=Number(t.stake_cents);const u=await client.query("SELECT balance_cents FROM users WHERE id=$1 FOR UPDATE",[t.user_id]);const next=(BigInt(u.rows[0].balance_cents)+BigInt(credit)).toString();await client.query("UPDATE tickets SET status=$1,settled_at=NOW() WHERE id=$2",[status,t.id]);if(credit>0){await client.query("UPDATE users SET balance_cents=$1 WHERE id=$2",[next,t.user_id]);await client.query("INSERT INTO balance_transactions(id,user_id,admin_id,type,amount_cents,balance_after_cents,reason,reference_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[crypto.randomUUID(),t.user_id,req.user.id,status,credit,next,`Liquidación ${status} ${t.id}`,t.id])}await client.query("COMMIT");await audit(req.user.id,"SETTLE_TICKET","ticket",t.id,{status,credit});res.json({ok:true,status})}catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message})}finally{client.release()}});

// Admin events / markets
app.get("/api/admin/events",auth,requireAdmin,async(req,res)=>{const {rows}=await pool.query(`SELECT e.id,e.sport,e.league,e.home_team,e.away_team,e.starts_at,e.status,e.home_score,e.away_score,e.featured,e.video,COUNT(ms.id)::int selections_count FROM sports_events e LEFT JOIN markets m ON m.event_id=e.id LEFT JOIN market_selections ms ON ms.market_id=m.id GROUP BY e.id ORDER BY e.starts_at DESC LIMIT 300`);res.json({events:rows})});
app.post("/api/admin/events",auth,requireAdmin,async(req,res)=>{const {sport,league,homeTeam,awayTeam,startsAt,featured=false,video=false}=req.body;if(!sport||!league||!homeTeam||!awayTeam||!startsAt)return res.status(400).json({error:"Completa el evento"});const id=crypto.randomUUID();const {rows}=await pool.query("INSERT INTO sports_events(id,sport,league,home_team,away_team,starts_at,featured,video) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[id,String(sport).slice(0,40),String(league).slice(0,100),String(homeTeam).slice(0,100),String(awayTeam).slice(0,100),startsAt,Boolean(featured),Boolean(video)]);await ensureMarketTemplates();await audit(req.user.id,"CREATE_EVENT","event",id);res.status(201).json({event:rows[0]})});
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
app.get("/api/admin/wallet-settings",auth,requireAdmin,async(req,res)=>{
  const {rows}=await pool.query("SELECT * FROM wallet_settings WHERE id=1");
  res.json({settings:rows[0]||null});
});
app.patch("/api/admin/wallet-settings",auth,requireAdmin,async(req,res)=>{
  const fields=["enabled","title","instructions","bank_name","account_holder","account_number","clabe","card_number","reference_text"];
  const vals=[]; const sets=[];
  for(const f of fields) if(req.body[f]!==undefined){sets.push(`${f}=$${vals.length+1}`);vals.push(f==="enabled"?Boolean(req.body[f]):String(req.body[f]||"").slice(0,500))}
  if(!sets.length)return res.status(400).json({error:"Sin cambios"});
  sets.push("updated_at=NOW()");vals.push(1);
  const {rows}=await pool.query(`UPDATE wallet_settings SET ${sets.join(",")} WHERE id=$${vals.length} RETURNING *`,vals);
  await audit(req.user.id,"UPDATE_WALLET_SETTINGS","wallet_settings","00000000-0000-0000-0000-000000000001",req.body);
  res.json({settings:rows[0]});
});
app.get("/api/admin/wallet-requests",auth,requireAdmin,async(req,res)=>{const {rows}=await pool.query(`SELECT r.*,u.name user_name,u.email user_email,u.phone user_phone FROM wallet_requests r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 300`);res.json({requests:rows})});
app.post("/api/admin/wallet-requests/:id/resolve",auth,requireAdmin,async(req,res)=>{
  const status=String(req.body.status||"").toUpperCase();
  if(!['APPROVED','REJECTED'].includes(status))return res.status(400).json({error:"Estado inválido"});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const r=await client.query("SELECT * FROM wallet_requests WHERE id=$1 FOR UPDATE",[req.params.id]);
    if(!r.rows[0])throw new Error("Solicitud no encontrada");
    const x=r.rows[0];
    if(x.status!=="PENDING")throw new Error("La solicitud ya fue procesada");
    if(status==="APPROVED" && x.type==="DEPOSIT"){
      const u=await client.query("SELECT balance_cents FROM users WHERE id=$1 FOR UPDATE",[x.user_id]);
      const next=(BigInt(u.rows[0].balance_cents)+BigInt(x.amount_cents)).toString();
      await client.query("UPDATE users SET balance_cents=$1 WHERE id=$2",[next,x.user_id]);
      await client.query("INSERT INTO balance_transactions(id,user_id,admin_id,type,amount_cents,balance_after_cents,reason,reference_id) VALUES($1,$2,$3,'DEPOSIT',$4,$5,$6,$7)",[crypto.randomUUID(),x.user_id,req.user.id,x.amount_cents,next,"Depósito manual aprobado",x.id]);
    }
    await client.query("UPDATE wallet_requests SET status=$1,admin_id=$2,resolved_at=NOW() WHERE id=$3",[status,req.user.id,x.id]);
    await client.query("COMMIT");
    await audit(req.user.id,"RESOLVE_WALLET_REQUEST","wallet_request",x.id,{status});
    res.json({ok:true,status});
  }catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message})}finally{client.release()}
});
app.post("/api/admin/wallet-requests/:id/paid",auth,requireAdmin,async(req,res)=>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const r=await client.query("SELECT * FROM wallet_requests WHERE id=$1 FOR UPDATE",[req.params.id]);
    if(!r.rows[0])throw new Error("Solicitud no encontrada");
    const x=r.rows[0];
    if(x.type!=="WITHDRAWAL"||x.status!=="APPROVED")throw new Error("El retiro debe estar autorizado antes de marcarlo como pagado");
    const u=await client.query("SELECT balance_cents FROM users WHERE id=$1 FOR UPDATE",[x.user_id]);
    if(BigInt(u.rows[0].balance_cents)<BigInt(x.amount_cents))throw new Error("Saldo insuficiente para completar el retiro");
    const next=(BigInt(u.rows[0].balance_cents)-BigInt(x.amount_cents)).toString();
    await client.query("UPDATE users SET balance_cents=$1 WHERE id=$2",[next,x.user_id]);
    await client.query("INSERT INTO balance_transactions(id,user_id,admin_id,type,amount_cents,balance_after_cents,reason,reference_id) VALUES($1,$2,$3,'WITHDRAWAL',$4,$5,$6,$7)",[crypto.randomUUID(),x.user_id,req.user.id,-x.amount_cents,next,"Retiro pagado manualmente",x.id]);
    await client.query("UPDATE wallet_requests SET status='PAID',admin_id=$1,resolved_at=NOW() WHERE id=$2",[req.user.id,x.id]);
    await client.query("COMMIT");
    await audit(req.user.id,"PAY_WITHDRAWAL","wallet_request",x.id,{amount_cents:x.amount_cents});
    res.json({ok:true,status:"PAID"});
  }catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message})}finally{client.release()}
});

app.get("/api/admin/support/conversations",auth,requireAdmin,async(req,res)=>{
  const {rows}=await pool.query(`SELECT u.id user_id,u.name,u.email,u.phone,MAX(sm.created_at) last_message,COUNT(sm.id)::int message_count,COUNT(sm.id) FILTER (WHERE sm.sender_role='USER' AND sm.read_at IS NULL)::int unread FROM users u JOIN support_messages sm ON sm.user_id=u.id WHERE u.role<>'admin' GROUP BY u.id ORDER BY MAX(sm.created_at) DESC LIMIT 300`);
  res.json({conversations:rows});
});
app.get("/api/admin/support/:userId/messages",auth,requireAdmin,async(req,res)=>{
  const {rows}=await pool.query("SELECT id,sender_role,message,created_at,read_at FROM support_messages WHERE user_id=$1 ORDER BY created_at ASC LIMIT 500",[req.params.userId]);
  await pool.query("UPDATE support_messages SET read_at=NOW() WHERE user_id=$1 AND sender_role='USER' AND read_at IS NULL",[req.params.userId]);
  res.json({messages:rows});
});
app.post("/api/admin/support/:userId/messages",auth,requireAdmin,async(req,res)=>{
  const message=String(req.body.message||"").trim().slice(0,1000);
  if(!message)return res.status(400).json({error:"Escribe un mensaje"});
  const {rows}=await pool.query("INSERT INTO support_messages(id,user_id,sender_role,message) VALUES($1,$2,'ADMIN',$3) RETURNING id,sender_role,message,created_at,read_at",[crypto.randomUUID(),req.params.userId,message]);
  await audit(req.user.id,'SUPPORT_REPLY','user',req.params.userId,{message_length:message.length});
  res.status(201).json({message:rows[0]});
});

app.get("/api/admin/audit",auth,requireAdmin,async(req,res)=>{const {rows}=await pool.query(`SELECT a.id,a.action,a.target_type,a.target_id,a.details,a.created_at,COALESCE(u.name,'Sistema') admin_name FROM admin_audit a LEFT JOIN users u ON u.id=a.admin_id ORDER BY a.created_at DESC LIMIT 300`);res.json({audit:rows})});


// Real live football feed from API-Football.
// The API key is read only from Render/server environment variables.
function deterministicUuid(value){
  const h=crypto.createHash("sha1").update(String(value)).digest();
  h[6]=(h[6]&0x0f)|0x50; h[8]=(h[8]&0x3f)|0x80;
  const hex=h.subarray(0,16).toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}
async function apiFootballGet(pathname){
  if(!API_FOOTBALL_KEY) throw new Error("API_FOOTBALL_KEY no configurada");
  const r=await fetch(`${API_FOOTBALL_BASE}${pathname}`,{headers:{"x-apisports-key":API_FOOTBALL_KEY,"Accept":"application/json"}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok || (Array.isArray(d.errors)&&d.errors.length)) {
    const msg=Array.isArray(d.errors)?d.errors.join("; "):`HTTP ${r.status}`;
    throw new Error(`API-Football: ${msg}`);
  }
  return d;
}
function apiFixtureStatus(f){
  const s=f?.fixture?.status?.short||"NS";
  const liveCodes=new Set(["1H","HT","2H","ET","BT","P","LIVE"]);
  if(liveCodes.has(s)) return "LIVE";
  if(["FT","AET","PEN"].includes(s)) return "CLOSED";
  if(["PST","CANC","ABD","AWD","WO"].includes(s)) return "CLOSED";
  return "OPEN";
}
function apiMarketStatus(item){
  const st=item?.status||{};
  if(st.stopped||st.blocked||st.finished) return "CLOSED";
  return "OPEN";
}
function cleanMarketName(name){
  return String(name||"Mercado en vivo").slice(0,100);
}
function liveSelectionKey(fixtureId,betId,value){
  return `api-football:live:${fixtureId}:${betId}:${String(value)}`.slice(0,240);
}
let liveSyncState={lastRunAt:null,lastSuccessAt:null,fixtures:0,odds:0,markets:0,selections:0,error:null,configured:Boolean(API_FOOTBALL_KEY)};

async function syncApiFootballLive(){
  if(!LIVE_SYNC_ENABLED || !API_FOOTBALL_KEY) return {enabled:LIVE_SYNC_ENABLED,configured:false,fixtures:0,odds:0};
  const started=Date.now();
  const fixturesData=await apiFootballGet("/fixtures?live=all");
  const fixtures=Array.isArray(fixturesData.response)?fixturesData.response:[];
  const liveIds=new Set(fixtures.map(x=>String(x?.fixture?.id)).filter(Boolean));
  // First update real fixtures so names/score/status are always available.
  for(const f of fixtures){
    const fid=String(f.fixture.id);
    const status=apiFixtureStatus(f);
    const extId=fid;
    const leagueName=f.league?.name||`Liga ${f.league?.id||""}`;
    const home=f.teams?.home?.name||`Local ${f.teams?.home?.id||""}`;
    const away=f.teams?.away?.name||`Visitante ${f.teams?.away?.id||""}`;
    const starts=f.fixture?.date||new Date().toISOString();
    const scoreHome=Number.isFinite(Number(f.goals?.home))?Number(f.goals.home):0;
    const scoreAway=Number.isFinite(Number(f.goals?.away))?Number(f.goals.away):0;
    const elapsed=Number.isFinite(Number(f.fixture?.status?.elapsed))?Number(f.fixture.status.elapsed):null;
    const liveStatus=String(f.fixture?.status?.long||f.fixture?.status?.short||"").slice(0,100);
    await pool.query(`
      INSERT INTO sports_events(id,sport,league,home_team,away_team,starts_at,status,home_score,away_score,featured,video,external_source,external_id,live_elapsed,live_status,last_synced_at)
      VALUES($1,'Fútbol',$2,$3,$4,$5,$6,$7,$8,FALSE,FALSE,'API_FOOTBALL',$9,$10,$11,NOW())
      ON CONFLICT (external_source,external_id) WHERE external_id IS NOT NULL
      DO UPDATE SET league=EXCLUDED.league,home_team=EXCLUDED.home_team,away_team=EXCLUDED.away_team,starts_at=EXCLUDED.starts_at,status=EXCLUDED.status,
        home_score=EXCLUDED.home_score,away_score=EXCLUDED.away_score,live_elapsed=EXCLUDED.live_elapsed,live_status=EXCLUDED.live_status,last_synced_at=NOW()
    `,[deterministicUuid(`event:${extId}`),leagueName,home,away,starts,status,scoreHome,scoreAway,extId,elapsed,liveStatus]);
  }
  // Pull the in-play odds in one request. API-Football documents this endpoint as the live-odds feed.
  const oddsData=await apiFootballGet("/odds/live");
  const oddsRows=Array.isArray(oddsData.response)?oddsData.response:[];
  let marketCount=0,selectionCount=0;
  for(const row of oddsRows){
    const fid=String(row?.fixture?.id||"");
    if(!fid) continue;
    const eventQ=await pool.query("SELECT id,status FROM sports_events WHERE external_source='API_FOOTBALL' AND external_id=$1 LIMIT 1",[fid]);
    if(!eventQ.rows[0]) continue;
    const eventId=eventQ.rows[0].id;
    const marketStatus=apiMarketStatus(row);
    const bookmakers=Array.isArray(row.bookmakers)?row.bookmakers:[];
    // Prefer the first bookmaker returned by the provider. We retain the provider value and never invent odds.
    const bookmaker=bookmakers[0];
    const bets=Array.isArray(bookmaker?.bets)?bookmaker.bets:[];
    for(const bet of bets){
      const betId=String(bet.id);
      const marketKey=`api-football:market:${fid}:${betId}`;
      const marketId=deterministicUuid(marketKey);
      await pool.query(`
        INSERT INTO markets(id,event_id,name,market_type,status,external_key)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT (external_key) WHERE external_key IS NOT NULL
        DO UPDATE SET name=EXCLUDED.name,event_id=EXCLUDED.event_id,status=EXCLUDED.status
      `,[marketId,eventId,cleanMarketName(bet.name),`API_LIVE_${betId}`,marketStatus,marketKey]);
      marketCount++;
      const values=Array.isArray(bet.values)?bet.values:[];
      const seen=new Set();
      for(const v of values){
        const rawValue=String(v?.value??"").trim();
        const odd=Number(v?.odd);
        if(!rawValue||!Number.isFinite(odd)||odd<=1) continue;
        const selectionKey=liveSelectionKey(fid,betId,rawValue);
        if(seen.has(selectionKey)) continue;
        seen.add(selectionKey);
        const selId=deterministicUuid(selectionKey);
        const selectionStatus=marketStatus==="OPEN" && v?.suspended!==true ? "OPEN" : "CLOSED";
        const label=rawValue.slice(0,100);
        await pool.query(`
          INSERT INTO market_selections(id,market_id,label,code,odds,status,external_key)
          VALUES($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (external_key) WHERE external_key IS NOT NULL
          DO UPDATE SET market_id=EXCLUDED.market_id,label=EXCLUDED.label,code=EXCLUDED.code,odds=EXCLUDED.odds,status=EXCLUDED.status
        `,[selId,marketId,label,`API:${betId}:${rawValue}`.slice(0,30),odd,selectionStatus,selectionKey]);
        selectionCount++;
      }
      // Remove selections that disappeared from this market's current feed.
      if(seen.size){
        await pool.query("UPDATE market_selections SET status='CLOSED' WHERE market_id=$1 AND external_key IS NOT NULL AND NOT (external_key = ANY($2::text[]))",[marketId,[...seen]]);
      }
    }
  }
  if(liveIds.size){
    await pool.query("UPDATE sports_events SET status='CLOSED',last_synced_at=NOW() WHERE external_source='API_FOOTBALL' AND external_id IS NOT NULL AND NOT (external_id = ANY($1::text[]))",[...liveIds]);
  }else{
    await pool.query("UPDATE sports_events SET status='CLOSED',last_synced_at=NOW() WHERE external_source='API_FOOTBALL' AND external_id IS NOT NULL");
  }
  const result={enabled:true,configured:true,fixtures:fixtures.length,odds:oddsRows.length,markets:marketCount,selections:selectionCount,elapsedMs:Date.now()-started};
  liveSyncState={...liveSyncState,lastRunAt:new Date().toISOString(),lastSuccessAt:new Date().toISOString(),fixtures:result.fixtures,odds:result.odds,markets:result.markets,selections:result.selections,error:null,configured:true};
  return result;
}
async function startLiveSync(){
  if(!LIVE_SYNC_ENABLED) return;
  const run=async()=>{
    try{
      const result=await syncApiFootballLive();
      liveSyncState.lastRunAt=new Date().toISOString();
      if(result.configured) console.log("API-Football live sync",result);
    }catch(e){liveSyncState={...liveSyncState,lastRunAt:new Date().toISOString(),error:e.message,configured:Boolean(API_FOOTBALL_KEY)};console.error("API-Football live sync error:",e.message)}
  };
  await run();
  setInterval(run,LIVE_SYNC_INTERVAL_MS);
}

let dbReady=false;
app.get("/api/health",(req,res)=>res.status(200).json({ok:true,database:dbReady,live:{enabled:LIVE_SYNC_ENABLED,configured:Boolean(API_FOOTBALL_KEY),intervalMs:LIVE_SYNC_INTERVAL_MS,state:liveSyncState}}));
app.get("/api/live/status",(req,res)=>res.json({enabled:LIVE_SYNC_ENABLED,configured:Boolean(API_FOOTBALL_KEY),intervalMs:LIVE_SYNC_INTERVAL_MS,...liveSyncState}));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"admin.html")));
app.get("/admin/",(req,res)=>res.sendFile(path.join(__dirname,"admin.html")));
app.get("/admin.html",(req,res)=>res.sendFile(path.join(__dirname,"admin.html")));
app.use(express.static(path.join(__dirname,".")));
app.use("/api",(req,res)=>res.status(404).json({error:"Endpoint no encontrado"}));
app.get("/{*splat}",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(PORT,()=>{console.log("BetLive API escuchando en "+PORT);dbInit().then(async()=>{
  await ensureBootstrapAdmin();dbReady=true;console.log("Base de datos inicializada correctamente");
  startLiveSync();
}).catch(e=>console.error("Error inicializando la base de datos:",e))});
