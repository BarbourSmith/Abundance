#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Patches package.json files for dependencies to ensure proper ES module resolution
 */
function patchPackageJson(packagePath, patches) {
  try {
    const fullPath = resolve(process.cwd(), 'node_modules', packagePath, 'package.json');
    const packageJson = JSON.parse(readFileSync(fullPath, 'utf-8'));
    
    let modified = false;
    for (const [key, value] of Object.entries(patches)) {
      if (packageJson[key] !== value) {
        packageJson[key] = value;
        modified = true;
      }
    }
    
    if (modified) {
      writeFileSync(fullPath, JSON.stringify(packageJson, null, 2) + '\n');
      console.log(`✓ Patched ${packagePath}/package.json`);
    } else {
      console.log(`✓ ${packagePath}/package.json already correct`);
    }
  } catch (error) {
    console.warn(`⚠ Could not patch ${packagePath}/package.json:`, error.message);
  }
}

// Apply patches
patchPackageJson('replicad-decorate', {
  'main': 'dist/es/replicad-decorate.js',
  'module': 'dist/es/replicad-decorate.js',
  'type': 'module'
});

patchPackageJson('replicad-shrink-wrap', {
  'main': 'dist/es/replicad-shrink-wrap.js',
  'module': 'dist/es/replicad-shrink-wrap.js', 
  'type': 'module'
});

console.log('Package patching complete!');
