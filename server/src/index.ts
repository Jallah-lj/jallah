import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db,resources,type Resource } from './store.ts';
const app=express(), PORT=Number(process.env.PORT||4000), SECRET=process.env.JWT_SECRET||'local-development-secret-change-me';
const allowedOrigins=(process.env.CLIENT_URL||'http://localhost:5173').split(',').map(x=>x.trim().replace(/\/$/,'')).filter(Boolean);
// Vercel generates a new hostname for every preview/branch deploy, so an exact
// allowlist silently breaks preview logins. Accept the configured origins plus
// this project's *.vercel.app deploys.
const originAllowed=(origin:string)=>{const o=origin.replace(/\/$/,'');if(allowedOrigins.includes(o))return true;try{const h=new URL(o).hostname;return h==='localhost'||h==='127.0.0.1'||h.endsWith('.vercel.app')}catch{return false}};
const cookieOptions:any={httpOnly:true,sameSite:process.env.NODE_ENV==='production'?'none':'strict',secure:process.env.NODE_ENV==='production',maxAge:7*864e5,path:'/'};
app.set('trust proxy',1);app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));// Never throw from the origin callback: an error there aborts the response
// before CORS headers are written, so the browser only reports the opaque
// "CORS header 'Access-Control-Allow-Origin' missing" instead of the real cause.
app.use(cors({origin(origin,callback){callback(null,!origin||originAllowed(origin))},credentials:true,methods:['GET','POST','PUT','DELETE','OPTIONS'],allowedHeaders:['Content-Type'],optionsSuccessStatus:204}));
app.options(/.*/,cors({origin(origin,callback){callback(null,!origin||originAllowed(origin))},credentials:true}));app.use(express.json({limit:'1mb'}));app.use(cookieParser());app.use('/uploads',express.static(path.resolve('uploads'),{maxAge:'7d'}));
const auth=(req:any,res:any,next:any)=>{try{req.user=jwt.verify(req.cookies.session,SECRET);next()}catch{return res.status(401).json({ok:false,error:'Authentication required'})}};
const loginLimit=rateLimit({windowMs:15*60_000,limit:10,standardHeaders:true,legacyHeaders:false});
app.post('/api/auth/login',loginLimit,async(req,res)=>{const parsed=z.object({email:z.string().email(),password:z.string().min(8)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Enter a valid email and password'});const user=db.get().user; if(parsed.data.email.toLowerCase()!==user.email.toLowerCase()||!await bcrypt.compare(parsed.data.password,user.passwordHash))return res.status(401).json({ok:false,error:'Invalid email or password'});const token=jwt.sign({sub:user.id,email:user.email,role:user.role},SECRET,{expiresIn:'7d'});res.cookie('session',token,cookieOptions).json({ok:true,data:{name:user.name,email:user.email}})});
app.post('/api/auth/logout',(_req,res)=>res.clearCookie('session',{path:'/',sameSite:cookieOptions.sameSite,secure:cookieOptions.secure}).json({ok:true}));
app.get('/api/auth/me',auth,(_req:any,res)=>{const u=db.get().user;res.json({ok:true,data:{email:u.email,role:u.role,name:u.name}})});
app.put('/api/account',auth,async(req:any,res)=>{const schema=z.object({name:z.string().min(2).max(80),email:z.string().email(),currentPassword:z.string().min(8),newPassword:z.string().min(10).max(128).optional().or(z.literal(''))});const parsed=schema.safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Please check the account fields'});const user=db.get().user;if(!await bcrypt.compare(parsed.data.currentPassword,user.passwordHash))return res.status(403).json({ok:false,error:'Current password is incorrect'});user.name=parsed.data.name.trim();user.email=parsed.data.email.toLowerCase();if(parsed.data.newPassword)user.passwordHash=await bcrypt.hash(parsed.data.newPassword,12);db.save();const token=jwt.sign({sub:user.id,email:user.email,role:user.role},SECRET,{expiresIn:'7d'});res.cookie('session',token,cookieOptions).json({ok:true,data:{name:user.name,email:user.email,role:user.role}})});
app.get('/api/health',(_req,res)=>res.json({ok:true,status:'healthy',timestamp:new Date().toISOString()}));
app.get('/api/public',(_req,res)=>res.json({ok:true,data:db.public()}));
app.get('/api/dashboard',auth,(_req,res)=>{const d=db.get();res.json({ok:true,data:{counts:Object.fromEntries(resources.map(r=>[r,d[r].length])),recentMessages:d.messages.slice(0,4),activity:d.activity.slice(0,8)}})});
app.get('/api/profile',auth,(_req,res)=>res.json({ok:true,data:db.get().profile}));app.put('/api/profile',auth,(req,res)=>res.json({ok:true,data:db.updateSingleton('profile',req.body)}));
app.get('/api/settings',auth,(_req,res)=>res.json({ok:true,data:db.get().settings}));app.put('/api/settings',auth,(req,res)=>res.json({ok:true,data:db.updateSingleton('settings',req.body)}));
app.get('/api/navigation',auth,(_req,res)=>res.json({ok:true,data:db.get().navigation}));app.put('/api/navigation',auth,(req,res)=>{db.get().navigation=req.body;db.save();res.json({ok:true,data:req.body})});
for(const r of resources){
 app.get(`/api/${r}`,auth,(req,res)=>{let rows=db.list(r as Resource);const q=String(req.query.q||'').toLowerCase();if(q)rows=rows.filter((x:any)=>JSON.stringify(x).toLowerCase().includes(q));res.json({ok:true,data:rows})});
 app.post(`/api/${r}`,auth,(req,res)=>res.status(201).json({ok:true,data:db.create(r as Resource,req.body)}));
 app.put(`/api/${r}/:id`,auth,(req,res)=>{const x=db.update(r as Resource,req.params.id,req.body);x?res.json({ok:true,data:x}):res.status(404).json({ok:false,error:'Not found'})});
 app.delete(`/api/${r}/:id`,auth,(req,res)=>{const x=db.remove(r as Resource,req.params.id);x?res.json({ok:true}):res.status(404).json({ok:false,error:'Not found'})});
 app.post(`/api/${r}/reorder`,auth,(req,res)=>res.json({ok:true,data:db.reorder(r as Resource,req.body.ids||[])}));
}
const contactLimit=rateLimit({windowMs:60*60_000,limit:5});app.post('/api/contact',contactLimit,(req,res)=>{const schema=z.object({name:z.string().min(2).max(80),email:z.string().email(),subject:z.string().min(2).max(120),message:z.string().min(10).max(3000),website:z.string().max(0).optional()});const p=schema.safeParse(req.body);if(!p.success)return res.status(400).json({ok:false,error:'Please check all fields'});db.create('messages',{...p.data,read:false});res.status(201).json({ok:true,message:'Message received'})});
const uploadDir=path.resolve(process.env.UPLOAD_DIR||'uploads');fs.mkdirSync(uploadDir,{recursive:true});const upload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(_r,f,cb)=>cb(null,randomUUID()+path.extname(f.originalname).toLowerCase())}),limits:{fileSize:5*1024*1024},fileFilter:(_r,f,cb)=>cb(null,/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(f.mimetype))});
app.post('/api/upload',auth,upload.single('file'),(req:any,res)=>{if(!req.file)return res.status(400).json({ok:false,error:'Valid image or PDF required'});const item=db.create('media',{name:req.file.originalname,fileName:req.file.filename,type:req.file.mimetype,size:req.file.size,url:'/uploads/'+req.file.filename});res.status(201).json({ok:true,data:item})});
// Unmatched API routes must still answer as JSON through the CORS layer,
// otherwise a typo'd path surfaces in the browser as a bare CORS failure.
app.use('/api',(req,res)=>res.status(404).json({ok:false,error:`No API route for ${req.method} /api${req.path}`}));
app.use((err:any,_req:any,res:any,_next:any)=>{console.error(err.message);res.status(err.code==='LIMIT_FILE_SIZE'?413:500).json({ok:false,error:err.code==='LIMIT_FILE_SIZE'?'File exceeds 5 MB':'Something went wrong'})});
if(process.env.NODE_ENV==='production'&&process.env.SERVE_CLIENT==='true'&&fs.existsSync(path.resolve('dist/index.html'))){app.use(express.static(path.resolve('dist')));app.get('/*splat',(_r,res)=>res.sendFile(path.resolve('dist/index.html')))}
app.listen(PORT,'0.0.0.0',()=>console.log(`API listening on http://0.0.0.0:${PORT}`));
