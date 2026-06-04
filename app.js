// ─── Constants ───────────────────────────────────────────────
const CLUBS  = ['Driver','3 Wood','4 Hybrid','5 Iron','6 Iron','7 Iron','8 Iron','9 Iron','PW','GW','SW'];
const FIELDS = ['carry','speed','hang','apex','curve'];
const META = {
  carry: { label:'Carry Distance', unit:'dist',   bar:'#34D399' },
  speed: { label:'Ball Speed',     unit:'speed',  bar:'#7B6EFF' },
  hang:  { label:'Hang Time',      unit:'hang',   bar:'#F59E0B' },
  apex:  { label:'Apex Height',    unit:'height', bar:'#06B6D4' },
  curve: { label:'Curve',          unit:'curve',  bar:'#FF3EA5', isCurve:true },
};
const LS_SHOTS = 'tl_v2';
const LS_THEME = 'tl_theme';
const LS_UNITS = 'tl_units';

// ─── State ────────────────────────────────────────────────────
const S = {
  club:'Driver', lie:'tee', focus:'carry', tab:'all',
  vals:{ carry:'', speed:'', hang:'', apex:'', curve:'' },
  shots:[], editingId:null,
  theme:'orbital', metric:false, pendingDelete:null,
};

// ─── Boot ─────────────────────────────────────────────────────
(function boot(){
  migrateAndLoad();
  S.theme  = localStorage.getItem(LS_THEME) || 'orbital';
  S.metric = localStorage.getItem(LS_UNITS) === '1';
  applyTheme(S.theme, false);
  setFocus('carry'); setLie('tee'); setTab('all');
  renderAll();
})();

// ─── Migration + Normalization ────────────────────────────────
function migrateAndLoad(){
  let shots = [];
  const seen = new Set();

  try {
    const a = JSON.parse(localStorage.getItem('tl_v2') || '[]');
    if (Array.isArray(a)) a.forEach(s => { if (!seen.has(s.id)){ seen.add(s.id); shots.push(s); }});
  } catch(_){}

  try {
    const b = JSON.parse(localStorage.getItem('tactical_launch_history') || '[]');
    if (Array.isArray(b)) b.forEach(s => { if (!seen.has(s.id)){ seen.add(s.id); shots.push(s); }});
  } catch(_){}

  S.shots = shots.map(normalizeShot).sort((a,b) => b.ts - a.ts);
  localStorage.setItem(LS_SHOTS, JSON.stringify(S.shots));
}

function normalizeShot(s){
  const n = v => { const f = parseFloat(v); return (!isNaN(f) && v != null) ? f : null; };

  let club = (s.club || 'Driver').replace(/-/g, ' ');
  if (!CLUBS.includes(club)){
    const m = CLUBS.find(c => c.toLowerCase() === club.toLowerCase());
    club = m || 'Driver';
  }

  let ts = s.ts;
  if (!ts || isNaN(ts)){
    if (s.timestamp){ const p = new Date(s.timestamp).getTime(); ts = isNaN(p) ? Date.now() : p; }
    else { ts = s.id || Date.now(); }
  }

  return {
    id:    s.id ?? Date.now(),
    ts:    Number(ts),
    club,
    lie:   s.lie   || 'tee',
    carry: n(s.carry  ?? s.distance    ?? s.carryDistance ?? s.yards),
    speed: n(s.speed  ?? s.ballSpeed   ?? s.mph           ?? s.velocity),
    hang:  n(s.hang   ?? s.hangtime    ?? s.hangTime      ?? s.airTime),
    apex:  n(s.apex   ?? s.height      ?? s.peakHeight    ?? s.maxHeight),
    curve: n(s.curve  ?? s.deviation   ?? s.lateral),
  };
}

function save(){ localStorage.setItem(LS_SHOTS, JSON.stringify(S.shots)); }

// ─── Unit Conversion ──────────────────────────────────────────
function applyUnit(val, type){
  if (!S.metric) return val;
  if (type==='dist'||type==='curve') return val * 0.9144;
  if (type==='speed')  return val * 1.60934;
  if (type==='height') return val * 0.3048;
  return val;
}
function unitLabel(type){
  if (!S.metric){
    if (type==='dist'||type==='curve') return 'YDS';
    if (type==='speed')  return 'MPH';
    if (type==='height') return 'FT';
    if (type==='hang')   return 'SEC';
  } else {
    if (type==='dist'||type==='curve') return 'M';
    if (type==='speed')  return 'KPH';
    if (type==='height') return 'M';
    if (type==='hang')   return 'SEC';
  }
  return '';
}
function dispVal(val, type){
  if (val == null || isNaN(val)) return '--';
  return applyUnit(val, type).toFixed(1);
}
function fmtCurveMax(v, type){
  if (v == null) return '--';
  const abs = applyUnit(Math.abs(v), type||'curve').toFixed(1);
  return v>0 ? `R ${abs}` : v<0 ? `L ${abs}` : '0';
}

