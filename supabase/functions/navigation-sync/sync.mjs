export const SOURCE_URL = 'https://sky9606.github.io/agri-subsidy-dashboard/data.js';
const normalize = value => String(value).replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');
const validNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function buildReference(text, checkedAt = new Date().toISOString()) {
  if (!/^\s*window\.DASH_DATA\s*=/.test(text)) throw new Error('来源文件格式不符');
  const data = JSON.parse(text.slice(text.indexOf('=') + 1).trim().replace(/;\s*$/, ''));
  for (const key of ['meta','statsYear','countyStat','monthSeries','countyDetail','cityStat','cityDetail','townOfCounty','countyCity']) {
    if (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])) throw new Error('区域数据缺少字段：' + key);
  }
  if (!Array.isArray(data.meta.units) || !data.meta.units.length || !data.statsYear['全国']?.all
      || !data.monthSeries['全国'] || !Object.keys(data.countyStat).length) throw new Error('区域数据不完整');
  for (const months of Object.values(data.monthSeries)) for (const [month, values] of Object.entries(months)) {
    if (!/^\d{4}-\d{2}$/.test(month) || !Array.isArray(values) || values.length !== 2 || !values.every(validNumber)) throw new Error('月度数据异常');
  }
  return {generated: data.meta.generated, checkedAt, scope:'原站全品目数据，含作业监测设备；非纯农机导航统计',
    sourceUrl:SOURCE_URL, data};
}

export async function packReference(reference) {
  // Keep the complete source, compressed to avoid slow multi-megabyte JSONB parsing in the API.
  const stream = new Blob([JSON.stringify(reference.data)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const content = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
  const {data,...metadata}=reference;
  return {...metadata,encoding:'gzip-base64',content,coverage:{provinces:data.meta.units.length,
    counties:Object.values(data.countyStat).reduce((sum,counties)=>sum+Object.keys(counties).length,0),
    nationalMonths:Object.keys(data.monthSeries['全国']).length}};
}

export function buildSnapshot(text, previous, checkedAt = new Date().toISOString()) {
  if (!/^\s*window\.DASH_DATA\s*=/.test(text)) throw new Error('来源文件格式不符');
  const source = JSON.parse(text.slice(text.indexOf('=') + 1).trim().replace(/;\s*$/, ''));
  const { meta, search } = source;
  if (!Array.isArray(meta?.years) || !meta.years.length || !meta.years.every(Number.isInteger)
      || !Array.isArray(meta.units) || !Array.isArray(search?.m)
      || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(meta.generated)) throw new Error('来源结构异常');
  if (!previous.models?.length) throw new Error('缺少已核验名单');
  if (meta.generated < previous.generated) throw new Error('来源时间早于当前快照');
  const index = new Map(search.m.map(row => [row[0], row]));
  const models = previous.models.map(reviewed => {
    const row = index.get(reviewed.model);
    if (!row || normalize(row[1]) !== normalize(reviewed.sourceFactory || reviewed.factory)) {
      throw new Error('已核验型号缺失或厂家对应变化：' + reviewed.model);
    }
    const [, , quantity, amount, yearly, regions, provinceCount] = row;
    if (!validNumber(quantity) || !validNumber(amount) || !Array.isArray(yearly)
        || yearly.length !== meta.years.length || !yearly.every(validNumber)
        || !Array.isArray(regions) || !Number.isInteger(provinceCount) || provinceCount < 0
        || provinceCount > meta.units.length || regions.some(pair => !Array.isArray(pair)
          || !Number.isInteger(pair[0]) || typeof meta.units[pair[0]] !== 'string' || !validNumber(pair[1]))) {
      throw new Error('型号数值异常：' + reviewed.model);
    }
    return { ...reviewed, quantity, amount, averagePrice: quantity ? Math.round(amount / quantity * 100) / 100 : 0,
      sourceFactory: row[1], provinceCount, yearly: Object.fromEntries(meta.years.map((year, i) => [year, yearly[i]])),
      regions: regions.map(([province, count]) => ({name: meta.units[province], quantity: count})) };
  });
  return { ...previous, models, years: meta.years, generated: meta.generated,
    sync: {checkedAt, schedule: '每天北京时间10:30', sourceUrl: SOURCE_URL, modelCount: models.length},
    sourceNote: previous.sourceNote };
}
