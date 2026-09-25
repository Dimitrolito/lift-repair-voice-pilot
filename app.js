const fields = {
  name: document.querySelector('#nameValue'),
  phone: document.querySelector('#phoneValue'),
  address: document.querySelector('#addressValue'),
  issue: document.querySelector('#issueValue'),
};
const assistantCard = document.querySelector('.assistant-card');
const stateEl = document.querySelector('#assistantState');
const promptEl = document.querySelector('#assistantPrompt');
const transcriptEl = document.querySelector('#transcript');
const startButton = document.querySelector('#startButton');
const stopButton = document.querySelector('#stopButton');
const saveButton = document.querySelector('#saveButton');
const urgentValue = document.querySelector('#urgentValue');
const urgentBox = document.querySelector('#urgentBox');
const draftBadge = document.querySelector('#draftBadge');

const questions = [
  { key: 'urgent', text: 'Підкажіть, будь ласка, чи є зараз хтось усередині ліфта?' },
  { key: 'name', text: 'Зрозуміло. Як до вас можна звертатися?' },
  { key: 'phone', text: 'Дякую. Назвіть, будь ласка, номер телефону для зворотного зв’язку. Я повторю його для перевірки.' },
  { key: 'address', text: 'За якою адресою сталася поломка? Назвіть місто, вулицю та номер будинку.' },
  { key: 'details', text: 'Уточніть, будь ласка, номер під’їзду й ліфта, якщо знаєте, та коротко опишіть поломку.' },
  { key: 'confirm', text: null },
];

let recognition;
let synth = window.speechSynthesis;
let active = false;
let awaitingAnswer = false;
let questionIndex = 0;
let currentAnswer = '';
let draft = { name: '', phone: '', address: '', issue: '', urgent: '' };
let finalTranscript = '';

function speak(text, onEnd) {
  promptEl.textContent = text;
  if (!synth) { onEnd?.(); return; }
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'uk-UA';
  utterance.rate = 0.94;
  const voices = synth.getVoices();
  utterance.voice = voices.find(v => v.lang.toLowerCase().startsWith('uk')) || null;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  synth.speak(utterance);
}

function setStep(step) {
  for (let i = 1; i <= 4; i++) {
    const el = document.querySelector(`#step${i}`);
    el.classList.toggle('active', i === step);
    el.classList.toggle('done', i < step);
  }
}

function showAnswer(key, value) {
  const clean = value.trim();
  if (!clean) return;
  if (key === 'urgent') {
    draft.urgent = clean;
    const trapped = /так|є|застряг|застрягли|всередин/i.test(clean) && !/нема|немає|нікого|не застряг/i.test(clean);
    urgentValue.textContent = trapped ? `ТАК — ${clean}` : clean;
    urgentBox.classList.toggle('urgent', trapped);
    return;
  }
  if (key === 'name') draft.name = clean;
  if (key === 'phone') draft.phone = clean;
  if (key === 'address') draft.address = clean;
  if (key === 'details') draft.issue = clean;
  const target = key === 'details' ? fields.issue : fields[key];
  if (target) { target.textContent = clean; target.classList.remove('empty'); }
}

function updateTranscript(text) {
  transcriptEl.textContent = text;
}

function nextQuestion() {
  if (!active) return;
  if (questionIndex >= questions.length) return finishCollection();
  const item = questions[questionIndex];
  if (item.key === 'confirm') {
    setStep(4);
    const summary = `Перевірмо заявку. Ім’я: ${draft.name || 'не вказано'}. Телефон: ${draft.phone || 'не вказано'}. Адреса: ${draft.address || 'не вказано'}. Поломка: ${draft.issue || 'не вказана'}. Усе правильно?`;
    speak(summary, () => beginListening());
    awaitingAnswer = true;
    return;
  }
  if (item.key === 'urgent') setStep(1);
  else if (item.key === 'name' || item.key === 'phone') setStep(2);
  else if (item.key === 'address' || item.key === 'details') setStep(3);
  speak(item.text, () => beginListening());
  awaitingAnswer = true;
}

function beginListening() {
  if (!active || !recognition) return;
  currentAnswer = '';
  stateEl.textContent = 'Слухаю вас';
  assistantCard.classList.add('listening');
  try { recognition.start(); } catch { /* Already listening. */ }
}

