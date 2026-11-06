const company = {
  name: 'AGC',
  legal: 'Assurances Générales du Cameroun',
  slogan: 'Le gage de votre sécurité',
  email: 'agc@agc-assurances.com',
  complaintsEmail: 'reclamationsclients@agc-assurances.com',
  complaintsPhone: '+237 692 34 19 34',
  healthComplaintsEmail: 'reclamationsante@agc-assurances.com',
  healthComplaintsPhone: '+237 658 05 23 00',
};

function displayName() {
  const raw = String(process.env.ASSISTANT_NAME || 'ASSIAA').trim();
  if (!raw || /^assia$/i.test(raw)) return 'ASSIAA';
  return raw;
}

const persona = {
  get name() {
    return displayName();
  },
  titleFr: 'votre conseillère Assurances Générales du Cameroun (AGC)',
  titleEn: 'your advisor at Assurances Générales du Cameroun (AGC)',
  gender: 'feminine',
};

const productHooks = {
  auto: {
    fr: 'Un choc à Bonanjo à 18 h. Vitres, pare-chocs, l’autre conducteur — et vous, sans la *RC obligatoire* ? AGC est là. 🚗',
    en: 'A bump in Bonanjo at 6 p.m. Glass, bumper, the other driver — and you with no *compulsory cover*? That’s AGC. 🚗',
  },
  sante: {
    fr: 'La pharmacie est pleine, l’enfant a de la fièvre. La *carte santé biométrique AGC* est faite pour ce moment-là. 🩺',
    en: 'The pharmacy is packed, the child has a fever. The *AGC biometric health card* is for that moment. 🩺',
  },
  voyage: {
    fr: 'Un mal de ventre à 2 h du matin dans un hôtel à l’étranger. *Inter Partner Assistance* organise les soins. ✈️',
    en: 'Stomach pain at 2 a.m. in a hotel abroad. *Inter Partner Assistance* organises care. ✈️',
  },
  mrh: {
    fr: 'L’eau descend du plafond à Bastos, le salon est trempé. La *MRH* AGC protège votre maison : incendie, vol, dégâts des eaux. 🏠',
    en: 'Water through the ceiling in Bastos. AGC *home multi-risk (MRH)* is fire, theft, water — your house, not a magic price. 🏠',
  },
  multi: {
    fr: '*Multirisques* AGC : habitation, commerce, bureau, PME — incendie, vol, dégâts des eaux. 🏢',
    en: 'AGC *multi-risk*: home, shop, office, SME — fire, theft, water. 🏢',
  },
  transport: {
    fr: 'Un conteneur, une route de Douala, une disparition. *Transport AGC* suit la marchandise — air, mer, terre. 🚚',
    en: 'A container, a Douala road, a disappearance. AGC *cargo* follows the goods — air, sea, land. 🚚',
  },
  rc: {
    fr: 'Le ballon casse la vitre du voisin. *RC chef de famille* AGC, c’est rester solvable. ⚖️',
    en: 'The ball goes through the neighbour’s window. AGC *family liability* keeps you solvent. ⚖️',
  },
};

function waE164() {
  const raw = String(process.env.AGC_WHATSAPP || '').replace(/\D/g, '');
  return raw || '';
}

function leadsInbox() {
  return process.env.LEADS_EMAIL || company.email;
}

function disclaimer(lang) {
  const en = lang === 'en';
  return en
    ? `_Information only — not a binding quote or claim decision. I do not invent premiums and I cannot open your policy or Mon espace. Complaints: ${company.complaintsEmail} / ${company.complaintsPhone}._`
    : `_Renseignement uniquement — pas de tarif ni de décision de sinistre. Je n’invente pas de prime et je n’ai pas accès à votre contrat ni à Mon espace. Réclamations : ${company.complaintsEmail} / ${company.complaintsPhone}._`;
}

function aiNote(lang) {
  const en = lang === 'en';
  return en
    ? `_Free-text answers may use Google Gemini. Do not send your ID card, full policy file, or passwords here. Quote/claim forms stay on this bot._`
    : `_Les phrases libres peuvent passer par Google Gemini. N’envoyez pas de CNI, dossier complet ni mot de passe ici. Les devis/sinistres restent dans ce bot._`;
}

function doualaHour() {
  try {
    const h = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Douala',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date());
    return Number(String(h).replace(/\D/g, '')) || new Date().getHours();
  } catch {
    return new Date().getHours();
  }
}

function clockHello(lang) {
  const hour = doualaHour();
  const en = lang === 'en';
  if (hour < 12) return en ? 'Good morning ☀️🌸' : 'Bonjour ☀️🌸';
  if (hour < 18) return en ? 'Good afternoon 🌤️😊' : 'Bon après-midi 🌤️😊';
  return en ? 'Good evening 🌙✨' : 'Bonsoir 🌙✨';
}

function introText(lang, first) {
  const en = lang === 'en';
  const n = persona.name;
  if (!first) {
    return en ? `Here you go 😊` : `Avec plaisir 😊`;
  }
  if (en) {
    return [
      `${clockHello('en')}`,
      ``,
      `I’m *${n}* ☺️`,
      `${persona.titleEn} 🛡️`,
      ``,
      `My name is inspired by a beautiful Cameroonian expression 🇨🇲💛 — compassion, listening, comfort, and standing with someone going through a hard time. 🤝`,
      ``,
      `I’m glad to walk with you. So tell me: how can I help you today? ✨😊`,
    ].join('\n');
  }
  return [
    `${clockHello('fr')}`,
    ``,
    `Je suis *${n}* ☺️`,
    `${persona.titleFr} 🛡️`,
    ``,
    `Mon nom est inspiré d’une belle expression camerounaise 🇨🇲💛 : elle parle de compassion, d’écoute, de réconfort et de solidarité envers une personne qui traverse un moment difficile. 🤝`,
    ``,
    `Je suis ravie de vous accompagner. Alors, dites-moi : comment puis-je vous aider aujourd’hui ? ✨😊`,
  ].join('\n');
}

module.exports = {
  company,
  persona,
  productHooks,
  waE164,
  leadsInbox,
  disclaimer,
  aiNote,
  introText,
  clockHello,
};
