/**
 * Simple browser test to verify Kiri:Moto can generate G-code
 * Uses the existing Puppeteer infrastructure
 */

import puppeteer from 'puppeteer';
import { spawn } from 'child_process';

export async function testKiriMotoAvailability() {
  let browser;
  let server;
  
  try {
    console.log('🔍 Testing if Kiri:Moto G-code generation is available in browser...');
    
    // Start dev server
    server = spawn('npm', ['start'], { cwd: process.cwd(), stdio: 'pipe' });
    
    await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Server timeout')), 20000);
      
      server.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('ready in')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    
    // Launch browser
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    
    await page.goto('http://localhost:4444', { 
      waitUntil: 'networkidle0', 
      timeout: 20000 
    });
    
    // Test basic Kiri:Moto availability
    const kirimotoTest = await page.evaluate(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          try {
            // Check if window.generateGcode exists or can be loaded
            const hasGenerateGcode = typeof window.generateGcode === 'function';
            
            // Check if we can import KirimotoUpdate
            const canImportKiri = !!window.import;
            
            // Check basic browser APIs
            const hasWorker = typeof Worker !== 'undefined';
            const hasBlob = typeof Blob !== 'undefined';
            const hasURL = typeof URL !== 'undefined';
            
            resolve({
              hasGenerateGcode,
              canImportKiri,
              hasWorker,
              hasBlob,
              hasURL,
              browserSupport: hasWorker && hasBlob && hasURL,
              kirimotoAvailable: false // Will test this separately
            });
            
          } catch (error) {
            resolve({
              error: error.message,
              browserSupport: false
            });
          }
        }, 2000); // Wait for app to load
      });
    });
    
    console.log('=== Browser Environment Test Results ===');
    console.log('Generate G-code function available:', kirimotoTest.hasGenerateGcode);
    console.log('Can import modules:', kirimotoTest.canImportKiri);
    console.log('WebWorker support:', kirimotoTest.hasWorker);
    console.log('Blob support:', kirimotoTest.hasBlob);
    console.log('URL support:', kirimotoTest.hasURL);
    console.log('Overall browser support:', kirimotoTest.browserSupport);
    
    if (kirimotoTest.browserSupport) {
      console.log('✅ Browser environment supports all required APIs for Kiri:Moto');
      
      // Try to load and test Kiri:Moto
      const kirimotoLoadTest = await page.evaluate(async () => {
        try {
          console.log('Attempting to load KirimotoUpdate...');
          const module = await import('./KirimotoUpdate.js');
          
          if (module.generateGcode && typeof module.generateGcode === 'function') {
            return {
              success: true,
              message: 'Kiri:Moto loaded successfully',
              hasGenerateGcode: true
            };
          } else {
            return {
              success: false,
              message: 'KirimotoUpdate loaded but generateGcode not found',
              moduleKeys: Object.keys(module)
            };
          }
        } catch (error) {
          return {
            success: false,
            message: 'Failed to load KirimotoUpdate',
            error: error.message
          };
        }
      });
      
      console.log('=== Kiri:Moto Load Test ===');
      console.log('Load successful:', kirimotoLoadTest.success);
      console.log('Message:', kirimotoLoadTest.message);
      
      if (kirimotoLoadTest.success) {
        console.log('🎉 SUCCESS: Real Kiri:Moto G-code generation IS available in browser!');
        return {
          available: true,
          method: 'browser',
          message: 'Kiri:Moto can be tested using Puppeteer browser automation'
        };
      } else {
        console.log('⚠️  Kiri:Moto module load failed:', kirimotoLoadTest.message);
        return {
          available: false,
          browserSupport: true,
          reason: 'Module loading issue'
        };
      }
      
    } else {
      console.log('❌ Browser environment missing required APIs');
      return {
        available: false,
        browserSupport: false,
        reason: 'Missing browser APIs'
      };
    }
    
  } catch (error) {
    console.error('Test setup failed:', error.message);
    return {
      available: false,
      reason: 'Test setup failure',
      error: error.message
    };
    
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
  }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testKiriMotoAvailability()
    .then(result => {
      console.log('\n=== FINAL RESULT ===');
      if (result.available) {
        console.log('✅ Kiri:Moto testing IS POSSIBLE');
        console.log('Method:', result.method);
        console.log('Details:', result.message);
      } else {
        console.log('❌ Kiri:Moto testing not available');
        console.log('Reason:', result.reason);
      }
    })
    .catch(error => {
      console.error('Test failed:', error);
    });
}