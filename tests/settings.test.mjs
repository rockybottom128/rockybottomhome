import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {readFileSync,readdirSync} from 'node:fs';
const source=ts.transpileModule(readFileSync('src/server/settings.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {visitorDemoEnabled,setVisitorDemo}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('visitor gate defaults off, persists toggles and audits owner changes atomically',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+file,'utf8'));
 db.prepare("INSERT INTO owner_accounts VALUES ('owner','owner@example.com','auth','active',0)").run();
 function stmt(sql,args=[]){return {bind(...values){return stmt(sql,values)},async first(){return db.prepare(sql).get(...args)},run(){return db.prepare(sql).run(...args)}}}
 const env={DB:{prepare:stmt,async batch(statements){db.exec('BEGIN');try{const result=statements.map(s=>s.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}}};
 try {
  assert.equal(await visitorDemoEnabled(env),false);
  await setVisitorDemo(env,'owner',true);assert.equal(await visitorDemoEnabled(env),true);
  await setVisitorDemo(env,'owner',false);assert.equal(await visitorDemoEnabled(env),false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n,2);
  await assert.rejects(setVisitorDemo(env,'unknown-owner',true));assert.equal(await visitorDemoEnabled(env),false);
  db.exec('DELETE FROM site_settings');assert.equal(await visitorDemoEnabled(env),false);
 }finally{db.close();}
});
