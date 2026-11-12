/* NOTAM 解读：把 ICAO 缩写（Doc 8400）展开成英文白话；中文用联网时翻译好、存在 iPad 上的版本，
   没翻译过的用缩写对照表（离线也能看懂大意）。 */
(function (root) {
  'use strict';
  // 缩写 → [英文, 中文]
  const A = {
    ABN: ['aerodrome beacon', '机场灯标'], ABT: ['about', '大约'], ABV: ['above', '以上'], ACC: ['area control centre', '区域管制中心'], ACFT: ['aircraft', '航空器'],
    ACT: ['active', '生效'], AD: ['aerodrome', '机场'], ADJ: ['adjacent', '相邻'], ADS: ['automatic dependent surveillance', '自动相关监视'], AFIS: ['aerodrome flight information service', '机场飞行情报服务'],
    AGL: ['above ground level', '离地高度'], AIP: ['AIP (aeronautical information publication)', '航行资料汇编（AIP）'], ALS: ['approach lighting system', '进近灯光系统'], ALT: ['altitude', '高度'],
    ALTN: ['alternate', '备降'], AMDT: ['amendment', '修订'], AMSL: ['above mean sea level', '平均海平面以上'], APCH: ['approach', '进近'], APN: ['apron', '机坪'], APP: ['approach control', '进近管制'],
    APRX: ['approximately', '大约'], ARR: ['arrival', '到达'], ASPH: ['asphalt', '沥青'], ATC: ['air traffic control', '空中交通管制'], ATIS: ['ATIS', '自动终端情报（ATIS）'], ATS: ['air traffic services', '空中交通服务'],
    AUTH: ['authorized', '批准'], AVBL: ['available', '可用'], AWY: ['airway', '航路'], AZM: ['azimuth', '方位'], BA: ['braking action', '刹车效应'], BCN: ['beacon', '信标'], BLW: ['below', '以下'],
    BTN: ['between', '之间'], BRG: ['bearing', '方位'], CAT: ['category', '类'], CL: ['centreline', '中线'], CLR: ['clear', '净空/许可'], CLSD: ['closed', '关闭'], CNL: ['cancelled', '取消'],
    COM: ['communications', '通信'], CONC: ['concrete', '混凝土'], COORD: ['coordinates', '坐标'], CPDLC: ['CPDLC datalink', '管制员-飞行员数据链（CPDLC）'], CRZ: ['cruise', '巡航'], CTA: ['control area', '管制区'],
    CTC: ['contact', '联系'], CTL: ['control', '管制'], CTN: ['caution', '注意'], CTR: ['control zone', '管制地带'], DCT: ['direct', '直飞'], DEG: ['degrees', '度'], DEP: ['departure', '离场'],
    DES: ['descend', '下降'], DLY: ['daily', '每天'], DME: ['DME', '测距仪（DME）'], DNG: ['danger', '危险'], DRG: ['during', '期间'], DTHR: ['displaced threshold', '内移入口'], DUE: ['due', '因为'],
    EB: ['eastbound', '向东'], ELEV: ['elevation', '标高'], EMERG: ['emergency', '紧急'], ENR: ['en-route', '航路'], EQPT: ['equipment', '设备'], EST: ['estimated', '预计'], EXC: ['except', '除了'],
    EXER: ['exercise', '演习'], EXP: ['expect', '预计'], FAC: ['facility', '设施'], FAF: ['final approach fix', '最后进近定位点'], FIR: ['flight information region', '飞行情报区'], FLT: ['flight', '飞行'],
    FLW: ['following', '如下'], FM: ['from', '从'], FREQ: ['frequency', '频率'], FRNG: ['firing', '射击'], FT: ['feet', '英尺'], GEN: ['general', '一般'], GND: ['ground', '地面'], GP: ['glide path', '下滑道'],
    GS: ['glide slope', '下滑道'], HEL: ['helicopter', '直升机'], HGT: ['height', '高'], HJ: ['sunrise to sunset', '日出到日落'], HN: ['sunset to sunrise', '日落到日出'], HR: ['hours', '小时'], HRS: ['hours', '小时'],
    HX: ['no specific hours', '时间不定'], H24: ['24 hours', '24 小时'], IAP: ['instrument approach procedure', '仪表进近程序'], IFR: ['IFR', '仪表飞行（IFR）'], ILS: ['ILS', '仪表着陆系统（ILS）'],
    INFO: ['information', '情报'], INOP: ['inoperative', '不工作'], INSTL: ['installed', '安装'], INT: ['intersection', '交叉点'], INTL: ['international', '国际'], LDG: ['landing', '着陆'], LGT: ['lighting', '灯光'],
    LOC: ['localizer', '航向道'], LTD: ['limited', '受限'], MAINT: ['maintenance', '维护'], MAPT: ['missed approach point', '复飞点'], MAX: ['maximum', '最大'], MET: ['meteorological', '气象'], MIL: ['military', '军用'],
    MIN: ['minutes', '分钟'], MNM: ['minimum', '最低'], MNT: ['monitor', '监视'], MOA: ['military operating area', '军事活动区'], MSA: ['minimum sector altitude', '最低扇区高度'], MSL: ['mean sea level', '平均海平面'],
    NAV: ['navigation', '导航'], NB: ['northbound', '向北'], NDB: ['NDB', '无方向信标（NDB）'], NIL: ['none', '无'], NM: ['nautical miles', '海里'], NML: ['normal', '正常'], NR: ['number', '编号'], NOTAM: ['NOTAM', '航行通告'],
    OBS: ['observed', '观测'], OBST: ['obstacle', '障碍物'], OCNL: ['occasional', '偶尔'], OPR: ['operating', '运行'], OPS: ['operations', '运行'], OUBD: ['outbound', '出航'], PAPI: ['PAPI', '精密进近航道指示灯（PAPI）'],
    PARL: ['parallel', '平行'], PAX: ['passengers', '旅客'], PERM: ['permanent', '永久'], PJE: ['parachute jumping exercise', '跳伞活动'], PPR: ['prior permission required', '需事先许可'], PRKG: ['parking', '停放'],
    PROC: ['procedure', '程序'], PROHIBITED: ['prohibited', '禁止'], PSN: ['position', '位置'], RAD: ['radius', '半径'], RCL: ['runway centreline', '跑道中线'], RDL: ['radial', '径向线'], REF: ['refer to', '参见'],
    REQ: ['request', '请求'], RMK: ['remark', '备注'], RNAV: ['RNAV', '区域导航（RNAV）'], RNP: ['RNP', '所需导航性能（RNP）'], RQRD: ['required', '需要'], RTE: ['route', '航路'], RTN: ['return', '返回'],
    RWY: ['runway', '跑道'], SB: ['southbound', '向南'], SEC: ['seconds', '秒'], SER: ['service', '服务'], SFC: ['surface', '地面'], SID: ['SID', '标准离场（SID）'], SKED: ['schedule', '计划'], SR: ['sunrise', '日出'],
    SS: ['sunset', '日落'], STAR: ['STAR', '标准进场（STAR）'], STD: ['standard', '标准'], SUBJ: ['subject to', '视……而定'], SVC: ['service', '服务'], TAR: ['terminal area radar', '终端雷达'], TEMPO: ['temporary', '临时'],
    TFC: ['traffic', '交通'], THR: ['threshold', '入口'], TIL: ['until', '直到'], TKOF: ['take-off', '起飞'], TMA: ['terminal control area', '终端管制区'], TRA: ['temporary reserved area', '临时保留空域'],
    TSA: ['temporary segregated area', '临时隔离空域'], TWR: ['tower', '塔台'], TWY: ['taxiway', '滑行道'], TYP: ['type', '机型'], UFN: ['until further notice', '直到另行通知'], UNL: ['unlimited', '无限'],
    U_S: ['unserviceable', '不能使用'], VAR: ['magnetic variation', '磁差'], VIS: ['visibility', '能见度'], VOR: ['VOR', '甚高频全向信标（VOR）'], WB: ['westbound', '向西'], WEF: ['with effect from', '从……起生效'],
    WI: ['within', '在……之内'], WID: ['width', '宽度'], WIP: ['work in progress', '施工'], WKN: ['weaken', '减弱'], WRNG: ['warning', '警告'], WX: ['weather', '天气'], 'WIE': ['with immediate effect', '立即生效'],
    'GNSS': ['GNSS (satellite navigation)', '卫星导航（GNSS/GPS）'], 'GPS': ['GPS', 'GPS'], 'RFF': ['rescue and fire fighting', '消防救援'], 'TFC': ['traffic', '交通'], 'FPL': ['flight plan', '飞行计划'],
    'ARP': ['aerodrome reference point', '机场基准点'], 'ASDA': ['accelerate-stop distance available', '可用加速停止距离'], 'TORA': ['take-off run available', '可用起飞滑跑距离'], 'TODA': ['take-off distance available', '可用起飞距离'], 'LDA': ['landing distance available', '可用着陆距离'],
    'SPOOFING': ['spoofing', '欺骗干扰'], 'JAMMING': ['jamming', '压制干扰'], 'CTL': ['control', '管制'], 'ACT': ['active', '生效'], 'REPORTED': ['reported', '有报告']
  };
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  // 常见英文词 → 中文（离线兜底，让没翻译的也能看懂大意）
  const W = { CLOSED: '关闭', AND: '和', OR: '或', TO: '到', FOR: '供', THE: '', OF: '的', ON: '在', IN: '在', AT: '在', BY: '由', WITH: '有', DUE: '因为', NOT: '不', ARE: '', IS: '', BE: '', WILL: '将',
    ALL: '所有', FLIGHTS: '航班', PILOTS: '飞行员', CREW: '机组', CREWS: '机组', ADVISED: '建议', EXERCISE: '保持', CAUTION: '注意', SIGNAL: '信号', INTERFERENCE: '干扰', LOSS: '丢失', RESTRICTED: '限制', AREA: '区域',
    AIRSPACE: '空域', SEGMENT: '航段', SEGMENTS: '航段', STAND: '机位', STANDS: '机位', BIRD: '鸟', BIRDS: '鸟', ACTIVITY: '活动', MIGRATION: '迁徙', SECURITY: '安全', WARNING: '警告', CONFLICT: '冲突', ZONE: '区' };
  const fmtT = s => { const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s); return m ? m[3] + MON[+m[2] - 1] + ' ' + m[4] + m[5] + 'Z' : s; };
  function tokens(t, lang) {
    return String(t || '').replace(/U\/S/g, 'U_S').split(/(\s+|[,.;:()])/).map(w => {
      const k = w.toUpperCase();
      if (A[k]) return lang === 'zh' ? A[k][1] : A[k][0];
      if (/^\d{10}$/.test(w)) return fmtT(w);
      if (lang === 'zh' && W[k] != null) return W[k];
      return w === 'U_S' ? (lang === 'zh' ? '不能使用' : 'unserviceable') : w;
    }).join('');
  }
  // 常见英文词：小写；不在这里的长单词当成地名，首字母大写；带数字的、代码保持大写
  const COMMON = new Set(('a about above across active activities activity add added additional advised after aircraft airport airspace all along also alternative an and any apply applied applies approach approx are area areas around arrival as at authority available avoid be been before below between both bound boundary by can caution centre change changed changes check closed closure coordinates company conditions conflict construction contact continue control crew crews current daily damage danger day days delay departure deviation direct distance due during each east eastbound effect end engine enter entering established exercise exit exiting expect extended fire flight flights flow following for from ground hazardous have high hours if in include including information inside instrument into is it its landing left level levels light lighting lights limit limited loss low lower maintain may means migration military minimum minutes more must navigation near necessary new night no normal north not notice observed of on only operation operational operations or other out outside over parking part permission pilots plan point points possible prior procedure procedures provided reason refer region reported request required requirement requirements reserved restricted restriction restrictions right risk route routes runway safety same sea seas section sector security segment segments separation service services shall should signal situation south speed stand stands start subject surface take taxi taxiway than that the their then these this through time to towed traffic turn type under unless until use used via warning was west westbound when where which while will with within without work zone zones closed unserviceable available aerodrome apron approach taxiway runway threshold centreline lighting radius nautical miles feet minutes between below above except following within daily hours permanent temporary estimated until further notice due one two three four five six seven eight nine ten am pm interference spoofing jamming anomalies observed unlimited informed should alternative wingspan below more eastbound westbound northbound southbound only flights birds bird flocks sporadic active swallows herons raptors bats place migrate migrates seasonally adjacent relatively frequent frequently strike strikes likely occur phases continuous climb descent nearing weak cold air masses move southward expected scattered rain base fly increase increasing medium mist morning evening vigilance foraging temporarily dispersal methods reduce resorts small sometimes landing take-off off changed rules arrival guided vehicle designated tractors engine started apron wip maint maintenance enter exit stands parking taxiway closed operating normal other trial basis opportunity applied equipped tracks oceanic reservation multi agency capability demonstration annual joint bounded coord lines joining tempo established dng hazardous high seas following sequence then closing origin increased militant naval activities electronic warfare air defense readiness elevated risks exist misidentification civil sudden rerouting com disruption interceptions short notice closures iranian operator have extreme perform enhanced assessments monitor advisories continuously contingency plans diversion unexpected comply immediately civil instructions consider routing radar derived information some parts sector freq resumed overflight subject conditions surveillance will be provided').split(/\s+/));
  const KEEP = new Set('GNSS GPS VOR DME ILS SID STAR PAPI ATIS CPDLC NDB IFR VFR AIP FBO RNAV RNP ADS UTC ICAO AIRAC MHZ KHZ ACC TMA CTR FIR UIR ATC ATS AD RWY TWY QNH NOTAM MSSR RCAG HF VHF UHF ETOPS EK UAE AMSL AGL FL OM'.split(' '));
  function en(text) {
    let t = String(text || '').replace(/\bDUE TO\b/g, 'DUE').replace(/\bEXER(?:CISE)? CTN\b/g, 'EXERCISE CAUTION');
    let s = tokens(t, 'en');
    s = s.replace(/[A-Za-z][A-Za-z'\-]*/g, w => {
      if (/[a-z]/.test(w)) return w;                                     // 已经展开的缩写（小写）
      if (KEEP.has(w)) return w;
      const l = w.toLowerCase();
      if (COMMON.has(l)) return l;
      if (w.length <= 3 || /^[A-Z]{4}$/.test(w) && !COMMON.has(l)) return w;   // 代码 / 机场
      return w[0] + l.slice(1);                                          // 地名
    });
    s = s.replace(/\bdue\b/g, 'due to').replace(/\bexercise caution\b/gi, 'exercise caution');
    return s.replace(/\s+/g, ' ').replace(/\s([,.;:)])/g, '$1').trim().replace(/^./, c => c.toUpperCase()).replace(/([.]\s+)([a-z])/g, (m, a, c) => a + c.toUpperCase());
  }
  // 中文：先用联网翻译好的；没有就用对照表展开（会夹带一些英文专有名词）
  function zh(text, id, store) {
    if (store && id && store[id]) return { s: store[id], full: true };
    const t = String(text || '').replace(/\bDUE TO\b/g, 'DUE').replace(/\bEXER(?:CISE)? CTN\b|\bEXERCISE CAUTION\b/g, '注意');
    return { s: tokens(t, 'zh').replace(/\s+/g, ' ').trim(), full: false };
  }
  root.NX = { en, zh, A, fmtT };
  if (typeof module !== 'undefined') module.exports = root.NX;
})(typeof window !== 'undefined' ? window : globalThis);
