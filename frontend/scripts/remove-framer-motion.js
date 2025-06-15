#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of files to update
const filesToUpdate = [
  '../src/components/motion/SafeMotion.tsx',
  '../src/design-system/animations.ts',
  '../src/pages/AnalyticsPage.tsx',
  '../src/pages/SettingsPage.tsx',
  '../src/pages/auth/SignIn.tsx',
  '../src/pages/auth/SignUp.tsx',
  '../src/pages/auth/UserProfile.tsx',
  '../src/pages/auth/Setup2FA.tsx',
  '../src/pages/DocsListPage.tsx',
  '../src/pages/FavoritesPage.tsx',
  '../src/pages/DocumentPage.tsx',
  '../src/pages/HomePage.tsx',
  '../src/pages/NotFoundPage.tsx',
  '../src/components/navigation/EnhancedNavbar.tsx',
  '../src/components/EnhancedCommandPalette.tsx',
  '../src/components/errors/GlobalErrorHandler.tsx',
  '../src/components/document/DocumentViewer.tsx',
  '../src/components/document/OptimizedDocumentViewer.tsx',
  '../src/components/document/VirtualizedDocumentViewer.tsx',
  '../src/components/document/UltimateDocumentViewer.tsx',
  '../src/components/layout/NavBar.tsx',
  '../src/components/monitoring/PerformanceMonitor.tsx',
  '../src/components/search/EnhancedSearchInterface.tsx',
  '../src/components/search/OptimizedSearchInterface.tsx',
  '../src/components/search/SearchInterface.tsx',
  '../src/components/search/AdvancedSearch.tsx',
  '../src/components/search/InstantSearchInterface.tsx',
  '../src/components/search/SearchResults.tsx',
  '../src/components/search/VirtualSearchResults.tsx',
  '../src/components/search/MagicalSearchModal.tsx',
  '../src/components/search/PremiumSearch.tsx',
  '../src/components/search/PremiumSearchResults.tsx',
  '../src/components/ui/KeyboardShortcutsModal.tsx',
  '../src/components/ui/Toast.tsx',
  '../src/components/ui/Input.tsx',
  '../src/components/ui/OptimizedLoader.tsx',
  '../src/components/ui/Card.tsx',
  '../src/components/ui/Badge.tsx',
  '../src/components/ui/OfflineIndicator.tsx',
  '../src/components/ui/PremiumButton.tsx',
  '../src/components/ui/Button.tsx',
  '../src/components/ui/PerformanceMonitor.tsx'
];

function removeFramerMotion(content) {
  // Remove framer-motion imports
  content = content.replace(/import\s+.*\s+from\s+['"]framer-motion['"];?\n/g, '');
  content = content.replace(/import\s+{[^}]+}\s+from\s+['"]framer-motion['"];?\n/g, '');
  
  // Replace motion.div with div
  content = content.replace(/<motion\.(\w+)/g, '<$1');
  content = content.replace(/<\/motion\.(\w+)>/g, '</$1>');
  
  // Replace AnimatePresence with React.Fragment
  content = content.replace(/<AnimatePresence[^>]*>/g, '<>');
  content = content.replace(/<\/AnimatePresence>/g, '</>');
  
  // Replace LayoutGroup with React.Fragment
  content = content.replace(/<LayoutGroup[^>]*>/g, '<>');
  content = content.replace(/<\/LayoutGroup>/g, '</>');
  
  // Remove motion props
  content = content.replace(/\s+(initial|animate|exit|transition|whileHover|whileTap|whileInView|drag|dragConstraints|dragElastic|layout|layoutId|variants)={[^}]+}/g, '');
  content = content.replace(/\s+(initial|animate|exit|transition|whileHover|whileTap|whileInView|drag|dragConstraints|dragElastic|layout|layoutId|variants)="[^"]+"/g, '');
  content = content.replace(/\s+(initial|animate|exit|transition|whileHover|whileTap|whileInView|drag|dragConstraints|dragElastic|layout|layoutId|variants)='[^']+'/g, '');
  
  // Remove stagger, fadeInUp, etc. animation references
  content = content.replace(/variants={[^}]+}/g, '');
  content = content.replace(/custom={[^}]+}/g, '');
  
  return content;
}

console.log('Removing framer-motion from files...\n');

let updatedCount = 0;
let errorCount = 0;

filesToUpdate.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const updatedContent = removeFramerMotion(content);
      
      if (content !== updatedContent) {
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        console.log(`✓ Updated: ${file}`);
        updatedCount++;
      } else {
        console.log(`- No changes needed: ${file}`);
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

console.log(`\n✅ Updated ${updatedCount} files`);
if (errorCount > 0) {
  console.log(`❌ ${errorCount} files had errors`);
}