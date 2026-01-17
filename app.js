/* NC Building Contractor Practice Exam — local-only quiz app */

const STORAGE_KEY = 'nc_quiz_session_v1';
const MISSED_KEY  = 'nc_quiz_missed_v1';
const FLAGGED_KEY = 'nc_quiz_flagged_v1';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const views = {
  setup: $('#viewSetup'),
  quiz: $('#viewQuiz'),
  results: $('#viewResults'),
};

const els = {
  totalCount: $('#totalCount'),
  modeHint: $('#modeHint'),
  modeSegs: $$('.seg'),
  questionCount: $('#questionCount'),
  shuffle: $('#shuffle'),
  shuffleChoices: $('#shuffleChoices'),
  showExplanation: $('#showExplanation'),
  examOptions: $('#examOptions'),
  examMinutes: $('#examMinutes'),

  btnStart: $('#btnStart'),
  btnResume: $('#btnResume'),
  btnHome: $('#btnHome'),
  btnReset: $('#btnReset'),

  progressText: $('#progressText'),
  progressFill: $('#progressFill'),
  timerText: $('#timerText'),

  qId: $('#qId'),
  qText: $('#qText'),
  choices: $('#choices'),
  feedback: $('#feedback'),
  qFlags: $('#qFlags'),
  flagCount: $('#flagCount'),
  saveStatus: $('#saveStatus'),

  btnPrev: $('#btnPrev'),
  btnNext: $('#btnNext'),
  btnReveal: $('#btnReveal'),
  btnFlag: $('#btnFlag'),
  btnPause: $('#btnPause'),

  scoreText: $('#scoreText'),
  correctText: $('#correctText'),
  incorrectText: $('#incorrectText'),
  blankText: $('#blankText'),
  reviewList: $('#reviewList'),
  btnReviewMissed: $('#btnReviewMissed'),
  btnReviewFlagged: $('#btnReviewFlagged'),
  btnBackSetup: $('#btnBackSetup'),
  search: $('#search'),
  filter: $('#filter'),
};

let ALL_QUESTIONS = [];
let session = null;
let timerHandle = null;

function nowIso(){ return new Date().toISOString(); }

function loadLocal(key, fallback){
  try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch{ return fallback; }
}
function saveLocal(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

function shuffleInPlace(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}

function formatTime(sec){
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s/60);
  const r = s%60;
  return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
}

function setView(name){
  Object.entries(views).forEach(([k,el]) => el.classList.toggle('hidden', k!==name));
}

