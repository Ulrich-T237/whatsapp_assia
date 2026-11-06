const { company, products, agencies, healthPartners, formatAgency } = require('./knowledge');
const productsEn = require('./products-en');
const sessions = require('./sessions');
const leads = require('./leads');
const ai = require('./ai');
const { introText, persona } = require('./config');

const GREET = /^(bonjour|bonsoir|salut|hello|hi|hey|bjr|slt|menu|accueil|start|demarrer|démarrer)$/i;
const NAME_STOP = new Set([
  'point',
  'rond',
  'face',
  'centre',
  'nord',
  'ouest',
  'sud',
  'est',
  'direction',
  'generale',
  'agence',
  'agences',
  'espace',
  'client',
  'clients',
  'social',
  'immeuble',
]);

function isNav(text) {
  const t = String(text || '').trim();
  if (GREET.test(t)) return true;
  return /^(menu|accueil|annuler|cancel|stop|retour|back|quitter)$/i.test(t);
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function allAgencies() {
  const out = [];
  for (const g of Object.values(agencies)) {
    for (const item of g.items) out.push(item);
  }
  return out;
}

function lookupAgencies(text) {
  const t = ` ${norm(text)} `;
  const all = allAgencies();
  const named = all.filter((a) => {
    const tokens = norm(a.name)
      .split(' ')
      .filter((w) => w.length >= 4 && !NAME_STOP.has(w));
    return tokens.some((tok) => t.includes(` ${tok} `));
  });
  if (named.length === 1) return named;
  if (named.length > 1 && named.length <= 3) return named;
  const cities = [...new Set(all.map((a) => norm(a.city)).filter(Boolean))];
  for (const city of cities) {
    if (city && t.includes(` ${city} `)) {
      return all.filter((a) => norm(a.city) === city);
    }
  }
  return null;
}

function agencyListReply(found, lang) {
  const en = lang === 'en';
  const list = found.map(formatAgency).join('\n\n');
  const title =
    found.length === 1
      ? en
        ? `AGC branch — *${found[0].name}*`
        : `Espace client AGC — *${found[0].name}*`
      : en
        ? `AGC branches${found[0].city ? ` — ${found[0].city}` : ''}`
        : `Espaces clients AGC${found[0].city ? ` — ${found[0].city}` : ''}`;
  return [
    { type: 'text', text: `${title}\n\n${list}` },
    {
      type: 'buttons',
      body: en ? 'Another branch?' : 'Une autre agence ?',
      buttons: [
        { id: 'agences', title: en ? 'Regions' : 'Régions' },
        { id: 'menu', title: 'Menu' },
      ],
    },
  ];
}

function langOf(from) {
  return sessions.get(from).lang === 'en' ? 'en' : 'fr';
}

const NEUTRAL_MSG = /^(menu|accueil|start|ok|oui|non|yes|no|[1-9]|10)$/i;
const EN_TOK = new Set(
  'i im am is are was were you your my me we they the this that what whats who where when why how which can could would should do does did dont didnt cant wont please thanks thank hello hi hey hungry bored food help need want old color colour moon health quote claim branch hours english motor car travel okay yeah not said didnt didn'.split(
    ' '
  )
);
const FR_TOK = new Set(
  'je tu vous nous le la les des une un est sont bonjour bonsoir salut merci oui non ou comment pourquoi quel quelle mon ma mes ton ta tes votre vos nos devis sinistre agence sante francais francaise assurance jai moi toi avec pour pas plus bien cest ca besoin horaires conseiller voiture voyage faim soif age mange'.split(
    ' '
  )
);

function guessLang(text) {
  const raw = String(text || '').trim();
  if (!raw || NEUTRAL_MSG.test(raw)) return null;
  const n = norm(raw);
  if (
    /\b(i m|i am|i ll|i ve|i d|don t|doesn t|can t|won t|what s|it s|how old|are you|am i|what color|i m hungry|i m bored|i need|who am i|not you)\b/.test(
      n
    )
  ) {
    return 'en';
  }
  if (/\b(j ai|jai|faim|soif|t a quelle|ta quelle|quelle age|quel age|tu as quel|ca va|c est|j ai faim|qui suis je)\b/.test(n)) {
    return 'fr';
  }
  const toks = n.split(/\s+/).filter(Boolean);
  let en = 0;
  let fr = 0;
  for (const w of toks) {
    if (EN_TOK.has(w)) en += 1;
    if (FR_TOK.has(w)) fr += 1;
  }
  if (en > fr) return 'en';
  if (fr > en) return 'fr';
  return null;
}

function applyMessageLang(session, text) {
  if (NEUTRAL_MSG.test(String(text || '').trim())) return;
  const guessed = guessLang(text);
  if (guessed) session.lang = guessed;
}

function pick(arr, seed) {
  const s = String(seed || '') + String(Date.now());
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return arr[Math.abs(h) % arr.length];
}

function remember(session, userText, assistantText) {
  session.history = [
    ...(session.history || []),
    { role: 'user', content: String(userText || '').slice(0, 500) },
    { role: 'assistant', content: String(assistantText || '').slice(0, 2000) },
  ].slice(-16);
}

function hqText(en) {
  return en
    ? `Our headquarters is in Douala:\n${company.hq}\n${company.bp}\n\n☎ ${company.phones.join(' / ')}\n✉ ${company.email}\n\nMon–Fri 8:00–18:00 · Sat 9:00–13:00 · Sunday closed.\n\nAnother city? Type it (Douala, Yaoundé, Bafoussam…).`
    : `Notre siège est à Douala :\n${company.hq}\n${company.bp}\n\n☎ ${company.phones.join(' / ')}\n✉ ${company.email}\n\nLun–Ven 8h–18h · samedi 9h–13h · dimanche fermé.\n\nUne autre ville ? Écrivez-la (Douala, Yaoundé, Bafoussam…).`;
}

function locProduct(id, lang) {
  const p = products[id];
  if (!p) return null;
  if (lang === 'en' && productsEn[id]) return { ...p, ...productsEn[id] };
  return p;
}

function welcomeReply(from, lang) {
  sessions.get(from).greeted = true;
  const en = lang === 'en';
  const menu = mainMenu(lang);
  menu.body = en ? 'Pick a number — or just type it 👇' : 'Choisissez un numéro — ou écrivez-le 👇';
  menu.footer = en ? 'Français / English — type it anytime' : 'Français / English — tapez-le quand vous voulez';
  return [{ type: 'text', text: introText(lang, true) }, menu];
}

function mainMenu(lang) {
  const en = lang === 'en';
  return {
    type: 'list',
    header: en ? 'AGC menu' : 'Menu AGC',
    body: pick(
      en
        ? ['What should we look at?', 'Pick a number — or type it.', 'Motor, health, a branch… your call.']
        : ['On regarde quoi ?', 'Choisissez un numéro — ou écrivez-le.', 'Auto, santé, une agence… à vous.'],
      `${lang}-menu`
    ),
    button: en ? 'Open menu' : 'Voir le menu',
    sections: [
      {
        title: en ? 'Products' : 'Produits',
        rows: [
          { id: 'auto', title: en ? 'Motor' : 'Automobile' },
          { id: 'sante', title: en ? 'Health' : 'Santé' },
          { id: 'voyage', title: en ? 'Travel' : 'Voyage' },
          { id: 'mrh', title: en ? 'Home MRH' : 'MRH habitation' },
          { id: 'autres', title: en ? 'Other products' : 'Autres produits' },
        ],
      },
      {
        title: 'Services',
        rows: [
          { id: 'devis', title: en ? 'Get a quote' : 'Demander un devis' },
          { id: 'sinistre', title: en ? 'File a claim' : 'Déclarer un sinistre' },
          { id: 'carte', title: en ? 'Health card' : 'Carte santé' },
        ],
      },
      {
        title: en ? 'Info' : 'Infos',
        rows: [
          { id: 'agences', title: en ? 'Our branches' : 'Nos agences' },
          { id: 'horaires', title: en ? 'Hours & contact' : 'Horaires & contact' },
        ],
      },
    ],
  };
}

function productReply(id, lang) {
  const p = locProduct(id, lang);
  if (!p) return null;
  const bullets = p.bullets.map((b) => `• ${b}`).join('\n');
  const en = lang === 'en';
  return [
    {
      type: 'text',
      text: `*${p.title}*\n\n${p.summary}\n\n${bullets}\n\n${en ? 'I don’t invent a premium. A counsellor prices it after a request.' : 'Je n’invente pas de prime. Un conseiller tarife après une demande.'}\n\n${en ? 'More' : 'Plus de détails'} : ${p.url}`,
    },
    {
      type: 'buttons',
      body: en ? 'Would you like a quote request for this?' : 'Souhaitez-vous une demande de devis pour ce produit ?',
      buttons: [
        { id: `devis_${id}`, title: en ? 'Yes, a quote' : 'Oui, un devis' },
        { id: 'menu', title: 'Menu' },
      ],
    },
  ];
}

function otherProducts(lang) {
  const en = lang === 'en';
  return [
    {
      type: 'text',
      text: en
        ? `*Other AGC products* ✨\n\n🚚 *Transport* — goods by road, sea or air\n⚖️ *Civil liability* — family or company\n🛠️ *Technical risks* — worksite, IT, oil equipment\n🏢 *Multi-risk* — shops, offices, SMEs, industry\n🩺 *Personal accident*\n\nHome cover is *MRH*. I keep it short; a counsellor quotes, I don’t.`
        : `*Autres produits AGC* ✨\n\n🚚 *Transport* — marchandises route, mer, air\n⚖️ *Responsabilité civile* — famille ou entreprise\n🛠️ *Risques techniques* — chantier, informatique, pétrole\n🏢 *Multirisques* — commerces, bureaux, PME, industrie\n🩺 *Individuelle accident*\n\nPour la maison, c’est la *MRH*. Je reste brève ; le tarif, c’est un conseiller.`,
    },
    {
      type: 'buttons',
      body: en ? 'Want one of these?' : 'Vous voulez l’un de ceux-là ?',
      buttons: [
        { id: 'devis', title: en ? 'Get a quote' : 'Demander un devis' },
        { id: 'mrh', title: 'MRH' },
        { id: 'menu', title: 'Menu' },
      ],
    },
  ];
}

function hoursReply(lang) {
  const en = lang === 'en';
  return {
    type: 'text',
    text: [
      `*Assurances Générales du Cameroun (AGC)*`,
      company.hq,
      company.bp,
      '',
      `✉ ${company.email}`,
      `☎ ${company.phones.join(' / ')}`,
      '',
      en ? 'Mon – Fri: 8:00 – 18:00' : company.hours.week,
      en ? 'Saturday: 9:00 – 13:00' : company.hours.saturday,
      en ? 'Sunday: closed' : company.hours.sunday,
      '',
      en
        ? `Complaints: reclamationsclients@agc-assurances.com / +237 692 34 19 34`
        : `Réclamations : reclamationsclients@agc-assurances.com / +237 692 34 19 34`,
      '',
      company.website,
    ].join('\n'),
  };
}

function carteSante(lang) {
  const en = lang === 'en';
  const dla = healthPartners.douala.slice(0, 8).map((x) => `• ${x}`).join('\n');
  const yde = healthPartners.yaounde.map((x) => `• ${x}`).join('\n');
  return {
    type: 'text',
    text: en
      ? `*AGC biometric health card*\n\nFewer paper guarantees: pharmacy, consultations, hospital, lab, imaging.\n\n*Some partners — Douala*\n${dla}\n\n*Yaoundé*\n${yde}\n\nFull list: ${products.sante.url}`
      : `*Carte santé biométrique AGC*\n\nElle limite les bons de prise en charge : pharmacie, consultations, hospitalisations, analyses, imagerie.\n\n*Quelques partenaires — Douala*\n${dla}\n\n*Yaoundé*\n${yde}\n\nListe complète : ${products.sante.url}`,
  };
}

function agencyMenu(lang) {
  const en = lang === 'en';
  return {
    type: 'list',
    body: en ? 'Where do you need an AGC branch?' : 'Où cherchez-vous une agence AGC ?',
    button: en ? 'Choose region' : 'Choisir la région',
    sections: [
      {
        title: en ? 'Regions' : 'Régions',
        rows: [
          { id: 'reg_littoral', title: 'Littoral / Sud-Ouest' },
          { id: 'reg_centre', title: 'Centre / Nord-Ouest' },
          { id: 'reg_ouest', title: 'Ouest' },
          { id: 'reg_nord', title: 'Nord / Grand Nord' },
          { id: 'reg_sudest', title: 'Sud / Est' },
        ],
      },
    ],
  };
}

function regionReply(key, lang) {
  const g = agencies[key];
  const en = lang === 'en';
  if (!g) {
    return { type: 'text', text: en ? 'Unknown region. Type *menu*.' : 'Région inconnue. Tapez *menu*.' };
  }
  return {
    type: 'text',
    text: `*${en ? 'Branches' : 'Agences'} — ${g.title}*\n\n${g.items.map(formatAgency).join('\n\n')}\n\n${en ? 'Type *menu* to go back.' : 'Tapez *menu* pour revenir.'}`,
  };
}

function quoteProductList(lang) {
  const en = lang === 'en';
  return {
    type: 'list',
    body: en ? 'Which product do you want a *free quote request* for?' : 'Pour quel produit voulez-vous une *demande de devis* ?',
    button: en ? 'Choose product' : 'Choisir le produit',
    sections: [
      {
        title: en ? 'Quote' : 'Devis',
        rows: [
          { id: 'qp_auto', title: en ? 'Motor' : 'Automobile' },
          { id: 'qp_sante', title: en ? 'Health' : 'Santé' },
          { id: 'qp_voyage', title: en ? 'Travel' : 'Voyage' },
          { id: 'qp_mrh', title: en ? 'Home MRH' : 'MRH habitation' },
          { id: 'qp_multi', title: en ? 'Multi-risk' : 'Multirisques' },
          { id: 'qp_transport', title: en ? 'Cargo' : 'Transport' },
          { id: 'qp_rc', title: en ? 'Liability' : 'Responsabilité civile' },
        ],
      },
    ],
  };
}

function notifyNote(en) {
  if (leads.canNotify()) {
    return en ? 'AGC has been notified on the lead channel.' : 'AGC a été notifiée sur le canal des demandes.';
  }
  return en
    ? `This chat cannot email AGC by itself. Call ${company.phones[0]} or write ${company.email} with these details.`
    : `Cette conversation n’envoie pas d’email toute seule. Appelez ${company.phones[0]} ou écrivez à ${company.email} avec ces infos.`;
}

function quoteSavedText(en, lead, data) {
  const head = en ? `✅ *Request saved* (n° ${lead.id.slice(0, 8)})` : `✅ *Demande enregistrée* (n° ${lead.id.slice(0, 8)})`;
  const body = en
    ? `Product: ${data.productTitle}\nName: ${data.name}\nCity: ${data.city}`
    : `Produit : ${data.productTitle}\nNom : ${data.name}\nVille : ${data.city}`;
  return `${head}\n\n${body}\n\n${notifyNote(en)}\n${en ? 'Urgent' : 'Urgence'} : ${company.phones[0]}`;
}

function claimSavedText(en, lead) {
  const head = en ? `✅ *Claim recorded* (n° ${lead.id.slice(0, 8)})` : `✅ *Sinistre enregistré* (n° ${lead.id.slice(0, 8)})`;
  return `${head}\n\n${notifyNote(en)}\n${company.phones.join('\n')}\n\n${en ? 'I cannot settle a claim from this chat. An AGC file manager follows it.' : 'Je ne règle pas un sinistre depuis ce chat. Un gestionnaire AGC suit le dossier.'}`;
}

function counselorText(en) {
  return en
    ? `I’ll stay with you 😊 For a human AGC adviser: ${company.phones[0]} or ${company.email}.\n${notifyNote(en)}\nComplaints: reclamationsclients@agc-assurances.com / +237 692 34 19 34.`
    : `Je reste avec vous 😊 Pour un conseiller AGC en chair et en os : ${company.phones[0]} ou ${company.email}.\n${notifyNote(en)}\nRéclamations : reclamationsclients@agc-assurances.com / +237 692 34 19 34.`;
}

function mapClaimType(text) {
  const t = norm(text);
  if (/auto|voiture|accident/.test(t)) return 'auto';
  if (/sante|health|hopital/.test(t)) return 'sante';
  if (/\bvol\b|\btheft\b|\bvole\b/.test(t)) return 'vol';
  if (/incendie|fire|degat/.test(t)) return 'incendie';
  if (/autre|other/.test(t)) return 'autre';
  return null;
}

function matchQuoteProduct(text) {
  const t = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (/^(1|auto|automobile|voiture|moto|motor|car|taxi)$/.test(t)) return 'auto';
  if (/^(2|sante|health|maladie)$/.test(t)) return 'sante';
  if (/^(3|voyage|travel)$/.test(t)) return 'voyage';
  if (/^(4|mrh|habitation|maison|home)$/.test(t)) return 'mrh';
  if (/^(multi|multirisque|multirisques)$/.test(t)) return 'multi';
  if (/^(5|transport|cargo|marchandise)$/.test(t)) return 'transport';
  if (/^(6|rc|responsabilite|liability)$/.test(t)) return 'rc';
  if (/\b(auto|moto|voiture|motor)\b/.test(t) && t.split(/\s+/).length <= 4) return 'auto';
  return null;
}

function startQuote(from, productId) {
  const lang = langOf(from);
  const en = lang === 'en';
  const p = locProduct(productId, lang);
  const title = p ? p.title : productId;
  const prev = sessions.get(from);
  const existingName = prev.data && prev.data.name;
  if (existingName) {
    sessions.setStep(from, 'quote_city', {
      product: productId,
      productTitle: title,
      name: existingName,
    });
    return {
      type: 'text',
      text: en
        ? `Quote request for *${title}* (${existingName}). I will not invent a price.\nWhich *city* are you in?`
        : `Demande de devis *${title}* (${existingName}). Je n’invente pas de tarif.\nDans *quelle ville* êtes-vous ?`,
    };
  }
  sessions.setStep(from, 'quote_name', { product: productId, productTitle: title });
  return {
    type: 'text',
    text: en
      ? `Quote request for *${title}* — free, not binding, no price invented here.\n\nWhat is your *full name*?`
      : `Demande de devis *${title}* — gratuit, sans engagement, aucun tarif inventé ici.\n\nQuel est *votre nom et prénom* ?`,
  };
}

function handleQuoteProduct(from, session, text) {
  const lang = langOf(from);
  const en = lang === 'en';
  const id = matchQuoteProduct(text);
  if (id) return startQuote(from, id);
  const looksName = /[a-zà-ÿ]/i.test(text) && !/^\d+$/.test(text) && text.length >= 2;
  if (looksName) {
    sessions.setStep(from, 'quote_product', { ...(session.data || {}), name: text });
    return [
      {
        type: 'text',
        text: en
          ? `Thanks ${text}. Which product should we quote? Reply with a number or e.g. motor, health.`
          : `Merci ${text}. Pour quel produit ? Répondez par un numéro ou auto, santé, voyage…`,
      },
      quoteProductList(lang),
    ];
  }
  return [quoteProductList(lang)];
}

function handleQuote(from, session, text) {
  const en = langOf(from) === 'en';
  if (session.step === 'quote_name') {
    sessions.setStep(from, 'quote_city', { name: text });
    return { type: 'text', text: en ? `Thanks ${text}.\nWhich *city* are you in?` : `Merci ${text}.\nDans *quelle ville* êtes-vous ?` };
  }
  if (session.step === 'quote_city') {
    sessions.setStep(from, 'quote_details', { city: text });
    if (session.data.product === 'auto') {
      return {
        type: 'text',
        text: en
          ? 'Give the *make, year and use* of the vehicle (e.g. Toyota 2018, taxi).'
          : 'Indiquez la *marque, l’année et l’usage* du véhicule (ex. Toyota 2018, taxi).',
      };
    }
    if (session.data.product === 'sante') {
      return {
        type: 'text',
        text: en
          ? 'How many *people* to cover, family or company?'
          : 'Indiquez *le nombre de personnes* à assurer et si c’est famille ou entreprise.',
      };
    }
    return {
      type: 'text',
      text: en ? 'Briefly describe your *need* (2–3 sentences).' : 'Décrivez *brièvement votre besoin* (2–3 phrases).',
    };
  }
  if (session.step === 'quote_details') {
    const data = { ...session.data, details: text, from };
    const lead = leads.add({ kind: 'devis', ...data, phone: from });
    sessions.reset(from);
    return [
      { type: 'text', text: quoteSavedText(en, lead, data) },
      {
        type: 'buttons',
        body: en ? 'Anything else?' : 'Autre chose ?',
        buttons: [
          { id: 'menu', title: 'Menu' },
          { id: 'agences', title: en ? 'Branches' : 'Agences' },
        ],
      },
    ];
  }
  return null;
}

function startClaim(from) {
  const en = langOf(from) === 'en';
  sessions.setStep(from, 'claim_type');
  return {
    type: 'list',
    body: en
      ? 'What type of claim is this? I record it — I cannot pay or refuse a claim from this chat.'
      : 'Quel type de sinistre ? Je l’enregistre — je ne paie ni ne refuse un dossier depuis ce chat.',
    button: en ? 'Claim type' : 'Type de sinistre',
    sections: [
      {
        title: en ? 'Claim' : 'Sinistre',
        rows: [
          { id: 'cl_auto', title: en ? 'Motor accident' : 'Accident auto' },
          { id: 'cl_sante', title: en ? 'Health / hospital' : 'Santé / hospitalisation' },
          { id: 'cl_vol', title: en ? 'Theft' : 'Vol' },
          { id: 'cl_incendie', title: en ? 'Fire / damage' : 'Incendie / dégâts' },
          { id: 'cl_autre', title: en ? 'Other' : 'Autre' },
        ],
      },
    ],
  };
}

function handleClaim(from, session, text) {
  const en = langOf(from) === 'en';
  if (session.step === 'claim_policy') {
    sessions.setStep(from, 'claim_desc', { policy: text });
    return {
      type: 'text',
      text: en
        ? 'Describe *what happened* (date, place, damage).'
        : 'Décrivez *ce qui s’est passé* (date, lieu, dégâts).',
    };
  }
  if (session.step === 'claim_desc') {
    const data = { ...session.data, description: text, from };
    const lead = leads.add({ kind: 'sinistre', ...data, phone: from });
    sessions.reset(from);
    return { type: 'text', text: claimSavedText(en, lead) };
  }
  return null;
}

function counselor(from) {
  const en = langOf(from) === 'en';
  sessions.setStep(from, 'idle', {});
  sessions.get(from).handoff = false;
  leads.add({ kind: 'callback', phone: from, details: 'callback' });
  return { type: 'text', text: counselorText(en) };
}



async function freeTalk(from, userText, extra) {
  const session = sessions.get(from);
  const spoken = langOf(from);
  const topic = extra && extra.topic;
  let asked = String(userText || '').trim();
  if (topic) {
    asked += `\n[Context: the user selected AGC menu item “${topic}”. Answer from AGC facts for that item. Never invent a premium. Do not restart the greeting.]`;
  }
  if (session.data && session.data.name) {
    asked += `\n[Name they shared in this chat: ${session.data.name}]`;
  }
  const guide = await ai.chat({ lang: spoken, history: session.history || [], userText: asked });
  if (guide.ok && guide.text) {
    remember(session, userText, guide.text);
    return [{ type: 'text', text: guide.text }];
  }
  return [];
}

function handlePayload(from, payload) {
  const lang = langOf(from);
  if (!payload) return null;
  if (payload === 'menu' || payload === 'activate') return welcomeReply(from, lang);
  if (payload === 'lang_en') {
    sessions.get(from).lang = 'en';
    return [{ type: 'text', text: `Perfect — *${persona.name}* will stay with you in English 😊` }, mainMenu('en')];
  }
  if (payload === 'lang_fr') {
    sessions.get(from).lang = 'fr';
    return [{ type: 'text', text: `Parfait — *${persona.name}* continue avec vous en français 😊` }, mainMenu('fr')];
  }
  return null;
}

async function processMessage({ from, text, payload }) {
  const session = sessions.get(from);
  const trimmed = (text || '').trim();
  applyMessageLang(session, trimmed);
  const lang = langOf(from);
  const low = trimmed.toLowerCase();

  if (/^(english|anglais|in english|en anglais)$/i.test(low) || low === 'en') {
    session.lang = 'en';
    session.handoff = false;
    sessions.reset(from);
    sessions.get(from).greeted = true;
    sessions.get(from).lang = 'en';
    return [{ type: 'text', text: `Perfect — *${persona.name}* will stay with you in English 😊` }, mainMenu('en')];
  }
  if (
    /^(français|francais|francaise|française|in french|en francais|en français|en francaise|en française|french)$/i.test(low) ||
    low === 'fr'
  ) {
    session.lang = 'fr';
    session.handoff = false;
    sessions.reset(from);
    sessions.get(from).greeted = true;
    sessions.get(from).lang = 'fr';
    return [{ type: 'text', text: `Parfait — *${persona.name}* continue avec vous en français 😊` }, mainMenu('fr')];
  }

  if (payload) {
    const out = handlePayload(from, payload);
    if (out) return Array.isArray(out) ? out : [out];
  }

  if (!payload && GREET.test(trimmed)) {
    return welcomeReply(from, langOf(from));
  }

  if (!trimmed) return welcomeReply(from, langOf(from));
  return freeTalk(from, trimmed || payload, payload ? { topic: payload } : {});
}

module.exports = { processMessage, mainMenu, guessLang };
