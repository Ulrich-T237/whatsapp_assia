const fs = require('fs');
const path = require('path');

function mongoUri() {
  return String(process.env.MONGODB_URI || '').trim();
}

function dbName() {
  return String(process.env.MONGODB_DB || 'agc_assia').trim() || 'agc_assia';
}

async function useMongoAuthState() {
  const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');
  const { MongoClient } = require('mongodb');
  const uri = mongoUri();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 12000 });
  await client.connect();
  const col = client.db(dbName()).collection('wa_auth');

  const writeData = async (data, id) => {
    await col.updateOne(
      { _id: id },
      { $set: { data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)), at: new Date() } },
      { upsert: true }
    );
  };
  const readData = async (id) => {
    const doc = await col.findOne({ _id: id });
    if (!doc || doc.data == null) return null;
    return JSON.parse(JSON.stringify(doc.data), BufferJSON.reviver);
  };
  const removeData = async (id) => {
    await col.deleteOne({ _id: id });
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    kind: 'mongo',
    client,
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data || {})) {
            for (const id of Object.keys(data[category] || {})) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, 'creds'),
    clear: async () => {
      await col.deleteMany({});
    },
  };
}

async function useFileAuthState() {
  const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
  const dir = path.join(__dirname, '..', 'data', 'auth');
  fs.mkdirSync(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  return {
    kind: 'file',
    state,
    saveCreds,
    clear: async () => {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
    },
  };
}

async function loadAuth() {
  if (mongoUri()) {
    try {
      const auth = await useMongoAuthState();
      console.log('Session store: MongoDB Atlas');
      return auth;
    } catch (err) {
      console.error('MongoDB auth failed:', err.message || err);
      console.error('Falling back to local files (lost on most free hosts).');
    }
  } else {
    console.log('No MONGODB_URI — session files on disk (lost if the host has no volume).');
  }
  return useFileAuthState();
}

module.exports = { loadAuth, mongoUri };