function toggleUnits(){
  S.metric = !S.metric;
  localStorage.setItem(LS_UNITS, S.metric ? '1' : '0');
  updateUnitToggleUI();
  updateMetricUnitLabels();
  renderStats(); renderFeed();
}
function updateUnitToggleUI(){
  const label = S.metric ? 'METRIC' : 'US';
  const oBtn = document.getElementById('o-unitToggle');
  const cBtn = document.getElementById('c-unitToggle');
  if (oBtn) oBtn.textContent = label;
  if (cBtn){
    cBtn.textContent = 'VIEW: ' + label;
    cBtn.style.background = S.metric ? 'rgba(16,185,129,.1)'  : 'rgba(99,102,241,.1)';
    cBtn.style.color       = S.metric ? '#10B981'              : '#6366F1';
    cBtn.style.borderColor = S.metric ? 'rgba(16,185,129,.2)' : 'rgba(99,102,241,.2)';
  }
}
function updateMetricUnitLabels(){
  const o = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
  o('o-unit-carry', unitLabel('dist'));
  o('o-unit-speed', unitLabel('speed'));
  o('o-unit-apex',  unitLabel('height'));
  o('o-unit-curve', unitLabel('curve') + ' ± L/R');
  o('c-unit-carry', unitLabel('dist'));
  o('c-unit-speed', unitLabel('speed'));
  o('c-unit-apex',  unitLabel('height'));
  o('c-unit-curve', unitLabel('curve'));
}

// ─── Theme System ─────────────────────────────────────────────
function applyTheme(name, rerender=true){
  S.theme = name;
  localStorage.setItem(LS_THEME, name);
  document.getElementById('theme-orbital').classList.toggle('hidden', name !== 'orbital');
  document.getElementById('theme-classic').classList.toggle('hidden', name !== 'classic');
  const oOpt = document.getElementById('theme-opt-orbital');
  const cOpt = document.getElementById('theme-opt-classic');
  if(oOpt) oOpt.style.borderColor = name==='orbital' ? '#38BDF8' : '#1C1E32';
  if(cOpt) cOpt.style.borderColor = name==='classic' ? '#10B981' : '#2D2D34';
  if (rerender) renderAll();
}
function switchTheme(name){ applyTheme(name); closeThemeModal(); }

// ─── Club Selector ────────────────────────────────────────────
function buildClubs(){
  orbital_buildClubs(); classic_buildClubs();
}
function selectClub(c){
  S.club = c; buildClubs(); renderStats();
  const oa = document.getElementById('o-analyticsClub');
  if (oa) oa.textContent = c.toUpperCase();
  document.getElementById('c-statsHeading').textContent = c.toUpperCase() + ' PERFORMANCE';
}

function orbital_buildClubs(){
  const bar = document.getElementById('o-clubBar');
  if (!bar) return;
  bar.innerHTML = CLUBS.map(c => {
    const a = c===S.club;
    return `<button class="o-chip${a?' on':''} px-4 py-2 rounded-full border text-xs font-black tracking-wider"
      style="${a
        ? 'background:#38BDF8;color:#07080E;border-color:#38BDF8;'
        : 'background:#0D0E19;color:#4E5275;border-color:#1C1E32;'}"
      onclick="selectClub('${c}')">${c}</button>`;
  }).join('');
}
function classic_buildClubs(){
  const bar = document.getElementById('c-clubBar');
  if (!bar) return;
  bar.innerHTML = CLUBS.map(c => {
    const a = c===S.club;
    return `<button class="c-kb c-tech shrink-0 text-xs font-bold tracking-wider px-4 py-2.5 rounded-xl border transition"
      style="${a
        ? 'background:#10B981;color:#121214;border-color:#10B981;box-shadow:0 2px 8px rgba(16,185,129,.15);'
        : 'background:#1E1E22;color:rgba(228,228,231,.7);border-color:#2D2D34;'}"
      onclick="selectClub('${c}')">${c.toUpperCase()}</button>`;
  }).join('');
}

