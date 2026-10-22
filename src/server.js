const path = require('node:path');
const { createDb } = require('./db');
const { createApp } = require('./app');

const port = Number(process.env.PORT || 3100);
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'openhouse.db');

const store = createDb(dbPath);
const app = createApp(store);

app.listen(port, '0.0.0.0', () => {
  console.log(`KMUTNB Techno Park Open House Stamp Rally running on http://localhost:${port}`);
});
