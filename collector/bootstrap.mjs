// Run locally with configuration on stdin. This file never writes credentials to disk.
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { sealSession } from './session.mjs';
import { siteClient } from './site-client.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const config=JSON.parse(input),call=siteClient(config);
const secret=async(name,value)=>new Promise((resolve,reject)=>{
  const child=spawn('gh',['secret','set',name,'--repo',config.repository],{stdio:['pipe','ignore','pipe']});
  child.stdin.end(value);child.on('error',reject);child.on('close',code=>code?reject(new Error('Could not configure GitHub secret.')):resolve());
});
try {
  for(const [name,value] of Object.entries({SITE_BEARER:config.siteBearer,COLLECTOR_TOKEN:config.collectorToken,SESSION_KEY:config.sessionKey})) await secret(name,value);
  const session=JSON.parse(await readFile(config.sessionFile,'utf8'));
  await call('/api/collector/session',sealSession(session,config.sessionKey));
  console.log('Encrypted Amazon session and GitHub secrets configured.');
  const db=new DatabaseSync(config.historyFile,{readOnly:true});
  for(const [kind,table] of [['measurements','measurements'],['attempts','attempts'],['capabilities','capability_samples']]) {
    const upper=db.prepare(`SELECT max(id) AS id FROM ${table}`).get().id || 0;let cursor=0,count=0;
    while(cursor<upper) {
      const rows=db.prepare(`SELECT * FROM ${table} WHERE id>? AND id<=? ORDER BY id LIMIT 150`).all(cursor,upper);
      if(!rows.length)break;
      await call('/api/collector/import',{kind,rows});cursor=rows.at(-1).id;count+=rows.length;
    }
    console.log(`Imported ${count} ${kind} rows.`);
  }
  db.close();
}catch{console.error('Cloud setup failed. Secrets were not printed. Retry the same setup after checking access.');process.exitCode=1;}
