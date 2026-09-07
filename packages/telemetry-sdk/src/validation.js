const identifier = /^[a-zA-Z][a-zA-Z0-9._:-]{0,119}$/
function keys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key=>!allowed.includes(key))) throw new Error('Telemetry contains invalid or unsupported fields')
}
function number(value, max=1e15, integer=false) {
  if (!Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value))) throw new Error('Telemetry metric exceeds its valid range')
}
export function validateSnapshot(value) {
  keys(value,['schemaVersion','idempotencyKey','sourceId','sdkVersion','waVersion','observedFrom','observedTo','counters','responseLatency','availability','functions'])
  if (value.schemaVersion !== '1' || typeof value.idempotencyKey !== 'string' || value.idempotencyKey.length < 8 || value.idempotencyKey.length > 200 || typeof value.sourceId !== 'string' || !identifier.test(value.sourceId)) throw new Error('Invalid telemetry identity')
  for (const [key,max] of [['sdkVersion',40],['waVersion',80]]) if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > max)) throw new Error('Invalid telemetry version')
  const elapsed=Math.round((Date.parse(value.observedTo)-Date.parse(value.observedFrom))/1000)
  if (!Number.isFinite(elapsed) || elapsed<1 || elapsed>86400) throw new Error('Telemetry observation interval must be between 1 second and 24 hours')
  keys(value.counters,['messages.sent','messages.received','messages.deleted','errors.total'])
  Object.values(value.counters).forEach(count=>number(count,1e9,true))
  keys(value.availability,['connectedSeconds','observedSeconds'])
  number(value.availability.connectedSeconds,elapsed,true)
  if (value.availability.observedSeconds!==elapsed) throw new Error('Invalid telemetry availability interval')
  keys(value.responseLatency,['sumMs','count','buckets','counts'])
  const latency=value.responseLatency
  number(latency.sumMs);number(latency.count,1e9,true)
  if (latency.buckets!==undefined || latency.counts!==undefined) {
    if (!Array.isArray(latency.buckets) || !Array.isArray(latency.counts) || latency.buckets.length!==latency.counts.length || latency.buckets.length>30) throw new Error('Invalid telemetry histogram')
    latency.buckets.forEach((bucket,index)=>{number(bucket);if(index && bucket<=latency.buckets[index-1]) throw new Error('Invalid histogram order')})
    latency.counts.forEach(count=>number(count,1e9,true))
    if (latency.counts.reduce((sum,count)=>sum+count,0)!==latency.count) throw new Error('Invalid histogram total')
  }
  if (!Array.isArray(value.functions) || value.functions.length>200) throw new Error('Telemetry supports at most 200 function metrics')
  for (const metric of value.functions) {
    keys(metric,['name','calls','errors','durationMsSum'])
    if (typeof metric.name !== 'string' || !identifier.test(metric.name)) throw new Error('Invalid telemetry function label')
    number(metric.calls,1e9,true);number(metric.errors,metric.calls,true);number(metric.durationMsSum)
  }
  return value
}
