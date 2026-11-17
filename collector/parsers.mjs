// 스페이스패스 수집기 — 사이트별 HTML 해석 (순수 함수, 외부 패키지 없음)
/** 실내디자인·공간디자인 관련 직무로 보는 제목 단어 */
export const RELEVANT = /인테리어|실내\s*(디자인|디자이너|건축|설계)|공간\s*(디자인|디자이너|기획|연출)|전시\s*(디자인|디자이너|부스|공간)|부스\s*디자인|VMD|비주얼\s*머천|디스플레이\s*디자|세대\s*설계|단위\s*세대|주거\s*공간|상업\s*공간|가구\s*(디자인|디자이너|설계)|제작\s*가구|무대\s*(디자인|디자이너)|팝업\s*(스토어|디자인|공간)|리모델링\s*(디자인|설계)|스페이스\s*플래너|space\s*designer|interior/i;
/** 직종 키워드(사람인·잡코리아 분류)에 이 단어가 있으면 후보로 봄 */
export const RELEVANT_SECTOR = /인테리어|실내디자인|실내디자이너|실내건축|공간디자인|공간디자이너|전시디자인|전시디자이너|VMD|디스플레이|리모델링|가구디자인/;
/** 제목이 디자인과 무관한 직무만 가리키는 경우 */
export const OTHER_JOB = /영업|마케팅|회계|경리|사무|총무|인사|노무|CS|상담원|콜센터|웹\s*디자|UI|UX|편집\s*디자|패키지|패션\s*디자|의류|그래픽\s*디자이너|영상|모션|개발자|프로그래머|기사\s*모집|배송|운전|청소|미화|도배|필름\s*시공|타일|목수|조공|용접|배관|전기\s*기사|설비|경비|매장\s*관리|판매/;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·' };
export const decode = s => String(s || '').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m));
export const text = s => decode(String(s || '').replace(/\r/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]*>/g, ' ')).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
export const clean = s => text(s).replace(/\s+/g, ' ').trim();

