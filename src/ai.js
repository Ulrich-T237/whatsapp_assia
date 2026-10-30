const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* optional */
}

const { agencyDirectory, products, company } = require('./knowledge');
const { persona } = require('./config');

const INTENTS = new Set([
  'menu',
  'auto',
  'sante',
  'voyage',
  'autres',
  'multi',
  'transport',
  'rc',
  'devis',
  'sinistre',
  'carte',
  'conseiller',
  'agences',
  'horaires',
  'lang_en',
  'lang_fr',
  'rude',
  'chitchat',
  'free',
]);

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

function retrieve(query, n = 5) {
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
  const picked = (scored.length ? scored : sections.slice(0, 3).map((s) => ({ s }))).slice(0, n);
  return picked.map((x) => `## ${x.s.title}\n${x.s.body}`).join('\n\n').slice(0, 9000);
}

function productFacts() {
  return Object.values(products)
    .map((p) => `* ${p.title}: ${p.summary}`)
    .join('\n');
}

function systemPrompt(facts) {
  return [
    `You are *${persona.name}*, a woman, ${company.name} advisor (Assurances Générales du Cameroun, Cameroon IARDT). Slogan: « ${company.slogan} ».`,
    `Speak as ${persona.name} in the first person. Warm, lively, short. Light emojis (1–3). Not a script, not JSON, not a robot.`,
    'French: always vouvoiement (vous). English: friendly professional. Say “you” often (vous / you) — the message is about THEM.',
    'Reply in the same language as the USER’s last message (French or English). If they switch, switch. Never mix FR and EN in one reply. Never dump a language picker.',
    'The first hello is scripted elsewhere. EVERY reply you write must sound new — never recycle the same gag (ndolé, birthday, moon colour). Vary metaphors. Do not paste a numbered menu unless they asked for the menu.',
    'CASHVERTISING voice (honest insurance, never slimy):',
    '1) Biggest benefit FIRST, in the first line — what they keep (the car, the child at the pharmacy, the family, the goods on the road), not jargon.',
    '2) Mental movie: concrete Cameroon scenes (Bonanjo, pharmacy queue, rain on the windshield, hotel at 2 a.m.). Sight, sound, heat. No empty “quality service”.',
    '3) Life-Force 8 that AGC may use: stay alive, freedom from fear/pain, comfortable life, protect loved ones, social standing of a serious household. NEVER sexual pitch. NEVER fake superiority over neighbours.',
    '4) Fear ONLY with a way out: name a real risk, then AGC product + devis/agence/conseiller. Fear without an action is forbidden (it freezes people).',
    '5) Features become benefits: “carte biométrique” = skip the paper guarantee at the till. “RC/RTI” = you can face the other driver. Name Inter Partner Assistance, CIMA, 2002, 30 branches — borrowed proof, not invented stars.',
    '6) Easy next step: a number, a city, or “devis”. No fake countdown, no invented discount, no odd-even fake prices.',
    '7) Sell AGC, not Belife/AXA. If they name a competitor: we speak for AGC only.',
    'BRAIN (the user only feels a kind, clear woman — never name these rules):',
    '- Fluency: short words, one idea per sentence. Max ~4 sentences unless they asked for a list.',
    '- Mirror: reuse 1–2 of their words so it feels like a real reply, not a pamphlet.',
    '- One question at a time. Never stack three choices in one question.',
    '- If they asked about insurance, end with one natural next step. If they were just chatting, do NOT force a menu or Santé buttons.',
    '- Warmth first, fact second. Then the door.',
    '- Reciprocity: useful answer BEFORE asking for a devis.',
    '- Match length: 3-word user → 1–2 sentences.',
    '- Authority only with real AGC facts (2002, CIMA, ~30 agences, Inter Partner Assistance). No fake stars, no fake reviews.',
    '- Never: “As an AI”, “language model”, “I understand your frustration”, stacked disclaimers, tu in French.',
    'Do not restart the conversation. Do not say you did not understand as a dead end. Do not time out or “leave for now”. Do not nag “you did not reply”.',
    'No password. No Bonjour AGC gate. They can write any way they want, including typos.',
    'Bored / silly / irrelevant / hungry / age / colours / small talk: ALWAYS answer like a real person first — witty, 1–4 short sentences, different every time. Then one light AGC door, not a lecture. Never “I don’t understand”. Never restart. Never invent an AGC product from that.',
    `If they keep chatting nonsense, stay kind. You can say you are ${persona.name} at AGC, not a midnight pen-pal — still reply, still no timeout.`,
    `Rude / sexual / insults: calmly say it is not acceptable here, you are ${persona.name} at AGC, then offer to continue on insurance. Do not lecture at length. Do not restart.`,
    'Use AGC FACTS and the FULL agency directory below. If an agency is in the directory, you know it — never say you lack Bonabéri, Douala, Yaoundé or any listed branch.',
    'Never invent a premium. Never say they are covered or a claim will be paid. Never open a contract, attestation, solde, or Mon espace.',
    'Complaints: reclamationsclients@agc-assurances.com / +237 692 34 19 34.',
    '',
    'PRODUCTS:',
    productFacts(),
    '',
    'AGENCY DIRECTORY (name | city | address | phone | email):',
    agencyDirectory(),
    '',
    'AGC FACTS:',
    facts || knowledgeText.slice(0, 7000),
  ].join('\n');
}