// ─── Focus ────────────────────────────────────────────────────
function setFocus(f){
  S.focus = f;
  orbital_applyFocus(f); classic_applyFocus(f);
}
function orbital_applyFocus(f){
  FIELDS.forEach(k => {
    const el = document.getElementById(`o-box-${k}`);
    if (el) el.classList.toggle('on', k===f);
  });
  const mb = document.getElementById('o-minusBtn');
  if (mb){
    mb.style.color = f==='curve' ? '#FF5500' : '#252840';
    mb.style.borderColor = f==='curve' ? 'rgba(255,85,0,.35)' : '#1C1E32';
    mb.style.pointerEvents = f==='curve' ? 'auto' : 'none';
  }
}
function classic_applyFocus(f){
  FIELDS.forEach(k => {
    const el = document.getElementById(`c-box-${k}`);
    if (!el) return;
    const lbl = el.querySelector('[id^="c-lbl-"]') || el.querySelector('span');
    if (k===f){
      el.style.borderColor = '#6366F1';
      if (lbl) lbl.style.color = '#6366F1';
    } else {
      el.style.borderColor = 'transparent';
      if (lbl) lbl.style.color = 'rgba(228,228,231,.4)';
    }
  });
  const mb = document.getElementById('c-minusBtn');
  if (mb){
    mb.style.color = f==='curve' ? '#6366F1' : 'rgba(228,228,231,.3)';
    mb.style.pointerEvents = f==='curve' ? 'auto' : 'none';
  }
}

// ─── Display refresh ──────────────────────────────────────────
function refreshVal(f){
  const v = S.vals[f];
  const oel = document.getElementById(`o-val-${f}`);
  if (oel) oel.textContent = v==='' ? '—' : v==='-' ? '−' : v;
  const cel = document.getElementById(`c-val-${f}`);
  if (cel) cel.textContent = v || '0';
}

// ─── Keypad ───────────────────────────────────────────────────
function kp(key){
  const f = S.focus; let v = S.vals[f];
  switch(key){
    case 'back': v = v.slice(0,-1); break;
    case 'clr':  v = ''; break;
    case '-':
      if (f!=='curve') return;
      v = v.startsWith('-') ? v.slice(1) : '-'+v;
      break;
    case '.':
      if (v.includes('.')) return;
      v = (v===''||v==='-') ? v+'0.' : v+'.';
      break;
    default:{
      if (v==='0'){v=key;break;} if (v==='-0'){v='-'+key;break;}
      if (v.replace(/[^\d]/g,'').length>=5) return;
      v = v+key;
    }
  }
  S.vals[f]=v; refreshVal(f);
}

// ─── Lie Toggle ───────────────────────────────────────────────
function setLie(lie){
  S.lie=lie; orbital_setLie(lie); classic_setLie(lie);
}
function orbital_setLie(lie){
  const t=document.getElementById('o-btn-lie-tee');
  const g=document.getElementById('o-btn-lie-grass');
  if(!t||!g) return;
  if(lie==='tee'){
    t.style.background='#3B82F6'; t.style.color='#fff'; t.style.border='none';
    g.style.background='#141526'; g.style.color='#4E5275'; g.style.border='1.5px solid #1C1E32';
  } else {
    g.style.background='#4ADE80'; g.style.color='#07080E'; g.style.border='none';
    t.style.background='#141526'; t.style.color='#4E5275'; t.style.border='1.5px solid #1C1E32';
  }
}
function classic_setLie(lie){
  const t=document.getElementById('c-btn-lie-tee');
  const g=document.getElementById('c-btn-lie-grass');
  if(!t||!g) return;
  if(lie==='tee'){
    t.style.borderColor='#3B82F6'; t.style.background='rgba(59,130,246,.1)'; t.style.color='#3B82F6';
    g.style.borderColor='#2D2D34'; g.style.background='#121214'; g.style.color='rgba(228,228,231,.6)';
  } else {
    g.style.borderColor='#4ADE80'; g.style.background='rgba(74,222,128,.1)'; g.style.color='#4ADE80';
    t.style.borderColor='#2D2D34'; t.style.background='#121214'; t.style.color='rgba(228,228,231,.6)';
  }
}

