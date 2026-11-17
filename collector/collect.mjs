#!/usr/bin/env node
// 스페이스패스 자동 수집기 — Node 20 이상, 외부 패키지 없음.
// 사용: node collector/collect.mjs            (feed.json 갱신)
//       node collector/collect.mjs --dry-run  (저장하지 않고 결과만 출력)
import { readFile, writeFile } from 'node:fs/promises';
import { parseSaramin, parseJobkorea, parseWork24, parseVmspaceList, parseVmspaceDetail, inferSkillsDetailed, makeItem, relevance, dates, regionOf, normLocation, knownPlace, RELEVANT } from './parsers.mjs';

const FEED = new URL('../feed.json', import.meta.url);
const CONFIG = new URL('./config.json', import.meta.url);
const DRY = process.argv.includes('--dry-run');
const REPO = process.env.GITHUB_REPOSITORY || '';
// 정직하게 자신을 밝히는 User-Agent (사이트 정책을 우회하지 않음)
const UA = `Mozilla/5.0 (compatible; SpacepathCollector/1.0; personal job alert${REPO ? '; +https://github.com/' + REPO : ''})`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, tries = 2, opts = {}) {
  for (let i = 1; ; i++) {
    try { return await getOnce(url, opts); }
    catch (e) { if (i >= tries || /응답 오류 \((4\d\d)\)/.test(e.message)) throw e; await sleep(4000); } // 일시적인 연결 실패만 한 번 더
  }
}
async function getOnce(url, opts = {}) {
  const res = await fetch(url, { method: opts.method || 'GET', body: opts.body, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ko-KR,ko;q=0.9', ...(opts.body ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}) }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`원문 응답 오류 (${res.status})`);
  if (opts.encoding) return new TextDecoder(opts.encoding).decode(await res.arrayBuffer());
  return res.text();
}

// 검색어: 실내디자인과 졸업생이 지원하는 직무를 넓게 덮도록 여러 개를 돌림
const KEYWORDS = {
  saramin: ['실내디자인', '인테리어 디자이너', '인테리어 설계', '공간디자이너', '전시디자인', 'VMD'],
  jobkorea: ['실내디자인', '인테리어 설계', '공간디자이너', '전시디자인', 'VMD'],
  work24: ['실내디자인', '인테리어 디자이너', '인테리어 설계', '공간디자인']
};
const URLS = {
  saramin: kw => `https://www.saramin.co.kr/zf_user/search/recruit?searchword=${encodeURIComponent(kw)}&recruitPageCount=100&recruitSort=reg_dt`,
  jobkorea: kw => `https://www.jobkorea.co.kr/Search/?stext=${encodeURIComponent(kw)}&tabType=recruit`,
  work24: 'https://www.work24.go.kr/wk/a/b/1200/retriveDtlEmpSrchListInPost.do',
  vmspace: 'https://vmspace.com/job/job.html'
};
// 스페이스패스는 채용 공고만 다룹니다(대학원 수집 없음).
const GRAD_CLOSE_MISSING = new Set();
const REUSE_ID_BY_URL = new Set();

const keep = (rows, src) => rows.map(o => ({ ...o, relevance: relevance(o.title, o.sector) })).filter(o => o.relevance).map(o => makeItem(src, o));
/** 검색어마다 결과를 모아 공고 번호로 중복 제거. 한 검색어가 실패해도 나머지는 계속 */
async function each(words, fn) {
  const rows = new Map(); let ok = 0, lastErr;
  for (const kw of words) {
    try { for (const r of await fn(kw)) if (!rows.has(r.key)) rows.set(r.key, r); ok++; }
    catch (e) { lastErr = e; }
    await sleep(800);
  }
  if (!ok) throw lastErr || new Error('검색 결과를 가져오지 못했습니다');
  return [...rows.values()];
}
const ymdDot = s => { const m = [...String(s).matchAll(/(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})/g)].map(x => `${x[1]}-${x[2].padStart(2, '0')}-${x[3].padStart(2, '0')}`); return { start: m[0] || '', end: m[1] || '' }; };
const careerText = s => { s = String(s || '').replace(/\s+/g, ' ').trim(); if (!s) return ''; if (/무관/.test(s)) return '경력무관'; if (/^신입$/.test(s)) return '신입'; return /경력|신입/.test(s) ? s : '경력 ' + s; };

const COLLECTORS = {
  async saramin() {
    const rows = await each(KEYWORDS.saramin, async kw => parseSaramin(await get(URLS.saramin(kw))));
    return keep(rows, { id: 'saramin', label: '사람인', prefix: 'saramin-' });
  },
  async jobkorea() {
    const rows = await each(KEYWORDS.jobkorea, async kw => parseJobkorea(await get(URLS.jobkorea(kw))));
    return keep(rows, { id: 'jobkorea', label: '잡코리아', prefix: 'jobkorea-' });
  },
  async work24() {
    // 고용24 공개 검색(최신순). 사람인·잡코리아에서 온 공고는 이미 따로 모으므로 제외하고, 고용24 직접 등록·인크루트 등만 사용
    const src = { id: 'work24', label: '고용24', prefix: 'work24-' };
    const PROVIDER = { VALIDATION: '고용24 직접 등록', CIN: '인크루트 제공' };
    const rows = await each(KEYWORDS.work24, async kw => parseWork24(await get(URLS.work24, 2, { method: 'POST', body: new URLSearchParams({ keyword: kw, srcKeyword: kw, searchMode: 'Y', resultCnt: '50', pageIndex: '1', sortField: 'DATE', sortOrderBy: 'DESC' }) })));
    return rows.filter(r => !['CSI', 'CJK'].includes(r.type)).map(r => ({ ...r, relevance: relevance(r.title) })).filter(r => r.relevance)
      .map(r => makeItem(src, { ...r, region: regionOf(r.address), location: normLocation(r.address), condition: '', sourceOrg: PROVIDER[r.type] || '', benefit: [r.salary && '급여 ' + r.salary, r.hours, r.address && '근무지 ' + r.address].filter(Boolean).join(' · ') || undefined }));
  },
  async vmspace() {
    // 월간 SPACE(공간) 구인: 건축사무소 공고가 대부분이라 인테리어·공간디자인 공고만 상세를 열어 확인
    const src = { id: 'vmspace', label: 'SPACE(공간)', prefix: 'vmspace-' };
    const { today } = dates();
    const rows = parseVmspaceList(await get(URLS.vmspace, 2, { encoding: 'euc-kr' })).filter(r => r.title && r.period);
    const candidates = rows.filter(r => { const p = ymdDot(r.period); return (!p.end || p.end >= today) && (RELEVANT.test(r.title + ' ' + r.org) || !/건축사사무소|건축사 사무소|건축연구소|도시건축/.test(r.org)); });
    const out = [];
    for (const r of candidates.slice(0, 20)) {
      let d; try { await sleep(700); d = parseVmspaceDetail(await get(r.url, 2, { encoding: 'euc-kr' })); } catch { continue; }
      const hay = [r.title, d.part, d.industry].join(' ');
      const rel = RELEVANT.test(hay) ? 'strong' : /인테리어\s*(설계|디자인|디자이너)|실내\s*(디자인|건축\s*설계)|공간\s*(디자이너|디자인)|전시\s*디자인/.test(d.body) ? 'sector' : '';
      if (!rel) continue;
      const p = ymdDot(d.period || r.period);
      const addr = d.address.replace(/^\d{5}\s*/, '');
      const reqLines = d.body.split('\n').filter(l => /자격|필수|가능자|능숙|전공|경력|우대|포트폴리오/.test(l) && l.length < 160).slice(0, 8).join('\n');
      out.push(makeItem(src, { key: r.key, title: r.title, org: r.org, region: regionOf(addr), location: normLocation(addr), sector: [d.part, d.industry].join(' '), relevance: rel,
        condition: d.condition, career: careerText(d.career || r.career), degree: d.degree, startDate: p.start || undefined, posted: p.start, deadline: p.end, deadlineLabel: p.end ? '' : '채용 시 마감',
        skills: inferSkillsDetailed(d.body), qualification: reqLines || undefined, url: r.url, sourceOrg: d.industry ? d.industry.slice(0, 30) : '' }));
    }
    return out;
  }
};

// ── 병합: 상세 정보가 더 풍부한 기존 값은 유지, 마감일·고용형태가 바뀌면 changedAt 기록 ──
const GENERIC = /원문\s*확인|확인\s*필요|확인하세요|^지역 확인$|^학력 확인$|^기관명 확인$/;
function merge(old, n, nowIso) {
  if (!old) return { ...n, firstSeenAt: nowIso };
  if (n.type === 'grad') { // 대학원은 수집기가 만든 설명이 기준: 새 값으로 덮어쓰고 변경만 기록
    const out = { ...old, ...n, firstSeenAt: old.firstSeenAt || nowIso };
    delete out.closedReason;
    if ((old.deadline || '') !== (n.deadline || '') && old.deadline) out.changedAt = nowIso;
    return out;
  }
  const out = { ...old }; let changed = false;
  for (const [k, v] of Object.entries(n)) {
    const ov = old[k];
    if (k === 'tags') { if (!(ov || []).length) out.tags = v; continue; }
    if (k === 'skills') { if (!(ov || []).length || (v || []).some(s => s.r !== 2)) out.skills = v; continue; } // 원문 기준(필수·우대 구분) 툴 정보를 키워드보다 우선
    if (typeof v === 'string' && GENERIC.test(v) && ov && !GENERIC.test(String(ov))) continue;
    if (['summary', 'qualification', 'benefit', 'documents', 'field', 'kind', 'career', 'degree'].includes(k) && ov && !GENERIC.test(String(ov)) && !(k === 'qualification' && String(v).length > String(ov).length)) continue;
    if (['deadline', 'condition'].includes(k) && ov && v && ov !== v) changed = true;
    out[k] = v;
  }
  if (old.deadline && n.deadline && old.deadline !== n.deadline && typeof out.summary === 'string') out.summary = out.summary.split(old.deadline).join(n.deadline);
  if (old.status === 'closed' && old.closedReason !== 'deadline') { out.status = 'listed'; delete out.closedReason; }
  if (changed) out.changedAt = nowIso;
  return out;
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG, 'utf8').catch(() => '{}'));
  const enabled = { ...Object.fromEntries(Object.keys(COLLECTORS).map(k => [k, true])), ...(config.sources || {}) };
  const feed = JSON.parse(await readFile(FEED, 'utf8'));
  const now = new Date(), nowIso = now.toISOString();
  const byId = new Map(feed.items.map(x => [x.id, x]));
  const prevStatus = new Map((feed.sources || []).map(s => [s.id, s]));
  let added = 0, changed = 0, ok = 0, fail = 0;
  const statuses = [];
  for (const [id, run] of Object.entries(COLLECTORS)) {
    const prev = prevStatus.get(id) || { id };
    if (!enabled[id]) { statuses.push({ ...prev, id, status: 'skipped', checkedAt: nowIso, count: 0, message: '설정에서 자동 수집을 끈 출처입니다' }); continue; }
    try {
      const items = await run();
      if (REUSE_ID_BY_URL.has(id)) for (const n of items) if (!byId.has(n.id)) { const same = [...byId.values()].filter(x => x.sourceId === id && x.url === n.url); if (same.length === 1) n.id = same[0].id; }
      for (const n of items) { const old = byId.get(n.id); const m = merge(old, n, nowIso); if (!old) added++; else if (m.changedAt === nowIso) changed++; byId.set(n.id, m); }
      if (GRAD_CLOSE_MISSING.has(id)) { const seen = new Set(items.map(n => n.id)); for (const x of byId.values()) if (x.sourceId === id && !seen.has(x.id) && x.status !== 'closed') byId.set(x.id, { ...x, status: 'closed', closedReason: 'replaced', changedAt: nowIso }); }
      statuses.push({ ...prev, id, status: 'success', checkedAt: nowIso, count: items.length, message: '공개 페이지 확인 완료', lastSuccessAt: nowIso });
      ok++; console.log(`✓ ${id}: ${items.length}건`);
    } catch (e) {
      statuses.push({ ...prev, id, status: 'failed', checkedAt: nowIso, count: 0, message: String(e?.message || e).slice(0, 200) });
      fail++; console.log(`✗ ${id}: ${e?.message || e}`);
    }
  }
  // 자동 수집하지 않는 출처(직접 확인·수동 정리 자료)는 기존 자료를 유지
  for (const s of feed.sources || []) if (!COLLECTORS[s.id] && s.status !== 'manual') statuses.push({ ...s, status: 'skipped', message: '자동 수집 대상이 아니어서 기존 자료를 유지합니다' });
  for (const s of feed.sources || []) if (s.status === 'manual') statuses.push(s);

  // 근무지 상세가 없는 기존 항목은 기관 소재지 사전으로 채움
  for (const [id, x] of byId) if (!x.location && x.type !== 'grad') { const loc = knownPlace(x.org + ' ' + x.title); if (loc) byId.set(id, { ...x, location: loc }); }
  // 오래된 자료 정리: 마감 60일 경과, 또는 마감일 없이 60일 넘게 다시 확인되지 않은 채용 공고
  const { today } = dates(now);
  const cutoff = new Date(Date.parse(today + 'T00:00:00+09:00') - 60 * 86400000).toISOString().slice(0, 10);
  const items = [...byId.values()].filter(x => x.type === 'grad' ? !(x.status === 'closed' && x.closedReason === 'replaced' && (x.changedAt || nowIso).slice(0, 10) < cutoff) : x.type !== 'job' || (x.deadline ? x.deadline >= cutoff : (x.lastVerifiedAt || x.firstSeenAt || nowIso).slice(0, 10) >= cutoff));

  const next = {
    ...feed, schemaVersion: feed.schemaVersion || 1, collectorVersion: 'spacepath-gh-1', revision: globalThis.crypto.randomUUID(),
    items, sources: statuses, lastAttemptAt: nowIso, lastSuccessAt: ok ? nowIso : feed.lastSuccessAt,
    previousSuccessAt: ok ? feed.lastSuccessAt : feed.previousSuccessAt,
    status: fail === 0 ? 'success' : ok ? 'partial' : 'failed', added, changed,
    schedule: { enabled: true, time: '08:23', timezone: 'Asia/Seoul', via: 'github-actions', repo: REPO }
  };
  delete next.snapshotNote;
  console.log(`결과: ${next.status} · 신규 ${added}건 · 변경 ${changed}건 · 전체 ${items.length}건`);
  if (DRY) return;
  await writeFile(FEED, JSON.stringify(next, null, 1) + '\n', 'utf8');
  if (!ok) process.exitCode = 1; // 모든 출처 실패 시 Actions에 실패로 표시(이메일 알림)
}
main().catch(e => { console.error(e); process.exitCode = 1; });
