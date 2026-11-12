/* OFP 解读（Emirates LIDO 格式）—— 依据 EK OFP Decodes（OM 10.1.7）。点任何字：说明这个字 + 这一整行（或整段）在说什么。全部离线。 */
(function (root) {
  'use strict';
  // 词条 [中文, English]（按 EK OFP Decodes 整理成白话）
  // 通用词条 [中文, English]（ICAO / 行业通用说明；公司手册里的细节在「公司 OFP 解读」导入后另外显示）
  const G = {
    UAE: ['ATC 呼号（ATC 飞行计划里用的呼号，可能和航班号不同）', 'ATC call sign'],
    OFP: ['运行飞行计划（Operational Flight Plan）及其编号', 'Operational flight plan and its number'],
    'WX PROG': ['计算用的高空风温预报时段（UTC）', 'Upper-air forecast period used (UTC)'],
    CTOT: ['计算起飞时间（流量管理给的起飞时隙）', 'Calculated take-off time (slot)'],
    'PARKING BAY': ['停机位（手写）', 'Parking stand (fill in)'], CAPT: ['机长（填姓名 / 员工号）', 'Commander'], SIGNATURE: ['机长签名', 'Commander signature'],
    'ATC CLRNC': ['写 ATC 放行许可的地方', 'Space for ATC clearance'], 'PLND FL': ['计划巡航高度，以及在哪个点改高度', 'Planned cruise levels and step points'],
    TRIP: ['航程油：从起飞到目的地落地的耗油，后面是飞行时间', 'Trip fuel and flight time'],
    CONT: ['应急油（Contingency）', 'Contingency fuel'], 'P/C': ['百分比', 'per cent'], PC: ['百分比', 'per cent'],
    STATCON: ['统计应急油（按历史数据计算）', 'Statistical contingency fuel'], STATCONT: ['统计应急油数据', 'Statistical contingency data'],
    ALTN: ['备降油：从目的地飞到备降场的油', 'Alternate fuel'], FRSV: ['最后储备油（Final Reserve）', 'Final reserve fuel'], FINL: ['最后储备油', 'Final reserve'],
    'FMC-RSV': ['要输入 FMC 的储备油（吨）', 'Reserve fuel for the FMC (t)'],
    ADDNL: ['附加油', 'Additional fuel'], EXTRA: ['额外油（后面是原因代码）', 'Extra fuel (with reason code)'],
    'T/O FUEL': ['起飞油 = 航程 + 应急 + 备降 + 最后储备 + 附加 + 额外', 'Take-off fuel'], TAXI: ['滑行油和滑行时间', 'Taxi fuel and time'],
    'RAMP FUEL': ['总油（撤轮挡时，吨）和可飞时间', 'Ramp fuel (t) and endurance'], CORR: ['修正栏（手写）', 'Correction (fill in)'],
    ARR: ['计划到达时间 STA；后面空格填实际', 'Scheduled arrival; actuals to fill in'], DEP: ['计划离港时间 STD；后面空格填实际', 'Scheduled departure; actuals to fill in'],
    ET: ['计划经过时间', 'Elapsed time'], 'GND DIST': ['地面距离（海里）', 'Ground distance (nm)'], 'AIR DIST': ['空中距离（海里，考虑风）', 'Air distance (nm)'],
    'CRZ DEG': ['巡航性能衰减系数（比标准多耗油的百分比）', 'Cruise performance degradation'], CID: ['成本指数（Cost Index）', 'Cost index'],
    CRZ: ['巡航速度方式（ECON 经济 / LRC 远程 / MACH 定马赫）', 'Cruise schedule'], ECON: ['经济巡航', 'Economy cruise'], LRC: ['远程巡航', 'Long-range cruise'],
    'CRZ FL/TEMP': ['初始巡航高度和温度（M = 零下）', 'Initial cruise level and temperature'], 'TOC TROP': ['爬升顶点处的对流层顶（英尺）', 'Tropopause at TOC (ft)'],
    ADJUST: ['油量调整（手写）', 'Fuel adjustment (fill in)'], 'ADJ RAMP FUEL': ['调整后的总油（手写）', 'Adjusted ramp fuel (fill in)'],
    'FUEL REMN': ['落地剩油（手写）', 'Fuel remaining (fill in)'], 'FUEL USED': ['实际用油（手写）', 'Fuel used (fill in)'],
    'AV TRK': ['平均航迹', 'Average track'], 'AV W/C': ['平均风分量（P 顺风 / M 逆风）', 'Average wind component'], 'AV ISA': ['平均 ISA 温度偏差', 'Average ISA deviation'],
    CREW: ['机组人数', 'Crew'], PAX: ['旅客人数', 'Passengers'], TOT: ['总人数', 'Total'],
    'ZFW CHANGE': ['无油重量改变 ±1 吨时，油耗和时间的变化', 'Effect of ±1 t ZFW'], 'FL CHANGE': ['高度改变时油耗和时间的变化', 'Effect of level change'], 'SPD CHANGE': ['成本指数改变时油耗和时间的变化', 'Effect of cost index change'],
    TANKERING: ['带油建议', 'Tankering advice'], 'DISCR FUEL REASON': ['机长额外加油的原因：ATC 空管、WX 天气、MEL 保留故障、ALTN 备降、OTH 其他', 'Discretionary fuel reason'],
    ATIS: ['写 ATIS 的地方', 'Space for ATIS'], DOW: ['干操作重量范围', 'Dry operating weight range'], DOI: ['干操作指数范围', 'Dry operating index range'],
    EZFW: ['预计无油重量', 'Estimated ZFW'], ETOW: ['预计起飞重量', 'Estimated TOW'], ELWT: ['预计落地重量', 'Estimated landing weight'],
    MZFW: ['最大无油重量', 'Max ZFW'], MTOW: ['最大起飞重量', 'Max TOW'], MLWT: ['最大落地重量', 'Max landing weight'],
    AZFW: ['实际无油重量（填）', 'Actual ZFW'], ATOW: ['实际起飞重量（填）', 'Actual TOW'], ALWT: ['实际落地重量（填）', 'Actual LW'],
    RTOW: ['性能限制的起飞重量', 'Regulated take-off weight'], RLWT: ['性能限制的落地重量', 'Regulated landing weight'],
    RWY: ['跑道', 'Runway'], ASSMD: ['假设温度（灵活推力）', 'Assumed temperature'], MFRH: ['最低收襟翼高度', 'Minimum flap retraction height'], FLAP: ['起飞襟翼', 'Take-off flap'],
    'CG-F/A': ['重心', 'Centre of gravity'], V1: ['决断速度', 'Decision speed'], VR: ['抬轮速度', 'Rotation speed'], V2: ['起飞安全速度', 'Take-off safety speed'], VREF: ['着陆参考速度', 'Landing reference speed'], EOP: ['发动机失效程序', 'Engine-out procedure'],
    'DEST ALTN': ['目的地备降场表', 'Destination alternates'], DIST: ['距离（海里）', 'Distance (nm)'], TRK: ['航迹', 'Track'], COMP: ['风分量（P 顺风 / M 逆风）', 'Wind component'],
    TIME: ['时间', 'Time'], FUEL: ['油量（kg）', 'Fuel (kg)'], ROUTING: ['去备降场的航路', 'Routing'],
    'DISPATCH BRIEFING INFO': ['签派给机组的提示', 'Dispatch remarks'], DISP: ['签派员', 'Dispatcher'], TEL: ['签派电话', 'Dispatch phone'], 'CREW NOTES': ['机组笔记', 'Crew notes'],
    WPT: ['航路点', 'Waypoint'], AWY: ['航路（DCT = 直飞）', 'Airway (DCT = direct)'], TRM: ['磁航迹', 'Magnetic track'], ITT: ['真航迹', 'True track'],
    WIND: ['风：风向（两位数，28 = 280°）/ 风速（节）', 'Wind: direction / speed'], 'SR/TDEV': ['风切变率 / ISA 温度偏差', 'Shear rate / ISA deviation'],
    SR: ['风切变率（风速随高度的变化，数字大可能颠簸）', 'Shear rate'], TDEV: ['ISA 温度偏差', 'ISA deviation'],
    FL: ['高度层（CLB 爬升 / DES 下降；中国境内米制：920 = 9200 米）', 'Flight level (China metric: 920 = 9,200 m)'],
    MORA: ['最低偏航高度（Minimum Off-Route Altitude），单位百英尺', 'Minimum off-route altitude (hundreds of ft)'], TAS: ['真空速（节）', 'True airspeed'],
    'W/C': ['风分量（P 顺风 / M 逆风）', 'Wind component'], 'SP/M': ['速度：小于 600 的是指示空速，800 多的是马赫数', 'Speed: IAS or Mach'],
    TROP: ['对流层顶（千英尺）', 'Tropopause (thousands of ft)'], STM: ['这一段的时间', 'Sector time'], ATM: ['累计时间', 'Accumulated time'],
    ETA: ['预计过点时间（填）', 'ETA (fill in)'], RTA: ['要求过点时间', 'Required time of arrival'], ATA: ['实际过点时间（填）', 'Actual time (fill in)'], REMF: ['实际剩油（填）', 'Remaining fuel (fill in)'],
    MINR: ['到这个点最少要剩的油（吨）', 'Minimum required fuel at this point (t)'],
    CLB: ['爬升', 'Climb'], DES: ['下降', 'Descent'], TOC: ['爬升顶点', 'Top of climb'], TOD: ['下降顶点', 'Top of descent'], BOC: ['爬升底点', 'Bottom of climb'], BOD: ['下降底点', 'Bottom of descent'],
    DCT: ['直飞', 'Direct'], '+': ['「+」标记（公司手册导入后显示含义）', '"+" marker'], '=': ['「=」标记：管制区边界航路点', 'FIR boundary waypoint'],
    ENTRY: ['ETOPS 进入点', 'ETOPS entry point'], EXIT: ['ETOPS 退出点', 'ETOPS exit point'], ETP: ['等时点', 'Equal time point'],
    ERA: ['航路备降场', 'En-route alternate'], DP: ['决断点', 'Decision point'], RIF: ['飞行中再放行', 'Reclearance in flight'], RALT: ['航路备降场（飞行计划第 18 项）', 'En-route alternates (FPL item 18)'],
    'MIN DP FUEL': ['到决断点时最少要有的油', 'Minimum fuel at decision point'], TRI: ['航程油', 'Trip fuel'], 'CRIT FUEL': ['ETOPS 临界油', 'ETOPS critical fuel'],
    'EK COMP FREQ': ['公司频率（手写）', 'Company frequency'], 'SPEC RQMNTS': ['特殊要求（手写）', 'Special requirements'],
    SA: ['METAR 实况', 'METAR'], SP: ['SPECI 特殊实况', 'SPECI'], FT: ['TAF 长预报', 'TAF (long)'], FC: ['TAF 短预报', 'TAF (short)'],
    NOSIG: ['未来 2 小时没有明显变化', 'No significant change'], CAVOK: ['能见度 10 公里以上、没有低云、没有天气现象', 'Ceiling and visibility OK'],
    NSC: ['没有明显的云', 'No significant cloud'], BECMG: ['逐渐变成', 'Becoming'], TEMPO: ['短时出现', 'Temporarily'], PROB30: ['30% 可能', '30 % probability'], PROB40: ['40% 可能', '40 % probability'],
    VALID: ['有效时间（年月日时分 UTC）', 'Validity (UTC)'], EST: ['结束时间是预计的', 'End time estimated'], UFN: ['直到另行通知', 'Until further notice'], PERM: ['永久', 'Permanent'],
    'LIDO-NOTAM-BULLETIN': ['航行通告汇编', 'NOTAM bulletin'], 'COMPANY NOTAM': ['公司通告', 'Company NOTAM'], 'CHART NOTAM': ['航图通告', 'Chart NOTAM'],
    SIGMETs: ['重要天气警告', 'SIGMETs'], AIRMETs: ['低空重要天气', 'AIRMETs']
  };
  const MULTI = Object.keys(G).filter(k => /\s/.test(k)).sort((a, b) => b.length - a.length);
  const Z = (zh, en) => ({ zh, en });
  const tm = s => s && /^\d{4}$/.test(s) ? (+s.slice(0, 2) ? +s.slice(0, 2) + ' 小时 ' : '') + (+s.slice(2)) + ' 分' : s;
  const tmE = s => s && /^\d{4}$/.test(s) ? (+s.slice(0, 2) ? +s.slice(0, 2) + 'h ' : '') + (+s.slice(2)) + 'm' : s;
  const kg = n => (+n).toLocaleString('en');
  const flv = s => +s >= 600 ? (+s * 10) + ' 米（≈FL' + Math.round(+s * 10 * 3.2808 / 100) + '）' : 'FL' + s;
  const spd = s => +s >= 600 ? '马赫 0.' + s : '指示空速 ' + s + ' 节';
  const spdE = s => +s >= 600 ? 'M.' + s : 'IAS ' + s + ' kt';

  function sections(L) {
    const sec = []; let cur = 'head';
    L.forEach((l, i) => {
      const t = l.trim();
      if (/^AWY\s+TRM\s+DIST/.test(t)) cur = 'nav';
      else if (/ROUTE TO DESTINATION ALTERNATE/.test(t)) cur = 'navalt';
      else if (/^DEST\s+ALTN\s+DIST/.test(t)) cur = 'altn';
      else if (/DISPATCH\s+BRIEFING/.test(t)) cur = 'disp';
      else if (/ETOPS\s+INFORMATION/.test(t)) cur = 'etops';
      else if (/^Weather\s*$/.test(t)) cur = 'wx';
      else if (/LIDO-NOTAM-BULLETIN/.test(t)) cur = 'notam';
      else if (/^Crew Information\s*$/.test(t)) cur = 'crew';
      else if ((cur === 'nav' || cur === 'navalt') && /\b(CLIMB|DESCENT)\b/.test(t)) cur = 'winds';
      else if (cur === 'winds' && /COMPANY NOTAM|^CO\d+\/\d{2}/.test(t)) cur = 'conotam';
      else if ((cur === 'disp' || cur === 'nav') && /^CO\d+\/\d{2}\s+COMPANY NOTAM/.test(t)) cur = 'conotam';
      sec[i] = cur;
    });
    return sec;
  }
  // 右边一栏（首页）：ARR / DEP / ET / GND DIST / … 的白话
  function rightCol(t) {
    const out = [], oe = []; let m;
    if ((m = /\bARR\s+(\d{4})/.exec(t))) { out.push('计划到达 STA ' + m[1] + 'Z（后两格填挡轮挡、接地时间）'); oe.push('STA ' + m[1] + 'Z'); }
    if ((m = /\bDEP\s+(\d{4})/.exec(t))) { out.push('计划离港 STD ' + m[1] + 'Z（后两格填撤轮挡、起飞时间）'); oe.push('STD ' + m[1] + 'Z'); }
    if ((m = /\bET\s+(\d{4})/.exec(t))) { out.push('计划经过时间 ' + tm(m[1])); oe.push('ET ' + tmE(m[1])); }
    if ((m = /GND DIST\s+(\d+)/.exec(t))) { out.push('地面距离 ' + kg(m[1]) + ' 海里'); oe.push('ground dist ' + m[1] + ' nm'); }
    if ((m = /AIR DIST\s+(\d+)/.exec(t))) { out.push('空中距离 ' + kg(m[1]) + ' 海里（考虑风）'); oe.push('air dist ' + m[1] + ' nm'); }
    if ((m = /CRZ DEG\s+([PM])([\d.]+)/.exec(t))) { out.push('这架飞机巡航性能衰减 ' + (m[1] === 'P' ? '+' : '−') + m[2] + '%'); oe.push('cruise degradation ' + m[1] + m[2] + '%'); }
    if ((m = /\bCID\s+(\d+)(\s+VSOPS)?/.exec(t))) { out.push('成本指数 ' + m[1] + (m[2] ? '（VSOPS）' : '')); oe.push('CI ' + m[1]); }
    if ((m = /CRZ FL\/TEMP\s+FL(\d+)\/([PM])(\d+)/.exec(t))) { out.push('第一个巡航高度 FL' + m[1] + '，温度 ' + (m[2] === 'M' ? '−' : '+') + (+m[3]) + '°C'); oe.push('initial FL' + m[1] + ', ' + (m[2] === 'M' ? '−' : '+') + m[3] + '°C'); }
    else if ((m = /\bCRZ\s+(ECON|MACH|LRC|VRBL)/.exec(t))) { out.push('巡航方式 ' + m[1] + ({ ECON: '（经济）', LRC: '（远程巡航）', MACH: '（定马赫）', VRBL: '（可变）' }[m[1]])); oe.push('cruise ' + m[1]); }
    if ((m = /TOC TROP\s+(\d+)/.exec(t))) { out.push('爬升顶点处对流层顶约 ' + kg(m[1]) + ' 英尺'); oe.push('tropopause at TOC ' + m[1] + ' ft'); }
    if ((m = /AV TRK\s+(\d+)/.exec(t))) { out.push('平均真航迹 ' + m[1] + '°'); oe.push('avg true track ' + m[1] + '°'); }
    if ((m = /AV W\/C\s+([PM])(\d+)/.exec(t))) { out.push('平均' + (m[1] === 'M' ? '逆风 ' : '顺风 ') + (+m[2]) + ' 节'); oe.push('avg ' + (m[1] === 'M' ? 'headwind ' : 'tailwind ') + (+m[2]) + ' kt'); }
    if ((m = /AV ISA\s+([PM])(\d+)/.exec(t))) { out.push('平均温度比标准' + (m[1] === 'P' ? '高 ' : '低 ') + (+m[2]) + '°C'); oe.push('ISA ' + (m[1] === 'P' ? '+' : '−') + (+m[2])); }
    if (/\bCREW\b.*\.\.\./.test(t)) { out.push('CREW / PAX / TOT 填机组、旅客、总人数'); oe.push('crew / pax / total'); }
    return { zh: out.join('；'), en: oe.join('; ') };
  }
  const join = (a, r) => r.zh ? Z(a.zh + (a.zh ? '<br>' : '') + '<span class="rc">▸ ' + r.zh + '</span>', a.en + (a.en ? '<br>' : '') + '▸ ' + r.en) : a;


  // ---------- 按表头的列位置读一行（LIDO 是等宽排版，每个数字都在它那一栏下面） ----------
  function colsOf(H) { const c = []; String(H || '').replace(/\S+/g, (m, o) => { c.push({ k: m, a: o, b: o + m.length }); }); return c; }
  function cellsOf(line, H) {
    const C = colsOf(H), out = {}; if (!C.length) return out;
    String(line).replace(/\S+/g, (w, a) => {
      const b = a + w.length, c = (a + b) / 2; let best = null, bd = 1e9;
      C.forEach(x => { const ov = Math.min(b, x.b) - Math.max(a, x.a), d = ov > 0 ? -ov : Math.min(Math.abs(c - x.a), Math.abs(c - x.b)); if (d < bd) { bd = d; best = x.k; } });
      if (w === '+' || w === '=') best = w;
      if (/^\.+$/.test(w)) return;
      if (best) out[best] = out[best] ? out[best] + ' ' + w : w;
    });
    return out;
  }
  const nm = n => (+n).toLocaleString('en');
  const isaAt = fl => Math.max(-56.5, 15 - 1.98 * fl / 10);           // fl 以百英尺计
  const metric = fl => fl % 10 ? '（约 ' + nm(Math.round(fl * 30.48 / 100) * 100) + ' 米）' : '';
  const metricE = fl => fl % 10 ? ' (≈' + nm(Math.round(fl * 30.48 / 100) * 100) + ' m)' : '';
  const PTN = { TOC: ['爬升顶点 TOC', 'top of climb'], TOD: ['下降顶点 TOD', 'top of descent'], T_O_D: ['下降顶点 TOD', 'top of descent'], T_O_C: ['爬升顶点 TOC', 'top of climb'], BOC: ['爬升起点', 'bottom of climb'], BOD: ['下降底点', 'bottom of descent'] };
  const ptZ = w => PTN[w] ? PTN[w][0] : w, ptE = w => PTN[w] ? PTN[w][1].toUpperCase() === w ? w : PTN[w][1] + ' (' + w.replace(/_/g, '') + ')' : w;
  // 导航日志：一条航段（AWY 行）+ 到达的航路点（WPT 行）合成一段话
  function navHdr(L, i) { for (let k = i; k >= 0 && k > i - 300; k--) if (/^AWY\s+TRM/.test(L[k])) return [L[k], L[k + 1]]; return null; }
  const isLeg = t => /\b\d{2}\/\d{3}\b/.test(t) && /\.\.\s+\.\./.test(t);
  const isWpt = t => /\.{4}\s+\.{4}\s+[\d.]+\s*$/.test(t) || /^\s*[A-Z]{4}\/\w+\s+[\d.]+\s*$/.test(t);
  function prevWpt(L, i) { for (let k = i - 1; k >= 0 && k > i - 40; k--) { const t = L[k].trim(); if (/^AWY\s+TRM/.test(t)) return null; if (isWpt(L[k])) return t.split(/\s+/)[0]; } return null; }
  function navSay(L, i, ctx) {
    const H = navHdr(L, i); if (!H) return null;
    let li = -1, wi = -1;
    if (isLeg(L[i])) { li = i; for (let k = i + 1; k < L.length && k < i + 4; k++) if (isWpt(L[k])) { wi = k; break; } }
    else if (isWpt(L[i])) { wi = i; for (let k = i - 1; k >= 0 && k > i - 4; k--) { if (isLeg(L[k])) { li = k; break; } if (L[k].trim()) break; } }
    else return null;
    const W = wi >= 0 ? cellsOf(L[wi], H[1]) : {}, G = li >= 0 ? cellsOf(L[li], H[0]) : {};
    const name = (W.WPT || '').split(' ')[0], dep = /^([A-Z]{4})\/(\w+)$/.exec(name);
    // 起飞机场那一行（只有剩油）
    if (dep && li < 0 && W.MINR && !W.ATM) return Z('起飞：<b>' + dep[1] + '</b> ' + dep[2] + ' 号跑道。松刹车起飞时最少要有 <b>' + W.MINR + ' 吨</b>油。', 'Departure from ' + dep[1] + ' runway ' + dep[2] + '. You need at least ' + W.MINR + ' t of fuel at take-off.');
    const zh = [], en = [];
    const from = prevWpt(L, li >= 0 ? li : wi);
    if (li >= 0) {
      const awy = (G.AWY || '').split(' ')[0], via = awy === 'DCT' ? '直飞到' : '沿 <b>' + awy + '</b> 飞到', viaE = awy === 'DCT' ? 'direct' : 'via ' + awy;
      const wd = /^(\d{2})\/(\d{3})$/.exec(G.WIND || ''), fl = G.FL || '', tas = G.TAS, sp = G.SP_M || G['SP/M'], stm = G.STM;
      let lv = '', lvE = '';
      if (fl === 'CLB') { lv = '还在爬升'; lvE = 'still climbing'; } else if (fl === 'DES') { lv = '在下降'; lvE = 'descending'; }
      else if (/^\d+$/.test(fl)) { if (+fl >= 600) { lv = '高度 ' + nm(+fl * 10) + ' 米（中国米制，约 FL' + Math.round(+fl * 10 * 3.2808 / 100) + '）'; lvE = 'at ' + nm(+fl * 10) + ' m (China metric, ≈FL' + Math.round(+fl * 10 * 3.2808 / 100) + ')'; } else { lv = '高度 FL' + fl.padStart(3, '0'); lvE = 'at FL' + fl.padStart(3, '0'); } }
      let spd = '', spdE = '';
      if (sp) { if (+sp >= 600) { spd = '马赫 0.' + sp; spdE = 'Mach .' + sp; } else { spd = '指示空速 ' + +sp + ' 节'; spdE = 'IAS ' + +sp + ' kt'; } }
      const fz = from && /^[A-Z]{4}\/\w+$/.test(from) ? from.split('/')[0] + ' 起飞后' : from ? '从 <b>' + from + '</b> ' : '';
      zh.push(fz + via + ' <b>' + ptZ(name) + '</b>：' + [G.TRM ? '磁航迹 ' + G.TRM + '°' : '', G.DIST ? '距离 ' + +G.DIST + ' 海里' : '', wd ? '风从 ' + wd[1] + '0° 吹来，' + +wd[2] + ' 节' : '', lv, tas ? '真空速 ' + +tas + ' 节' : '', spd, stm ? '这一段飞 ' + +stm + ' 分钟' : ''].filter(Boolean).join('，') + '。');
      en.push((from && /^[A-Z]{4}\/\w+$/.test(from) ? 'After take-off from ' + from.split('/')[0] + ', fly ' : from ? 'From ' + from + ' ' : 'Fly ') + viaE + ' to ' + ptE(name) + ': ' + [G.TRM ? 'magnetic track ' + G.TRM + '°' : '', G.DIST ? +G.DIST + ' nm' : '', wd ? 'wind from ' + wd[1] + '0° at ' + +wd[2] + ' kt' : '', lvE, tas ? 'TAS ' + +tas + ' kt' : '', spdE, stm ? 'this leg takes ' + +stm + ' min' : ''].filter(Boolean).join(', ') + '.');
    }
    if (wi >= 0) {
      const sr = /^(\d{2})?\/([PM])(\d{2})$/.exec(W['SR/TDEV'] || ''), mora = W.MORA ? +W.MORA * 100 : null, wc = /^([PM])(\d{3})$/.exec(W['W/C'] || ''), trop = W.TROP, atm = W.ATM, minr = W.MINR;
      const p = ctx && ctx.nav && ctx.nav.find(x => x.id === name.split('/')[0]), at = ctx && ctx.atP && p ? ctx.atP(p.t) : '';
      const dest = /^([A-Z]{4})\/(\w+)$/.exec(name), mark = W['+'] ? '（强制报告点，要向管制报告）' : W['='] ? '（管制区边界点）' : '', markE = W['+'] ? ' (compulsory reporting point)' : W['='] ? ' (FIR boundary)' : '';
      const z = [], e = [];
      if (atm) { z.push('起飞后 <b>' + tm(atm) + '</b> ' + (dest ? '落地' : '到') + (at ? '（约 ' + at + '）' : '')); e.push((dest ? 'landing ' : 'reached ') + tmE(atm) + ' after take-off' + (at ? ' (about ' + at + ')' : '')); }
      if (W.ITT) { z.push('出航真航迹 ' + W.ITT + '°'); e.push('outbound true track ' + W.ITT + '°'); }
      if (sr) { z.push('气温比标准' + (sr[2] === 'P' ? '高 ' : '低 ') + +sr[3] + '°C'); e.push('temperature ISA ' + (sr[2] === 'P' ? '+' : '−') + +sr[3] + ' °C'); if (sr[1] && +sr[1] > 0) { z.push('风切变率 ' + +sr[1] + (+sr[1] >= 4 ? '（偏大，可能颠簸）' : '（小）')); e.push('wind shear rate ' + +sr[1] + (+sr[1] >= 4 ? ' (high — possible turbulence)' : '')); } }
      if (wc) { z.push((wc[1] === 'M' ? '逆风 ' : '顺风 ') + +wc[2] + ' 节'); e.push((wc[1] === 'M' ? 'headwind ' : 'tailwind ') + +wc[2] + ' kt'); }
      if (mora != null) { z.push('MORA ' + nm(mora) + ' 英尺' + (mora >= 15000 ? '，<b>地形很高</b>' : mora >= 10000 ? '，地形较高' : '')); e.push('MORA ' + nm(mora) + ' ft' + (mora >= 15000 ? ' — high terrain' : '')); }
      if (trop) { z.push('对流层顶约 ' + nm(+trop * 1000) + ' 英尺'); e.push('tropopause about ' + nm(+trop * 1000) + ' ft'); }
      if (minr) { z.push('到这里最少要剩 <b>' + minr + ' 吨</b>油'); e.push('minimum fuel here ' + minr + ' t'); }
      zh.push((dest ? '到达 <b>' + dest[1] + '</b> ' + dest[2] + ' 号跑道' : (li >= 0 ? '到 ' : '航路点 ') + '<b>' + ptZ(name) + '</b>' + mark) + '：' + z.join('，') + '。');
      en.push((dest ? 'Arrival at ' + dest[1] + ' runway ' + dest[2] : 'At ' + ptE(name) + markE) + ': ' + e.join(', ') + '.');
      if (li < 0 && wi >= 0 && from) { zh.unshift('（上一个点是 ' + from + '）'); }
    }
    zh.push('<span style="opacity:.7">「.. ..」写预计过点时间，「.....」写实际剩油，「.... ....」写要求 / 实际过点时间。</span>');
    en.push('<span style="opacity:.7">Blanks: ETA, actual fuel remaining, RTA / ATA.</span>');
    return { zh: zh.join('<br>'), en: en.join('<br>'), lines: [li, wi].filter(x => x >= 0) };
  }
  // 高空风温表：每块 4 栏，第一行是点名（或 CLIMB / DESCENT），然后是纬度、经度，再是「高度 风向/风速 温度」
  function windsSay(L, i, ctx) {
    const blank = l => !l || !l.trim() || /^\s*Page\s+\d+/.test(l) || /^\s*(?:UAE|EK)\d+\/\d{2}[A-Za-z]{3}/.test(l);
    const isHead = l => /^\s*[A-Z_][A-Z0-9_]{1,9}(\s+[A-Z_][A-Z0-9_]{1,9}){0,4}\s*$/.test(l || '') && !/[NS]\d{4}\.\d/.test(l);
    if (blank(L[i])) return null;
    let a = i; while (a > 0 && !isHead(L[a]) && !blank(L[a - 1]) && i - a < 12) a--;
    if (!isHead(L[a])) return null;
    let b = a; while (b + 1 < L.length && !blank(L[b + 1]) && !isHead(L[b + 1]) && b - a < 12) b++;
    if (i > b) return null;
    const C = colsOf(L[a]); if (!C.length) return null;
    // 每一格：纬度 / 经度 / 「高度 风向/风速 温度」，按位置归到最近的那一栏
    const cellsIn = l => { const out = []; String(l).replace(/[NS]\d{4}\.\d|[EW]\d{5}\.\d|\d{3}\s+\d{3}\/\d{3}\s+[PM+-]?\d{2}\b/g, (m, o) => { out.push({ v: m, a: o, b: o + m.length }); }); return out; };
    const colOf = x => { let k = 0, bd = 1e9; C.forEach((c0, n) => { const d = Math.abs(x - c0.a); if (d < bd) { bd = d; k = n; } }); return k; };
    const pos = ctx && ctx.pos != null ? ctx.pos : 0;
    let c = 0;
    if (i === a) { let bd = 1e9; C.forEach((c0, n) => { const d = pos < c0.a ? c0.a - pos : pos > c0.b ? pos - c0.b : 0; if (d < bd) { bd = d; c = n; } }); }
    else { const cs = cellsIn(L[i]); let hit = cs.find(x => pos >= x.a - 1 && pos <= x.b + 1); if (!hit && cs.length) hit = cs.reduce((p0, x) => Math.abs((x.a + x.b) / 2 - pos) < Math.abs((p0.a + p0.b) / 2 - pos) ? x : p0); c = hit ? colOf(hit.a) : colOf(pos); }
    const nameRaw = C[c].k, rows = [];
    let lat = '', lon = '';
    for (let r = a + 1; r <= b; r++) cellsIn(L[r]).forEach(x => {
      if (colOf(x.a) !== c) return; const v = x.v; let m;
      if ((m = /^([NS])(\d{2})(\d{2}\.\d)$/.exec(v))) lat = { z: (m[1] === 'N' ? '北纬 ' : '南纬 ') + +m[2] + '°' + m[3] + '′', e: m[1] + +m[2] + '°' + m[3] + '′' };
      else if ((m = /^([EW])(\d{3})(\d{2}\.\d)$/.exec(v))) lon = { z: (m[1] === 'E' ? '东经 ' : '西经 ') + +m[2] + '°' + m[3] + '′', e: m[1] + +m[2] + '°' + m[3] + '′' };
      else if ((m = /^(\d{3})\s+(\d{3})\/(\d{3})\s+([PM+-]?)(\d{2})$/.exec(v))) { const fl = +m[1], t = (m[4] === 'M' || m[4] === '-' ? -1 : 1) * +m[5]; rows.push({ r, fl, dir: m[2], spd: +m[3], t, dev: Math.round(t - isaAt(fl)) }); }
    });
    if (!rows.length) return null;
    const sel = rows.find(x => x.r === i);
    const kind = /^CLIMB$/.test(nameRaw) ? 'clb' : /^DESCENT$/.test(nameRaw) ? 'des' : 'wpt';
    const tz = t => (t > 0 ? '+' : t < 0 ? '−' : '') + Math.abs(t) + '°C', dz = d => d === 0 ? '和标准一样' : '比标准' + (d > 0 ? '高 ' : '低 ') + Math.abs(d) + '°', de = d => 'ISA ' + (d >= 0 ? '+' : '−') + Math.abs(d);
    const rowZ = x => 'FL' + String(x.fl).padStart(3, '0') + metric(x.fl) + '：风从 ' + +x.dir + '° 吹来，' + x.spd + ' 节；气温 ' + tz(x.t) + '（' + dz(x.dev) + '）';
    const rowE = x => 'FL' + String(x.fl).padStart(3, '0') + metricE(x.fl) + ': wind from ' + +x.dir + '° at ' + x.spd + ' kt, temperature ' + tz(x.t).replace('°C', ' °C') + ' (' + de(x.dev) + ')';
    const B = (x, s) => x === sel ? '<b>' + s + '</b>' : s;
    const hz = kind === 'clb' ? '<b>爬升阶段</b>的风和温度（从起飞爬到巡航，按高度列出；可以输入 FMC 的爬升风）：' : kind === 'des' ? '<b>下降阶段</b>的风和温度（从巡航降到进近，按高度列出；输入 FMC 的下降风 DES FORECAST）：' : '<b>' + ptZ(nameRaw) + '</b>' + (lat ? '（' + lat.z + '，' + lon.z + '）' : '') + ' 这个点上空的风和温度：';
    const he = kind === 'clb' ? '<b>Climb</b> winds and temperatures by level (for the FMC climb winds):' : kind === 'des' ? '<b>Descent</b> winds and temperatures by level (for the FMC descent forecast):' : '<b>' + ptE(nameRaw) + '</b>' + (lat ? ' (' + lat.e + ' ' + lon.e + ')' : '') + ' — winds and temperatures aloft:';
    const top = sel ? '你点的这一格：' + rowZ(sel) + '。<br>' : '', topE = sel ? 'This cell: ' + rowE(sel) + '.<br>' : '';
    const strong = rows.reduce((p, x) => x.spd > p.spd ? x : p, rows[0]);
    const tail = rows.length > 1 ? '<br>最强的风在 FL' + String(strong.fl).padStart(3, '0') + '（' + strong.spd + ' 节）。温度是实际气温（不是温差），负号 = 零下。' : '';
    const tailE = rows.length > 1 ? '<br>Strongest wind at FL' + String(strong.fl).padStart(3, '0') + ' (' + strong.spd + ' kt). Temperatures are actual air temperature; minus = below zero.' : '';
    return { zh: top + hz + '<br>' + rows.map(x => '• ' + B(x, rowZ(x))).join('<br>') + tail, en: topE + he + '<br>' + rows.map(x => '• ' + B(x, rowE(x))).join('<br>') + tailE, lines: [a, b] };
  }

  function lineSay(L, i, sec, ctx) {
    const l = L[i], t = l.replace(/\s+/g, ' ').trim(); let m;
    if (!t) return null;
    const R = rightCol(t);
    if ((m = /^Page\s+(\d+)\s+of\s+(\d+)$/.exec(t))) return Z('第 ' + m[1] + ' 页（共 ' + m[2] + ' 页）', 'Page ' + m[1] + ' of ' + m[2]);
    if (/^ATC\s+CLRNC/.test(t)) return Z('写 ATC 放行许可的地方（手写）。', 'Space for ATC clearance.');
    if ((m = /^([A-Z]{4})\s+ATIS:/.exec(t))) return Z('写 ' + m[1] + ' 的 ATIS（手写）。', 'Write the ' + m[1] + ' ATIS here.');
    if (/^[.\s]{20,}$/.test(t) && sec === 'head') return Z('起飞性能手写栏：跑道、假设温度、最低收襟翼高度、襟翼、重心、V1 / VR / V2 / VREF、发动机失效程序。', 'Take-off performance entry line.');
    if (/^CREW\s+NOTES/.test(t)) return Z('机组笔记（手写）。', 'Crew notes.');
    if (/^(WX\/NOTAM|NO DATA AVAILABLE|OFP|NOTAM|Weather)$/.test(t)) return Z({ 'WX/NOTAM': '天气 / 通告封面', 'NO DATA AVAILABLE': '没有资料', OFP: '飞行计划正文开始', NOTAM: '航行通告部分', Weather: '天气部分开始' }[t], t);
    if (sec === 'head' && i < 20 && !/^(EXTRA|ADDNL|TRIP|CONT|ALTN|FRSV|TAXI|FUEL|RAMP|ADJUST|PLND|OFP)\b/.test(t) && !/\b\d{4}\b/.test(t) && /^([A-Z0-9]{2,7}(?:\/\w+)?\s+)*[A-Z0-9]{2,7}(?:\/\w+)?$/.test(t) && L.slice(Math.max(0, i - 3), i).some(x => /^\s*[A-Z]{6}[A-Z]*\d+:|^\s*(?:[A-Z0-9]{2,7}\s+){3,}/.test(x)))
      return Z('航路（接上一行）：' + t.split(' ').map(x => /^[A-Z]{4}\/\w+$/.test(x) ? x.replace('/', ' 跑道 ') + '（落地）' : x).join(' → '), 'Route (continued): ' + t);
    if (sec === 'altn' && /^([A-Z0-9]{2,7}\s*)+$/.test(t)) return Z('去备降场的航路（接上一行）：' + t, 'Alternate routing (continued): ' + t);
    if ((m = /^-\s+FUEL\s+ENROUTE\s+AIRPORT\s+(\w{4})/.exec(t))) return Z('签派指定航路加油 / 备降机场：<b>' + m[1] + '</b>（需要时可以去这里加油）。', 'Fuel en-route airport ' + m[1] + '.');
    // ---------- 首页 ----------
    if ((m = /^(?:EK)?(\d+)\s+(\d{2}[A-Z]{3})\s+(\w{4})\/(\w{3})\s*-\s*(\w{4})\/(\w{3})\s+(\S+)\s+(\S+)/.exec(t))) return Z('航班 <b>EK' + m[1] + '</b>，' + m[2] + '。' + m[3] + '/' + m[4] + ' → ' + m[5] + '/' + m[6] + '，机型 ' + m[7] + '，注册号 ' + m[8] + '。', 'Flight <b>EK' + m[1] + '</b> on ' + m[2] + ', from ' + m[3] + ' (' + m[4] + ') to ' + m[5] + ' (' + m[6] + '), aircraft type ' + m[7] + ', registration ' + m[8] + '.');
    if ((m = /^(UAE\d+\w*)\s/.exec(t))) return Z('ATC 呼号 <b>' + m[1] + '</b>（可能和航班号不同）。SIGNATURE = 机长签名。', 'ATC call sign ' + m[1] + '.');
    if ((m = /^([A-Z]{6})([A-Z]*)(\d+):\s*(.*)$/.exec(t))) {
      const c = m[2], tr = { F: '最省油航迹', T: '最省时航迹', C: '最省成本航迹', D: '最短距离航迹' };
      const p = /^P([FTCD])(\w?)$/.exec(c);
      return Z('公司航路代码 <b>' + m[1] + m[2] + m[3] + '</b>：' + m[1].slice(0, 3) + '→' + m[1].slice(3) + '' + '。后面是航路：起飞机场 / 跑道、离场、航路、航路点、进场、落地跑道 / 目的地。', 'Company route ' + m[1] + m[2] + m[3] + ' then route summary (DEP/RWY, SID, airways, STAR, ARR/RWY).');
    }
    if ((m = /^PLND FL:\s*(.*)$/.exec(t))) return Z('计划巡航高度：' + m[1].split(' ').map(x => { const q = /^(?:(\w+)\/)?(\d{3})$/.exec(x); return q ? (q[1] ? '过 ' + q[1] + ' 后改 FL' + q[2] : '起始 FL' + q[2]) : x; }).join('，') + '。', 'Planned cruise levels: ' + m[1].split(' ').map(x => { const q = /^(?:(\w+)\/)?(\d{3})$/.exec(x); return q ? (q[1] ? 'FL' + q[2] + ' after ' + q[1] : 'start at FL' + q[2]) : x; }).join(', ') + '.');
    if ((m = /^OFP:\s*(\d+)\/(\d+)\/(\d+)/.exec(t))) { const w = /WX PROG:\s*(\d+)\s*-\s*(\d+)/.exec(t); return Z('OFP 编号 ' + m[1] + '/' + m[2] + '/' + m[3] + '。' + (w ? '高空风预报用 ' + w[1] + ':00–' + w[2] + ':00 UTC。' : '') + 'CTOT = 起飞时隙（有才填），PARKING BAY = 停机位。', 'OFP ' + m[1] + '/' + m[2] + '/' + m[3] + (w ? '; WX PROG ' + w[1] + '–' + w[2] + 'Z' : '')); }
    if (/^FUEL\s+TIME\s+CORR/.test(t)) return Z('燃油表的表头：左边是油量（kg）、时间、修正栏；右边 ARR/DEP 是计划时间，后面两格手写实际时间。', 'Fuel table header.');
    if ((m = /^TRIP\s+([A-Z]{4})\s+(\d+)\s+(\d{4})/.exec(t))) return join(Z('航程油：飞到 ' + m[1] + ' 要烧 <b>' + kg(m[2]) + ' kg</b>，空中 ' + tm(m[3]) + '。', 'Trip fuel: the flight to ' + m[1] + ' burns <b>' + kg(m[2]) + ' kg</b> and takes ' + tmE(m[3]) + ' in the air.'), R);
    if ((m = /^CONT\s+(.*?)\s+(\d+)\s+(\d{4})/.exec(t))) { const p = /([\d.]+)\s*P\/?C/.exec(m[1]); return join(Z('应急油 <b>' + kg(m[2]) + ' kg</b>，约 ' + tm(m[3]) + '。' + (p ? '按航程油的 ' + p[1] + '% 算' : /MIN/.test(m[1]) ? '最小应急油封顶' : /MAX/.test(m[1]) ? '最大应急油封顶' : /\d{2}$/.test(m[1]) ? '统计应急油（' + m[1] + '）' : m[1]) + '。', 'Contingency fuel: <b>' + kg(m[2]) + ' kg</b> (about ' + tmE(m[3]) + ' of flying), basis ' + m[1] + '.'), R); }
    if ((m = /^ALTN\s+([A-Z]{4})\s+(\d+)\s+(\d{4})/.exec(t))) return join(Z('备降油：去 <b>' + m[1] + '</b> 要 ' + kg(m[2]) + ' kg、' + tm(m[3]) + '。', 'Alternate fuel: going on to ' + m[1] + ' needs ' + kg(m[2]) + ' kg and ' + tmE(m[3]) + '.'), R);
    if ((m = /^FRSV\s+(\d+)\s+(\d{4})/.exec(t))) return join(Z('最后储备油 <b>' + kg(m[1]) + ' kg</b>（' + tm(m[2]) + '）。', 'Final reserve: <b>' + kg(m[1]) + ' kg</b> (' + tmE(m[2]) + ' of holding) — never planned to be used.'), R);
    if ((m = /^FMC-RSV\s+-?([\d.]+)-?/.exec(t))) return join(Z('FMC 里输入的储备油 <b>' + m[1] + ' 吨</b>。', 'Enter <b>' + m[1] + ' t</b> as the reserve in the FMC.'), R);
    if ((m = /^ADDNL\s*([A-Z]*)\s+(\d+)\s+(\d{4})/.exec(t))) return join(Z('附加油 ' + kg(m[2]) + ' kg（' + tm(m[3]) + '），类别 ' + m[1] + '：' + m[1] + '。', 'Additional fuel ' + (m[1] ? '(' + m[1] + ') ' : '') + kg(m[2]) + ' kg (' + tmE(m[3]) + ').'), R);
    if ((m = /^EXTRA\s*([A-Z]*)\s+(\d+)\s+(\d{4})/.exec(t))) return join(Z('额外油 <b>' + kg(m[2]) + ' kg</b>，可多飞 ' + tm(m[3]) + '，原因代码 ' + (m[1] || '—') + '。', 'Extra fuel: <b>' + kg(m[2]) + ' kg</b>, good for about ' + tmE(m[3]) + ' more' + (m[1] ? ' (reason code ' + m[1] + ')' : '') + '.'), R);
    if ((m = /^T\/O FUEL\s+(\d+)/.exec(t))) return join(Z('起飞油 <b>' + kg(m[1]) + ' kg</b> = 航程 + 应急 + 备降 + 最后储备 + 附加 + 额外。', 'Take-off fuel: <b>' + kg(m[1]) + ' kg</b> = trip + contingency + alternate + final reserve + additional + extra.'), R);
    if ((m = /^TAXI\s+(\d+)\s+(\d{4})/.exec(t))) return join(Z('滑行油 ' + kg(m[1]) + ' kg，滑行时间 ' + tm(m[2]) + '。', 'Taxi fuel ' + kg(m[1]) + ' kg for ' + tmE(m[2]) + ' of taxi.'), R);
    if ((m = /^RAMP FUEL\s+([\d.]+)\s+(\d{4})/.exec(t))) return join(Z('<b>总油 ' + m[1] + ' 吨</b>（= 起飞油 + 滑行油，加油加到这个数），总共能飞 ' + tm(m[2]) + '。', '<b>Ramp fuel ' + m[1] + ' t</b> (take-off fuel + taxi — the figure to load); total endurance ' + tmE(m[2]) + '.'), R);
    if (/^ADJUST\b/.test(t)) return join(Z('ADJUST：机长决定多加 / 少加的油（±），手写。', 'Captain adjustment.'), R);
    if (/^ADJ RAMP FUEL/.test(t)) return join(Z('调整后的总油 = 总油 + 机长额外油（手写）。', 'Adjusted ramp fuel.'), R);
    if (/^FUEL REMN/.test(t)) return join(Z('落地后实际剩油（手写）。', 'Fuel remaining after arrival.'), R);
    if (/^FUEL USED/.test(t)) return join(Z('实际用油 = 总油 − 剩油（手写）。', 'Fuel used.'), R);
    if (R.zh && /^(CRZ|AV|GND|AIR|CID|TOC)\b/.test(t)) return Z(R.zh + '。', R.en);
    if ((m = /TANKERING/.exec(t))) { const r = /\(([PHVB])\)/.exec(t), s = /TANKERING SECTOR.*?(\d+)\s*KG/.exec(t), d = /DISCR FUEL REASON/.test(t);
      return Z((/NO TANKERING/.test(t) ? '这次<b>不建议带油</b>' : '建议带油' + (s ? ' ' + s[1] + ' kg' : '')) + (r ? '，代码 (' + r[1] + ')' : '') + '。' + (d ? '机长额外加油时圈选原因：ATC 空管、WX 天气、MEL 保留故障、ALTN 备降、OTH 其他。' : ''), (/NO TANKERING/.test(t) ? '<b>No tankering</b> recommended this time' : 'Tankering recommended' + (s ? ': ' + s[1] + ' kg' : '')) + (r ? ' (code ' + r[1] + ')' : '') + '.' + (d ? ' If you add discretionary fuel, circle the reason: ATC, weather, MEL item, alternate or other.' : '')); }
    if ((m = /^DOW RANGE\s+([\d.]+)\D+([\d.]+).*DOI RANGE\s+([\d.]+)\D+([\d.]+)/.exec(t))) return Z('干操作重量范围 ' + m[1] + '–' + m[2] + ' 吨；干操作指数（重心）范围 ' + m[3] + '–' + m[4] + '。', 'DOW ' + m[1] + '–' + m[2] + ' t, DOI ' + m[3] + '–' + m[4] + '.');
    if ((m = /^EZFW\s+(\d+)\s+MZFW\s+(\d+)/.exec(t))) return Z('预计无油重量 ' + kg(m[1]) + ' kg，最大 ' + kg(m[2]) + '，余量 <b>' + kg(+m[2] - +m[1]) + ' kg</b>。AZFW 填实际。', 'Estimated zero-fuel weight ' + kg(m[1]) + ' kg; maximum ' + kg(m[2]) + ' kg, so <b>' + kg(+m[2] - +m[1]) + ' kg</b> to spare.');
    if ((m = /^ETOW\s+(\d+)\s+MTOW\s+(\d+)(?:.*?RTOW\s+(\d+))?/.exec(t))) return Z('预计起飞重量 ' + kg(m[1]) + ' kg，结构最大 ' + kg(m[2]) + (m[3] ? '，性能限制（RTOW）' + kg(m[3]) : '，没有性能限制') + '，余量 <b>' + kg(Math.min(+m[2], +(m[3] || 1e9)) - +m[1]) + ' kg</b>。ATOW 填实际。', 'Estimated take-off weight ' + kg(m[1]) + ' kg; structural maximum ' + kg(m[2]) + (m[3] ? ', performance limit ' + kg(m[3]) : '') + ' kg — <b>' + kg(Math.min(+m[2], +(m[3] || 1e9)) - +m[1]) + ' kg</b> to spare.');
    if ((m = /^ELWT\s+(\d+)\s+MLWT\s+(\d+)(?:.*?RLWT\s+(\d+))?/.exec(t))) { const mg = +m[2] - +m[1]; return Z('预计落地重量 ' + kg(m[1]) + ' kg，最大 ' + kg(m[2]) + '，余量 <b>' + kg(mg) + ' kg</b>' + (mg < 3000 ? '（<b>很接近最大落地重量</b>）' : '') + '。' + (m[3] ? '性能限制落地重量 ' + kg(m[3]) + '。' : ''), 'Estimated landing weight ' + kg(m[1]) + ' kg; maximum ' + kg(m[2]) + ' kg, so <b>' + kg(mg) + ' kg</b> to spare' + (mg < 3000 ? ' — <b>very close to the maximum</b>' : '') + '.'); }
    if (/^RWY\s+ASSMD/.test(t)) return Z('起飞性能表头：跑道、假设温度、最低收襟翼高度、襟翼、重心、V1、VR、V2、VREF、发动机失效程序。', 'Take-off performance header.');
    if (/^STATCONT/.test(t)) return Z('统计应急油数据：' + (/NO DATA/.test(t) ? '这个航段没有统计数据。' : t), 'Statistical contingency: ' + t);
    if (/OPERATIONAL IMPACTS/.test(t)) return Z('下面是「如果……会怎样」：无油重量、高度、速度改变时，油耗和时间的变化。', 'What-if table: ZFW / level / speed changes.');
    if ((m = /^(ZFW|FL|SPD) CHANGE\s+(.*)$/.exec(t)) || (sec === 'head' && /BURN/.test(t) && /^(UP|DN|CI\d+)\b/.test(t))) {
      const b = /BURN\s+([PM])\s*(\d+)/.exec(t), ti = /TIME\s+([PM])\s*(\d{4})/.exec(t), w = /(UP|DN)\s+([\d.]+)\s*(TONNE|FT)?|(\d+)FT|(CI\d+)/.exec(t);
      const what = /(UP|DN)\s+([\d.]+)\s*TONNE/.test(t) ? (/UP/.test(t) ? '无油重量多 ' : '无油重量少 ') + /([\d.]+)\s*TONNE/.exec(t)[1] + ' 吨' : /(UP|DN)\s+(\d+)\s*FT/.test(t) ? (/UP/.test(t) ? '飞高 ' : '飞低 ') + /(\d+)\s*FT/.exec(t)[1] + ' 英尺' : /CI(\d+)/.test(t) ? '成本指数改成 ' + /CI(\d+)/.exec(t)[1] : '';
      const whatE = /(UP|DN)\s+([\d.]+)\s*TONNE/.test(t) ? (/UP/.test(t) ? 'ZFW ' : 'ZFW ') + (/UP/.test(t) ? '+' : '−') + /([\d.]+)\s*TONNE/.exec(t)[1] + ' t' : /(UP|DN)\s+(\d+)\s*FT/.test(t) ? 'you fly ' + /(\d+)\s*FT/.exec(t)[1] + ' ft ' + (/UP/.test(t) ? 'higher' : 'lower') : /CI(\d+)/.test(t) ? 'cost index ' + /CI(\d+)/.exec(t)[1] : '';
      const mins = ti ? +ti[2].slice(2) + 60 * +ti[2].slice(0, 2) : 0;
      return Z(what + '：' + (b ? (b[1] === 'P' ? '多烧 ' : '少烧 ') + b[2] + ' kg' : '') + (ti ? '，时间' + (mins ? (ti[1] === 'P' ? '多 ' : '少 ') + mins + ' 分钟' : '不变') : '') + '。', 'If ' + whatE + ': ' + (b ? (b[1] === 'P' ? 'burn ' + b[2] + ' kg more' : 'burn ' + b[2] + ' kg less') : '') + (ti ? ', ' + (mins ? mins + ' min ' + (ti[1] === 'P' ? 'longer' : 'shorter') : 'same time') : '') + '.');
    }
    // ---------- 备降场表 ----------
    if (sec === 'altn' && (m = /^([A-Z]{4})\/(\w+)\s+(\d{4})\s+(\d{3})\s+(\d{3})\s+([PM])(\d{3})\s+(\d{4})\s+(\d+)\s*(.*)$/.exec(t)))
      return Z('备降场 <b>' + m[1] + '</b>，计划落地跑道 ' + m[2] + '：空中距离 ' + (+m[3]) + ' 海里，平均航迹 ' + m[4] + '°，高度 FL' + m[5] + '，' + (m[6] === 'P' ? '顺风 ' : '逆风 ') + (+m[7]) + ' 节，飞 ' + tm(m[8]) + '，用油 ' + kg(m[9]) + ' kg。航路：' + m[10], 'Alternate <b>' + m[1] + '</b>, planned runway ' + m[2] + ': ' + (+m[3]) + ' nm (air distance), track ' + m[4] + '°, FL' + m[5] + ', ' + (m[6] === 'P' ? 'tailwind ' : 'headwind ') + (+m[7]) + ' kt, ' + tmE(m[8]) + ' and ' + kg(m[9]) + ' kg of fuel. Route: ' + m[10]);
    if (/^DEST\s+ALTN\s+DIST/.test(t)) return Z('备降场表：计划跑道、距离、航迹、高度、风分量、时间、油量和航路。', 'Alternate summary header.');
    if ((m = /DISPATCH BRIEFING INFO\s+DISP:\s*(\S+)\s+TEL:\s*(.*)$/.exec(t))) return Z('签派提示开始。签派员 ' + m[1] + '，电话 ' + m[2] + '。', 'Dispatch remarks; dispatcher ' + m[1] + ', tel ' + m[2]);
    // ---------- 导航日志 ----------
    if ((m = /^-+\s*([A-Z ]+?)\s+(FIR|UIR)\/([A-Z]{4})\s*-+$/.exec(t))) return Z('📻 <b>进入 ' + m[1] + ' ' + m[2] + '（' + m[3] + '）</b>—— 要换频率。', 'Entering ' + m[1] + ' ' + m[2] + ' (' + m[3] + ') — establish contact.');
    if (/^\*+\s*DEPRESSURI[SZ]ATION/.test(t)) return Z('释压改航策略（下面几行）。', 'Depressurisation strategy follows.');
    if (/^DP\s+[NS]\d/.test(t)) return Z('<b>释压改航决断点</b> ' + t.replace(/^DP\s+/, '') + '：在这之前释压 → 沿原航路返回起飞机场；过了这个点 → 继续飞目的地。', 'Depressurisation decision point ' + t);
    if (/^(BEFORE|AFTER) DP/.test(t)) return Z(/^BEFORE/.test(t) ? '决断点之前释压：' + t.replace(/^BEFORE DP - /, '').replace('TURN BACK ALONG FLIGHT PLANNED ROUTE TO ORIGIN', '沿计划航路掉头返回起飞机场') : '决断点之后释压：' + t.replace(/^AFTER DP - /, '').replace('CONTINUE ALONG FLIGHT PLANNED ROUTE TO DESTINATION', '沿计划航路继续飞目的地'), t);
    if (/^AWY\s+TRM\s+DIST/.test(t)) return Z('导航日志第一行表头：航路、出航磁航迹、距离、风、高度、真空速、速度（IAS / 马赫）、段时间、预计过点、剩油（手写）。', 'Navlog header line 1.');
    if (/^WPT\s+ITT/.test(t)) return Z('导航日志第二行表头：航路点、出航真航迹、风切变率 / 温度偏差、MORA、风分量、对流层顶、累计时间、要求过点 / 实际过点时间、最少需要油量。', 'Navlog header line 2.');
    if (sec === 'nav' || sec === 'navalt') { const r = navSay(L, i, ctx); if (r) return r; }
    if (sec === 'winds') { const r = windsSay(L, i, ctx); if (r) return r; return Z('高空风温表：每个航路点在几个高度上的风（真风向 / 风速）和气温。点表里的数字看这个点的详细说明。', 'Winds and temperatures aloft: for each waypoint, wind (true direction / speed) and temperature at several levels. Tap a figure for that waypoint.'); }
    // ---------- ETOPS / 缩减应急油 ----------
    if ((m = /^(?:([A-Z]{4})\/)?(ENTRY|EXIT)(\d)/.exec(t))) return Z((m[2] === 'ENTRY' ? 'ETOPS 进入点' : 'ETOPS 退出点') + ' ' + m[3] + (m[1] ? '（' + (m[2] === 'ENTRY' ? '离开前最后一个充足机场 ' : '退出后第一个充足机场 ') + m[1] + '）' : '') + '。', 'ETOPS ' + m[2] + ' ' + m[3]);
    if (/^ETP\d/.test(t)) return Z('等时点（ETP）：去两个合适机场用时 / 用油相同的位置。', 'Equal time point (1D depressurisation case).');
    if ((m = /^ERA-(\w{4})/.exec(t))) return Z('航路备降场 ' + m[1] + '。', 'RCF en-route alternate ' + m[1]);
    if ((m = /^DP-(\w+)/.exec(t))) return Z('决断点 ' + m[1] + '。', 'RCF decision point ' + m[1]);
    if ((m = /^TRI-(\w{4})\s+(\d+)/.exec(t))) return Z('从起飞机场到航路备降场 ' + m[1] + ' 的航程油 ' + kg(m[2]) + ' kg。', 'Trip DEP→ERA ' + m[2] + ' kg');
    if ((m = /^MIN DP FUEL-?\s*([\d.]+)/.exec(t))) return Z('到决断点时最少要有 ' + m[1] + ' 吨油。', 'Min fuel at DP ' + m[1] + ' t');
    if (/^(EK COMP FREQ|SPEC RQMNTS|DEST ATIS|PARKING BAY)/.test(t)) return Z('到达手写栏：' + t.replace('EK COMP FREQ:', '公司频率').replace('PARKING BAY:', '停机位').replace('SPEC RQMNTS', '特殊要求').replace('DEST ATIS', '目的地 ATIS'), t);
    // ---------- 天气 ----------
    if (sec === 'wx' && ctx && ctx.WX) {
      const r = /^(SA|SP|FT|FC)\s+(.*)$/.exec(t);
      let s = i; if (!r) { while (s > 0 && i - s < 8 && !/^\s*(SA|SP|FT|FC)\s/.test(L[s])) s--; }
      const r2 = /^\s*(SA|SP|FT|FC)\s+(.*)$/.exec(L[s] || '');
      if (r2 && (r || /^\s{8,}\S/.test(l))) {
        let txt = r2[2]; for (let q = s + 1; L[q] && /^\s{8,}\S/.test(L[q]) && !/=\s*$/.test(txt); q++) txt += ' ' + L[q].trim();
        txt = txt.replace(/=\s*$/, '');
        const ref = ctx.ref || Date.now();
        try {
          if (/^S/.test(r2[1])) { const M = ctx.WX.metar(txt, ref); return Z('<b>实况' + (M.time ? '（' + ctx.hmZ(M.time) + '）' : '') + '</b>：' + ctx.WX.sayOne(M, 'zh'), 'Observed: ' + ctx.WX.sayOne(M, 'en')); }
          const T = ctx.WX.taf(txt, ref);
          const parts = T.groups.map(g => ({ zh: (g.type === 'BASE' ? '主要：' : g.type === 'FM' ? '从 ' + ctx.hmZ(g.from) + ' 起：' : (g.type === 'BECMG' ? '逐渐变成' : g.type === 'TEMPO' ? '短时' : '可能') + (g.prob ? '（' + g.prob + '% 可能）' : '') + (g.from ? ' ' + ctx.hmZ(g.from) + '–' + ctx.hmZ(g.to) : '') + '：') + ctx.WX.sayOne(g.c, 'zh'), en: g.type + (g.prob ? ' ' + g.prob + '%' : '') + (g.from ? ' ' + ctx.hmZ(g.from) + '–' + ctx.hmZ(g.to) : '') + ': ' + ctx.WX.sayOne(g.c, 'en') }));
          return Z('<b>预报 ' + ctx.hmZ(T.from) + '–' + ctx.hmZ(T.to) + '</b><br>' + parts.map(p => p.zh).join('<br>'), 'Forecast ' + ctx.hmZ(T.from) + '–' + ctx.hmZ(T.to) + ':<br>' + parts.map(p => p.en).join('<br>'));
        } catch (e) {}
      }
      if ((m = /^([A-Z]{4})\s*\/([A-Z0-9]{3})\s+(.*)$/.exec(t))) return Z('机场 <b>' + m[1] + '</b>（' + m[2] + '）' + m[3], 'Airport ' + m[1] + ' (' + m[2] + ') ' + m[3]);
      const H = { 'DEPARTURE AIRPORT:': '起飞机场的天气', 'DESTINATION AIRPORT:': '目的地机场的天气', 'DESTINATION ALTERNATE:': '目的地备降场的天气', 'FUEL ENROUTE AIRPORT:': '航路加油机场的天气', 'ENROUTE AIRPORT(S):': '航路备降场的天气', 'SIGMETs:': '重要天气警告（SIGMET）', 'AIRMETs:': '低空重要天气（AIRMET）' };
      if (H[t]) return Z(H[t], t);
      if (/No Wx data available/i.test(t)) return Z('没有这类天气资料（这次没有发布）。', 'None issued.');
    }
    // ---------- NOTAM ----------
    if (sec === 'notam' && ctx && ctx.notam) { const n = ctx.notam(i); if (n) return n; }
    if (sec === 'notam') {
      if ((m = /^([A-Z]{4})\s*\/([A-Z0-9]{3})\s+(.*)$/.exec(t))) return Z('下面是 <b>' + m[1] + '</b>（' + m[3] + '）的航行通告。', 'NOTAMs for ' + m[1]);
      if ((m = /^\+{3,}\s*(.+?)\s*\+{3,}$/.exec(t))) return Z('通告类别：' + ({ AIRPORT: '机场', 'SID/STAR': '离场 / 进场程序', 'COMPANY NOTAM': '公司通告', 'CHART NOTAM': '航图通告', APPROACH: '进近', 'RUNWAY': '跑道' }[m[1]] || m[1]), 'Category: ' + m[1]);
      if ((m = /^=+$/.test(t))) return null;
      if (/^(DEPARTURE AIRPORT|DESTINATION AIRPORT|DESTINATION ALTERNATE|ENROUTE|FIR|FUEL ENROUTE)/.test(t)) return Z({ 'DEPARTURE AIRPORT': '起飞机场的通告', 'DESTINATION AIRPORT': '目的地机场的通告', 'DESTINATION ALTERNATE': '目的地备降场的通告' }[t] || t, t);
      if ((m = /^ROUTE:\s*(\w{4})\s*-\s*(\w{4})\s+ALTN:\s*(.*)$/.exec(t))) return Z('通告包的范围：' + m[1] + ' → ' + m[2] + '，备降场 ' + m[3] + '。', t);
      if ((m = /^VALID:\s*(\d{10})\s*-\s*(\d{10})\s*(.*)$/.exec(t))) return Z('通告包有效期 ' + m[1].slice(4, 6) + ' 日 ' + m[1].slice(6, 8) + ':' + m[1].slice(8) + 'Z 到 ' + m[2].slice(4, 6) + ' 日 ' + m[2].slice(6, 8) + ':' + m[2].slice(8) + 'Z（' + m[3].replace('ETD+TRIP+ALTN+3HRS', '= 预计离港 + 航程 + 备降 + 3 小时') + '）。', t);
    }
    // ---------- 整段文字（签派提示、公司通告、机组信息）：整段翻译 ----------
    if (ctx && ctx.para && /[A-Z]{3,}\s+[A-Z]{2,}/.test(t)) { const p = ctx.para(i); if (p) return p; }
    return null;
  }

  function wordSay(L, i, w, sec, ctx) {
    const t = L[i].replace(/\s+/g, ' ');
    for (const k of MULTI) if (t.indexOf(k) >= 0 && k.split(' ').indexOf(w) >= 0) return Z('<b>' + k + '</b>：' + G[k][0], '<b>' + k + '</b>: ' + G[k][1]);
    if (w === '+' || w === '=') return Z(G[w][0], G[w][1]);
    if (G[w]) return Z('<b>' + w + '</b>：' + G[w][0], '<b>' + w + '</b>: ' + G[w][1]);
    let m;
    if ((m = /^(ENTRY|EXIT|ETP)\d/.exec(w))) return Z('<b>' + w + '</b>：' + G[m[1]][0], '<b>' + w + '</b>: ' + G[m[1]][1]);
    if (ctx && ctx.AP && ctx.AP[w]) { const a = ctx.AP[w]; return Z('<b>' + w + '</b>：机场 ' + a[1] + '（' + a[2] + '），标高 ' + a[5] + ' 英尺', '<b>' + w + '</b>: ' + a[1] + ', ' + a[2] + ', elev ' + a[5] + ' ft'); }
    if ((m = /^([A-Z]{4})\/(\w+)$/.exec(w)) && ctx && ctx.AP && ctx.AP[m[1]]) return Z('<b>' + w + '</b>：' + ctx.AP[m[1]][1] + '，跑道 ' + m[2], w);
    if (ctx && ctx.firNames && ctx.firNames[w]) return Z('<b>' + w + '</b>：' + ctx.firNames[w] + '（管制区代码）', '<b>' + w + '</b>: ' + ctx.firNames[w]);
    if (ctx && ctx.nav) { const p = ctx.nav.find(x => x.id === w); if (p) return Z('<b>' + w + '</b>：航路点，起飞后 ' + Math.floor(p.t / 60) + ' 小时 ' + p.t % 60 + ' 分到' + (ctx.atP ? '（约 ' + ctx.atP(p.t) + '）' : '') + (p.mora != null ? '，MORA ' + kg(p.mora * 100) + ' 英尺' : '') + (p.eq ? '，管制区边界点' : ''), '<b>' + w + '</b>: waypoint, T/O+' + Math.floor(p.t / 60) + 'h' + String(p.t % 60).padStart(2, '0') + (p.mora != null ? ', MORA ' + p.mora * 100 + ' ft' : '')); }
    if (/^[PM]\d{3}$/.test(w) && (sec === 'nav' || sec === 'navalt')) { const v = +w.slice(1); return Z('<b>' + w + '</b>：风分量 ' + (w[0] === 'P' ? '顺风 ' : '逆风 ') + v + ' 节', '<b>' + w + '</b>: wind component, ' + (w[0] === 'P' ? 'tailwind ' : 'headwind ') + v + ' kt'); }
    if (/^(?:U|)[A-Z]{1,2}\d{1,4}[A-Z]?$/.test(w) && sec !== 'notam') return Z('<b>' + w + '</b>：航路（airway）名称', '<b>' + w + '</b>: airway');
    if (/^[A-Z]{3,5}\d[A-Z]{0,2}$/.test(w)) return Z('<b>' + w + '</b>：离场（SID）或进场（STAR）程序名', '<b>' + w + '</b>: SID / STAR');
    if ((m = /^(\d{2})\/(\d{3})$/.exec(w))) return Z('<b>' + w + '</b>：风向 ' + m[1] + '0°（真）、风速 ' + (+m[2]) + ' 节', '<b>' + w + '</b>: wind ' + m[1] + '0°T / ' + (+m[2]) + ' kt');
    if ((m = /^(\d{2})?\/([PM])(\d{2})$/.exec(w))) return Z('<b>' + w + '</b>：' + (m[1] ? '风切变率 ' + (+m[1]) + '（每千英尺风速变化），' : '') + '温度比标准' + (m[2] === 'P' ? '高 ' : '低 ') + (+m[3]) + '°C', '<b>' + w + '</b>: ' + (m[1] ? 'shear ' + (+m[1]) + ', ' : '') + 'ISA ' + (m[2] === 'P' ? '+' : '−') + (+m[3]));
    if ((m = /^([PM])(\d{3})$/.exec(w))) return Z('<b>' + w + '</b>：' + (m[1] === 'M' ? '逆风（减）' : '顺风（加）') + ' ' + (+m[2]) + (/BURN|TIME/.test(t) ? '' : ' 节'), '<b>' + w + '</b>: ' + (m[1] === 'M' ? 'minus / headwind ' : 'plus / tailwind ') + (+m[2]));
    if ((m = /^([PM])(\d{1,2}(?:\.\d)?)$/.exec(w))) return Z('<b>' + w + '</b>：' + (m[1] === 'P' ? '+' : '−') + m[2], '<b>' + w + '</b>: ' + (m[1] === 'P' ? '+' : '−') + m[2]);
    if ((m = /^([NS])(\d{2})(\d{2}\.\d)$/.exec(w))) return Z('<b>' + w + '</b>：' + (m[1] === 'N' ? '北纬 ' : '南纬 ') + (+m[2]) + '°' + m[3] + '′', '<b>' + w + '</b>: latitude');
    if ((m = /^([EW])(\d{3})(\d{2}\.\d)$/.exec(w))) return Z('<b>' + w + '</b>：' + (m[1] === 'E' ? '东经 ' : '西经 ') + (+m[2]) + '°' + m[3] + '′', '<b>' + w + '</b>: longitude');
    if (/^\d{10}$/.test(w)) return Z('<b>' + w + '</b>：20' + w.slice(0, 2) + ' 年 ' + (+w.slice(2, 4)) + ' 月 ' + (+w.slice(4, 6)) + ' 日 ' + w.slice(6, 8) + ':' + w.slice(8) + ' UTC', '<b>' + w + '</b>: 20' + w.slice(0, 2) + '-' + w.slice(2, 4) + '-' + w.slice(4, 6) + ' ' + w.slice(6, 8) + ':' + w.slice(8) + 'Z');
    if (/^\.+$/.test(w)) return Z('空格：要你手写', 'Blank — fill in');
    if (ctx && ctx.NX && ctx.NX.A[w.replace('U/S', 'U_S')]) { const a = ctx.NX.A[w.replace('U/S', 'U_S')]; return Z('<b>' + w + '</b>：' + a[1], '<b>' + w + '</b>: ' + a[0]); }
    return null;
  }

  root.DEC = { G, sections, lineSay, wordSay, cellsOf, navHdr };
  if (typeof module !== 'undefined') module.exports = root.DEC;
})(typeof window !== 'undefined' ? window : globalThis);
