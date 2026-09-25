import {createHash} from 'node:crypto';
import {setImmediate as yieldLoop} from 'node:timers/promises';
const AUTH='https://auth.bowdtv.com';
const API='https://api.bowdtv.com';
export function createBowdApi(request=fetch, {readSession=async()=>null, saveSession=async()=>{}}={}) {
  const cookies=new Map();let token='',expires=0,pending=null,loaded=false,account=false;
  async function auth(path,body) {
    const response=await request(AUTH+path,{method:body?'POST':'GET',headers:{origin:'https://bowdtv.com',referer:'https://bowdtv.com/',cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
    const rawCookies=typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[];
    const cookieValues=(rawCookies.length?rawCookies:[response.headers.get('set-cookie')||'']).flatMap(value=>value.split(/,(?=\s*[^;,=]+=[^;,]+)/g));
    for(const value of cookieValues){const pair=value.split(';',1)[0].trim();const index=pair.indexOf('=');if(index>0)cookies.set(pair.slice(0,index),pair.slice(index+1));}
    if(!response.ok){
      // Only expose our own messages: provider responses may contain session data.
      let reason='';
      if(response.headers.get('content-type')?.includes('application/json')){
        try { const data=await response.json(); reason=data?.code||data?.message||''; } catch {}
      }
      if(response.status===403&&reason==='GUEST_NOT_ALLOWED'){
        const error=new Error('BowdTV refuse les sessions invitées depuis ce serveur (GUEST_NOT_ALLOWED, 403). Le catalogue nécessite un accès autorisé par BowdTV.');
        error.code='BOWD_GUEST_NOT_ALLOWED';
        throw error;
      }
      if(path.endsWith('/sign-in/username'))throw new Error('Connexion au compte BowdTV refusée ('+response.status+').');
      const stage=path.endsWith('/challenge')?'préparation':path.endsWith('/resolve')?'validation de la session invitée':'accès au catalogue';
      throw new Error(`BowdTV : ${stage} refusé (${response.status}).`);
    }
    try{return await response.json();}catch{throw new Error('BowdTV : réponse de session invalide.');}
  }
  async function login() {
    if(token&&expires>Date.now()+60000)return token;
    if(pending)return pending;
    pending=(async()=>{
      if(!loaded){
        const saved=await readSession();
        for(const [name,value] of Object.entries(saved?.cookies||{})){
          if(/^[A-Za-z0-9_.-]{1,100}$/.test(name)&&typeof value==='string'&&value.length<=8192&&!/[\r\n;]/.test(value))cookies.set(name,value);
        }
        account=Boolean(saved?.account&&cookies.size);loaded=true;
      }
      let data=cookies.size?await auth('/api/auth/token').catch(()=>null):null;
      if(account&&!data?.token)throw new Error('La session du compte BowdTV a expiré ou a été refusée. Reconnectez le compte BowdTV.');
      if(!data?.token){
        // The same bounded guest proof used by the official public web app.
        const c=await auth('/api/auth/guest/challenge',{});
        if(typeof c.challenge!=='string'||!Number.isInteger(c.difficulty)||c.difficulty<0||c.difficulty>22)throw new Error('Défi invité BowdTV non pris en charge.');
        let pow=null;const deadline=Date.now()+8000;
        for(let n=0;n<10000000&&Date.now()<deadline;n++){
          const digest=createHash('sha256').update(`${c.challenge}:${n}`).digest();let bits=0;
          for(const byte of digest){if(!byte){bits+=8;continue;}bits+=Math.clz32(byte)-24;break;}
          if(bits>=c.difficulty){pow=String(n);break;}
          if(n%4096===0)await yieldLoop();
        }
        if(pow===null)throw new Error('Session BowdTV : délai de préparation dépassé.');
        await auth('/api/auth/guest/resolve',{challenge:c.challenge,exp:c.exp,difficulty:c.difficulty,sig:c.sig,pow});
        data=await auth('/api/auth/token');
      }
      if(!data?.token)throw new Error('BowdTV n’a pas accordé de session invitée.');
      if(account)await saveSession({account:true,cookies:Object.fromEntries(cookies)});
      token=data.token;let exp=0;try{exp=Number(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).exp)*1000;}catch{}
      expires=exp||Date.now()+240000;return token;
    })().finally(()=>{pending=null});return pending;
  }
  async function get(path,retry=true){
    const jwt=await login();const response=await request(API+path,{headers:{authorization:`Bearer ${jwt}`,'x-bod-platform':'web',origin:'https://bowdtv.com',referer:'https://bowdtv.com/'},signal:AbortSignal.timeout(20000)});
    if(response.status===401&&retry){token='';expires=0;return get(path,false);}
    if(!response.ok)throw new Error(`BowdTV indisponible (${response.status}).`);
    return response.json();
  }
  async function channels(country='France'){
    let cursor='';const result=[],seen=new Set(),cursors=new Set();
    for(let page=0;page<100;page++){
      const query=new URLSearchParams({country,limit:'200',...(cursor?{cursor}:{})});
      const data=await get('/api/v1/channels?'+query);
      for(const item of data.channels||[])if(item.id&&!seen.has(item.id)){seen.add(item.id);result.push(item);}
      const next=data.nextCursor==null?'':String(data.nextCursor);
      if(!next) return result;
      if(cursors.has(next))throw new Error('Pagination BowdTV bloquée.');
      cursors.add(next);cursor=next;
    }
    throw new Error('Catalogue BowdTV trop volumineux.');
  }
  async function authenticateAccount(username,password){
    if(typeof username!=='string'||!username.trim()||username.length>200||typeof password!=='string'||!password||password.length>1024)throw new Error('Identifiants BowdTV invalides.');
    if(loaded||pending||cookies.size)throw new Error('Utilisez une nouvelle session pour connecter le compte BowdTV.');
    await auth('/api/auth/sign-in/username',{username:username.trim(),password});
    account=true;loaded=true;
    if(!cookies.size)throw new Error('BowdTV ne fournit pas de session persistante.');
    await get('/api/v1/countries');
    return {account:true,cookies:Object.fromEntries(cookies)};
  }
  return {channels,authenticateAccount,countries:()=>get('/api/v1/countries'),stream:id=>{
    if(!/^[a-z0-9_-]{1,180}$/i.test(id))throw new Error('Chaîne BowdTV invalide.');
    return get('/api/v1/channels/'+encodeURIComponent(id)+'/stream?complete=1&prewarm=1');
  }};
}
