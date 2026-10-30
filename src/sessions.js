const sessions = new Map();

function blank(prev) {
  return {
    step: 'idle',
    data: {},
    handoff: false,
    activated: Boolean(prev && prev.activated),
    greeted: Boolean(prev && prev.greeted),
    offTopic: 0,
    lang: (prev && prev.lang) || 'fr',
    menu: [],
    history: (prev && prev.history) || [],
    updatedAt: Date.now(),
  };
}

function get(from) {
  if (!sessions.has(from)) {
    sessions.set(from, blank(null));
  }
  const s = sessions.get(from);
  s.updatedAt = Date.now();
  if (!s.history) s.history = [];
  if (s.greeted == null) s.greeted = false;
  if (s.offTopic == null) s.offTopic = 0;
  return s;
}

function reset(from) {
  const prev = sessions.get(from);
  sessions.set(from, blank(prev));
  return sessions.get(from);
}

function setStep(from, step, extra = {}) {
  const s = get(from);
  s.step = step;
  s.data = { ...s.data, ...extra };
  s.updatedAt = Date.now();
  return s;
}

function hydrate(from, data) {
  if (!from || !data || typeof data !== 'object') return get(from);
  sessions.set(from, {
    step: data.step || 'idle',
    data: data.data && typeof data.data === 'object' ? data.data : {},
    handoff: Boolean(data.handoff),
    activated: Boolean(data.activated),
    greeted: Boolean(data.greeted),
    offTopic: Number(data.offTopic) || 0,
    lang: data.lang === 'en' ? 'en' : 'fr',
    menu: Array.isArray(data.menu) ? data.menu : [],
    history: Array.isArray(data.history) ? data.history.slice(-16) : [],
    updatedAt: Date.now(),
  });
  return sessions.get(from);
}

function snapshot(from) {
  const s = get(from);
  return {
    step: s.step,
    data: s.data || {},
    handoff: Boolean(s.handoff),
    activated: Boolean(s.activated),
    greeted: Boolean(s.greeted),
    offTopic: Number(s.offTopic) || 0,
    lang: s.lang === 'en' ? 'en' : 'fr',
    menu: Array.isArray(s.menu) ? s.menu : [],
    history: Array.isArray(s.history) ? s.history.slice(-16) : [],
  };
}

module.exports = { get, reset, setStep, hydrate, snapshot };
