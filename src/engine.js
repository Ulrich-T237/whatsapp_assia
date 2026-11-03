const { company, products, agencies, healthPartners, formatAgency } = require('./knowledge');
const productsEn = require('./products-en');
const sessions = require('./sessions');
const leads = require('./leads');
const ai = require('./ai');
const { disclaimer, aiNote, introText, persona, productHooks } = require('./config');

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
  'i im am is are was were you your my me we they the this that what whats who where when why how which can could would should do does did dont didnt cant wont please thanks thank hello hi hey hungry bored food help need want old color colour moon health quote claim branch hours english motor car travel okay yeah not'.split(
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
    /\b(i m|i am|i ll|i ve|i d|don t|doesn t|can t|won t|what s|it s|how old|are you|am i|what color|i m hungry|i m bored|i need)\b/.test(
      n
    )
  ) {
    return 'en';
  }
  if (
    /\b(j ai|jai|faim|soif|t a quelle|ta quelle|quelle age|quel age|tu as quel|ca va|c est|j ai faim)\b/.test(n)
  ) {
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

function applyMessageLang(session, text, classifiedLang) {
  if (NEUTRAL_MSG.test(String(text || '').trim())) return;
  const guessed = guessLang(text);
  if (guessed) {
    session.lang = guessed;
    return;
  }
  if (classifiedLang === 'en' || classifiedLang === 'fr') session.lang = classifiedLang;
}

function pick(arr, seed) {
  const s = String(seed || '') + String(Date.now());
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return arr[Math.abs(h) % arr.length];
}

function localAnswer(lang, text) {
  const n = persona.name;
  const en = lang === 'en';
  const t = norm(text);
  if (isNonsense(text)) {
    return pick(
      en
        ? [
            `I got the keys, not the sentence 😄 I’m *${n}* at AGC. A city, *motor*, *health*, or *menu*.`,
            `That one’s a jumble. Still here at AGC. Try a city or *menu*.`,
          ]
        : [
            `J’ai les touches, pas la phrase 😄 Je suis *${n}* chez AGC. Une ville, *auto*, *santé*, ou *menu*.`,
            `C’est du charabia. Je suis toujours là. Une ville ou *menu*.`,
          ],
      text
    );
  }
  if (/faim|hungry|mange|food|soif|thirsty|rice|riz|ndole|eat/.test(t)) {
    return pick(
      en
        ? [
            `Eat first 😊 I don’t cook — I cover people, not plates.`,
            `Grab a plate. I’ll still be here when you’re done.`,
            `Rice, ndolé, whatever’s on the fire — enjoy it. I’m not going anywhere.`,
          ]
        : [
            `Allez manger 😊 Je ne cuisine pas — je couvre les gens, pas les plats.`,
            `Un plat d’abord. Je suis toujours là après.`,
            `Ndolé, riz, peu importe — savourez. Je ne disparais pas.`,
          ],
      text
    );
  }
  if (/how old|quel age|quelle age|tu as quel|t a quelle|age are you|c a quelle age/.test(t)) {
    return pick(
      en
        ? [
            `Me? Old enough. AGC has been here since *2002* 😄 I cover cars and people — not birthday cake.`,
            `I don’t do birthdays. AGC opened in *2002*. Your car and your health, I do.`,
          ]
        : [
            `Moi ? Assez pour connaître AGC depuis *2002* 😄 Je couvre les voitures et les gens, pas les bougies.`,
            `Pas d’anniversaire ici. AGC est là depuis *2002*. Votre auto et votre santé, oui.`,
          ],
      text
    );
  }
  if (/bored|ennui|je m ennuie/.test(t)) {
    return pick(
      en
        ? [
            `Boredom I can’t insure 😌 People, cars, trips — yes. A city or *menu* when you want AGC.`,
            `I don’t sell time-killers. I do sell AGC cover. *Motor*, *health*, or a branch?`,
          ]
        : [
            `L’ennui, je ne l’assure pas 😌 Les gens, les voitures, les voyages — oui. Une ville ou *menu*.`,
            `Je ne vends pas le temps. Je vends la couverture AGC. *Auto*, *santé*, ou une agence ?`,
          ],
      text
    );
  }
  if (/where is agc|ou est agc|head office|siege|headquarters/.test(t)) {
    return hqText(en);
  }
  return pick(
    en
      ? [
          `I’m *${n}* at AGC 😊 I cover cars, health, travel, branches. Tell me what you need in your own words.`,
          `Still with you — *${n}*, Assurances Générales du Cameroun (AGC). Motor, health, a city, or just say it plainly.`,
        ]
      : [
          `Je suis *${n}* chez AGC 😊 Auto, santé, voyage, agences. Dites-le avec vos mots.`,
          `Toujours là — *${n}*, Assurances Générales du Cameroun (AGC). Auto, santé, une ville, ou une phrase simple.`,
        ],
    text
  );
}

function hqText(en) {
  return en
    ? `*Assurances Générales du Cameroun (AGC)* is in Douala:\n${company.hq}\n${company.bp}\n\n☎ ${company.phones.join(' / ')}\n✉ ${company.email}\n\nMon–Fri 8:00–18:00 · Sat 9:00–13:00 · Sunday closed.\n\nAnother city? Type it (Douala, Yaoundé, Bafoussam…).`
    : `*Assurances Générales du Cameroun (AGC)*, Douala :\n${company.hq}\n${company.bp}\n\n☎ ${company.phones.join(' / ')}\n✉ ${company.email}\n\nLun–Ven 8h–18h · samedi 9h–13h · dimanche fermé.\n\nUne autre ville ? Écrivez-la (Douala, Yaoundé, Bafoussam…).`;
}

function hqReply(lang) {
  return { type: 'text', text: hqText(lang === 'en') };
}

async function freeTalk(from, userText, extra) {
  const session = sessions.get(from);
  const spoken = langOf(from);
  const topic = extra && extra.topic;
  let asked = String(userText || '').trim();
  if (topic) {
    asked += `\n[Context: AGC topic “${topic}”. Answer from AGC facts. Vary the wording. Never invent a premium.]`;
  }
  if (ai.isConfigured()) {
    const guide = await ai.chat({ lang: spoken, history: session.history || [], userText: asked });
    if (guide.ok && guide.text) {
      session.history = [
        ...(session.history || []),
        { role: 'user', content: String(userText || '').slice(0, 500) },
        { role: 'assistant', content: String(guide.text).slice(0, 2000) },
      ].slice(-16);
      return [{ type: 'text', text: guide.text }];
    }
  }
  if (topic && products[topic]) return productReply(topic, spoken);
  if (topic === 'horaires') return [hoursReply(spoken)];
  if (topic === 'carte') return [carteSante(spoken)];
  if (topic === 'autres') return otherProducts(spoken);
  const reply = localAnswer(spoken, userText);
  session.history = [
    ...(session.history || []),
    { role: 'user', content: String(userText || '').slice(0, 500) },
    { role: 'assistant', content: String(reply).slice(0, 2000) },
  ].slice(-16);
  return [{ type: 'text', text: reply }];
}

function locProduct(id, lang) {
  const p = products[id];
  if (!p) return null;
  if (lang === 'en' && productsEn[id]) return { ...p, ...productsEn[id] };
  return p;
}

function markGreeted(from) {
  const s = sessions.get(from);
  const first = !s.greeted;
  s.greeted = true;
  return first;
}

function welcomeReply(from, lang, full) {
  sessions.get(from).greeted = true;
  const en = lang === 'en';
  const menu = mainMenu(lang);
  menu.body = en
    ? 'Pick below — or just type it 👇'
    : 'Choisissez ci-dessous — ou écrivez-le 👇';
  menu.footer = en ? 'Français / English — type it anytime' : 'Français / English — tapez-le quand vous voulez';
  return [{ type: 'text', text: introText(lang, full !== false) }, menu];
}

function welcomeOrMenu(from) {
  return welcomeReply(from, langOf(from), true);
}

function mainMenu(lang) {
  const en = lang === 'en';
  return {
    type: 'list',
    header: en ? 'AGC menu' : 'Menu AGC',
    body: pick(
      en
        ? ['What should we look at?', 'Tap what you need — or type it.', 'Motor, health, a branch… your call.']
        : ['On regarde quoi ?', 'Touchez ce qu’il vous faut — ou écrivez-le.', 'Auto, santé, une agence… à vous.'],
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
  const hook = (productHooks[id] && productHooks[id][en ? 'en' : 'fr']) || p.summary;
  return [
    { type: 'text', text: `*${p.title}*\n\n${hook}\n\n${bullets}\n\n${en ? 'More' : 'Plus de détails'} : ${p.url}` },
    {
      type: 'buttons',
      body: en ? 'Would you like a quote for this product?' : 'Souhaitez-vous un devis pour ce produit ?',
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
        ? `*Other AGC products* ✨\n\n🚚 *Transport* — goods by road, sea or air\n⚖️ *Civil liability* — family or company\n🛠️ *Technical risks* — machines, IT, breakdown\n🏢 *Multi-risk* — shops, offices, SMEs\n🩺 *Personal accident*\n\nHome cover is *MRH* — type *MRH*. I keep it short; a counsellor quotes, I don’t.`
        : `*Autres produits AGC* ✨\n\n🚚 *Transport* — marchandises route, mer, air\n⚖️ *Responsabilité civile* — famille ou entreprise\n🛠️ *Risques techniques* — machines, informatique\n🏢 *Multirisques* — commerces, bureaux, PME\n🩺 *Individuelle accident*\n\nPour la maison, c’est la *MRH* — tapez *MRH*. Je reste brève ; le tarif, c’est un conseiller.`,
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
      `*${company.name}*`,
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
  const dla = healthPartners.douala.slice(0, 6).map((x) => `• ${x}`).join('\n');
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
    body: en ? 'Which product do you want a *free quote* for?' : 'Pour quel produit voulez-vous un *devis gratuit* ?',
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
    return en
      ? 'AGC has been notified on the lead channel.'
      : 'AGC a été notifiée sur le canal des demandes.';
  }
  return en
    ? `This chat cannot email AGC by itself. Call ${company.phones[0]} or write ${company.email} with these details.`
    : `Cette conversation n’envoie pas d’email toute seule. Appelez ${company.phones[0]} ou écrivez à ${company.email} avec ces infos.`;
}

function quoteSavedText(en, lead, data) {
  const head = en
    ? `✅ *Request saved* (n° ${lead.id.slice(0, 8)})`
    : `✅ *Demande enregistrée* (n° ${lead.id.slice(0, 8)})`;
  const body = en
    ? `Product: ${data.productTitle}\nName: ${data.name}\nCity: ${data.city}`
    : `Produit : ${data.productTitle}\nNom : ${data.name}\nVille : ${data.city}`;
  return `${head}\n\n${body}\n\n${notifyNote(en)}\n${en ? 'Urgent' : 'Urgence'} : ${company.phones[0]}`;
}

function claimSavedText(en, lead) {
  const head = en
    ? `✅ *Claim recorded* (n° ${lead.id.slice(0, 8)})`
    : `✅ *Sinistre enregistré* (n° ${lead.id.slice(0, 8)})`;
  return `${head}\n\n${notifyNote(en)}\n${company.phones.join('\n')}\n\n${en ? 'Type *menu* to continue.' : 'Tapez *menu* pour continuer.'}`;
}

function counselorText(en) {
  return en
    ? `I’ll stay with you 😊 For a human AGC adviser: ${company.phones[0]} or ${company.email}.\n${notifyNote(en)}\nComplaints: reclamationsclients@agc-assurances.com / +237 692 34 19 34.\n\nAsk me anything else, or type *menu*.`
    : `Je reste avec vous 😊 Pour un conseiller AGC en chair et en os : ${company.phones[0]} ou ${company.email}.\n${notifyNote(en)}\nRéclamations : reclamationsclients@agc-assurances.com / +237 692 34 19 34.\n\nPosez-moi autre chose, ou tapez *menu*.`;
}

function mapClaimType(text) {
  const t = norm(text);
  if (/auto|voiture|accident/.test(t)) return 'auto';
  if (/sante|santé|health|hopital|hôpital/.test(t)) return 'sante';
  if (/\bvol\b|\btheft\b|\bvole\b/.test(t)) return 'vol';
  if (/incendie|fire|degat|dégât/.test(t)) return 'incendie';
  if (/autre|other/.test(t)) return 'autre';
  return null;
}

function detectIntent(text) {
  const t = text.toLowerCase();
  if (GREET.test(t.trim()) || /\bmenu\b/.test(t)) return 'menu';
  if (
    /\b(presente|presentez|presenter|présente|présentez|present|show|list)\b/.test(t) &&
    /\b(service|services|produit|produits|offre|offres)\b/.test(t)
  ) {
    return 'menu';
  }
  if (/\b(vos|nos|tes) services\b/.test(t) || /what (do you|can you) (offer|do|sell)/.test(t)) return 'menu';
  if (/^(anglais|english|in english|en anglais)$/i.test(t.trim())) return 'lang_en';
  if (/^(français|francais|francaise|française|in french|en francais|en français|en francaise|en française|french)$/i.test(t.trim()))
    return 'lang_fr';
  if (/disclaimer|confidential|privacy|gemini|politique de confidential|mon espace|attestation|binding quote/.test(t)) {
    return 'privacy';
  }
  if (/devis|quote|souscrire|cotation|how much|combien (coute|coûte|pour|est)/.test(t)) return 'devis';
  if (/sinistre|claim|déclarer un accident|declarer un accident/.test(t)) return 'sinistre';
  if (
    /where (is|are) (agc|the office|your office|you\b)|ou (est|sont) (agc|vous|le siege)|siege social|head office|headquarters|\badresse\b/.test(
      t
    )
  ) {
    return 'hq';
  }
  if (/agence|agences|branch|branches|bureau|bureaux|espace client/.test(t)) return 'agences';
  if (/horaire|heures d.ouverture|hours|vous êtes ouvert|vous etes ouvert/.test(t)) return 'horaires';
  if (/carte.?sant|health card|tiers payant/.test(t)) return 'carte';
  if (/conseiller|parler à un|parler a un|appeler un conseiller|counsellor|counselor/.test(t)) return 'conseiller';
  if (/auto|voiture|véhicule|vehicule|motor|car|moto|taxi/.test(t)) return 'auto';
  if (/santé|sante|maladie|hôpital|hopital|health/.test(t)) return 'sante';
  if (/voyage|visa|aéroport|aeroport|travel/.test(t)) return 'voyage';
  if (/\bmrh\b|multirisques? habitation|assurance habitation|\bmaison\b|\blogement\b|home insurance/.test(t))
    return 'mrh';
  if (/multirisque|incendie/.test(t)) return 'multi';
  if (/transport|marchandise|cargo/.test(t)) return 'transport';
  if (/\brc\b|responsabilité|responsabilite|liability/.test(t)) return 'rc';
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
        ? `Quote for *${title}* (${existingName}).\nWhich *city* are you in?`
        : `Devis *${title}* (${existingName}).\nDans *quelle ville* êtes-vous ?`,
    };
  }
  sessions.setStep(from, 'quote_name', { product: productId, productTitle: title });
  return {
    type: 'text',
    text: en
      ? `Quote for *${title}* — free, not binding, no price invented here.\n\nWhat is your *full name*?`
      : `Devis *${title}* — gratuit, sans engagement, aucun tarif inventé ici.\n\nQuel est *votre nom et prénom* ?`,
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
          ? `Thanks ${text}. Which product should we quote? Reply *1–6* or e.g. motor, health.`
          : `Merci ${text}. Pour quel produit ? Répondez *1–6* ou auto, santé, voyage…`,
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
      {
        type: 'text',
        text: quoteSavedText(en, lead, data),
      },
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
    body: en ? 'What type of claim is this?' : 'Quel type de sinistre voulez-vous déclarer ?',
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
    return {
      type: 'text',
      text: en
        ? claimSavedText(true, lead)
        : claimSavedText(false, lead),
    };
  }
  return null;
}

function counselor(from) {
  const en = langOf(from) === 'en';
  sessions.setStep(from, 'idle', {});
  sessions.get(from).handoff = false;
  leads.add({ kind: 'callback', phone: from, details: 'callback' });
  return {
    type: 'text',
    text: counselorText(en),
  };
}

function repliesForIntent(from, intent) {
  const lang = langOf(from);
  if (intent === 'lang_en') {
    sessions.get(from).lang = 'en';
    sessions.reset(from);
    sessions.get(from).greeted = true;
    return [{ type: 'text', text: `Perfect — *${persona.name}* will stay with you in English 😊` }, mainMenu('en')];
  }
  if (intent === 'lang_fr') {
    sessions.get(from).lang = 'fr';
    sessions.reset(from);
    sessions.get(from).greeted = true;
    return [{ type: 'text', text: `Parfait — *${persona.name}* continue avec vous en français 😊` }, mainMenu('fr')];
  }
  if (intent === 'privacy') {
    return [{ type: 'text', text: `${disclaimer(lang)}\n${aiNote(lang)}` }, mainMenu(lang)];
  }
  if (intent === 'menu') {
    sessions.reset(from);
    return welcomeReply(from, lang);
  }
  if (products[intent]) return productReply(intent, lang);
  if (intent === 'autres') return otherProducts(lang);
  if (intent === 'devis') {
    sessions.setStep(from, 'quote_product');
    return [quoteProductList(lang)];
  }
  if (intent === 'sinistre') return [startClaim(from)];
  if (intent === 'agences') return [agencyMenu(lang)];
  if (intent === 'horaires') {
    return [hoursReply(lang), { type: 'buttons', body: 'Menu ?', buttons: [{ id: 'menu', title: 'Menu' }] }];
  }
  if (intent === 'carte') {
    return [
      carteSante(lang),
      {
        type: 'buttons',
        body: lang === 'en' ? 'A health quote?' : 'Un devis santé ?',
        buttons: [
          { id: 'devis_sante', title: lang === 'en' ? 'Health quote' : 'Devis santé' },
          { id: 'menu', title: 'Menu' },
        ],
      },
    ];
  }
  if (intent === 'conseiller') return [counselor(from)];
  return null;
}

function handlePayload(from, payload) {
  const lang = langOf(from);
  if (!payload) return null;
  if (payload === 'menu' || payload === 'activate') return repliesForIntent(from, 'menu');
  if (payload.startsWith('devis_')) return [startQuote(from, payload.slice(6))];
  if (payload.startsWith('qp_')) return [startQuote(from, payload.slice(3))];
  if (payload.startsWith('reg_')) {
    return [
      regionReply(payload.slice(4), lang),
      {
        type: 'buttons',
        body: lang === 'en' ? 'Another region?' : 'Autre région ?',
        buttons: [
          { id: 'agences', title: lang === 'en' ? 'Regions' : 'Régions' },
          { id: 'menu', title: 'Menu' },
        ],
      },
    ];
  }
  if (payload.startsWith('cl_')) {
    sessions.setStep(from, 'claim_policy', { claimType: payload.slice(3) });
    return {
      type: 'text',
      text:
        lang === 'en'
          ? 'What is your AGC *policy number*? (or type *unknown*)'
          : 'Quel est votre *n° de police* AGC ? (ou tapez *inconnu*)',
    };
  }
  return repliesForIntent(from, payload);
}

function withGuide(say, replies) {
  if (!say) return replies;
  return [{ type: 'text', text: say }, ...replies];
}

function isInappropriate(text) {
  const t = ` ${norm(text)} `;
  return (
    /\b(nique|encule|encul|fdp|pute|salope|connard|pd\b|ntm|tg\b|ta gueule|fuck|shit|bitch|asshole|porn|porno|xxx|nude|nudes|rape|viol moi|kill yourself|suicide toi)\b/.test(
      t
    ) || /sex\s*(chat|pic|pics|photo|video|vid)/.test(t)
  );
}

function inappropriateReply(lang) {
  const en = lang === 'en';
  return [
    {
      type: 'text',
      text: en
        ? `I’m *${persona.name}*, ${persona.titleEn}. That message is not OK here — we stay respectful 🙏\n\nIf you need insurance, I’m still here. Type *menu*, or say auto, health, quote, claim, or a city.`
        : `Je suis *${persona.name}*, ${persona.titleFr}. Ce message n’a pas sa place ici — on reste courtois 🙏\n\nSi vous avez besoin d’une assurance, je suis toujours là. Tapez *menu*, ou dites auto, santé, devis, sinistre ou une ville.`,
    },
  ];
}

function isAck(text) {
  return /^(ok|okay|okey|daccord|d accord|dac|lol|mdr|haha|hihi|thanks|thank you|merci|👍|🙏|🙂|😊|😂)$/i.test(
    String(text || '').trim()
  );
}

function isNonsense(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (/^(.)\1{5,}$/.test(raw)) return true;
  if (/^[^0-9a-zàâäéèêëïîôùûüç]+$/i.test(raw) && raw.length < 24) return true;
  const t = raw.toLowerCase();
  const compact = t.replace(/\s/g, '');
  if (/^(asdf+|jkl+|qwer+|zxcv+|hjkl+|qwerty)+$/i.test(compact)) return true;
  if (/asdfg|qwerty|zxcvb/i.test(compact) && compact.length <= 14) return true;
  const letters = t.replace(/[^a-zàâäéèêëïîôùûüç]/gi, '');
  const vowels = (letters.match(/[aeiouyàâéèêëïîôùûü]/gi) || []).length;
  if (letters.length >= 8 && vowels === 0) return true;
  return false;
}

function isOffTopic(text) {
  const t = norm(text);
  if (!t) return false;
  if (/assurance|devis|sinistre|agence|police|contrat|sante|auto|voyage|carte sante|horaires|conseiller/.test(t)) {
    return false;
  }
  if (isNonsense(text)) return true;
  if (/\b(how much|combien|how many)\b/.test(t)) return false;
  if (/how old|quel age|what color|who are you|what is your name|ou habites|ca va\b/.test(t)) return true;
  return /\b(faim|hungry|mange|food|soif|thirsty|blague|joke|météo|meteo|weather|football|foot|match|bored|ennui|ennuy|m ennui|je m ennuie|i m bored|how old|quel age|marry|marie|copine|copain|love you|je t aime|belle|handsome|sexy|tu fais quoi|on parle|on discutes|tchat|chatte|are you real|tu es vraie|tu es un bot|robot|ia\b|chatgpt|gemini|homework|devoir|dissertation|president|politique|religion|dieu|jesus|riddle|devinette|chanson|lyrics|voix|sticker|meme|wesh|bro|yo\b|test$|testing|pk tu reponds|pourquoi tu reponds|belife|axa|saham|askania|sunu|moon|lune|color|couleur)\b/.test(
    t
  );
}

function bumpOffTopic(from) {
  const s = sessions.get(from);
  s.offTopic = (Number(s.offTopic) || 0) + 1;
  return s.offTopic;
}

function wrapOffTopic(from, lang, gag) {
  const n = bumpOffTopic(from);
  const en = lang === 'en';
  const replies = [{ type: 'text', text: gag }];
  if (n % 4 === 0) {
    replies.push({
      type: 'text',
      text: en
        ? `I’m happy to riff a bit 😄 I’m still *${persona.name}* at AGC — type *menu* when you want insurance.`
        : `Je peux papoter un peu 😄 Je reste *${persona.name}* chez AGC — tapez *menu* dès que vous voulez une assurance.`,
    });
  }
  return replies;
}

function ackReply(lang) {
  const en = lang === 'en';
  return [{ type: 'text', text: en ? 'Right here 😊' : 'Je suis là 😊' }];
}

function chitchatReply(from, lang, text) {
  const en = lang === 'en';
  const t = norm(text);
  let gag;
  if (isNonsense(text) || /^[?!.]+$/.test(String(text || '').trim()) || String(text || '').trim().length <= 2) {
    gag = en
      ? `I got the vibe, not the sentence 😄 Say it in a few words — I’m here.`
      : `J’ai le vibe, pas la phrase 😄 Dites-le en quelques mots — je suis là.`;
  } else if (/faim|hungry|mange|food|soif|thirsty/.test(t)) {
    gag = en
      ? `Ha — I don’t plate ndolé 😅 Eat first. I’ll still be right here.`
      : `Ha — je ne fais pas le ndolé 😅 Allez manger. Je reste là.`;
  } else if (/foot|match|football/.test(t)) {
    gag = en
      ? `I don’t have the score ⚽ I can cover the car that takes you to the stadium though.`
      : `Le score, je n’ai pas ⚽ L’auto qui vous emmène au stade, oui.`;
  } else if (/how old|quel age|tu as quel age|age are you/.test(t)) {
    gag = en
      ? `Old enough to know AGC since *2002* 😄 I don’t do birthday cake.`
      : `Assez pour connaître AGC depuis *2002* 😄 Pas de gâteau d’anniversaire ici.`;
  } else if (/color|couleur|moon|lune/.test(t)) {
    gag = en
      ? `The moon can look silver — I cover cars, not astronomy 🌙 Tap *menu* when you want AGC.`
      : `La lune peut être argentée — je couvre les voitures, pas le ciel 🌙 *Menu* quand vous voulez AGC.`;
  } else if (/bored|ennui|je m ennuie|on parle|on discutes|tu fais quoi|wesh|bro|^yo$/.test(t)) {
    gag = en
      ? `Boredom I can’t insure 😌 People, cars, trips — yes. Tell me a city or tap *menu*.`
      : `L’ennui, je ne l’assure pas 😌 Les gens, les voitures, les voyages — oui. Dites une ville ou tapez *menu*.`;
  } else if (/marry|marie|copine|copain|love you|je t aime|belle|handsome|sexy/.test(t)) {
    gag = en
      ? `That’s kind — I’m *${persona.name}*, AGC advisor, not on a dating app 😅 Motor, health, travel: that’s my lane.`
      : `C’est gentil — je suis *${persona.name}*, conseillère AGC, pas sur une appli de rencontre 😅 Auto, santé, voyage : c’est ma voie.`;
  } else if (/are you real|tu es vraie|tu es un bot|robot|chatgpt|ia\b/.test(t)) {
    gag = en
      ? `I’m *${persona.name}*, AGC’s WhatsApp advisor. Real answers, real branches. Not a mystery AI in a cave 😊`
      : `Je suis *${persona.name}*, conseillère AGC sur WhatsApp. Vraies agences, vrais produits. Pas un génie dans une grotte 😊`;
  } else if (/blague|joke|riddle|devinette/.test(t)) {
    gag = en
      ? `Why did the car go to AGC? It wanted fewer surprises 🚗😄 *Menu* when you’re done giggling.`
      : `Pourquoi la voiture est allée chez AGC ? Elle en avait marre des surprises 🚗😄 *Menu* quand vous avez fini de rire.`;
  } else if (/météo|meteo|weather/.test(t)) {
    gag = en
      ? `I don’t do the sky ☁️ I do the umbrella called insurance. Health or motor?`
      : `Le ciel, ce n’est pas moi ☁️ Le parapluie qui s’appelle assurance, si. Santé ou auto ?`;
  } else if (/homework|devoir|dissertation/.test(t)) {
    gag = en
      ? `I won’t write your homework. I will help with an AGC *quote* or a *branch*.`
      : `Je ne fais pas vos devoirs. Un *devis* AGC ou une *agence*, oui.`;
  } else if (/president|politique|religion|dieu|jesus/.test(t)) {
    gag = en
      ? `I leave that to the palaver tree. Here it’s AGC: auto, health, claims, branches.`
      : `Ça, c’est sous l’arbre à palabres. Ici c’est AGC : auto, santé, sinistres, agences.`;
  } else if (/\b2\s*\+?\s*2\b/.test(String(text)) || /^2 2$/.test(t) || /^(quoi|what|pourquoi|why)\s*\??$/.test(t)) {
    gag = en
      ? `4 — and I’m still better on *quotes* than on maths class 😊`
      : `4 — et je suis plus forte sur les *devis* que sur le cours de maths 😊`;
  } else if (/belife|axa|saham|askania|sunu/.test(t)) {
    gag = en
      ? `I speak for *Assurances Générales du Cameroun (AGC)* only. Want our menu, a branch, or a quote request?`
      : `Je parle pour *Assurances Générales du Cameroun (AGC)* seulement. Menu, agence, ou demande de devis ?`;
  } else {
    gag = en
      ? `Noted 😄 I’m *${persona.name}* at AGC — not a 24h gossip line, but I won’t vanish. *Menu* when you want insurance.`
      : `Noté 😄 Je suis *${persona.name}* chez AGC — pas une ligne de palabre 24h, mais je ne disparais pas. *Menu* quand vous voulez une assurance.`;
  }
  return wrapOffTopic(from, lang, gag);
}

async function processMessage({ from, text, payload }) {
  const session = sessions.get(from);
  const trimmed = (text || '').trim();
  applyMessageLang(session, trimmed, null);
  const lang = langOf(from);
  const en = lang === 'en';

  const low = trimmed.toLowerCase();
  if (/^(english|anglais|in english|en anglais)$/i.test(low) || low === 'en') {
    session.lang = 'en';
    session.handoff = false;
    sessions.reset(from);
    sessions.get(from).greeted = true;
    return [{ type: 'text', text: `Perfect — *${persona.name}* will stay with you in English 😊` }, mainMenu('en')];
  }
  if (
    /^(français|francais|francaise|française|in french|en francais|en français|en francaise|en française|french)$/i.test(
      low
    ) ||
    low === 'fr'
  ) {
    session.lang = 'fr';
    session.handoff = false;
    sessions.reset(from);
    sessions.get(from).greeted = true;
    return [{ type: 'text', text: `Parfait — *${persona.name}* continue avec vous en français 😊` }, mainMenu('fr')];
  }

  if (isInappropriate(trimmed)) return inappropriateReply(langOf(from));

  if (session.handoff) session.handoff = false;

  if (!payload && session.step && session.step !== 'idle' && isNav(trimmed)) {
    sessions.reset(from);
    return welcomeReply(from, langOf(from));
  }

  if (payload === 'horaires') return [hoursReply(langOf(from))];
  if (payload === 'hq') return [hqReply(langOf(from))];
  if (
    payload &&
    (products[payload] ||
      payload === 'autres' ||
      payload === 'multi' ||
      payload === 'transport' ||
      payload === 'rc' ||
      payload === 'carte')
  ) {
    return freeTalk(from, trimmed || payload, { topic: payload });
  }

  if (payload) {
    const out = handlePayload(from, payload);
    if (out) return Array.isArray(out) ? out : [out];
  }

  if (session.step === 'quote_product' && trimmed) {
    const out = handleQuoteProduct(from, session, trimmed);
    if (out) return Array.isArray(out) ? out : [out];
  }

  if (session.step.startsWith('quote_') && session.step !== 'quote_product' && trimmed) {
    const out = handleQuote(from, session, trimmed);
    if (out) return Array.isArray(out) ? out : [out];
  }

  if (session.step === 'claim_type' && trimmed) {
    const mapped = mapClaimType(trimmed);
    if (mapped) {
      const out = handlePayload(from, `cl_${mapped}`);
      if (out) return Array.isArray(out) ? out : [out];
    }
    return [startClaim(from)];
  }

  if (session.step.startsWith('claim_') && session.step !== 'claim_type' && trimmed) {
    const out = handleClaim(from, session, trimmed);
    if (out) return Array.isArray(out) ? out : [out];
  }

  const idle = !session.step || session.step === 'idle';
  const intent = detectIntent(trimmed);

  if (idle && !payload && (GREET.test(trimmed) || intent === 'menu')) {
    return welcomeOrMenu(from);
  }

  if (intent === 'lang_en' || intent === 'lang_fr') {
    const out = repliesForIntent(from, intent);
    if (out) return Array.isArray(out) ? out : [out];
  }

  const found = lookupAgencies(trimmed);
  if (found && found.length) {
    const asksAgency = /agence|agences|branch|branches|bureau|espace client|ou est|ou se trouve|trouver/.test(
      norm(trimmed)
    );
    const shortPlace = norm(trimmed).split(' ').length <= 4;
    if (asksAgency || shortPlace || intent === 'agences') {
      return agencyListReply(found, langOf(from));
    }
  }

  if (intent === 'hq') return [hqReply(langOf(from))];
  if (intent === 'horaires') return [hoursReply(langOf(from))];

  if (intent === 'devis' || intent === 'sinistre' || intent === 'conseiller' || intent === 'agences' || intent === 'privacy') {
    const out = repliesForIntent(from, intent);
    if (out) return Array.isArray(out) ? out : [out];
  }

  if (intent && products[intent]) return freeTalk(from, trimmed, { topic: intent });
  if (intent === 'autres' || intent === 'carte') {
    return freeTalk(from, trimmed, { topic: intent });
  }

  if (!trimmed) return welcomeOrMenu(from);
  if (isAck(trimmed)) return ackReply(langOf(from));
  if (
    isOffTopic(trimmed) ||
    isNonsense(trimmed) ||
    /^[?!.]+$/.test(trimmed) ||
    (trimmed.length <= 3 && !/^[0-9]+$/.test(trimmed))
  ) {
    return chitchatReply(from, langOf(from), trimmed);
  }
  return freeTalk(from, trimmed, {});
}

module.exports = { processMessage, mainMenu, guessLang };
