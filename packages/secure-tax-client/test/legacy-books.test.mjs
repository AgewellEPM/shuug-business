import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {JSDOM} from 'jsdom';
import {prepareLegacyMigration} from '../migrate-legacy.mjs';
import {LegacyImport} from '../browser/legacy-import.mjs';
import {verifyLegacyBooks,legacyBookSnapshot,assertLegacyBookSource} from '../legacy-books.mjs';
import {renderLegacyBooks} from '../browser/legacy-books-view.mjs';
import {renderStaffRecords} from '../browser/staff-view.mjs';
import {fixture,importClient,listFiles,selectedFiles,sealBackup} from './legacy-books-fixture.mjs';
test('client-linked business books retain exact state and periods, authenticate after encrypted import, and never copy office/provider records',async()=>{
  const value=await fixture();try{
    const report=await prepareLegacyMigration(value.options);assert.deepEqual(report.supportedCounts,{driverRecords:0,linkedDriverReceipts:0,submittedTaxDocuments:0,clientBusinessBooks:1,clientBookJournalEntries:5,clientBookBillingDocuments:1,clientBookPeriodEvents:1,clientBooksMissingState:0});assert.equal(report.entries.length,1);assert.equal(report.entries[0].sourceType,'client-book');
    const all=listFiles(value.options.outputDirectory).map(name=>readFileSync(path.join(value.options.outputDirectory,name),'utf8')).join('\n');for(const privateText of [value.book.id,value.book.name,'Synthetic customer','synthetic@example.test','OFFICE_HISTORY','PROVIDER_SECRET','FOREIGN_CLIENT','PUBLIC_SHARE'])assert(!all.includes(privateText));
    const client=importClient(value),importer=new LegacyImport(client);await importer.select(selectedFiles(value.options.outputDirectory));assert.equal(client.writes,0);await assert.rejects(()=>importer.import(),/Review/);const receipt=await importer.import({reviewed:true});assert.equal(client.writes,1);assert.equal(receipt.completeProductMigration,false);
    const record=[...client.records.values()][0],source=record.verifiedLegacyBooks;assert.deepEqual(source.book,value.book);assert.deepEqual(source.state,value.state);assert.deepEqual(source.periods,value.periods);
    const snapshot=legacyBookSnapshot(source);assert.equal(snapshot.debitCents,8500);assert.equal(snapshot.creditCents,8500);assert.equal(snapshot.billing[0].balance.outstandingCents,6000);assert.equal(snapshot.canonicalLedgerPosted,false);assert.equal(source.state.entries.at(-1).reversesId,'manual:opening');
    await importer.import({reviewed:true});assert.equal(client.writes,1);
  }finally{value.cleanup();}
});
test('a book imported or queued from an earlier backup is deduplicated by source book ID',async()=>{
  const value=await fixture();try{
    await prepareLegacyMigration(value.options);const client=importClient(value),importer=new LegacyImport(client);await importer.select(selectedFiles(value.options.outputDirectory));const save=client.savePrepared;client.savePrepared=async()=>{throw new Error('Synthetic offline');};await assert.rejects(()=>importer.import({reviewed:true}),/offline/);assert.equal(client.writes,0);
    const otherLegacyAccount=randomUUID(),db=new DatabaseSync(path.join(value.backup,'workspace.sqlite'));try{db.prepare('UPDATE customer_accounts SET id=?').run(otherLegacyAccount);}finally{db.close();}
    writeFileSync(path.join(value.backup,'extra'), 'Synthetic backup metadata');const second={...value.options,expected:{...value.options.expected,sourceAccountId:otherLegacyAccount,sourceClientId:value.book.clientId},backupManifestSha256:sealBackup(value.backup),outputDirectory:path.join(value.directory,'second')};await prepareLegacyMigration(second);
    await assert.rejects(()=>importer.select(selectedFiles(second.outputDirectory)),/another backup/);assert.equal(client.writes,0);client.savePrepared=save;await importer.select(selectedFiles(value.options.outputDirectory));await importer.import({reviewed:true});
    await assert.rejects(()=>importer.select(selectedFiles(second.outputDirectory)),/another backup/);assert.equal(client.writes,1);
  }finally{value.cleanup();}
});
test('retained evidence rejects client changes, destination substitution and unexpected secret fields',async()=>{
  const value=await fixture();try{
    await prepareLegacyMigration(value.options);const client=importClient(value),importer=new LegacyImport(client);await importer.select(selectedFiles(value.options.outputDirectory));await importer.import({reviewed:true});const record=[...client.records.values()][0],payload=JSON.parse(new TextDecoder().decode(record.plaintext)),context={...client.scope,objectId:record.objectId,domain:'tax-document'};
    const changed=structuredClone(payload);changed.source.state.entries[0].entry.memo='Changed after preparation';await assert.rejects(()=>verifyLegacyBooks(changed,context,value.publicPins));await assert.rejects(()=>verifyLegacyBooks(payload,{...context,clientId:randomUUID()},value.publicPins));
    assert.deepEqual(await verifyLegacyBooks(payload,{...context,keyId:'replacement-client-key-after-recovery'},value.publicPins),payload.source);
    const extra=structuredClone(payload.source);extra.state.secret='Synthetic unexpected provider token';assert.throws(()=>assertLegacyBookSource(extra));extra.state=value.state;extra.book.id='office';assert.throws(()=>assertLegacyBookSource(extra));
    const broken=structuredClone(payload.source);broken.state.entries[0].entry.lines[0].debitCents++;assert.throws(()=>assertLegacyBookSource(broken));
    const discrepancy=structuredClone(payload.source);discrepancy.state.entries[0].entry.memo='Retained source differed from original period snapshot';assert(legacyBookSnapshot(discrepancy).issues.some(issue=>issue.includes('differs from the original closed-period')));
  }finally{value.cleanup();}
});
test('absent client journal and period records remain explicit unknowns',async()=>{
  const value=await fixture();try{
    const db=new DatabaseSync(path.join(value.backup,'workspace.sqlite'));try{db.prepare('DELETE FROM documents WHERE id IN (?,?)').run(`state:client-journal:${value.book.id}`,`accounting-periods:${value.book.id}`);}finally{db.close();}value.options.backupManifestSha256=sealBackup(value.backup);
    const report=await prepareLegacyMigration(value.options);assert.equal(report.supportedCounts.clientBooksMissingState,1);const client=importClient(value),importer=new LegacyImport(client);await importer.select(selectedFiles(value.options.outputDirectory));await importer.import({reviewed:true});const source=[...client.records.values()][0].verifiedLegacyBooks;assert.equal(source.state,null);assert.equal(source.periods,null);const snapshot=legacyBookSnapshot(source);assert.equal(snapshot.debitCents,null);assert(snapshot.issues.some(issue=>issue.includes('balance is unknown')));
  }finally{value.cleanup();}
});
test('an invalid original period seal prevents export without altering the copied backup',async()=>{
  const value=await fixture();try{
    const db=new DatabaseSync(path.join(value.backup,'workspace.sqlite'));try{const periods=structuredClone(value.periods);periods.active.entries[0].memo='Changed sealed source';db.prepare('UPDATE documents SET body=? WHERE id=?').run(JSON.stringify(periods),`accounting-periods:${value.book.id}`);}finally{db.close();}value.options.backupManifestSha256=sealBackup(value.backup);const before=readFileSync(path.join(value.backup,'workspace.sqlite'));await assert.rejects(()=>prepareLegacyMigration(value.options),/preparation failed/);assert.deepEqual(readFileSync(path.join(value.backup,'workspace.sqlite')),before);
  }finally{value.cleanup();}
});
test('client and staff views render authenticated financial history as text and expose full source only on download',async()=>{
  const value=await fixture(),dom=new JSDOM('<main></main>');try{
    await prepareLegacyMigration(value.options);const client=importClient(value),importer=new LegacyImport(client);await importer.select(selectedFiles(value.options.outputDirectory));await importer.import({reviewed:true});const record=[...client.records.values()][0],downloads=[];
    const view=renderLegacyBooks(dom.window.document,record,{download:(name,bytes)=>downloads.push({name,text:new TextDecoder().decode(bytes)})});dom.window.document.querySelector('main').append(view);assert.equal(downloads.length,0);assert.equal(view.querySelectorAll('script').length,0);assert.match(view.textContent,/Historical invoice/);assert.match(view.textContent,/historical outstanding \$60\.00/);assert.match(view.textContent,/Reverses manual:opening/);assert.match(view.textContent,/Source period seal through 2025-06-30/);assert.match(view.textContent,/have not been posted/);
    [...view.querySelectorAll('button')].find(button=>button.textContent.startsWith('Download retained')).click();await Promise.resolve();assert.equal(downloads.length,1);assert.deepEqual(JSON.parse(downloads[0].text).state,value.state);
    const staff=renderStaffRecords(dom.window.document,client.records,client.scope);assert.match(staff.textContent,/Imported business accounting/);assert.match(staff.textContent,/Synthetic customer/);assert(!staff.querySelector('script'));
    assert.match(renderLegacyBooks(dom.window.document,{plaintext:record.plaintext}).textContent,/could not be verified/);view.replaceChildren();assert(!view.textContent.includes('Synthetic customer'));
  }finally{dom.window.close();value.cleanup();}
});
