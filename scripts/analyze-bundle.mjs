#!/usr/bin/env node

/**
 * Simple bundle analysis script to show the performance improvements
 */

import fs from 'fs';
import path from 'path';

const distDir = './dist/assets';

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function analyzeBundle() {
  if (!fs.existsSync(distDir)) {
    console.log('❌ Dist directory not found. Run npm run build first.');
    return;
  }

  const files = fs.readdirSync(distDir);
  const jsFiles = files.filter(f => f.endsWith('.js'));
  
  console.log('\n📊 Bundle Analysis Results');
  console.log('=' * 50);
  
  let totalSize = 0;
  const chunks = [];
  
  jsFiles.forEach(file => {
    const filePath = path.join(distDir, file);
    const stats = fs.statSync(filePath);
    const size = stats.size;
    totalSize += size;
    
    let category = 'Other';
    if (file.includes('route-')) category = 'Route Chunks';
    else if (file.includes('vendor')) category = 'Vendor Chunks';
    else if (file.includes('molecules')) category = 'Molecules';
    else if (file.includes('worker')) category = 'Workers';
    else if (file.includes('index-')) category = 'Main Entry';
    
    chunks.push({ file, size, category });
  });
  
  // Group by category
  const grouped = chunks.reduce((acc, chunk) => {
    if (!acc[chunk.category]) acc[chunk.category] = [];
    acc[chunk.category].push(chunk);
    return acc;
  }, {});
  
  // Sort categories by importance
  const categoryOrder = ['Main Entry', 'Route Chunks', 'Molecules', 'Workers', 'Vendor Chunks', 'Other'];
  
  categoryOrder.forEach(category => {
    if (grouped[category]) {
      console.log(`\n${category}:`);
      grouped[category]
        .sort((a, b) => b.size - a.size)
        .forEach(chunk => {
          console.log(`  ${chunk.file.padEnd(40)} ${formatBytes(chunk.size)}`);
        });
    }
  });
  
  console.log('\n' + '=' * 50);
  console.log(`Total JavaScript: ${formatBytes(totalSize)}`);
  
  // Show improvement
  const mainEntry = chunks.find(c => c.file.includes('index-') && c.category === 'Main Entry');
  if (mainEntry) {
    const oldSize = 5683060; // 5.6MB from before
    const improvement = ((oldSize - mainEntry.size) / oldSize * 100).toFixed(1);
    console.log(`\n✅ Performance Improvement:`);
    console.log(`   Before: ${formatBytes(oldSize)} (single chunk)`);
    console.log(`   After:  ${formatBytes(mainEntry.size)} (main entry)`);
    console.log(`   Reduction: ${improvement}% smaller initial bundle!`);
  }
  
  console.log('\n🎯 Benefits:');
  console.log('   • Faster initial page load');
  console.log('   • Routes load on-demand');
  console.log('   • Better browser caching');
  console.log('   • Reduced Time to Interactive (TTI)');
}

analyzeBundle();