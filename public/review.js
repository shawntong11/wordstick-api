// WordStick Review — Web Version (wordstick-api.vercel.app)

const API_URL = 'https://wordstick-api.vercel.app';

const CAT_LABELS = {
  academic:'🎓 校园学术', technology:'💻 科技', workplace:'💼 职场',
  stem:'🔢 数理化', geography:'🌍 地理', politics:'🏛️ 政治',
  economics:'📈 经济金融', arts:'🎨 艺术文化', life:'🏠 社会生活',
  general:'📖 通用'
};

const CAT_COLORS = {
  academic:'#d4f5d4', technology:'#cce5ff', workplace:'#ffe5c0',
  stem:'#ead4f8', geography:'#c8f0fc', politics:'#ffd0cc',
  economics:'#f5e876', arts:'#ffd0dd', life:'#ccf2d8', general:'#f5e876'
};

const CAT_BORDER = {
  academic:'#52c355', technology:'#2979ff', workplace:'#ff9500',
  stem:'#af52de', geography:'#5ac8fa', politics:'#ff3b30',
  economics:'#e8d200', arts:'#ff2d55', life:'#30d158', general:'#e8d200'
};

const LEVEL_COLORS = [
  ['#2d6a4f','#1b4332','#386641','#4a4e69','#22577a','#5c4033',
   '#6d2b3d','#7b2d8b','#0077b6','#e07a5f','#3d405b','#606c38',
   '#283618','#bc4749','#8338ec','#023e8a','#d62828','#4a4e69'],
  ['#457b9d','#1d3557','#e63946','#2a9d8f','#e9c46a','#f4a261',
   '#264653','#e76f51','#6a994e','#bc6c25','#7209b7','#480ca8',
   '#b5179e','#f72585','#4361ee','#4cc9f0','#06d6a0','#ef233c'],
  ['#74c69d','#52b788','#40916c','#95d5b2','#a8dadc','#457b9d',
   '#e9c46a','#f4a261','#e76f51','#264653','#6a994e','#a7c957',
   '#386641','#bc4749','#7209b7','#4361ee','#4cc9f0','#06d6a0'],
];

// ── State ─────────────────────────────────────────────────────────────
let tree = {};
let wsWords = [];
let navStack = [];
let currentNode = null;
let flashWords = [], idx = 0;
let knownSet = new Set(), unknownSet = new Set();
let paused = false, timers = [], voice = null;

// ── User ID ────────────────────────────────────────────────────────────
function getUserId() {
  try {
    let uid = localStorage.getItem('ws_user_id');
    if (!uid) {
      uid = 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('ws_user_id', uid);
    }
    return uid;
  } catch(e) {
    return 'u_guest_' + Math.random().toString(36).slice(2);
  }
}

// ── Load Words ─────────────────────────────────────────────────────────
async function loadWords() {
  const userId = getUserId();

  // Load user's saved words from cloud
  let userWords = [];
  try {
    const r = await fetch(API_URL + '/api/words?type=user', {
      headers: { 'X-User-ID': userId }
    });
    const d = await r.json();
    userWords = (d.words || []).map(w => ({
      word: w.word, phonetic: w.phonetic || '',
      primaryZh: w.primary_zh || '',
      imageUrl: w.image_url || '',
      category: w.category || 'general',
      source: 'wordstick'
    }));
  } catch(e) {
    console.warn('User words load failed:', e);
  }

  // Load WordHub library
  let hubWords = [];
  try {
    const r = await fetch(API_URL + '/api/words?type=wordhub&limit=500');
    const d = await r.json();
    hubWords = (d.words || []).map(w => ({
      word: w.word, phonetic: w.ipa || '',
      imageUrl: w.image_url || '',
      category: w.category || 'general',
      primaryZh: '', source: 'wordhub'
    }));
  } catch(e) {
    console.warn('WordHub load failed:', e);
  }

  // Merge: user words first, then WordHub (no duplicates)
  const seen = new Set(userWords.map(w => w.word.toLowerCase()));
  const merged = [...userWords];
  for (const w of hubWords) {
    if (!seen.has(w.word.toLowerCase())) {
      merged.push(w);
      seen.add(w.word.toLowerCase());
    }
  }
  return merged;
}

