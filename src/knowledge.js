const SITE = 'https://agc-assurances.com';

const company = {
  name: 'Assurances Générales du Cameroun (AGC)',
  slogan: 'Le gage de votre sécurité',
  legal: 'Assurances Générales du Cameroun S.A. — IARDT',
  since: 2002,
  hq: 'Immeuble le Cauris, Rue Alfred Saker, près de l’église le Centenaire, Akwa, Douala',
  bp: 'BP 1290 Douala',
  email: 'agc@agc-assurances.com',
  phones: ['+237 659 92 39 82', '+237 683 70 80 03', '+237 233 43 89 38'],
  hours: {
    week: 'Lundi – Vendredi : 08h – 18h',
    saturday: 'Samedi : 09h – 13h',
    sunday: 'Dimanche : fermé',
  },
  website: SITE,
};

const products = {
  auto: {
    id: 'auto',
    title: 'Assurance automobile',
    url: `${SITE}/assurance-auto/`,
    summary:
      '9 formules pour tous types de véhicules. La responsabilité civile (RTI) est obligatoire. Vous pouvez ajouter défense & recours, vol, incendie, bris de glaces, tierce collision et dommages tous accidents.',
    bullets: [
      'Responsabilité civile / RTI (obligatoire)',
      'Défense & recours',
      'Individuel accident conducteur / personnes transportées',
      'Vol, vol partiel, vol par braquage',
      'Incendie, bris de glaces et blocs feux',
      'Tierce collision et dommages tous accidents',
    ],
  },
  sante: {
    id: 'sante',
    title: 'Assurance santé',
    url: `${SITE}/assurance-sante-2/`,
    summary:
      'Remboursement direct ou tiers payant, avec la carte santé biométrique AGC : moins de bons de prise en charge, plus de rapidité en pharmacie, consultation, analyses et hospitalisation.',
    bullets: [
      'Santé famille et santé groupe (entreprises, associations)',
      'Carte santé biométrique AGC',
      'Soins à l’étranger et évacuation sanitaire',
      'Assistance, rapatriement de corps, frais funéraires',
      'Individuel accidents corporels',
    ],
  },
  mrh: {
    id: 'mrh',
    title: 'MRH — Multirisques habitation',
    url: `${SITE}/assurance-multirisques/`,
    summary:
      'La Multirisques Habitation (MRH) AGC protège votre maison et ce qu’il y a dedans : incendie, vol, dégâts des eaux, bris de glaces. Le tarif se fait avec un conseiller — jamais inventé ici.',
    bullets: ['Incendie', 'Vol', 'Dégâts des eaux', 'Bris de glaces', 'Responsabilités liées au logement'],
  },
  voyage: {
    id: 'voyage',
    title: 'Assurance voyage',
    url: `${SITE}/assurance-voyage-2/`,
    summary:
      'Garanties de voyage en partenariat avec Inter Partner Assistance : assistance, frais médicaux à l’étranger, rapatriement.',
    bullets: [
      'Frais médicaux à l’étranger',
      'Assistance et rapatriement',
      'Partenaire Inter Partner Assistance',
    ],
  },
  multi: {
    id: 'multi',
    title: 'Assurance multirisques',
    url: `${SITE}/assurance-multirisques/`,
    summary:
      'Couverture des biens et responsabilités : habitation, commerces, bureaux, PME/PMI et risques industriels (incendie, vol, dégâts des eaux, bris de glaces, informatique, perte d’exploitation).',
    bullets: [
      'Multirisques habitation, commerces, bureaux',
      'PME/PMI et risques industriels',
      'Incendie, vol, dégâts des eaux, bris de glaces',
      'Risques informatiques et bris de machine',
    ],
  },
  transport: {
    id: 'transport',
    title: 'Assurance transport',
    url: `${SITE}/assurance-transport-2/`,
    summary:
      'Couverture des marchandises par route, mer ou air, avec des offres adaptées à votre flux.',
    bullets: ['Marchandises par route, mer ou air', 'Offres sur mesure selon vos flux'],
  },
  rc: {
    id: 'rc',
    title: 'Responsabilité civile',
    url: `${SITE}/responsabilite-civile/`,
    summary:
      'Protection contre les conséquences pécuniaires de la responsabilité civile (art. 1382 à 1386 du Code civil) : chef de famille ou chef d’entreprise.',
    bullets: [
      'RC chef de famille',
      'RC chef d’entreprise',
      'Conséquences pécuniaires des dommages causés à autrui',
    ],
  },
};