// ─── Submit State ─────────────────────────────────────────────
function setSubmitState(editing){
  const oSub = document.getElementById('o-submitBtn');
  const oCan = document.getElementById('o-cancelBtn');
  const oBdg = document.getElementById('o-editBadge');
  if(oSub) oSub.textContent = editing ? 'UPDATE SHOT' : 'LOG SHOT';
  if(oCan) oCan.classList.toggle('hidden', !editing);
  if(oBdg) oBdg.classList.toggle('hidden', !editing);

  const cSub = document.getElementById('c-submitBtn');
  const cCan = document.getElementById('c-cancelBtn');
  const cBdg = document.getElementById('c-editBadge');
  if(cSub){
    if(editing){
      cSub.textContent='Update Shot';
      cSub.style.background='#6366F1'; cSub.style.color='#fff'; cSub.style.flex='1';
      cSub.style.boxShadow='0 4px 12px rgba(99,102,241,.2)';
    } else {
      cSub.textContent='Log Shot';
      cSub.style.background='#10B981'; cSub.style.color='#121214'; cSub.style.flex='1';
      cSub.style.boxShadow='0 4px 12px rgba(16,185,129,.15)';
    }
  }
  if(cCan) cCan.classList.toggle('hidden', !editing);
  if(cBdg) cBdg.classList.toggle('hidden', !editing);
}

// ─── Shot CRUD ────────────────────────────────────────────────
function submitShot(){
  const carry = parseFloat(S.vals.carry);
  const speed = parseFloat(S.vals.speed);
  if (!S.vals.carry||isNaN(carry)){ toast('Carry distance required','err'); return; }
  if (!S.vals.speed||isNaN(speed)){ toast('Ball speed required','err'); return; }
  const n = k => (S.vals[k]&&S.vals[k]!=='-') ? parseFloat(S.vals[k]) : null;

  const shot = {
    id:    S.editingId ?? Date.now(),
    ts:    S.editingId ? (S.shots.find(s=>s.id===S.editingId)?.ts ?? Date.now()) : Date.now(),
    club:  S.club, lie:S.lie,
    carry, speed,
    hang:  n('hang'), apex:n('apex'), curve:n('curve'),
  };

  if (S.editingId !== null){
    const i = S.shots.findIndex(s=>s.id===S.editingId);
    if (i>-1) S.shots[i]=shot;
    save(); renderAll(); toast('Shot updated','ok'); cancelEdit();
  } else {
    S.shots.unshift(shot);
    save(); renderAll(); toast('Shot logged','ok'); clearInputs();
  }
}

function clearInputs(){
  FIELDS.forEach(f=>{S.vals[f]=''; refreshVal(f);}); setFocus('carry');
}

function editShot(id){
  const s = S.shots.find(x=>x.id===id); if(!s) return;
  S.editingId = id;
  S.vals.carry = String(s.carry??''); S.vals.speed = String(s.speed??'');
  S.vals.hang  = s.hang  !=null ? String(s.hang)  : '';
  S.vals.apex  = s.apex  !=null ? String(s.apex)  : '';
  S.vals.curve = s.curve !=null ? String(s.curve) : '';
  FIELDS.forEach(f=>refreshVal(f));
  selectClub(s.club); setLie(s.lie); setFocus('carry');
  setSubmitState(true);
  renderFeed();
  window.scrollTo({top:0,behavior:'smooth'});
}

function cancelEdit(){
  S.editingId=null; clearInputs(); setSubmitState(false); renderFeed();
}

function requestDelete(id){
  S.pendingDelete=id;
  document.getElementById('deleteModal').classList.add('open');
}
function confirmDelete(){
  const id=S.pendingDelete;
  if (id!=null){
    S.shots=S.shots.filter(s=>s.id!==id);
    if (S.editingId===id) cancelEdit();
    save(); renderAll(); toast('Shot deleted','err');
  }
  closeDeleteModal();
}

// ─── Analytics ────────────────────────────────────────────────
function setTab(tab){
  S.tab=tab;
  ['all','tee','grass'].forEach(t=>{
    const oel=document.getElementById(`o-tab-${t}`);
    if(oel){ oel.style.background=t===tab?'#141526':'transparent'; oel.style.color=t===tab?'#fff':'#4E5275'; }
    const cel=document.getElementById(`c-tab-${t}`);
    if(cel){
      cel.style.background=t===tab?'#2D2D34':'transparent';
      cel.style.color=t===tab?'#10B981':'rgba(228,228,231,.5)';
    }
  });
  renderStats();
}

function filteredShots(){
  return S.shots.filter(s=>{
    if(s.club!==S.club) return false;
    if(S.tab==='tee')   return s.lie==='tee';
    if(S.tab==='grass') return s.lie==='grass';
    return true;
  });
}

