// ─── Constants ───────────────────────────────────────────────
const CLUBS  = ['Driver','3 Wood','4 Hybrid','5 Iron','6 Iron','7 Iron','8 Iron','9 Iron','PW','GW','SW'];

// Abbreviation / alternate-name → canonical club name
const CLUB_ALIASES = {
  // 3 Wood
  '3w':'3 Wood','3wood':'3 Wood','3-wood':'3 Wood','3 w':'3 Wood',
  // 4 Hybrid
  '4h':'4 Hybrid','4hybrid':'4 Hybrid','4-hybrid':'4 Hybrid','4hy':'4 Hybrid','4 h':'4 Hybrid',
  // Irons (5–9)
  '5i':'5 Iron','5iron':'5 Iron','5-iron':'5 Iron','5 i':'5 Iron',
  '6i':'6 Iron','6iron':'6 Iron','6-iron':'6 Iron','6 i':'6 Iron',
  '7i':'7 Iron','7iron':'7 Iron','7-iron':'7 Iron','7 i':'7 Iron',
  '8i':'8 Iron','8iron':'8 Iron','8-iron':'8 Iron','8 i':'8 Iron',
  '9i':'9 Iron','9iron':'9 Iron','9-iron':'9 Iron','9 i':'9 Iron',
  // Wedges
  'pw':'PW','pitchingwedge':'PW','pitching wedge':'PW',
  'gw':'GW','gapwedge':'GW','gap wedge':'GW','aw':'GW','approachwedge':'GW',
  'sw':'SW','sandwedge':'SW','sand wedge':'SW',
  // Driver variants
  'dr':'Driver','drv':'Driver','d':'Driver','1w':'Driver','1 wood':'Driver',
};
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
const LS_MODE  = 'tl_mode';

// ─── State ────────────────────────────────────────────────────
const S = {
  club:'Driver', lie:'tee', focus:'carry', tab:'all',
  vals:{ carry:'', speed:'', hang:'', apex:'', curve:'' },
  shots:[], editingId:null,
  theme:'orbital', metric:false, pendingDelete:null,
  mode:'topgolf',
  feedFilter:{ mode:'all', lie:'all', club:'all', dateFrom:null, dateTo:null, hourFrom:0, hourTo:23 },
};

