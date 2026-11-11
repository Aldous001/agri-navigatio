const $ = id => document.getElementById(id);
const config = window.APP_CONFIG;
let session = null;
let snapshot = null;
let page = 0;
let view = 'overview';
const pageSize = 20;
const number = value => Number(value || 0).toLocaleString('zh-CN', {maximumFractionDigits: 1});

async function request(path, options = {}) {
  const response = await fetch(config.supabaseUrl.replace(/\/$/, '') + path, {
    ...options,
    headers: {apikey: config.publishableKey, 'Content-Type': 'application/json',
      ...(session ? {Authorization: `Bearer ${session.access_token}`} : {}), ...options.headers}
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.msg || body?.message || body?.error_description || `请求失败 ${response.status}`);
  return body;
}

function clearWorkspace(message = '') {
  session = null;
  snapshot = null;
  sessionStorage.removeItem('nav-session');
  $('rows').replaceChildren();
  $('workspace').hidden = true;
  $('login').hidden = false;
  $('login-message').textContent = message;
}

async function load() {
  const user = await request('/auth/v1/user');
  const records = await request('/rest/v1/nav_snapshots?id=eq.current&select=payload,updated_at');
  if (!records.length) throw new Error('账号尚未获准访问，或管理员尚未上传数据，请联系管理员。');
  snapshot = records[0].payload;
  if (!Array.isArray(snapshot.models) || !Array.isArray(snapshot.years)) throw new Error('数据格式异常，请联系管理员。');
  $('user-email').textContent = user.email.includes('@accounts.agri-navigation.invalid') ? '已登录' : user.email;
  const admins = await request('/rest/v1/nav_admins?select=user_id');
  $('manage-accounts').hidden = !admins.length;
  $('updated').textContent = `数据快照 ${snapshot.generated} · 最近上传 ${new Date(records[0].updated_at).toLocaleString('zh-CN')}`;
  $('notice').textContent = snapshot.notice;
  $('source-note').textContent = snapshot.sourceNote;
  $('verified-date').textContent = snapshot.verifiedDate;
  $('year').replaceChildren(new Option('全部年份', 'all'), ...snapshot.years.map(y => new Option(`${y} 年`, y)));
  const makers = [...new Set(snapshot.models.map(m => m.factory))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  $('maker').replaceChildren(new Option('全部厂家', 'all'), ...makers.map(m => new Option(m, m)));
  $('login').hidden = true;
  $('workspace').hidden = false;
  render();
}

function quantity(model) {
  return $('year').value === 'all' ? model.quantity : model.yearly?.[String($('year').value)] || 0;
}
function filtered() {
  const query = $('query').value.trim().toLowerCase();
  return snapshot.models.filter(m => (m.factory + ' ' + m.model).toLowerCase().includes(query)
    && ($('maker').value === 'all' || m.factory === $('maker').value)
    && ($('year').value === 'all' || quantity(m) > 0));
}
function cell(text) { const td = document.createElement('td'); td.textContent = text; return td; }
function safeLink(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' ? parsed.href : null; } catch { return null; }
}
function render() {
  const models = filtered().sort((a, b) => quantity(b) - quantity(a));
  const count = models.length;
  page = Math.min(page, Math.max(0, Math.ceil(count / pageSize) - 1));
  $('model-count').textContent = number(count);
  $('maker-count').textContent = number(new Set(models.map(m => m.factory)).size);
  $('quantity').textContent = number(models.reduce((sum, m) => sum + quantity(m), 0));
  $('quantity-note').textContent = snapshot.quantityLabel;
  $('result-count').textContent = `共 ${count} 个型号条目`;
  $('overview-view').hidden = view !== 'overview';
  const rows = models.slice(page * pageSize, (page + 1) * pageSize).map(m => {
    const tr = document.createElement('tr');
    tr.append(cell(m.factory), cell(m.model), cell(number(quantity(m))));
    const source = cell('');
    const href = safeLink(m.sourceUrl);
    if (href) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = m.sourceTitle || '查看资料'; source.append(a); }
    tr.append(source, cell(m.note || ''));
    return tr;
  });
  if (!rows.length) { const tr = document.createElement('tr'); const td = cell('没有匹配的型号，请调整筛选条件。'); td.colSpan = 5; tr.append(td); rows.push(tr); }
  $('rows').replaceChildren(...rows);
  $('page-number').textContent = `${page + 1} / ${Math.max(1, Math.ceil(count / pageSize))}`;
  $('previous').disabled = page === 0;
  $('next').disabled = (page + 1) * pageSize >= count;
  renderCharts(models);
}

function renderCharts(models) {
  try { renderScreenCharts(models); }
  catch (error) { $('map-title').textContent = '地图加载失败，请刷新页面重试'; console.error(error); }
  const regions = new Map();
  for (const model of models) for (const region of model.regions || []) regions.set(region.name, (regions.get(region.name) || 0) + region.quantity);
  const ranked = [...regions].sort((a,b) => b[1] - a[1]).slice(0, 8);
  const max = ranked[0]?.[1] || 1;
  $('regions').replaceChildren(...ranked.map(([name, value]) => {
    const row = document.createElement('div'); row.className = 'bar-row';
    const label = document.createElement('span'); label.textContent = name;
    const track = document.createElement('div'); track.className = 'bar-track';
    const bar = document.createElement('div'); bar.className = 'bar-fill'; bar.style.width = `${value / max * 100}%`; track.append(bar);
    const amount = document.createElement('span'); amount.textContent = number(value); row.append(label, track, amount); return row;
  }));
  if ($('year').value !== 'all') $('regions').textContent = '现有公开索引仅提供累计主要省份分布，选择全部年份后可查看。';
  const totals = snapshot.years.map(y => models.reduce((sum, m) => sum + (m.yearly?.[String(y)] || 0), 0));
  const highest = Math.max(...totals, 1);
  $('trend').replaceChildren(...snapshot.years.map((y, i) => {
    const group = document.createElement('div'); group.className = 'year-bar';
    const label = document.createElement('b'); label.textContent = number(totals[i]);
    const bar = document.createElement('div'); bar.style.height = `${totals[i] / highest * 75}%`;
    const year = document.createElement('span'); year.textContent = y; group.append(label, bar, year); return group;
  }));
}

const screenCharts = new Map();
function renderScreenCharts(models) {
  if (!window.echarts) { $('map-title').textContent = '图表组件未加载，请检查网络后刷新'; return; }
  if (!echarts.getMap('china') && window.CHINA_GEO) echarts.registerMap('china', window.CHINA_GEO);
  const chart = id => {
    if (!screenCharts.has(id)) screenCharts.set(id, echarts.init($(id)));
    return screenCharts.get(id);
  };
  function ranking(id, entries) {
    const rows = entries.slice(0, 10).reverse();
    chart(id).setOption({animation:false,tooltip:{trigger:'axis'},grid:{left:130,right:45,top:4,bottom:4},xAxis:{type:'value',show:false},yAxis:{type:'category',data:rows.map(r=>r[0]),axisLine:{show:false},axisTick:{show:false},axisLabel:{color:'#647d6a',fontSize:10,width:124,overflow:'truncate'}},series:[{type:'bar',data:rows.map(r=>r[1]),barWidth:8,itemStyle:{color:'#50b957'},label:{show:true,position:'right',color:'#2e4b36',fontSize:10}}]});
  }
  ranking('model-ranking',models.map(m=>[m.model,quantity(m)]).sort((a,b)=>b[1]-a[1]));
  const makers = new Map();
  for (const m of models) makers.set(m.factory,(makers.get(m.factory)||0)+1);
  ranking('maker-ranking',[...makers].sort((a,b)=>b[1]-a[1]));
  const regions = new Map();
  if ($('year').value === 'all') for (const m of models) for (const r of m.regions||[]) regions.set(r.name,(regions.get(r.name)||0)+r.quantity);
  const map=chart('navigation-map');
  map.setOption({animation:false,tooltip:{formatter:p=>`${p.name} ${Number.isFinite(p.value)?number(p.value):'暂无省份数据'}`},visualMap:{min:0,max:Math.max(1,...regions.values()),left:8,bottom:5,text:['高','低'],textStyle:{color:'#647d6a'},inRange:{color:['#e6f4e8','#8bd294','#50b957']},calculable:false,itemHeight:80},series:[{type:'map',map:'china',roam:true,label:{show:false},itemStyle:{areaColor:'#edf5ee',borderColor:'#a3c4aa',borderWidth:.7},emphasis:{label:{color:'#164f23'},itemStyle:{areaColor:'#00b61d'}},data:[...regions].map(([name,value])=>({name,value}))}]});
  map.off('click');map.on('click',p=>{$('map-title').textContent=`${p.name} · 公开主要省份累计量 ${Number.isFinite(p.value)?number(p.value):'暂无数据'}`;});
  $('map-reset').onclick=()=>{map.dispatchAction({type:'restore'});$('map-title').textContent='全国 · 导航型号主要省份分布';};
}
function fitScreen(){for(const c of screenCharts.values())c.resize();}
window.addEventListener('resize',fitScreen);
new ResizeObserver(fitScreen).observe($('screen-stage'));
fitScreen();

$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('login-button').disabled = true; $('login-message').textContent = '正在验证账号…';
  try {
    if (!config.supabaseUrl || !config.publishableKey) throw new Error('管理员尚未完成账号服务配置。');
    session = await request('/functions/v1/navigation-login', {method:'POST', body: JSON.stringify({username:$('username').value.trim(), password:$('password').value})});
    await load(); sessionStorage.setItem('nav-session', JSON.stringify(session)); $('password').value = '';
  } catch (error) { clearWorkspace(error.message); } finally { $('login-button').disabled = false; }
});
$('logout').addEventListener('click', async () => { try { await request('/auth/v1/logout', {method:'POST'}); } finally { clearWorkspace(); } });
for (const id of ['query','year','maker']) $(id).addEventListener(id === 'query' ? 'input' : 'change', () => {page = 0; render();});
$('reset').onclick = () => { $('query').value = ''; $('year').value = 'all'; $('maker').value = 'all'; page = 0; render(); };
$('previous').onclick = () => {page--; render();}; $('next').onclick = () => {page++; render();};
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => {view = button.dataset.view; document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b === button)); $('page-title').textContent = view === 'overview' ? '农机导航市场概览' : '导航厂家与型号查询'; render();});
$('export').onclick = () => {
  const escape = value => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
  const rows = [['厂家名称','型号','型号台套数','核查依据','说明'], ...filtered().map(m => [m.factory,m.model,quantity(m),m.sourceUrl,m.note])];
  const blob = new Blob(['\ufeff' + rows.map(row => row.map(escape).join(',')).join('\r\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `农机导航_${$('year').value}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('change-password').onclick = () => {$('password-message').textContent = ''; $('password-dialog').showModal();};
$('close-dialog').onclick = () => $('password-dialog').close();
$('password-form').onsubmit = async event => {
  event.preventDefault();
  try {await request('/auth/v1/user', {method:'PUT',body:JSON.stringify({password:$('new-password').value})}); $('new-password').value = ''; $('password-message').textContent = '密码已修改。';}
  catch(error) {$('password-message').textContent = error.message;}
};
const saved = sessionStorage.getItem('nav-session');
if (saved && config.supabaseUrl && config.publishableKey) {
  try {const previous = JSON.parse(saved); session = await request('/auth/v1/token?grant_type=refresh_token', {method:'POST',body:JSON.stringify({refresh_token:previous.refresh_token})}); await load(); sessionStorage.setItem('nav-session',JSON.stringify(session));}
  catch {clearWorkspace('登录已过期，请重新登录。');}
}
setInterval(async () => {
  if (!session) return;
  try {session = await request('/auth/v1/token?grant_type=refresh_token', {method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})}); await load(); sessionStorage.setItem('nav-session',JSON.stringify(session));}
  catch {clearWorkspace('会话已失效，请重新登录。');}
}, 20 * 60 * 1000);

let accountUsers = [];
async function refreshAccounts(){
 const result = await request('/functions/v1/navigation-accounts',{method:'POST',body:JSON.stringify({action:'list'})});
 accountUsers = result.users;
 $('account-select').replaceChildren(new Option('创建新账号',''), ...accountUsers.map(u=>new Option(u.username+(u.enabled?'':'（已停用）'),u.user_id)));
 $('account-form').reset();$('account-enabled').checked=true;
}
$('manage-accounts').onclick=async()=>{
 $('accounts-dialog').showModal();$('accounts-message').textContent='正在读取账号…';
 try{await refreshAccounts();$('accounts-message').textContent='新账号密码至少12位。';}catch(e){$('accounts-message').textContent=e.message;}
};
$('accounts-close').onclick=()=>{$('account-password').value='';$('accounts-dialog').close();};
$('account-select').onchange=()=>{
 const user=accountUsers.find(u=>u.user_id===$('account-select').value);
 $('account-username').value=user?.username||'';$('account-password').value='';$('account-enabled').checked=user?.enabled??true;
 $('account-username').disabled=!!user?.self;$('account-enabled').disabled=!!user?.self;
};
$('account-form').onsubmit=async event=>{
 event.preventDefault();$('account-save').disabled=true;
 const id=$('account-select').value;
 if(!id&&!$('account-password').value){$('accounts-message').textContent='请输入新账号密码';$('account-save').disabled=false;return;}
 try{
  await request('/functions/v1/navigation-accounts',{method:'POST',body:JSON.stringify({action:id?'update':'create',user_id:id,username:$('account-username').value,password:$('account-password').value,enabled:$('account-enabled').checked})});
  await refreshAccounts();$('accounts-message').textContent='账号已保存';
 }catch(e){$('accounts-message').textContent=e.message;}
 finally{$('account-save').disabled=false;}
};