export function kstToday(now = new Date()) { const k = new Date(now.getTime() + 9 * 3600000); return { Y: k.getUTCFullYear(), M: k.getUTCMonth() + 1, D: k.getUTCDate() }; }
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export function dates(now = new Date()) {
  const { Y, M, D } = kstToday(now);
  const today = ymd(Y, M, D);
  const addDays = n => { const t = new Date(Date.UTC(Y, M - 1, D + n)); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
  const futureMD = (m, d) => ymd(m < M - 2 ? Y + 1 : Y, m, d);
  const pastMD = (m, d) => ymd(m > M + 1 ? Y - 1 : Y, m, d);
  function deadline(t) {
    t = clean(t);
    if (/오늘\s*마감/.test(t)) return { deadline: today, label: '오늘마감' };
    if (/내일\s*마감/.test(t)) return { deadline: addDays(1), label: '내일마감' };
    let m = t.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/); if (m) return { deadline: ymd(+m[1], +m[2], +m[3]) };
    m = t.match(/(?:^|\D)(\d{2})\.(\d{1,2})\.(\d{1,2})(?!\d)/); if (m) return { deadline: ymd(2000 + +m[1], +m[2], +m[3]) };
    m = t.match(/(\d{1,2})\/(\d{1,2})/); if (m) return { deadline: futureMD(+m[1], +m[2]) };
    m = t.match(/D\s*-\s*(\d+)/i); if (m) return { deadline: addDays(+m[1]) };
    m = t.match(/채용\s*시|상시\s*채용|상시/); if (m) return { deadline: '', label: m[0] };
    return { deadline: '', label: t };
  }
  function posted(t) {
    t = clean(t);
    let m = t.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/); if (m) return ymd(+m[1], +m[2], +m[3]);
    m = t.match(/(\d{2})\/(\d{1,2})\/(\d{1,2})/); if (m) return ymd(2000 + +m[1], +m[2], +m[3]);
    m = t.match(/(\d{1,2})\/(\d{1,2})/); if (m) return pastMD(+m[1], +m[2]);
    if (/시간\s*전|분\s*전|오늘/.test(t)) return today;
    return '';
  }
  return { today, deadline, posted };
}
/** 분야(주거·상업·전시…) 분류: 제목 + 직종 키워드 */
export function inferField(t) {
  t = String(t || '');
  if (/VMD|비주얼\s*머천|디스플레이|팝업|매장\s*연출|윈도우\s*디스플레이/i.test(t)) return 'VMD·팝업';
  if (/전시|박람회|부스|박물관|홍보관|체험관|MICE|컨벤션/i.test(t)) return '전시';
  if (/호텔|숙박|리조트|레지던스|스테이|hospitality/i.test(t)) return '호텔·숙박';
  if (/병원|의료|클리닉|의원|치과|한의원|메디컬/.test(t)) return '의료';
  if (/무대|세트\s*디자|방송|공연|행사\s*공간|이벤트\s*공간/.test(t)) return '무대·행사';
  if (/오피스|사무\s*공간|업무\s*공간|워크플레이스|공유\s*오피스/.test(t)) return '오피스';
  if (/학교|관공서|공공\s*기관|교육\s*시설|도서관|어린이집|유치원|놀이\s*공간/.test(t)) return '공공·교육';
  if (/가구|주방|부엌|키친|욕실|붙박이|드레스룸|수납|목공\s*디자/.test(t)) return '가구·제작';
  if (/주거|아파트|주택|홈\s*인테리어|세대|모델하우스|견본주택|주택홍보관|리모델링/.test(t)) return '주거';
  if (/상업|매장|카페|F&B|식음|레스토랑|상가|리테일|브랜드\s*공간|쇼룸|뷰티|미용실|헤어/i.test(t)) return '상업·F&B';
  return '실내디자인 일반';
}
/** 툴 사전: 공고 제목·직종 키워드·원문에서 찾는 단어 */
export const TOOLS = [
  ['CAD', /auto\s*cad|오토\s*캐드|캐드|(^|[^a-z])cad([^a-z]|$)/i],
  ['SketchUp', /sketch\s*-?\s*up|스케치업/i],
  ['3ds Max', /3ds\s*max|3d\s*max|3dsmax|맥스/i],
  ['Rhino', /rhino|라이노/i],
  ['Revit', /revit|레빗|레비트/i],
  ['V-Ray', /v-?ray|브이레이/i],
  ['Enscape', /enscape|엔스케이프/i],
  ['Lumion', /lumion|루미온/i],
  ['D5', /(^|[^a-z0-9])d5([^a-z0-9]|$)/i],
  ['Photoshop', /photoshop|포토샵/i],
  ['Illustrator', /illustrator|일러스트/i],
  ['InDesign', /indesign|인디자인/i],
  ['PPT', /(^|[^a-z])ppt([^a-z]|$)|power\s*point|파워포인트/i],
  ['3D툴', /3d\s*(디자인|모델링|설계|작업|프로그램|툴)|3d디자인/i],
  ['렌더링', /렌더링|rendering/i]
];
/** 텍스트에서 툴을 찾아 [{k, r}] 로. r: 2=공고 키워드(필수·우대 구분 없음) */
export function inferSkills(t) {
  t = String(t || '');
  const out = [];
  for (const [k, re] of TOOLS) if (re.test(t)) out.push({ k, r: 2 });
  const has = k => out.some(x => x.k === k);
  // 구체적인 3D·렌더 툴이 있으면 통칭은 뺌
  return out.filter(x => !(x.k === '3D툴' && ['SketchUp', '3ds Max', 'Rhino', 'Revit'].some(has)) && !(x.k === '렌더링' && ['V-Ray', 'Enscape', 'Lumion', 'D5'].some(has)));
}
export function classify(parts) {
  const o = { career: '', degree: '', condition: '', salary: '' };
  for (let p of parts) {
    p = clean(p); if (!p) continue;
    if (!o.career && /경력|신입/.test(p)) o.career = p;
    else if (!o.degree && /학력|대졸|초대졸|고졸|대학원|석사|박사/.test(p)) o.degree = p;
    else if (!o.condition && /정규직|계약직|인턴|파견|아르바이트|프리랜서|위촉|기간제|파트|비정규|무기계약|전일제|교육생/.test(p)) o.condition = p;
    else if (!o.salary && /만원|원$|면접\s*후|회사\s*내규|연봉|월급|시급/.test(p)) o.salary = p;
  }
  return o;
}
/** 관련도: 제목에 실내디자인 관련 단어가 있거나, 직종 키워드에만 있고 제목이 다른 직무 모집이 아닐 때 */
const TRADE = /시공팀\s*구인|기능공|미장|도장공|타일|도배|목수|필름\s*시공|조공|철거|마이크로\s*시멘트|줄눈|탄성\s*코트|방수|도기|샷시|에어컨/;
export function relevance(title, sector = '') {
  if (TRADE.test(title) && !/디자이너|디자인|설계|감리|소장|관리/.test(title)) return '';
  if (RELEVANT.test(title) && !/^(?=.*(영업|마케팅|회계|경리))(?!.*(디자이너|디자인|설계))/.test(title)) return 'strong';
  if (RELEVANT_SECTOR.test(sector) && /디자이너|디자인|설계|모집|채용|직원|신입|경력/.test(title) && !OTHER_JOB.test(title)) return 'sector';
  return '';
}

