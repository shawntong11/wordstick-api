// WordStick Review v2.1 — 3-level directory + flashcard

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

// ── State ─────────────────────────────────────────────────────────────
let tree = {};           // WordHub 3-level tree
let wsWords = [];        // WordStick saved words
let navStack = [];       // breadcrumb stack [{label, node}]
let currentNode = null;  // current tree node

// Flashcard state
let flashWords = [], idx = 0;
let knownSet = new Set(), unknownSet = new Set();
let paused = false, timers = [], voice = null;

// ── Init ──────────────────────────────────────────────────────────────
async function init() {
  // Load WordStick words
  wsWords = await loadWSWords();

  // Load WordHub tree from API
  try {
    const r = await fetch(API_URL + '/api/tree');
    tree = await r.json();
  } catch(e) {
    console.warn('Tree load failed:', e);
    tree = {};
  }

  renderDir(tree, []);

  // Voice
  const setVoice = () => { voice = speechSynthesis.getVoices().find(v => /en-US/i.test(v.lang)) || null; };
  setVoice();
  speechSynthesis.onvoiceschanged = setVoice;

  // Back button
  document.getElementById('backBtn').onclick = goBack;

  // Flashcard buttons
  document.getElementById('prevBtn').onclick = () => { idx = (idx-1+flashWords.length)%flashWords.length; render(); };
  document.getElementById('nextBtn').onclick = next;
  document.getElementById('knowBtn').onclick = () => { knownSet.add(flashWords[idx]?.w); unknownSet.delete(flashWords[idx]?.w); next(); };
  document.getElementById('unknownBtn').onclick = () => { unknownSet.add(flashWords[idx]?.w); knownSet.delete(flashWords[idx]?.w); next(); };
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



// ── Directory Navigation ──────────────────────────────────────────────
// Color palettes for treemap cards
const LEVEL_COLORS = [
  // L1 colors (rich, saturated)
  ['#2d6a4f','#1b4332','#386641','#4a4e69','#22577a','#5c4033',
   '#6d2b3d','#7b2d8b','#c77dff','#0077b6','#e07a5f','#3d405b',
   '#606c38','#283618','#bc4749','#8338ec','#023e8a','#d62828'],
  // L2 colors (medium)
  ['#457b9d','#1d3557','#e63946','#2a9d8f','#e9c46a','#f4a261',
   '#264653','#e76f51','#6a994e','#bc6c25','#7209b7','#480ca8',
   '#b5179e','#f72585','#4361ee','#4cc9f0','#06d6a0','#ef233c'],
  // L3 colors (lighter)
  ['#74c69d','#52b788','#40916c','#95d5b2','#b7e4c7','#d8f3dc',
   '#a8dadc','#457b9d','#e9c46a','#f4a261','#e76f51','#264653',
   '#6a994e','#a7c957','#386641','#bc4749','#7209b7','#4361ee'],
];

function renderDir(node, stack) {
  navStack = stack;
  currentNode = node;

  // Show/hide views
  document.getElementById('dirView').style.display = 'block';
  document.getElementById('flashView').style.display = 'none';

  // Breadcrumb
  updateBreadcrumb();

  // Back button visibility
  document.getElementById('backBtn').style.visibility = stack.length > 0 ? 'visible' : 'hidden';

  const grid = document.getElementById('dirGrid');
  const wsSection = document.getElementById('wsSection');
  grid.innerHTML = '';
  wsSection.innerHTML = '';

  // Show WordStick words at root level
  if (stack.length === 0 && wsWords.length > 0) {
    wsSection.innerHTML = '<div class="section-title">我的词库</div>';
    const wsCard = document.createElement('div');
    wsCard.className = 'ws-card';
    wsCard.innerHTML = `
      <div class="ws-card-title">📌 WordStick 保存的词</div>
      <div class="ws-card-sub">${wsWords.length} 个词 · 自动分类</div>
    `;
    wsCard.onclick = () => startFlash(wsWords.map(w => ({
      w: w.word, i: w.phonetic||'', img: w.imageUrl||'',
      zh: w.primaryZh || w.chineseMeanings?.[0]?.zhDef || '',
      cat: w.category||'general', source: 'wordstick'
    })), '我的词库');
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

  // Add "全部复习" button
  const allArrays = entries.every(([, v]) => Array.isArray(v));
  if (allArrays && entries.length > 0) {
    const allWords = entries.flatMap(([, v]) => v);
    const allBtn = document.createElement('button');
    allBtn.className = 'dir-all-btn';
    allBtn.textContent = `▶ 全部复习  ${allWords.length} 词`;
    allBtn.onclick = () => startFlash(allWords.map(w => ({...w, source:'wordhub'})), '全部');
    grid.parentNode.insertBefore(allBtn, grid);
  }

  // Build treemap using squarified algorithm
  // Target: ~4-5 rows, each row fills full width
  const N = entries.length;
  const ROWS = Math.min(5, Math.max(3, Math.ceil(N / 4)));
  const ROW_H = 110; // px per row
  const TOTAL_W = 600; // reference container width

  // Group entries into rows by cumulative weight
  const rowWeight = total / ROWS;
  const rows = [];
  let curRow = [], curW = 0;

  entries.forEach(([key, val], i) => {
    const count = counts[i];
    curRow.push({ key, val, count, i });
    curW += count;
    if (curW >= rowWeight || i === N - 1) {
      rows.push({ items: curRow, totalCount: curW });
      curRow = []; curW = 0;
    }
  });

  rows.forEach((row, rowIdx) => {
    const rowDiv = document.createElement('div');
    rowDiv.style.cssText = `display:flex;gap:3px;width:100%;height:${ROW_H}px;`;

    row.items.forEach(({ key, val, count, i }) => {
      const isLeaf = Array.isArray(val);
      const pct = count / total;
      const rowPct = count / (row.totalCount || 1);
      const color = palette[i % palette.length];

      // Font size based on card width estimate
      const estW = rowPct * TOTAL_W;
      const fontSize = estW > 120 ? 16 : estW > 70 ? 14 : 12;

      const card = document.createElement('div');
      card.className = 'dir-card';
      card.style.cssText = `
        background:${color};
        flex:${rowPct * 100} 1 ${(rowPct * TOTAL_W).toFixed(0)}px;
        height:${ROW_H}px;
        min-width:0;
      `;

      card.innerHTML = `
        <div class="dir-pct">${(pct*100).toFixed(0)}%</div>
        <div class="dir-name" style="font-size:${fontSize}px;white-space:normal;word-break:break-all;">${key}</div>
        <div class="dir-count">${count} 词</div>
      `;

      card.onclick = () => {
        if (isLeaf) {
          startFlash(val.map(w => ({...w, source:'wordhub'})), key);
        } else {
          renderDir(val, [...stack, { label: key, node }]);
        }
      };

      rowDiv.appendChild(card);
    });

    grid.appendChild(rowDiv);
  });
}

function countWords(node) {
  if (Array.isArray(node)) return node.length;
  let total = 0;
  for (const v of Object.values(node)) total += countWords(v);
  return total;
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
    html += '<span class="breadcrumb-sep">›</span>';
    html += `<span class="breadcrumb-item" data-idx="${i}">${item.label}</span>`;
  });
  bc.innerHTML = html;
  bc.querySelectorAll('.breadcrumb-item').forEach(el => {
    el.onclick = () => {
      const idx = parseInt(el.dataset.idx);
      if (idx === -1) {
        renderDir(tree, []);
      } else {
        renderDir(navStack[idx+1]?.node || currentNode, navStack.slice(0, idx+1));
      }
    };
  });
}

