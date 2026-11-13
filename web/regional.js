export async function unpackReference(payload) {
  if (payload.encoding !== 'gzip-base64') return payload;
  const bytes=Uint8Array.from(atob(payload.content),character=>character.charCodeAt(0));
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const data=JSON.parse(await new Response(stream).text());
  const {content,encoding,...metadata}=payload;
  return {...metadata,data};
}

export function createRegionalView({document, request, number}) {
  const $ = id => document.getElementById(id);
  const win = document.defaultView;
  let snapshot = null;
  let regionRows = [], monthRows = [];
  const charts = new Map();
  const state = () => ({province:$('regional-province').value, city:$('regional-city').value,
    county:$('regional-county').value, year:$('regional-year').value});
  const option = (text, value) => new win.Option(text, value);
  const cell = text => {const td=document.createElement('td');td.textContent=text;return td;};
  const stats = (years, year) => years?.[year] || null;
  // Keep the upstream fallback groups for unassigned farms and administrative units.
  const fallbackCity = province => province === '黑龙江省' ? '农垦系统（未划入地市）' : province === '新疆维吾尔自治区' ? '兵团团场（未划入地市）' : '未划入地市';
  const childCounties = (province, city) => Object.keys(snapshot.data.countyStat[province] || {})
    .filter(county => !city || (snapshot.data.countyCity[`${province}|${county}`] || fallbackCity(province)) === city);

  function updateCounties() {
    const {province,city}=state();
    $('regional-county').replaceChildren(option('全部区县',''),...childCounties(province,city).sort().map(name=>option(name,name)));
    $('regional-county').disabled=province==='全国';
  }
  function updateChildren() {
    const {province}=state();
    $('regional-city').replaceChildren(option('全部地市',''),...Object.keys(snapshot.data.cityStat[province]||{}).sort().map(name=>option(name,name)));
    $('regional-city').disabled=province==='全国';
    updateCounties();
  }
  function choose(row) {
    if(row.level==='province') {$('regional-province').value=row.name;updateChildren();}
    if(row.level==='city') {$('regional-city').value=row.name;updateCounties();}
    if(row.level==='county') $('regional-county').value=row.name;
    render();
  }
  function rowsForSelection() {
    const {province,city,county,year}=state(), d=snapshot.data;
    let items;
    if(county) items=[{name:county,values:stats(d.countyStat[province]?.[county],year),level:'county'}];
    else if(city) items=childCounties(province,city).map(name=>({name,values:stats(d.countyStat[province]?.[name],year),level:'county'}));
    else if(province!=='全国') {
      items=Object.entries(d.cityStat[province]||{}).map(([name,years])=>({name,values:stats(years,year),level:'city'}));
      if(!items.length) items=childCounties(province,'').map(name=>({name,values:stats(d.countyStat[province]?.[name],year),level:'county'}));
    } else items=d.meta.units.map(name=>({name,values:stats(d.statsYear[name],year),level:'province'}));
    return items.filter(row=>row.values).sort((a,b)=>b.values[1]-a.values[1]);
  }
  function currentStats() {
    const {province,city,county,year}=state(),d=snapshot.data;
    return stats(county?d.countyStat[province]?.[county]:city?d.cityStat[province]?.[city]:d.statsYear[province],year);
  }
  function currentMonths() {
    const {province,city,county,year}=state(),d=snapshot.data;
    const months=county?d.countyDetail[province]?.[county]?.month:city?d.cityDetail[province]?.[city]?.month:d.monthSeries[province];
    return Object.entries(months||{}).filter(([month])=>year==='all'||month.startsWith(year+'-')).sort(([a],[b])=>a.localeCompare(b));
  }
  function detail() {
    const {province,county,year}=state();
    $('regional-detail-panel').hidden=!county;
    if(!county) return;
    const d=snapshot.data,detail=d.countyDetail[province]?.[county];
    const groups=[['品目',detail?.cat?.[year]||[]],['厂家',detail?.fac?.[year]||[]],
      ['乡镇（原站公开TOP10）',(d.townOfCounty[province]?.[county]?.[year]||[]).map(([name,values])=>[name,values[0]])]];
    $('regional-detail').replaceChildren(...groups.map(([title,entries])=>{
      const section=document.createElement('section'),h=document.createElement('h3');h.textContent=title;section.append(h);
      if(!entries.length){const p=document.createElement('p');p.textContent='该年份暂无公开明细';section.append(p);}
      for(const [name,quantity] of entries){const p=document.createElement('p');p.textContent=`${name}：${number(quantity)} 台套`;section.append(p);}
      return section;
    }));
  }
  function chart(id) {
    if(!charts.has(id)) charts.set(id,win.echarts.init($(id)));
    return charts.get(id);
  }
  function drawCharts() {
    if(!win.echarts) return;
    const d=snapshot.data,{year}=state();
    if(!win.echarts.getMap('china')&&win.CHINA_GEO)win.echarts.registerMap('china',win.CHINA_GEO);
    if(win.echarts.getMap('china')){
      const map=chart('regional-map');
      const values=d.meta.units.map(name=>({name,value:stats(d.statsYear[name],year)?.[1]})).filter(row=>Number.isFinite(row.value));
      map.setOption({animation:false,tooltip:{formatter:p=>`${p.name}：${Number.isFinite(p.value)?number(p.value)+' 台套':'暂无公开数据'}`},
        visualMap:{min:0,max:Math.max(1,...values.map(r=>r.value)),inRange:{color:['#e6f4e8','#8bd294','#168d2a']},left:5,bottom:5},
        series:[{type:'map',map:'china',roam:true,itemStyle:{areaColor:'#edf5ee',borderColor:'#a3c4aa'},data:values}]});
      map.off('click');map.on('click',p=>{if(d.meta.units.includes(p.name))choose({level:'province',name:p.name});});
    }
    const months=monthRows.length?[...monthRows]:[];
    // Missing months stay null, rather than inventing zero sales.
    const ticks=[];
    if(months.length){let [year,month]=months[0][0].split('-').map(Number);const end=months.at(-1)[0];
      while(`${year}-${String(month).padStart(2,'0')}`<=end){ticks.push(`${year}-${String(month).padStart(2,'0')}`);if(++month===13){year++;month=1;}}}
    const lookup=new Map(months);
    chart('regional-month-chart').setOption({animation:false,tooltip:{trigger:'axis'},grid:{left:60,right:20,top:20,bottom:65},
      xAxis:{type:'category',data:ticks},yAxis:{type:'value'},dataZoom:[{type:'inside'},{type:'slider',height:18}],
      series:[{type:'line',data:ticks.map(month=>lookup.get(month)?.[0]??null),connectNulls:false,showSymbol:false,itemStyle:{color:'#168d2a'},areaStyle:{color:'#e6f4e8'}}]},true);
  }
  function render() {
    if(!snapshot)return;
    const {province,city,county,year}=state();
    $('regional-path').textContent=[province,city,county,year==='all'?'全部年份':`${year}年`].filter(Boolean).join(' / ');
    const values=currentStats();
    ['records','quantity','amount','subsidy'].forEach((id,i)=>{$('regional-'+id).textContent=values?number(values[i]):'暂无数据';});
    regionRows=rowsForSelection();monthRows=currentMonths();
    $('regional-count').textContent=`${regionRows.length}项`;
    $('regional-month-count').textContent=`${monthRows.length}个月份有记录`;
    $('regional-table-title').textContent=county?'所选区县':city?'下属区县':province!=='全国'?'下属地市（点击继续查看区县）':'省级明细（点击继续查看）';
    $('regional-rows').replaceChildren(...regionRows.map(row=>{
      const tr=document.createElement('tr'),td=cell(''),button=document.createElement('button');
      button.className='quiet regional-drill';button.textContent=row.name;button.onclick=()=>choose(row);td.append(button);
      tr.append(td,...row.values.slice(0,4).map(value=>cell(number(value))));return tr;
    }));
    $('regional-month-rows').replaceChildren(...monthRows.map(([month,values])=>{const tr=document.createElement('tr');tr.append(cell(month),...values.map(v=>cell(number(v))));return tr;}));
    for(const id of ['regional-rows','regional-month-rows'])if(!$(id).children.length){const tr=document.createElement('tr'),td=cell('当前筛选暂无公开记录');td.colSpan=id==='regional-rows'?5:3;tr.append(td);$(id).append(tr);}
    detail();drawCharts();for(const c of charts.values())c.resize();
  }
  function download(name, content, type) {
    const blob=new win.Blob([content],{type}),url=win.URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;a.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);
  }
  function csv(name, rows) {
    const quote=value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
    download(name,'\ufeff'+rows.map(row=>row.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  }
  $('regional-province').onchange=()=>{updateChildren();render();};
  $('regional-city').onchange=()=>{updateCounties();render();};
  $('regional-county').onchange=render;$('regional-year').onchange=render;
  $('regional-reset').onclick=()=>{$('regional-province').value='全国';$('regional-year').value='all';updateChildren();render();};
  $('regional-export').onclick=()=>csv('区域明细_原站全品目.csv',[
    ['统计口径',snapshot.scope],['来源数据时间',snapshot.generated],['所选范围',$('regional-path').textContent],
    ['区域','购机记录数','台套数','销售额（元）','补贴额（元）'],...regionRows.map(row=>[row.name,...row.values.slice(0,4)])]);
  $('regional-month-export').onclick=()=>csv('月度明细_原站全品目.csv',[
    ['统计口径',snapshot.scope],['来源数据时间',snapshot.generated],['所选范围',$('regional-path').textContent],
    ['购机月份','台套数','销售额（元）'],...monthRows.map(([month,values])=>[month,...values])]);
  $('regional-source-export').onclick=()=>download('原站完整汇总数据.json',JSON.stringify(snapshot),'application/json');
  win.addEventListener('resize',()=>{for(const c of charts.values())c.resize();});
  return {
    async open(expectedGeneration) {
      if (snapshot && snapshot.generated === expectedGeneration) {render(); return;}
      $('regional-status').textContent='正在读取原站完整汇总数据…';
      const records=await request('/rest/v1/nav_snapshots?id=eq.reference&select=payload,updated_at');
      if(!records.length)throw new Error('区域数据尚未同步完成，请稍后重试');
      const previous=state();snapshot=await unpackReference(records[0].payload);
      if(!snapshot.data?.countyStat||!snapshot.data?.monthSeries)throw new Error('区域数据格式异常');
      $('regional-province').replaceChildren(option('全国','全国'),...snapshot.data.meta.units.map(name=>option(name,name)));
      $('regional-year').replaceChildren(option('全部年份','all'),...snapshot.data.meta.years.map(year=>option(`${year}年`,String(year))));
      if(snapshot.data.meta.units.includes(previous.province))$('regional-province').value=previous.province;
      if(snapshot.data.meta.years.includes(Number(previous.year)))$('regional-year').value=previous.year;
      updateChildren();
      if([...$('regional-city').options].some(o=>o.value===previous.city)){$('regional-city').value=previous.city;updateCounties();}
      if([...$('regional-county').options].some(o=>o.value===previous.county))$('regional-county').value=previous.county;
      const counties=Object.values(snapshot.data.countyStat).reduce((n,list)=>n+Object.keys(list).length,0);
      $('regional-status').textContent=`来源数据 ${snapshot.generated} · 最近同步 ${new Date(snapshot.checkedAt).toLocaleString('zh-CN')} · ${snapshot.data.meta.units.length}个省级单元 / ${counties}个区县`;
      render();
    },
    clear() {snapshot=null;regionRows=[];monthRows=[];$('regional-rows').replaceChildren();$('regional-month-rows').replaceChildren();$('regional-detail').replaceChildren();for(const c of charts.values())c.clear();}
  };
}