const agencies = {
  littoral: {
    title: 'Littoral / Sud-Ouest',
    items: [
      { name: 'Siège — Direction Générale', place: 'Immeuble le Cauris, Rue Alfred Saker, Akwa, Douala', phone: '+237 694 13 38 76', email: 'agc@agc-assurances.com', city: 'Douala' },
      { name: 'Bonanjo', place: 'Face CRTV Bonanjo', phone: '694 10 62 56', email: 'agc@agc-assurances.com', city: 'Douala' },
      { name: 'Bonamoussadi', place: 'Carrefour Maçons', phone: '696 90 08 17', email: 'florence.ngalle@agc-assurances.com', city: 'Douala' },
      { name: 'Deïdo', place: 'Face boulangerie COAF', phone: '697 39 43 73', email: 'agc@agc-assurances.com', city: 'Douala' },
      { name: 'Dakar', place: 'Rond-point Dakar', phone: '656 07 41 44', email: 'richard.njoh@agc-assurances.com', city: 'Douala' },
      { name: 'Bonabéri', place: 'Bessèke, entrée Centre équestre', phone: '696 10 72 50', email: 'agc@agc-assurances.com', city: 'Douala' },
      { name: 'Nkongsamba', place: 'Immeuble Fokou, face Brasseries', phone: '677 12 44 39', email: 'agc@agc-assurances.com', city: 'Nkongsamba' },
      { name: 'Buea', place: 'Mile 17', phone: '677 82 36 03', email: 'agc@agc-assurances.com', city: 'Buea' },
    ],
  },
  centre: {
    title: 'Centre / Nord-Ouest',
    items: [
      { name: 'Capitole (Yaoundé)', place: '1er étage, immeuble Capitole', phone: '233 07 79 40', email: 'armand.mignamissi@agc-assurances.com', city: 'Yaoundé' },
      { name: 'Mimboman', place: 'Face sapeurs-pompiers', phone: '674 83 04 78', email: 'romuald.tchinda@agc-assurances.com', city: 'Yaoundé' },
      { name: 'Tsinga', place: 'Face supermarché MAX', phone: '699 33 61 72', email: 'nicaise.mouacho@agc-assurances.com', city: 'Yaoundé' },
      { name: 'Rond-point Express', place: 'Face pharmacie Jouvence', phone: '699 32 21 49', email: 'jacob.mongwa@agc-assurances.com', city: 'Yaoundé' },
      { name: 'Bamenda', place: 'Commercial Avenue', phone: '656 07 41 50', email: 'olivia.bih@agc-assurances.com', city: 'Bamenda' },
    ],
  },
  ouest: {
    title: 'Ouest',
    items: [
      { name: 'Bafoussam', place: 'Ancien cinéma Tamdja', phone: '233 03 39 37', email: 'rosette.djomou@agc-assurances.com', city: 'Bafoussam' },
      { name: 'Mbouda', place: 'Mbouda', phone: '677 58 96 68', email: 'agc@agc-assurances.com', city: 'Mbouda' },
      { name: 'Bafang', place: 'Immeuble Résidence La Falaise', phone: '697 43 21 70', email: 'marcelle.fongang@agc-assurances.com', city: 'Bafang' },
    ],
  },
  nord: {
    title: 'Nord et Grand Nord',
    items: [
      { name: 'Garoua', place: 'Immeuble Crédit Foncier, face Ecobank', phone: '656 07 41 09', email: 'gabriel.deutchoua@agc-assurances.com', city: 'Garoua' },
      { name: 'Ngaoundéré', place: 'Ngaoundéré', phone: '699 24 09 20', email: 'agc.ngaoundere@agc-assurances.com', city: 'Ngaoundéré' },
      { name: 'Maroua', place: 'Maroua', phone: '695 90 95 41', email: 'sali.ahmed@agc-assurances.com', city: 'Maroua' },
    ],
  },
  sudest: {
    title: 'Sud / Est',
    items: [
      { name: 'Bertoua', place: 'Bertoua', phone: '699 60 96 48', email: 'agc@agc-assurances.com', city: 'Bertoua' },
      { name: 'Kribi', place: 'Kribi', phone: '670 12 69 54', email: 'agc@agc-assurances.com', city: 'Kribi' },
    ],
  },
};

const healthPartners = {
  douala: [
    'CERAD',
    'Clinique La Source',
    'Louis Pasteur Labo',
    'Clinique Bordeaux Douala',
    'Polyclinique Bonanjo',
    'Hôpital de district Cité des Palmiers',
    'Hôpital catholique Saint Paul',
    'Ad Lucem Bali, Bonabéri, Bonamoussadi',
    'Pharmacie de la Côte, St James, du Centre…',
  ],
  yaounde: [
    'Exact Centre d’imagerie et d’analyses',
    'Centre médico-chirurgical Reaven',
    'Les Promoteurs de la Bonne Santé',
    'Ad Lucem Obobogo',
    'Pharmacie des Congrès, Les Pétales, Messa',
  ],
};

function formatAgency(a) {
  return `*${a.name}*\n${a.place}\n☎ ${a.phone}\n✉ ${a.email}`;
}

function agencyDirectory() {
  const lines = [];
  for (const g of Object.values(agencies)) {
    for (const a of g.items) {
      lines.push(`${a.name} | ${a.city || g.title} | ${a.place} | ${a.phone} | ${a.email}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  company,
  products,
  agencies,
  healthPartners,
  formatAgency,
  agencyDirectory,
};
