import assert from 'node:assert/strict'
import test from 'node:test'
import {gunzipSync} from 'node:zlib'
import { WppTelemetryClient } from '../src/index.js'

export const storage = () => {
  const values=new Map()
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}
}
const options={endpoint:'https://cloud.example',apiKey:'test-key',sourceId:'source-a',autoFlush:false,compression:false}
const acknowledge=init=>Response.json({accepted:JSON.parse(new TextDecoder().decode(init.body)).snapshots.length,duplicates:0},{status:202})

test('overlapping flush calls share a single delivery and retain newly recorded counters',async()=>{
  let release
  const gate=new Promise(resolve=>{release=resolve})
  const batches=[]
  const client=new WppTelemetryClient().configure({...options,storage:storage(),fetch:async(_url,init)=>{
    batches.push(JSON.parse(new TextDecoder().decode(init.body)));await gate;return acknowledge(init)
  }})
  client.recordMessage('sent')
  const first=client.flush()
  await new Promise(resolve=>setImmediate(resolve))
  client.recordMessage('sent',2)
  const second=client.flush()
  release();await Promise.all([first,second])
  assert.equal(batches.length,1,'Concurrent flush must not start a second request')
  await client.flush()
  assert.equal(batches[1].snapshots[0].counters['messages.sent'],2)
})

test('a successful HTTP response without a valid acknowledgement cannot delete queued metrics',async()=>{
  let valid=false
  const batches=[]
  const client=new WppTelemetryClient().configure({...options,storage:storage(),fetch:async(_url,init)=>{
    batches.push(JSON.parse(new TextDecoder().decode(init.body)));return valid?acknowledge(init):Response.json({})
  }})
  client.recordMessage('sent',3)
  assert.equal((await client.flush()).delivered,0)
  valid=true;await client.flush()
  assert.equal(batches[1].snapshots[0].idempotencyKey,batches[0].snapshots[0].idempotencyKey)
})

test('persisted queues cannot cross endpoint or API-key boundaries',async()=>{
  const shared=storage()
  const first=new WppTelemetryClient().configure({...options,storage:shared,fetch:async()=>{throw new Error('offline')}})
  first.recordMessage('sent',9);await first.flush()
  for (const changed of [{apiKey:'another-account-key'},{endpoint:'https://other.example'}]) {
    const batches=[]
    const client=new WppTelemetryClient().configure({...options,...changed,storage:shared,fetch:async(_url,init)=>{
      batches.push(JSON.parse(new TextDecoder().decode(init.body)));return acknowledge(init)
    }})
    await client.flush()
    assert.equal(batches.flatMap(batch=>batch.snapshots).reduce((sum,snapshot)=>sum+snapshot.counters['messages.sent'],0),0)
  }
})

test('a full offline queue retains both its oldest snapshot and unsaved current counters',async()=>{
  let online=false
  const received=[]
  const client=new WppTelemetryClient().configure({...options,maxQueue:1,storage:storage(),fetch:async(_url,init)=>{
    if(!online) throw new Error('offline')
    received.push(...JSON.parse(new TextDecoder().decode(init.body)).snapshots);return acknowledge(init)
  }})
  client.recordMessage('sent');await client.flush()
  client.recordMessage('sent',2);await client.flush()
  online=true;await client.flush();await client.flush()
  assert.equal(received.reduce((sum,snapshot)=>sum+snapshot.counters['messages.sent'],0),3)
})

test('gzip retry survives a lost acknowledgement and a client restart without recounting metrics',async()=>{
  const shared=storage(), seen=new Set(), accepted=[]
  let loseAcknowledgement=true
  const fetch=async(_url,init)=>{
    assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.ok(init.signal)
    assert.equal(new Headers(init.headers).get('content-encoding'),'gzip')
    const batch=JSON.parse(gunzipSync(init.body).toString())
    let duplicates=0
    for(const snapshot of batch.snapshots) {
      if(seen.has(snapshot.idempotencyKey)) duplicates++
      else {seen.add(snapshot.idempotencyKey);accepted.push(snapshot)}
    }
    if(loseAcknowledgement){loseAcknowledgement=false;throw new Error('Acknowledgement lost after persistence')}
    return Response.json({accepted:batch.snapshots.length-duplicates,duplicates})
  }
  const before=new WppTelemetryClient().configure({...options,compression:true,storage:shared,fetch})
  before.recordMessage('sent',3);assert.equal((await before.flush()).pending,1)
  const restarted=new WppTelemetryClient().configure({...options,compression:true,storage:shared,fetch})
  assert.equal((await restarted.flush()).pending,0)
  assert.equal(accepted.reduce((sum,snapshot)=>sum+snapshot.counters['messages.sent'],0),3)
})

test('a storage failure cannot reset unsaved counters',async()=>{
  const shared=storage();let broken=true;let sent
  const client=new WppTelemetryClient().configure({...options,storage:{...shared,setItem:(key,value)=>{
    if(broken)throw new Error('Storage quota');shared.setItem(key,value)
  }},fetch:async(_url,init)=>{sent=JSON.parse(new TextDecoder().decode(init.body));return acknowledge(init)}})
  client.recordMessage('sent',7)
  await assert.rejects(client.flush(),/Storage quota/)
  broken=false;await client.flush();assert.equal(sent.snapshots[0].counters['messages.sent'],7)
})

test('closed-schema validation blocks identifying fields injected into local storage',async()=>{
  let saved,corrupt=false,calls=0
  const client=new WppTelemetryClient().configure({...options,storage:{getItem:()=>{
    if(!saved)return null
    const rows=JSON.parse(saved);if(corrupt)rows[0].phone='must-not-leave-device';return JSON.stringify(rows)
  },setItem:(_key,value)=>{saved=value},removeItem:()=>{}},fetch:async()=>{calls++;throw new Error('Offline')}})
  await client.flush();corrupt=true
  await assert.rejects(client.flush(),/unsupported fields/)
  assert.equal(calls,1)
})

test('serializes clients sharing a queue and refuses runtime identity changes',async()=>{
  const shared=storage(), sent=[]
  const config={...options,storage:shared,fetch:async(_url,init)=>{
    sent.push(...JSON.parse(new TextDecoder().decode(init.body)).snapshots);return acknowledge(init)
  }}
  const first=new WppTelemetryClient().configure(config),second=new WppTelemetryClient().configure(config)
  first.recordMessage('sent');second.recordMessage('sent',2)
  await Promise.all([first.flush(),second.flush()])
  assert.equal(sent.reduce((sum,snapshot)=>sum+snapshot.counters['messages.sent'],0),3)
  assert.throws(()=>first.configure({...config,apiKey:'other'}),/new telemetry client/)
})

test('validates endpoint, limits and aggregation before poisoning the offline queue',()=>{
  for(const invalid of [{endpoint:'http://example.com'},{endpoint:'https://user:secret@example.com'},{maxQueue:0},{flushIntervalMs:0}]) {
    assert.throws(()=>new WppTelemetryClient().configure({...options,...invalid}))
  }
  const client=new WppTelemetryClient().configure({...options,storage:storage()})
  client.recordMessage('sent',1e9);assert.throws(()=>client.recordMessage('sent'),/limit/)
  for(let index=0;index<200;index++)client.recordFunction(`function${index}`,1)
  assert.throws(()=>client.recordFunction('tooMany',1),/limit/)
})
