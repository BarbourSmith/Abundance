#!/usr/bin/env node

/**
 * Script to switch between development and production configurations
 * Usage: 
 *   npm run config:dev  - Set for local development
 *   npm run config:prod - Set for GitHub Pages deployment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configType = process.argv[2];

if (!configType || !['dev', 'prod'].includes(configType)) {
  console.error('Usage: node set-config.js [dev|prod]');
  process.exit(1);
}

const viteConfigPath = path.join(__dirname, '..', 'vite.config.js');
const envPath = path.join(__dirname, '..', '.env');

// Read current configurations
const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
const envConfig = fs.readFileSync(envPath, 'utf8');

let newViteConfig = viteConfig;
let newEnvConfig = envConfig;

if (configType === 'dev') {
  console.log('Setting configuration for local development...');
  
  // Update vite.config.js for development
  newViteConfig = viteConfig.replace(
    /base: ".*?", \/\/change to/,
    'base: "/", //change to'
  );
  
  // Update .env for development - uncomment dev section, comment prod section
  newEnvConfig = envConfig
    // Uncomment dev section
    .replace(/(# FOR DEV.*#commment out for deploy\n)((?:#.*\n)*)/gm, (match, header, lines) => {
      return header + lines.replace(/^#(?!#)/gm, '');
    })
    // Comment prod section  
    .replace(/(# FOR PROD.*#commment out for dev\n)((?:[^#].*\n)*)/gm, (match, header, lines) => {
      return header + '\n#\n' + lines.replace(/^(?!#)/gm, '#');
    });
    
} else if (configType === 'prod') {
  console.log('Setting configuration for production deployment...');
  
  // Update vite.config.js for production
  // Since we're using a custom domain (abundance.maslowcnc.com), use root path
  newViteConfig = viteConfig.replace(
    /base: ".*?", \/\/change to/,
    'base: "/", //change to'
  );
  
  // Update .env for production - comment dev section, uncomment prod section
  newEnvConfig = envConfig
    // Comment dev section
    .replace(/(# FOR DEV.*?#commment out for deploy\n)((?:[^#\n].*\n)*)/gms, (match, header, lines) => {
      return header + lines.replace(/^(?!#)/gm, '#');
    })
    // Uncomment prod section and fix VITE_BROWSER_ROUTER for custom domain
    .replace(/(# FOR PROD.*?#commment out for dev\n)((?:#.*\n)*)/gms, (match, header, lines) => {
      let uncommented = lines.replace(/^#(?![#\s])/gm, '');
      // Fix VITE_BROWSER_ROUTER for custom domain (should be empty)
      uncommented = uncommented.replace(/VITE_BROWSER_ROUTER = "\/Abundance"/, 'VITE_BROWSER_ROUTER = ""');
      return header + uncommented;
    });
}

// Write updated configurations
fs.writeFileSync(viteConfigPath, newViteConfig);
fs.writeFileSync(envPath, newEnvConfig);

console.log(`Configuration updated for ${configType === 'dev' ? 'development' : 'production'}`);

if (configType === 'dev') {
  console.log('You can now run: npm start');
} else {
  console.log('You can now run: npm run build');
}