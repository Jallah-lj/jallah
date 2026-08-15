import fs from 'node:fs';
const file=process.env.DATA_FILE||'data/database.json';
if(fs.existsSync(file)){console.log(`Seed data already exists at ${file}. Remove it to reseed.`)}else{await import('./store.ts');console.log(`Seeded ${file}`)}