function calcStats(shots){
  const r={};
  FIELDS.forEach(f=>{
    const vals=shots.map(s=>s[f]).filter(v=>v!=null&&!isNaN(v));
    if(!vals.length){r[f]=null;return;}
    const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
    let best;
    if(f==='curve'){const ma=Math.max(...vals.map(Math.abs)); best=vals.find(v=>Math.abs(v)===ma)??0;}
    else { best=Math.max(...vals); }
    r[f]={avg,best,n:vals.length};
  });
  return r;
}

function renderStats(){ orbital_renderStats(); classic_renderStats(); }

function orbital_renderStats(){
  const oa = document.getElementById('o-analyticsClub');
  if(oa) oa.textContent = S.club.toUpperCase();
  const shots=filteredShots(), stats=calcStats(shots);
  const g=document.getElementById('o-statsGrid'); if(!g) return;
  if(!shots.length){
    const lbl=S.tab==='all'?'all lies':S.tab==='tee'?'off tee':'off grass';
    g.innerHTML=`<p class="text-sm text-center py-4 font-semibold" style="color:#252840;">
      No ${S.club} (${lbl}) shots yet.</p>`;
    return;
  }
  g.innerHTML = FIELDS.map(f=>{
    const m=META[f], s=stats[f];
    if(!s) return `
      <div class="flex items-center justify-between py-2">
        <span class="text-xs font-black tracking-widest" style="color:${m.bar};">
          ${m.label.toUpperCase()} <span style="color:#252840;font-weight:500;">${unitLabel(m.unit)}</span>
        </span>
        <span class="o-num text-xs" style="color:#252840;">No data</span>
      </div>`;
    const avgFmt = m.isCurve ? fmtCurveMax(s.avg,m.unit) : dispVal(s.avg,m.unit);
    const bstFmt = m.isCurve ? fmtCurveMax(s.best,m.unit) : dispVal(s.best,m.unit);
    const denom  = m.isCurve ? Math.abs(s.best) : s.best;
    const numer  = m.isCurve ? Math.abs(s.avg)  : s.avg;
    const pct    = denom ? Math.min(100,(numer/denom)*100) : 100;
    return `
      <div class="py-3 border-b last:border-0" style="border-color:#1C1E32;">
        <div class="flex items-center justify-between mb-2.5">
          <span class="text-xs font-black tracking-widest" style="color:${m.bar};">
            ${m.label.toUpperCase()} <span style="color:#252840;font-weight:500;">${unitLabel(m.unit)}</span>
          </span>
          <span class="o-num text-xs" style="color:#252840;">${s.n} shot${s.n!==1?'s':''}</span>
        </div>
        <div class="flex items-center gap-3">
          <div style="min-width:48px;text-align:right;">
            <p class="o-num text-base font-bold text-white">${avgFmt}</p>
            <p class="text-xs font-black tracking-wider" style="color:#4E5275;">AVG</p>
          </div>
          <div class="flex-1 o-bartrack">
            <div class="o-barfill" style="width:${pct.toFixed(1)}%;background:${m.bar};opacity:.85;"></div>
          </div>
          <div style="min-width:48px;">
            <p class="o-num text-base font-bold" style="color:${m.bar};">${bstFmt}</p>
            <p class="text-xs font-black tracking-wider" style="color:#4E5275;">${m.isCurve?'DEV':'BEST'}</p>
          </div>
        </div>
      </div>`;
  }).join('');
}

