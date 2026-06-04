const quickCommands = [
  'Open Chrome',
  'Open VS Code',
  'Find pdf',
  'Create folder AI Project',
  'Show system status',
  'Open github.com',
  'Turn off laptop'
]

const suggestionCommands = [
  ...quickCommands,
  'Chrome',
  'Open Edge',
  'Open Notepad',
  'Open Terminal',
  'Find documents',
  'Find downloads',
  'Search pdf in downloads',
  'Create folder Work Notes',
  'Show memory status',
  'Restart laptop'
]

const state = {
  listening: false,
  recognizing: false,
  lastTranscript: '',
  pendingConfirmation: null,
  language: 'en-US',
  history: []
}

const languageProfiles = {
  'en-US': {
    listening: 'Listening...',
    missed: 'I did not catch that. Try again or type the command.',
    unavailable: 'Voice input is unavailable in this browser. Typed commands still work.',
    working: 'Working...',
    offline: 'Backend is offline. Start the local Bumblebee server and try again.'
  },
  'en-IN': {
    listening: 'Listening...',
    missed: 'I did not catch that. Try again or type the command.',
    unavailable: 'Voice input is unavailable in this browser. Typed commands still work.',
    working: 'Working...',
    offline: 'Backend is offline. Start the local Bumblebee server and try again.'
  },
  'hi-IN': {
    listening: 'Sun raha hoon...',
    missed: 'Main samajh nahi paya. Dobara boliye ya command type kijiye.',
    unavailable: 'Is browser mein voice input available nahi hai. Typed commands kaam karenge.',
    working: 'Kaam kar raha hoon...',
    offline: 'Backend offline hai. Local Bumblebee server start karke try kijiye.'
  },
  'ta-IN': {
    listening: 'Ketkiren...',
    missed: 'Puriyavillai. Meendum pesungal allathu command type seiyungal.',
    unavailable: 'Indha browser voice input support seiyavillai. Typed commands work aagum.',
    working: 'Velai seigirathu...',
    offline: 'Backend offline. Local Bumblebee server start pannitu try pannunga.'
  },
  'es-ES': {
    listening: 'Escuchando...',
    missed: 'No entendí eso. Intenta otra vez o escribe el comando.',
    unavailable: 'La entrada de voz no está disponible en este navegador. Los comandos escritos funcionan.',
    working: 'Trabajando...',
    offline: 'El backend está desconectado. Inicia el servidor local de Bumblebee e intenta otra vez.'
  }
}

const replyEl = document.querySelector('#reply')
const inputEl = document.querySelector('#commandInput')
const formEl = document.querySelector('#commandForm')
const quickGridEl = document.querySelector('#quickGrid')
const historyEl = document.querySelector('#historyList')
const metricsEl = document.querySelector('#metrics')
const statusEl = document.querySelector('#backendStatus')
const listenButton = document.querySelector('#listenButton')
const avatarCore = document.querySelector('#avatarCore')
const waveEl = document.querySelector('.wave')
const suggestionStripEl = document.querySelector('#suggestionStrip')
const languageSelectEl = document.querySelector('#languageSelect')
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
let recognition = null

for (let index = 0; index < 24; index += 1) {
  const bar = document.createElement('span')
  bar.style.animationDelay = `${index * 70}ms`
  waveEl.appendChild(bar)
}

quickCommands.forEach((item) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.innerHTML = `<span class="plus">+</span><span>${item}</span>`
  button.addEventListener('click', () => runCommand(item))
  quickGridEl.appendChild(button)
})