// ── Init ───────────────────────────────────────────────────────────────
async function init() {
  wsWords = await loadWords();

  // Load tree
  try {
    const r = await fetch(API_URL + '/api/tree');
    tree = await r.json();
  } catch(e) {
    console.warn('Tree load failed:', e);
    tree = {};
  }

  renderDir(tree, []);

  const setVoice = () => { voice = speechSynthesis.getVoices().find(v => /en-US/i.test(v.lang)) || null; };
  setVoice();
  speechSynthesis.onvoiceschanged = setVoice;

  document.getElementById('backBtn').onclick = goBack;
  document.getElementById('prevBtn').onclick = () => { idx = (idx-1+flashWords.length)%flashWords.length; render(); };
  document.getElementById('nextBtn').onclick = next;
  document.getElementById('knowBtn').onclick = () => { knownSet.add(flashWords[idx]?.word); unknownSet.delete(flashWords[idx]?.word); next(); };
  document.getElementById('unknownBtn').onclick = () => { unknownSet.add(flashWords[idx]?.word); knownSet.delete(flashWords[idx]?.word); next(); };
  document.getElementById('speakBtn').onclick = speak;
  document.getElementById('pauseBtn').onclick = togglePause;

  document.addEventListener('keydown', e => {
    if (document.getElementById('flashView').style.display === 'none') return;
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') document.getElementById('prevBtn').click();
    else if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 's') speak();
    else if (e.key === 'k') document.getElementById('knowBtn').click();
    else if (e.key === 'x') document.getElementById('unknownBtn').click();
  });
}

// ── Directory ──────────────────────────────────────────────────────────
function renderDir(node, stack) {
  navStack = stack;
  currentNode = node;

  document.getElementById('dirView').style.display = 'block';
  document.getElementById('flashView').style.display = 'none';
  updateBreadcrumb();
  document.getElementById('backBtn').style.visibility = stack.length > 0 ? 'visible' : 'hidden';

  const grid = document.getElementById('dirGrid');
  const wsSection = document.getElementById('wsSection');
  grid.innerHTML = '';
  wsSection.innerHTML = '';

  // WordStick saved words at root
  if (stack.length === 0 && wsWords.filter(w => w.source === 'wordstick').length > 0) {
    const myWords = wsWords.filter(w => w.source === 'wordstick');
    wsSection.innerHTML = '<div class="section-title">我的词库</div>';
    const wsCard = document.createElement('div');
    wsCard.className = 'ws-card';
    wsCard.innerHTML = `<div class="ws-card-title">📌 WordStick 保存的词</div><div class="ws-card-sub">${myWords.length} 个词 · 自动分类</div>`;
    wsCard.onclick = () => startFlash(myWords, '我的词库');
    wsSection.appendChild(wsCard);
    const sep = document.createElement('div');
    sep.className = 'section-title';
    sep.textContent = 'WordHub 词库';
    wsSection.appendChild(sep);
  }

  const entries = Object.entries(node);
  const counts = entries.map(([, v]) => Array.isArray(v) ? v.length : countWords(v));
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const level = Math.min(stack.length, LEVEL_COLORS.length - 1);
  const palette = LEVEL_COLORS[level];
  const TOTAL_W = 600;
  const ROW_H = 110;
  const ROWS = Math.min(5, Math.max(3, Math.ceil(entries.length / 4)));
  const rowWeight = total / ROWS;

  // "复习全部" button if all leaves
  const allArrays = entries.every(([, v]) => Array.isArray(v));
  if (allArrays && entries.length > 0) {
    const allWords = entries.flatMap(([, v]) => v);
    const allBtn = document.createElement('button');
    allBtn.className = 'dir-all-btn';
    allBtn.textContent = `▶ 全部复习  ${allWords.length} 词`;
    allBtn.onclick = () => startFlash(allWords.map(w => ({...w, source:'wordhub'})), '全部');
    grid.parentNode.insertBefore(allBtn, grid);
  }

  // Build rows
  let curRow = [], curW = 0;
  const rows = [];
  entries.forEach(([key, val], i) => {
    curRow.push({ key, val, count: counts[i], i });
    curW += counts[i];
    if (curW >= rowWeight || i === entries.length - 1) {
      rows.push({ items: curRow, totalCount: curW });
      curRow = []; curW = 0;
    }
  });

  rows.forEach(row => {
    const rowDiv = document.createElement('div');
    rowDiv.style.cssText = `display:flex;gap:3px;width:100%;height:${ROW_H}px;margin-bottom:3px;`;
    row.items.forEach(({ key, val, count, i }) => {
      const isLeaf = Array.isArray(val);
      const pct = count / total;
      const rowPct = count / (row.totalCount || 1);
      const color = palette[i % palette.length];
      const estW = rowPct * TOTAL_W;
      const fontSize = estW > 120 ? 16 : estW > 70 ? 14 : 12;
      const card = document.createElement('div');
      card.className = 'dir-card';
      card.style.cssText = `background:${color};flex:${rowPct*100} 1 ${(rowPct*TOTAL_W).toFixed(0)}px;height:${ROW_H}px;min-width:0;`;
      card.innerHTML = `<div class="dir-pct">${(pct*100).toFixed(0)}%</div><div class="dir-name" style="font-size:${fontSize}px">${key}</div><div class="dir-count">${count} 词</div>`;
      card.onclick = () => isLeaf ? startFlash(val.map(w => ({...w, source:'wordhub'})), key) : renderDir(val, [...stack, { label: key, node }]);
      rowDiv.appendChild(card);
    });
    grid.appendChild(rowDiv);
  });
}

function countWords(node) {
  if (Array.isArray(node)) return node.length;
  let t = 0;
  for (const v of Object.values(node)) t += countWords(v);
  return t;
}

