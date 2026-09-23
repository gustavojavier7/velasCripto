(() => {
  const linreg = ys => {
    const n=ys.length; if(n<2) return null;
    let sx=0,sy=0,sxx=0,sxy=0;
    for(let i=0;i<n;i++){const y=+ys[i]; if(!Number.isFinite(y)) return null; sx+=i;sy+=y;sxx+=i*i;sxy+=i*y;}
    const d=n*sxx-sx*sx; if(Math.abs(d)<1e-12) return null;
    const m=(n*sxy-sx*sy)/d, b=(sy-m*sx)/n;
    return {m,b,p:x=>b+m*x};
  };
  const sec=(a,b)=>{
    if(!a||!b) return null; const d=b.g-a.g;
    if(!Number.isFinite(d)||Math.abs(d)<1e-12) return null;
    const x=b.i-b.g*(b.i-a.i)/d; return Number.isFinite(x)?x:null;
  };
  const iqi=(a,b,c)=>{
    if(!a||!b||!c) return null;
    const [g0,g1,g2]=[a.g,b.g,c.g];
    const [d0,d1,d2]=[(g0-g1)*(g0-g2),(g1-g0)*(g1-g2),(g2-g0)*(g2-g1)];
    if([d0,d1,d2].some(d=>!Number.isFinite(d)||Math.abs(d)<1e-12)) return null;
    const x=a.i*g1*g2/d0+b.i*g0*g2/d1+c.i*g0*g1/d2;
    return Number.isFinite(x)?x:null;
  };
  const rf=(a,b)=>{
    if(!a||!b||!Number.isFinite(a.g)||!Number.isFinite(b.g)||a.g*b.g>0) return null;
    return sec(a,b);
  };
  const tfMs=tf=>{
    const m=String(tf||'').match(/^(\d+)([mhdwM])$/); if(!m) return null;
    const n=+m[1],u=m[2],min=60000;
    return u==='m'?n*min:u==='h'?n*60*min:u==='d'?n*1440*min:u==='w'?n*10080*min:u==='M'?n*43200*min:null;
  };
  const fmtRoot=(x,lastI,lastTs,tf)=>{
    if(x===null||!Number.isFinite(x)) return 'N/D';
    const dv=x-lastI; if(dv<=0) return `fuera del futuro (Δ ${dv.toFixed(2)} velas)`;
    const ms=tfMs(tf); if(!ms) return `+${dv.toFixed(2)} velas`;
    return `+${dv.toFixed(2)} velas (~${new Date(lastTs+dv*ms).toLocaleString()})`;
  };
  const build=(data,w)=>{
    const closes=data.map(v=>+v[4]), s=Array(data.length).fill(null);
    for(let i=w;i<closes.length;i++){
      const r=linreg(closes.slice(i-w,i)); if(!r) continue;
      const p=r.p(w), y=closes[i]; if(Number.isFinite(y)&&Number.isFinite(p)) s[i]={i,y,p,g:y-p};
    }
    const rn=closes.length>=w?linreg(closes.slice(-w)):null;
    return {closes,s,next:rn?rn.p(w):null};
  };
  const crossings=s=>{
    const out=[]; let a=null;
    for(const b of s){if(!b) continue;
      if(a&&((a.g<0&&b.g>=0)||(a.g>0&&b.g<=0))) out.push({i:b.i,dir:a.g<0?'up':'down',x:rf(a,b),ga:a.g,gb:b.g});
      a=b;
    } return out;
  };
  const analyze=(s,h=12)=>{
    const v=s.filter(Boolean); if(v.length<3) return {state:'DATOS INSUFICIENTES'};
    const [a,b,c]=v.slice(-3), xs=sec(b,c), xq=iqi(a,b,c), xr=rf(b,c), last=c.i;
    const sf=xs!==null&&xs>last&&xs<=last+h, qf=xq!==null&&xq>last&&xq<=last+h;
    const spread=sf&&qf?Math.abs(xs-xq):null;
    const state=xr!==null?'CRUCE CONFIRMADO':sf&&qf&&spread<=1?'CONVERGENCIA PREVIA':sf||qf?'APROXIMACION':'SIN CRUCE PROYECTABLE';
    return {state,a,b,c,xs,xq,xr,spread,sf,qf};
  };
  const chart=(id,data,r,cross,formatDate)=>{
    const el=document.getElementById(id); if(!el||typeof Chart==='undefined') return;
    if(window.crossNumericChart) window.crossNumericChart.destroy();
    const labels=data.map(v=>(formatDate?formatDate(v[0]):new Date(+v[0]).toLocaleString()).slice(0,16));
    const pred=r.s.map(x=>x?x.p:NaN), up=Array(data.length).fill(NaN),dn=Array(data.length).fill(NaN);
    cross.forEach(x=>(x.dir==='up'?up:dn)[x.i]=r.closes[x.i]);
    window.crossNumericChart=new Chart(el.getContext('2d'),{type:'line',data:{labels,datasets:[
      {label:'Close',data:r.closes,borderColor:'#3b82f6',pointRadius:0,borderWidth:2},
      {label:'Pronóstico lineal 1 paso',data:pred,borderColor:'#8b5cf6',borderDash:[6,4],pointRadius:0,borderWidth:2},
      {label:'Cruce confirmado ↑',data:up,type:'scatter',backgroundColor:'#22c55e',pointRadius:6},
      {label:'Cruce confirmado ↓',data:dn,type:'scatter',backgroundColor:'#ef4444',pointRadius:6}
    ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},scales:{y:{title:{display:true,text:'Precio'}},x:{ticks:{maxTicksLimit:15}}}}});
  };
  const run=({datosRaw,currentTimeframe,resumenDiv,activarModoSimulacion,formatearFecha})=>{
    const LOOKBACK=480,W=48,H=12,data=datosRaw.slice(-LOOKBACK);
    if(data.length<W+3){alert(`Se requieren al menos ${W+3} velas.`);return;}
    activarModoSimulacion();
    const r=build(data,W), a=analyze(r.s,H), cross=crossings(r.s), u=a.c, lastTs=+data[data.length-1][0];
    const rfText=a.xr===null?'N/D — sin cambio de signo; Regula Falsi no aplica todavía':`raíz encerrada entre las dos últimas velas (x=${a.xr.toFixed(3)})`;
    const direction=u.g>0?'Precio sobre la línea; un cruce futuro implica convergencia hacia abajo.':u.g<0?'Precio bajo la línea; un cruce futuro implica convergencia hacia arriba.':'Precio sobre la línea.';
    resumenDiv.innerHTML='<div id="resumen" style="padding:20px;"></div>'; resumenDiv.classList.add('show');
    document.getElementById('resumen').innerHTML=`
      <h1>Cruce numérico: precio vs pronóstico lineal</h1>
      <p><b>TF:</b> ${currentTimeframe} | <b>Lookback:</b> ${data.length} | <b>Regresión:</b> ${W} velas</p>
      <p><b>Estado:</b> ${a.state}</p>
      <p><b>Close:</b> ${u.y.toFixed(4)} | <b>Pronóstico 1 paso:</b> ${u.p.toFixed(4)} | <b>g(t):</b> ${u.g.toFixed(4)}</p>
      <p><b>Próximo pronóstico lineal:</b> ${Number.isFinite(r.next)?r.next.toFixed(4):'N/D'}</p>
      <p>${direction}</p>
      <table><thead><tr><th>Método</th><th>Estimación</th><th>Rol</th></tr></thead><tbody>
      <tr><td>Secante</td><td>${fmtRoot(a.xs,u.i,lastTs,currentTimeframe)}</td><td>Anticipación, 2 errores</td></tr>
      <tr><td>IQI</td><td>${fmtRoot(a.xq,u.i,lastTs,currentTimeframe)}</td><td>Anticipación curva, 3 errores</td></tr>
      <tr><td>Regula Falsi</td><td>${rfText}</td><td>Confirmación con cambio de signo</td></tr>
      </tbody></table>
      <p><b>Dispersión Secante–IQI:</b> ${a.spread===null?'N/D':a.spread.toFixed(3)+' velas'}</p>
      <div style="height:380px;margin:15px 0"><canvas id="crossNumericChart"></canvas></div>
      <p style="color:#666;font-size:.9em">g(t)=precio−pronóstico. El indicador separa anticipación (Secante/IQI) de confirmación (Regula Falsi); no interpreta el cruce como señal de compra o venta.</p>`;
    setTimeout(()=>chart('crossNumericChart',data,r,cross,formatearFecha),100);
    document.body.scrollTop=0; document.documentElement.scrollTop=0;
  };
  window.CruceNumerico={run};
})();