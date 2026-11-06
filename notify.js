const fs = require('fs');
const path = require('path');
const { leadsInbox } = require('./config');

const OUTBOX = path.join(__dirname, '..', 'data', 'outbox.json');

function pushOutbox(row) {
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(OUTBOX, 'utf8'));
  } catch {
    list = [];
  }
  list.unshift({ ...row, queuedAt: new Date().toISOString() });
  fs.mkdirSync(path.dirname(OUTBOX), { recursive: true });
  fs.writeFileSync(OUTBOX, JSON.stringify(list.slice(0, 200), null, 2));
}

function subject(lead) {
  const k = lead.kind || 'lead';
  return `[AGC WhatsApp] ${k} — ${lead.name || lead.phone || lead.from || ''}`;
}

function body(lead) {
  return [
    'Nouvelle demande depuis le bot WhatsApp AGC.',
    '',
    `Type: ${lead.kind}`,
    `Id: ${lead.id}`,
    `Date: ${lead.at}`,
    `WhatsApp: ${lead.phone || lead.from}`,
    `Produit: ${lead.productTitle || lead.product || ''}`,
    `Nom: ${lead.name || ''}`,
    `Ville: ${lead.city || ''}`,
    `Police: ${lead.policy || ''}`,
    `Détail: ${lead.details || lead.description || lead.claimType || ''}`,
    '',
    'Ce message est une notification automatique. Ce n’est pas une police ni un tarif.',
  ].join('\n');
}

async function sendEmail(lead) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = leadsInbox();
  if (!host || !user || !pass) {
    console.warn('SMTP not set — lead saved locally only:', lead.id);
    return false;
  }
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    console.warn('npm install nodemailer — email not sent');
    return false;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || user,
    to,
    subject: subject(lead),
    text: body(lead),
  });
  console.log(`Lead emailed to ${to}: ${lead.id}`);
  return true;
}

async function sendWebhook(lead) {
  const url = process.env.LEADS_WEBHOOK_URL;
  if (!url) return false;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AGC-Bot': 'leads' },
    body: JSON.stringify(lead),
  });
  if (!res.ok) throw new Error(`webhook ${res.status}`);
  console.log(`Lead webhook ${res.status}: ${lead.id}`);
  return true;
}

async function enqueue(lead) {
  pushOutbox(lead);
  try {
    await sendEmail(lead);
  } catch (err) {
    console.error('Email failed:', err.message || err);
  }
  try {
    await sendWebhook(lead);
  } catch (err) {
    console.error('Webhook failed:', err.message || err);
  }
}

module.exports = { enqueue, body, subject };
