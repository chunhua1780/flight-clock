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
    if (sec === 'head' && i < 20 && /^([A-Z0-9]{2,7}(?:\/\w+)?\s+)*[A-Z0-9]{2,7}(?:\/\w+)?$/.test(t) && L.slice(Math.max(0, i - 3), i).some(x => /^\s*[A-Z]{6}[A-Z]*\d+:|^\s*(?:[A-Z0-9]{2,7}\s+){3,}/.test(x)))
      return Z('航路（接上一行）：' + t.split(' ').map(x => /^[A-Z]{4}\/\w+$/.test(x) ? x.replace('/', ' 跑道 ') + '（落地）' : x).join(' → '), 'Route (continued): ' + t);
    if (sec === 'altn' && /^([A-Z0-9]{2,7}\s*)+$/.test(t)) return Z('去备降场的航路（接上一行）：' + t, 'Alternate routing (continued): ' + t);
    if ((m = /^-\s+FUEL\s+ENROUTE\s+AIRPORT\s+(\w{4})/.exec(t))) return Z('签派指定航路加油 / 备降机场：<b>' + m[1] + '</b>（需要时可以去这里加油）。', 'Fuel en-route airport ' + m[1] + '.');
    // ---------- 首页 ----------
    if ((m = /^(?:EK)?(\d+)\s+(\d{2}[A-Z]{3})\s+(\w{4})\/(\w{3})\s*-\s*(\w{4})\/(\w{3})\s+(\S+)\s+(\S+)/.exec(t))) return Z('航班 <b>EK' + m[1] + '</b>，' + m[2] + '。' + m[3] + '/' + m[4] + ' → ' + m[5] + '/' + m[6] + '，机型 ' + m[7] + '，注册号 ' + m[8] + '。', 'Flight EK' + m[1] + ' ' + m[2] + ', ' + m[3] + '→' + m[5] + ', ' + m[7] + ' ' + m[8] + '.');
    if ((m = /^(UAE\d+\w*)\s/.exec(t))) return Z('ATC 呼号 <b>' + m[1] + '</b>（可能和航班号不同）。SIGNATURE = 机长签名。', 'ATC call sign ' + m[1] + '.');
    if ((m = /^([A-Z]{6})([A-Z]*)(\d+):\s*(.*)$/.exec(t))) {
      const c = m[2], tr = { F: '最省油航迹', T: '最省时航迹', C: '最省成本航迹', D: '最短距离航迹' };
      const p = /^P([FTCD])(\w?)$/.exec(c);
      return Z('公司航路代码 <b>' + m[1] + m[2] + m[3] + '</b>：' + m[1].slice(0, 3) + '→' + m[1].slice(3) + '' + '。后面是航路：起飞机场 / 跑道、离场、航路、航路点、进场、落地跑道 / 目的地。', 'Company route ' + m[1] + m[2] + m[3] + ' then route summary (DEP/RWY, SID, airways, STAR, ARR/RWY).');
    }
    if ((m = /^PLND FL:\s*(.*)$/.exec(t))) return Z('计划巡航高度：' + m[1].split(' ').map(x => { const q = /^(?:(\w+)\/)?(\d{3})$/.exec(x); return q ? (q[1] ? '过 ' + q[1] + ' 后改 FL' + q[2] : '起始 FL' + q[2]) : x; }).join('，') + '。', 'Planned levels: ' + m[1]);
    if ((m = /^OFP:\s*(\d+)\/(\d+)\/(\d+)/.exec(t))) { const w = /WX PROG:\s*(\d+)\s*-\s*(\d+)/.exec(t); return Z('OFP 编号 ' + m[1] + '/' + m[2] + '/' + m[3] + '。' + (w ? '高空风预报用 ' + w[1] + ':00–' + w[2] + ':00 UTC。' : '') + 'CTOT = 起飞时隙（有才填），PARKING BAY = 停机位。', 'OFP ' + m[1] + '/' + m[2] + '/' + m[3] + (w ? '; WX PROG ' + w[1] + '–' + w[2] + 'Z' : '')); }
    if (/^FUEL\s+TIME\s+CORR/.test(t)) return Z('燃油表的表头：左边是油量（kg）、时间、修正栏；右边 ARR/DEP 是计划时间，后面两格手写实际时间。', 'Fuel table header.');
    if ((m = /^TRIP\s+([A-Z]{4})\s+(\d+)\s+(\d{4})/.exec(t))) return join(Z('航程油：飞到 ' + m[1] + ' 要烧 <b>' + kg(m[2]) + ' kg</b>，空中 ' + tm(m[3]) + '。', 'Trip to ' + m[1] + ': ' + kg(m[2]) + ' kg, ' + tmE(m[3]) + '.'), R);
    if ((m = /^CONT\s+(.*?)\s+(\d+)\s+(\d{4})/.exec(t))) { const p = /([\d.]+)\s*P\/?C/.exec(m[1]); return join(Z('应急油 <b>' + kg(m[2]) + ' kg</b>，约 ' + tm(m[3]) + '。' + (p ? '按航程油的 ' + p[1] + '% 算' : /MIN/.test(m[1]) ? '最小应急油封顶' : /MAX/.test(m[1]) ? '最大应急油封顶' : /\d{2}$/.test(m[1]) ? '统计应急油（' + m[1] + '）' : m[1]) + '。', 'Contingency ' + kg(m[2]) + ' kg (' + m[1] + ').'), R); }
    if ((m = /^ALTN\s+([A-Z]{4})\s+(\d+)\s+(\d{4})/.exec(t))) return join(Z('备降油：去 <b>' + m[1] + '</b> 要 ' + kg(m[2]) + ' kg、' + tm(m[3]) + '。', 'Alternate ' + m[1] + ': ' + kg(m[2]) + ' kg, ' + tmE(m[3]) + '.'), R);
    if ((m = /^FRSV\s+(\d+)\s+(\d{4})/.exec(t))) return join(Z('最后储备油 <b>' + kg(m[1]) + ' kg</b>（' + tm(m[2]) + '）。', 'Final reserve ' + kg(m[1]) + ' kg.'), R);
    if ((m = /^FMC-RSV\s+-?([\d.]+)-?/.exec(t))) return join(Z('FMC 里输入的储备油 <b>' + m[1] + ' 吨</b>。', 'Reserve for FMC ' + m[1] + ' t.'), R);
    if ((m = /^ADDNL\s*([A-Z]*)\s+(\d+)\s+(\d{4})/.exec(t))) return join(Z('附加油 ' + kg(m[2]) + ' kg（' + tm(m[3]) + '），类别 ' + m[1] + '：' + m[1] + '。', 'Additional ' + m[1] + ' ' + kg(m[2]) + ' kg.'), R);
    if ((m = /^EXTRA\s*([A-Z]*)\s+(\d+)\s+(\d{4})/.exec(t))) return join(Z('额外油 <b>' + kg(m[2]) + ' kg</b>，可多飞 ' + tm(m[3]) + '，原因代码 ' + (m[1] || '—') + '。', 'Extra ' + m[1] + ' ' + kg(m[2]) + ' kg (' + tmE(m[3]) + ').'), R);
    if ((m = /^T\/O FUEL\s+(\d+)/.exec(t))) return join(Z('起飞油 <b>' + kg(m[1]) + ' kg</b> = 航程 + 应急 + 备降 + 最后储备 + 附加 + 额外。', 'Take-off fuel ' + kg(m[1]) + ' kg.'), R);
    if ((m = /^TAXI\s+(\d+)\s+(\d{4})/.exec(t))) return join(Z('滑行油 ' + kg(m[1]) + ' kg，滑行时间 ' + tm(m[2]) + '。', 'Taxi ' + m[1] + ' kg (' + tmE(m[2]) + ').'), R);
    if ((m = /^RAMP FUEL\s+([\d.]+)\s+(\d{4})/.exec(t))) return join(Z('<b>总油 ' + m[1] + ' 吨</b>（= 起飞油 + 滑行油，加油加到这个数），总共能飞 ' + tm(m[2]) + '。', 'Ramp fuel ' + m[1] + ' t, endurance ' + tmE(m[2]) + '.'), R);
    if (/^ADJUST\b/.test(t)) return join(Z('ADJUST：机长决定多加 / 少加的油（±），手写。', 'Captain adjustment.'), R);
    if (/^ADJ RAMP FUEL/.test(t)) return join(Z('调整后的总油 = 总油 + 机长额外油（手写）。', 'Adjusted ramp fuel.'), R);
    if (/^FUEL REMN/.test(t)) return join(Z('落地后实际剩油（手写）。', 'Fuel remaining after arrival.'), R);
    if (/^FUEL USED/.test(t)) return join(Z('实际用油 = 总油 − 剩油（手写）。', 'Fuel used.'), R);
    if (R.zh && /^(CRZ|AV|GND|AIR|CID|TOC)\b/.test(t)) return Z(R.zh + '。', R.en);
    if ((m = /TANKERING/.exec(t))) { const r = /\(([PHVB])\)/.exec(t), s = /TANKERING SECTOR.*?(\d+)\s*KG/.exec(t), d = /DISCR FUEL REASON/.test(t);
      return Z((/NO TANKERING/.test(t) ? '这次<b>不建议带油</b>' : '建议带油' + (s ? ' ' + s[1] + ' kg' : '')) + (r ? '，代码 (' + r[1] + ')' : '') + '。' + (d ? '机长额外加油时圈选原因：ATC 空管、WX 天气、MEL 保留故障、ALTN 备降、OTH 其他。' : ''), t); }
    if ((m = /^DOW RANGE\s+([\d.]+)\D+([\d.]+).*DOI RANGE\s+([\d.]+)\D+([\d.]+)/.exec(t))) return Z('干操作重量范围 ' + m[1] + '–' + m[2] + ' 吨；干操作指数（重心）范围 ' + m[3] + '–' + m[4] + '。', 'DOW ' + m[1] + '–' + m[2] + ' t, DOI ' + m[3] + '–' + m[4] + '.');
    if ((m = /^EZFW\s+(\d+)\s+MZFW\s+(\d+)/.exec(t))) return Z('预计无油重量 ' + kg(m[1]) + ' kg，最大 ' + kg(m[2]) + '，余量 <b>' + kg(+m[2] - +m[1]) + ' kg</b>。AZFW 填实际。', 'EZFW ' + m[1] + ' / MZFW ' + m[2] + ' (margin ' + (+m[2] - +m[1]) + ').');
    if ((m = /^ETOW\s+(\d+)\s+MTOW\s+(\d+)(?:.*?RTOW\s+(\d+))?/.exec(t))) return Z('预计起飞重量 ' + kg(m[1]) + ' kg，结构最大 ' + kg(m[2]) + (m[3] ? '，性能限制（RTOW）' + kg(m[3]) : '，没有性能限制') + '，余量 <b>' + kg(Math.min(+m[2], +(m[3] || 1e9)) - +m[1]) + ' kg</b>。ATOW 填实际。', 'ETOW ' + m[1] + ', MTOW ' + m[2] + (m[3] ? ', RTOW ' + m[3] : '') + '.');
    if ((m = /^ELWT\s+(\d+)\s+MLWT\s+(\d+)(?:.*?RLWT\s+(\d+))?/.exec(t))) { const mg = +m[2] - +m[1]; return Z('预计落地重量 ' + kg(m[1]) + ' kg，最大 ' + kg(m[2]) + '，余量 <b>' + kg(mg) + ' kg</b>' + (mg < 3000 ? '（<b>很接近最大落地重量</b>）' : '') + '。' + (m[3] ? '性能限制落地重量 ' + kg(m[3]) + '。' : ''), 'ELWT ' + m[1] + ', MLWT ' + m[2] + ' (margin ' + mg + ').'); }
    if (/^RWY\s+ASSMD/.test(t)) return Z('起飞性能表头：跑道、假设温度、最低收襟翼高度、襟翼、重心、V1、VR、V2、VREF、发动机失效程序。', 'Take-off performance header.');
    if (/^STATCONT/.test(t)) return Z('统计应急油数据：' + (/NO DATA/.test(t) ? '这个航段没有统计数据。' : t), 'Statistical contingency: ' + t);
    if (/OPERATIONAL IMPACTS/.test(t)) return Z('下面是「如果……会怎样」：无油重量、高度、速度改变时，油耗和时间的变化。', 'What-if table: ZFW / level / speed changes.');
    if ((m = /^(ZFW|FL|SPD) CHANGE\s+(.*)$/.exec(t)) || (sec === 'head' && /BURN/.test(t) && /^(UP|DN|CI\d+)\b/.test(t))) {
      const b = /BURN\s+([PM])\s*(\d+)/.exec(t), ti = /TIME\s+([PM])\s*(\d{4})/.exec(t), w = /(UP|DN)\s+([\d.]+)\s*(TONNE|FT)?|(\d+)FT|(CI\d+)/.exec(t);
      const what = /(UP|DN)\s+([\d.]+)\s*TONNE/.test(t) ? (/UP/.test(t) ? '无油重量多 ' : '无油重量少 ') + /([\d.]+)\s*TONNE/.exec(t)[1] + ' 吨' : /(UP|DN)\s+(\d+)\s*FT/.test(t) ? (/UP/.test(t) ? '飞高 ' : '飞低 ') + /(\d+)\s*FT/.exec(t)[1] + ' 英尺' : /CI(\d+)/.test(t) ? '成本指数改成 ' + /CI(\d+)/.exec(t)[1] : '';
      return Z(what + '：' + (b ? (b[1] === 'P' ? '多烧 ' : '少烧 ') + b[2] + ' kg' : '') + (ti ? '，时间' + (ti[1] === 'P' ? '多 ' : '少 ') + (+ti[2].slice(2) + 60 * +ti[2].slice(0, 2)) + ' 分钟' : '') + '。', t);
    }
    // ---------- 备降场表 ----------
    if (sec === 'altn' && (m = /^([A-Z]{4})\/(\w+)\s+(\d{4})\s+(\d{3})\s+(\d{3})\s+([PM])(\d{3})\s+(\d{4})\s+(\d+)\s*(.*)$/.exec(t)))
      return Z('备降场 <b>' + m[1] + '</b>，计划落地跑道 ' + m[2] + '：空中距离 ' + (+m[3]) + ' 海里，平均航迹 ' + m[4] + '°，高度 FL' + m[5] + '，' + (m[6] === 'P' ? '顺风 ' : '逆风 ') + (+m[7]) + ' 节，飞 ' + tm(m[8]) + '，用油 ' + kg(m[9]) + ' kg。航路：' + m[10], 'Alternate ' + m[1] + '/' + m[2] + ': ' + (+m[3]) + ' nm, FL' + m[5] + ', ' + tmE(m[8]) + ', ' + m[9] + ' kg. ' + m[10]);
    if (/^DEST\s+ALTN\s+DIST/.test(t)) return Z('备降场表：计划跑道、距离、航迹、高度、风分量、时间、油量和航路。', 'Alternate summary header.');
    if ((m = /DISPATCH BRIEFING INFO\s+DISP:\s*(\S+)\s+TEL:\s*(.*)$/.exec(t))) return Z('签派提示开始。签派员 ' + m[1] + '，电话 ' + m[2] + '。', 'Dispatch remarks; dispatcher ' + m[1] + ', tel ' + m[2]);
    // ---------- 导航日志 ----------
    if ((m = /^-+\s*([A-Z ]+?)\s+(FIR|UIR)\/([A-Z]{4})\s*-+$/.exec(t))) return Z('📻 <b>进入 ' + m[1] + ' ' + m[2] + '（' + m[3] + '）</b>—— 要换频率。', 'Entering ' + m[1] + ' ' + m[2] + ' (' + m[3] + ') — establish contact.');
    if (/^\*+\s*DEPRESSURI[SZ]ATION/.test(t)) return Z('释压改航策略（下面几行）。', 'Depressurisation strategy follows.');
    if (/^DP\s+[NS]\d/.test(t)) return Z('<b>释压改航决断点</b> ' + t.replace(/^DP\s+/, '') + '：在这之前释压 → 沿原航路返回起飞机场；过了这个点 → 继续飞目的地。', 'Depressurisation decision point ' + t);
    if (/^(BEFORE|AFTER) DP/.test(t)) return Z(/^BEFORE/.test(t) ? '决断点之前释压：' + t.replace(/^BEFORE DP - /, '').replace('TURN BACK ALONG FLIGHT PLANNED ROUTE TO ORIGIN', '沿计划航路掉头返回起飞机场') : '决断点之后释压：' + t.replace(/^AFTER DP - /, '').replace('CONTINUE ALONG FLIGHT PLANNED ROUTE TO DESTINATION', '沿计划航路继续飞目的地'), t);
    if (/^AWY\s+TRM\s+DIST/.test(t)) return Z('导航日志第一行表头：航路、出航磁航迹、距离、风、高度、真空速、速度（IAS / 马赫）、段时间、预计过点、剩油（手写）。', 'Navlog header line 1.');
    if (/^WPT\s+ITT/.test(t)) return Z('导航日志第二行表头：航路点、出航真航迹、风切变率 / 温度偏差、MORA、风分量、对流层顶、累计时间、要求过点 / 实际过点时间、最少需要油量。', 'Navlog header line 2.');
    if (sec === 'nav' || sec === 'navalt') {
      if ((m = /^(\S+)\s+(=\s*)?(?:(\d{3})\s+)?(\d{3})\s+(\d{2})\/(\d{3})\s+((?:(?:CLB|DES|\d{3})\s+)*?)(\d{3})\s+\.\./.exec(t))) {
        const nx = L[i + 1] ? L[i + 1].trim().split(/\s+/)[0] : '';
        const v = m[7].trim() ? m[7].trim().split(/\s+/) : [];
        let FLv = null, TAS = null, SP = null;
        if (v.length >= 3) { FLv = v[0]; TAS = v[1]; SP = v[2]; }
        else if (v.length === 2) { if (/CLB|DES/.test(v[0])) { FLv = v[0]; SP = v[1]; } else if (+v[1] >= 600) { TAS = v[0]; SP = v[1]; } else { FLv = v[0]; TAS = v[1]; } }
        else if (v.length === 1) { if (/CLB|DES/.test(v[0])) FLv = v[0]; else if (+v[0] >= 600) SP = v[0]; else TAS = v[0]; }
        return Z('沿 ' + (m[1] === 'DCT' ? '<b>直飞</b>' : '<b>' + m[1] + '</b>') + ' 飞到 <b>' + nx + '</b>：' + (m[3] ? '出航磁航迹 ' + m[3] + '°，' : '') + '距离 ' + (+m[4]) + ' 海里，风 ' + m[5] + '0°（真）' + (+m[6]) + ' 节' + (FLv ? '，' + (FLv === 'CLB' ? '爬升中' : FLv === 'DES' ? '下降中' : '高度 ' + flv(FLv)) : '') + (TAS ? '，真空速 ' + TAS + ' 节' : '') + (SP ? '，' + spd(SP) : '') + '，这段飞 ' + (+m[8]) + ' 分钟。后面的 「.. ..」 写预计过点时间，「.....」 写实际剩油。',
          'Via ' + m[1] + ' to ' + nx + ': ' + (m[3] ? 'MT ' + m[3] + '°, ' : '') + (+m[4]) + ' nm, wind ' + m[5] + '0°T/' + (+m[6]) + ' kt' + (FLv ? ', ' + (/\d/.test(FLv) ? 'FL ' + FLv : FLv) : '') + (TAS ? ', TAS ' + TAS : '') + (SP ? ', ' + spdE(SP) : '') + ', ' + (+m[8]) + ' min.');
      }
      if ((m = /^([A-Z0-9_]{2,8})(?:\/\w+)?\s+(\+\s+)?(\d{3})?\s*(\d{2})?\/([PM])(\d{2})\s+(\d{2,3})\s+([PM])(\d{3})\s+(?:(\d{2})\s+)?(\d{4})\s+\.{4}\s+\.{4}\s+([\d.]+)/.exec(t))) {
        const w = ctx && ctx.nav && ctx.nav.find(x => x.id === m[1]);
        const mora = +m[7] * 100;
        if (/^[A-Z]{4}\/\w+/.test(t)) return Z('到达目的地 <b>' + m[1] + '</b>，跑道 ' + (/^\w{4}\/(\w+)/.exec(t) || [])[1] + '：起飞后 <b>' + tm(m[11]) + '</b> 落地' + (ctx && ctx.atP && w ? '（约 ' + ctx.atP(w.t) + '）' : '') + '，MORA ' + kg(mora) + ' 英尺。落地时最少要剩 <b>' + m[12] + ' 吨</b>。', 'Arrive ' + m[1] + ' at T/O+' + tmE(m[11]) + '; min fuel ' + m[12] + ' t.');
        return Z('航路点 <b>' + m[1] + '</b>' + (m[2] ? '（标「+」）' : '') + '：' + (m[3] ? '出航真航迹 ' + m[3] + '°，' : '') + (m[4] ? '风切变率 ' + (+m[4]) + (+m[4] >= 4 ? '（较大，可能颠簸）' : '') + '，' : '') + '温度比标准' + (m[5] === 'P' ? '高 ' : '低 ') + (+m[6]) + '°C，MORA <b>' + kg(mora) + ' 英尺</b>' + (mora >= 15000 ? '（很高的地形）' : mora >= 10000 ? '（高地形）' : '') + '，' + (m[8] === 'M' ? '逆风 ' : '顺风 ') + (+m[9]) + ' 节' + (m[10] ? '，对流层顶约 ' + (+m[10]) + ',000 英尺' : '') + '。起飞后 <b>' + tm(m[11]) + '</b> 到这里' + (ctx && ctx.atP && w ? '（约 ' + ctx.atP(w.t) + '）' : '') + '；到这里最少要剩 <b>' + m[12] + ' 吨</b>。',
          'Waypoint ' + m[1] + (m[2] ? ' (+)' : '') + ': ISA ' + (m[5] === 'P' ? '+' : '−') + (+m[6]) + ', MORA ' + mora + ' ft, ' + (m[8] === 'M' ? 'HW ' : 'TW ') + (+m[9]) + ' kt, T/O+' + tmE(m[11]) + ', MINR ' + m[12] + ' t.');
      }
      if ((m = /^([A-Z]{4})\/(\w+)\s+([\d.]+)$/.exec(t))) return Z('起飞机场 <b>' + m[1] + '</b>，跑道 ' + m[2] + '。起飞时最少要有 <b>' + m[3] + ' 吨</b>。', 'Departure ' + m[1] + ' RWY ' + m[2] + ', MINR ' + m[3] + ' t.');
      if ((m = /^([A-Z0-9]+)\s+(\d{3})\s+(\d{3})\s+(\d{2})\/(\d{3})/.exec(t)) && /\d{4}\s*$|[\d.]+\s*$/.test(t) === false) {}
      if ((m = /^([A-Z]{4})\/(\w+)\s+(\d{3})\s+.*?(\d{4})\s+\.{4}\s+\.{4}\s+([\d.]+)$/.exec(t))) return Z('到达目的地 <b>' + m[1] + '</b>，跑道 ' + m[2] + '，起飞后 ' + tm(m[4]) + '。落地时最少要剩 <b>' + m[5] + ' 吨</b>。', 'Arrive ' + m[1] + '/' + m[2] + ' at T/O+' + tmE(m[4]) + '; min fuel ' + m[5] + ' t.');
      if ((m = /^(\S+)\s+(\d{3})\s+(\d{3})\s+(\d{2})\/(\d{3})\s+.*?(\d{3})\s+\.\./.exec(t))) {}
    }
    if (sec === 'winds') return Z('高空风温表：每个航路点在不同高度的风（真风向 / 风速）和温度，用来输入 FMC 或考虑换高度。', 'Winds / temperatures aloft.');
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

  root.DEC = { G, sections, lineSay, wordSay };
  if (typeof module !== 'undefined') module.exports = root.DEC;
})(typeof window !== 'undefined' ? window : globalThis);
