const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const reddit = require('../server/reddit-conversions.cjs');
const common = require('../server/conversions.cjs');
const NOW = Math.floor(Date.now()/1000);
function setup() {
  const records = new Map(); let revision = 0;
  const store = {
    async get(key) { return records.has(key) ? structuredClone(records.get(key).data) : null; },
    async getWithMetadata(key) { return records.has(key) ? structuredClone(records.get(key)) : null; },
    async setJSON(key, data, options = {}) {
      if (options.onlyIfNew && records.has(key) || options.onlyIfMatch && records.get(key)?.etag !== options.onlyIfMatch) return { modified: false };
      const etag = String(++revision); records.set(key,{data:structuredClone(data),etag}); return {modified:true,etag};
    }
  };
  const sent=[];
  return {store, now:()=>NOW, sent, send:async(event,test)=>sent.push({event,test}),
    config:{enabled:true,testId:'qa-only',testLinks:new Set(['plink_test_fixture'])}};
}
const address = extra => ({'form-name':'cupholder-v2-shipping-intent',checkout_id:'qa-checkout-reddit',
  source_url:'https://gosteady.co/checkoutV2?private=remove',email:'Al.ice+shop@Example.com',
  reddit_uuid:'a354c998-a543-47b9-89b6-bb737afc7281',rdt_cid:'click-fixture',client_user_agent:'QA browser',...extra});
const payment = (extra={},eventExtra={}) => ({type:'checkout.session.completed',created:NOW,livemode:true,
  data:{object:{object:'checkout.session',id:'cs_live_reddit_fixture',mode:'payment',status:'complete',payment_status:'paid',
    payment_link:'plink_1UIwWXQ2TfGTSvqAuINb79n3',amount_total:4900,currency:'usd',client_reference_id:'qa-checkout-reddit',
    customer_details:{email:'al.ice+shop@example.com'},...extra}},...eventExtra});