function classic_renderStats(){
  const sh = document.getElementById('c-statsHeading');
  const sb = document.getElementById('c-shotBadge');
  if(sh) sh.textContent = S.club.toUpperCase()+' PERFORMANCE';
  const shots=filteredShots(), stats=calcStats(shots);
  if(sb) sb.textContent = `${shots.length} ${shots.length===1?'SHOT':'SHOTS'}`;
  const g=document.getElementById('c-statsGrid'); if(!g) return;
  if(!shots.length){
    g.innerHTML=`<div class="text-xs text-center py-4 c-tech uppercase tracking-wider" style="color:rgba(228,228,231,.3);">
      No data for ${S.club}</div>`;
    return;
  }
  const C2='#10B981', C3='#6366F1';
  const rows=[
    {f:'carry', label:'Carry Distance', accent:C2},
    {f:'speed', label:'Ball Speed',     accent:C2},
    {f:'hang',  label:'Hang Time',      accent:C3},
    {f:'apex',  label:'Apex Height',    accent:C3},
    {f:'curve', label:'Curve',          accent:C3, isCurve:true},
  ];
  g.innerHTML = rows.map(r=>{
    const m=META[r.f], s=stats[r.f];
    const ul=unitLabel(m.unit);
    const avgFmt = s ? (r.isCurve ? fmtCurveMax(s.avg,m.unit)  : dispVal(s.avg,m.unit))  : '0.0';
    const bstFmt = s ? (r.isCurve ? fmtCurveMax(s.best,m.unit) : dispVal(s.best,m.unit)) : '0.0';
    const topLbl = r.isCurve ? 'Max Dev' : 'Top';
    return `
      <div class="flex justify-between items-center pb-2 border-b last:border-0" style="border-color:rgba(45,45,52,.3);">
        <span class="c-tech tracking-wider uppercase" style="font-size:10px;color:rgba(228,228,231,.4);">${r.label}</span>
        <div class="flex gap-5">
          <div class="text-right">
            <span class="block c-tech uppercase" style="font-size:9px;color:rgba(228,228,231,.3);">Avg</span>
            <span class="c-tech text-xl font-bold text-white">${avgFmt}</span>
            <span class="c-tech font-bold ml-0.5" style="font-size:10px;color:rgba(228,228,231,.4);">${ul}</span>
          </div>
          <div class="text-right" style="min-width:60px;">
            <span class="block c-tech uppercase" style="font-size:9px;color:${r.accent}70;">${topLbl}</span>
            <span class="c-tech text-xl font-bold" style="color:${r.accent};">${bstFmt}</span>
            <span class="c-tech font-bold ml-0.5" style="font-size:10px;color:${r.accent}70;">${ul}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ─── Feed ─────────────────────────────────────────────────────
function relTime(ts){
  const d=Date.now()-ts;
  if(d<60000) return 'just now';
  if(d<3600000) return `${Math.floor(d/60000)}m ago`;
  if(d<86400000) return `${Math.floor(d/3600000)}h ago`;
  if(d<604800000) return `${Math.floor(d/86400000)}d ago`;
  return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
function fmtTimestamp(ts){
  const d=new Date(ts);
  return d.toLocaleDateString([],{month:'short',day:'numeric'})+' '+
         d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}
function curveFeedFmt(v){
  if(v==null) return {t:'—',c:'#252840'};
  if(v>0) return {t:`R${Math.abs(v)}`,c:'#60A5FA'};
  if(v<0) return {t:`L${Math.abs(v)}`,c:'#FB923C'};
  return {t:'0',c:'#DDE0F5'};
}

function renderFeed(){ orbital_renderFeed(); classic_renderFeed(); }

function orbital_renderFeed(){
  const feed =document.getElementById('o-feed');
  const empty=document.getElementById('o-emptyState');
  const cnt  =document.getElementById('o-shotCount');
  const n=S.shots.length;
  if(cnt) cnt.textContent=`${n} shot${n!==1?'s':''}`;
  if(!n){if(feed)feed.innerHTML=''; if(empty)empty.style.display='block'; return;}
  if(empty)empty.style.display='none';
  const noV=`<span style="color:#252840;">—</span>`;
  feed.innerHTML = S.shots.map(s=>{
    const ed=s.id===S.editingId;
    const cv=curveFeedFmt(s.curve);
    const lie=s.lie||'tee';
    const lieC=lie==='tee'?'#3B82F6':'#4ADE80';
    const lieL=lie==='tee'?'TEE':'GRASS';
    const lieBg=lie==='tee'?'rgba(59,130,246,.15)':'rgba(74,222,128,.15)';
    const fCarry=s.carry!=null ? dispVal(s.carry,'dist') : null;
    const fSpeed=s.speed!=null ? dispVal(s.speed,'speed') : null;
    const fApex =s.apex !=null ? dispVal(s.apex,'height') : null;
    return `
    <div class="shot-anim rounded-2xl overflow-hidden"
      style="background:#0D0E19;border:1px solid ${ed?'#FF5500':'#1C1E32'};">
      <div class="flex">
        <div style="width:3px;flex-shrink:0;background:${lieC};"></div>
        <div class="flex-1 p-3">
          <div class="flex items-center justify-between mb-2.5">
            <div class="flex items-center gap-2">
              <span class="text-sm font-black text-white">${s.club}</span>
              <span class="text-xs font-black px-2 py-0.5 rounded-full tracking-widest"
                style="background:${lieBg};color:${lieC};">${lieL}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="o-num text-xs font-bold" style="color:#252840;">${relTime(s.ts)}</span>
              <button onclick="editShot(${s.id})" class="o-kb w-7 h-7 rounded-xl flex items-center justify-center"
                style="background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#38BDF8"
                  stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button onclick="requestDelete(${s.id})" class="o-kb w-7 h-7 rounded-xl flex items-center justify-center"
                style="background:rgba(255,31,61,.08);border:1px solid rgba(255,31,61,.2);">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#FF1F3D"
                  stroke-width="2.5" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="grid grid-cols-5 gap-1">
            <div>
              <p class="text-xs mb-0.5" style="color:#252840;">CARRY</p>
              <p class="o-num text-sm font-bold" style="color:${fCarry!=null?'#DDE0F5':'#FF1F3D'};">${fCarry??'?'}</p>
            </div>
            <div>
              <p class="text-xs mb-0.5" style="color:#252840;">SPD</p>
              <p class="o-num text-sm font-bold" style="color:${fSpeed!=null?'#DDE0F5':'#FF1F3D'};">${fSpeed??'?'}</p>
            </div>
            <div>
              <p class="text-xs mb-0.5" style="color:#252840;">HANG</p>
              <p class="o-num text-sm font-bold">${s.hang!=null?`<span style="color:#DDE0F5;">${s.hang}</span>`:noV}</p>
            </div>
            <div>
              <p class="text-xs mb-0.5" style="color:#252840;">HGT</p>
              <p class="o-num text-sm font-bold">${fApex!=null?`<span style="color:#DDE0F5;">${fApex}</span>`:noV}</p>
            </div>
            <div>
              <p class="text-xs mb-0.5" style="color:#252840;">CRV</p>
              <p class="o-num text-sm font-bold" style="color:${cv.c};">${cv.t}</p>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function classic_renderFeed(){
  const list=document.getElementById('c-shotList');
  const cnt =document.getElementById('c-shotCount');
  if(!list) return;
  if(cnt) cnt.textContent = S.shots.length ? `${S.shots.length} shots` : '';
  if(!S.shots.length){
    list.innerHTML=`<div class="text-xs text-center py-4 c-tech uppercase tracking-wider" style="color:rgba(228,228,231,.3);">
      No historic payload telemetry</div>`;
    return;
  }
  list.innerHTML = S.shots.map(s=>{
    const ed=s.id===S.editingId;
    const lie=s.lie||'tee';
    const lieL=lie==='tee'?'TEE':'GRS';
    const lieC=lie==='tee'?'color:#3B82F6;background:rgba(59,130,246,.1)':'color:#4ADE80;background:rgba(74,222,128,.1)';
    const fDist =s.carry!=null ? dispVal(s.carry,'dist')  : '--';
    const fSpeed=s.speed!=null ? dispVal(s.speed,'speed') : '--';
    const fHang =s.hang !=null ? `${s.hang}s` : '--';
    const fHgt  =s.apex !=null ? `${dispVal(s.apex,'height')}${unitLabel('height').toLowerCase()}` : '--';
    let fCrv='--';
    if(s.curve!=null){
      const abs=applyUnit(Math.abs(s.curve),'curve').toFixed(1);
      const ul=unitLabel('curve').toLowerCase();
      fCrv=s.curve>0?`R ${abs}${ul}`:s.curve<0?`L ${abs}${ul}`:`0${ul}`;
    }
    const ul_dist =unitLabel('dist');
    const ul_speed=unitLabel('speed');
    return `
    <div class="shot-anim flex flex-col py-3 space-y-1 ${ed?'px-2 rounded-xl -mx-1':''}"
      style="${ed?'background:rgba(99,102,241,.05);border:1px solid rgba(99,102,241,.2);':''}">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <span class="c-tech text-xs font-bold text-white rounded-md px-2 py-0.5 text-center"
            style="background:#2D2D34;min-width:50px;">${s.club.toUpperCase()}</span>
          <span class="c-tech font-bold rounded px-1.5 py-0.5" style="font-size:9px;${lieC};">${lieL}</span>
          <span class="c-num text-[11px]" style="color:rgba(228,228,231,.4);">${fmtTimestamp(s.ts)}</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="text-right c-tech text-xs tracking-tight">
            <span class="text-white font-bold">${fDist}</span>
            <span style="font-size:9px;color:rgba(228,228,231,.4);"> ${ul_dist}</span>
            <span class="mx-1" style="color:#2D2D34;">|</span>
            <span class="text-white font-bold">${fSpeed}</span>
            <span style="font-size:9px;color:rgba(228,228,231,.4);"> ${ul_speed}</span>
          </div>
          <div class="flex items-center">
            <button onclick="editShot(${s.id})" class="c-kb p-1.5" style="color:rgba(99,102,241,.7);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button onclick="requestDelete(${s.id})" class="c-kb p-1.5" style="color:rgba(239,68,68,.6);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-0.5 c-num" style="font-size:10px;color:rgba(228,228,231,.4);padding-left:62px;">
        <span>Hang: <strong style="color:rgba(228,228,231,.7);">${fHang}</strong></span>
        <span>Height: <strong style="color:rgba(228,228,231,.7);">${fHgt}</strong></span>
        <span>Curve: <strong style="color:rgba(228,228,231,.7);">${fCrv}</strong></span>
      </div>
    </div>`;
  }).join('');
}

// ─── Render All ───────────────────────────────────────────────
function renderAll(){
  buildClubs(); renderStats(); renderFeed();
  updateUnitToggleUI(); updateMetricUnitLabels();
  setSubmitState(S.editingId !== null);
  const oa=document.getElementById('o-analyticsClub');
  if(oa) oa.textContent=S.club.toUpperCase();
  const sh=document.getElementById('c-statsHeading');
  if(sh) sh.textContent=S.club.toUpperCase()+' PERFORMANCE';
}

// ─── Export / Import ──────────────────────────────────────────
function exportData(){
  if(!S.shots.length){ toast('No shots to export','err'); return; }
  const b64=btoa(unescape(encodeURIComponent(JSON.stringify(S.shots))));
  if(navigator.clipboard?.writeText){
    navigator.clipboard.writeText(b64)
      .then(()=>toast(`${S.shots.length} shots copied!`,'ok'))
      .catch(()=>fbCopy(b64));
  } else fbCopy(b64);
}
function fbCopy(text){
  const ta=Object.assign(document.createElement('textarea'),{value:text,style:'position:fixed;opacity:0;top:0;left:0;'});
  document.body.appendChild(ta); ta.focus(); ta.select();
  try{document.execCommand('copy');}catch(_){}
  document.body.removeChild(ta);
  toast('Copied to clipboard!','ok');
}
function importData(){
  const raw=(document.getElementById('importText').value||'').trim();
  if(!raw){ toast('Paste an export string first','err'); return; }
  try{
    let parsed;
    try{ parsed=JSON.parse(decodeURIComponent(escape(atob(raw)))); }
    catch(_){ parsed=JSON.parse(atob(raw)); }
    if(!Array.isArray(parsed)) throw 0;
    S.shots=parsed.map(normalizeShot).sort((a,b)=>b.ts-a.ts);
    save();
    if(S.editingId!==null) cancelEdit(); else renderAll();
    renderAll();
    document.getElementById('importText').value='';
    toast(`Imported ${S.shots.length} shots`,'ok');
    closeDataModal();
  } catch(_){ toast('Invalid import string','err'); }
}

// ─── Modal helpers ────────────────────────────────────────────
function openDataModal()  { document.getElementById('dataModal').classList.add('open'); }
function closeDataModal() { document.getElementById('dataModal').classList.remove('open'); }
function closeDataModalBg(e){ if(e.target===document.getElementById('dataModal')) closeDataModal(); }

function closeDeleteModal(){ S.pendingDelete=null; document.getElementById('deleteModal').classList.remove('open'); }
function closeDeleteModalBg(e){ if(e.target===document.getElementById('deleteModal')) closeDeleteModal(); }

function openThemeModal()  { document.getElementById('themeModal').classList.add('open'); }
function closeThemeModal() { document.getElementById('themeModal').classList.remove('open'); }
function closeThemeModalBg(e){ if(e.target===document.getElementById('themeModal')) closeThemeModal(); }

// ─── Toast ────────────────────────────────────────────────────
let _tt;
function toast(msg,type){
  clearTimeout(_tt);
  document.getElementById('toast-msg').textContent=msg;
  const icon =document.getElementById('toast-icon');
  const inner=document.getElementById('toast-inner');
  if(type==='err'){
    icon.textContent='✕'; icon.style.color='#FF1F3D';
    inner.style.borderColor='rgba(255,31,61,.4)';
  } else {
    icon.textContent='✓'; icon.style.color='#38BDF8';
    inner.style.borderColor='rgba(56,189,248,.35)';
  }
  document.getElementById('toast').classList.add('show');
  _tt=setTimeout(()=>document.getElementById('toast').classList.remove('show'),2500);
}