function processAnswer(text) {
  const answer = text.trim();
  if (!answer) return;
  awaitingAnswer = false;
  finalTranscript += `${finalTranscript ? '\n' : ''}Ви: ${answer}`;
  updateTranscript(answer);
  const key = questions[questionIndex]?.key;
  if (key === 'confirm') {
    if (/ні|неправ|помил|не так/i.test(answer)) {
      questionIndex = 1;
      speak('Добре, виправимо. Назвіть, будь ласка, номер телефону ще раз.', () => beginListening());
      questionIndex = 2;
      return;
    }
    speak('Дякую. Тестову заявку сформовано. Її можна зберегти на цій сторінці.', () => {
      active = false;
      stateEl.textContent = 'Звернення зібрано';
      assistantCard.classList.remove('listening');
      saveButton.disabled = false;
      draftBadge.textContent = 'ГОТОВО ДО ЗБЕРЕЖЕННЯ';
      draftBadge.classList.add('saved');
      startButton.hidden = false;
      stopButton.hidden = true;
    });
    return;
  }
  showAnswer(key, answer);
  questionIndex += 1;
  stateEl.textContent = 'Відповідь отримано';
  setTimeout(nextQuestion, 350);
}

function finishCollection() {
  stateEl.textContent = 'Звернення зібрано';
  saveButton.disabled = false;
}

function startConversation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    stateEl.textContent = 'Браузер не підтримує розпізнавання';
    promptEl.textContent = 'Для голосового тесту відкрийте цю сторінку в актуальному Chrome. Наразі у цьому браузері немає розпізнавання мовлення.';
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = 'uk-UA';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onresult = event => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const phrase = event.results[i][0].transcript;
      if (event.results[i].isFinal) currentAnswer += `${phrase} `;
      else interim += phrase;
    }
    if (interim) updateTranscript(interim);
    if (currentAnswer.trim()) {
      assistantCard.classList.remove('listening');
      stateEl.textContent = 'Обробляю відповідь';
      processAnswer(currentAnswer);
      currentAnswer = '';
    }
  };
  recognition.onerror = event => {
    if (!active) return;
    assistantCard.classList.remove('listening');
    stateEl.textContent = event.error === 'not-allowed' ? 'Немає доступу до мікрофона' : 'Не вдалося розпізнати';
    speak(event.error === 'not-allowed' ? 'Надайте браузеру доступ до мікрофона та спробуйте ще раз.' : 'Не почула відповідь. Скажіть, будь ласка, ще раз.', () => beginListening());
  };
  recognition.onend = () => {
    assistantCard.classList.remove('listening');
    if (active && awaitingAnswer && !currentAnswer.trim()) {
      stateEl.textContent = 'Очікую на відповідь';
      setTimeout(() => { if (active) beginListening(); }, 450);
    }
  };
  active = true;
  awaitingAnswer = true;
  questionIndex = 0;
  draft = { name: '', phone: '', address: '', issue: '', urgent: '' };
  Object.entries(fields).forEach(([key, el]) => { el.textContent = key === 'address' ? 'Місто, вулиця, будинок' : key === 'issue' ? 'Очікуємо опис' : 'Очікуємо відповідь'; el.classList.add('empty'); });
  urgentValue.textContent = 'Помічник уточнить це на початку розмови';
  urgentBox.classList.remove('urgent');
  transcriptEl.textContent = '';
  finalTranscript = '';
  saveButton.disabled = true;
  draftBadge.textContent = 'ЧЕРНЕТКА';
  draftBadge.classList.remove('saved');
  startButton.hidden = true;
  stopButton.hidden = false;
  stateEl.textContent = 'З’єднуюся з помічником';
  speak('Вітаю. Я автоматизований голосовий помічник служби ремонту ліфтів. Допоможу оформити звернення. Спершу уточню: чи є зараз хтось усередині ліфта?', () => beginListening());
}

function stopConversation() {
  active = false;
  awaitingAnswer = false;
  recognition?.stop();
  synth?.cancel();
  assistantCard.classList.remove('listening');
  stateEl.textContent = 'Тест завершено';
  promptEl.textContent = 'Можна почати розмову ще раз.';
  startButton.hidden = false;
  stopButton.hidden = true;
}

startButton.addEventListener('click', startConversation);
stopButton.addEventListener('click', stopConversation);
saveButton.addEventListener('click', () => {
  const record = { ...draft, savedAt: new Date().toISOString(), transcript: finalTranscript };
  const records = JSON.parse(localStorage.getItem('lift-test-requests') || '[]');
  records.push(record);
  localStorage.setItem('lift-test-requests', JSON.stringify(records));
  saveButton.textContent = 'Збережено локально ✓';
  saveButton.disabled = true;
});
