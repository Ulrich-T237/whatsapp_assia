const company = {
  name: 'AGC Assurances',
  slogan: 'Le gage de votre sécurité',
  email: 'agc@agc-assurances.com',
  complaintsEmail: 'reclamationsclients@agc-assurances.com',
  complaintsPhone: '+237 692 34 19 34',
  healthComplaintsEmail: 'reclamationsante@agc-assurances.com',
  healthComplaintsPhone: '+237 658 05 23 00',
};

const persona = {
  name: String(process.env.ASSISTANT_NAME || 'Assia').trim() || 'Assia',
  titleFr: 'votre conseillère AGC Assurances',
  titleEn: 'your AGC Assurances advisor',
  gender: 'feminine',
};

const productHooks = {
  auto: {
    fr: 'Un choc à Bonanjo à 18 h. Vitres, pare-chocs, l’autre conducteur — et vous, sans la *RC obligatoire* ? AGC est là pour ça. Je ne donne pas de tarif ici.',
    en: 'A bump in Bonanjo at 6 p.m. Glass, bumper, the other driver — and you with no *compulsory third-party cover*? That’s AGC. I don’t quote a price here.',
  },
  sante: {
    fr: 'La pharmacie est pleine, l’enfant a de la fièvre, le bon de prise en charge n’arrive pas. La *carte santé biométrique AGC* est faite pour ce moment-là.',
    en: 'The pharmacy is packed, the child has a fever, the guarantee paper isn’t here. The *AGC biometric health card* is for that moment.',
  },
  voyage: {
    fr: 'Un mal de ventre à 2 h du matin dans un hôtel à l’étranger. *Inter Partner Assistance* organise les soins — si vous avez le contrat voyage AGC. Pas de prime inventée ici.',
    en: 'Stomach pain at 2 a.m. in a hotel abroad. *Inter Partner Assistance* organises care — if you have AGC travel cover. No invented premium here.',
  },
  multi: {
    fr: 'L’eau descend du plafond à Bastos, le salon est trempé. *Multirisques* AGC, c’est habitation, commerce, bureau — incendie, vol, dégâts des eaux. Devis avec un conseiller, pas un chiffre magique.',
    en: 'Water through the ceiling in Bastos, the living room soaked. AGC *multi-risk* is home, shop, office — fire, theft, water. A counsellor quotes. I don’t.',
  },
  transport: {
    fr: 'Un conteneur, une route de Douala, un vol, une disparition. *Transport AGC* suit la marchandise — air, mer, terre. On ouvre un devis, on n’invente pas le taux.',
    en: 'A container, a Douala road, a theft, a disappearance. AGC *cargo* follows the goods — air, sea, land. We open a quote request. We don’t invent a rate.',
  },
  rc: {
    fr: 'Le ballon casse la vitre du voisin. *RC chef de famille* AGC, c’est pour rester solvable face à un accident involontaire sous votre toit.',
    en: 'The ball goes through the neighbour’s window. AGC *family liability* is so you stay solvent after an accident at home you didn’t mean.',
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

function introText(lang, first) {
  const en = lang === 'en';
  const n = persona.name;
  if (first) {
    return en
      ? `Hi 👋 I’m *${n}*, ${persona.titleEn}.\nTell me what you need — or pick below 😊`
      : `Bonjour 👋 Je suis *${n}*, ${persona.titleFr}.\nDites-moi ce dont vous avez besoin — ou choisissez ci-dessous 😊`;
  }
  return en ? `Here you go 😊` : `Avec plaisir 😊`;
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
};
