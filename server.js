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
app.use(express.json({limit:"20kb"}));
app.use(cookieParser());

const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false});
const JWT_SECRET=process.env.JWT_SECRET;
if(!JWT_SECRET) console.warn("JWT_SECRET no configurado");
const PORT=process.env.PORT||10000;

const authLimiter=rateLimit({windowMs:15*60*1000,max:30,standardHeaders:true,legacyHeaders:false});
const ticketLimiter=rateLimit({windowMs:60*1000,max:20,standardHeaders:true,legacyHeaders:false});

async function dbInit(){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS users(
   id UUID PRIMARY KEY,
   name VARCHAR(80) NOT NULL,
   email VARCHAR(255) UNIQUE,
   phone VARCHAR(30) UNIQUE,
   password_hash TEXT,
   provider VARCHAR(20) NOT NULL DEFAULT 'local',
   provider_subject VARCHAR(255),
   balance_cents BIGINT NOT NULL DEFAULT 1000000,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS tickets(
   id UUID PRIMARY KEY,
   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   stake_cents BIGINT NOT NULL CHECK(stake_cents>0),
   total_odds NUMERIC(10,3) NOT NULL CHECK(total_odds>0),
   potential_cents BIGINT NOT NULL CHECK(potential_cents>=0),
   status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
   selections JSONB NOT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE INDEX IF NOT EXISTS idx_tickets_user_created ON tickets(user_id,created_at DESC);
 `);
}
function cleanEmail(v){return typeof v==="string"&&v.trim()?v.trim().toLowerCase():null}
function cleanPhone(v){return typeof v==="string"&&v.trim()?v.trim():null}
function sign(user){return jwt.sign({sub:user.id},JWT_SECRET,{expiresIn:"7d"})}
function setAuth(res,user){res.cookie("bl_session",sign(user),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:7*24*60*60*1000,path:"/"})}
async function auth(req,res,next){
 try{
   const token=req.cookies.bl_session;
   if(!token) return res.status(401).json({error:"No autenticado"});
   const p=jwt.verify(token,JWT_SECRET);
   const {rows}=await pool.query("SELECT id,name,email,phone,balance_cents FROM users WHERE id=$1",[p.sub]);
   if(!rows[0]) return res.status(401).json({error:"Sesión inválida"});
   req.user=rows[0];next();
 }catch{return res.status(401).json({error:"Sesión inválida"})}
}
function validateName(n){return typeof n==="string"&&n.trim().length>=2&&n.trim().length<=80}
function validatePassword(p){return typeof p==="string"&&p.length>=8&&p.length<=128}

app.get("/api/health",(req,res)=>res.json({ok:true}));
app.post("/api/auth/register",authLimiter,async(req,res)=>{
 try{
  const name=req.body.name?.trim(), email=cleanEmail(req.body.email), phone=cleanPhone(req.body.phone), password=req.body.password;
  if(!validateName(name)||(!email&&!phone)||!validatePassword(password)) return res.status(400).json({error:"Datos de registro inválidos"});
  const exists=await pool.query("SELECT id FROM users WHERE (email=$1 AND $1 IS NOT NULL) OR (phone=$2 AND $2 IS NOT NULL)",[email,phone]);
  if(exists.rowCount) return res.status(409).json({error:"La cuenta ya existe"});
  const hash=await bcrypt.hash(password,12), id=crypto.randomUUID();
  const {rows}=await pool.query("INSERT INTO users(id,name,email,phone,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,phone,balance_cents",[id,name,email,phone,hash]);
  setAuth(res,rows[0]);res.status(201).json({user:rows[0]});
 }catch(e){console.error(e);res.status(500).json({error:"Error del servidor"})}
});
app.post("/api/auth/login",authLimiter,async(req,res)=>{
 try{
  const identifier=(req.body.identifier||"").trim().toLowerCase(), password=req.body.password;
  if(identifier.length<3||!validatePassword(password)) return res.status(400).json({error:"Datos inválidos"});
  const {rows}=await pool.query("SELECT * FROM users WHERE lower(coalesce(email,''))=$1 OR phone=$2 LIMIT 1",[identifier,identifier]);
  if(!rows[0]||!rows[0].password_hash||!(await bcrypt.compare(password,rows[0].password_hash))) return res.status(401).json({error:"Credenciales incorrectas"});
  setAuth(res,rows[0]);res.json({user:{id:rows[0].id,name:rows[0].name,email:rows[0].email,phone:rows[0].phone,balance_cents:rows[0].balance_cents}});
 }catch(e){console.error(e);res.status(500).json({error:"Error del servidor"})}
});
app.post("/api/auth/logout",auth,(req,res)=>{res.clearCookie("bl_session",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/"});res.json({ok:true})});
app.get("/api/me",auth,(req,res)=>res.json({user:req.user}));

app.get("/api/tickets",auth,async(req,res)=>{
 const {rows}=await pool.query("SELECT id,stake_cents,total_odds,potential_cents,status,selections,created_at FROM tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[req.user.id]);
 res.json({tickets:rows});
});
app.post("/api/tickets",auth,ticketLimiter,async(req,res)=>{
 const selections=Array.isArray(req.body.selections)?req.body.selections:[], stake=Math.round(Number(req.body.stakeCents));
 const odds=Number(req.body.totalOdds);
 if(!selections.length||!Number.isFinite(stake)||stake<=0||stake>100000000||!Number.isFinite(odds)||odds<=0) return res.status(400).json({error:"Ticket inválido"});
 const potential=Math.round(stake*odds);
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const u=await client.query("SELECT balance_cents FROM users WHERE id=$1 FOR UPDATE",[req.user.id]);
  if(!u.rows[0]||BigInt(u.rows[0].balance_cents)<BigInt(stake)) {await client.query("ROLLBACK");return res.status(400).json({error:"Saldo insuficiente"});}
  const id=crypto.randomUUID();
  const t=await client.query("INSERT INTO tickets(id,user_id,stake_cents,total_odds,potential_cents,selections) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[id,req.user.id,stake,odds,potential,JSON.stringify(selections)]);
  await client.query("UPDATE users SET balance_cents=balance_cents-$1 WHERE id=$2",[stake,req.user.id]);
  await client.query("COMMIT");
  res.status(201).json({ticket:t.rows[0]});
 }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"No se pudo crear el ticket"});}
 finally{client.release()}
});

app.use(express.static(path.join(__dirname,".")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
dbInit().then(()=>app.listen(PORT,()=>console.log("BetLive API escuchando en "+PORT))).catch(e=>{console.error(e);process.exit(1)});
