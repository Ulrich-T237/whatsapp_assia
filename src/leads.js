const fs = require('fs');
const path = require('path');
const notify = require('./notify');

const FILE = path.join(__dirname, '..', 'data', 'leads.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

function save(list) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

function canNotify() {
  return Boolean(
    (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ||
      process.env.LEADS_WEBHOOK_URL
  );
}

function add(lead) {
  const list = load();
  const row = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...lead,
  };
  list.unshift(row);
  save(list.slice(0, 500));
  notify.enqueue(row).catch((err) => console.error('notify:', err.message || err));
  return row;
}

module.exports = { load, add, canNotify };