function setMode(mode){
  session = session || {};
  session.mode = mode;
  els.modeSegs.forEach(b => {
    const active = b.dataset.mode === mode;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  els.examOptions.style.opacity = (mode==='exam') ? '1' : '.55';
  els.examOptions.style.pointerEvents = (mode==='exam') ? 'auto' : 'none';
  els.btnReveal.classList.toggle('hidden', mode!=='practice');
  els.modeHint.textContent = mode==='practice'
    ? 'Practice gives instant feedback after each question.'
    : 'Exam mode hides feedback until the end (timer optional).';
}

function rebuildResumeButton(){
  const saved = loadLocal(STORAGE_KEY, null);
  els.btnResume.disabled = !saved;
  els.btnResume.textContent = saved ? `Resume saved session (${saved.mode || 'practice'})` : 'Resume saved session';
}

function getMissedSet(){ return new Set(loadLocal(MISSED_KEY, [])); }
function setMissedSet(set){ saveLocal(MISSED_KEY, Array.from(set)); }
function getFlaggedSet(){ return new Set(loadLocal(FLAGGED_KEY, [])); }
function setFlaggedSet(set){ saveLocal(FLAGGED_KEY, Array.from(set)); }

function chooseQuestionPool(countMode){
  const missed = getMissedSet();
  const flagged = getFlaggedSet();

  if(countMode==='missed'){
    return ALL_QUESTIONS.filter(q => missed.has(q.id));
  }
  if(countMode==='flagged'){
    return ALL_QUESTIONS.filter(q => flagged.has(q.id));
  }
  return ALL_QUESTIONS.slice();
}

function startSession(opts){
  const basePool = chooseQuestionPool(opts.countMode);
  if(basePool.length===0){
    alert('No questions found for that set yet. Try answering a few questions first.');
    return;
  }

  let pool = basePool.slice();
  if(opts.shuffle) shuffleInPlace(pool);

  let limit = pool.length;
  if(opts.countMode !== 'all' && opts.countMode !== 'missed' && opts.countMode !== 'flagged'){
    limit = Math.min(pool.length, Number(opts.countMode));
  }
  pool = pool.slice(0, limit);

  session = {
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    sourceTotal: ALL_QUESTIONS.length,
    mode: opts.mode,
    settings: opts,
    questionIds: pool.map(q => q.id),
    index: 0,
    answers: {},      // { [id]: number[] }
    revealed: {},     // { [id]: true }
    startedAt: nowIso(),
    exam: opts.mode==='exam' ? { durationSec: Math.max(60, Math.floor(opts.examMinutes*60)), remainingSec: Math.max(60, Math.floor(opts.examMinutes*60)) } : null,
  };

  persistSession('Started');
  openQuiz();
}

function persistSession(statusText){
  if(!session) return;
  session.updatedAt = nowIso();
  saveLocal(STORAGE_KEY, session);
  els.saveStatus.textContent = `${statusText} • ${new Date().toLocaleTimeString()}`;
}

function loadQuestionsByIds(ids){
  const map = new Map(ALL_QUESTIONS.map(q => [q.id, q]));
  return ids.map(id => map.get(id)).filter(Boolean);
}

function openQuiz(){
  stopTimer();
  setView('quiz');
  renderFlagCount();

  if(session?.mode==='exam'){
    els.timerText.classList.remove('hidden');
    startTimer();
  } else {
    els.timerText.classList.add('hidden');
  }

  renderQuestion();
}

function startTimer(){
  if(!session?.exam) return;
  const tick = () => {
    session.exam.remainingSec -= 1;
    els.timerText.textContent = `⏱ ${formatTime(session.exam.remainingSec)}`;
    if(session.exam.remainingSec <= 0){
      persistSession('Time');
      finishSession(true);
      return;
    }
    if(session.exam.remainingSec % 5 === 0) persistSession('Autosaved');
  };
  els.timerText.textContent = `⏱ ${formatTime(session.exam.remainingSec)}`;
  timerHandle = setInterval(tick, 1000);
}

function stopTimer(){
  if(timerHandle){ clearInterval(timerHandle); timerHandle = null; }
}

function currentQuestion(){
  const ids = session.questionIds;
  const id = ids[session.index];
  return ALL_QUESTIONS.find(q => q.id===id);
}

function renderFlagCount(){
  els.flagCount.textContent = String(getFlaggedSet().size);
}

function renderQuestion(){
  const q = currentQuestion();
  if(!q){ finishSession(false); return; }

  const total = session.questionIds.length;
  const n = session.index + 1;

  els.progressText.textContent = `Question ${n} of ${total}`;
  els.progressFill.style.width = `${Math.round((n/total)*100)}%`;

  els.qId.textContent = `#${q.id}`;
  els.qText.textContent = q.question;

  const flagged = getFlaggedSet();
  els.qFlags.textContent = flagged.has(q.id) ? 'Flagged' : '';

  els.btnPrev.disabled = session.index===0;

  // Prepare choices (optionally shuffled but stable per question within a session)
  const key = `choiceOrder_${q.id}`;
  session.choiceOrder = session.choiceOrder || {};
  if(!session.choiceOrder[key]){
    const order = q.choices.map((_,idx)=>idx);
    if(session.settings.shuffleChoices) shuffleInPlace(order);
    session.choiceOrder[key] = order;
  }
  const order = session.choiceOrder[key];

  // Render
  els.choices.innerHTML = '';
  const chosen = session.answers[q.id] || [];
  const revealed = !!session.revealed[q.id];

  order.forEach((origIdx, pos) => {
    const letter = String.fromCharCode(65+pos);
    const text = q.choices[origIdx];

    const div = document.createElement('div');
    div.className = 'choice';
    div.dataset.origIndex = String(origIdx);
    div.innerHTML = `<div class="letter">${letter}</div><div class="text"></div>`;
    div.querySelector('.text').textContent = text;

    if(chosen.includes(origIdx)) div.classList.add('selected');

    div.addEventListener('click', () => {
      selectChoice(q, origIdx);
    });

    els.choices.appendChild(div);
  });

  // Feedback visibility
  els.feedback.classList.add('hidden');
  els.feedback.classList.remove('good','bad');

  const canGoNext =
  chosen.length > 0 ||
  session.mode === 'exam' ||
  session.mode === 'practice';
  
  els.btnNext.disabled = !canGoNext;

  els.btnReveal.classList.toggle('hidden', session.mode!=='practice');
  els.btnReveal.disabled = revealed;

  if(session.mode==='practice' && (revealed || chosen.length>0)){
    showFeedback(q);
  }

  persistSession('Rendered');
}

function selectChoice(q, origIdx){
  // Single-answer by default
  const isMulti = !!q.multi;
  let chosen = session.answers[q.id] || [];

  if(isMulti){
    chosen = chosen.includes(origIdx) ? chosen.filter(x=>x!==origIdx) : [...chosen, origIdx];
  } else {
    chosen = [origIdx];
  }

  session.answers[q.id] = chosen;

  // Update UI
  $$('#choices .choice').forEach(el => {
    const idx = Number(el.dataset.origIndex);
    el.classList.toggle('selected', chosen.includes(idx));
  });

  els.btnNext.disabled = (chosen.length===0 && session.mode!=='exam');

  if(session.mode==='practice'){
    showFeedback(q);
  }

  persistSession('Saved');
}

function showFeedback(q){
  const chosen = session.answers[q.id] || [];
  const correct = q.correct;

  const isCorrect = (chosen.length===correct.length) && chosen.every(x => correct.includes(x));
  const revealed = !!session.revealed[q.id] || chosen.length>0;

  // Mark choices
  $$('#choices .choice').forEach(el => {
    const idx = Number(el.dataset.origIndex);
    el.classList.remove('correct','incorrect');
    if(!revealed) return;

    if(correct.includes(idx)) el.classList.add('correct');
    if(chosen.includes(idx) && !correct.includes(idx)) el.classList.add('incorrect');
  });

  // Feedback box
  els.feedback.classList.remove('hidden');
  els.feedback.classList.toggle('good', isCorrect);
  els.feedback.classList.toggle('bad', !isCorrect);

  const correctLetters = correct.map(c => {
    // map original index -> displayed letter
    const order = session.choiceOrder[`choiceOrder_${q.id}`];
    const pos = order.indexOf(c);
    return pos>=0 ? String.fromCharCode(65+pos) : '?';
  });

  const chosenLetters = chosen.map(c => {
    const order = session.choiceOrder[`choiceOrder_${q.id}`];
    const pos = order.indexOf(c);
    return pos>=0 ? String.fromCharCode(65+pos) : '?';
  });

  const why = (session.settings.showExplanation && q.explanation) ? `<div class="muted small" style="margin-top:8px">${escapeHtml(q.explanation)}</div>` : '';

  els.feedback.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
      <div><strong>${isCorrect ? 'Correct' : 'Incorrect'}</strong></div>
      <div class="muted small">Your answer: ${chosenLetters.length? chosenLetters.join(', ') : '—'} • Correct: ${correctLetters.join(', ')}</div>
    </div>
    ${why}
  `;
}

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function go(delta){
  session.index = Math.min(Math.max(0, session.index + delta), session.questionIds.length-1);
  persistSession('Moved');
  renderQuestion();
}

function reveal(){
  const q = currentQuestion();
  if(!q) return;
  session.revealed[q.id] = true;
  persistSession('Revealed');
  showFeedback(q);
  els.btnReveal.disabled = true;
}

function flagToggle(){
  const q = currentQuestion();
  if(!q) return;
  const flagged = getFlaggedSet();
  if(flagged.has(q.id)) flagged.delete(q.id); else flagged.add(q.id);
  setFlaggedSet(flagged);
  renderFlagCount();
  els.qFlags.textContent = flagged.has(q.id) ? 'Flagged' : '';
}

function pause(){
  persistSession('Paused');
  stopTimer();
  alert('Saved. You can resume from the Home screen.');
  setView('setup');
  rebuildResumeButton();
}

function finishSession(fromTimer){
  stopTimer();
  // Build stats
  const qs = loadQuestionsByIds(session.questionIds);
  let correctN=0, incorrectN=0, blankN=0;

  const missed = getMissedSet();

  const items = qs.map(q => {
    const chosen = session.answers[q.id] || [];
    const isBlank = chosen.length===0;
    const isCorrect = !isBlank && chosen.length===q.correct.length && chosen.every(x=>q.correct.includes(x));

    if(isBlank) blankN++;
    else if(isCorrect) correctN++;
    else incorrectN++;

    // track missed
    if(!isCorrect) missed.add(q.id);

    return { q, chosen, isCorrect, isBlank };
  });

  setMissedSet(missed);

  const total = qs.length;
  const pct = total ? Math.round((correctN/total)*100) : 0;

  els.scoreText.textContent = `${pct}%`;
  // Pass / Fail
  const threshold = Number(window.PASS_THRESHOLD ?? 70);
  const passFailEl = document.getElementById('passFailText');
  if(passFailEl){
    passFailEl.textContent = pct >= threshold ? `PASS \u2705 (\u2265 ${threshold}%)` : `FAIL \u274c (< ${threshold}%)`;
  }
  els.correctText.textContent = String(correctN);
  els.incorrectText.textContent = String(incorrectN);
  els.blankText.textContent = String(blankN);

  // Store last results for filtering/review
  session.lastResults = { items: items.map(it => ({
    id: it.q.id,
    isCorrect: it.isCorrect,
    isBlank: it.isBlank,
    chosen: it.chosen,
  }))};

  persistSession(fromTimer ? 'Finished (time)' : 'Finished');

  // Clear active session so Start begins fresh, but keep results for review.
  // Keep saved session so user can revisit review list even after refresh.
  setView('results');
  renderReviewList();
  rebuildResumeButton();
}

function renderReviewList(){
  const ids = session.questionIds;
  const map = new Map((session.lastResults?.items || []).map(r => [r.id, r]));
  const flagged = getFlaggedSet();

  const query = (els.search.value || '').trim().toLowerCase();
  const filter = els.filter.value;

  const qs = loadQuestionsByIds(ids)
    .map(q => ({ q, r: map.get(q.id) }))
    .filter(({q,r}) => {
      const text = `${q.question} ${q.choices.join(' ')}`.toLowerCase();
      if(query && !text.includes(query)) return false;

      if(filter==='missed') return r && !r.isCorrect;
      if(filter==='flagged') return flagged.has(q.id);
      if(filter==='correct') return r && r.isCorrect;
      if(filter==='blank') return r && r.isBlank;
      return true;
    });

  els.reviewList.innerHTML = '';

  qs.forEach(({q,r}) => {
    const isBlank = r?.isBlank ?? true;
    const isCorrect = r?.isCorrect ?? false;
    const isFlagged = flagged.has(q.id);

    const div = document.createElement('div');
    div.className = 'review-item';

    const badge = isBlank ? ['Unanswered','warn'] : (isCorrect ? ['Correct','good'] : ['Missed','bad']);

    const correctText = q.correct.map(i => q.choices[i]).join(' | ');
    const chosenText = (r?.chosen?.length)
      ? r.chosen.map(i => q.choices[i]).join(' | ')
      : '—';

    div.innerHTML = `
      <div class="meta">
        <span class="badge ${badge[1]}">${badge[0]}</span>
        ${isFlagged ? '<span class="badge">Flagged</span>' : ''}
        <span class="badge">#${q.id}</span>
      </div>
      <h4>${escapeHtml(q.question)}</h4>
      <div class="muted small">Your answer: ${escapeHtml(chosenText)}</div>
      <div class="muted small">Correct: ${escapeHtml(correctText)}</div>
      <div class="row gap" style="margin-top:10px">
        <button class="btn btn-ghost" data-act="toggleFlag" data-id="${q.id}">${isFlagged ? 'Unflag' : 'Flag'}</button>
        <button class="btn" data-act="practiceOne" data-id="${q.id}">Practice this</button>
      </div>
    `;

    els.reviewList.appendChild(div);
  });

  // Wire buttons
  $$('#reviewList button').forEach(b => {
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      const id = Number(b.dataset.id);
      if(act==='toggleFlag'){
        const set = getFlaggedSet();
        if(set.has(id)) set.delete(id); else set.add(id);
        setFlaggedSet(set);
        renderFlagCount();
        renderReviewList();
      }
      if(act==='practiceOne'){
        // new short session
        startSession({
          mode: 'practice',
          countMode: '1',
          shuffle: false,
          shuffleChoices: true,
          showExplanation: !!els.showExplanation.checked,
          examMinutes: Number(els.examMinutes.value||60),
          poolOverride: [id],
        });
        // override single id
        session.questionIds = [id];
        session.index = 0;
        persistSession('Practice one');
        openQuiz();
      }
    });
  });
}

function resetAll(){
  if(!confirm('Clear saved session + missed/flagged history?')) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(MISSED_KEY);
  localStorage.removeItem(FLAGGED_KEY);
  session = null;
  stopTimer();
  rebuildResumeButton();
  renderFlagCount();
  setView('setup');
  alert('Reset complete.');
}

async function loadQuestions() {
  if (window.__QUESTIONS__ && Array.isArray(window.__QUESTIONS__)) return window.__QUESTIONS__;
  const res = await fetch('questions.json');
  if (!res.ok) throw new Error('Failed to load questions.json');
  const data = await res.json();
return Array.isArray(data) ? data : (data.questions || []);
}

async function init(){
  // Load questions
  ALL_QUESTIONS = await loadQuestions();
  els.totalCount.textContent = String(ALL_QUESTIONS.length);

  // Mode selector
  els.modeSegs.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));

  // Start
  els.btnStart.addEventListener('click', () => {
    const mode = $$('.seg').find(x=>x.classList.contains('active'))?.dataset.mode || 'practice';
    const countMode = els.questionCount.value;

    startSession({
      mode,
      countMode,
      shuffle: !!els.shuffle.checked,
      shuffleChoices: !!els.shuffleChoices.checked,
      showExplanation: !!els.showExplanation.checked,
      examMinutes: Number(els.examMinutes.value || 60),
    });
  });

  // Resume
  els.btnResume.addEventListener('click', () => {
    const saved = loadLocal(STORAGE_KEY, null);
    if(!saved){ rebuildResumeButton(); return; }
    session = saved;
    // ensure defaults
    session.revealed = session.revealed || {};
    session.answers = session.answers || {};
    session.choiceOrder = session.choiceOrder || {};
    openQuiz();
  });

  // Home/reset
  els.btnHome.addEventListener('click', () => { stopTimer(); setView('setup'); rebuildResumeButton(); });
  els.btnReset.addEventListener('click', resetAll);

  // Quiz nav
  els.btnPrev.addEventListener('click', () => go(-1));
  els.btnNext.addEventListener('click', () => {
    if(session.index===session.questionIds.length-1){
      finishSession(false);
      return;
    }
    go(1);
  });
  els.btnReveal.addEventListener('click', reveal);
  els.btnFlag.addEventListener('click', flagToggle);
  els.btnPause.addEventListener('click', pause);

  // Results actions
  els.btnBackSetup.addEventListener('click', () => setView('setup'));
  els.btnReviewMissed.addEventListener('click', () => {
    startSession({
      mode: 'practice',
      countMode: 'missed',
      shuffle: true,
      shuffleChoices: true,
      showExplanation: !!els.showExplanation.checked,
      examMinutes: Number(els.examMinutes.value||60),
    });
  });
  els.btnReviewFlagged.addEventListener('click', () => {
    startSession({
      mode: 'practice',
      countMode: 'flagged',
      shuffle: true,
      shuffleChoices: true,
      showExplanation: !!els.showExplanation.checked,
      examMinutes: Number(els.examMinutes.value||60),
    });
  });

  els.search.addEventListener('input', renderReviewList);
  els.filter.addEventListener('change', renderReviewList);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if(views.quiz.classList.contains('hidden')) return;
    const q = currentQuestion();
    if(!q) return;

    if(e.key>='1' && e.key<='9'){
      const pos = Number(e.key)-1;
      const order = session.choiceOrder[`choiceOrder_${q.id}`] || [];
      if(pos < order.length){
        selectChoice(q, order[pos]);
      }
    }
    if(e.key==='Enter'){
      if(!els.btnNext.disabled) els.btnNext.click();
    }
    if((e.key==='r' || e.key==='R') && session.mode==='practice'){
      if(!els.btnReveal.disabled) els.btnReveal.click();
    }
  });

  // Setup initial UI
  setMode('practice');
  rebuildResumeButton();
  setView('setup');

  // Show flagged count
  renderFlagCount();
}

init().catch(err => {
  console.error(err);
  alert('Failed to load questions. Try re-downloading the folder and opening index.html, or run a local server (see README).');
});
