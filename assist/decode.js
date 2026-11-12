/* OFP 解读（LIDO 格式）：点 OFP 里的任何字，用人话说明「这一行在说什么、这个字是什么意思」。
   全部离线。依据：本公司 OFP 的版面 + ICAO 通用定义；个别栏位按数字核对推断（标「推测」）。 */
(function (root) {
  'use strict';
  // 词条：[中文, English]
  const G = {
    OFP: ['运行飞行计划（Operational Flight Plan）。后面的 15/0/0 是计划编号 / 修订号', 'Operational Flight Plan; 15/0/0 = plan number / revision'],
    'WX PROG': ['用来做计划的气象预报时次（03–15 表示用的是 03Z 和 15Z 的高空风温图）', 'Weather prognosis charts used (e.g. 03 and 15Z)'],
    CTOT: ['起飞时隙（Calculated Take-Off Time），有流控时填', 'Calculated Take-Off Time (slot)'],
    'PARKING BAY': ['停机位，手写', 'Parking stand (fill in)'],
    'ATC CLRNC': ['ATC 放行许可，手写', 'ATC clearance (fill in)'],
    'PLND FL': ['计划高度：起始高度，以及在哪个点改到哪个高度', 'Planned levels: initial, then step climbs at waypoints'],
    TRIP: ['航程油：从起飞到目的地落地要烧的油（kg），后面是飞行时间', 'Trip fuel: burn from takeoff to landing (kg) and flight time'],
    CONT: ['应急油（Contingency）。3.0 P/C = 航程油的 3%', 'Contingency fuel; 3.0 P/C = 3 % of trip'],
    ALTN: ['备降油：从目的地复飞到第一备降场的油', 'Alternate fuel: from destination missed approach to the alternate'],
    FRSV: ['最后储备油（Final Reserve），30 分钟等待用油', 'Final reserve fuel (30 min holding)'],
    'FMC-RSV': ['要输入 FMC 的储备油（吨）= 备降油 + 最后储备油', 'Reserve to enter in the FMC (t) = alternate + final reserve'],
    EXTRA: ['额外油（机长 / 签派加的），后面写原因，如 ATC、WX', 'Extra / discretionary fuel, with reason (ATC, WX…)'],
    'T/O FUEL': ['起飞油 = 航程 + 应急 + 备降 + 储备 + 额外', 'Take-off fuel = trip + cont + altn + final reserve + extra'],
    TAXI: ['滑行油和滑行时间', 'Taxi fuel and taxi time'],
    'RAMP FUEL': ['总油（撤轮挡时油箱里的油，单位吨），后面是可飞时间（续航）', 'Ramp / block fuel (t) and endurance'],
    CORR: ['修正栏：机长改油量时手写', 'Correction column (fill in)'],
    ARR: ['计划到达时间 STA（UTC）', 'Scheduled arrival STA (UTC)'],
    DEP: ['计划离港时间 STD（UTC）', 'Scheduled departure STD (UTC)'],
    ET: ['计划轮挡时间（STD 到 STA）', 'Scheduled block time (STD→STA)'],
    'GND DIST': ['地面距离（航路实际长度，海里）', 'Ground distance (nm)'],
    'AIR DIST': ['空中距离（考虑风以后相当于飞了多远，海里）。比地面距离长 = 逆风', 'Air distance (nm, wind-corrected). Longer than ground = headwind'],
    'CRZ DEG': ['巡航性能衰减系数（这架飞机比标准多耗油的百分比），P1.9 = +1.9 %', 'Aircraft performance degradation, P1.9 = +1.9 %'],
    CID: ['成本指数（Cost Index），越大飞得越快、越费油', 'Cost index'],
    CRZ: ['巡航方式：ECON = 经济巡航', 'Cruise mode: ECON'],
    'CRZ FL/TEMP': ['初始巡航高度 / 那里的气温（M29 = −29°C）', 'Initial cruise FL / temperature (M29 = −29 °C)'],
    'TOC TROP': ['爬升顶点处的对流层顶高度（英尺，推测）', 'Tropopause height at top of climb (ft, likely)'],
    'AV TRK': ['平均航迹（度）', 'Average track (°)'],
    'AV W/C': ['平均风分量：M = 逆风（headwind），P = 顺风', 'Average wind component: M = headwind, P = tailwind'],
    'AV ISA': ['平均温度偏差：P11 = 比标准大气高 11°C', 'Average ISA deviation (P11 = ISA +11)'],
    CREW: ['机组人数（手写）', 'Crew count (fill in)'], PAX: ['旅客人数（手写）', 'Passengers (fill in)'], TOT: ['总人数（手写）', 'Total (fill in)'],
    ADJUST: ['油量调整（手写）', 'Fuel adjustment (fill in)'], 'ADJ RAMP FUEL': ['调整后的总油（手写）', 'Adjusted ramp fuel (fill in)'],
    'FUEL REMN': ['落地剩油（手写）', 'Fuel remaining (fill in)'], 'FUEL USED': ['实际用油（手写）', 'Fuel used (fill in)'],
    TANKERING: ['带油：在便宜的地方多加油带走。NO TANKERING RECOMMENDED = 这次不建议带油', 'Tankering advice'],
    'DISCR FUEL REASON': ['机长额外加油的原因选项：ATC 流控、WX 天气、MEL 保留故障、ALTN 备降、OTH 其他', 'Discretionary fuel reason codes'],
    ATIS: ['起飞机场 ATIS，手写', 'Departure ATIS (fill in)'],
    DOW: ['干操作重量范围（kg × 1000）', 'Dry operating weight range'], DOI: ['干操作指数范围（重心）', 'Dry operating index range'],
    EZFW: ['预计无油重量（kg）', 'Estimated zero-fuel weight'], MZFW: ['最大无油重量', 'Maximum zero-fuel weight'], AZFW: ['实际无油重量（手写）', 'Actual ZFW (fill in)'],
    ETOW: ['预计起飞重量', 'Estimated take-off weight'], MTOW: ['最大起飞重量（结构限制）', 'Maximum take-off weight'], ATOW: ['实际起飞重量（手写）', 'Actual TOW (fill in)'], RTOW: ['跑道 / 性能限制的最大起飞重量', 'Regulated (performance-limited) TOW'],
    ELWT: ['预计落地重量', 'Estimated landing weight'], MLWT: ['最大落地重量', 'Maximum landing weight'], ALWT: ['实际落地重量（手写）', 'Actual LW (fill in)'], RLWT: ['性能限制的最大落地重量', 'Regulated landing weight'],
    ASSMD: ['假设温度（灵活推力）', 'Assumed temperature (flex)'], MFRH: ['最低收襟翼高度（推测）', 'Minimum flap retraction height (likely)'], FLAP: ['起飞襟翼', 'Take-off flap'], 'CG-F/A': ['重心：前 / 后', 'Centre of gravity fwd / aft'],
    V1: ['决断速度', 'Decision speed'], VR: ['抬轮速度', 'Rotation speed'], V2: ['起飞安全速度', 'Take-off safety speed'], VREF: ['着陆参考速度', 'Landing reference speed'], EOP: ['发动机失效程序', 'Engine-out procedure'],
    STATCONT: ['统计应急油（根据历史数据算的应急油），NO DATA AVLB = 没有数据', 'Statistical contingency fuel'],
    'OPERATIONAL IMPACTS': ['影响：如果无油重量 / 高度 / 速度改变，油耗和时间会怎么变', 'What-ifs: effect of ZFW / level / speed changes on burn and time'],
    'ZFW CHANGE': ['无油重量每变 1 吨，多 / 少烧多少油（P 多、M 少）', 'Burn change per tonne of ZFW'],
    'FL CHANGE': ['飞高 / 飞低 2000、4000 英尺，油耗和时间变化', 'Burn / time change for ±2000 / 4000 ft'],
    'SPD CHANGE': ['换成本指数（例如 CI10、CI250）的油耗和时间变化', 'Burn / time change for another cost index'],
    'DEST ALTN': ['目的地备降场表', 'Destination alternates table'],
    DIST: ['距离（海里）', 'Distance (nm)'], TRK: ['航迹（度）', 'Track (°)'], FL: ['高度层（中国境内是米制：920 = 9200 米 ≈ FL301）', 'Flight level (in China metric: 920 = 9 200 m ≈ FL301)'],
    COMP: ['风分量：P 顺风、M 逆风（节）', 'Wind component: P tail / M head (kt)'], TIME: ['时间（时分）', 'Time (hhmm)'], FUEL: ['油量（kg）', 'Fuel (kg)'], ROUTING: ['去备降场的航路', 'Routing to the alternate'],
    'DISPATCH BRIEFING INFO': ['签派给机组的提示', 'Dispatcher briefing notes'], 'CREW NOTES': ['机组笔记（手写）', 'Crew notes'],
    AWY: ['航路名称（DCT = 直飞）', 'Airway (DCT = direct)'], TRM: ['磁航迹（度）', 'Magnetic track (°)'], WIND: ['风：24/029 = 240° 29 节', 'Wind: 24/029 = 240° at 29 kt'],
    TAS: ['真空速（节）', 'True airspeed (kt)'], 'SP/M': ['马赫数（829 = M0.829）', 'Mach (829 = M.829)'], STM: ['这一段的飞行时间（分钟）', 'Stage time (min)'],
    ETA: ['预计到达这个点的时间（手写）', 'ETA at waypoint (fill in)'], REMF: ['这个点的实际剩油（手写）', 'Actual fuel remaining (fill in)'],
    WPT: ['航路点', 'Waypoint'], ITT: ['真航迹（度）', 'True track (°)'], 'SR/TDEV': ['风切变率 / 温度偏差：01/P14 = 风切变 1 级、比标准高 14°C', 'Shear rate / ISA deviation'],
    MORA: ['这一段的最低偏航高度（百英尺）：27 = 2700 英尺', 'Minimum off-route altitude (hundreds of ft)'], 'W/C': ['风分量：M = 逆风（节）', 'Wind component: M = headwind (kt)'],
    TROP: ['对流层顶（百英尺 × 10，50 ≈ 50,000 英尺）', 'Tropopause (×1000 ft)'], ATM: ['从起飞累计的时间', 'Accumulated time from take-off'],
    RTA: ['要求到达时间（有就写）', 'Required time of arrival'], ATA: ['实际到达时间（手写）', 'Actual time of arrival (fill in)'],
    MINR: ['到这个点时最少要剩的油（吨）= 后面的航程油 + 备降 + 储备。实际剩油低于它就要注意', 'Minimum fuel required at this point (t); actual should stay above it'],
    CLB: ['爬升中', 'Climbing'], DES: ['下降中', 'Descending'], TOC: ['爬升顶点（Top of Climb）', 'Top of climb'], TOD: ['下降顶点（Top of Descent）', 'Top of descent'],
    DCT: ['直飞', 'Direct'], DP: ['释压改航决断点：之前返回起飞机场，之后继续飞目的地', 'Depressurisation decision point'],
    SA: ['METAR（例行天气实况）', 'METAR'], SP: ['SPECI（特殊天气实况）', 'SPECI'], FT: ['TAF（长时效天气预报，24–30 小时）', 'TAF (long)'], FC: ['TAF（短时效预报，9 小时）', 'TAF (short)'],
    NOSIG: ['未来 2 小时没有明显变化', 'No significant change'], CAVOK: ['天气很好：能见度 10 公里以上、没有低云、没有天气现象', 'Ceiling and visibility OK'],
    NSC: ['没有明显的云', 'No significant cloud'], BECMG: ['逐渐变成', 'Becoming'], TEMPO: ['短时出现', 'Temporarily'], PROB30: ['30% 可能', '30 % probability'], PROB40: ['40% 可能', '40 % probability'],
    VALID: ['有效时间：年月日时分（UTC）', 'Validity (UTC, yymmddhhmm)'], EST: ['结束时间是预计的', 'End time estimated'], UFN: ['直到另行通知', 'Until further notice'], PERM: ['永久', 'Permanent'],
    AIRMETs: ['低空重要天气（AIRMET）', 'AIRMETs'], SIGMETs: ['重要天气警告（雷暴、颠簸、积冰、火山灰等）', 'SIGMETs'],
    'LIDO-NOTAM-BULLETIN': ['航行通告汇编（LIDO 出的），含 NOTAM、公司通告、航图通告', 'NOTAM bulletin (NOTAMs, company & chart NOTAMs)'],
    'COMPANY NOTAM': ['公司通告（阿联酋航空自己发的）', 'Company NOTAM'], 'CHART NOTAM': ['航图通告（航图有改动）', 'Chart NOTAM']
  };
  const Z = (zh, en) => ({ zh, en });
  const tm = s => s && /^\d{4}$/.test(s) ? s.slice(0, 2) + 'h' + s.slice(2) : s;
  const fl = s => +s >= 600 ? Math.round(+s * 10) + ' m (≈FL' + Math.round(+s * 10 * 3.2808 / 100) + ')' : 'FL' + s;

  // 分段：每一行属于 OFP 的哪一部分
  function sections(L) {
    const sec = []; let cur = 'head';
    L.forEach((l, i) => {
      const t = l.trim();
      if (/^AWY\s+TRM\s+DIST/.test(t)) cur = 'nav';
      else if (/ROUTE TO DESTINATION ALTERNATE/.test(t)) cur = 'navalt';
      else if (/^DEST\s+ALTN\s+DIST/.test(t)) cur = 'altn';
      else if (/DISPATCH\s+BRIEFING/.test(t)) cur = 'disp';
      else if (/^Weather\s*$/.test(t)) cur = 'wx';
      else if (/LIDO-NOTAM-BULLETIN/.test(t)) cur = 'notam';
      else if (/^Crew Information\s*$/.test(t)) cur = 'crew';
      else if (cur === 'nav' && /\b(CLIMB|DESCENT)\b/.test(t) && /\b(FL|WIND|N\d{4}\.\d)/.test(L[i + 1] || '')) cur = 'winds';
      sec[i] = cur;
    });
    return sec;
  }

  // 这一行用人话说
  function lineSay(L, i, sec, ctx) {
    const l = L[i], t = l.replace(/\s+/g, ' ').trim(); let m;
    if (!t) return null;
    if ((m = /^TRIP\s+([A-Z]{4})\s+(\d+)\s+(\d{4})/.exec(t))) return Z('航程油：飞到 ' + m[1] + ' 要烧 ' + (+m[2]).toLocaleString() + ' kg，飞 ' + tm(m[3]) + '。', 'Trip fuel to ' + m[1] + ': ' + (+m[2]).toLocaleString() + ' kg, ' + tm(m[3]) + '.');
    if ((m = /^CONT\s+(.*?)\s+(\d+)\s+(\d{4})/.exec(t))) return Z('应急油 ' + (+m[2]).toLocaleString() + ' kg（' + m[1].replace('P/C', '% 航程油') + '），约 ' + (+m[3].slice(2) + 60 * +m[3].slice(0, 2)) + ' 分钟。', 'Contingency ' + (+m[2]).toLocaleString() + ' kg (' + m[1] + '), about ' + (+m[3].slice(2) + 60 * +m[3].slice(0, 2)) + ' min.');
    if ((m = /^ALTN\s+([A-Z]{4})\s+(\d+)\s+(\d{4})/.exec(t))) return Z('备降油：去备降场 ' + m[1] + ' 要 ' + (+m[2]).toLocaleString() + ' kg，' + tm(m[3]) + '。', 'Alternate fuel to ' + m[1] + ': ' + (+m[2]).toLocaleString() + ' kg, ' + tm(m[3]) + '.');
    if ((m = /^FRSV\s+(\d+)\s+(\d{4})/.exec(t))) return Z('最后储备油 ' + (+m[1]).toLocaleString() + ' kg（' + tm(m[2]) + ' 等待）。落地时至少要剩这么多。', 'Final reserve ' + (+m[1]).toLocaleString() + ' kg (' + tm(m[2]) + ' holding).');
    if ((m = /^FMC-RSV\s+-?([\d.]+)-?/.exec(t))) return Z('FMC 里输入的储备油 ' + m[1] + ' 吨（备降油 + 最后储备）。', 'Enter ' + m[1] + ' t as reserves in the FMC.');
    if ((m = /^EXTRA\s*([A-Z ]*?)\s+(\d+)\s+(\d{4})/.exec(t))) return Z('额外油 ' + (+m[2]).toLocaleString() + ' kg，可多飞 ' + tm(m[3]) + '，原因：' + (m[1] || '—') + '。', 'Extra fuel ' + (+m[2]).toLocaleString() + ' kg (' + tm(m[3]) + '), reason: ' + (m[1] || '—') + '.');
    if ((m = /^T\/O FUEL\s+(\d+)/.exec(t))) return Z('起飞油 ' + (+m[1]).toLocaleString() + ' kg（松刹车起飞时应有的油）。', 'Take-off fuel ' + (+m[1]).toLocaleString() + ' kg.');
    if ((m = /^TAXI\s+(\d+)\s+(\d{4})/.exec(t))) return Z('滑行油 ' + m[1] + ' kg，滑行时间 ' + tm(m[2]) + '。', 'Taxi fuel ' + m[1] + ' kg, taxi time ' + tm(m[2]) + '.');
    if ((m = /^RAMP FUEL\s+([\d.]+)\s+(\d{4})/.exec(t))) return Z('总油 ' + m[1] + ' 吨（加油要加到这个数），总共能飞 ' + tm(m[2]) + '。', 'Ramp fuel ' + m[1] + ' t, endurance ' + tm(m[2]) + '.');
    if ((m = /^(?:UAE|EK)?\s?(\d+)\s+(\d{2}[A-Z]{3})\s+(\w{4})\/(\w{3})\s*-\s*(\w{4})\/(\w{3})\s+(\S+)\s+(\S+)/.exec(t))) return Z('航班 EK' + m[1] + '，' + m[2] + '，' + m[3] + '（' + m[4] + '）飞 ' + m[5] + '（' + m[6] + '），机型 ' + m[7] + '，注册号 ' + m[8] + '。', 'Flight EK' + m[1] + ' ' + m[2] + ', ' + m[3] + ' to ' + m[5] + ', ' + m[7] + ' ' + m[8] + '.');
    if ((m = /^PLND FL:\s*(.*)$/.exec(t))) return Z('计划高度：' + m[1].split(' ').map((x, k) => { const q = /^(?:(\w+)\/)?(\d{3})$/.exec(x); return q ? (q[1] ? '过 ' + q[1] + ' 后改 FL' + q[2] : '起始 FL' + q[2]) : x; }).join('，') + '。', 'Planned levels: ' + m[1] + '.');
    if ((m = /^EZFW\s+(\d+)\s+MZFW\s+(\d+)/.exec(t))) return Z('预计无油重量 ' + (+m[1]).toLocaleString() + ' kg，最大 ' + (+m[2]).toLocaleString() + '，还差 ' + (+m[2] - +m[1]).toLocaleString() + ' kg。', 'Est. ZFW ' + m[1] + ', max ' + m[2] + ' (margin ' + (+m[2] - +m[1]) + ' kg).');
    if ((m = /^ETOW\s+(\d+)\s+MTOW\s+(\d+).*?RTOW\s+(\d+)/.exec(t))) return Z('预计起飞重量 ' + (+m[1]).toLocaleString() + ' kg，结构最大 ' + (+m[2]).toLocaleString() + '，跑道性能限制 ' + (+m[3]).toLocaleString() + '，还差 ' + (Math.min(+m[2], +m[3]) - +m[1]).toLocaleString() + ' kg。', 'Est. TOW ' + m[1] + ', MTOW ' + m[2] + ', RTOW ' + m[3] + '.');
    if ((m = /^ELWT\s+(\d+)\s+MLWT\s+(\d+)/.exec(t))) return Z('预计落地重量 ' + (+m[1]).toLocaleString() + ' kg，最大 ' + (+m[2]).toLocaleString() + '，只差 ' + (+m[2] - +m[1]).toLocaleString() + ' kg' + (+m[2] - +m[1] < 3000 ? '（很接近最大，注意）' : '') + '。', 'Est. LW ' + m[1] + ', MLW ' + m[2] + ' (margin ' + (+m[2] - +m[1]) + ' kg).');
    if ((m = /^(ZFW|FL|SPD) CHANGE\s+(.*)$/.exec(t)) || (sec === 'head' && (m = /^\s*(UP|DN|CI\d+)\b(.*)$/.exec(t)) && /BURN/.test(t))) {
      const b = /BURN\s+([PM])\s*(\d+)/.exec(t), ti = /TIME\s+([PM])\s*(\d{4})/.exec(t), w = /(UP|DN)\s+([\d.]+\s*(?:TONNE|FT|\d+FT)?)/.exec(t) || /(CI\d+)/.exec(t);
      return Z((w ? w[0].replace('UP', '增加').replace('DN', '减少').replace('TONNE', '吨').replace('FT', ' 英尺') + '：' : '') + (b ? (b[1] === 'P' ? '多烧 ' : '少烧 ') + b[2] + ' kg' : '') + (ti ? '，时间' + (ti[1] === 'P' ? '多 ' : '少 ') + (+ti[2].slice(2) + 60 * +ti[2].slice(0, 2)) + ' 分钟' : '') + '。', t);
    }
    if (sec === 'altn' && (m = /^([A-Z]{4})\/(\w+)\s+(\d{4})\s+(\d{3})\s+(\d{3})\s+([PM])(\d{3})\s+(\d{4})\s+(\d+)\s*(.*)$/.exec(t)))
      return Z('备降场 ' + m[1] + '，跑道 ' + m[2] + '：距离 ' + (+m[3]) + ' nm，航迹 ' + m[4] + '°，高度 FL' + m[5] + '，' + (m[6] === 'P' ? '顺风 ' : '逆风 ') + (+m[7]) + ' 节，飞 ' + tm(m[8]) + '，用油 ' + (+m[9]).toLocaleString() + ' kg。航路：' + m[10], 'Alternate ' + m[1] + ' RWY ' + m[2] + ': ' + (+m[3]) + ' nm, FL' + m[5] + ', ' + tm(m[8]) + ', ' + m[9] + ' kg. Route: ' + m[10]);
    if ((m = /^-+\s*([A-Z ]+?)\s+(FIR|UIR)\/([A-Z]{4})\s*-+$/.exec(t))) return Z('📻 进入 ' + m[1] + ' ' + m[2] + '（' + m[3] + '）—— 要换频率。', 'Entering ' + m[1] + ' ' + m[2] + ' (' + m[3] + ') — change frequency.');
    if (/^DP\s+[NS]\d/.test(t)) return Z('释压改航决断点：' + t.replace(/^DP\s+/, '') + '。在这个点之前释压 → 沿原航路返回起飞机场；过了这个点 → 继续飞目的地。', 'Depressurisation decision point ' + t);
    if ((sec === 'nav' || sec === 'navalt') && ctx) {
      // 航路行：AWY TRM DIST WIND [FL] [TAS] [SP/M] STM —— 中间几栏可能空着，按数值范围判断
      if ((m = /^(\S+)\s+(?:=\s*)?(?:(\d{3})\s+)?(\d{3})\s+(\d{2})\/(\d{3})\s+((?:(?:CLB|DES|\d{3})\s+)*?)(\d{3})\s+\.\./.exec(t))) {
        const nx = L[i + 1] ? L[i + 1].trim().split(/\s+/)[0] : '';
        const v = m[6].trim() ? m[6].trim().split(/\s+/) : [];
        let FLv = null, TAS = null, MA = null;
        if (v.length >= 3) { FLv = v[0]; TAS = v[1]; MA = v[2]; }
        else if (v.length === 2) { if (/CLB|DES/.test(v[0])) { FLv = v[0]; if (+v[1] >= 700) MA = v[1]; else TAS = v[1]; } else if (+v[1] >= 700) { TAS = v[0]; MA = v[1]; } else { FLv = v[0]; TAS = v[1]; } }
        else if (v.length === 1) { if (/CLB|DES/.test(v[0])) FLv = v[0]; else if (+v[0] >= 250 && +v[0] < 650) TAS = v[0]; else MA = v[0]; }
        return Z('沿 ' + (m[1] === 'DCT' ? '直飞' : '航路 ' + m[1]) + ' 飞到 ' + nx + '：' + (m[2] ? '磁航迹 ' + m[2] + '°，' : '') + '距离 ' + (+m[3]) + ' nm，风 ' + m[4] + '0° ' + (+m[5]) + ' 节' + (FLv ? '，' + (FLv === 'CLB' ? '爬升中' : FLv === 'DES' ? '下降中' : '高度 ' + fl(FLv)) : '') + (TAS ? '，真空速 ' + TAS + ' 节' : '') + (MA ? '，马赫 M0.' + MA : '') + '，这段飞 ' + (+m[7]) + ' 分钟。' + (/=/.test(l) ? ' 「=」表示这个点是管制区（FIR）边界。' : ''),
          'Via ' + m[1] + ' to ' + nx + ': ' + (m[2] ? 'track ' + m[2] + '°M, ' : '') + (+m[3]) + ' nm, wind ' + m[4] + '0°/' + (+m[5]) + ' kt' + (FLv ? ', ' + (/\d/.test(FLv) ? fl(FLv) : FLv) : '') + (TAS ? ', TAS ' + TAS : '') + (MA ? ', M.' + MA : '') + ', ' + (+m[7]) + ' min.' + (/=/.test(l) ? ' "=" marks a FIR boundary point.' : ''));
      }
      // 航路点行：WPT ITT SR/TDEV MORA W/C TROP ATM … MINR
      if ((m = /^([A-Z0-9_]{2,8})(?:\/\w+)?\s+(?:\+\s+)?(\d{3})?\s*(\d{2})?\/([PM])(\d{2})\s+(\d{2,3})\s+([PM])(\d{3})\s+(?:(\d{2})\s+)?(\d{4})\s+\.{4}\s+\.{4}\s+([\d.]+)/.exec(t))) {
        const w = ctx.nav && ctx.nav.find(x => x.id === m[1]);
        return Z('航路点 ' + m[1] + '：' + (m[2] ? '真航迹 ' + m[2] + '°，' : '') + (m[3] ? '风切变 ' + (+m[3]) + ' 级，' : '') + '温度比标准' + (m[4] === 'P' ? '高 ' : '低 ') + (+m[5]) + '°C，MORA ' + (+m[6] * 100).toLocaleString() + ' ft' + (+m[6] >= 100 ? '（高地形）' : '') + '，' + (m[7] === 'M' ? '逆风 ' : '顺风 ') + (+m[8]) + ' 节' + (m[9] ? '，对流层顶约 ' + m[9] + ',000 ft' : '') + '。起飞后 ' + tm(m[10]) + ' 到这里' + (ctx.atP && w ? '（约 ' + ctx.atP(w.t) + '）' : '') + '，到这里最少要剩 ' + m[11] + ' 吨油。',
          'Waypoint ' + m[1] + ': ISA ' + (m[4] === 'P' ? '+' : '−') + (+m[5]) + ', MORA ' + (+m[6] * 100) + ' ft, ' + (m[7] === 'M' ? 'headwind ' : 'tailwind ') + (+m[8]) + ' kt, at T/O+' + tm(m[10]) + ', minimum fuel ' + m[11] + ' t.');
      }
      if ((m = /^([A-Z]{4})\/(\w+)\s+([\d.]+)$/.exec(t))) return Z('起飞机场 ' + m[1] + '，跑道 ' + m[2] + '，起飞时最少要有 ' + m[3] + ' 吨油。', 'Departure ' + m[1] + ' RWY ' + m[2] + ', minimum fuel ' + m[3] + ' t.');
    }
    if (sec === 'winds') return Z('高空风温表：各个航路点在不同高度的风（方向/速度）和温度，用来输入 FMC 或者换高度时参考。', 'Winds / temperatures aloft per waypoint and level.');
    if (sec === 'wx' && ctx && ctx.WX) {
      const r = /^(SA|SP|FT|FC)\s+(.*)$/.exec(t);
      let k = i, txt = '';
      if (r) { txt = r[2]; while (L[k + 1] && /^\s{8,}\S/.test(L[k + 1]) && !/=\s*$/.test(txt)) { k++; txt += ' ' + L[k].trim(); } }
      else { let s = i; while (s > 0 && !/^\s*(SA|SP|FT|FC)\s/.test(L[s])) s--; const r2 = /^\s*(SA|SP|FT|FC)\s+(.*)$/.exec(L[s] || ''); if (r2 && i - s < 8) { txt = r2[2]; for (let q = s + 1; q <= i + 6 && L[q] && /^\s{8,}\S/.test(L[q]); q++) txt += ' ' + L[q].trim(); } }
      if (txt) {
        txt = txt.replace(/=\s*$/, '');
        const isM = r ? /^S/.test(r[1]) : /^\s*S/.test(L[i]);
        const ref = ctx.ref || Date.now();
        try {
          if (isM) { const M = ctx.WX.metar(txt, ref); return Z('实况：' + ctx.WX.sayOne(M, 'zh'), 'Observed: ' + ctx.WX.sayOne(M, 'en')); }
          const T = ctx.WX.taf(txt, ref);
          const parts = T.groups.map(g => ({ zh: (g.type === 'BASE' ? '主要：' : g.type === 'FM' ? '从 ' + ctx.hmZ(g.from) + ' 起：' : (g.type === 'BECMG' ? '逐渐变成' : g.type === 'TEMPO' ? '短时' : g.type) + (g.prob ? '（' + g.prob + '% 可能）' : '') + (g.from ? ' ' + ctx.hmZ(g.from) + '–' + ctx.hmZ(g.to) : '') + '：') + ctx.WX.sayOne(g.c, 'zh'), en: g.type + (g.prob ? ' ' + g.prob + '%' : '') + (g.from ? ' ' + ctx.hmZ(g.from) + '–' + ctx.hmZ(g.to) : '') + ': ' + ctx.WX.sayOne(g.c, 'en') }));
          return Z('预报（' + ctx.hmZ(T.from) + '–' + ctx.hmZ(T.to) + '）：<br>' + parts.map(p => p.zh).join('<br>'), 'Forecast ' + ctx.hmZ(T.from) + '–' + ctx.hmZ(T.to) + ':<br>' + parts.map(p => p.en).join('<br>'));
        } catch (e) {}
      }
      if ((m = /^([A-Z]{4})\s*\/([A-Z0-9]{3})\s+(.*)$/.exec(t))) return Z('机场 ' + m[1] + '（' + m[2] + '）' + m[3], 'Airport ' + m[1] + ' (' + m[2] + ') ' + m[3]);
      if (/AIRPORT|ALTERNATE|ENROUTE/.test(t)) return Z({ 'DEPARTURE AIRPORT:': '起飞机场的天气', 'DESTINATION AIRPORT:': '目的地机场的天气', 'DESTINATION ALTERNATE:': '目的地备降场的天气', 'FUEL ENROUTE AIRPORT:': '航路加油机场的天气', 'ENROUTE AIRPORT(S):': '航路备降场的天气' }[t] || t, t);
    }
    if (sec === 'notam' && ctx && ctx.notam) {
      const n = ctx.notam(i);
      if (n) return n;
    }
    return null;
  }

  // 单个字的意思
  function wordSay(L, i, w, sec, ctx) {
    const t = L[i].replace(/\s+/g, ' ');
    // 先找多个词组成的词条
    for (const k of Object.keys(G).filter(k => /\s/.test(k)).sort((a, b) => b.length - a.length)) if (t.indexOf(k) >= 0 && k.split(' ').indexOf(w) >= 0) return Z('<b>' + k + '</b>：' + G[k][0], '<b>' + k + '</b>: ' + G[k][1]);
    if (G[w]) return Z('<b>' + w + '</b>：' + G[w][0], '<b>' + w + '</b>: ' + G[w][1]);
    let m;
    if (ctx && ctx.AP && ctx.AP[w]) { const a = ctx.AP[w]; return Z('<b>' + w + '</b>：机场 ' + a[1] + '（' + a[2] + '），标高 ' + a[5] + ' ft', '<b>' + w + '</b>: ' + a[1] + ', ' + a[2] + ', elev ' + a[5] + ' ft'); }
    if (ctx && ctx.firNames && ctx.firNames[w]) return Z('<b>' + w + '</b>：' + ctx.firNames[w] + '（管制区代码）', '<b>' + w + '</b>: ' + ctx.firNames[w]);
    if (ctx && ctx.nav) { const p = ctx.nav.find(x => x.id === w); if (p) return Z('<b>' + w + '</b>：航路点，起飞后 ' + Math.floor(p.t / 60) + 'h' + String(p.t % 60).padStart(2, '0') + ' 到' + (ctx.atP ? '（约 ' + ctx.atP(p.t) + '）' : '') + (p.mora != null ? '，MORA ' + p.mora * 100 + ' ft' : ''), '<b>' + w + '</b>: waypoint at T/O+' + Math.floor(p.t / 60) + 'h' + String(p.t % 60).padStart(2, '0') + (p.mora != null ? ', MORA ' + p.mora * 100 + ' ft' : '')); }
    if (/^[A-Z]\d{1,4}[A-Z]?$|^[A-Z]{2}\d{1,3}$|^U?[A-Z]\d{2,3}$/.test(w)) return Z('<b>' + w + '</b>：航路（airway）名称', '<b>' + w + '</b>: airway');
    if ((m = /^(\d{2})\/(\d{3})$/.exec(w))) return Z('<b>' + w + '</b>：风向 ' + m[1] + '0°、风速 ' + (+m[2]) + ' 节', '<b>' + w + '</b>: wind ' + m[1] + '0° / ' + (+m[2]) + ' kt');
    if ((m = /^([PM])(\d{3})$/.exec(w))) return Z('<b>' + w + '</b>：' + (sec === 'altn' || /W\/C|COMP/.test(t) || sec === 'nav' ? (m[1] === 'M' ? '逆风 ' : '顺风 ') + (+m[2]) + ' 节' : (m[1] === 'P' ? '多 ' : '少 ') + (+m[2])), '<b>' + w + '</b>: ' + (m[1] === 'M' ? 'minus / headwind ' : 'plus / tailwind ') + (+m[2]));
    if ((m = /^([PM])(\d{2})$/.exec(w))) return Z('<b>' + w + '</b>：' + (m[1] === 'P' ? '+' : '−') + (+m[2]) + '（温度偏差或修正）', '<b>' + w + '</b>: ' + (m[1] === 'P' ? '+' : '−') + (+m[2]));
    if ((m = /^(\d{2})\/([PM])(\d{2})$/.exec(w))) return Z('<b>' + w + '</b>：风切变 ' + (+m[1]) + ' 级，温度比标准' + (m[2] === 'P' ? '高 ' : '低 ') + (+m[3]) + '°C', '<b>' + w + '</b>: shear ' + (+m[1]) + ', ISA ' + (m[2] === 'P' ? '+' : '−') + (+m[3]));
    if ((m = /^([NS])(\d{2})(\d{2}\.\d)$/.exec(w))) return Z('<b>' + w + '</b>：纬度 ' + (m[1] === 'N' ? '北纬 ' : '南纬 ') + (+m[2]) + '°' + m[3] + '′', '<b>' + w + '</b>: latitude');
    if ((m = /^([EW])(\d{3})(\d{2}\.\d)$/.exec(w))) return Z('<b>' + w + '</b>：经度 ' + (m[1] === 'E' ? '东经 ' : '西经 ') + (+m[2]) + '°' + m[3] + '′', '<b>' + w + '</b>: longitude');
    if (/^\d{10}$/.test(w)) return Z('<b>' + w + '</b>：20' + w.slice(0, 2) + '-' + w.slice(2, 4) + '-' + w.slice(4, 6) + ' ' + w.slice(6, 8) + ':' + w.slice(8) + ' UTC', '<b>' + w + '</b>: 20' + w.slice(0, 2) + '-' + w.slice(2, 4) + '-' + w.slice(4, 6) + ' ' + w.slice(6, 8) + ':' + w.slice(8) + 'Z');
    if (/^\.+$/.test(w)) return Z('空格，要你手写', 'Blank — fill in by hand');
    if (ctx && ctx.NX && ctx.NX.A[w.replace('U/S', 'U_S')]) { const a = ctx.NX.A[w.replace('U/S', 'U_S')]; return Z('<b>' + w + '</b>：' + a[1], '<b>' + w + '</b>: ' + a[0]); }
    if (/^\d{4}$/.test(w) && (sec === 'head' || sec === 'nav' || sec === 'altn')) return Z('<b>' + w + '</b>：' + (/^\d{4}$/.test(w) && +w.slice(2) < 60 ? '时间 ' + w.slice(0, 2) + ' 小时 ' + w.slice(2) + ' 分（或 UTC 时刻）' : '数值'), '<b>' + w + '</b>: time hh mm');
    return null;
  }

  root.DEC = { G, sections, lineSay, wordSay };
  if (typeof module !== 'undefined') module.exports = root.DEC;
})(typeof window !== 'undefined' ? window : globalThis);