/* ── 사람인 검색 결과 ── */
export function parseSaramin(html) {
  const parts = html.split('class="item_recruit"').slice(1);
  if (!parts.length) throw new Error('사람인 검색 결과를 찾지 못했습니다');
  return parts.map(p => {
    const key = (p.match(/^\s*value="(\d+)"/) || p.match(/rec_idx=(\d+)/) || [])[1]; if (!key) return null;
    const tit = p.match(/<h2 class="job_tit">[\s\S]*?<a[^>]*title="([^"]*)"/);
    const cond = (p.match(/<div class="job_condition">([\s\S]*?)<\/div>/) || [])[1] || '';
    const spans = [...cond.matchAll(/<span>([\s\S]*?)<\/span>/g)].map(m => clean(m[1]));
    const sector = clean((p.match(/<div class="job_sector">([\s\S]*?)<\/div>/) || [])[1]);
    const hasRegion = spans[0] && !/경력|신입|학력|대졸|고졸|정규직|계약직|만원|원$/.test(spans[0]);
    return { key, title: decode(tit ? tit[1] : ''), org: clean((p.match(/<strong class="corp_name">([\s\S]*?)<\/strong>/) || [])[1]), region: hasRegion ? spans[0] : '', ...classify(hasRegion ? spans.slice(1) : spans), sector, postedText: (sector.match(/(등록|수정)일\s*([\d/]+)/) || [])[2] || '', deadlineText: clean((p.match(/<span class="date">([\s\S]*?)<\/span>/) || [])[1]), url: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=' + key };
  }).filter(Boolean);
}

