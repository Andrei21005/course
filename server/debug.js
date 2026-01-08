// debug.js
console.log('=== DEBUG START ===');

const modules = [
  { name: 'dotenv', path: 'dotenv' },
  { name: 'express', path: 'express' },
  { name: 'mongoose', path: 'mongoose' },
  { name: 'cors', path: 'cors' },
  { name: 'helmet', path: 'helmet' },
  { name: 'morgan', path: 'morgan' },
  { name: 'logger', path: './utils/logger' },
  { name: 'auth route', path: './routes/auth' },
  { name: 'habits route', path: './routes/habits' },
  { name: 'goals route', path: './routes/goals' },
  { name: 'entries route', path: './routes/entries' },
  { name: 'reminders route', path: './routes/reminders' },
  { name: 'admin route', path: './routes/admin' }
];

modules.forEach(module => {
  try {
    console.log(`Loading ${module.name}...`);
    require(module.path);
    console.log(`✅ ${module.name} loaded successfully`);
  } catch (error) {
    console.log(`❌ ${module.name} ERROR:`, error.message);
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log(`   File not found: ${module.path}`);
    }
  }
});

console.log('=== DEBUG END ===');