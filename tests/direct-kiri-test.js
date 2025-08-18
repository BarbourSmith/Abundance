/**
 * Direct Kiri:Moto test using the global generateGcode function
 * Since window.generateGcode was detected as available, let's use it directly
 */

import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export async function testDirectKiriMoto() {
  let browser;
  let server;
  
  try {
    console.log('🎯 Testing direct Kiri:Moto G-code generation...');
    
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
    
    console.log('✅ Dev server started');
    
    // Launch browser
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 30000
    });
    
    const page = await browser.newPage();
    
    // Set up console logging
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`❌ Browser error: ${msg.text()}`);
      } else {
        console.log(`📝 Browser: ${msg.text()}`);
      }
    });
    
    await page.goto('http://localhost:4444', { 
      waitUntil: 'networkidle0', 
      timeout: 30000 
    });
    
    console.log('✅ Browser loaded application');
    
    // Wait for Kiri:Moto to be fully loaded
    await page.waitForFunction(
      () => typeof window.generateGcode === 'function',
      { timeout: 10000 }
    );
    
    console.log('✅ generateGcode function detected');
    
    // Load STL file
    const stlPath = resolve('./tests/Test.stl');
    const stlBuffer = readFileSync(stlPath);
    const stlBase64 = stlBuffer.toString('base64');
    
    // Run the G-code generation test in browser
    const testResult = await page.evaluate(async (stlBase64Data) => {
      
      function countCuttingPasses(gcode) {
        let passes = 0;
        let currentZ = 0;
        const lines = gcode.split('\n');
        
        for (const line of lines) {
          const cmd = line.trim().toUpperCase();
          if ((cmd.startsWith('G0') || cmd.startsWith('G1')) && cmd.includes('Z')) {
            const zMatch = cmd.match(/Z([\d.-]+)/);
            if (zMatch) {
              const z = parseFloat(zMatch[1]);
              if (z < 0 && z !== currentZ) {
                passes++;
                currentZ = z;
              }
            }
          }
        }
        return passes;
      }
      
      try {
        console.log('🧪 Starting G-code generation test...');
        
        // Convert base64 to Blob
        const binaryString = atob(stlBase64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const stlBlob = new Blob([bytes], { type: 'application/sla' });
        const stlURL = URL.createObjectURL(stlBlob);
        
        console.log('📁 Created STL blob URL');
        
        // Test parameters
        const centerPos = [0, 0, 0];
        const toolSize = 6.35;
        const requestedPasses = 2; // The problematic case from issue #777
        const speed = 1500;
        const cutThrough = 1.5;
        
        console.log(`🔧 Test config: ${requestedPasses} passes, ${toolSize}mm tool, ${speed}mm/min`);
        
        // Generate G-code with timeout
        const gcode = await Promise.race([
          new Promise((resolve, reject) => {
            window.generateGcode(
              stlURL,
              centerPos,
              toolSize,
              requestedPasses,
              speed,
              cutThrough,
              (generatedGcode) => {
                console.log('✅ G-code generation completed');
                URL.revokeObjectURL(stlURL);
                resolve(generatedGcode);
              },
              (progress) => {
                console.log(`⏳ Progress: ${(progress * 100).toFixed(0)}%`);
              }
            );
          }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Generation timeout after 30s')), 30000);
          })
        ]);
        
        // Analyze the G-code
        const actualPasses = countCuttingPasses(gcode);
        const passCountCorrect = actualPasses === requestedPasses;
        
        // Extract G-code sample
        const lines = gcode.split('\n');
        const cuttingLines = lines.filter(line => {
          const cmd = line.trim().toUpperCase();
          return cmd.includes('Z-') && (cmd.startsWith('G0') || cmd.startsWith('G1'));
        });
        
        const result = {
          success: true,
          requestedPasses,
          actualPasses,
          passCountCorrect,
          gcodeLength: gcode.length,
          totalLines: lines.length,
          cuttingLines: cuttingLines.length,
          cuttingCommands: cuttingLines.slice(0, 10), // First 10 cutting commands
          message: passCountCorrect 
            ? `✅ PASS: Expected ${requestedPasses}, got ${actualPasses}` 
            : `🐛 BUG DETECTED: Expected ${requestedPasses}, got ${actualPasses}`,
          bugDetected: !passCountCorrect
        };
        
        console.log('=== TEST RESULTS ===');
        console.log(`Requested passes: ${requestedPasses}`);
        console.log(`Actual passes found: ${actualPasses}`);
        console.log(`Result: ${result.message}`);
        console.log(`G-code length: ${gcode.length} chars, ${lines.length} lines`);
        
        return result;
        
      } catch (error) {
        console.error('❌ Test failed:', error.message);
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    }, stlBase64);
    
    // Report final results
    console.log('\n=== DIRECT KIRI:MOTO TEST RESULTS ===');
    
    if (testResult.success) {
      console.log('🎉 SUCCESS: Real Kiri:Moto G-code generation worked!');
      console.log(`📊 Requested: ${testResult.requestedPasses} passes`);
      console.log(`📊 Actual: ${testResult.actualPasses} passes`);
      console.log(`📊 G-code: ${testResult.totalLines} lines, ${testResult.gcodeLength} chars`);
      console.log(`📊 Cutting commands: ${testResult.cuttingLines}`);
      
      if (testResult.bugDetected) {
        console.log('\n🐛 BUG CONFIRMED IN REAL KIRI:MOTO!');
        console.log('   This proves the issue described in GitHub #777 exists');
        console.log('   The test framework is working correctly');
      } else {
        console.log('\n✅ No bug detected - pass count is correct');
      }
      
      console.log('\nSample cutting commands:');
      testResult.cuttingCommands.forEach((cmd, i) => {
        console.log(`  ${i + 1}: ${cmd}`);
      });
      
      return {
        available: true,
        working: true,
        canDetectBug: true,
        result: testResult
      };
      
    } else {
      console.log('❌ Test execution failed');
      console.log('Error:', testResult.error);
      return {
        available: true,
        working: false,
        error: testResult.error
      };
    }
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    return {
      available: false,
      error: error.message
    };
    
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
    console.log('🧹 Cleanup completed');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testDirectKiriMoto()
    .then(result => {
      console.log('\n=== FINAL ANSWER ===');
      if (result.available && result.working) {
        console.log('✅ YES! Kiri:Moto CAN be tested directly in the testing environment');
        console.log('📋 Method: Puppeteer browser automation with real generateGcode function');
        console.log('🔬 Capability: Can detect real G-code pass count bugs');
        
        if (result.result?.bugDetected) {
          console.log('🐛 Bug status: CONFIRMED - the issue exists in real Kiri:Moto');
          process.exit(2); // Special exit code for bug detected
        } else {
          console.log('✅ Bug status: No issue detected');
          process.exit(0);
        }
      } else {
        console.log('❌ NO - Kiri:Moto testing not possible');
        console.log('💡 Available:', result.available);
        console.log('⚙️  Working:', result.working);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}