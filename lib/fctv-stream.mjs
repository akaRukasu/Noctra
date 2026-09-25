import {createCipheriv} from 'node:crypto';
// Public player protocol: ROT47 URL and provider-issued session, AES-CTR/no padding.
// These constants are published in FCTV's browser client; no session is fabricated.
export function fctvSessionUrl(target, session) {
  if(!session)throw new Error('Session de lecture FCTV33 absente.');
  const cipher=createCipheriv('aes-256-ctr',Buffer.from('YTc5ODFjYzllYjJmNGQxOWRjZmVhNTdiMTAxZWNkODk=','base64'),Buffer.from('ODAxN2QzYThmMTQwMGQyZg==','base64'));
  const token=Buffer.concat([cipher.update(session,'utf8'),cipher.final()]).toString('base64');
  const url=new URL(target);
  url.pathname='/token-'+encodeURIComponent(token)+'a'+url.pathname;
  return url.href;
}
// The public FCTV endpoint returns a protobuf envelope, even with JSON content type.
function fields(bytes) {
  const result = new Map(); let offset = 0;
  function integer() {
    let value=0, factor=1;
    for(let n=0;n<8;n++) {
      if(offset>=bytes.length) throw new Error('Réponse FCTV33 tronquée.');
      const byte=bytes[offset++]; value+=(byte&127)*factor;
      if(!(byte&128)) return value;
      factor*=128;
    }
    throw new Error('Réponse FCTV33 invalide.');
  }
  while(offset<bytes.length) {
    const tag=integer(), wire=tag%8, field=Math.floor(tag/8);
    if(!field) throw new Error('Champ FCTV33 invalide.');
    if(wire===0) {integer();continue;}
    if(wire===1||wire===5) {offset+=wire===1?8:4;if(offset>bytes.length)throw new Error('Réponse FCTV33 tronquée.');continue;}
    if(wire!==2) throw new Error('Format FCTV33 non pris en charge.');
    const size=integer();if(size>bytes.length-offset)throw new Error('Réponse FCTV33 tronquée.');
    result.set(field,bytes.subarray(offset,offset+size));offset+=size;
  }
  return result;
}

export function decodeFctvStream(bytes) {
  if(bytes.length>1024*1024) throw new Error('Réponse FCTV33 trop volumineuse.');
  const data=fields(bytes).get(10);
  const stream=data && fields(data).get(2);
  const value=stream && fields(stream).get(4);
  if(!value) throw new Error('Ce serveur FCTV33 ne fournit pas de flux actuellement.');
  const raw=new TextDecoder().decode(value);
  const decoded=raw.replace(/[!-~]/g,c=>String.fromCharCode(33+(c.charCodeAt(0)-33+47)%94));
  const target=[raw,decoded].map(s=>s.match(/https?:\/\/[^\s"<>]+/)?.[0]).find(Boolean);
  if(!target) throw new Error('Adresse de lecture FCTV33 indisponible.');
  const url=new URL(target);
  if(url.username||url.password)throw new Error('Adresse FCTV33 invalide.');
  return url.href;
}