// ── Flashcard ─────────────────────────────────────────────────────────
function startFlash(words, title) {
  flashWords = words;
  idx = 0;
  knownSet.clear(); unknownSet.clear();

  document.getElementById('dirView').style.display = 'none';
  document.getElementById('flashView').style.display = 'block';

  // Add flash title to breadcrumb
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML += `<span class="breadcrumb-sep">›</span><span>${title}</span>`;
  document.getElementById('backBtn').style.visibility = 'visible';

  // Override back for flash view
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

  // Card color
  const card = document.getElementById('mainCard');
  card.style.background = CAT_COLORS[cat] || '#f5e876';
  card.style.borderTopColor = CAT_BORDER[cat] || '#e8d200';

  document.getElementById('wordTitle').textContent = w.w || w.word || '';
  document.getElementById('wordIpa').textContent = w.i || w.phonetic || '';
  document.getElementById('wordZh').textContent = w.zh || w.primaryZh || w.chineseMeanings?.[0]?.zhDef || '';

  // Tags
  const sourceTag = (w.source === 'wordstick')
    ? '<span class="tag ws-tag">📌 我的</span>'
    : '<span class="tag wh-tag">📚 WordHub</span>';
  document.getElementById('tagRow').innerHTML =
    `<span class="tag cat-tag">${CAT_LABELS[cat]||cat}</span>${sourceTag}`;

  // Image — always show, fallback to Wikipedia then placeholder
  const imgEl = document.getElementById('wordImg');
  const imgSrc = w.img || w.imageUrl || '';
  imgEl.style.display = 'block';
  imgEl.style.height = 'auto';
  imgEl.style.maxHeight = '320px';
  if (imgSrc) {
    imgEl.src = imgSrc;
    imgEl.onerror = () => {
      // Try Wikipedia
      getWikiImg(w.w || w.word).then(url => {
        if (url) { imgEl.src = url; }
        else { imgEl.style.display = 'none'; }
      });
    };
  } else {
    imgEl.style.display = 'none';
    getWikiImg(w.w || w.word).then(url => {
      if (url) { imgEl.src = url; imgEl.style.display = 'block'; }
    });
  }

  // Progress
  const total = flashWords.length;
  document.getElementById('progressText').textContent = `${idx+1} / ${total}`;
  document.getElementById('progressBar').style.width = ((idx+1)/total*100).toFixed(0) + '%';
  document.getElementById('knownLabel').textContent =
    knownSet.size ? `✓ ${knownSet.size}  ✗ ${unknownSet.size}` : '';

  if (!paused) autoSpeak();
}

