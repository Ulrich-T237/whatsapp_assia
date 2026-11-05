const sessions = require('./sessions');
const { processMessage, guessLang } = require('./engine');

function render(replies, session) {
  const texts = [];
  const menu = [];
  let n = 1;

  for (const r of replies || []) {
    if (r.type === 'text') texts.push(r.text);
    if (r.type === 'buttons') {
      texts.push(r.body);
      for (const b of r.buttons) {
        menu.push({ n, id: b.id, title: b.title });
        n += 1;
      }
    }
    if (r.type === 'list') {
      const head = r.header ? `*${r.header}*\n` : '';
      texts.push(`${head}${r.body}`);
      for (const section of r.sections || []) {
        for (const row of section.rows || []) {
          menu.push({ n, id: row.id, title: row.title });
          n += 1;
        }
      }
    }
  }

  session.menu = menu;
  if (menu.length) {
    const lines = menu.map((m) => `${m.n}. ${m.title}`);
    const hint =
      session.lang === 'en'
        ? `${lines.join('\n')}\n\n_Reply with the *number*, or type motor, health, quote, branch…_`
        : `${lines.join('\n')}\n\n_Répondez par le *numéro*, ou écrivez auto, santé, devis, agence…_`;
    texts.push(hint);
  }
  return texts.filter(Boolean).join('\n\n');
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function langFromFirstMessage(text) {
  return guessLang(text) || 'fr';
}

const TAP =
  /^(menu|auto|sante|voyage|autres|devis|sinistre|carte|conseiller|agences|horaires|multi|transport|rc|activate|lang_en|lang_fr)$|^(devis_|qp_|reg_|cl_)/;

async function handleIncomingRich(from, text) {
  const session = sessions.get(from);
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  session.activated = true;
  const guessed = guessLang(trimmed);
  if (guessed) session.lang = guessed;
  else if (!session.lang) session.lang = langFromFirstMessage(trimmed);

  const num = trimmed.match(/^([1-9]|1[0-5])$/);
  let replies;
  if (num && session.menu && session.menu.length) {
    const item = session.menu.find((m) => m.n === Number(num[1]));
    if (item) {
      replies = await processMessage({ from, text: item.title, payload: item.id });
    }
  }
  if (!replies && TAP.test(trimmed)) {
    replies = await processMessage({ from, text: trimmed, payload: trimmed });
  }
  if (!replies) {
    replies = await processMessage({ from, text: trimmed, payload: null });
  }
  const list = Array.isArray(replies) ? replies : replies ? [replies] : [];
  const flat = render(list, sessions.get(from));
  return { replies: list, flat };
}

async function handleIncoming(from, text) {
  const out = await handleIncomingRich(from, text);
  return out ? out.flat : null;
}

module.exports = { handleIncoming, handleIncomingRich, render };