function goBack() {
  if (navStack.length === 0) return;
  const prev = navStack[navStack.length - 1];
  renderDir(prev.node, navStack.slice(0, -1));
}

function updateBreadcrumb() {
  const bc = document.getElementById('breadcrumb');
  if (navStack.length === 0) {
    bc.innerHTML = '<span class="title">📖 WordStick 复习</span>';
    return;
  }
  let html = '<span class="breadcrumb-item" data-idx="-1">首页</span>';
  navStack.forEach((item, i) => {
    html += `<span class="breadcrumb-sep">›</span><span class="breadcrumb-item" data-idx="${i}">${item.label}</span>`;
  });
  bc.innerHTML = html;
  bc.querySelectorAll('.breadcrumb-item').forEach(el => {
    el.onclick = () => {
      const i = parseInt(el.dataset.idx);
      if (i === -1) renderDir(tree, []);
      else renderDir(navStack[i+1]?.node || currentNode, navStack.slice(0, i+1));
    };
  });
}

// ── Flashcard ──────────────────────────────────────────────────────────
function startFlash(words, title) {
  flashWords = words;
  idx = 0;
  knownSet.clear(); unknownSet.clear();
  document.getElementById('dirView').style.display = 'none';
  document.getElementById('flashView').style.display = 'block';
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML += `<span class="breadcrumb-sep">›</span><span>${title}</span>`;
  document.getElementById('backBtn').style.visibility = 'visible';
  document.getElementById('backBtn').onclick = () => {
    document.getElementById('flashView').style.display = 'none';
    renderDir(currentNode, navStack);
  };
  render();
}

async function render() {
  if (!flashWords.length) return;
  timers.forEach(clearTimeout); timers = [];
  const w = flashWords[idx];
  const cat = w.cat || w.category || 'general';
  const card = document.getElementById('mainCard');
  card.style.background = CAT_COLORS[cat] || '#f5e876';
  card.style.borderTopColor = CAT_BORDER[cat] || '#e8d200';
  document.getElementById('wordTitle').textContent = w.w || w.word || '';
  document.getElementById('wordIpa').textContent = w.i || w.phonetic || '';
  document.getElementById('wordZh').textContent = w.zh || w.primaryZh || '';
  const sourceTag = w.source === 'wordstick' ? '<span class="tag ws-tag">📌 我的</span>' : '<span class="tag wh-tag">📚 WordHub</span>';
  document.getElementById('tagRow').innerHTML = `<span class="tag cat-tag">${CAT_LABELS[cat]||cat}</span>${sourceTag}`;
  const imgEl = document.getElementById('wordImg');
  const imgSrc = w.img || w.imageUrl || '';
  imgEl.style.display = 'block';
  imgEl.style.maxHeight = '320px';
  if (imgSrc) {
    imgEl.src = imgSrc;
    imgEl.onerror = () => { imgEl.style.display = 'none'; getWikiImg(w.w||w.word).then(url => { if(url){imgEl.src=url;imgEl.style.display='block';}}); };
  } else {
    imgEl.style.display = 'none';
    getWikiImg(w.w||w.word).then(url => { if(url){imgEl.src=url;imgEl.style.display='block';} });
  }
  const total = flashWords.length;
  document.getElementById('progressText').textContent = `${idx+1} / ${total}`;
  document.getElementById('progressBar').style.width = ((idx+1)/total*100).toFixed(0) + '%';
  document.getElementById('knownLabel').textContent = knownSet.size ? `✓ ${knownSet.size}  ✗ ${unknownSet.size}` : '';
  if (!paused) autoSpeak();
}

function next() { if (!flashWords.length) return; idx=(idx+1)%flashWords.length; render(); }

function speak() {
  speechSynthesis.cancel();
  const w = flashWords[idx]; if (!w) return;
  const u = new SpeechSynthesisUtterance(w.w||w.word);
  u.lang='en-US'; u.rate=0.85; if(voice) u.voice=voice;
  speechSynthesis.speak(u);
}

function autoSpeak() {
  const rc = Number(document.getElementById('repeatCount').value)||2;
  const is = Number(document.getElementById('intervalSec').value)||3;
  timers.forEach(clearTimeout); timers=[];
  for(let i=0;i<rc;i++) timers.push(setTimeout(speak, i*is*1000));
}

function togglePause() {
  paused=!paused;
  document.getElementById('pauseBtn').textContent = paused?'▶ 继续':'⏸ 暂停';
  if(paused){timers.forEach(clearTimeout);speechSynthesis.cancel();}
  else autoSpeak();
}

async function getWikiImg(word) {
  try {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(word)}&prop=pageimages&format=json&pithumbsize=200&origin=*`);
    const d = await r.json();
    return Object.values(d?.query?.pages||{})[0]?.thumbnail?.source||null;
  } catch(e) { return null; }
}




// 👇 加在文件最后
window.loadWords = loadWords;
window.init = init;

// 更稳的初始化方式
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}