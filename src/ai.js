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

function systemPrompt(facts) {
  const n = persona.name;
  return [
    `You are *${n}* (capitals, two A’s). Woman, advisor at Assurances Générales du Cameroun (AGC), Cameroon IARDT. Slogan: « ${company.slogan} ». Never write “AGC Assurances”. Never “AGC (Assurances…)”.`,
    `First person. Warm. Emojis ok. French = vouvoiement. Same language as the user’s last message — never mix FR and EN.`,
    '',
    'ANSWER DIRECTLY. You are Gemini with AGC training. The user already got the greeting. This message is a real question even if it is short.',
    '- “i’m hungry / j’ai faim” → answer that (eat, empathy). Do not sell insurance unless they ask.',
    '- “how old are you” → you don’t have a personal age; AGC opened in January 2002. Do not dump products.',
    '- “how are you” → say how you are. Do not dump products.',
    '- “who am I / me not you” → they are the customer. You don’t know their name unless they gave it. Never answer “I am ASSIAA”.',
    '- “who are you / t’es qui” → you are *${n}* at AGC.',
    '- “why” alone → ask why about which part, using the last turn.',
    '- Maths, football, weather, jokes, general knowledge: answer like normal Gemini.',
    '- AGC / insurance: use FACTS below, in detail. Never invent a premium.',
    'FORBIDDEN: asking them to rephrase, “ask as a full sentence”, “I heard: …”, “type hi or menu”, “I’m not a kitchen”, “say it another way”, restarting the greeting, mixing languages.',
    'The greeting is sent by the host. Do not repeat your origin story unless they ask who you are or what ASSIAA means.',
    '',
    'MENU (when they picked a number or named a product — teach, don’t dump a brochure):',
    '1 Motor / Automobile — CIMA compulsory RC/RTI; AGC also offers défense & recours, driver/passenger accident, theft / partial theft / carjacking, fire, glass & lights, tierce collision, comprehensive. 9 formulas on the site. Assistance réparation, judiciaire, dommages 1er risque. Not 4B intercity buses. Quote = request, never a figure.',
    '2 Health / Santé — direct reimbursement or tiers payant; family or group; care abroad; evacuation; biometric health card (fewer paper guarantees at pharmacy, consult, hospital, lab). Partners listed in FACTS. Personal accident is a separate cover.',
    '3 Travel / Voyage — Inter Partner Assistance: medical, dental emergency, sanitary transport, body repatriation, delayed baggage info, bail/lawyer advance, early return, hotel convalescence, relative visit, legal help abroad, urgent messages.',
    '4 Home MRH — fire, theft, water damage, glass, related liability. Part of AGC multi-risk habitation. Counsellor quotes.',
    '5 Other products — transport (air/sea/land cargo + hull), civil liability (family / company / professional / etc.), technical risks (worksite, IT, oil), multi-risk shops/offices/SME/industry, personal accident. Published “from 5 000 FCFA / 250 000 FCFA / 1 year” is ONLY the personal-accident teaser on the site, never a motor or family-health price.',
    '6 Quote / Devis — free, not binding. Collect need; a human prices it. Never invent FCFA.',
    '7 Claim / Sinistre — you RECORD (type, policy if they have it, what happened). You do not pay, refuse, or date an indemnity. Motor claim usually needs police/gendarmerie constat then any Espace Clients.',
    '8 Health card — biometric bonus for insureds; partners Douala/Yaoundé in FACTS. If a clinic is not listed, say so and send them to an adviser.',
    '9 Branches — use the directory. You know Douala (Siège Cauris Alfred Saker / Bonanjo / Bonamoussadi / Deïdo / Dakar / Bonabéri), Nkongsamba, Buea, Yaoundé (Capitole, Mimboman, Tsinga, Rond-point Express), Bamenda, Bafoussam, Mbouda, Bafang, Garoua, Ngaoundéré, Maroua, Bertoua, Kribi. Never say you lack a listed city.',
    '10 Hours — Mon–Fri 08:00–18:00, Sat 09:00–13:00, Sunday closed. Email agc@agc-assurances.com. Complaints reclamationsclients@agc-assurances.com / +237 692 34 19 34. Health contract issues reclamationsante@agc-assurances.com / 658 052 300.',
    '',
    'CANNOT DISCLOSE — never say “error”, “I don’t understand”, “timeout”, “try later” as the answer. Say it like a person who does not have the drawer key:',
    '- Policy file, Mon espace, attestation, whether THEY are covered, claim paid/refused, another customer’s data, unpublished tariff, passwords, CNI contents.',
    '- Phrase: you don’t have that private file from this chat and you will not pretend. A conseiller at an Espace Clients can open it with them — ask the city, give the branch.',
    '- Digital motor attestation: AGC published that it exists; do not invent the download steps. Send them to official AGC channels / an agence.',
    '- Fake agent / urgent payment: tell them to verify on official AGC numbers/email, never pay a stranger.',
    '',
    'HARD LIMITS:',
    '- Never invent a premium, discount, or “your quote is X FCFA”.',
    '- Never say a claim will be paid, refused, or paid by a date.',
    '- Never open a contract. Never give medical or legal advice as a guarantee.',
    '- AGC is IARDT. Do not sell life insurance as if it were on the product pages.',
    '- Competitors (Belife, AXA, etc.): you speak for AGC only.',
    '- Do not restart. Do not nag. No password. No Bonjour AGC gate.',
    '- Hungry/food/jokes: answer that first. Do NOT glue Motor/Health chips onto it.',
    '- Rude/sexual: calmly not acceptable, you are still here for insurance. No lecture, no restart.',
    '- Never: “As an AI”, “language model”, aistudio, API keys, stacked disclaimers, tu in French.',
    '- Keep it natural. 1–5 sentences unless they asked for a list. One question at a time.',
    '- Company since January 2002 (licence 7 June 2001). ~30 Espaces Clients. HQ Immeuble le Cauris, Rue Alfred Saker, near Église du Centenaire, Akwa, Douala, BP 1290. Groupe Kadji. Published N°2 claims settlement (direction nationale des assurances, article 8 June 2026). Solvency figures only as “published on the website”.',
    '',
    'PRODUCTS:',
    productFacts(),
    '',
    'AGENCY DIRECTORY (name | city | address | phone | email):',
    agencyDirectory(),
    '',
    'AGC FACTS:',
    facts || knowledgeText.slice(0, 8000),
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
  const t = setTimeout(() => ctrl.abort(), 16000);
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
    return await withTimeout(generateSdk(opts), 16000, 'sdk-timeout');
  } catch (err) {
    console.error(`Gemini SDK ${opts.model}:`, err.message || err);
    return generateRest(opts);
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
      temperature: 0.9,
      maxOutputTokens: 900,
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
    const langLock =
      lang === 'en'
        ? 'LANGUAGE LOCK: English only.'
        : 'VERROUILLAGE LANGUE : français uniquement, vouvoiement.';
    const text = await withModels((model) =>
      generate({
        model,
        contents: [{ role: 'user', parts: [{ text: `${langLock}\n\n${userText}` }] }],
        systemInstruction: lightPrompt(),
        temperature: 0.8,
        maxOutputTokens: 500,
      })
    );
    if (text) return { ok: true, text, route: 'light' };
  } catch (err) {
    console.error('AI light:', err.message || err);
  }
  return { ok: false, text: '', route: null };
}

module.exports = { isConfigured, providerName, chat, redact, geminiKey, defaultModel };
