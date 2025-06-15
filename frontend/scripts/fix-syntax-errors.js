#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of files to fix
const filesToFix = [
  '../src/components/ui/OfflineIndicator.tsx',
  '../src/components/ui/PerformanceMonitor.tsx',
  '../src/components/search/AdvancedSearch.tsx',
  '../src/components/search/MagicalSearchModal.tsx',
  '../src/components/search/PremiumSearch.tsx',
  '../src/components/search/PremiumSearchResults.tsx',
  '../src/components/search/VirtualSearchResults.tsx',
  '../src/components/ui/KeyboardShortcutsModal.tsx',
  '../src/components/ui/OptimizedLoader.tsx',
  '../src/components/document/OptimizedDocumentViewer.tsx',
  '../src/components/document/UltimateDocumentViewer.tsx',
  '../src/components/document/VirtualizedDocumentViewer.tsx',
  '../src/components/monitoring/PerformanceMonitor.tsx',
  '../src/components/search/EnhancedSearchInterface.tsx',
  '../src/components/search/OptimizedSearchInterface.tsx',
  '../src/components/EnhancedCommandPalette.tsx',
  '../src/components/errors/GlobalErrorHandler.tsx',
  '../src/components/navigation/EnhancedNavbar.tsx',
  '../src/pages/DocumentPage.tsx',
  '../src/pages/HomePage.tsx',
  '../src/pages/NotFoundPage.tsx',
  '../src/pages/AnalyticsPage.tsx',
  '../src/pages/auth/SignIn.tsx',
  '../src/pages/auth/SignUp.tsx',
  '../src/pages/DocsListPage.tsx'
];

function fixSyntaxErrors(content) {
  // Fix malformed opening tags
  content = content.replace(/<([a-zA-Z]+)}}}/g, '<$1');
  
  // Fix malformed closing tags
  content = content.replace(/<\/([a-zA-Z]+)}}}/g, '</$1>');
  
  // Fix any remaining triple closing braces
  content = content.replace(/}}}/g, '');
  
  return content;
}

console.log('Fixing syntax errors in files...\n');

let fixedCount = 0;
let errorCount = 0;

filesToFix.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const fixedContent = fixSyntaxErrors(content);
      
      if (content !== fixedContent) {
        fs.writeFileSync(filePath, fixedContent, 'utf8');
        console.log(`✓ Fixed: ${file}`);
        fixedCount++;
      } else {
        console.log(`- No fixes needed: ${file}`);
      }
    } else {
      console.log(`✗ File not found: ${file}`);
      errorCount++;
    }
  } catch (error) {
    console.error(`✗ Error processing ${file}:`, error.message);
    errorCount++;
  }
});

console.log(`\n✅ Fixed ${fixedCount} files`);
if (errorCount > 0) {
  console.log(`❌ ${errorCount} files had errors`);
}