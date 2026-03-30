// ──────────────────────────────────────────────────────────
//  KINDpos · Snapshot Scene  (Vz1.0)
//  The navigation hub — triage center for the shift
//  Architecture: SNAPSHOT_CARD_ARCHITECTURE.md
// ──────────────────────────────────────────────────────────

import { APP, $, calcOrder } from '../app.js';
import { registerScene, go } from '../scene-manager.js';
import { CFG, FALLBACK_ROSTER, FALLBACK_MENU } from '../config.js';
import { T, chamfer, statusCard, checkOverviewPanel, snapshotOverlay, msgButton } from '../theme-manager.js';

/* ═══════════════════════════════════════════════════════════
   §1  SNAPSHOT DATA (fetched from API; zero-state defaults)
   ═══════════════════════════════════════════════════════════ */
// These start as empty/zero — real data is fetched from the API.
// On a fresh system with no orders, zeros are the truth.
let MOCK_HOURLY_TODAY   = [];
let MOCK_HOURLY_LASTWK  = [];
let MOCK_LABOR_PCT=0, MOCK_LABOR_WARN=30, MOCK_LABOR_CRIT=35;
let MOCK_LABOR_COST=0, MOCK_LABOR_SALES=0;
let MOCK_SPLH_NOW=0, MOCK_SPLH_LAST=0;
let MOCK_HR_LABOR=[];
let MOCK_HR_LABOR_LW=[];
let MOCK_ROLES=[];
let MOCK_DAYPARTS=[];
let MOCK_ALERTS=[];
let MOCK_RECV=[];
let MOCK_SENT=[];
let MOCK_SERVERS=[];
let MOCK_DISCOUNTS=[];
let MOCK_VOIDS=[];
let MOCK_BATCH={cardTotal:0,cashTotal:0,tipsEntered:0,tipsTotal:0,tipAmount:0};
const DISC_WARN_PCT=3, DISC_CRIT_PCT=5;
const TIME_LABELS=['11a','12p','1p','2p','3p','4p','5p','now'];

/* ═══════════════════════════════════════════════════════════
   §2  SHARED HELPERS
   ═══════════════════════════════════════════════════════════ */
function unreadCount(a){return a.filter(m=>!m.read).length;}
  function stColor(s){return s==='APPROVED'?'var(--cyan)':s==='DENIED'?'var(--red)':'var(--yellow)';}

function w98Bar(pct,color,n){
  n=n||12;const f=Math.round(n*(Math.min(100,Math.max(0,pct))/100));let h='';
  for(let i=0;i<n;i++) h+=i<f?`<div style="width:8px;height:100%;flex-shrink:0;background:${color};box-shadow:0 0 4px ${color}66;"></div>`:'<div style="width:8px;height:100%;flex-shrink:0;background:#2a2a2a;border:1px solid #333;"></div>';
  return `<div style="height:16px;border-top:2px solid #1a1a1a;border-left:2px solid #1a1a1a;border-bottom:2px solid #555;border-right:2px solid #555;background:#2a2a2a;display:flex;align-items:center;padding:1px;gap:1px;overflow:hidden;">${h}</div>`;
}

