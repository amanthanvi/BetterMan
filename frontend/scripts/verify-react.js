#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Verifying React Installation ===');

try {
  // Read React version from node_modules
  const reactPkgPath = path.join(__dirname, '..', 'node_modules', 'react', 'package.json');
  const reactDomPkgPath = path.join(__dirname, '..', 'node_modules', 'react-dom', 'package.json');
  
  if (fs.existsSync(reactPkgPath)) {
    const reactPkg = JSON.parse(fs.readFileSync(reactPkgPath, 'utf8'));
    console.log(`✓ React version: ${reactPkg.version}`);
    
    if (reactPkg.version.startsWith('19')) {
      console.error('❌ ERROR: React 19 detected! This will cause issues with framer-motion.');
      process.exit(1);
    }
  } else {
    console.error('❌ React not found in node_modules');
  }
  
  if (fs.existsSync(reactDomPkgPath)) {
    const reactDomPkg = JSON.parse(fs.readFileSync(reactDomPkgPath, 'utf8'));
    console.log(`✓ React-DOM version: ${reactDomPkg.version}`);
  }
  
  console.log('✅ React version check passed');
} catch (error) {
  console.error('Error checking React version:', error);
  process.exit(1);
}