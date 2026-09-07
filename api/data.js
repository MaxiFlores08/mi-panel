import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const r = await client.execute('SELECT key, value FROM app_state');
      const obj = {};
      for (const row of r.rows) {
        try { obj[row.key] = JSON.parse(row.value); }
        catch { obj[row.key] = row.value; }
      }
      return res.status(200).json(obj);
    }

    if (req.method === 'PUT') {
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ error: 'Falta la clave (key)' });
      await client.execute({
        sql: 'INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        args: [key, JSON.stringify(value)],
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { key } = req.query;
      await client.execute({ sql: 'DELETE FROM app_state WHERE key=?', args: [key] });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método no soportado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
