import { AppServerConnection } from '../dist/app-server.js';
const connection = new AppServerConnection();
try {
  await connection.connect();
  const models = await connection.request('model/list', { limit: 100 });
  console.log(JSON.stringify({ modelIds: models.data.map((model) => model.id) }, null, 2));
} finally { await connection.dispose(); }
