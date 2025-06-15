// Test script to check file structure
const fs = require('fs');
const path = require('path');

console.log('Current working directory:', process.cwd());
console.log('');

const filesToCheck = [
  'lib/utils/cn.ts',
  'lib/search/client.ts',
  'lib/supabase/server.ts',
  'components/ui/button.tsx',
  'app/page.tsx',
  'package.json',
  'tsconfig.json'
];

filesToCheck.forEach(file => {
  const exists = fs.existsSync(path.join(process.cwd(), file));
  console.log(`${file}: ${exists ? '✓ EXISTS' : '✗ MISSING'}`);
});

console.log('\nDirectory listing:');
const dirs = ['lib', 'components', 'app'];
dirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`\n${dir}/:`);
    const files = fs.readdirSync(dir);
    files.slice(0, 5).forEach(file => console.log(`  - ${file}`));
    if (files.length > 5) console.log(`  ... and ${files.length - 5} more`);
  } else {
    console.log(`\n${dir}/: DOES NOT EXIST`);
  }
});