/* ── 잡코리아 검색 결과: 카드(HTML) + 페이지에 함께 실린 공고 데이터(접수 기간·등록일) ── */
export function parseJobkorea(html) {
  const meta = {};
  const u = html.replace(/\\"/g, '"');
  for (const m of u.matchAll(/"id":"(\d+)","legacyJobNo":"?\d*"?,"title":"((?:[^"\\]|\\.)*)","createdAt":"([^"]*)"[\s\S]*?"applicationPeriod":(\{[^}]*\}|null)/g)) {
    if (meta[m[1]]) continue; let p = null; try { p = JSON.parse(m[4]); } catch { /* 형식이 바뀌면 날짜 없이 진행 */ }
    meta[m[1]] = { created: m[3], end: p && p.end };
  }
  const parts = html.split('shadow-list').slice(1);
  const seen = new Set(), rows = [];
  for (const p of parts) {
    const key = (p.match(/GI_Read\/(\d+)/) || [])[1]; if (!key || seen.has(key)) continue; seen.add(key);
    const leaves = [...p.matchAll(/<span class="([^"]*)"[^>]*>((?:[^<]|<!--[\s\S]*?-->)+)<\/span>/g)].map(m => ({ c: m[1], t: clean(m[2]) })).filter(l => l.t && !/sr-only/.test(l.c));
    const pick = re => leaves.filter(l => re.test(l.c)).map(l => l.t);
    const b4 = pick(/b4-14/), c1 = pick(/c1-13/), mt = meta[key] || {};
    const end = typeof mt.end === 'string' ? mt.end : '';
    rows.push({ key, title: pick(/b1-18/)[0] || '', org: pick(/b2-16/)[0] || '', region: b4[0] || '', sector: b4[1] || '', ...classify(c1.concat(b4.slice(2))), salary: b4.find(t => /만원|연봉|월급|시급/.test(t)) || '', benefit: c1.find(t => /보험|퇴직금|지원|연차|복지/.test(t)) || '',
      posted: (mt.created || '').slice(0, 10), deadline: end.slice(0, 10), deadlineTime: /T(\d{2}:\d{2})/.test(end) && !/T23:59/.test(end) ? end.match(/T(\d{2}:\d{2})/)[1] : '', deadlineLabel: end ? '' : (mt.created ? '상시 채용' : '접수 마감 원문 확인'),
      url: 'https://www.jobkorea.co.kr/Recruit/GI_Read/' + key });
  }
  if (!rows.length) throw new Error('잡코리아 검색 결과를 찾지 못했습니다');
  return rows;
}


export function makeItem(src, o, now = new Date()) {
  const d = dates(now);
  const dl = o.deadline !== undefined ? { deadline: o.deadline, label: o.deadlineLabel } : d.deadline(o.deadlineText || '');
  let location = normLocation(o.location || o.region);
  if (!location.includes(' ')) location = knownPlace(o.org + ' ' + o.title) || location;
  const region = (location || clean(o.region)).split(' ')[0] || '지역 확인';
  const skills = o.skills || inferSkills([o.title, o.sector || '', o.skillText || ''].join(' '));
  const bits = [o.org, region, o.career, o.degree, o.condition, dl.deadline ? '접수 마감 ' + dl.deadline : (dl.label || '접수 마감 원문 확인')].filter(Boolean);
  const item = {
    id: src.prefix + o.key, type: 'job', org: clean(o.org) || '기관명 확인', title: clean(o.title), region,
    field: inferField(o.title + ' ' + (o.sector || '')), condition: clean(o.condition) || '고용형태 원문 확인',
    career: clean(o.career) || '경력 원문 확인', degree: clean(o.degree) || '학력 확인',
    deadline: dl.deadline || '', posted: o.posted || (o.postedText ? d.posted(o.postedText) : ''), kind: '채용 공고',
    tags: [src.label, '자동 수집'].concat(o.official ? ['기관 공식 채용'] : [], o.salary ? [clean(o.salary).slice(0, 30)] : [], o.relevance === 'sector' ? ['직무 확인 필요'] : []),
    summary: (o.relevance === 'sector' ? '직종 분류로 찾은 공고예요. 실내·공간디자인 직무인지 원문에서 확인하세요. ' : '') + bits.join(' · '),
    qualification: o.qualification || '사용 툴·포트폴리오 등 세부 지원 자격은 원문에서 확인하세요.',
    benefit: o.benefit || (o.salary ? '급여 ' + clean(o.salary) + ' · 근무 조건은 원문 확인' : '급여·근무시간은 원문 확인 필요'),
    documents: o.documents || '이력서·포트폴리오 등 제출 서류와 양식은 원문에서 확인',
    source: src.label + (o.sourceOrg ? ' · ' + o.sourceOrg : ''), url: o.url, checked: d.today,
    sourceId: src.id, status: 'listed', lastVerifiedAt: now.toISOString()
  };
  if (skills.length) item.skills = skills;
  if (location && location.includes(' ')) item.location = location;
  if (o.startDate) item.startDate = o.startDate;
  if (o.deadlineTime) item.deadlineTime = o.deadlineTime;
  if (!dl.deadline && dl.label) item.deadlineLabel = dl.label;
  return item;
}

