/**
 * Browser-based G-code test using Puppeteer
 * 
 * This test runs Kiri:Moto G-code generation in a real browser environment
 * where all WebWorker and browser APIs are available.
 */

import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Test Kiri:Moto G-code generation in a real browser environment
 */
async function testKiriMotoInBrowser() {
  let browser;
  let server;
  
  try {
    console.log('🚀 Starting browser-based Kiri:Moto test...');
    
    // Start the Vite dev server first
    console.log('Starting dev server...');
    const { spawn } = await import('child_process');
    
    server = spawn('npm', ['start'], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });
    
    // Wait for server to be ready
    await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 30000);
      
      server.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('ready in') || output.includes('Local:')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      server.stderr.on('data', (data) => {
        console.log('Server stderr:', data.toString());
      });
    });
    
    console.log('✅ Dev server started');
    
    // Launch Puppeteer browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Enable console logging from the page
    page.on('console', (msg) => {
      console.log(`Browser console [${msg.type()}]:`, msg.text());
    });
    
    page.on('pageerror', (error) => {
      console.log('Browser page error:', error.message);
    });
    
    // Navigate to the application
    console.log('Loading application in browser...');
    await page.goto('http://localhost:4444', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    console.log('✅ Application loaded');
    
    // Read the Test.stl file
    const stlPath = resolve('./tests/Test.stl');
    const stlBuffer = readFileSync(stlPath);
    const stlBase64 = stlBuffer.toString('base64');
    
    // Inject our test code into the page
    const testResult = await page.evaluate(async (stlBase64Data) => {
      // Helper function to decode base64 to ArrayBuffer
      function base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      }
      
      // Helper function to count cutting passes in G-code
      function countCuttingPasses(gcode) {
        let negativePasses = 0;
        let currentZ = 0;
        
        const lines = gcode.split('\n');
        
        for (const line of lines) {
          const cmd = line.trim().toUpperCase();
          
          if ((cmd.startsWith('G0') || cmd.startsWith('G1')) && cmd.includes('Z')) {
            const zMatch = cmd.match(/Z([\d.-]+)/);
            if (zMatch) {
              const z = parseFloat(zMatch[1]);
              
              if (z < 0 && z !== currentZ) {
                negativePasses++;
                currentZ = z;
              }
            }
          }
        }
        
        return negativePasses;
      }
      
      try {
        console.log('Testing real Kiri:Moto G-code generation in browser...');
        
        // Convert base64 to Blob
        const arrayBuffer = base64ToArrayBuffer(stlBase64Data);
        const stlBlob = new Blob([arrayBuffer], { type: 'application/sla' });
        const stlURL = URL.createObjectURL(stlBlob);
        
        console.log('Created STL blob URL:', stlURL);
        
        // Check if generateGcode is available
        if (typeof window.generateGcode !== 'function') {
          console.log('Loading KirimotoUpdate.js...');
          
          // Dynamically import KirimotoUpdate.js
          const module = await import('./KirimotoUpdate.js');
          
          if (module.generateGcode) {
            window.generateGcode = module.generateGcode;
            console.log('✅ generateGcode loaded from module');
          } else {
            throw new Error('generateGcode not found in KirimotoUpdate.js');
          }
        }
        
        // Test configuration
        const centerPos = [0, 0, 0];
        const toolSize = 6.35;
        const requestedPasses = 2; // This is the problematic case
        const speed = 1500;
        const cutThrough = 1.5;
        
        console.log(`Testing with ${requestedPasses} passes...`);
        
        // Generate G-code using real Kiri:Moto
        const gcode = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('G-code generation timeout'));
          }, 30000);
          
          try {
            window.generateGcode(
              stlURL,
              centerPos,
              toolSize,
              requestedPasses,
              speed,
              cutThrough,
              (generatedGcode) => {
                clearTimeout(timeout);
                URL.revokeObjectURL(stlURL);
                resolve(generatedGcode);
              },
              (progress) => {
                console.log(`G-code generation progress: ${(progress * 100).toFixed(1)}%`);
              }
            );
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        });
        
        console.log('✅ G-code generated successfully');
        console.log(`G-code length: ${gcode.length} characters`);
        
        // Analyze the G-code
        const actualPasses = countCuttingPasses(gcode);
        
        const result = {
          success: true,
          requestedPasses,
          actualPasses,
          gcodeLength: gcode.length,
          gcodeSample: gcode.substring(0, 500),
          passCountCorrect: actualPasses === requestedPasses,
          message: actualPasses === requestedPasses 
            ? `✅ Pass count correct: ${actualPasses} passes`
            : `❌ BUG DETECTED: Expected ${requestedPasses} passes, got ${actualPasses} passes`
        };
        
        console.log('=== Real Kiri:Moto Test Results ===');
        console.log(`Requested passes: ${requestedPasses}`);
        console.log(`Actual passes found: ${actualPasses}`);
        console.log(`Result: ${result.message}`);
        
        return result;
        
      } catch (error) {
        console.error('Test failed:', error);
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    }, stlBase64);
    
    // Report results
    console.log('\n=== FINAL TEST RESULTS ===');
    if (testResult.success) {
      console.log(`✅ Real Kiri:Moto G-code generation successful!`);
      console.log(`Requested passes: ${testResult.requestedPasses}`);
      console.log(`Actual passes: ${testResult.actualPasses}`);
      console.log(`Pass count correct: ${testResult.passCountCorrect}`);
      console.log(`Message: ${testResult.message}`);
      
      if (!testResult.passCountCorrect) {
        console.log('\n🐛 BUG CONFIRMED: The pass count issue exists in real Kiri:Moto generation!');
        console.log('This confirms the issue described in GitHub issue #777');
      }
      
      console.log('\nG-code sample:');
      console.log(testResult.gcodeSample);
      
    } else {
      console.log(`❌ Test failed: ${testResult.error}`);
      if (testResult.stack) {
        console.log('Stack trace:', testResult.stack);
      }
    }
    
    return testResult;
    
  } catch (error) {
    console.error('Browser test setup failed:', error);
    return { success: false, error: error.message };
    
  } finally {
    // Cleanup
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
    
    if (server) {
      server.kill();
      console.log('Dev server stopped');
    }
  }
}

// Export for use in other tests
export { testKiriMotoInBrowser };

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testKiriMotoInBrowser()
    .then((result) => {
      if (result.success && result.passCountCorrect) {
        console.log('\n✅ All tests passed');
        process.exit(0);
      } else if (result.success && !result.passCountCorrect) {
        console.log('\n⚠️ Test completed but bug detected');
        process.exit(1);
      } else {
        console.log('\n❌ Test failed');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}