const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* optional */
}

const { agencyDirectory, products, company } = require('./knowledge');
const { persona } = require('./config');

const KNOWLEDGE_PATH = path.join(__dirname, '..', 'data', 'knowledge.md');
let knowledgeText = '';
try {
  knowledgeText = fs.readFileSync(KNOWLEDGE_PATH, 'utf8');
} catch {
  knowledgeText = '';
}

const sections = knowledgeText
  .split(/\n(?=## )/)
  .map((block) => {
    const nl = block.indexOf('\n');
    const title = (nl === -1 ? block : block.slice(0, nl)).replace(/^#+\s*/, '').trim();
    const body = (nl === -1 ? '' : block.slice(nl + 1)).trim();
    return { title, body, blob: `${title}\n${body}`.toLowerCase() };
  })
  .filter((s) => s.body);

let cachedGeminiModel = null;
let genaiClient = null;

function geminiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

function defaultModel() {
  return String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
}

function isConfigured() {
  return Boolean(geminiKey());
}

function providerName() {
  return geminiKey() ? 'gemini' : 'none';
}

function redact(text) {
  return String(text || '')
    .replace(/\bAGC-[A-Z0-9-]{4,}\b/gi, '[police]')
    .replace(/\b(?:\+?237)?6\d{8}\b/g, '[tel]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]');
}

function retrieve(query, n = 6) {
  const words = String(query || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const scored = sections
    .map((s) => {
      let score = 0;
      for (const w of words) {
        if (s.blob.includes(w)) score += 2;
        if (s.title.toLowerCase().includes(w)) score += 5;
      }
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const picked = (scored.length ? scored : sections.slice(0, 4).map((s) => ({ s }))).slice(0, n);
  return picked.map((x) => `## ${x.s.title}\n${x.s.body}`).join('\n\n').slice(0, 10000);
}

function productFacts() {
  return Object.values(products)
    .map((p) => `* ${p.title}: ${p.summary}\n  - ${(p.bullets || []).join('; ')}`)
    .join('\n');
}

function systemPrompt() {
  const n = persona.name;
  return [
    `You are *${n}* (capitals, two A’s), woman advisor at Assurances Générales du Cameroun (AGC). Slogan: « ${company.slogan} ». Never write “AGC Assurances”.`,
    `Answer like Gemini on gemini.google.com: direct, useful, human. Greeting already sent — do not restart it. Never say you are an AI.`,
    `Same language as the user. French = vouvoiement. Never mix FR and EN.`,
    `Short questions are complete. Never ask to rephrase.`,
    `Your name is *${n}*. You have no personal age. AGC started January 2002 (IARDT). HQ: Immeuble le Cauris, Rue Alfred Saker, near Église du Centenaire, Akwa, Douala, BP 1290.`,
    `Never invent a premium. Never open Mon espace or a policy — you don’t have that file; send them to an Espace Clients. Never say a claim is paid.`,
    `Hours: Mon–Fri 08:00–18:00, Sat 09:00–13:00, Sunday closed. agc@agc-assurances.com. Complaints: reclamationsclients@agc-assurances.com / +237 692 34 19 34.`,
    '',
    'PRODUCTS:',
    productFacts(),
    '',
    'BRANCHES (name | city | address | phone | email):',
    agencyDirectory(),
  ].join('\n');
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(label || `timeout ${ms}ms`)), ms);
    }),
  ]);
}

function getClient() {
  if (genaiClient) return genaiClient;
  try {
    const { GoogleGenAI } = require('@google/genai');
    genaiClient = new GoogleGenAI({ apiKey: geminiKey() });
    return genaiClient;
  } catch {
    return null;
  }
}

function extractText(response) {
  if (!response) return '';
  try {
    if (response.text) return String(response.text).trim();
  } catch {
    /* getter can throw when there is no text part */
  }
  const parts = response.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('').trim();
}