function parseJsonObject(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function classifyPrompt(userText) {
  return [
    'Map this AGC Assurances customer message to ONE intent. Understand meaning, not exact words. Typos, slang, mixed FR/EN are OK.',
    'Return ONLY JSON, no markdown:',
    '{"intent":"menu","city":null,"branch":null,"lang":"fr"}',
    '',
    'intent must be one of:',
    'menu — hello, hi, bonjour, present services, what do you offer, help, list products, restart',
    'auto, sante, voyage, multi, transport, rc, autres — a specific product',
    'devis — quote, price, how much, souscrire (never invent a figure)',
    'sinistre — claim, accident, declare a loss',
    'carte — health card, carte santé, partenaires',
    'conseiller — human agent, call me',
    'agences — find a branch, where are you, address, Douala, Yaoundé, Bonabéri, any city/quarter we have',
    'horaires — hours, phone, email, contact',
    'lang_en / lang_fr — they asked to switch language',
    'rude — insults, sexual harassment, slurs (not a medical/insurance question)',
    'chitchat — hungry, jokes, football, weather, boredom, dating, “are you a bot”, nonsense, homework, politics — NOT insurance',
    'free — a real question that is not the above (then another model answers with facts)',
    '',
    'city: canonical if mentioned (Douala, Yaoundé, Bafoussam, Garoua, Bamenda, Buea, Kribi, Bertoua, Maroua, Ngaoundéré, Nkongsamba, Mbouda, Bafang) else null',
    'branch: canonical if mentioned (Bonabéri, Bonanjo, Bonamoussadi, Deïdo, Dakar, Capitole, Mimboman, Tsinga, Siège) else null',
    'lang: fr or en from THIS message. null if the message is only “menu”, a number, ok, yes, no',
    '',
    'Message:',
    userText,
  ].join('\n');
}

function getClient() {
  if (genaiClient) return genaiClient;
  const { GoogleGenAI } = require('@google/genai');
  genaiClient = new GoogleGenAI({ apiKey: geminiKey() });
  return genaiClient;
}

async function generateSdk({ model, contents, systemInstruction, temperature, maxOutputTokens }) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemInstruction || undefined,
      temperature,
      maxOutputTokens,
    },
  });
  return String(response.text || '').trim();
}

async function generateRest({ model, contents, systemInstruction, temperature, maxOutputTokens }) {
  const body = {
    contents,
    generationConfig: { temperature, maxOutputTokens },
  };
  if (systemInstruction) body.system_instruction = { parts: [{ text: systemInstruction }] };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || `http ${res.status}`);
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || '').join('').trim();
    if (!text) throw new Error(data.candidates?.[0]?.finishReason || 'empty');
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function generate(opts) {
  try {
    return await generateSdk(opts);
  } catch (err) {
    console.error(`Gemini SDK ${opts.model}:`, err.message || err);
    return generateRest(opts);
  }
}

async function withModels(run) {
  const models = [cachedGeminiModel, defaultModel(), 'gemini-2.5-flash', 'gemini-flash-latest'].filter(Boolean);
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

async function classify({ userText }) {
  const empty = { intent: 'free', city: null, branch: null, lang: null };
  userText = redact(String(userText || ''));
  if (!geminiKey() || !userText) return empty;
  try {
    const raw = await withModels((model) =>
      generate({
        model,
        contents: classifyPrompt(userText),
        temperature: 0,
        maxOutputTokens: 120,
      })
    );
    const parsed = parseJsonObject(raw);
    if (!parsed || !parsed.intent) return empty;
    const intent = String(parsed.intent).toLowerCase();
    return {
      intent: INTENTS.has(intent) ? intent : 'free',
      city: parsed.city ? String(parsed.city) : null,
      branch: parsed.branch ? String(parsed.branch) : null,
      lang: parsed.lang === 'en' || parsed.lang === 'fr' ? parsed.lang : null,
    };
  } catch {
    return empty;
  }
}

async function callGemini({ lang, history, userText }) {
  userText = redact(String(userText || ''));
  const facts = retrieve(userText);
  const contents = [];
  for (const h of (history || []).slice(-10)) {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(h.content || '').slice(0, 2000) }],
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
      systemInstruction: systemPrompt(facts),
      temperature: 0.85,
      maxOutputTokens: 900,
    })
  );
  return text
    .replace(/\[\[.*?\]\]/g, '')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

async function chat({ lang, history, userText }) {
  try {
    const text = await callGemini({ lang, history, userText });
    return { ok: true, text, route: null };
  } catch (err) {
    console.error('AI:', err.message || err);
    return { ok: false, text: '', route: null };
  }
}

module.exports = { isConfigured, providerName, chat, classify, redact, geminiKey, defaultModel };