function next() {
  if (!flashWords.length) return;
  idx = (idx+1) % flashWords.length;
  render();
}

function speak() {
  speechSynthesis.cancel();
  const w = flashWords[idx];
  if (!w) return;
  const u = new SpeechSynthesisUtterance(w.w || w.word);
  u.lang = 'en-US'; u.rate = 0.85;
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

function autoSpeak() {
  const repeatCount = Number(document.getElementById('repeatCount').value) || 2;
  const intervalSec = Number(document.getElementById('intervalSec').value) || 3;
  timers.forEach(clearTimeout); timers = [];
  for (let i = 0; i < repeatCount; i++) {
    timers.push(setTimeout(speak, i * intervalSec * 1000));
  }
}

function togglePause() {
  paused = !paused;
  document.getElementById('pauseBtn').textContent = paused ? '▶ 继续' : '⏸ 暂停';
  if (paused) { timers.forEach(clearTimeout); speechSynthesis.cancel(); }
  else autoSpeak();
}

async function getWikiImg(word) {
  try {
    const r = await fetch(
      'https://en.wikipedia.org/w/api.php?action=query&titles=' +
      encodeURIComponent(word) +
      '&prop=pageimages&format=json&pithumbsize=200&origin=*'
    );
    const d = await r.json();
    return Object.values(d?.query?.pages||{})[0]?.thumbnail?.source || null;
  } catch(e) { return null; }
}

document.addEventListener('DOMContentLoaded', init);
