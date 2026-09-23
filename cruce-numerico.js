(() => {
  const linreg = ys => {
    const n=ys.length; if(n<2) return null;
    let sx=0,sy=0,sxx=0,sxy=0;
    for(let i=0;i<n;i++){const y=+ys[i]; if(!Number.isFinite(y)) return null; sx+=i;sy+=y;sxx+=i*i;sxy+=i*y;}
    const d=n*sxx-sx*sx; if(Math.abs(d)<1e-12) return null;
    const m=(n*sxy-sx*sy)/d, b=(sy-m*sx)/n;
    return {m,b,p:x=>b+m*x};
  };
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const returnMoments=rs=>{
    const v=rs.filter(Number.isFinite), n=v.length;
    if(n<4) return null;
    const mean=v.reduce((s,x)=>s+x,0)/n;
    let m2=0,m3=0,m4=0;
    for(const x of v){
      const d=x-mean, d2=d*d;
      m2+=d2; m3+=d2*d; m4+=d2*d2;
    }
    m2/=n; m3/=n; m4/=n;
    if(!(m2>0)) return {vol:0,skew:0,kurtExcess:0};
    const vol=Math.sqrt(m2);
    return {
      vol,
      skew:m3/Math.pow(m2,1.5),
      kurtExcess:m4/(m2*m2)-3
    };
  };
  const percentileRank=(values,x)=>{
    const v=values.filter(Number.isFinite);
    if(!v.length||!Number.isFinite(x)) return null;
    let less=0,equal=0;
    const eps=Math.max(1e-12,Math.abs(x)*1e-12);
    for(const y of v){
      if(Math.abs(y-x)<=eps) equal++;
      else if(y<x) less++;
    }
    return clamp((less+0.5*equal)/v.length,0,1);
  };
  const regimeMetrics=(data,w)=>{
    const closes=data.map(v=>+v[4]);
    const returns=[];
    for(let i=1;i<closes.length;i++){
      const a=closes[i-1], b=closes[i];
      returns.push(a>0&&b>0?Math.log(b/a):NaN);
    }
    const rolling=[];
    for(let end=w;end<=returns.length;end++){
      const m=returnMoments(returns.slice(end-w,end));
      if(m) rolling.push(m);
    }
    if(!rolling.length) return null;
    const current=rolling[rolling.length-1];
    const hist=rolling.slice(0,-1);
    const volRisk=percentileRank(hist.map(x=>x.vol),current.vol);
    const kurtTail=Math.max(0,current.kurtExcess);
    const kurtRisk=percentileRank(hist.map(x=>Math.max(0,x.kurtExcess)),kurtTail);
    const vr=volRisk===null?0.5:volRisk;
    const kr=kurtRisk===null?0.5:kurtRisk;
    const confidence=clamp(100*(1-(0.60*vr+0.40*kr)),0,100);
    const torsion=clamp(Math.tanh(current.skew)*confidence,-100,100);
    return {...current,volRisk:vr,kurtRisk:kr,confidence,torsion,samples:hist.length};
  };
  const confidenceLabel=x=>x>=80?'ALTA':x>=60?'MODERADA-ALTA':x>=40?'MEDIA':x>=20?'BAJA':'MUY BAJA';
  const torsionLabel=x=>Math.abs(x)<5?'NEUTRA':x>0?'ALCISTA':'BAJISTA';
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
  const parseTf=tf=>{
    const m=String(tf||'').match(/^(\d+)([mhdwM])$/);
    return m?{n:+m[1],u:m[2]}:null;
  };
  const isCalendarMonthTf=tf=>{
    const p=parseTf(tf);
    return !!p && p.u==='M';
  };
  const tfMs=tf=>{
    const p=parseTf(tf); if(!p || p.u==='M') return null;
    const {n,u}=p,min=60000;
    return u==='m'?n*min:u==='h'?n*60*min:u==='d'?n*1440*min:u==='w'?n*10080*min:null;
  };
  const addCalendarMonthsUtc=(ts,months)=>{
    if(!Number.isFinite(ts)||!Number.isInteger(months)) return NaN;
    const d=new Date(ts);
    const day=d.getUTCDate();
    const first=new Date(Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth()+months,
      1,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds()
    ));
    const maxDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
    first.setUTCDate(Math.min(day,maxDay));
    return first.getTime();
  };
  const shiftByTfUnits=(baseTs,units,tf)=>{
    if(!Number.isFinite(baseTs)||!Number.isFinite(units)) return NaN;
    const fixed=tfMs(tf);
    if(fixed) return baseTs+units*fixed;
    const p=parseTf(tf);
    if(!p||p.u!=='M') return NaN;
    const monthUnits=units*p.n;
    if(monthUnits===0) return baseTs;
    if(monthUnits>0){
      const whole=Math.floor(monthUnits), frac=monthUnits-whole;
      const a=addCalendarMonthsUtc(baseTs,whole);
      if(frac===0) return a;
      const b=addCalendarMonthsUtc(baseTs,whole+1);
      return a+frac*(b-a);
    }
    const whole=Math.ceil(monthUnits), frac=Math.abs(monthUnits-whole);
    const a=addCalendarMonthsUtc(baseTs,whole);
    if(frac===0) return a;
    const b=addCalendarMonthsUtc(baseTs,whole-1);
    return a+frac*(b-a);
  };
  const fmtDuration=ms=>{
    if(!Number.isFinite(ms)) return 'N/D';
    const sign=ms<0?'-':'';
    let s=Math.round(Math.abs(ms)/1000);
    const d=Math.floor(s/86400); s%=86400;
    const h=Math.floor(s/3600); s%=3600;
    const m=Math.floor(s/60); s%=60;
    const parts=[];
    if(d) parts.push(`${d} d`);
    if(h) parts.push(`${h} h`);
    if(m) parts.push(`${m} min`);
    if(s || parts.length===0) parts.push(`${s} s`);
    return sign+parts.slice(0,3).join(' ');
  };
  const candlesToTime=(candles,tf,anchorTs)=>{
    if(!Number.isFinite(candles)) return 'N/D';
    const fixed=tfMs(tf);
    if(fixed) return fmtDuration(candles*fixed);
    if(isCalendarMonthTf(tf)&&Number.isFinite(anchorTs)){
      const target=shiftByTfUnits(anchorTs,candles,tf);
      return Number.isFinite(target)?fmtDuration(target-anchorTs):'N/D';
    }
    return 'N/D';
  };
  const fmtRoot=(x,lastI,lastTs,tf)=>{
    if(x===null||!Number.isFinite(x)) return 'N/D';
    const dv=x-lastI;
    const targetTs=shiftByTfUnits(lastTs,dv,tf);
    const dt=Number.isFinite(targetTs)?fmtDuration(targetTs-lastTs):'N/D';
    if(dv<=0) return `fuera del futuro (Δ ${dv.toFixed(2)} velas = ${dt})`;
    if(!Number.isFinite(targetTs)) return `+${dv.toFixed(2)} velas`;
    return `+${dv.toFixed(2)} velas = ${dt} (~${new Date(targetTs).toLocaleString()})`;
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
  const run=({datosRaw,currentTimeframe,resumenDiv,activarModoSimulacion,formatearFecha,par='N/D',market='N/D'})=>{
    const LOOKBACK=1000,W=48,H=12,data=datosRaw.slice(-LOOKBACK);
    if(data.length<W+3){alert(`Se requieren al menos ${W+3} velas.`);return;}
    activarModoSimulacion();
    const r=build(data,W), a=analyze(r.s,H), cross=crossings(r.s), u=a.c, lastTs=+data[data.length-1][0];
    const regime=regimeMetrics(data,W);
    const ultimaVelaAbierta = Number.isFinite(+data[data.length-1]?.[6]) ? Date.now() <= +data[data.length-1][6] : null;
    const ultimosTres = [a.a,a.b,a.c].map((p,idx) => {
      const vela = data[p.i];
      const ts = vela ? (formatearFecha ? formatearFecha(vela[0]) : new Date(+vela[0]).toLocaleString()) : 'N/D';
      const abierta = vela && Number.isFinite(+vela[6]) ? Date.now() <= +vela[6] : null;
      return { etiqueta: ['g[-2]','g[-1]','g[0]'][idx], p, ts, abierta };
    });
    const monthlyTf=isCalendarMonthTf(currentTimeframe);
    const regressionStartTs=+data[Math.max(0,u.i-W)]?.[0];
    const lookbackStartTs=+data[0]?.[0];
    const regressionTime=monthlyTf && Number.isFinite(regressionStartTs)
      ? fmtDuration(lastTs-regressionStartTs)
      : candlesToTime(W,currentTimeframe,lastTs);
    const oneStepTargetTs=shiftByTfUnits(lastTs,1,currentTimeframe);
    const forecastTargetTs=shiftByTfUnits(lastTs,H,currentTimeframe);
    const forecastTime=candlesToTime(H,currentTimeframe,lastTs);
    const oneStepTime=candlesToTime(1,currentTimeframe,lastTs);
    const oneStepTargetText=Number.isFinite(oneStepTargetTs)?new Date(oneStepTargetTs).toLocaleString():'N/D';
    const forecastTargetText=Number.isFinite(forecastTargetTs)?new Date(forecastTargetTs).toLocaleString():'N/D';
    const lookbackTime=monthlyTf && Number.isFinite(lookbackStartTs)
      ? fmtDuration(lastTs-lookbackStartTs)
      : candlesToTime(data.length,currentTimeframe,lastTs);
    const rfOffset=a.xr===null?null:u.i-a.xr;
    const rfTargetTs=rfOffset===null?NaN:shiftByTfUnits(lastTs,-rfOffset,currentTimeframe);
    const rfElapsed=Number.isFinite(rfTargetTs)?fmtDuration(lastTs-rfTargetTs):'N/D';
    const rfText=a.xr===null
      ? 'N/D — sin cambio de signo; Regula Falsi no aplica todavía'
      : `cruce confirmado dentro del último intervalo: hace ${rfOffset.toFixed(3)} velas = ${rfElapsed}`;
    const secanteText=fmtRoot(a.xs,u.i,lastTs,currentTimeframe);
    const iqiText=fmtRoot(a.xq,u.i,lastTs,currentTimeframe);
    let dispersionText='N/D';
    if(a.spread!==null){
      if(monthlyTf && a.xs!==null && a.xq!==null){
        const tsSec=shiftByTfUnits(lastTs,a.xs-u.i,currentTimeframe);
        const tsIqi=shiftByTfUnits(lastTs,a.xq-u.i,currentTimeframe);
        const dt=Number.isFinite(tsSec)&&Number.isFinite(tsIqi)?fmtDuration(Math.abs(tsSec-tsIqi)):'N/D';
        dispersionText=`${a.spread.toFixed(3)} velas = ${dt}`;
      }else{
        dispersionText=`${a.spread.toFixed(3)} velas = ${candlesToTime(a.spread,currentTimeframe,lastTs)}`;
      }
    }
    const monthlyNote=monthlyTf
      ? '1M usa meses calendario y timestamps reales de Binance; no se supone un mes fijo de 30 días.'
      : '';
    const velaSerieText=ultimaVelaAbierta===null?'estado desconocido':ultimaVelaAbierta?'ABIERTA':'cerrada';
    const confidenceText=regime?regime.confidence.toFixed(1):'N/D';
    const confidenceState=regime?confidenceLabel(regime.confidence):'N/D';
    const torsionText=regime?`${regime.torsion>=0?'+':''}${regime.torsion.toFixed(1)}`:'N/D';
    const torsionState=regime?torsionLabel(regime.torsion):'N/D';
    const volatilityText=regime?`${(regime.vol*100).toFixed(4)}%`:'N/D';
    const volatilityRiskText=regime?`${(regime.volRisk*100).toFixed(1)}%`:'N/D';
    const kurtosisText=regime?regime.kurtExcess.toFixed(3):'N/D';
    const kurtosisRiskText=regime?`${(regime.kurtRisk*100).toFixed(1)}%`:'N/D';
    const skewText=regime?regime.skew.toFixed(3):'N/D';
    const tsv = [
      'REPORTE\tCruce numérico: precio vs pronóstico lineal',
      'Campo\tValor',
      `Mercado\t${String(market).toUpperCase()}`,
      `Par\t${par}`,
      `TF\t${monthlyTf?`${currentTimeframe} (mes calendario variable)`:`${currentTimeframe} (${oneStepTime} por vela)`}`,
      `Lookback\t${monthlyTf?`${data.length} velas calendario; span entre aperturas = ${lookbackTime}`:`${data.length} velas = ${lookbackTime}`}`,
      `Ventana de regresión\t${W} velas = ${regressionTime}`,
      `Pronóstico lineal\t${monthlyTf?`1 paso = próxima vela calendario: ${oneStepTime}; objetivo ${oneStepTargetText}`:`1 paso = 1 vela = ${oneStepTime}`}`,
      `Horizonte máximo de pronóstico de cruce\t${H} velas = ${forecastTime}${monthlyTf?`; objetivo calendario ${forecastTargetText}`:''}`,
      ...(monthlyNote?[`Nota temporal\t${monthlyNote}`]:[]),
      `Estado\t${a.state}`,
      `Close\t${u.y.toFixed(4)}`,
      `Pronóstico 1 paso\t${u.p.toFixed(4)}`,
      `g(t)\t${u.g.toFixed(4)}`,
      `Próximo pronóstico lineal\t${Number.isFinite(r.next)?r.next.toFixed(4):'N/D'}`,
      `Última vela de la serie\t${velaSerieText}`,
      '',
      'RÉGIMEN Y TORSIÓN\tValor',
      `Volatilidad por vela\t${volatilityText}`,
      `Riesgo relativo por volatilidad\tpercentil ${volatilityRiskText}`,
      `Exceso de curtosis\t${kurtosisText}`,
      `Riesgo relativo por curtosis\tpercentil ${kurtosisRiskText}`,
      `Confianza normalizada\t${confidenceText}/100 (${confidenceState})`,
      `Asimetría de retornos\t${skewText}`,
      `Torsión normalizada\t${torsionText}/100 (${torsionState})`,
      `Fórmula confianza\t100 × [1 - (0.60 × percentil volatilidad + 0.40 × percentil curtosis positiva)]`,
      `Fórmula torsión\ttanh(asimetría) × confianza`,
      '',
      'Punto\tTimestamp\tClose\tPronóstico\tg(t)\tVela',
      ...ultimosTres.map(x=>[
        x.etiqueta,
        x.ts,
        x.p.y.toFixed(4),
        x.p.p.toFixed(4),
        x.p.g.toFixed(4),
        x.abierta===null?'N/D':x.abierta?'abierta':'cerrada'
      ].join('\t')),
      '',
      'Método\tEstimación\tRol',
      `Secante\t${secanteText}\tAnticipación, 2 errores`,
      `IQI\t${iqiText}\tAnticipación curva, 3 errores`,
      `Regula Falsi\t${rfText}\tConfirmación con cambio de signo`,
      '',
      `Dispersión Secante–IQI\t${dispersionText}`
    ].join('\n');
    const direction=u.g>0?'Precio sobre la línea; un cruce futuro implica convergencia hacia abajo.':u.g<0?'Precio bajo la línea; un cruce futuro implica convergencia hacia arriba.':'Precio sobre la línea.';
    resumenDiv.innerHTML='<div id="resumen" style="padding:20px;"></div>'; resumenDiv.classList.add('show');
    document.getElementById('resumen').innerHTML=`
      <h1>Cruce numérico: precio vs pronóstico lineal</h1>
      <p><b>TF:</b> ${monthlyTf?`${currentTimeframe} — mes calendario variable`:`${currentTimeframe} — 1 vela = ${oneStepTime}`}</p>
      <p><b>Lookback cargado:</b> ${monthlyTf?`${data.length} velas calendario; span entre aperturas = ${lookbackTime}`:`${data.length} velas = ${lookbackTime}`}</p>
      <p><b>Ventana de regresión:</b> ${W} velas = ${regressionTime}</p>
      <p><b>Pronóstico lineal:</b> ${monthlyTf?`1 paso = próxima vela calendario: ${oneStepTime} (objetivo ${oneStepTargetText})`:`1 paso = 1 vela = ${oneStepTime}`}</p>
      <p><b>Horizonte máximo de pronóstico de cruce:</b> ${H} velas = ${forecastTime}${monthlyTf?` (objetivo calendario ${forecastTargetText})`:''}</p>
      ${monthlyNote?`<p style="color:#666;"><b>Nota 1M:</b> ${monthlyNote}</p>`:''}
      <p><b>Estado:</b> ${a.state}</p>
      <p><b>Close:</b> ${u.y.toFixed(4)} | <b>Pronóstico 1 paso:</b> ${u.p.toFixed(4)} | <b>g(t):</b> ${u.g.toFixed(4)}</p>
      <p><b>Última vela de la serie:</b> ${velaSerieText}</p>
      <div style="margin:14px 0;padding:12px;border:1px solid #ccc;border-radius:6px;">
        <h3 style="margin-top:0;">Confianza y torsión</h3>
        <p><b>Confianza normalizada:</b> ${confidenceText}/100 — ${confidenceState}</p>
        <p><b>Volatilidad por vela:</b> ${volatilityText} | <b>riesgo relativo:</b> percentil ${volatilityRiskText}</p>
        <p><b>Exceso de curtosis:</b> ${kurtosisText} | <b>riesgo relativo:</b> percentil ${kurtosisRiskText}</p>
        <p><b>Asimetría de retornos:</b> ${skewText}</p>
        <p><b>Torsión normalizada:</b> ${torsionText}/100 — ${torsionState}</p>
        <p style="color:#666;font-size:.9em;margin-bottom:0;">Confianza = 100 × [1 − (60% riesgo por volatilidad + 40% riesgo por curtosis positiva)]. Torsión = tanh(asimetría) × confianza. Es un índice relativo al historial cargado del mismo timeframe, no una probabilidad de acierto.</p>
      </div>
      <table><thead><tr><th>Punto</th><th>Timestamp</th><th>Close</th><th>Pronóstico</th><th>g(t)</th><th>Vela</th></tr></thead><tbody>
      ${ultimosTres.map(x=>`<tr><td>${x.etiqueta}</td><td>${x.ts}</td><td>${x.p.y.toFixed(4)}</td><td>${x.p.p.toFixed(4)}</td><td>${x.p.g.toFixed(4)}</td><td>${x.abierta===null?'N/D':x.abierta?'abierta':'cerrada'}</td></tr>`).join('')}
      </tbody></table>
      <p><b>Próximo pronóstico lineal:</b> ${Number.isFinite(r.next)?r.next.toFixed(4):'N/D'}</p>
      <p>${direction}</p>
      <table><thead><tr><th>Método</th><th>Estimación</th><th>Rol</th></tr></thead><tbody>
      <tr><td>Secante</td><td>${secanteText}</td><td>Anticipación, 2 errores</td></tr>
      <tr><td>IQI</td><td>${iqiText}</td><td>Anticipación curva, 3 errores</td></tr>
      <tr><td>Regula Falsi</td><td>${rfText}</td><td>Confirmación con cambio de signo</td></tr>
      </tbody></table>
      <p><b>Dispersión Secante–IQI:</b> ${dispersionText}</p>\n      <button type="button" id="copiarReporteTSV" style="margin:12px 0;padding:9px 14px;cursor:pointer;">Copiar reporte tabulado</button>
      <div style="height:380px;margin:15px 0"><canvas id="crossNumericChart"></canvas></div>
      <p style="color:#666;font-size:.9em">g(t)=precio−pronóstico. El indicador separa anticipación (Secante/IQI) de confirmación (Regula Falsi); no interpreta el cruce como señal de compra o venta.</p>`;
    const copyBtn=document.getElementById('copiarReporteTSV');
    if(copyBtn){
      copyBtn.addEventListener('click', async ()=>{
        const original=copyBtn.textContent;
        try{
          if(navigator.clipboard && window.isSecureContext){
            await navigator.clipboard.writeText(tsv);
          }else{
            const ta=document.createElement('textarea');
            ta.value=tsv;
            ta.setAttribute('readonly','');
            ta.style.position='fixed';
            ta.style.opacity='0';
            document.body.appendChild(ta);
            ta.select();
            const ok=document.execCommand('copy');
            document.body.removeChild(ta);
            if(!ok) throw new Error('copy command failed');
          }
          copyBtn.textContent='Copiado ✓';
        }catch(err){
          console.error('No se pudo copiar el reporte:',err);
          copyBtn.textContent='Error al copiar';
        }
        setTimeout(()=>{copyBtn.textContent=original;},1800);
      });
    }
    setTimeout(()=>chart('crossNumericChart',data,r,cross,formatearFecha),100);
    document.body.scrollTop=0; document.documentElement.scrollTop=0;
  };
  window.CruceNumerico={run};
})();