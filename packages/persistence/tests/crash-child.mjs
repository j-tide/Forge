import { ForgePersistence } from '../dist/index.js';

const storage = new ForgePersistence(process.argv[2]);
await storage.open();
storage.migrate();
storage.transaction((tx) => {
  tx.set('test.uncommitted', 'must-not-survive');
  process.exit(17);
});