function sparkSVG(w,h,td,lw,labels){
  if(!td.length||!lw.length)return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px;display:block;"><text x="${w/2}" y="${h/2}" fill="#666" font-size="10" text-anchor="middle" font-family="monospace">No data</text></svg>`;
  const mx=Math.max(...td,...lw)||1,pts=td.length,step=w/(pts-1),pad=3;
  const toY=v=>pad+(h-2*pad)*(1-v/mx);
  const tp=td.map((v,i)=>`${(i*step).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const lp=lw.map((v,i)=>`${(i*step).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const area=tp+` ${((pts-1)*step).toFixed(1)},${h} 0,${h}`;
  let grid='';for(let g=.25;g<1;g+=.25)grid+=`<line x1="0" y1="${(h*g).toFixed(1)}" x2="${w}" y2="${(h*g).toFixed(1)}" stroke="#333" stroke-width="0.5"/>`;
  let lb='';if(labels)TIME_LABELS.forEach((t,i)=>{lb+=`<text x="${(i*step).toFixed(1)}" y="${h+10}" fill="#C6FFBB" font-size="9" font-family="monospace" text-anchor="middle">${t}</text>`;});
  return `<svg viewBox="0 0 ${w} ${labels?h+14:h}" style="width:100%;height:${labels?h+14:h}px;display:block;" preserveAspectRatio="none"><defs><linearGradient id="sf1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#33ffff" stop-opacity="0.25"/><stop offset="100%" stop-color="#33ffff" stop-opacity="0.02"/></linearGradient></defs>${grid}<polygon points="${area}" fill="url(#sf1)"/><polyline points="${tp}" fill="none" stroke="#33ffff" stroke-width="2" stroke-linejoin="miter" style="filter:drop-shadow(0 0 5px rgba(51,255,255,0.6));"/><polyline points="${lp}" fill="none" stroke="#b48efa" stroke-width="1.5" stroke-dasharray="5 3" stroke-linejoin="miter"/><rect x="${((pts-1)*step-2).toFixed(1)}" y="${(toY(td[pts-1])-2).toFixed(1)}" width="4" height="4" fill="#33ffff" style="filter:drop-shadow(0 0 5px rgba(51,255,255,0.7));"/>${lb}</svg>`;
}

  function donutSVG(pct,sz){
    const cx=sz/2,cy=sz/2,r=sz/2-8,circ=2*Math.PI*r,filled=circ*(pct/100),gap=circ-filled;
    const iW=pct>=MOCK_LABOR_WARN,iC=pct>=MOCK_LABOR_CRIT;
    const col=iC?'var(--red)':iW?'var(--yellow)':'var(--cyan)',glow=iC?'rgba(255,51,85,0.5)':iW?'rgba(255,255,0,0.4)':'rgba(51,255,255,0.5)';
    const st=iC?'CRITICAL':iW?'WARNING':'HEALTHY',sc=iC?'var(--red)':iW?'var(--yellow)':'#39b54a';
    return `<svg viewBox="0 0 ${sz} ${sz}" style="width:${sz}px;height:${sz}px;display:block;margin:0 auto;"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1a1a1a" stroke-width="10"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="10" stroke-dasharray="${filled.toFixed(1)} ${gap.toFixed(1)}" stroke-dashoffset="${(circ*.25).toFixed(1)}" stroke-linecap="butt" style="filter:drop-shadow(0 0 6px ${glow});"/><text x="${cx}" y="${cy-4}" fill="${col}" font-size="22" font-weight="bold" text-anchor="middle" font-family="monospace" style="filter:drop-shadow(0 0 6px ${glow});">${pct}%</text><text x="${cx}" y="${cy+12}" fill="${sc}" font-size="9" text-anchor="middle" font-family="monospace">${st}</text></svg>`;
  }

/* ═══════════════════════════════════════════════════════════
   §3  SCENE
   ═══════════════════════════════════════════════════════════ */
registerScene('snapshot',{
  onEnter(el){
    const staff=APP.staff, isMgr=staff.role==='manager', serverId=staff.id;
    let leftTop='default',leftBot='default',rightTop='default',rightBot='default';
    const openShift=new Set(),openMsg=new Set(),openRpt=new Set(),openSvr=new Set();
    const selTables=new Set();let showFloor=false;
    let serverData = null; // To hold data from backend

    async function fetchServerData(){
      try {
        const resp = await fetch(`/api/v1/servers/${serverId}/snapshot`);
        serverData = await resp.json();
        draw();
      } catch(e) {
        console.error("Failed to fetch server snapshot data", e);
      }
    }

    if (!isMgr) fetchServerData();
    if (isMgr) fetchManagerSnapshot();

    async function fetchManagerSnapshot(){
      try {
        const resp = await fetch('/api/v1/servers/manager/snapshot');
        if (resp.ok) {
          const data = await resp.json();
          // Populate snapshot data from API response if available
          if (data.servers) MOCK_SERVERS = data.servers;
          if (data.batch) MOCK_BATCH = data.batch;
          if (data.discounts) MOCK_DISCOUNTS = data.discounts;
          if (data.voids) MOCK_VOIDS = data.voids;
          if (data.alerts) MOCK_ALERTS = data.alerts;
          if (data.received) MOCK_RECV = data.received;
          if (data.sent) MOCK_SENT = data.sent;
          if (data.hourly_today) MOCK_HOURLY_TODAY = data.hourly_today;
          if (data.hourly_last_week) MOCK_HOURLY_LASTWK = data.hourly_last_week;
          if (data.labor) {
            MOCK_LABOR_PCT = data.labor.pct || 0;
            MOCK_LABOR_COST = data.labor.cost || 0;
            MOCK_LABOR_SALES = data.labor.sales || 0;
            MOCK_SPLH_NOW = data.labor.splh_now || 0;
            MOCK_SPLH_LAST = data.labor.splh_last || 0;
          }
          if (data.roles) MOCK_ROLES = data.roles;
          if (data.dayparts) MOCK_DAYPARTS = data.dayparts;
          draw();
        }
      } catch(e) {
        console.log('Manager snapshot fetch failed — showing zero state');
        draw();
      }
    }

    function cardFlex(s){return s==='collapsed'?'flex:0 0 24px;':'flex:1;';}
    function showToast(t){const d=document.createElement('div');d.style.cssText='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--mint);color:var(--bg);padding:14px 28px;font-size:16px;font-weight:bold;z-index:200;pointer-events:none;opacity:1;transition:opacity 0.5s;';d.textContent=t;el.style.position='relative';el.appendChild(d);setTimeout(()=>{d.style.opacity='0';},1200);setTimeout(()=>{d.remove();},1800);}
    function toggleLeft(w){if(w==='top'){if(leftTop==='expanded'){leftTop='default';leftBot='default';}else{leftTop='expanded';leftBot='collapsed';}}else{if(leftBot==='expanded'){leftBot='default';leftTop='default';}else{leftBot='expanded';leftTop='collapsed';}}draw();}
    function toggleRight(w){if(w==='top'){if(rightTop==='expanded'){rightTop='default';rightBot='default';}else{rightTop='expanded';rightBot='collapsed';}}else{if(rightBot==='expanded'){rightBot='default';rightTop='default';}else{rightBot='expanded';rightTop='collapsed';}}draw();}
    function toggleSub(set,id,parent){if(set.has(id))set.delete(id);else{set.clear();set.add(id);if(parent==='shift'&&leftTop!=='expanded'){leftTop='expanded';leftBot='collapsed';}if(parent==='msg'&&leftBot!=='expanded'){leftBot='expanded';leftTop='collapsed';}if(parent==='rpt'&&rightTop!=='expanded'){rightTop='expanded';rightBot='collapsed';}}draw();}

    // ── New check overlay ──
    function showNewCheck(){
      let name='',guests=null;const ov=document.createElement('div');ov.className='overlay';
      function dd(){const ready=guests!==null;
        ov.innerHTML=`<div class="dialog"><div class="dlg-h"><span>New Check</span><span style="cursor:pointer;" id="nc-close">\u2715</span></div><div class="dlg-b"><div><div style="font-size:15px;opacity:0.3;margin-bottom:4px;">Table Name</div><input type="text" id="nc-n" placeholder="e.g. Window 2" value="${name}" maxlength="20"></div><div><div style="font-size:15px;opacity:0.3;margin-bottom:4px;">Guests</div><div style="display:flex;gap:4px;flex-wrap:wrap;" id="nc-g"></div></div></div><div class="dlg-f"><div class="btn-s" style="border:1px solid var(--mint-dim);" id="nc-cancel">Cancel</div><div class="btn-p ${ready?'':'btn-off'}" id="nc-ok">Open \u25B6</div></div></div>`;
        ov.querySelector('#nc-close').onclick=()=>ov.remove();ov.querySelector('#nc-cancel').onclick=()=>ov.remove();ov.querySelector('#nc-n').oninput=e=>{name=e.target.value;};
        const gc=ov.querySelector('#nc-g');for(let n=1;n<=8;n++){const b=document.createElement('div');b.className=guests===n?'btn-p':'btn-s';b.style.cssText=`width:46px;height:42px;font-size:17px;font-weight:bold;${guests!==n?'border:1px solid var(--mint-dim);':''}`;b.textContent=n;b.onclick=()=>{guests=n;dd();};gc.appendChild(b);}
        ov.querySelector('#nc-ok').onclick=()=>{if(!guests)return;const o={id:'C-'+APP.nextNum++,label:name.trim()||('Table '+(APP.nextNum-1)),guest_count:guests,server:staff.name,status:'open',elapsed:'0:00',items:[]};APP.orders.push(o);ov.remove();go('check-editing',{order:o});};
      }
      dd();el.appendChild(ov);
    }

    /* ── SHIFT OVERVIEW ── */
    function buildServerShift(){
      const so=openShift, d=serverData;
      if (!d) return `<div style="padding:20px;text-align:center;color:var(--mint);font-family:var(--fb);">Loading shift data...</div>`;
      const sales=d.sales, tips=d.tips, counts=d.checks, tipout=d.tip_out;
      
      return `
      <div style="border:2px solid #eee;border-right-color:#558;border-bottom-color:#558;background:#222;overflow:hidden;margin-bottom:8px;">
        <div style="background:var(--mint);color:#222;padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="shift|sales"><span>SALES</span><span style="font-size:14px;">${so.has('sales')?'\u25B4':'\u25BE'}</span></div>
        <div style="padding:6px;background:#111;"><div style="border:1px solid #444;background:#1a1a1a;padding:3px;">${sparkSVG(230,35,d.hourly_pace.map(p=>p.count),MOCK_HOURLY_LASTWK.map(()=>0),false)}</div></div>
        ${so.has('sales')?`<div style="padding:6px;">
          <div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;"><span style="font-size:13px;color:var(--mint);">Total Sales</span><span style="font-size:20px;color:var(--gold);font-weight:bold;text-shadow:0 0 8px rgba(252,190,64,0.4);">$${sales.net_sales.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;"><span style="font-size:13px;color:var(--mint);">Covers</span><span style="font-size:16px;color:var(--cyan);">${sales.covers}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;"><span style="font-size:13px;color:var(--mint);">PPA</span><span style="font-size:16px;color:var(--gold);">$${sales.per_cover_avg.toFixed(2)}</span></div>
        </div>`:''}
      </div>

      <div style="border:2px solid #eee;border-right-color:#558;border-bottom-color:#558;background:#222;overflow:hidden;margin-bottom:8px;">
        <div style="background:var(--mint);color:#222;padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="shift|tips"><span>CURRENT TIPS</span><span style="font-size:14px;">${so.has('tips')?'\u25B4':'\u25BE'}</span></div>
        <div style="padding:6px;background:#111;"><div style="border:1px solid #444;background:#1a1a1a;padding:3px;text-align:center;font-size:18px;color:var(--gold);font-weight:bold;">$${tips.tips_earned.toFixed(2)}</div></div>
        ${so.has('tips')?`<div style="padding:6px;">
          <div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span style="font-size:11px;color:var(--mint);">Earned</span><span style="font-size:13px;color:var(--gold);font-weight:bold;">$${tips.tips_earned.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span style="font-size:11px;color:var(--mint);">Pending</span><span style="font-size:13px;color:var(--cyan);">$${tips.pending_tips.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span style="font-size:11px;color:var(--mint);">Tip-Out</span><span style="font-size:13px;color:var(--gold);">-$${tipout.total_owed.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;border-top:1px solid #444;padding-top:4px;"><span style="font-size:12px;color:#39b54a;font-weight:bold;">WALK-WITH</span><span style="font-size:16px;color:#39b54a;font-weight:bold;text-shadow:0 0 8px rgba(57,181,74,0.4);">$${tipout.walk_with.toFixed(2)}</span></div>
          <div style="margin-top:8px;max-height:120px;overflow-y:auto;border:1px solid #444;background:#1a1a1a;">
            ${tips.tip_list.map(t=>`<div style="display:flex;justify-content:space-between;padding:4px;font-size:10px;border-bottom:1px solid #333;"><span>${t.table}</span><span style="color:var(--gold);">$${t.tip_amount.toFixed(2)}</span></div>`).join('')}
          </div>
        </div>`:''}
      </div>

      <div style="border:2px solid #eee;border-right-color:#558;border-bottom-color:#558;background:#222;overflow:hidden;margin-bottom:8px;">
        <div style="background:var(--mint);color:#222;padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="shift|guests"><span>GUEST COUNT</span><span style="font-size:14px;">${so.has('guests')?'\u25B4':'\u25BE'}</span></div>
        <div style="padding:6px;background:#111;"><div style="border:1px solid #444;background:#1a1a1a;padding:3px;">
          <div style="display:flex;align-items:flex-end;gap:2px;height:24px;">
            ${d.hourly_pace.map(p=>`<div style="flex:1;height:${Math.min(100,(p.count/10)*100)}%;background:var(--cyan);box-shadow:0 0 4px rgba(51,255,255,0.4);"></div>`).join('')}
          </div>
        </div></div>
        ${so.has('guests')?`<div style="padding:6px;">
          <div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          <div style="display:flex;justify-content:space-between;"><span style="font-size:13px;color:var(--mint);">Total Guests</span><span style="font-size:20px;color:var(--cyan);font-weight:bold;">${sales.covers}</span></div>
        </div>`:''}
      </div>

      <div style="border:2px solid #eee;border-right-color:#558;border-bottom-color:#558;background:#222;overflow:hidden;margin-bottom:8px;">
        <div style="background:var(--mint);color:#222;padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="shift|tables"><span>TABLES TURNED</span><span style="font-size:14px;">${so.has('tables')?'\u25B4':'\u25BE'}</span></div>
        <div style="padding:6px;background:#111;"><div style="border:1px solid #444;background:#1a1a1a;padding:3px;text-align:center;font-size:18px;color:var(--cyan);font-weight:bold;">${counts.tables_turned}</div></div>
        ${so.has('tables')?`<div style="padding:6px;">
          <div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          <div style="font-size:11px;color:var(--mint);letter-spacing:1px;margin-bottom:4px;">CATEGORY MIX</div>
          ${d.category_mix.map(c=>`
            <div style="margin-bottom:6px;">
              <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;"><span style="color:var(--mint);">${c.category}</span><span style="color:var(--gold);">$${c.total.toFixed(2)}</span></div>
              <div style="height:6px;background:#1a1a1a;border:1px solid #444;"><div style="height:100%;width:${Math.min(100,(c.total/(sales.net_sales||1))*100)}%;background:var(--cyan);box-shadow:0 0 4px rgba(51,255,255,0.4);"></div></div>
            </div>
          `).join('')}
        </div>`:''}
      </div>
      `;
    }

    /* ── SHIFT OVERVIEW ── */
    function buildShift(){
      if (!isMgr && serverData) return buildServerShift();
      const gross=APP.orders.reduce((s,o)=>s+calcOrder(o).sub,0);const myGross=APP.orders.filter(o=>o.server===staff.name).reduce((s,o)=>s+calcOrder(o).sub,0);
      const sv=isMgr?gross:myGross,sl=isMgr?'Today':'My Sales';
      const tt=MOCK_HOURLY_TODAY.reduce((a,b)=>a+b,0),lt=MOCK_HOURLY_LASTWK.reduce((a,b)=>a+b,0);
      const sd=lt>0?((tt-lt)/lt*100).toFixed(0):0;
      const spd=MOCK_SPLH_LAST>0?((MOCK_SPLH_NOW-MOCK_SPLH_LAST)/MOCK_SPLH_LAST*100).toFixed(0):0;
      const lf=(MOCK_LABOR_PCT/40)*100,lw=(MOCK_LABOR_WARN/40)*100,lc=(MOCK_LABOR_CRIT/40)*100;
      const iW=MOCK_LABOR_PCT>=MOCK_LABOR_WARN,iC=MOCK_LABOR_PCT>=MOCK_LABOR_CRIT;
      const lCol=iC?'var(--red)':iW?'var(--yellow)':'var(--cyan)',lBdr=iC?'var(--red)':iW?'var(--yellow)':'var(--mint)',lHdr=iC?'var(--red)':iW?'var(--yellow)':'var(--mint)';
      const HS=MOCK_HOURLY_TODAY.map((s,i)=>MOCK_HR_LABOR[i]>0?Math.round(s/MOCK_HR_LABOR[i]):0);
      const HLW=MOCK_HOURLY_LASTWK.map((s,i)=>MOCK_HR_LABOR_LW[i]>0?Math.round(s/MOCK_HR_LABOR_LW[i]):0);
      const SM=Math.max(...HS,...HLW),mrc=Math.max(...MOCK_ROLES.map(r=>r.cost));
      const so=openShift;

      let html=`
      <div style="border:2px solid #eee;border-right-color:#558;border-bottom-color:#558;background:#222;overflow:hidden;margin-bottom:8px;">
        <div style="background:var(--mint);color:#222;padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="shift|sales"><span>NET SALES</span><span style="font-size:14px;">${so.has('sales')?'\u25B4':'\u25BE'}</span></div>
        <div style="padding:6px;background:#111;"><div style="border:1px solid #444;background:#1a1a1a;padding:3px;">${sparkSVG(230,35,MOCK_HOURLY_TODAY,MOCK_HOURLY_LASTWK,false)}</div></div>
        ${so.has('sales')?`<div style="padding:6px;">
          <div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;"><span style="font-size:13px;color:var(--mint);">${sl}</span><span style="font-size:20px;color:var(--gold);font-weight:bold;text-shadow:0 0 8px rgba(252,190,64,0.4);">$${sv.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;"><span style="font-size:11px;color:var(--lavender);">Last wk</span><span style="font-size:16px;color:var(--lavender);">$${lt.toLocaleString()}</span></div>
          <div style="text-align:center;margin:4px 0;"><span style="font-size:16px;font-weight:bold;color:${sd>=0?'#39b54a':'var(--red)'};">${sd>=0?'\u25B2':'\u25BC'} ${Math.abs(sd)}%</span></div>
          <div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          <div style="font-size:11px;color:var(--mint);letter-spacing:1px;margin-bottom:4px;">DAYPARTS</div>
          ${MOCK_DAYPARTS.map(dp=>{const dd=((dp.today-dp.lastWk)/dp.lastWk*100).toFixed(0);return `<div style="border:1px solid #444;background:#1a1a1a;padding:8px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;"><div><div style="font-size:13px;color:var(--mint);">${dp.name} <span style="font-size:10px;opacity:0.5;">${dp.time}</span></div><div style="font-size:10px;margin-top:2px;"><span style="color:var(--cyan);">${dp.pct}%</span> <span style="margin-left:6px;color:${dd>=0?'#39b54a':'var(--red)'};">${dd>=0?'\u25B2':'\u25BC'}${Math.abs(dd)}%</span></div></div><div style="font-size:18px;color:var(--gold);font-weight:bold;">$${dp.today.toLocaleString()}</div></div>`;}).join('')}
        </div>`:''}
      </div>

      <div style="border:2px solid ${lBdr};background:#222;overflow:hidden;margin-bottom:8px;">
        <div style="background:${lHdr};color:#222;padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="shift|labor"><span>LABOR</span><span style="font-size:14px;">${so.has('labor')?'\u25B4':'\u25BE'}</span></div>
        <div style="padding:6px;"><div style="height:24px;border:1px solid #444;background:linear-gradient(to right,#33ffff 0%,#33ffff ${lf}%,#1a1a1a ${lf}%,#1a1a1a ${lw-4}%,#ffff00 ${lw-4}%,#ffff00 ${lw+4}%,#1a1a1a ${lw+4}%,#1a1a1a ${lc-4}%,#ff3355 ${lc-4}%,#ff3355 ${lc+4}%,#1a1a1a ${lc+4}%,#1a1a1a 100%);"></div></div>
        ${so.has('labor')?`<div style="padding:0 6px 6px;">
          <div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          ${donutSVG(MOCK_LABOR_PCT,110)}
          <div style="display:flex;justify-content:space-around;margin:6px 0;font-size:11px;text-align:center;"><div><div style="font-size:16px;color:#fcbe40;font-weight:bold;">$${MOCK_LABOR_COST}</div><div style="color:var(--mint);opacity:0.6;">Labor</div></div><div><div style="font-size:16px;color:#fcbe40;font-weight:bold;">$${MOCK_LABOR_SALES}</div><div style="color:var(--mint);opacity:0.6;">Sales</div></div></div>
          <div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          <div style="font-size:11px;color:var(--mint);letter-spacing:1px;margin-bottom:4px;">BY ROLE</div>
          ${MOCK_ROLES.map(r=>`<div style="display:flex;align-items:center;font-size:11px;padding:3px 0;border-bottom:1px solid rgba(198,255,187,0.1);"><span style="width:55px;color:${r.color};">${r.name}</span><div style="flex:1;height:8px;background:#1a1a1a;position:relative;margin:0 8px;"><div style="height:100%;width:${(r.cost/mrc*100).toFixed(0)}%;background:${r.color};box-shadow:0 0 4px ${r.color}55;"></div></div><span style="color:#fcbe40;width:40px;text-align:right;">$${r.cost}</span></div>`).join('')}
        </div>`:''}
      </div>

      <div style="border:2px solid var(--mint);background:#222;overflow:hidden;border-radius:5px;">
        <div style="background:var(--mint);color:#222;padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="shift|splh"><span>SALES / LABOR HR</span><span style="font-size:14px;">${so.has('splh')?'\u25B4':'\u25BE'}</span></div>
        <div style="padding:6px;"><div style="border:1px solid #444;background:#1a1a1a;padding:3px;"><div style="display:flex;gap:3px;height:24px;"><div style="flex:${MOCK_SPLH_NOW};background:#33ffff;box-shadow:0 0 8px rgba(51,255,255,0.5);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#222;">$${MOCK_SPLH_NOW}</div><div style="flex:${MOCK_SPLH_LAST};background:#b48efa;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#222;">$${MOCK_SPLH_LAST}</div></div></div></div>
        ${so.has('splh')?`<div style="padding:0 6px 6px;">
          <div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:13px;color:var(--mint);">Avg Today</span><span style="font-size:20px;color:#fcbe40;font-weight:bold;">$${MOCK_SPLH_NOW}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:11px;color:#b48efa;">Last wk</span><span style="font-size:16px;color:#b48efa;">$${MOCK_SPLH_LAST}</span></div>
          <div style="text-align:center;margin:2px 0 6px;"><span style="font-size:16px;font-weight:bold;color:${spd>=0?'#39b54a':'#ff3355'};">${spd>=0?'\u25B2':'\u25BC'} ${Math.abs(spd)}%</span></div>
          <div style="border:1px solid #444;background:#1a1a1a;padding:4px;">
            <div style="display:flex;align-items:flex-end;gap:2px;height:80px;padding:0 2px;">${HS.map((v,i)=>{const hT=Math.round((v/SM)*100),hL=Math.round((HLW[i]/SM)*100);return `<div style="flex:1;display:flex;gap:1px;align-items:flex-end;height:100%;"><div style="flex:1;height:${hT}%;background:#33ffff;box-shadow:0 0 6px rgba(51,255,255,0.4);"></div><div style="flex:1;height:${hL}%;background:#b48efa;"></div></div>`;}).join('')}</div>
            <div style="display:flex;justify-content:space-around;font-size:8px;color:var(--mint);padding:2px;">${TIME_LABELS.map(t=>`<span>${t}</span>`).join('')}</div>
          </div>
        </div>`:''}
      </div>`;
      return html;
    }

    /* ── MESSENGER ── */
    function buildServerMessenger(){
      const om=openMsg, d=serverData;
      // For now, reuse mocks if serverData doesn't have messenger info
      const alerts = MOCK_ALERTS; // In real, should come from backend
      const sent = MOCK_SENT;
      const aU=unreadCount(alerts), sU=unreadCount(sent);
      
      function mc(cat,unr,opn){const cols={alert:'#ff3355',sent:'#b48efa'};if(opn)return `border:2px solid ${cols[cat]};`;return `border:2px solid ${unr?'var(--mint)':'var(--bg3)'};`;}
      function mh(cat,unr,opn){const cols={alert:'#ff3355',sent:'#b48efa'};if(opn)return `background:${cols[cat]};color:#222;`;if(unr)return 'background:var(--mint);color:#222;';return 'background:var(--bg3);color:var(--mint);opacity:0.6;';}

      return `
      <div style="${mc('alert',aU>0,om.has('alerts'))}background:#222;overflow:hidden;border-radius:5px;">
        <div style="${mh('alert',aU>0,om.has('alerts'))}padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="msg|alerts"><span>ALERTS (${alerts.length})${aU>0?' \u2022 '+aU+' NEW':''}</span><span style="font-size:14px;">${om.has('alerts')?'\u25B4':'\u25BE'}</span></div>
        ${om.has('alerts')?`<div style="padding:6px;">
          ${alerts.map(a=>`<div style="border:1px solid #444;background:#1a1a1a;padding:8px;margin-bottom:4px;font-size:11px;border-left:3px solid ${!a.read?'var(--mint)':'var(--bg3)'};${!a.read?'background:#1a2a1a;':''}" ${!a.read?`data-markread="alerts|${a.id}"`:''}>
            <div style="color:var(--mint);">${a.text}</div><div style="font-size:9px;color:var(--mint);opacity:0.5;margin-top:4px;">${a.time}${!a.read?' \u2022 tap to dismiss':''}</div></div>`).join('')}
        </div>`:''}
      </div>

      <div style="${mc('sent',sU>0,om.has('sent'))}background:#222;overflow:hidden;border-radius:5px;">
        <div style="${mh('sent',sU>0,om.has('sent'))}padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="msg|sent"><span>SENT (${sent.length})${sU>0?' \u2022 '+sU+' PENDING':''}</span><span style="font-size:14px;">${om.has('sent')?'\u25B4':'\u25BE'}</span></div>
        ${om.has('sent')?`<div style="padding:6px;">
          ${sent.map(s=>`<div style="border:1px solid #444;background:#1a1a1a;padding:8px;margin-bottom:4px;font-size:11px;border-left:3px solid ${!s.read?'var(--mint)':'var(--bg3)'};">
            <div><span style="color:#fcbe40;font-weight:bold;">${s.type}</span><span style="float:right;font-weight:bold;color:${stColor(s.status)};">${s.status}</span></div>
            <div style="color:var(--mint);opacity:0.7;margin-top:2px;">${s.ref} \u2014 ${s.reason}</div>
            <div style="font-size:9px;opacity:0.5;margin-top:4px;">${s.time}</div>
          </div>`).join('')}
        </div>`:''}
      </div>`;
    }

    /* ── MESSENGER ── */
    function buildMessenger(){
      if (!isMgr && serverData) return buildServerMessenger();
      const om=openMsg,aU=unreadCount(MOCK_ALERTS),rU=unreadCount(MOCK_RECV),sU=unreadCount(MOCK_SENT);
      const a86=MOCK_ALERTS.filter(a=>a.type==='86'&&!a.read);
      function mc(cat,unr,opn){const cols={alert:'#ff3355',recv:'#33ffff',sent:'#b48efa'};if(opn)return `border:2px solid ${cols[cat]};`;return `border:2px solid ${unr?'var(--mint)':'var(--bg3)'};`;}
      function mh(cat,unr,opn){const cols={alert:'#ff3355',recv:'#33ffff',sent:'#b48efa'};if(opn)return `background:${cols[cat]};color:#222;`;if(unr)return 'background:var(--mint);color:#222;';return 'background:var(--bg3);color:var(--mint);opacity:0.6;';}

      let html=`
      <div style="${mc('alert',aU>0,om.has('alerts'))}background:#222;overflow:hidden;border-radius:5px;">
        <div style="${mh('alert',aU>0,om.has('alerts'))}padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="msg|alerts"><span>ALERTS (${MOCK_ALERTS.length})${aU>0?' \u2022 '+aU+' NEW':''}</span><span style="font-size:14px;">${om.has('alerts')?'\u25B4':'\u25BE'}</span></div>
        ${om.has('alerts')?`<div style="padding:6px;">
          ${a86.length>0?`<div style="border:1px solid #ff3355;background:rgba(255,51,85,0.08);padding:6px;margin-bottom:6px;font-size:11px;"><div style="color:#ff3355;font-weight:bold;font-size:10px;letter-spacing:1px;margin-bottom:4px;">\u2718 86 LIST</div>${a86.map(a=>`<div style="color:#ff3355;margin-bottom:2px;">\u2718 ${a.text.split(' \u2014 ')[0]}</div>`).join('')}</div>`:''}
          ${MOCK_ALERTS.map(a=>`<div style="border:1px solid #444;background:#1a1a1a;padding:8px;margin-bottom:4px;font-size:11px;border-left:3px solid ${!a.read?'var(--mint)':'var(--bg3)'};${!a.read?'background:#1a2a1a;':''}" ${!a.read?`data-markread="alerts|${a.id}"`:''}>
            <div style="color:var(--mint);">${a.text}</div><div style="font-size:9px;color:var(--mint);opacity:0.5;margin-top:4px;">${a.time}${!a.read?' \u2022 tap to dismiss':''}</div></div>`).join('')}
          ${isMgr?'<div style="background:#FF8C00;color:#222;padding:6px;font-size:11px;font-weight:bold;cursor:pointer;text-align:center;margin-top:4px;letter-spacing:1px;" data-postalert="1">+ POST ALERT</div>':''}
        </div>`:''}
      </div>

      ${isMgr?`<div style="${mc('recv',rU>0,om.has('recv'))}background:#222;overflow:hidden;border-radius:5px;">
        <div style="${mh('recv',rU>0,om.has('recv'))}padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="msg|recv"><span>RECV (${MOCK_RECV.length})${rU>0?' \u2022 '+rU+' PENDING':''}</span><span style="font-size:14px;">${om.has('recv')?'\u25B4':'\u25BE'}</span></div>
        ${om.has('recv')?`<div style="padding:6px;">
          ${MOCK_RECV.map(r=>`<div style="border:1px solid #444;background:#1a1a1a;padding:8px;margin-bottom:4px;font-size:11px;border-left:3px solid ${!r.read?'var(--mint)':'var(--bg3)'};${!r.read?'background:#1a2a1a;':''}">
            <div style="color:#33ffff;font-weight:bold;margin-bottom:2px;">${r.from}</div>
            <div><span style="color:#fcbe40;font-weight:bold;">${r.type}</span><span style="float:right;font-weight:bold;color:${stColor(r.status)};">${r.status}</span></div>
            <div style="color:var(--mint);opacity:0.7;margin-top:2px;">${r.ref} \u2014 ${r.reason}</div>
            <div style="font-size:9px;opacity:0.5;margin-top:4px;">${r.time}</div>
            ${r.status==='PENDING'?`<div style="display:flex;gap:4px;margin-top:6px;"><div style="background:#39b54a;color:#222;padding:4px 10px;font-size:10px;font-weight:bold;cursor:pointer;" data-msgact="${r.id}|APPROVED">APPROVE</div><div style="background:#ff3355;color:#222;padding:4px 10px;font-size:10px;font-weight:bold;cursor:pointer;" data-msgact="${r.id}|DENIED">DENY</div></div>`:''}
          </div>`).join('')}
        </div>`:''}
      </div>`:''}

      <div style="${mc('sent',sU>0,om.has('sent'))}background:#222;overflow:hidden;border-radius:5px;">
        <div style="${mh('sent',sU>0,om.has('sent'))}padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="msg|sent"><span>SENT (${MOCK_SENT.length})${sU>0?' \u2022 '+sU+' PENDING':''}</span><span style="font-size:14px;">${om.has('sent')?'\u25B4':'\u25BE'}</span></div>
        ${om.has('sent')?`<div style="padding:6px;">
          ${MOCK_SENT.map(s=>`<div style="border:1px solid #444;background:#1a1a1a;padding:8px;margin-bottom:4px;font-size:11px;border-left:3px solid ${!s.read?'var(--mint)':'var(--bg3)'};">
            <div><span style="color:#fcbe40;font-weight:bold;">${s.type}</span><span style="float:right;font-weight:bold;color:${stColor(s.status)};">${s.status}</span></div>
            <div style="color:var(--mint);opacity:0.7;margin-top:2px;">${s.ref} \u2014 ${s.reason}</div>
            <div style="font-size:9px;opacity:0.5;margin-top:4px;">${s.time}</div>
          </div>`).join('')}
        </div>`:''}
      </div>`;
      return html;
    }

    /* ── REPORTING ── */
    function buildServerReporting(){
      const so=openRpt, d=serverData;
      const blockers=d.blockers;
      
      const pct=blockers.blocker_count > 0 ? 0 : 100; // Simplified progress bar

      return `
      <div style="border:2px solid var(--mint);background:#222;overflow:hidden;border-radius:5px;">
        <div style="background:var(--mint);color:#222;padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="rpt|checkout"><span>MY CHECKOUT</span><span style="font-size:14px;">${so.has('checkout')?'\u25B4':'\u25BE'}</span></div>
        <div style="padding:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            ${w98Bar(pct, '#33ffff', 20)}
            <span style="color:#fcbe40;font-size:11px;font-weight:bold;margin-left:8px;">Tip-out: $${d.tip_out.total_owed.toFixed(2)}</span>
          </div>
        </div>
        ${so.has('checkout')?`<div style="padding:0 6px 6px;">
          <div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          ${blockers.open_checks.length > 0 ? `<div style="font-size:11px;color:#ff3355;margin-bottom:4px;">OPEN CHECKS (${blockers.open_checks.length})</div>
          ${blockers.open_checks.map(c=>`<div style="border:1px solid #444;background:#1a1a1a;padding:6px;margin-bottom:4px;display:flex;justify-content:space-between;font-size:11px;"><span>Table ${c.table}</span><span style="color:#fcbe40;">$${c.amount.toFixed(2)}</span></div>`).join('')}` : ''}
          
          <div style="font-size:11px;color:var(--mint);margin:8px 0 4px;">TIPS RECONCILIATION</div>
          <div style="max-height:150px;overflow-y:auto;">
            ${blockers.all_tips.map(t=>`
              <div style="border:1px solid #444;background:${t.is_adjusted?'#1a1a1a':'var(--mint)'};color:${t.is_adjusted?'var(--mint)':'#222'};padding:6px;margin-bottom:4px;display:flex;justify-content:space-between;font-size:11px;cursor:pointer;" data-tipadj="${t.order_id}">
                <span>${t.table}</span><span>$${t.tip_amount.toFixed(2)}</span>
              </div>
            `).join('')}
          </div>

          ${blockers.is_ready ? `<div style="background:#39b54a;color:#222;padding:8px;font-weight:bold;text-align:center;margin-top:8px;cursor:pointer;" id="svr-checkout-btn">✓ CHECK OUT</div>` : ''}
        </div>`:''}
      </div>

      <div style="border:2px solid var(--mint);background:#222;overflow:hidden;border-radius:5px;">
        <div style="background:var(--mint);color:#222;padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="rpt|shift"><span>MY SHIFT</span><span style="font-size:14px;">${so.has('shift')?'\u25B4':'\u25BE'}</span></div>
        <div style="padding:6px;font-size:12px;color:var(--mint);text-align:center;">
          4h 22m this shift \u2022 28.5h period
        </div>
        ${so.has('shift')?`<div style="padding:0 6px 6px;">
          <div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:11px;opacity:0.6;">Clock-in</span><span style="font-size:11px;">7:00 PM</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:11px;opacity:0.6;">Shift Total</span><span style="font-size:14px;color:#33ffff;font-weight:bold;">4h 22m</span></div>
        </div>`:''}
      </div>
      `;
    }

    /* ── REPORTING ── */
    function buildReporting(){
      if (!isMgr && serverData) return buildServerReporting();
      const or=openRpt;
      const coCount=MOCK_SERVERS.filter(s=>s.checkedOut).length,tSvrs=MOCK_SERVERS.length;
      const hasCO=coCount>0,allCO=coCount===tSvrs,coPct=tSvrs>0?(coCount/tSvrs*100):0;
      const tGross=MOCK_SERVERS.reduce((s,v)=>s+v.gross,0);
      const dT=MOCK_DISCOUNTS.reduce((s,d)=>s+d.amount,0),vT=MOCK_VOIDS.reduce((s,v)=>s+v.amount,0);
      const lPct=tGross>0?((dT+vT)/tGross*100):0,dPct=tGross>0?(dT/tGross*100):0,vPct=tGross>0?(vT/tGross*100):0;
      const dwc=lPct>=DISC_CRIT_PCT?'border-color:#ff3355;':lPct>=DISC_WARN_PCT?'border-color:#ffff00;':'';
      const dwh=lPct>=DISC_CRIT_PCT?'background:#ff3355;':lPct>=DISC_WARN_PCT?'background:#ffff00;':'background:var(--mint);';
      function sBlk(sv){if(sv.checkedOut)return[];const b=[];if(sv.openChecks>0)b.push({icon:'#ff3355',text:sv.openChecks+' open check'+(sv.openChecks>1?'s':'')});if(sv.unadjustedTips>0)b.push({icon:'#fcbe40',text:sv.unadjustedTips+' unadjusted tip'+(sv.unadjustedTips>1?'s':'')});return b;}
      function sSt(sv){if(sv.checkedOut)return 'done';return sBlk(sv).length===0?'ready':'blocked';}
      function sPr(sv){if(sv.checkedOut)return 100;let d=0;if(sv.openChecks===0)d++;if(sv.unadjustedTips===0)d++;return (d/2)*100;}

      let html=`
      <div style="border:2px solid var(--mint);background:#222;overflow:hidden;border-radius:5px;">
        <div style="background:${or.has('checkouts')?'#33ffff':'var(--mint)'};color:#222;padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="rpt|checkouts"><span>CHECKOUTS (${coCount}/${tSvrs})</span><span style="font-size:14px;">${or.has('checkouts')?'\u25B4':'\u25BE'}</span></div>
        <div style="padding:6px;">${w98Bar(coPct,'#33ffff')}</div>
        ${or.has('checkouts')?`<div style="padding:0 6px 6px;"><div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          ${MOCK_SERVERS.map(sv=>{const st=sSt(sv),bl=sBlk(sv),bc=st==='done'?'#39b54a':st==='ready'?'#33ffff':'#ffff00';const stxt=st==='done'?'\u2713 '+sv.checkoutTime:st==='ready'?'READY':bl.length+' ISSUE'+(bl.length>1?'S':'');const iso=openSvr.has(sv.name);
            return `<div style="border:1px solid #444;background:#1a1a1a;margin-bottom:4px;${st==='done'?'opacity:0.35;':''}overflow:hidden;">
              <div style="padding:6px 8px;cursor:${st!=='done'?'pointer':'default'};" data-svrtoggle="${st!=='done'?sv.name:''}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;"><span style="font-weight:bold;font-size:12px;color:${bc};">${sv.name}</span><span style="font-size:10px;font-weight:bold;color:${bc};">${stxt}</span></div>
                ${w98Bar(sPr(sv),bc)}
                <div style="display:flex;justify-content:space-between;font-size:9px;margin-top:2px;"><span style="color:#fcbe40;">$${sv.gross.toFixed(2)}</span>${sv.reminded&&st==='blocked'?'<span style="color:#FF8C00;">REMINDED</span>':''}</div>
              </div>
              ${iso&&st==='blocked'?`<div style="padding:4px 8px 8px;border-top:1px solid #333;"><div style="font-size:9px;color:var(--mint);letter-spacing:1px;margin-bottom:4px;">BLOCKERS</div>${bl.map(b=>`<div style="display:flex;align-items:center;gap:6px;font-size:10px;padding:3px 0;"><div style="width:6px;height:6px;background:${b.icon};box-shadow:0 0 4px ${b.icon};flex-shrink:0;"></div><span style="color:var(--mint);">${b.text}</span></div>`).join('')}<div style="display:flex;gap:4px;margin-top:6px;">${!sv.reminded?`<div style="background:#FF8C00;color:#222;padding:4px 8px;font-size:9px;font-weight:bold;cursor:pointer;" data-remind="${sv.name}">\u25B6 REMIND</div>`:'<div style="background:var(--bg3);color:var(--mint);padding:4px 8px;font-size:9px;opacity:0.5;">REMINDED</div>'}<div style="background:#ff3355;color:#222;padding:4px 8px;font-size:9px;font-weight:bold;cursor:pointer;" data-forceout="${sv.name}">FORCE OUT</div></div></div>`:''}
              ${iso&&st==='ready'?`<div style="padding:4px 8px 8px;border-top:1px solid #333;"><div style="font-size:10px;color:#39b54a;margin-bottom:6px;">\u2713 No blockers</div><div style="background:#33ffff;color:#222;padding:6px;font-size:9px;font-weight:bold;cursor:pointer;text-align:center;" data-docheckout="${sv.name}">CHECKOUT ${sv.name.split(' ')[0].toUpperCase()}</div></div>`:''}
            </div>`;}).join('')}
        </div>`:''}
      </div>

      <div style="border:2px solid var(--mint);${dwc}background:#222;overflow:hidden;border-radius:5px;">
        <div style="${or.has('disc')?'background:#fcbe40;':dwh}color:#222;padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" data-sub="rpt|disc"><span>DISC & VOIDS</span><span style="font-size:14px;">${or.has('disc')?'\u25B4':'\u25BE'}</span></div>
        <div style="padding:6px;font-size:11px;display:flex;justify-content:space-between;"><span>Disc: <span style="color:#fcbe40;">$${dT.toFixed(2)}</span></span><span>Voids: <span style="color:#ff3355;">$${vT.toFixed(2)}</span></span></div>
        ${or.has('disc')?`<div style="padding:0 6px 6px;"><div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          <div style="display:flex;justify-content:space-around;margin-bottom:8px;text-align:center;"><div><div style="font-size:18px;color:#fcbe40;font-weight:bold;">$${dT.toFixed(2)}</div><div style="font-size:10px;">Disc (${MOCK_DISCOUNTS.length}) ${dPct.toFixed(1)}%</div></div><div><div style="font-size:18px;color:#ff3355;font-weight:bold;">$${vT.toFixed(2)}</div><div style="font-size:10px;">Void (${MOCK_VOIDS.length}) ${vPct.toFixed(1)}%</div></div></div>
          ${w98Bar(lPct*10,lPct>=DISC_CRIT_PCT?'#ff3355':lPct>=DISC_WARN_PCT?'#ffff00':'#fcbe40')}
          <div style="font-size:10px;color:var(--mint);letter-spacing:1px;margin:6px 0 4px;">DISCOUNTS</div>
          ${MOCK_DISCOUNTS.map(d=>`<div style="border:1px solid #444;background:#1a1a1a;padding:6px;margin-bottom:3px;font-size:10px;border-left:3px solid #fcbe40;"><div style="display:flex;justify-content:space-between;"><span style="color:#fcbe40;font-weight:bold;">${d.type}</span><span style="color:#fcbe40;">-$${d.amount.toFixed(2)}</span></div><div style="opacity:0.6;margin-top:2px;">${d.ref} \u2014 ${d.reason}</div></div>`).join('')}
          <div style="font-size:10px;color:var(--mint);letter-spacing:1px;margin:4px 0;">VOIDS</div>
          ${MOCK_VOIDS.map(v=>`<div style="border:1px solid #444;background:#1a1a1a;padding:6px;margin-bottom:3px;font-size:10px;border-left:3px solid #ff3355;"><div style="display:flex;justify-content:space-between;"><span style="color:#ff3355;font-weight:bold;">${v.item}</span><span style="color:#ff3355;">-$${v.amount.toFixed(2)}</span></div><div style="opacity:0.6;margin-top:2px;">${v.ref} \u2014 ${v.reason}</div></div>`).join('')}
        </div>`:''}
      </div>

      <div style="border:2px solid ${!hasCO?'var(--bg3)':'var(--mint)'};background:#222;overflow:hidden;border-radius:5px;${!hasCO?'opacity:0.4;':''}">
        <div style="background:${!hasCO?'var(--bg3)':or.has('close')?'#39b54a':'var(--mint)'};color:#222;padding:1px 6px;font-size:11px;font-weight:bold;letter-spacing:1px;border-bottom:2px solid #222;cursor:${!hasCO?'not-allowed':'pointer'};display:flex;justify-content:space-between;align-items:center;" ${hasCO?'data-sub="rpt|close"':''}><span>CLOSE DAY${!hasCO?' \u2014 LOCKED':''}</span><span style="font-size:14px;">${!hasCO?'\u25CB':or.has('close')?'\u25B4':'\u25BE'}</span></div>
        ${hasCO?`<div style="padding:6px;font-size:11px;display:flex;justify-content:space-between;"><span>Tips: <span style="color:#fcbe40;">${MOCK_BATCH.tipsEntered}/${MOCK_BATCH.tipsTotal}</span></span><span>Batch: <span style="color:#fcbe40;">$${MOCK_BATCH.cardTotal.toFixed(2)}</span></span></div>
        ${or.has('close')?`<div style="padding:0 6px 6px;"><div style="height:1px;background:var(--mint-dim);margin:4px 0;"></div>
          <div style="border:1px solid #444;background:#1a1a1a;padding:8px;margin-bottom:4px;"><div style="font-size:10px;opacity:0.6;letter-spacing:1px;margin-bottom:4px;">SALES SUMMARY</div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;"><span>Gross</span><span style="color:#fcbe40;font-weight:bold;">$${tGross.toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;"><span>Disc</span><span style="color:#fcbe40;">-$${dT.toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;"><span>Voids</span><span style="color:#ff3355;">-$${vT.toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;font-size:12px;border-top:1px solid #444;padding-top:4px;margin-top:4px;"><span style="font-weight:bold;">Net</span><span style="color:#fcbe40;font-weight:bold;font-size:14px;">$${(tGross-dT-vT).toFixed(2)}</span></div></div>
          <div style="border:1px solid #444;background:#1a1a1a;padding:8px;margin-bottom:4px;"><div style="font-size:10px;opacity:0.6;letter-spacing:1px;margin-bottom:4px;">TIP RECONCILIATION</div>${w98Bar((MOCK_BATCH.tipsEntered/MOCK_BATCH.tipsTotal*100),'#fcbe40')}<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:4px;"><span>Entered</span><span style="color:#fcbe40;">${MOCK_BATCH.tipsEntered}/${MOCK_BATCH.tipsTotal}</span></div><div style="display:flex;justify-content:space-between;font-size:12px;"><span>Total</span><span style="color:#fcbe40;font-weight:bold;">$${MOCK_BATCH.tipAmount.toFixed(2)}</span></div></div>
          <div style="background:${allCO&&MOCK_BATCH.tipsEntered===MOCK_BATCH.tipsTotal?'#39b54a':'var(--bg3)'};color:${allCO&&MOCK_BATCH.tipsEntered===MOCK_BATCH.tipsTotal?'#222':'var(--mint)'};padding:8px;font-size:12px;font-weight:bold;text-align:center;letter-spacing:1px;margin-top:4px;cursor:pointer;" data-closeday="1">${allCO&&MOCK_BATCH.tipsEntered===MOCK_BATCH.tipsTotal?'SETTLE BATCH & CLOSE':allCO?'ENTER REMAINING TIPS':'OPEN CLOSE DAY'}</div>
        </div>`:''}
        `:'<div style="padding:6px;font-size:11px;opacity:0.4;text-align:center;">No checkouts yet</div>'}
      </div>`;
      return html;
    }

    /* ── CHECK OVERVIEW ── */
    function buildCheckGrid(orders, isMyGrid){
      if (orders.length === 0) return `<div style="grid-column: span 3; padding: 20px; text-align: center; opacity: 0.3; font-style: italic;">No ${isMyGrid?'checks':'other checks'}</div>`;
      return orders.map(o=>{
        const isSel=selTables.has(o.id);
        const statusCol=o.status==='closed'?'#39b54a':o.status==='partial'?T.yellow:T.cyan;
        return `
        <div style="width:78px;height:78px;background:${isSel?T.mint:T.bg};color:${isSel?T.bg:T.mint};border:2px solid ${isSel?T.gold:T.mint};clip-path:${chamfer('sm')};display:flex;flex-direction:column;justify-content:space-between;padding:6px;cursor:pointer;position:relative;${isSel?'box-shadow:0 0 10px rgba(252,190,64,0.5);':''}" data-checkid="${o.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <span style="font-size:16px;font-weight:bold;">${o.label.replace('Table ','')}</span>
            <span style="font-size:9px;opacity:0.6;">\uD83D\uDC64${o.guest_count}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end;">
            <span style="font-size:9px;opacity:0.6;">${o.elapsed}</span>
            <div style="width:8px;height:8px;background:${statusCol};box-shadow:0 0 4px ${statusCol};"></div>
          </div>
        </div>`;
      }).join('');
    }

    /* ── MAIN DRAW ── */
    function draw(){
      const myO=APP.orders.filter(o=>o.server===staff.name);
      const flO=APP.orders.filter(o=>o.server!==staff.name);
      const shC=leftTop!=='collapsed'?buildShift():'';
      const msC=leftBot!=='collapsed'?buildMessenger():'';
      const rpC=rightTop!=='collapsed'?buildReporting():'';

      const showActionBar = selTables.size > 0;
      const msgCount = unreadCount(MOCK_ALERTS) + unreadCount(MOCK_RECV) + unreadCount(MOCK_SENT);

      // ── Side-column card wrapper (preserves flex expand/collapse) ──
      function sideCard(title, state, headerId, contentHtml, opts = {}) {
        const inner = state !== 'collapsed'
          ? `<div style="padding:4px 6px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:4px;">${contentHtml}</div>` : '';
        return statusCard(title, inner, {
          ...opts,
          id: headerId,
        });
      }

      // ── Center panel via checkOverviewPanel ──
      const checkHeader = `
        <span style="font-family:${T.fb};font-size:15px;color:${T.mint};font-weight:bold;letter-spacing:2px;">CHECK OVERVIEW</span>
        ${msgCount > 0 ? `<div id="snap-msg-btn">${msgButton(msgCount)}</div>` : ''}`;

      const checkBody = `
        <div style="font-size:13px;letter-spacing:1px;margin-bottom:8px;">MY CHECKS \u2014 ${myO.length}</div>
        <div style="display:grid;grid-template-columns:repeat(3,78px);gap:10px 34px;justify-content:center;margin-bottom:12px;" id="my-tiles">
          ${buildCheckGrid(myO, true)}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;" id="floor-toggle">
          <span style="font-size:13px;letter-spacing:1px;border-top:1px solid ${T.mintDim};padding-top:8px;flex:1;">FLOOR \u2014 ${flO.length}</span>
          <span style="font-size:13px;padding-top:8px;">${showFloor?'\u25BC hide':'\u25B6 show'}</span>
        </div>
        ${showFloor?`<div style="display:grid;grid-template-columns:repeat(3,78px);gap:10px 34px;justify-content:center;opacity:0.5;" id="floor-tiles">${buildCheckGrid(flO, false)}</div>`:''}`;

      const checkFooter = showActionBar ? `
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
          ${selTables.size===1?'<button class="btn-s" style="padding:4px 12px;font-size:12px;" id="act-edit">EDIT</button>':''}
          <button class="btn-s" style="padding:4px 12px;font-size:12px;" id="act-print">PRINT</button>
          <button class="btn-s" style="padding:4px 12px;font-size:12px;" id="act-transfer">TRANSFER</button>
          ${selTables.size>1?'<button class="btn-s" style="padding:4px 12px;font-size:12px;" id="act-merge">MERGE</button>':''}
        </div>` : '';

      el.innerHTML=`<div style="display:flex;height:100%;">
        <div style="width:278px;display:flex;flex-direction:column;gap:4px;padding:4px;flex-shrink:0;">
          <div style="${cardFlex(leftTop)}display:flex;flex-direction:column;overflow:hidden;">
            ${sideCard(`SHIFT OVERVIEW <span style="float:right;font-size:14px;">${leftTop==='expanded'?'\u2212':'+'}</span>`, leftTop, 'hdr-lt', shC)}
          </div>
          <div style="${cardFlex(leftBot)}display:flex;flex-direction:column;overflow:hidden;">
            ${sideCard(`MESSENGER <span style="float:right;font-size:14px;">${leftBot==='expanded'?'\u2212':'+'}</span>`, leftBot, 'hdr-lb', msC)}
          </div>
        </div>

        <div style="width:408px;padding:4px 0;display:flex;flex-direction:column;flex-shrink:0;position:relative;">
          ${checkOverviewPanel(checkHeader, checkBody, checkFooter, { id: 'check-panel' })}
          <div id="edit-bar" style="position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center;"></div>
        </div>

        <div style="width:278px;display:flex;flex-direction:column;gap:4px;padding:4px;flex-shrink:0;">
          <div style="${cardFlex(rightTop)}display:flex;flex-direction:column;overflow:hidden;">
            ${sideCard(`REPORTING <span style="float:right;font-size:14px;">${rightTop==='expanded'?'\u2212':'+'}</span>`, rightTop, 'hdr-rt', rpC)}
          </div>
          <div style="${cardFlex(rightBot)}display:flex;flex-direction:column;overflow:hidden;">
            ${sideCard('HARDWARE', rightBot, 'hdr-rb',
              rightBot!=='collapsed'?'<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:13px;opacity:0.3;font-style:italic;">TBD</div>':''
            )}
          </div>
        </div>
      </div>`;

      // ── Wire check tiles ──
      el.querySelectorAll('[data-checkid]').forEach(t=>{
        t.onclick=()=>{
          const id=t.dataset.checkid;
          if(selTables.has(id)) selTables.delete(id);
          else selTables.add(id);
          draw();
        };
      });

      // ── Wire action bar ──
      const bEd=$('act-edit');if(bEd)bEd.onclick=()=>{
        const o=APP.orders.find(o=>o.id===[...selTables][0]);
        if(o)go('check-editing',{check:o});
      };
      const bPr=$('act-print');if(bPr)bPr.onclick=()=>showToast('Printing '+selTables.size+' checks...');
      const bTr=$('act-transfer');if(bTr)bTr.onclick=()=>showTransferOverlay();
      const bMg=$('act-merge');if(bMg)bMg.onclick=()=>{
        const ids = [...selTables];
        showToast('Tap the check to keep');
        // Simple merge: first selected absorbs others
        const survivor = APP.orders.find(o=>o.id===ids[0]);
        if(survivor){
          for(let i=1; i<ids.length; i++){
            const other = APP.orders.find(o=>o.id===ids[i]);
            if(other){
              survivor.items.push(...other.items);
              APP.orders = APP.orders.filter(o=>o.id!==other.id);
            }
          }
        }
        selTables.clear();
        draw();
      };

      // ── Wire tip adjustment triggers ──
      el.querySelectorAll('[data-tipadj]').forEach(e=>{
        e.onclick=()=>showTipAdjustment(e.dataset.tipadj);
      });

      // ── Wire column headers ──
      const hlt=$('hdr-lt');if(hlt)hlt.onclick=()=>toggleLeft('top');
      const hlb=$('hdr-lb');if(hlb)hlb.onclick=()=>toggleLeft('bot');
      const hrt=$('hdr-rt');if(hrt)hrt.onclick=()=>toggleRight('top');
      const hrb=$('hdr-rb');if(hrb)hrb.onclick=()=>toggleRight('bot');
      const ft=$('floor-toggle');if(ft)ft.onclick=()=>{showFloor=!showFloor;draw();};
      // ── Wire msg button to expand messenger ──
      const mb=$('snap-msg-btn');if(mb)mb.onclick=()=>{leftBot='expanded';leftTop='collapsed';draw();};

      // ── Wire sub-card headers via data attributes ──
      el.querySelectorAll('[data-sub]').forEach(h=>{
        h.addEventListener('click',()=>{
          const [parent,id]=h.dataset.sub.split('|');
          const map={shift:openShift,msg:openMsg,rpt:openRpt};
          if(map[parent])toggleSub(map[parent],id,parent);
        });
      });

      // ── Wire messenger actions ──
      el.querySelectorAll('[data-markread]').forEach(e=>{e.addEventListener('click',()=>{
        const [type,id]=e.dataset.markread.split('|');
        const lists={alerts:MOCK_ALERTS,recv:MOCK_RECV,sent:MOCK_SENT};
        const item=lists[type]?.find(m=>m.id===id);if(item)item.read=true;draw();
      });});
      el.querySelectorAll('[data-msgact]').forEach(e=>{e.addEventListener('click',()=>{
        const [id,action]=e.dataset.msgact.split('|');
        const item=MOCK_RECV.find(m=>m.id===id);if(item){item.status=action;item.read=true;}draw();
      });});
      el.querySelectorAll('[data-postalert]').forEach(e=>{e.addEventListener('click',()=>{
        const txt=prompt('Alert text:');if(!txt)return;
        MOCK_ALERTS.unshift({id:'A'+Date.now(),text:txt,time:'Now',read:false,type:'info'});
        openMsg.clear();openMsg.add('alerts');draw();
      });});

      // ── Wire reporting server actions ──
      el.querySelectorAll('[data-svrtoggle]').forEach(e=>{e.addEventListener('click',()=>{
        const n=e.dataset.svrtoggle;if(!n)return;
        if(openSvr.has(n))openSvr.delete(n);else{openSvr.clear();openSvr.add(n);}draw();
      });});
      el.querySelectorAll('[data-remind]').forEach(e=>{e.addEventListener('click',(ev)=>{
        ev.stopPropagation();const sv=MOCK_SERVERS.find(s=>s.name===e.dataset.remind);if(sv)sv.reminded=true;showToast('Reminder sent');draw();
      });});
      el.querySelectorAll('[data-forceout]').forEach(e=>{e.addEventListener('click',(ev)=>{
        ev.stopPropagation();const sv=MOCK_SERVERS.find(s=>s.name===e.dataset.forceout);
        if(sv){sv.openChecks=0;sv.unadjustedTips=0;sv.checkedOut=true;sv.checkoutTime='Now (forced)';}openSvr.delete(e.dataset.forceout);draw();
      });});
      el.querySelectorAll('[data-docheckout]').forEach(e=>{e.addEventListener('click',(ev)=>{
        ev.stopPropagation();const sv=MOCK_SERVERS.find(s=>s.name===e.dataset.docheckout);
        if(sv){sv.checkedOut=true;sv.checkoutTime='Now';}openSvr.delete(e.dataset.docheckout);draw();
      });});

      // ── Wire close day overlay ──
      el.querySelectorAll('[data-closeday]').forEach(e=>{e.addEventListener('click',()=>{showCloseDay();});});

      // ── Tiles ──
      renderTiles(myO,'my-tiles',true);
      if(showFloor&&flO.length>0)renderTiles(flO,'floor-tiles',false);
      renderEditCard();
    }

    function renderTiles(orders,cid,addNew){
      const c=$(cid);if(!c)return;
      orders.forEach(o=>{const tot=calcOrder(o).sub;const cols={open:T.mint,printed:T.gold,idle:T.red};const sel=selTables.has(o.id);
        const t=document.createElement('div');t.style.cssText=`width:78px;height:77px;border:2px solid ${cols[o.status]||T.mint};background:${sel?T.mint:T.bg};color:${sel?T.bg:T.mint};clip-path:${chamfer('sm')};cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;user-select:none;`;
        t.innerHTML=`<span style="font-size:14px;font-weight:bold;">${o.label}</span><span style="font-size:11px;">${o.guest_count}g \u00B7 ${o.elapsed}</span><span style="font-size:18px;color:${sel?T.bg:T.gold};text-shadow:${sel?'none':'0 0 6px rgba(252,190,64,0.3)'};">$${tot.toFixed(2)}</span>`;
        t.onclick=()=>{selTables.has(o.id)?selTables.delete(o.id):selTables.add(o.id);draw();};
        let lp;t.onmousedown=()=>{lp=setTimeout(()=>go('check-editing',{check:o}),400);};t.onmouseup=()=>clearTimeout(lp);t.onmouseleave=()=>clearTimeout(lp);t.ontouchstart=()=>{lp=setTimeout(()=>go('check-editing',{check:o}),400);};t.ontouchend=()=>clearTimeout(lp);
        c.appendChild(t);
      });
      if(addNew){const nb=document.createElement('div');nb.style.cssText=`width:78px;height:77px;border:2px dashed ${T.mintDim};clip-path:${chamfer('sm')};display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:26px;color:${T.mint};`;nb.textContent='\uFF0B';nb.onclick=()=>showNewCheck();c.appendChild(nb);}
    }

    function renderEditCard(){
      const eb=$('edit-bar');if(!eb)return;const selO=APP.orders.filter(o=>selTables.has(o.id));if(selO.length===0){eb.innerHTML='';return;}
      const multi=selO.length>1,o=selO[0],tot=calcOrder(o).sub;
      const card=document.createElement('div');card.style.cssText=`pointer-events:auto;background:${T.bg2};border:${T.borderW} solid ${T.mint};clip-path:${chamfer('lg')};padding:14px;min-width:260px;filter:drop-shadow(4px 6px 0px #1a1a1a);`;
      card.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><div><div style="font-family:${T.fh};font-size:20px;">${multi?selO.length+' CHECKS':o.label}</div>${!multi?`<div style="font-size:15px;opacity:0.3;">${o.guest_count}g \u00B7 ${o.server} \u00B7 <span style="color:${T.gold};">$${tot.toFixed(2)}</span></div>`:''}</div><div style="cursor:pointer;font-size:18px;font-weight:bold;width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:${T.bg3};clip-path:${chamfer('sm')};" id="edit-close">\u2715</div></div>
      ${!multi?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div class="btn-p" style="font-size:20px;padding:14px;" id="ec-open">Open</div><div class="btn-s" style="font-size:20px;padding:14px;border:1px solid ${T.mintDim};" id="ec-print">Print</div><div class="btn-p" style="font-size:20px;padding:14px;background:#FFD700;color:${T.bg};" id="ec-pay">Pay</div><div class="btn-s" style="font-size:20px;padding:14px;border:1px solid ${T.mintDim};" id="ec-transfer">Transfer</div></div>`:`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div class="btn-p" style="font-size:20px;padding:14px;" id="ec-merge">Merge</div><div class="btn-s" style="font-size:20px;padding:14px;border:1px solid ${T.mintDim};" id="ec-printall">Print All</div></div>`}`;
      eb.innerHTML='';eb.appendChild(card);
      $('edit-close').onclick=()=>{selTables.clear();draw();};
      if(!multi){$('ec-open').onclick=()=>go('check-editing',{check:APP.orders.find(x=>x.id===o.id)});$('ec-print').onclick=()=>showToast('Printing '+o.label);$('ec-pay').onclick=()=>go('payment',{order:APP.orders.find(x=>x.id===o.id)});$('ec-transfer').onclick=()=>showToast('Transfer '+o.label);}
      else{$('ec-merge').onclick=()=>showToast('Merging '+selO.length+' checks');$('ec-printall').onclick=()=>showToast('Printing '+selO.length+' checks');}
    }

    /* ══════════════════════════════════════════════
       CLOSE DAY OVERLAY (full screen)
       ══════════════════════════════════════════════ */
    let cdSelEmp=null, cdEditTxn=null, cdSort='time';

    function cdEmpStats(emp){const t=emp.transactions.length,a=emp.transactions.filter(x=>x.tipAdjusted).length;return{total:t,adjusted:a,unadjusted:t-a,tipTotal:emp.transactions.reduce((s,x)=>s+(x.tip||0),0)};}
    function cdAllStats(){const txns=MOCK_SERVERS.flatMap(e=>e.transactions||[]);const t=txns.length,a=txns.filter(x=>x.tipAdjusted).length;return{total:t,adjusted:a,grossSales:txns.reduce((s,x)=>s+x.subtotal,0),totalTips:txns.reduce((s,x)=>s+(x.tip||0),0),cardTotal:txns.filter(x=>x.method==='card').reduce((s,x)=>s+x.subtotal+(x.tip||0),0),cashTotal:txns.filter(x=>x.method==='cash').reduce((s,x)=>s+x.subtotal+(x.tip||0),0),allDone:a===t};}
    function cdSortTxns(arr){const a=[...arr];if(cdSort==='amount')a.sort((x,y)=>y.subtotal-x.subtotal);else if(cdSort==='status')a.sort((x,y)=>(x.tipAdjusted?1:0)-(y.tipAdjusted?1:0));else a.sort((x,y)=>x.time.localeCompare(y.time));return a;}
    function cdW98(pct,color){const n=20,f=Math.round(n*(Math.min(100,Math.max(0,pct))/100));let h='';for(let i=0;i<n;i++)h+=`<div style="flex:1;height:100%;${i<f?`background:${color};box-shadow:0 0 4px ${color}66;`:'background:#2a2a2a;border:1px solid #333;'}"></div>`;return `<div style="height:18px;border-top:2px solid #1a1a1a;border-left:2px solid #1a1a1a;border-bottom:2px solid #555;border-right:2px solid #555;background:#2a2a2a;display:flex;align-items:center;padding:1px;gap:1px;overflow:hidden;">${h}</div>`;}

    /* ── TIP ADJUSTMENT MODAL ── */
    /* ── TRANSFER OVERLAY ── */
    function showTransferOverlay(){
      const sel = [...selTables].map(id => APP.orders.find(o=>o.id===id)).filter(Boolean);
      let mode = 'SERVERS';
      let targetId = null;
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:100;';

      function dd(){
        const content = `
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <div style="background:${T.bg3};color:${T.mint};padding:4px 12px;font-family:${T.fb};font-size:11px;cursor:pointer;clip-path:${chamfer('sm')};" id="tr-clr">CLR</div>
          <div style="background:#39b54a;color:${T.bg};padding:4px 12px;font-family:${T.fb};font-size:11px;cursor:pointer;clip-path:${chamfer('sm')};" id="tr-confirm">CONFIRM</div>
        </div>
        <div style="flex:1;display:flex;gap:4px;overflow:hidden;">
          <div style="flex:1;border:${T.borderW} solid ${T.mint};clip-path:${chamfer('lg')};background:${T.bg};display:flex;flex-direction:column;overflow:hidden;">
            <div style="background:${T.mint};color:${T.bg};padding:2px 8px;font-family:${T.fb};font-size:11px;font-weight:bold;">SOURCE (${sel.length})</div>
            <div style="flex:1;overflow-y:auto;padding:8px;">
              ${sel.map(o=>`
                <div style="border:1px solid ${T.mint};background:${T.mint};color:${T.bg};padding:8px;margin-bottom:8px;clip-path:${chamfer('sm')};">
                  <div style="font-weight:bold;">${o.label}</div>
                  <div style="font-size:10px;opacity:0.7;">$${calcOrder(o).sub.toFixed(2)} \u2022 ${o.guest_count} Guests</div>
                </div>
              `).join('')}
            </div>
          </div>
          <div style="flex:1;border:${T.borderW} solid ${T.mint};clip-path:${chamfer('lg')};background:${T.bg};display:flex;flex-direction:column;overflow:hidden;">
            <div style="background:${T.mint};color:${T.bg};padding:2px 8px;font-family:${T.fb};font-size:11px;font-weight:bold;display:flex;justify-content:space-between;">
              <span>DESTINATION</span>
              <span style="text-decoration:underline;cursor:pointer;" id="tr-toggle">${mode}</span>
            </div>
            <div style="flex:1;overflow-y:auto;padding:8px;">
              ${mode==='SERVERS' ?
                FALLBACK_ROSTER.map(s => `
                  <div style="border:1px solid ${T.bg3};background:${targetId===s.id?T.mint:T.bg};color:${targetId===s.id?T.bg:T.mint};padding:10px;margin-bottom:4px;cursor:pointer;clip-path:${chamfer('sm')};" data-target="${s.id}">${s.name}</div>
                `).join('') :
                APP.orders.filter(o=>!selTables.has(o.id)).map(o => `
                  <div style="border:1px solid ${T.bg3};background:${targetId===o.id?T.mint:T.bg};color:${targetId===o.id?T.bg:T.mint};padding:10px;margin-bottom:4px;cursor:pointer;clip-path:${chamfer('sm')};" data-target="${o.id}">${o.label}</div>
                `).join('')
              }
            </div>
          </div>
        </div>`;

        ov.innerHTML = snapshotOverlay('Transfer', content, 'document.querySelector(".overlay").remove()');
        ov.querySelector('[onclick]').onclick = () => { ov.remove(); };
        ov.querySelector('#tr-clr').onclick = () => { targetId=null; dd(); };
        ov.querySelector('#tr-toggle').onclick = () => { mode = mode==='SERVERS'?'CHECKS':'SERVERS'; targetId=null; dd(); };
        ov.querySelectorAll('[data-target]').forEach(e => {
          e.onclick = () => { targetId = e.dataset.target; dd(); };
        });
        ov.querySelector('#tr-confirm').onclick = () => {
          if(!targetId) return;
          showToast('Transfer complete');
          ov.remove();
          selTables.clear();
          draw();
        };
      }
      dd();
      document.body.appendChild(ov);
    }

    function showTipAdjustment(orderId){
      const d = serverData;
      const tipInfo = d.tips.tip_list.find(t => t.order_id === orderId);
      if (!tipInfo) return;

      let val = tipInfo.tip_amount.toFixed(2);
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:150;';

      function dd(){
        ov.innerHTML = `
        <div style="width:260px;background:${T.bg2};border:${T.borderW} solid ${T.mint};clip-path:${chamfer('lg')};display:flex;flex-direction:column;">
          <div style="background:${T.mint};color:${T.bg};padding:4px 12px;font-family:${T.fb};font-size:12px;font-weight:bold;display:flex;justify-content:space-between;align-items:center;">
            <span>ADJUST TIP \u2014 ${tipInfo.table}</span>
            <span style="cursor:pointer;" id="ta-close">\u2715</span>
          </div>
          <div style="padding:12px;display:flex;flex-direction:column;gap:12px;">
            <div style="text-align:center;">
              <div style="font-size:10px;opacity:0.5;margin-bottom:2px;">CHECK TOTAL: $${tipInfo.subtotal.toFixed(2)}</div>
              <div style="font-size:24px;color:${T.gold};font-weight:bold;background:${T.bg};border:1px solid ${T.bg3};padding:8px;" id="ta-val">$${val}</div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;" id="ta-numpad">
              ${[1,2,3,4,5,6,7,8,9,'.',0,'CLR'].map(n=>`<div style="height:44px;background:${T.bg3};border:1px solid ${T.mint};clip-path:${chamfer('sm')};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:bold;cursor:pointer;" data-key="${n}">${n}</div>`).join('')}
            </div>
            <div style="display:flex;gap:8px;">
              <div style="flex:1;background:${T.bg3};color:${T.mint};border:1px solid ${T.mint};clip-path:${chamfer('sm')};padding:10px;text-align:center;font-weight:bold;cursor:pointer;" id="ta-cancel">CANCEL</div>
              <div style="flex:1;background:#39b54a;color:${T.bg};clip-path:${chamfer('sm')};padding:10px;text-align:center;font-weight:bold;cursor:pointer;" id="ta-save">SAVE</div>
            </div>
          </div>
        </div>
        `;
        ov.querySelector('#ta-close').onclick = () => ov.remove();
        ov.querySelector('#ta-cancel').onclick = () => ov.remove();
        ov.querySelector('#ta-save').onclick = async () => {
          const newTip = parseFloat(val);
          if (isNaN(newTip)) return;
          try {
            // Need to find payment_id. For now assume one payment per order or handled by backend.
            // Our tip adjustment request expects payment_id.
            // Let's assume for this mock/v1 it finds the first one.
            const resp = await fetch('/api/v1/servers/tip-adjustment', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({order_id: orderId, payment_id: 'auto', tip_amount: newTip})
            });
            if (resp.ok) {
              ov.remove();
              fetchServerData();
            }
          } catch(e) { console.error(e); }
        };
        ov.querySelectorAll('[data-key]').forEach(k => {
          k.onclick = () => {
            const key = k.dataset.key;
            if (key === 'CLR') val = '0.00';
            else if (key === '.') { if (!val.includes('.')) val += '.'; }
            else {
              if (val === '0.00') val = key;
              else val += key;
            }
            ov.querySelector('#ta-val').textContent = '$' + val;
          };
        });
      }
      dd();
      document.body.appendChild(ov);
    }

    function showCloseDay(){
      // Give each server mock transactions if not already present
      MOCK_SERVERS.forEach(sv=>{if(!sv.transactions)sv.transactions=[
        {ref:'C-'+Math.floor(Math.random()*900+100),table:'Table '+Math.floor(Math.random()*12+1),subtotal:sv.gross,tip:null,tipAdjusted:false,method:'card',time:'7:00 PM'}
      ];});
      cdSelEmp=null;cdEditTxn=null;cdSort='time';
      drawCloseDay();
    }

    function drawCloseDay(){
      const stats=cdAllStats();const adjPct=stats.total>0?(stats.adjusted/stats.total*100):0;
      const selEmp=cdSelEmp?MOCK_SERVERS.find(e=>e.name===cdSelEmp):null;
      const visTxns=selEmp?selEmp.transactions.map(t=>({...t,_server:selEmp.name})):MOCK_SERVERS.flatMap(e=>(e.transactions||[]).map(t=>({...t,_server:e.name})));
      const sorted=cdSortTxns(visTxns);const visUnadj=visTxns.filter(t=>!t.tipAdjusted).length;

      const fLabel=selEmp?selEmp.name:'ALL EMPLOYEES';
      const fSub=selEmp?`${cdEmpStats(selEmp).adjusted}/${cdEmpStats(selEmp).total} adj \u2014 Tips: $${cdEmpStats(selEmp).tipTotal.toFixed(2)}`:`${stats.adjusted}/${stats.total} adj \u2014 Tips: $${stats.totalTips.toFixed(2)}`;

      const cdContent = `
        <div style="display:flex;gap:8px;margin-bottom:10px;flex-shrink:0;">${MOCK_SERVERS.map(emp=>{
          const st=cdEmpStats(emp),isDone=st.unadjusted===0,isSel=cdSelEmp===emp.name;
          const stText=emp.checkedOut&&isDone?'COMPLETE':st.unadjusted>0?st.unadjusted+' OPEN':'READY';
          const stCol=emp.checkedOut&&isDone?'#39b54a':st.unadjusted>0?T.cyan:T.bg3;
          return `<div style="flex:1;border:2px solid ${isSel?T.gold:isDone?'#39b54a':st.unadjusted>0?T.cyan:T.bg3};background:${isSel?'rgba(252,190,64,0.08)':T.bg2};clip-path:${chamfer('sm')};padding:8px;text-align:center;cursor:pointer;${emp.checkedOut&&isDone&&!isSel?'opacity:0.4;':''}" data-cdsel="${emp.name}">
            <div style="font-size:13px;font-weight:bold;color:${isSel?T.gold:stCol};">${emp.name}</div>
            <div style="font-size:10px;color:${stCol};">${stText}</div>
            <div style="font-size:12px;color:${T.gold};margin-top:3px;">$${emp.gross.toFixed(2)}</div>
          </div>`;}).join('')}</div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-shrink:0;">${cdW98(adjPct,stats.allDone?'#39b54a':T.gold)}<span style="font-size:11px;flex-shrink:0;width:60px;text-align:right;color:${stats.allDone?'#39b54a':T.gold};">${stats.adjusted}/${stats.total}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-shrink:0;"><span style="font-size:13px;font-weight:bold;color:${T.gold};">${fLabel}</span><span style="font-size:11px;">${fSub}</span></div>
        <div style="display:flex;gap:4px;margin-bottom:6px;flex-shrink:0;align-items:center;">
          <div style="padding:3px 8px;font-size:10px;cursor:pointer;border:1px solid ${cdSort==='time'?T.mint:T.bg3};background:${cdSort==='time'?'rgba(198,255,187,0.1)':T.bg2};color:${T.mint};" data-cdsort="time">Time</div>
          <div style="padding:3px 8px;font-size:10px;cursor:pointer;border:1px solid ${cdSort==='amount'?T.mint:T.bg3};background:${cdSort==='amount'?'rgba(198,255,187,0.1)':T.bg2};color:${T.mint};" data-cdsort="amount">Amount</div>
          <div style="padding:3px 8px;font-size:10px;cursor:pointer;border:1px solid ${cdSort==='status'?T.mint:T.bg3};background:${cdSort==='status'?'rgba(198,255,187,0.1)':T.bg2};color:${T.mint};" data-cdsort="status">Status</div>
          ${visUnadj>0?`<div style="margin-left:auto;padding:3px 8px;font-size:10px;cursor:pointer;border:1px solid ${T.red};background:${T.bg2};color:${T.red};" data-cdzero="${selEmp?selEmp.name:'all'}">ZERO ALL (${visUnadj})</div>`:''}
        </div>
        <div style="flex:1;overflow-y:auto;border:1px solid #444;background:${T.bg2};">
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr>${['Check',!selEmp?'Server':'','Table','Subtotal','Tip','Pay'].filter(Boolean).map(h=>`<th style="font-size:10px;color:${T.mint};opacity:0.5;text-align:${h==='Subtotal'||h==='Tip'?'right':'left'};padding:5px 8px;border-bottom:1px solid ${T.bg3};position:sticky;top:0;background:${T.bg2};z-index:1;">${h}</th>`).join('')}</tr></thead>
            <tbody>${sorted.map(txn=>{
              const isEd=cdEditTxn===txn.ref;const dotCol=txn.tipAdjusted?'#39b54a':T.yellow;const tipDisp=txn.tip!==null?'$'+txn.tip.toFixed(2):'\u2014';
              return `<tr style="border-bottom:1px solid rgba(198,255,187,0.06);cursor:pointer;${isEd?'background:rgba(252,190,64,0.06);':''}" ${!isEd?`data-cdedit="${txn.ref}"`:''}}>
                <td style="font-size:12px;padding:6px 8px;color:${T.cyan};font-weight:bold;">${txn.ref}</td>
                ${!selEmp?`<td style="font-size:11px;padding:6px 8px;color:${T.mint};">${txn._server}</td>`:''}
                <td style="font-size:12px;padding:6px 8px;">${txn.table}</td>
                <td style="font-size:12px;padding:6px 8px;text-align:right;color:${T.gold};font-weight:bold;">$${txn.subtotal.toFixed(2)}</td>
                <td style="font-size:12px;padding:6px 8px;text-align:right;">${isEd
                  ?`<div style="display:flex;align-items:center;gap:4px;justify-content:flex-end;"><input type="number" step="0.01" min="0" value="${txn.tip!==null?txn.tip.toFixed(2):''}" placeholder="0.00" style="width:60px;background:${T.bg2};border:1px solid ${T.gold};color:${T.gold};font-family:${T.fb};font-size:12px;padding:2px 4px;text-align:right;" id="cd-tipinput"><div style="background:#39b54a;color:${T.bg};padding:2px 8px;font-size:10px;font-weight:bold;cursor:pointer;clip-path:${chamfer('sm')};" data-cdtipsave="${txn.ref}">\u2713</div></div>`
                  :`<span style="color:${txn.tipAdjusted?'#39b54a':T.yellow};"><span style="display:inline-block;width:6px;height:6px;background:${dotCol};box-shadow:0 0 4px ${dotCol};margin-right:4px;"></span>${tipDisp}</span>`
                }</td>
                <td style="font-size:10px;padding:6px 8px;color:${txn.method==='card'?T.cyan:'#39b54a'};">${txn.method}</td>
              </tr>`;}).join('')}</tbody>
          </table>
        </div>
        <div style="display:flex;gap:12px;padding:10px 0;flex-shrink:0;align-items:stretch;">
          <div style="flex:1;border:1px solid #444;background:${T.bg2};padding:8px;clip-path:${chamfer('sm')};display:flex;flex-wrap:wrap;gap:0 16px;">
            <span style="font-size:11px;"><span style="opacity:0.6;">Gross</span> <span style="color:${T.gold};font-weight:bold;">$${stats.grossSales.toFixed(2)}</span></span>
            <span style="font-size:11px;"><span style="opacity:0.6;">Tips</span> <span style="color:${T.gold};font-weight:bold;">$${stats.totalTips.toFixed(2)}</span></span>
            <span style="font-size:11px;"><span style="color:${T.cyan};">Card</span> <span style="color:${T.gold};font-weight:bold;">$${stats.cardTotal.toFixed(2)}</span></span>
            <span style="font-size:11px;"><span style="color:#39b54a;">Cash</span> <span style="color:${T.gold};font-weight:bold;">$${stats.cashTotal.toFixed(2)}</span></span>
            <span style="font-size:11px;border-left:2px solid #39b54a;padding-left:8px;"><span style="color:#39b54a;font-weight:bold;">Cash Expected</span> <span style="color:#39b54a;font-weight:bold;">$${stats.cashTotal.toFixed(2)}</span></span>
          </div>
          <div style="width:200px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;cursor:${stats.allDone?'pointer':'not-allowed'};letter-spacing:1px;clip-path:${chamfer('sm')};background:${stats.allDone?'#39b54a':T.bg3};color:${stats.allDone?T.bg:T.mint};${stats.allDone?'':'opacity:0.5;'}" ${stats.allDone?'id="cd-submit"':''}>${stats.allDone?'SUBMIT BATCH':'PENDING ('+(stats.total-stats.adjusted)+')'}</div>
        </div>`;

      const ov=document.createElement('div');ov.className='overlay';
      ov.style.cssText='position:fixed;inset:0;z-index:100;';
      ov.innerHTML=snapshotOverlay(`CLOSE DAY <span style="font-size:12px;float:right;margin-top:4px;">${stats.adjusted}/${stats.total} tips</span>`, cdContent, 'void 0');

      // Remove existing overlay if any
      el.querySelectorAll('.overlay').forEach(o=>o.remove());
      document.body.appendChild(ov);

      // Wire events via single delegated handler on overlay (prevents listener leaks on dismiss)
      ov.addEventListener('click',(ev)=>{
        const t=ev.target.closest('[data-cdtipsave]');
        if(t){ev.stopPropagation();const inp=document.getElementById('cd-tipinput');if(!inp)return;const val=parseFloat(inp.value);if(isNaN(val)||val<0)return;
          for(const emp of MOCK_SERVERS){const txn=(emp.transactions||[]).find(tx=>tx.ref===t.dataset.cdtipsave);if(txn){txn.tip=val;txn.tipAdjusted=true;break;}}
          cdEditTxn=null;ov.remove();drawCloseDay();return;}
        if(ev.target.closest('[onclick]')){ov.remove();draw();return;}
        if(ev.target.closest('#cd-submit')){ov.remove();cdSubmitBatch();return;}
        const selEl=ev.target.closest('[data-cdsel]');
        if(selEl){cdSelEmp=cdSelEmp===selEl.dataset.cdsel?null:selEl.dataset.cdsel;cdEditTxn=null;ov.remove();drawCloseDay();return;}
        const sortEl=ev.target.closest('[data-cdsort]');
        if(sortEl){cdSort=sortEl.dataset.cdsort;ov.remove();drawCloseDay();return;}
        const editEl=ev.target.closest('[data-cdedit]');
        if(editEl){cdEditTxn=editEl.dataset.cdedit;ov.remove();drawCloseDay();setTimeout(()=>{const inp=document.getElementById('cd-tipinput');if(inp)inp.focus();},50);return;}
        const zeroEl=ev.target.closest('[data-cdzero]');
        if(zeroEl){const name=zeroEl.dataset.cdzero;const scope=name==='all'?MOCK_SERVERS:[MOCK_SERVERS.find(s=>s.name===name)];
          scope.forEach(emp=>{if(emp)(emp.transactions||[]).forEach(tx=>{if(!tx.tipAdjusted){tx.tip=0;tx.tipAdjusted=true;}});});
          cdEditTxn=null;ov.remove();drawCloseDay();return;}
      });
    }

    function cdSubmitBatch(){
      const stats=cdAllStats();
      if(!document.getElementById('cd-batch-css')){const s=document.createElement('style');s.id='cd-batch-css';s.textContent='@keyframes cdDash{from{transform:translateX(-16px);}to{transform:translateX(0);}}';document.head.appendChild(s);}

      const batchContent = `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;">
          <div style="font-size:18px;font-weight:bold;letter-spacing:2px;color:${T.gold};text-shadow:0 0 10px rgba(252,190,64,0.4);">SETTLING BATCH</div>
          <div style="width:400px;display:flex;align-items:center;justify-content:space-between;">
            <div style="width:80px;height:60px;border:2px solid ${T.cyan};clip-path:${chamfer('sm')};display:flex;align-items:center;justify-content:center;flex-direction:column;background:${T.bg2};"><span style="font-size:20px;">\u25C6</span><span style="font-size:8px;margin-top:2px;">TRM-01</span></div>
            <div style="flex:1;height:4px;margin:0 12px;overflow:hidden;position:relative;"><div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,#33ffff 0px,#33ffff 8px,transparent 8px,transparent 16px);animation:cdDash 0.6s linear infinite;"></div></div>
            <div style="width:80px;height:60px;border:2px solid #39b54a;clip-path:${chamfer('sm')};display:flex;align-items:center;justify-content:center;flex-direction:column;background:${T.bg2};"><span style="font-size:20px;">\uD83D\uDCB3</span><span style="font-size:8px;margin-top:2px;">PROCESSOR</span></div>
          </div>
          <div style="width:300px;" id="cd-batchbar"></div>
          <div style="font-size:12px;color:${T.mint};opacity:0.5;" id="cd-batchmsg">Connecting to payment processor...</div>
        </div>`;
      const ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;z-index:100;';
      ov.innerHTML=snapshotOverlay('CLOSE DAY \u2014 SUBMITTING', batchContent, '');
      document.body.appendChild(ov);

      const bar=ov.querySelector('#cd-batchbar'),msg=ov.querySelector('#cd-batchmsg');
      let prog=0;const msgs=['Connecting to payment processor...','Authenticating terminal...','Transmitting batch data...','Processing card transactions...','Reconciling tip adjustments...','Finalizing settlement...'];
      function fill(){const n=20,f=Math.round(n*(prog/100));let h='';for(let i=0;i<n;i++)h+=`<div style="flex:1;height:100%;${i<f?'background:#33ffff;box-shadow:0 0 4px rgba(51,255,255,0.6);':'background:#2a2a2a;border:1px solid #333;'}"></div>`;if(bar)bar.innerHTML=`<div style="height:22px;border-top:2px solid #1a1a1a;border-left:2px solid #1a1a1a;border-bottom:2px solid #555;border-right:2px solid #555;background:#2a2a2a;display:flex;align-items:center;padding:1px;gap:1px;overflow:hidden;">${h}</div>`;}
      const iv=setInterval(()=>{prog+=4+Math.random()*8;if(prog>100)prog=100;const mi=Math.min(Math.floor(prog/18),msgs.length-1);if(msg)msg.textContent=msgs[mi];fill();if(prog>=100){clearInterval(iv);setTimeout(()=>{ov.remove();cdShowSuccess(stats);},400);}},300);
      fill();
    }

    function cdShowSuccess(stats){
      let sbar='';for(let i=0;i<20;i++)sbar+=`<div style="flex:1;height:100%;background:#39b54a;box-shadow:0 0 4px rgba(57,181,74,0.6);"></div>`;
      const successContent = `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;">
          <div style="width:300px;"><div style="height:22px;border-top:2px solid #1a1a1a;border-left:2px solid #1a1a1a;border-bottom:2px solid #555;border-right:2px solid #555;background:#2a2a2a;display:flex;align-items:center;padding:1px;gap:1px;overflow:hidden;">${sbar}</div></div>
          <div style="font-size:22px;font-weight:bold;letter-spacing:3px;color:#39b54a;text-shadow:0 0 12px rgba(57,181,74,0.5);">BATCH SUBMISSION SUCCESSFUL</div>
          <div style="border:2px solid #39b54a;background:${T.bg2};clip-path:${chamfer('lg')};padding:16px 32px;display:flex;flex-direction:column;gap:6px;min-width:300px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;"><span>Gross Sales</span><span style="color:${T.gold};font-weight:bold;">$${stats.grossSales.toFixed(2)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;"><span>Total Tips</span><span style="color:${T.gold};font-weight:bold;">$${stats.totalTips.toFixed(2)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;"><span style="color:${T.cyan};">Card Batch</span><span style="color:${T.gold};font-weight:bold;">$${stats.cardTotal.toFixed(2)}</span></div>
            <div style="height:1px;background:#444;margin:4px 0;"></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;"><span>Transactions</span><span style="color:#39b54a;">${stats.total}/${stats.total} adjusted</span></div>
            <div style="height:2px;background:#39b54a;margin:6px 0;"></div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;"><span style="font-size:16px;font-weight:bold;color:#39b54a;">CASH EXPECTED</span><span style="font-size:22px;color:#39b54a;font-weight:bold;text-shadow:0 0 10px rgba(57,181,74,0.5);">$${stats.cashTotal.toFixed(2)}</span></div>
          </div>
          <div style="display:flex;gap:12px;margin-top:8px;">
            <div style="background:#39b54a;color:${T.bg};padding:12px 32px;font-family:${T.fb};font-size:14px;font-weight:bold;cursor:pointer;letter-spacing:1px;clip-path:${chamfer('sm')};" id="cd-finalclose">CLOSE DAY</div>
            <div style="background:${T.bg3};color:${T.mint};border:1px solid ${T.mint};padding:12px 32px;font-family:${T.fb};font-size:14px;font-weight:bold;cursor:pointer;letter-spacing:1px;clip-path:${chamfer('sm')};" id="cd-back">\u2190 BACK</div>
          </div>
          <div style="font-size:10px;opacity:0.3;margin-top:8px;">Batch settled at ${new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} \u2014 TRM-01</div>
        </div>`;
      const ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;z-index:100;';
      ov.innerHTML=snapshotOverlay('CLOSE DAY \u2014 COMPLETE', successContent, '');
      document.body.appendChild(ov);
      ov.querySelector('#cd-finalclose').addEventListener('click',()=>{ov.remove();go('login');});
      ov.querySelector('#cd-back').addEventListener('click',()=>{ov.remove();drawCloseDay();});
    }

    draw();
    return ()=>{document.querySelectorAll('.overlay').forEach(o=>o.remove());};
  }
});