test('Reddit only sends minimal canonicalized match data and clean source URLs',async()=>{
  const d=setup(); await reddit.processAddress(address({first_name:'Private',address:'Private street'}),d);
  const e=d.sent[0].event;
  assert.equal(e.payload.user.email,common.hash('alice@example.com'));
  assert.equal(e.payload.event_source_url,'https://gosteady.co/checkoutV2');
  assert.equal(e.payload.click_id,'click-fixture');
  assert.equal(e.payload.type.custom_event_name,'AddressCompleted');
  assert.equal(e.payload.metadata.conversion_id,'shipping_qa-checkout-reddit');
  assert.equal(JSON.stringify(e).includes('Private'),false);
});
test('Reddit opt-out suppresses address and payment, including legacy privacy records',async()=>{
  for(const extra of [{reddit_opt_out:'true'},{meta_opt_out:'true'}]) {
    const d=setup(); assert.equal(await reddit.processAddress(address(extra),d),'opted-out');
    assert.equal(await reddit.processPayment(payment(),d),'opted-out'); assert.equal(d.sent.length,0);
  }
  const d=setup(); d.legacyStore={get:async()=>({opt_out:true,created_at:NOW})};
  assert.equal(await reddit.processPayment(payment(),d),'opted-out');
});
test('Reddit counts one $49 paid deposit across Stripe retries and asynchronous success',async()=>{
  const d=setup();await reddit.processAddress(address(),d);
  assert.equal(await reddit.processPayment(payment(),d),'sent');
  assert.equal(await reddit.processPayment(payment({}, {type:'checkout.session.async_payment_succeeded'}),d),'duplicate');
  const e=d.sent[1].event;
  assert.equal(e.payload.type.tracking_type,'PURCHASE');
  assert.equal(e.payload.metadata.value,49); assert.equal(e.payload.event_at,NOW*1000);
  assert.equal(e.payload.click_id,'click-fixture'); assert.equal(d.sent.length,2);
});
test('Reddit rejects unpaid, unrelated, incomplete and wrong-value payments',async()=>{
  for(const extra of [{payment_status:'unpaid'},{payment_link:'plink_other'},{amount_total:0},{currency:'eur'},{status:'open'},{mode:'subscription'}]){
    const d=setup();assert.equal(await reddit.processPayment(payment(extra),d),'ignored');assert.equal(d.sent.length,0);
  }
});
test('Reddit waits for attribution and retries safely after transport failure',async()=>{
  const d=setup();await assert.rejects(reddit.processPayment(payment(),d),/Waiting/);
  const send=d.send;d.send=async()=>{throw Error('offline')};
  await assert.rejects(reddit.processAddress(address(),d),/offline/);
  const receipt=await d.store.get('receipts/live/shipping_qa-checkout-reddit');assert.equal(receipt.state,'retry');
  d.send=send;await reddit.processAddress(address(),d);assert.equal(d.sent.length,1);
});
test('Reddit concurrent address deliveries share the durable lease',async()=>{
  const d=setup();await Promise.allSettled([reddit.processAddress(address(),d),reddit.processAddress(address(),d)]);
  assert.equal(d.sent.length,1);
});
test('Reddit ignores invalid forms and malformed identifiers',async()=>{
  for(const extra of [{'form-name':'survey'},{checkout_id:'../no'},{'bot-field':'spam'},{email:'bad'},{source_url:'http://localhost/checkoutV2'}]){
    const d=setup();assert.equal(await reddit.processAddress(address(extra),d),'ignored');
  }
});
test('Reddit sandbox cannot leak into production events',async()=>{
  const d=setup(); const e=payment({payment_link:'plink_test_fixture',client_reference_id:null},{livemode:false});
  await reddit.processPayment(e,d); assert.equal(d.sent[0].test,true);
  d.config.testId='';await assert.rejects(reddit.processPayment(e,d),/sandbox/);
  assert.equal(reddit.runtimeConfig({REDDIT_CAPI_ENABLED:'true'},'branch-deploy').enabled,false);
});
test('Reddit transport uses v3 envelope, bearer authentication and explicit test routing',async()=>{
  const config={token:'fixture',pixel:'a2_fixture',testId:'test-fixture'};let body;
  await reddit.sendToReddit(reddit.envelope('Purchase','deposit_fixture',NOW,'https://gosteady.co/checkoutV2',{}),config,async(url,options)=>{
    assert.equal(url,'https://ads-api.reddit.com/api/v3/pixels/a2_fixture/conversion_events');
    assert.equal(options.headers.Authorization,'Bearer fixture');body=JSON.parse(options.body);
    return {ok:true,json:async()=>({data:{message:'Successfully processed 1 conversion events.'}})};
  },true);
  assert.equal(body.data.test_id,'test-fixture');assert.equal(body.data.events.length,1);
  await assert.rejects(reddit.sendToReddit({},config,async()=>({ok:false,status:503,json:async()=>({})})),/503/);
});
function browser({hostname='gosteady.co',gpc=false,search='',blocked=false,storage=new Map()}={}){
  const scripts=[];const window={location:{hostname,search},navigator:{globalPrivacyControl:gpc},sessionStorage:{
    setItem(k,v){if(blocked)throw Error('blocked');storage.set(k,v)},getItem(k){if(blocked)throw Error('blocked');return storage.get(k)}}};
  const document={cookie:'_rdt_uuid=1790000000000.a354c998-a543-47b9-89b6-bb737afc7281',createElement:()=>({}),getElementsByTagName:()=>[{parentNode:{insertBefore:e=>scripts.push(e)}}]};
  vm.runInNewContext(fs.readFileSync('Assets/reddit-tracking.js','utf8'),{window,document,URLSearchParams,Date});
  return {window,scripts,storage,events:()=>window.rdt?.callQueue.map(x=>Array.from(x))||[]};
}
test('Reddit browser suppresses local previews and GPC; blocked storage is harmless',()=>{
  for(const options of [{hostname:'localhost'},{gpc:true}]) {const b=browser(options);assert.equal(b.scripts.length,0);assert.equal(b.events().length,0)}
  const b=browser({blocked:true});assert.equal(b.events()[1][1],'PageVisit');
});
test('Reddit browser retains click ID across pages and strips timestamp from UUID',()=>{
  const first=browser({search:'?rdt_cid=ad-click-fixture'});const second=browser({storage:first.storage});
  assert.equal(second.window.GoSteadyReddit.attribution().rdt_cid,'ad-click-fixture');
  assert.equal(second.window.GoSteadyReddit.attribution().reddit_uuid,'a354c998-a543-47b9-89b6-bb737afc7281');
});
test('Reddit browser maps checkout intent without ever issuing Purchase',()=>{
  const b=browser();b.window.GoSteadyReddit.milestone('InitiateCheckout');b.window.GoSteadyReddit.milestone('AddShippingInfo','shipping_123');
  b.window.GoSteadyReddit.milestone('Purchase');
  assert.equal(b.events().length,4);assert.equal(b.events()[2][2].customEventName,'CheckoutStarted');assert.equal(b.events()[3][2].conversionId,'shipping_123');
  b.window.navigator.globalPrivacyControl=true;b.window.GoSteadyReddit.milestone('AddPaymentInfo');assert.equal(b.events().length,4);
});
