// Diagnostic script to check file structure before build
const fs = require('fs');
const path = require('path');

console.log('=== PREBUILD DIAGNOSTIC ===');
console.log('Current directory:', process.cwd());
console.log('Directory contents:');

// List root directory
const rootFiles = fs.readdirSync('.');
console.log('\nRoot files:');
rootFiles.forEach(file => {
  const stat = fs.statSync(file);
  console.log(`  ${stat.isDirectory() ? '[DIR] ' : '[FILE]'} ${file}`);
});

// Check if lib directory exists and list its contents
if (fs.existsSync('lib')) {
  console.log('\n/lib directory exists');
  const libContents = fs.readdirSync('lib');
  console.log('lib contents:', libContents);
  
  // Check subdirectories
  ['utils', 'search', 'supabase'].forEach(subdir => {
    const subdirPath = path.join('lib', subdir);
    if (fs.existsSync(subdirPath)) {
      console.log(`\n/lib/${subdir} contents:`);
      const files = fs.readdirSync(subdirPath);
      files.forEach(file => console.log(`  - ${file}`));
    } else {
      console.log(`\n/lib/${subdir} DOES NOT EXIST`);
    }
  });
} else {
  console.log('\n/lib directory DOES NOT EXIST');
}

// Check specific files that are failing
console.log('\nChecking specific files:');
const filesToCheck = [
  'lib/utils/cn.ts',
  'lib/search/client.ts',
  'lib/supabase/server.ts',
  'components/ui/button.tsx',
  'components/search/search-hero.tsx'
];

filesToCheck.forEach(file => {
  console.log(`${file}: ${fs.existsSync(file) ? 'EXISTS' : 'MISSING'}`);
});