function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function speak(text) {
  if (!('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.95
  utterance.pitch = 1.02
  utterance.lang = state.language
  utterance.onstart = () => setSpeaking(true)
  utterance.onend = () => setSpeaking(false)
  utterance.onerror = () => setSpeaking(false)
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

function getCopy(key) {
  return languageProfiles[state.language]?.[key] || languageProfiles['en-US'][key]
}

function setSpeaking(isSpeaking) {
  avatarCore.classList.toggle('speaking', isSpeaking)
  waveEl.classList.toggle('speaking', isSpeaking)
  replyEl.classList.toggle('speaking', isSpeaking)
}

function setListening(isListening) {
  state.listening = isListening
  listenButton.classList.toggle('listening', isListening)
  listenButton.title = isListening ? 'Stop listening' : 'Start listening'
  listenButton.setAttribute('aria-label', isListening ? 'Stop listening' : 'Start listening')
  avatarCore.classList.toggle('listening', isListening)
}

function renderSuggestions(query = '') {
  const value = query.trim().toLowerCase()
  const scored = suggestionCommands
    .filter((command) => !value || command.toLowerCase().includes(value) || value.split(' ').some((part) => command.toLowerCase().includes(part)))
    .slice(0, 5)

  suggestionStripEl.innerHTML = ''
  scored.forEach((command) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = command
    button.addEventListener('click', () => runCommand(command))
    suggestionStripEl.appendChild(button)
  })
}

async function confirmDangerousCommand(text) {
  const phrase = text.trim()
  const command = state.pendingConfirmation
  state.pendingConfirmation = null
  try {
    const response = await fetch('/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phrase, command })
    })
    const result = await response.json()
    replyEl.textContent = result.reply
    speak(result.reply)
    state.history = [{ intent: { action: 'confirm', command }, reply: result.reply }, ...state.history].slice(0, 8)
    renderHistory()
  } catch {
    replyEl.textContent = getCopy('offline')
    speak(getCopy('offline'))
  }
}

async function refreshSystem() {
  try {
    const response = await fetch('/api/system')
    if (!response.ok) throw new Error('System endpoint failed')
    const system = await response.json()
    statusEl.textContent = 'Backend connected'
    metricsEl.innerHTML = `
      <div><strong>${system.cpuCount}</strong><span>CPU threads</span></div>
      <div><strong>${system.memory.percent}%</strong><span>memory used</span></div>
      <div><strong>${formatUptime(system.uptime)}</strong><span>uptime</span></div>
    `
  } catch {
    statusEl.textContent = 'Backend offline'
  }
}

function renderHistory() {
  if (!state.history.length) {
    historyEl.innerHTML = '<p class="muted">Completed actions will appear here.</p>'
    return
  }
  historyEl.innerHTML = ''
  state.history.forEach((item) => {
    const article = document.createElement('article')
    article.className = 'history-item'
    const action = item.intent?.action || 'response'
    const details = []
    if (item.results) details.push(`${item.results.length} file results`)
    if (item.steps) details.push(...item.steps)
    article.innerHTML = `
      <div>
        <strong>${action}</strong>
        <span>${item.reply}</span>
        ${details.map((detail) => `<small>${detail}</small>`).join('')}
      </div>
    `
    historyEl.appendChild(article)
  })
}

async function runCommand(text = inputEl.value) {
  const trimmed = text.trim()
  if (!trimmed) return
  if (recognition && state.listening) recognition.stop()
  if (state.pendingConfirmation && /^yes$/i.test(trimmed)) {
    inputEl.value = trimmed
    await confirmDangerousCommand(trimmed)
    return
  }
  inputEl.value = trimmed
  replyEl.textContent = getCopy('working')
  try {
    const response = await fetch('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed })
    })
    const result = await response.json()
    replyEl.textContent = result.reply
    speak(result.reply)
    state.pendingConfirmation = result.requiresConfirmation ? result.intent?.command : null
    state.history = [result, ...state.history].slice(0, 8)
    renderHistory()
    if (result.intent?.action === 'system') refreshSystem()
  } catch {
    const message = getCopy('offline')
    replyEl.textContent = message
    speak(message)
  }
}

formEl.addEventListener('submit', (event) => {
  event.preventDefault()
  runCommand()
})

if (!SpeechRecognition) {
  listenButton.disabled = true
  listenButton.title = 'Voice input unavailable'
  listenButton.setAttribute('aria-label', 'Voice input unavailable')
  replyEl.textContent = getCopy('unavailable')
} else {
  recognition = new SpeechRecognition()
  recognition.lang = state.language
  recognition.continuous = false
  recognition.interimResults = true

  recognition.onstart = () => {
    state.recognizing = true
    state.lastTranscript = ''
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setListening(true)
    replyEl.textContent = getCopy('listening')
  }

  recognition.onend = () => {
    state.recognizing = false
    setListening(false)
    if (!state.lastTranscript) {
      replyEl.textContent = getCopy('missed')
    }
  }

  recognition.onerror = (event) => {
    const messages = {
      'not-allowed': 'Microphone access is blocked. Allow microphone permission for this page and try again.',
      'no-speech': 'I did not hear speech. Try again closer to the mic.',
      network: 'Speech recognition needs browser network support. Typed commands still work.',
      aborted: 'Listening stopped.'
    }
    replyEl.textContent = messages[event.error] || `Voice input failed: ${event.error}.`
  }

  recognition.onresult = (event) => {
    let transcript = ''
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      transcript += event.results[index][0].transcript
    }
    const text = transcript.trim()
    if (!text) return
    state.lastTranscript = text
    inputEl.value = text
    replyEl.textContent = text
    renderSuggestions(text)

    const latest = event.results[event.results.length - 1]
    if (latest?.isFinal) runCommand(text)
  }
}

listenButton.addEventListener('click', () => {
  if (!SpeechRecognition) return
  if (state.recognizing) {
    recognition.stop()
    return
  }
  try {
    recognition.start()
  } catch {
    replyEl.textContent = 'Voice input is already starting. Wait a moment and try again.'
  }
})

inputEl.addEventListener('input', () => renderSuggestions(inputEl.value))

languageSelectEl.addEventListener('change', () => {
  state.language = languageSelectEl.value
  document.documentElement.lang = state.language
  if (recognition) recognition.lang = state.language
})

refreshSystem()
renderSuggestions()
window.setInterval(refreshSystem, 15000)
