// Simple German learning game for Polish beginners
// No frameworks, single-file logic.
// Data format: packs with entries {de, pl, hint?}

const App = (() => {
  const el = (id) => document.getElementById(id);
  const $game = () => el('game');
  const $options = () => el('options');
  const $question = () => el('question');
  const $feedback = () => el('feedback');
  const $progress = () => el('progress');
  const $mode = () => el('mode');
  const $pack = () => el('pack');
  const synth = window.speechSynthesis;

  const STATE = {
    allPacks: {},
    currentPackKey: null,
    mode: 'flashcards',
    round: 0,
    correct: 0,
    order: [],
    revealed: false,
    currentIndex: 0,
  };

  // --- Data ---
  const PACKS = {
    "Powitania i podstawy": [
      {de:"Hallo!", pl:"Cześć!"},
      {de:"Guten Morgen!", pl:"Dzień dobry (rano)"},
      {de:"Guten Tag!", pl:"Dzień dobry"},
      {de:"Guten Abend!", pl:"Dobry wieczór"},
      {de:"Tschüss!", pl:"Pa! / Cześć!"},
      {de:"Wie heißt du?", pl:"Jak masz na imię?"},
      {de:"Ich heiße Maja.", pl:"Nazywam się Maja."},
      {de:"Wie geht's?", pl:"Jak leci?"},
      {de:"Gut, danke.", pl:"Dobrze, dziękuję."},
      {de:"Bitte.", pl:"Proszę / Nie ma za co."},
      {de:"Danke.", pl:"Dziękuję."},
      {de:"Ja / Nein", pl:"Tak / Nie"},
      {de:"Entschuldigung.", pl:"Przepraszam."},
      {de:"Ich verstehe nicht.", pl:"Nie rozumiem."},
      {de:"Sprechen Sie Polnisch?", pl:"Czy mówi Pan/Pani po polsku?"}
    ],
    "Liczby 0–10": [
      {de:"null", pl:"zero"},
      {de:"eins", pl:"jeden"},
      {de:"zwei", pl:"dwa"},
      {de:"drei", pl:"trzy"},
      {de:"vier", pl:"cztery"},
      {de:"fünf", pl:"pięć"},
      {de:"sechs", pl:"sześć"},
      {de:"sieben", pl:"siedem"},
      {de:"acht", pl:"osiem"},
      {de:"neun", pl:"dziewięć"},
      {de:"zehn", pl:"dziesięć"}
    ],
    "Zwroty ważne": [
      {de:"Ich komme aus Polen.", pl:"Pochodzę z Polski."},
      {de:"Ich wohne in Hannover.", pl:"Mieszkam w Hanowerze."},
      {de:"Ich lerne Deutsch.", pl:"Uczę się niemieckiego."},
      {de:"Können Sie das wiederholen?", pl:"Czy może Pan/Pani powtórzyć?"},
      {de:"Langsamer, bitte.", pl:"Wolniej, proszę."},
      {de:"Wo ist die Toilette?", pl:"Gdzie jest toaleta?"},
      {de:"Wie viel kostet das?", pl:"Ile to kosztuje?"},
      {de:"Hilfe!", pl:"Pomocy!"},
      {de:"Ich brauche einen Termin.", pl:"Potrzebuję terminu."}
    ]
  };

  function init() {
    // Load packs into select
    const packSel = $pack();
    Object.keys(PACKS).forEach((key) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      packSel.appendChild(opt);
    });

    // Load saved last choices
    const saved = JSON.parse(localStorage.getItem('depl_game_cfg') || '{}');
    if (saved.mode) $mode().value = saved.mode;
    if (saved.pack && PACKS[saved.pack]) $pack().value = saved.pack;

    // Bind UI
    document.getElementById('startBtn').addEventListener('click', start);
    document.getElementById('againBtn').addEventListener('click', start);
    document.getElementById('resetStats').addEventListener('click', resetStats);
    document.getElementById('revealBtn').addEventListener('click', reveal);
    document.getElementById('speakBtn').addEventListener('click', speakCurrent);
    document.getElementById('submitBtn').addEventListener('click', submitTyping);
    document.getElementById('nextBtn').addEventListener('click', next);

    $mode().addEventListener('change', () => {
      saveCfg();
      toggleTypingVisibility();
    });
    $pack().addEventListener('change', saveCfg);

    toggleTypingVisibility();
  }

  function saveCfg() {
    localStorage.setItem('depl_game_cfg', JSON.stringify({
      mode: $mode().value,
      pack: $pack().value
    }));
  }

  function start() {
    STATE.mode = $mode().value;
    STATE.currentPackKey = $pack().value;
    const items = PACKS[STATE.currentPackKey];
    STATE.order = shuffle([...Array(items.length).keys()]);
    STATE.round = 0;
    STATE.correct = 0;
    STATE.currentIndex = STATE.order[0];
    STATE.revealed = false;
    el('summary').classList.add('hidden');
    $game().classList.remove('hidden');
    render();
  }

  function resetStats() {
    localStorage.removeItem('depl_game_cfg');
    localStorage.removeItem('depl_game_leitner');
    location.reload();
  }

  function currentItem() {
    return PACKS[STATE.currentPackKey][STATE.currentIndex];
  }

  function render() {
    const item = currentItem();
    const mode = STATE.mode;
    $feedback().textContent = '';
    $options().innerHTML = '';
    el('revealBtn').classList.add('hidden');
    el('submitBtn').classList.add('hidden');
    el('nextBtn').classList.add('hidden');
    el('typingInput').classList.add('hidden');

    if (mode === 'flashcards') {
      $question().textContent = item.pl;
      el('revealBtn').classList.remove('hidden');
    } else if (mode === 'multiple') {
      $question().textContent = "Wybierz tłumaczenie: " + item.pl;
      renderOptions(item);
    } else if (mode === 'listening') {
      $question().textContent = "Słuchaj i wybierz właściwe zdanie po niemiecku.";
      speak(item.de);
      renderOptions(item, true);
    } else if (mode === 'typing') {
      $question().textContent = "Przetłumacz na niemiecki: " + item.pl;
      const input = el('typingInput');
      input.value = '';
      input.classList.remove('hidden');
      el('submitBtn').classList.remove('hidden');
      input.focus();
    }
    updateProgress();
  }

  function renderOptions(correctItem, hideText=false) {
    const pack = PACKS[STATE.currentPackKey];
    const choices = [correctItem.de];
    while (choices.length < Math.min(4, pack.length)) {
      const candidate = pack[Math.floor(Math.random() * pack.length)].de;
      if (!choices.includes(candidate)) choices.push(candidate);
    }
    shuffle(choices);
    choices.forEach((txt) => {
      const btn = document.createElement('button');
      btn.className = 'option';
      btn.textContent = hideText ? "—" : txt;
      btn.addEventListener('click', () => {
        // reveal text if listening mode
        if (hideText) btn.textContent = txt;
        checkAnswer(txt, correctItem.de, btn);
      });
      $options().appendChild(btn);
    });
  }

  function checkAnswer(answer, correct, btn) {
    const isCorrect = normalize(answer) === normalize(correct);
    if (isCorrect) {
      btn?.classList.add('correct');
      STATE.correct++;
      $feedback().textContent = "✅ Dobrze!";
      next(true);
    } else {
      btn?.classList.add('wrong');
      $feedback().textContent = `❌ Nie tak. Poprawnie: “${correct}”.`;
      el('nextBtn').classList.remove('hidden');
    }
    updateProgress();
  }

  function reveal() {
    const item = currentItem();
    $feedback().textContent = `➡️ ${item.de}`;
    el('nextBtn').classList.remove('hidden');
  }

  function submitTyping() {
    const input = el('typingInput').value;
    const correct = currentItem().de;
    checkAnswer(input, correct);
  }

  function next(auto=false) {
    STATE.round++;
    if (STATE.round >= PACKS[STATE.currentPackKey].length) {
      // end
      $game().classList.add('hidden');
      el('summary').classList.remove('hidden');
      el('scoreText').textContent = `${STATE.correct} / ${PACKS[STATE.currentPackKey].length}`;
      return;
    }
    STATE.currentIndex = STATE.order[STATE.round];
    render();
  }

  function updateProgress() {
    $progress().textContent = `Postęp: ${STATE.round+1} / ${PACKS[STATE.currentPackKey].length} • Punkty: ${STATE.correct}`;
  }

  function speak(text) {
    if (!window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(text);
    // Try to pick a German voice if available
    const voices = synth.getVoices();
    const deVoice = voices.find(v => /de(-|_|\b)/i.test(v.lang));
    if (deVoice) utter.voice = deVoice;
    utter.rate = 0.95;
    synth.cancel();
    synth.speak(utter);
  }

  function speakCurrent() {
    speak(currentItem().de);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function normalize(s) {
    return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function toggleTypingVisibility() {
    const isTyping = $mode().value === 'typing';
    el('typingInput').classList.toggle('hidden', !isTyping);
    el('submitBtn').classList.toggle('hidden', !isTyping);
  }

  return { init };
})();