// ─── Boot ─────────────────────────────────────────────────────
(function boot(){
  migrateAndLoad();
  S.theme  = localStorage.getItem(LS_THEME) || 'orbital';
  S.metric = localStorage.getItem(LS_UNITS) === '1';
  S.mode   = localStorage.getItem(LS_MODE)  || 'topgolf';
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

  let club = (s.club || 'Driver').trim();
  if (!CLUBS.includes(club)){
    // 1. Try alias map (case-insensitive)
    const aliased = CLUB_ALIASES[club.toLowerCase()];
    if (aliased){
      club = aliased;
    } else {
      // 2. Replace hyphens and retry alias map
      const noDash = club.replace(/-/g, ' ');
      const aliasedNoDash = CLUB_ALIASES[noDash.toLowerCase()];
      if (aliasedNoDash){
        club = aliasedNoDash;
      } else {
        // 3. Case-insensitive exact match against CLUBS
        const m = CLUBS.find(c => c.toLowerCase() === noDash.toLowerCase());
        club = m || 'Driver';
      }
    }
  }

  let ts = s.ts;
  if (!ts || isNaN(ts)){
    if (s.timestamp){ const p = new Date(s.timestamp).getTime(); ts = isNaN(p) ? Date.now() : p; }
    else { ts = s.id || Date.now(); }
  }

  // Resolve apex/curve first so we can auto-assign mode
  const apex  = n(s.apex   ?? s.height      ?? s.peakHeight    ?? s.maxHeight);
  const curve = n(s.curve  ?? s.deviation   ?? s.lateral);

  // If mode is already set, keep it. Otherwise:
  //   has apex or curve data → practice session
  //   no apex and no curve   → top golf session
  const mode = s.mode || ((apex != null || curve != null) ? 'practice' : 'topgolf');

  return {
    id:    s.id ?? Date.now(),
    ts:    Number(ts),
    club,
    lie:   s.lie   || 'tee',
    mode,
    carry: n(s.carry  ?? s.distance    ?? s.carryDistance ?? s.yards),
    speed: n(s.speed  ?? s.ballSpeed   ?? s.mph           ?? s.velocity),
    hang:  n(s.hang   ?? s.hangtime    ?? s.hangTime      ?? s.airTime),
    apex,
    curve,
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

// ─── Mode System ──────────────────────────────────────────────
function setMode(name){
  S.mode = name;
  localStorage.setItem(LS_MODE, name);
  const prac = name === 'practice';
  if (!prac){
    // Clear practice-only fields and redirect focus if needed
    S.vals.apex = ''; S.vals.curve = '';
    refreshVal('apex'); refreshVal('curve');
    if (S.focus === 'apex' || S.focus === 'curve'){
      S.focus = 'carry';
      orbital_applyFocus('carry');
      classic_applyFocus('carry');
    }
  }
  applyModeUI();
}

function applyModeUI(){
  const prac = S.mode === 'practice';

  // Show/hide apex+curve rows
  const oRow = document.getElementById('o-apex-curve-row');
  const cRow = document.getElementById('c-apex-curve-row');
  if (oRow) oRow.style.display = prac ? '' : 'none';
  if (cRow) cRow.style.display = prac ? '' : 'none';

  // Tab highlighting
  const MODES = ['topgolf','topscore','practice'];
  for (const m of MODES){
    const on = m === S.mode;
    const oBtn = document.getElementById(`o-mode-${m}`);
    if (oBtn){
      oBtn.style.background   = on ? 'rgba(56,189,248,.12)' : 'transparent';
      oBtn.style.borderColor  = on ? '#38BDF8' : '#1C1E32';
      oBtn.style.color        = on ? '#38BDF8' : '#4E5275';
    }
    const cBtn = document.getElementById(`c-mode-${m}`);
    if (cBtn){
      cBtn.style.background   = on ? 'rgba(16,185,129,.10)' : 'transparent';
      cBtn.style.borderColor  = on ? '#10B981' : '#2D2D34';
      cBtn.style.color        = on ? '#10B981' : 'rgba(228,228,231,.4)';
    }
  }

  // Minus button: only useful in practice (curve field)
  const oMinus = document.getElementById('o-minusBtn');
  const cMinus = document.getElementById('c-minusBtn');
  if (!prac){
    if (oMinus){ oMinus.style.color='#252840'; oMinus.style.borderColor='#1C1E32'; oMinus.style.pointerEvents='none'; }
    if (cMinus){ cMinus.style.color='rgba(228,228,231,.3)'; cMinus.style.pointerEvents='none'; }
  }
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
  if ((f === 'apex' || f === 'curve') && S.mode !== 'practice') return;
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
    club:  S.club, lie:S.lie, mode: S.mode,
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
  ['all','topgolf','topscore','practice'].forEach(t=>{
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
    if(S.tab==='topgolf')  return s.mode==='topgolf';
    if(S.tab==='topscore') return s.mode==='topscore';
    if(S.tab==='practice') return s.mode==='practice';
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
    const lbl=S.tab==='all'?'any mode':S.tab==='topgolf'?'Top Golf':S.tab==='topscore'?'Top Score':'Practice';
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

// ─── Feed Filters ─────────────────────────────────────────────

function setFeedFilter(type, val){
  S.feedFilter[type] = val;
  renderFeed();
}

function filteredFeedShots(){
  const ff = S.feedFilter;
  return S.shots.filter(s => {
    if (ff.mode !== 'all' && s.mode !== ff.mode) return false;
    if (ff.lie  !== 'all' && s.lie  !== ff.lie)  return false;
    if (ff.club !== 'all' && s.club !== ff.club) return false;
    // Date-range filter
    if (ff.dateFrom){
      const from = new Date(ff.dateFrom + 'T00:00:00');
      from.setHours(ff.hourFrom ?? 0, 0, 0, 0);
      if (s.ts < from.getTime()) return false;
    }
    if (ff.dateTo){
      const to = new Date(ff.dateTo + 'T00:00:00');
      to.setHours(ff.hourTo ?? 23, 59, 59, 999);
      if (s.ts > to.getTime()) return false;
    }
    return true;
  });
}

function getLoggedClubs(){
  // Return clubs in standard order, only those with at least one shot
  return CLUBS.filter(c => S.shots.some(s => s.club === c));
}

function orbital_renderFeedFilter(){
  const el = document.getElementById('o-feedFilter');
  if (!el) return;
  const clubs = getLoggedClubs();
  const chip = (type, val, label) => {
    const on = S.feedFilter[type] === val;
    return `<button onclick="setFeedFilter('${type}','${val}')"
      class="o-kb shrink-0 px-2.5 py-1 rounded-xl border text-xs font-black tracking-widest"
      style="${on
        ? 'border-color:#38BDF8;background:rgba(56,189,248,.12);color:#38BDF8;'
        : 'border-color:#1C1E32;color:#4E5275;background:transparent;'}">${label}</button>`;
  };
  el.innerHTML = `
    <div class="rounded-2xl p-3.5" style="background:#0D0E19;border:1px solid #1C1E32;">
      <div class="flex items-center gap-2.5 mb-2.5">
        <span class="text-xs font-black tracking-widest shrink-0" style="color:#4E5275;width:36px;">MODE</span>
        <div class="noscroll flex gap-1.5 overflow-x-auto">
          ${chip('mode','all','ALL')}${chip('mode','topgolf','TOP GOLF')}${chip('mode','topscore','TOP SCORE')}${chip('mode','practice','PRACTICE')}
        </div>
      </div>
      <div class="flex items-center gap-2.5 mb-2.5">
        <span class="text-xs font-black tracking-widest shrink-0" style="color:#4E5275;width:36px;">LIE</span>
        <div class="flex gap-1.5">
          ${chip('lie','all','ALL')}${chip('lie','tee','TEE')}${chip('lie','grass','GRASS')}
        </div>
      </div>
      ${clubs.length ? `
      <div class="flex items-center gap-2.5 mb-2.5">
        <span class="text-xs font-black tracking-widest shrink-0" style="color:#4E5275;width:36px;">CLUB</span>
        <div class="noscroll flex gap-1.5 overflow-x-auto">
          ${chip('club','all','ALL')}${clubs.map(c => chip('club',c,c)).join('')}
        </div>
      </div>` : ''}
      <div class="flex items-center gap-2.5">
        <span class="text-xs font-black tracking-widest shrink-0" style="color:#4E5275;width:36px;">DATE</span>
        ${(()=>{
          const hasDate = S.feedFilter.dateFrom;
          const label = hasDate
            ? `📅 ${S.feedFilter.dateFrom}${S.feedFilter.dateTo && S.feedFilter.dateTo!==S.feedFilter.dateFrom ? ' → '+S.feedFilter.dateTo : ''}`
            : '📅 Set date & time range';
          return `<button onclick="openDateFilter()" class="o-kb flex-1 py-1.5 px-3 rounded-xl border text-xs font-bold text-left"
            style="background:${hasDate?'rgba(56,189,248,.12)':'#141526'};border-color:${hasDate?'#38BDF8':'#1C1E32'};color:${hasDate?'#38BDF8':'#4E5275'};">${label}</button>`;
        })()}
      </div>
    </div>`;
}

function classic_renderFeedFilter(){
  const el = document.getElementById('c-feedFilter');
  if (!el) return;
  const clubs = getLoggedClubs();
  const chip = (type, val, label) => {
    const on = S.feedFilter[type] === val;
    return `<button onclick="setFeedFilter('${type}','${val}')"
      class="c-kb c-tech shrink-0 px-2 py-0.5 rounded-lg border font-bold tracking-widest"
      style="font-size:9px;${on
        ? 'border-color:#10B981;background:rgba(16,185,129,.1);color:#10B981;'
        : 'border-color:#2D2D34;color:rgba(228,228,231,.4);background:transparent;'}">${label}</button>`;
  };
  el.innerHTML = `
    <div style="padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid rgba(45,45,52,.5);">
      <div class="flex items-center gap-2 mb-1.5">
        <span class="c-tech font-bold shrink-0" style="font-size:9px;letter-spacing:.1em;color:rgba(228,228,231,.3);width:40px;">MODE</span>
        <div class="noscroll flex gap-1 overflow-x-auto">
          ${chip('mode','all','ALL')}${chip('mode','topgolf','TOP GOLF')}${chip('mode','topscore','TOP SCORE')}${chip('mode','practice','PRACTICE')}
        </div>
      </div>
      <div class="flex items-center gap-2 mb-1.5">
        <span class="c-tech font-bold shrink-0" style="font-size:9px;letter-spacing:.1em;color:rgba(228,228,231,.3);width:40px;">LIE</span>
        <div class="flex gap-1">
          ${chip('lie','all','ALL')}${chip('lie','tee','TEE')}${chip('lie','grass','GRASS')}
        </div>
      </div>
      ${clubs.length ? `
      <div class="flex items-center gap-2 mb-1.5">
        <span class="c-tech font-bold shrink-0" style="font-size:9px;letter-spacing:.1em;color:rgba(228,228,231,.3);width:40px;">CLUB</span>
        <div class="noscroll flex gap-1 overflow-x-auto">
          ${chip('club','all','ALL')}${clubs.map(c => chip('club',c,c.toUpperCase())).join('')}
        </div>
      </div>` : ''}
      <div class="flex items-center gap-2">
        <span class="c-tech font-bold shrink-0" style="font-size:9px;letter-spacing:.1em;color:rgba(228,228,231,.3);width:40px;">DATE</span>
        ${(()=>{
          const hasDate = S.feedFilter.dateFrom;
          const label = hasDate
            ? `📅 ${S.feedFilter.dateFrom}${S.feedFilter.dateTo && S.feedFilter.dateTo!==S.feedFilter.dateFrom ? ' → '+S.feedFilter.dateTo : ''}`
            : '📅 Set date & time range';
          return `<button onclick="openDateFilter()" class="c-kb c-tech flex-1 py-1 px-2.5 rounded-lg border font-bold text-left" style="font-size:9px;background:${hasDate?'rgba(16,185,129,.1)':'#121214'};border-color:${hasDate?'#10B981':'#2D2D34'};color:${hasDate?'#10B981':'rgba(228,228,231,.25)'};">${label}</button>`;
        })()}
      </div>
    </div>`;
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
  const total = S.shots.length;
  const shots = filteredFeedShots();
  orbital_renderFeedFilter();
  if(cnt) cnt.textContent = shots.length < total
    ? `${shots.length}/${total}` : `${total} shot${total!==1?'s':''}`;
  if(!total){if(feed)feed.innerHTML=''; if(empty)empty.style.display='block'; return;}
  if(empty)empty.style.display='none';
  if(!shots.length){
    if(feed) feed.innerHTML=`<p class="text-sm text-center py-6 font-semibold" style="color:#252840;">No shots match the filter.</p>`;
    return;
  }
  const noV=`<span style="color:#252840;">—</span>`;
  feed.innerHTML = shots.map(s=>{
    const ed=s.id===S.editingId;
    const cv=curveFeedFmt(s.curve);
    const lie=s.lie||'tee';
    const lieC=lie==='tee'?'#3B82F6':'#4ADE80';
    const lieL=lie==='tee'?'TEE':'GRASS';
    const lieBg=lie==='tee'?'rgba(59,130,246,.15)':'rgba(74,222,128,.15)';
    const modeAbbr=s.mode==='topgolf'?'TG':s.mode==='topscore'?'TS':s.mode==='practice'?'P':'';
    const modeBg=s.mode==='topgolf'?'rgba(56,189,248,.12)':s.mode==='topscore'?'rgba(245,158,11,.12)':'rgba(74,222,128,.12)';
    const modeCol=s.mode==='topgolf'?'#38BDF8':s.mode==='topscore'?'#F59E0B':'#4ADE80';
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
              ${modeAbbr?`<span class="text-xs font-black px-2 py-0.5 rounded-full tracking-widest" style="background:${modeBg};color:${modeCol};">${modeAbbr}</span>`:''}
            </div>
            <div class="flex items-center gap-2">
              <span class="o-num text-xs font-bold" style="color:#252840;">${relTime(s.ts)}</span>
              <button onclick="openTrajectory(${s.id})" class="o-kb w-7 h-7 rounded-xl flex items-center justify-center"
                style="background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.18);" title="View Trajectory">
                <svg width="13" height="11" viewBox="0 0 26 22" fill="none" stroke="#38BDF8"
                  stroke-width="2.5" stroke-linecap="round">
                  <path d="M2 20 C6 4 20 1 24 20"/>
                  <circle cx="24" cy="20" r="2.5" fill="#38BDF8" stroke="none"/>
                </svg>
              </button>
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
  const total = S.shots.length;
  const shots = filteredFeedShots();
  classic_renderFeedFilter();
  if(cnt) cnt.textContent = shots.length < total
    ? `${shots.length}/${total}` : (total ? `${total} shots` : '');
  if(!total){
    list.innerHTML=`<div class="text-xs text-center py-4 c-tech uppercase tracking-wider" style="color:rgba(228,228,231,.3);">No historic payload telemetry</div>`;
    return;
  }
  if(!shots.length){
    list.innerHTML=`<div class="text-xs text-center py-4 c-tech uppercase tracking-wider" style="color:rgba(228,228,231,.3);">No shots match the filter.</div>`;
    return;
  }
  list.innerHTML = shots.map(s=>{
    const ed=s.id===S.editingId;
    const lie=s.lie||'tee';
    const lieL=lie==='tee'?'TEE':'GRS';
    const lieC=lie==='tee'?'color:#3B82F6;background:rgba(59,130,246,.1)':'color:#4ADE80;background:rgba(74,222,128,.1)';
    const cModeAbbr=s.mode==='topgolf'?'TG':s.mode==='topscore'?'TS':s.mode==='practice'?'P':'';
    const cModeBg=s.mode==='topgolf'?'rgba(56,189,248,.1)':s.mode==='topscore'?'rgba(245,158,11,.1)':'rgba(74,222,128,.1)';
    const cModeCol=s.mode==='topgolf'?'#38BDF8':s.mode==='topscore'?'#F59E0B':'#4ADE80';
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
          ${cModeAbbr?`<span class="c-tech font-bold rounded px-1.5 py-0.5" style="font-size:9px;background:${cModeBg};color:${cModeCol};">${cModeAbbr}</span>`:''}
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
            <button onclick="openTrajectory(${s.id})" class="c-kb p-1.5" style="color:rgba(56,189,248,.65);" title="View Trajectory">
              <svg width="14" height="14" viewBox="0 0 26 22" fill="none" stroke="currentColor"
                stroke-width="2.5" stroke-linecap="round">
                <path d="M2 20 C6 4 20 1 24 20"/>
                <circle cx="24" cy="20" r="2.5" fill="currentColor" stroke="none"/>
              </svg>
            </button>
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
  applyModeUI();
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

// ─── Trajectory Visualization ─────────────────────────────────

let _trajRAF = null;

function openTrajectory(id){
  const shot = S.shots.find(s => s.id === id);
  if (!shot) return;

  // Club / lie header
  const clubEl = document.getElementById('traj-club');
  const lieEl  = document.getElementById('traj-lie');
  if (clubEl) clubEl.textContent = shot.club;
  if (lieEl){
    const isTee = (shot.lie || 'tee') === 'tee';
    lieEl.textContent      = isTee ? 'OFF TEE' : 'OFF GRASS';
    lieEl.style.color      = isTee ? '#3B82F6' : '#4ADE80';
    lieEl.style.background = isTee ? 'rgba(59,130,246,.15)' : 'rgba(74,222,128,.15)';
  }

  // Stats row
  const statsEl = document.getElementById('traj-stats');
  if (statsEl){
    const fCarry = shot.carry != null ? dispVal(shot.carry,'dist')   : '—';
    const fApex  = shot.apex  != null ? dispVal(shot.apex,'height')  : '—';
    let   fCrv   = '—';
    if (shot.curve != null){
      const abs = dispVal(Math.abs(shot.curve),'curve');
      fCrv = shot.curve > 0 ? `R ${abs}` : shot.curve < 0 ? `L ${abs}` : '0';
    }
    const mkStat = (label, val, unit) =>
      `<div style="text-align:center;">
        <p class="o-num" style="font-size:8px;letter-spacing:2px;color:#4E5275;">${label}</p>
        <p class="o-num" style="font-size:20px;font-weight:700;color:#DDE0F5;line-height:1.1;">${val}</p>
        <p class="o-num" style="font-size:8px;color:#252840;">${unit}</p>
      </div>`;
    statsEl.innerHTML =
      mkStat('CARRY', fCarry, unitLabel('dist')) +
      mkStat('APEX',  fApex,  unitLabel('height')) +
      mkStat('CURVE', fCrv,   unitLabel('curve'));
  }

  document.getElementById('trajModal').classList.add('open');
  // Give the modal transition time to open before sizing canvas
  setTimeout(() => animateTrajectory(shot), 120);
}

function closeTrajModal(){
  if (_trajRAF){ cancelAnimationFrame(_trajRAF); _trajRAF = null; }
  document.getElementById('trajModal').classList.remove('open');
}
function closeTrajModalBg(e){
  if (e.target === document.getElementById('trajModal')) closeTrajModal();
}

function animateTrajectory(shot){
  if (_trajRAF){ cancelAnimationFrame(_trajRAF); _trajRAF = null; }
  const canvas = document.getElementById('trajCanvas');
  const wrap   = document.getElementById('traj-wrap');
  if (!canvas || !wrap) return;

  // Size canvas to physical pixels for crisp rendering
  const dpr = window.devicePixelRatio || 1;
  const W   = wrap.clientWidth;
  const H   = wrap.clientHeight;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const FLY_MS  = 2400;
  const HOLD_MS = 2200;
  const START   = performance.now();

  function frame(now){
    if (!document.getElementById('trajModal').classList.contains('open')){ return; }
    const elapsed = now - START;
    let progress, postLand;
    if (elapsed < FLY_MS){
      const t = elapsed / FLY_MS;
      // ease-in-out
      progress = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      postLand = 0;
    } else {
      progress = 1;
      postLand = elapsed - FLY_MS;
    }
    trajDraw(ctx, W, H, shot, progress, postLand);
    if (elapsed < FLY_MS + HOLD_MS){
      _trajRAF = requestAnimationFrame(frame);
    } else {
      _trajRAF = null;
      setTimeout(() => animateTrajectory(shot), 300);
    }
  }
  _trajRAF = requestAnimationFrame(frame);
}

function trajDraw(ctx, W, H, shot, progress, postLand){
  // ── Scene parameters ──────────────────────────────────────────
  const carry    = shot.carry  || 200;
  const apexFt   = shot.apex   != null ? shot.apex : carry * 0.45;
  const apexYds  = apexFt / 3;             // feet → yards
  const curveYds = shot.curve  || 0;

  // Camera: close behind tee so arc fills canvas, tee sits near bottom
  const BEHIND  = 3;        // yards behind tee (was 10 — close cam = tee lower in frame)
  const EYE_Y   = 1.8;      // yards eye height
  const FL      = W * 0.65; // focal length (pixels)
  const HOR_Y   = H * 0.50; // horizon at 50% from top

  function proj(wx, wy, wz){
    const dz = wz + BEHIND;
    if (dz < 0.05) return null;
    const s = FL / dz;
    return { x: W/2 + wx*s, y: HOR_Y + (EYE_Y - wy)*s, s };
  }

  ctx.clearRect(0, 0, W, H);

  // ── Sky ───────────────────────────────────────────────────────
  const sky = ctx.createLinearGradient(0, 0, 0, HOR_Y + 10);
  sky.addColorStop(0, '#04050D');
  sky.addColorStop(1, '#080F1E');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HOR_Y + 2);

  // ── Ground ────────────────────────────────────────────────────
  const gnd = ctx.createLinearGradient(0, HOR_Y, 0, H);
  gnd.addColorStop(0, '#061208');
  gnd.addColorStop(1, '#020804');
  ctx.fillStyle = gnd;
  ctx.fillRect(0, HOR_Y, W, H - HOR_Y);

  // ── Horizon glow ──────────────────────────────────────────────
  const hgl = ctx.createLinearGradient(0, HOR_Y - 8, 0, HOR_Y + 8);
  hgl.addColorStop(0, 'rgba(56,189,248,0)');
  hgl.addColorStop(0.5, 'rgba(56,189,248,0.08)');
  hgl.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = hgl;
  ctx.fillRect(0, HOR_Y - 8, W, 16);

  // ── Fairway grid ─────────────────────────────────────────────
  const FW   = 8;  // fixed half-width yards (close camera needs narrow grid)
  const step = carry > 220 ? 50 : 25;
  // Minimum Z where outer lane lines stay within canvas width
  const laneStartZ = Math.max(0.5, (FW * 2 * FL / W) - BEHIND);

  // Longitudinal lines
  const laneXs = [-FW, -FW*0.5, 0, FW*0.5, FW];
  for (const lx of laneXs){
    const p0 = proj(lx, 0, laneStartZ);
    const p1 = proj(lx, 0, carry * 1.5);
    if (!p0 || !p1) continue;
    ctx.strokeStyle = lx === 0 ? 'rgba(56,189,248,0.09)' : 'rgba(74,222,128,0.055)';
    ctx.lineWidth   = lx === 0 ? 0.8 : 0.5;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  }

  // Cross lines + yardage labels
  for (let d = step; d <= carry * 1.15; d += step){
    const crossW = Math.min(FW, d * FW / (laneStartZ + BEHIND)); // clip near lines
    const pL = proj(-crossW, 0, d), pR = proj(crossW, 0, d);
    if (!pL || !pR) continue;
    const major = d % 100 === 0;
    ctx.strokeStyle = `rgba(74,222,128,${major ? 0.11 : 0.055})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(pL.x, pL.y); ctx.lineTo(pR.x, pR.y); ctx.stroke();
    if (major){
      const pm = proj(0, 0, d);
      if (pm){
        const fs = Math.max(7, Math.min(12, pm.s * 5.5));
        ctx.fillStyle = 'rgba(74,222,128,0.22)';
        ctx.font      = `${fs}px "Roboto Mono",monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${d}`, pm.x, pm.y - 3);
      }
    }
  }

  // ── Landing target ────────────────────────────────────────────
  const lpj = proj(curveYds, 0, carry);
  if (lpj){
    const rx = 20 * lpj.s, ry = 6 * lpj.s;
    const tg = ctx.createRadialGradient(lpj.x, lpj.y, 0, lpj.x, lpj.y, rx * 2.8);
    tg.addColorStop(0, 'rgba(56,189,248,0.10)');
    tg.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.ellipse(lpj.x, lpj.y, rx*2.8, ry*2.8, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56,189,248,0.20)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(lpj.x, lpj.y, rx, ry, 0, 0, Math.PI*2);
    ctx.stroke();
  }

  // ── Build trajectory points ───────────────────────────────────
  // wx uses t² so ball launches straight then bends progressively (sidespin effect)
  const STEPS = 100;
  const pts   = [];
  for (let i = 0; i <= STEPS; i++){
    const t  = i / STEPS;
    const wx = curveYds * t * t;
    const wy = 4 * apexYds * t * (1 - t);
    const wz = carry * t;
    const p  = proj(wx, wy, wz);
    if (p) pts.push({ ...p, t });
  }

  const maxI = Math.max(1, Math.round(progress * pts.length));
  const vis  = pts.slice(0, maxI);

  if (vis.length > 1){
    // Ground shadow (dashed)
    ctx.save();
    ctx.setLineDash([2, 7]);
    ctx.lineWidth   = 0.7;
    ctx.strokeStyle = 'rgba(56,189,248,0.11)';
    ctx.beginPath();
    let first = true;
    for (let i = 0; i <= Math.round(progress * STEPS); i++){
      const t  = i / STEPS;
      const p  = proj(curveYds * t * t, 0, carry * t);
      if (!p) continue;
      first ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      first = false;
    }
    ctx.stroke();
    ctx.restore();

    // Outer glow layers
    for (let g = 3; g >= 0; g--){
      ctx.beginPath();
      ctx.moveTo(vis[0].x, vis[0].y);
      for (let i = 1; i < vis.length; i++) ctx.lineTo(vis[i].x, vis[i].y);
      ctx.strokeStyle = `rgba(56,189,248,${0.04 + g*0.035})`;
      ctx.lineWidth   = 1.8 + g * 2.8;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Core arc line
    ctx.beginPath();
    ctx.moveTo(vis[0].x, vis[0].y);
    for (let i = 1; i < vis.length; i++) ctx.lineTo(vis[i].x, vis[i].y);
    ctx.strokeStyle = 'rgba(56,189,248,0.88)';
    ctx.lineWidth   = 1.6;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();
  }

  // ── Apex marker ───────────────────────────────────────────────
  (function(){
    const aT  = 0.5;
    const apj = proj(curveYds * aT * aT, apexYds, carry * aT);
    if (!apj) return;
    // Fade in once the ball has passed the apex
    const fade = Math.min(1, Math.max(0, (progress - 0.44) / 0.10));
    if (fade <= 0) return;

    // Glow halo
    const gr = ctx.createRadialGradient(apj.x, apj.y, 0, apj.x, apj.y, 16);
    gr.addColorStop(0, `rgba(56,189,248,${0.45 * fade})`);
    gr.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.beginPath(); ctx.fillStyle = gr;
    ctx.arc(apj.x, apj.y, 16, 0, Math.PI * 2); ctx.fill();

    // White dot
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,255,${0.95 * fade})`;
    ctx.arc(apj.x, apj.y, 3, 0, Math.PI * 2); ctx.fill();

    // Height label above the dot
    const lbl = shot.apex != null
      ? `${dispVal(shot.apex, 'height')} ${unitLabel('height')}`
      : `~${Math.round(apexFt)} ${unitLabel('height')}`;
    ctx.font = 'bold 10px "Roboto Mono",monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(74,222,128,${0.9 * fade})`;
    ctx.fillText(lbl, apj.x, apj.y - 10);
  })();

  // ── Ball ──────────────────────────────────────────────────────
  if (vis.length){
    const b  = vis[vis.length - 1];
    const sz = Math.max(2.5, Math.min(12, b.s * 3.2));

    // Outer glow
    const glw = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, sz * 7);
    glw.addColorStop(0,   'rgba(255,255,255,0.50)');
    glw.addColorStop(0.2, 'rgba(56,189,248,0.28)');
    glw.addColorStop(1,   'rgba(56,189,248,0)');
    ctx.beginPath(); ctx.fillStyle = glw;
    ctx.arc(b.x, b.y, sz * 7, 0, Math.PI * 2); ctx.fill();

    // Ball body (radial highlight)
    const bd = ctx.createRadialGradient(b.x - sz*0.3, b.y - sz*0.3, 0, b.x, b.y, sz);
    bd.addColorStop(0, '#ffffff');
    bd.addColorStop(1, '#c8e6f8');
    ctx.beginPath(); ctx.fillStyle = bd;
    ctx.arc(b.x, b.y, Math.max(2, sz), 0, Math.PI * 2); ctx.fill();
  }

  // ── Impact rings (expand after landing) ───────────────────────
  if (progress >= 1 && lpj && postLand > 0){
    for (let r = 1; r <= 3; r++){
      const delay  = (r - 1) * 200;
      const rp     = Math.min(1, Math.max(0, (postLand - delay) / 750));
      if (rp <= 0) continue;
      const rx     = 24 * r * lpj.s * rp;
      const ry     = 8  * r * lpj.s * rp;
      const alpha  = (1 - rp) * 0.55;
      ctx.strokeStyle = `rgba(56,189,248,${alpha})`;
      ctx.lineWidth   = 1.4;
      ctx.beginPath();
      ctx.ellipse(lpj.x, lpj.y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI*2);
      ctx.stroke();
    }
    // Carry label floating above landing
    if (lpj && shot.carry != null){
      const label = `${dispVal(shot.carry,'dist')} ${unitLabel('dist')}`;
      const fs    = Math.max(9, Math.min(14, lpj.s * 6));
      ctx.font      = `bold ${fs}px "Roboto Mono",monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(74,222,128,0.80)';
      ctx.fillText(label, lpj.x, lpj.y - 14 * lpj.s - 6);
    }
  }

  // ── Tee/origin dot ────────────────────────────────────────────
  const tp = proj(0, 0, 0.2);
  if (tp){
    ctx.fillStyle = (shot.lie || 'tee') === 'tee' ? '#3B82F6' : '#4ADE80';
    ctx.beginPath(); ctx.arc(tp.x, tp.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
}

// ─── Date Range Filter ────────────────────────────────────────

let _cal = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  from: null,     // 'YYYY-MM-DD'
  to: null,       // 'YYYY-MM-DD'
  hourFrom: 0,
  hourTo: 23,
};

function fmtHour(h){
  if (h === 0)  return '12 AM';
  if (h < 12)   return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function openDateFilter(){
  _cal.from     = S.feedFilter.dateFrom || null;
  _cal.to       = S.feedFilter.dateTo   || null;
  _cal.hourFrom = S.feedFilter.hourFrom ?? 0;
  _cal.hourTo   = S.feedFilter.hourTo   ?? 23;
  if (_cal.from){
    const d = new Date(_cal.from + 'T00:00:00');
    _cal.year = d.getFullYear(); _cal.month = d.getMonth();
  } else {
    const now = new Date();
    _cal.year = now.getFullYear(); _cal.month = now.getMonth();
  }
  renderDateModal();
  document.getElementById('dateModal').classList.add('open');
}
function closeDateModal(){
  document.getElementById('dateModal').classList.remove('open');
}
function closeDateModalBg(e){
  if (e.target === document.getElementById('dateModal')) closeDateModal();
}

function calPrevMonth(){
  _cal.month--;
  if (_cal.month < 0){ _cal.month = 11; _cal.year--; }
  renderDateModal();
}
function calNextMonth(){
  _cal.month++;
  if (_cal.month > 11){ _cal.month = 0; _cal.year++; }
  renderDateModal();
}

function calSelectDay(ymd){
  if (!_cal.from || _cal.to){
    // Start fresh: first click is FROM
    _cal.from = ymd; _cal.to = null;
  } else {
    // Second click: TO (or swap if before FROM)
    if (ymd < _cal.from){ _cal.from = ymd; _cal.to = null; }
    else if (ymd === _cal.from){ _cal.to = null; } // deselect same day = single day
    else { _cal.to = ymd; }
  }
  renderDateModal();
}

function calAdjustHour(which, delta){
  if (which === 'from'){
    _cal.hourFrom = Math.max(0, Math.min(23, _cal.hourFrom + delta));
    if (_cal.hourFrom > _cal.hourTo) _cal.hourTo = _cal.hourFrom;
  } else {
    _cal.hourTo = Math.max(0, Math.min(23, _cal.hourTo + delta));
    if (_cal.hourTo < _cal.hourFrom) _cal.hourFrom = _cal.hourTo;
  }
  renderDateModal();
}

function applyDateFilter(){
  S.feedFilter.dateFrom = _cal.from;
  S.feedFilter.dateTo   = _cal.to || _cal.from; // single day if no TO
  S.feedFilter.hourFrom = _cal.hourFrom;
  S.feedFilter.hourTo   = _cal.hourTo;
  closeDateModal();
  renderFeed();
}

function clearDateFilter(){
  _cal.from = null; _cal.to = null; _cal.hourFrom = 0; _cal.hourTo = 23;
  S.feedFilter.dateFrom = null;
  S.feedFilter.dateTo   = null;
  S.feedFilter.hourFrom = 0;
  S.feedFilter.hourTo   = 23;
  renderDateModal();
  renderFeed();
}

function renderDateModal(){
  const body = document.getElementById('dateModalBody');
  if (!body) return;

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const DOWS   = ['S','M','T','W','T','F','S'];

  const firstDow     = new Date(_cal.year, _cal.month, 1).getDay();
  const daysInMonth  = new Date(_cal.year, _cal.month + 1, 0).getDate();
  const todayYMD     = new Date().toISOString().slice(0, 10);

  const pad = n => String(n).padStart(2,'0');
  const toYMD = d => `${_cal.year}-${pad(_cal.month+1)}-${pad(d)}`;

  const fmtDisplay = ymd => {
    if (!ymd) return '—';
    const [y, m, d] = ymd.split('-');
    return `${MONTHS[parseInt(m,10)-1].slice(0,3)} ${parseInt(d,10)}, ${y}`;
  };

  // Build calendar cells
  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += `<div></div>`;

  for (let d = 1; d <= daysInMonth; d++){
    const ymd    = toYMD(d);
    const isFrom = ymd === _cal.from;
    const isTo   = ymd === _cal.to;
    const inRange = _cal.from && _cal.to && ymd > _cal.from && ymd < _cal.to;
    const isToday = ymd === todayYMD;
    const hasRange = _cal.from && _cal.to && _cal.from !== _cal.to;

    // Wrapper background for range strip
    let wrapBg = 'transparent';
    let wrapRadius = '0';
    if (hasRange){
      if (inRange)  { wrapBg = 'rgba(56,189,248,0.13)'; wrapRadius = '0'; }
      if (isFrom)   { wrapBg = 'rgba(56,189,248,0.13)'; wrapRadius = '50% 0 0 50%'; }
      if (isTo)     { wrapBg = 'rgba(56,189,248,0.13)'; wrapRadius = '0 50% 50% 0'; }
    }

    // Dot style
    let dotBg = 'transparent', dotColor = isToday ? '#38BDF8' : '#DDE0F5', dotWeight = '400';
    if (isToday && !isFrom && !isTo) dotWeight = '700';
    if (isFrom || isTo){
      dotBg = '#38BDF8'; dotColor = '#07080E'; dotWeight = '700';
    }

    cells += `
      <div onclick="calSelectDay('${ymd}')"
        style="display:flex;align-items:center;justify-content:center;height:38px;cursor:pointer;
               background:${wrapBg};border-radius:${wrapRadius};">
        <span style="display:flex;align-items:center;justify-content:center;
          width:34px;height:34px;border-radius:50%;background:${dotBg};
          color:${dotColor};font-size:13px;font-weight:${dotWeight};user-select:none;">${d}</span>
      </div>`;
  }

  body.innerHTML = `
    <!-- FROM / TO pills -->
    <div class="flex items-center gap-2 px-4 pb-4">
      <div class="flex-1 rounded-xl px-3 py-2.5"
        style="border:1.5px solid ${_cal.from?'#38BDF8':'#1C1E32'};">
        <p class="o-num text-xs font-black tracking-widest mb-0.5" style="color:#4E5275;">FROM</p>
        <p class="o-num text-sm font-bold" style="color:${_cal.from?'#DDE0F5':'#252840'};">${fmtDisplay(_cal.from)}</p>
      </div>
      <svg width="14" height="10" viewBox="0 0 14 10" fill="none" style="flex-shrink:0;">
        <path d="M0 5h12M8 1l4 4-4 4" stroke="#4E5275" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="flex-1 rounded-xl px-3 py-2.5"
        style="border:1.5px solid ${_cal.to?'#38BDF8':'#1C1E32'};">
        <p class="o-num text-xs font-black tracking-widest mb-0.5" style="color:#4E5275;">TO</p>
        <p class="o-num text-sm font-bold" style="color:${_cal.to?'#DDE0F5':'#252840'};">${fmtDisplay(_cal.to)}</p>
      </div>
    </div>

    <!-- Month nav -->
    <div class="flex items-center justify-between px-4 mb-3">
      <button onclick="calPrevMonth()" class="o-kb w-8 h-8 rounded-full flex items-center justify-center text-lg"
        style="background:#141526;border:1px solid #1C1E32;color:#DDE0F5;">‹</button>
      <span class="text-sm font-black tracking-wider text-white">${MONTHS[_cal.month]} ${_cal.year}</span>
      <button onclick="calNextMonth()" class="o-kb w-8 h-8 rounded-full flex items-center justify-center text-lg"
        style="background:#141526;border:1px solid #1C1E32;color:#DDE0F5;">›</button>
    </div>

    <!-- Day-of-week headers -->
    <div style="display:grid;grid-template-columns:repeat(7,1fr);padding:0 16px 4px;">
      ${DOWS.map(d=>`<div style="text-align:center;font-size:11px;font-weight:900;letter-spacing:.08em;color:#252840;padding:3px 0;">${d}</div>`).join('')}
    </div>

    <!-- Day grid -->
    <div style="display:grid;grid-template-columns:repeat(7,1fr);padding:0 16px 16px;">
      ${cells}
    </div>

    <!-- Hour range -->
    <div style="border-top:1px solid #1C1E32;padding:16px 16px 12px;">
      <p class="text-xs font-black tracking-widest mb-3" style="color:#4E5275;">HOUR RANGE</p>
      <div class="flex items-center gap-3">
        <div style="flex:1;">
          <p class="text-xs font-black tracking-widest mb-2 text-center" style="color:#4E5275;">FROM</p>
          <div class="flex items-center justify-between rounded-xl"
            style="background:#141526;border:1px solid #1C1E32;padding:2px 4px;">
            <button onclick="calAdjustHour('from',-1)"
              class="o-kb flex items-center justify-center font-black text-xl"
              style="width:36px;height:36px;color:#4E5275;">−</button>
            <span class="o-num text-sm font-black text-white">${fmtHour(_cal.hourFrom)}</span>
            <button onclick="calAdjustHour('from',1)"
              class="o-kb flex items-center justify-center font-black text-xl"
              style="width:36px;height:36px;color:#38BDF8;">+</button>
          </div>
        </div>
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" style="flex-shrink:0;margin-top:20px;">
          <path d="M0 5h12M8 1l4 4-4 4" stroke="#4E5275" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div style="flex:1;">
          <p class="text-xs font-black tracking-widest mb-2 text-center" style="color:#4E5275;">TO</p>
          <div class="flex items-center justify-between rounded-xl"
            style="background:#141526;border:1px solid #1C1E32;padding:2px 4px;">
            <button onclick="calAdjustHour('to',-1)"
              class="o-kb flex items-center justify-center font-black text-xl"
              style="width:36px;height:36px;color:#4E5275;">−</button>
            <span class="o-num text-sm font-black text-white">${fmtHour(_cal.hourTo)}</span>
            <button onclick="calAdjustHour('to',1)"
              class="o-kb flex items-center justify-center font-black text-xl"
              style="width:36px;height:36px;color:#38BDF8;">+</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-3 px-4 py-4" style="border-top:1px solid #1C1E32;">
      <button onclick="clearDateFilter()"
        class="o-kb flex-1 py-3 rounded-2xl text-xs font-black tracking-widest"
        style="background:#141526;border:1px solid #1C1E32;color:#4E5275;">CLEAR</button>
      <button onclick="applyDateFilter()"
        class="o-kb flex-1 py-3 rounded-2xl text-xs font-black tracking-widest"
        style="background:#38BDF8;color:#07080E;">APPLY FILTER</button>
    </div>
    <div style="height:max(env(safe-area-inset-bottom),8px);"></div>`;
}

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
