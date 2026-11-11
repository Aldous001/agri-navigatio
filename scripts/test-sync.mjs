import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSnapshot,buildReference} from '../supabase/functions/navigation-sync/sync.mjs';
const previous = {generated:'2026-11-10 09:15',models:[{model:'X1',factory:'核验厂家',sourceFactory:'原始厂家',sourceUrl:'https://example.com/evidence'}]};
const data = () => ({meta:{generated:'2026-11-11 09:15',years:[2025,2026],units:['江苏省']},search:{m:[['X1','原始厂家',10,10000,[3,7],[[0,10]],1]]}});
const encode = source => 'window.DASH_DATA = ' + JSON.stringify(source) + ';';
test('更新数值并保留核验厂家及证据链接',()=>{
  const result = buildSnapshot(encode(data()),previous,'2026-11-11T02:30:00Z');
  assert.equal(result.models[0].factory,'核验厂家');assert.equal(result.models[0].averagePrice,1000);
  assert.equal(result.models[0].sourceUrl,previous.models[0].sourceUrl);assert.equal(result.models[0].yearly['2026'],7);
});
test('未核验的新型号不能自动进入导航名单',()=>{
  const source=data();source.search.m.push(['监测终端','其他厂家',20,5000,[0,20],[[0,20]],1]);
  assert.equal(buildSnapshot(encode(source),previous).models.length,1);
});
test('来源缺失、厂家变更、数值异常和时间倒退均拒绝覆盖',()=>{
  for(const change of [s=>s.search.m.pop(),s=>s.search.m[0][1]='其他厂家',s=>s.search.m[0][2]=-1,s=>s.meta.generated='2026-11-01 09:15']){
    const source=data();change(source);assert.throws(()=>buildSnapshot(encode(source),previous));
  }
  assert.throws(()=>buildSnapshot('<html>错误页面</html>',previous));
});
test('全品目区域数据完整保留，缺少区域字段时拒绝覆盖',()=>{
  const source=data();Object.assign(source,{statsYear:{'全国':{all:[1,1,100,30]}},countyStat:{'江苏省':{'测试县':{all:[1,1,100,30]}}},
    monthSeries:{'全国':{'2026-01':[1,100]}},countyDetail:{},cityStat:{},cityDetail:{},townOfCounty:{},countyCity:{},extraField:{keep:true}});
  const reference=buildReference(encode(source));assert.deepEqual(reference.data,source);assert.match(reference.scope,/全品目/);
  delete source.countyStat;assert.throws(()=>buildReference(encode(source)));
});