export function regionOf(s) {
  s = String(s || '');
  const pairs = [['서울', '서울'], ['부산', '부산'], ['대구', '대구'], ['인천', '인천'], ['광주', '광주'], ['대전', '대전'], ['울산', '울산'], ['세종', '세종'], ['경기', '경기'], ['강원', '강원'], ['충청북', '충북'], ['충북', '충북'], ['충청남', '충남'], ['충남', '충남'], ['전북', '전북'], ['전라북', '전북'], ['전남', '전남'], ['전라남', '전남'], ['경북', '경북'], ['경상북', '경북'], ['경남', '경남'], ['경상남', '경남'], ['제주', '제주'], ['수원', '경기'], ['성남', '경기'], ['군포', '경기'], ['고양', '경기'], ['용인', '경기'], ['춘천', '강원'], ['원주', '강원'], ['청주', '충북'], ['천안', '충남'], ['전주', '전북'], ['고흥', '전남'], ['순천', '전남'], ['목포', '전남'], ['포항', '경북'], ['창원', '경남'], ['양산', '경남'], ['경인', '경기']];
  const hit = pairs.map(([w, r]) => [s.indexOf(w), r]).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0])[0];
  return hit ? hit[1] : '';
}

/* ── 고용24 채용정보 검색(공개 화면) ── 고용24 직접 등록·인크루트 등 다른 출처 공고 포함 */
export function parseWork24(html) {
  const parts = html.split(/<tr id="list\d+">/).slice(1);
  if (!parts.length) { if (/검색결과가 없|조회된 데이터가 없/.test(html)) return []; throw new Error('고용24 검색 결과를 찾지 못했습니다'); }
  return parts.map(p => {
    const v = p.match(/id="chkboxWantedAuthNo\d+"\s+value="([^"]+)"/); if (!v) return null;
    const [key, type, org, ...t] = decode(v[1]).split('|');
    const href = (p.match(/href="(\/wk\/a\/b\/1500\/empDetailAuthView\.do\?[^"]+)"/) || [])[1];
    const spans = sel => [...(p.match(new RegExp('<li class="' + sel + '">([\\s\\S]*?)</li>')) || ['', ''])[1].matchAll(/<span class="item[^"]*">([\s\S]*?)<\/span>/g)].map(m => clean(m[1]));
    const date = (p.match(/var\s+date\s*=\s*'([\d-]*)'/) || [])[1] || (p.match(/마감일\s*:\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
    const wanted = /var\s+wantedYn\s*=\s*'Y'/.test(p) || /^2099/.test(date);
    return { key, type, org: clean(org), title: clean(t.join('|')), salary: spans('dollar')[0] || '', career: spans('member')[0] || '', degree: spans('member')[1] || '', hours: spans('time').join(' · '),
      address: clean((p.match(/<li class="site">([\s\S]*?)<\/li>/) || [])[1]), deadline: wanted ? '' : date, deadlineLabel: wanted ? '채용시' : '',
      posted: (p.match(/등록일\s*:\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || '', url: href ? 'https://www.work24.go.kr' + decode(href) : '' };
  }).filter(Boolean);
}


const PROVINCE = { 서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 세종시: '세종', 경기도: '경기', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주도: '제주', 제주특별자치도: '제주', 전남광주통합특별시: '전남광주' };
const PROVINCES = new Set(['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '전남광주']);
/** "경기도 수원시 팔달구 …" → "경기 수원시 팔달구" (광역 + 시·군·구 + 구·읍·면까지) */
export function normLocation(s) {
  const toks = clean(s).replace(/[()[\]]/g, ' ').split(/[\s,]+/).filter(Boolean);
  if (!toks.length) return '';
  const first = PROVINCE[toks[0]] || toks[0];
  if (!PROVINCES.has(first)) return '';
  const out = [first];
  for (const t of toks.slice(1)) { if (out.length >= 3 || !/^[가-힣]+(시|군|구|읍|면)$/.test(t)) break; out.push(t); }
  return out.join(' ');
}
/** 기관 소재지(자주 나오는 공공·대형 병원). 더 구체적인 이름을 먼저 둔다 */
/** 기관 소재지(근무지 정보가 없을 때 쓰는 보조 사전). 필요하면 ['회사명 일부', '시·도 시·군·구'] 형식으로 추가 */
const KNOWN_PLACES = [];
export function knownPlace(text) {
  text = String(text || '');
  if (/\[세종\]/.test(text)) return '세종';
  const hit = KNOWN_PLACES.find(([k]) => text.includes(k));
  return hit ? hit[1] : '';
}

/* ── 월간 SPACE(공간) 구인 게시판: 설계사무소·디자인 스튜디오 공고 (EUC-KR) ── */
export function parseVmspaceList(html) {
  const parts = html.split('job-list-border display-flex').slice(1);
  if (!parts.length) throw new Error('SPACE 구인 목록을 찾지 못했습니다');
  const seen = new Set(), rows = [];
  for (const p of parts) {
    const seq = (p.match(/job_view\.html\?base_seq=([A-Za-z0-9%=+/]+)/) || [])[1]; if (!seq) continue;
    const key = decodeURIComponent(seq).replace(/=+$/, ''); if (seen.has(key)) continue; seen.add(key);
    const org = clean((p.match(/<h4[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    const title = clean((p.match(/<p class="lead">\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    const period = clean((p.match(/futura-light[^>]*>([\s\S]*?)<\/p>/) || [])[1]);
    const career = clean((p.match(/<!--[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?-->/) || [])[1]);
    rows.push({ key, seq: decodeURIComponent(seq), org, title, period, career, url: 'https://vmspace.com/job/job_view.html?base_seq=' + encodeURIComponent(decodeURIComponent(seq)) });
  }
  return rows;
}
export function parseVmspaceDetail(html) {
  const field = name => clean((html.match(new RegExp('<div>' + name + '</div>\\s*<span>([\\s\\S]*?)</span>')) || [])[1]).replace(/\u00a0/g, ' ').trim();
  const body = text((html.match(/<div class="job-archive">([\s\S]*?)<div class="job-summary2/) || [])[1] || '');
  return { body, period: field('모집기간'), part: field('모집분야'), condition: field('모집유형'), degree: field('학력'), career: field('경력'), industry: field('업종'), address: field('주소') };
}
/** 공고 원문에서 툴을 찾고, 자격요건·주요업무 쪽이면 r=1(필수·업무), 우대사항 쪽이면 r=0(우대) */
export function inferSkillsDetailed(body) {
  const lines = String(body || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
  const found = new Map(); let mode = 'req';
  for (const l of lines) {
    const head = l.length <= 40 && /^[\[■□●◆▶◎○※#\d.\-·•( ]*/.test(l);
    if (head && /우대/.test(l)) mode = 'pref';
    else if (head && /자격|요건|필수|주요\s*업무|담당\s*업무|업무\s*내용|하는\s*일|모집\s*분야/.test(l)) mode = 'req';
    else if (head && /근무|조건|복리|혜택|전형|절차|접수|지원\s*방법|제출|기타|회사\s*소개/.test(l)) mode = 'other';
    const r = /우대|가능자|이면\s*좋|plus/i.test(l) && !/필수/.test(l) ? 0 : mode === 'pref' ? 0 : 1;
    for (const s of inferSkills(l)) { const prev = found.get(s.k); if (prev === undefined || r > prev) found.set(s.k, r); }
  }
  return [...found].map(([k, r]) => ({ k, r }));
}