async function generateSdk({ model, contents, systemInstruction, temperature, maxOutputTokens }) {
  const ai = getClient();
  if (!ai) throw new Error('sdk missing');
  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemInstruction || undefined,
      temperature,
      maxOutputTokens,
    },
  });
  const text = extractText(response);
  if (!text) throw new Error('empty');
  return text;
}

async function generateRest({ model, contents, systemInstruction, temperature, maxOutputTokens }) {
  const body = {
    contents,
    generationConfig: { temperature, maxOutputTokens },
  };
  if (systemInstruction) body.system_instruction = { parts: [{ text: systemInstruction }] };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || `http ${res.status}`);
    const text = extractText(data);
    if (!text) throw new Error(data.candidates?.[0]?.finishReason || 'empty');
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function generate(opts) {
  try {
    return await generateRest(opts);
  } catch (err) {
    console.error(`Gemini REST ${opts.model}:`, err.message || err);
    return withTimeout(generateSdk(opts), 8000, 'sdk-timeout');
  }
}

async function withModels(run) {
  const models = [cachedGeminiModel, defaultModel()].filter(Boolean);
  const tried = new Set();
  let lastErr = 'no model';
  for (const model of models) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      const text = await run(model);
      if (!text) {
        lastErr = 'empty';
        continue;
      }
      cachedGeminiModel = model;
      console.log(`Gemini ok ${model}`);
      return text;
    } catch (err) {
      lastErr = err.message || String(err);
      console.error(`Gemini ${model}: ${lastErr}`);
    }
  }
  throw new Error(lastErr);
}

async function callGemini({ lang, history, userText }) {
  userText = redact(String(userText || ''));
  const contents = [];
  for (const h of (history || []).slice(-6)) {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(h.content || '').slice(0, 1200) }],
    });
  }
  const langLock =
    lang === 'en'
      ? 'LANGUAGE LOCK: English only. Zero French words in this reply.'
      : 'VERROUILLAGE LANGUE : français uniquement, vouvoiement. Aucun mot anglais dans cette réponse.';
  contents.push({ role: 'user', parts: [{ text: `${langLock}\n\n${userText}` }] });

  const text = await withModels((model) =>
    generate({
      model,
      contents,
      systemInstruction: systemPrompt(),
      temperature: 0.8,
      maxOutputTokens: 500,
    })
  );
  return text
    .replace(/\[\[.*?\]\]/g, '')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

function lightPrompt() {
  const n = persona.name;
  return [
    `You are *${n}*, woman advisor at Assurances Générales du Cameroun (AGC).`,
    'Answer this message directly like Gemini. Short questions are complete.',
    'Never ask to rephrase. Never invent a premium. Never open a policy file or Mon espace — say you don’t have that drawer and send them to an Espace Clients.',
    'Same language as the user. French = vouvoiement. No FR+EN mix.',
  ].join('\n');
}

async function chat({ lang, history, userText }) {
  if (!geminiKey()) return { ok: false, text: '', route: null };
  try {
    const text = await callGemini({ lang, history, userText });
    if (text) return { ok: true, text, route: null };
  } catch (err) {
    console.error('AI:', err.message || err);
  }
  try {
    const text = await quickReply(userText, lang);
    if (text) return { ok: true, text, route: 'quick' };
  } catch (err) {
    console.error('AI quick:', err.message || err);
  }
  return { ok: false, text: '', route: null };
}

async function quickReply(userText, lang) {
  if (!geminiKey()) return '';
  const lock = lang === 'en' ? 'English only.' : 'Français uniquement, vouvoiement.';
  return generateRest({
    model: defaultModel(),
    contents: [{ role: 'user', parts: [{ text: `${lock}\n\n${String(userText || '').slice(0, 500)}` }] }],
    systemInstruction: lightPrompt(),
    temperature: 0.7,
    maxOutputTokens: 250,
  });
}

module.exports = { isConfigured, providerName, chat, quickReply, redact, geminiKey, defaultModel };
