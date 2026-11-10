const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Use the full path to wasm-pack
const wasmPackPath: string = path.join(process.env.HOME || '', '.cargo', 'bin', 'wasm-pack');
const wasmOptPath: string = path.join(process.env.HOME || '', '.cargo', 'bin', 'wasm-opt');

// Set RUSTFLAGS to enable SIMD support and optimize for size
// Using --target no-modules to avoid generating unnecessary glue code
const command: string = `RUSTFLAGS="-C target-feature=+simd128" ${wasmPackPath} build --release --no-opt --target no-modules --out-name polygon-packer --out-dir ./pkg`;
console.log(`Running command: ${command}`);

exec(command, (error: Error | null, stdout: string, stderr: string) => {
    if (error) {
        console.error(`Error: ${error.message}`);
        console.error(`stderr: ${stderr}`);
        process.exit(1);
    }
    console.log('stdout:', stdout);
    console.log('stderr:', stderr);

    // Try to run wasm-opt with SIMD support for additional size optimization
    const wasmFile: string = path.join(__dirname, '..', 'pkg', 'polygon-packer_bg.wasm');

    // Try multiple possible locations for wasm-opt
    const possibleWasmOptPaths: string[] = [wasmOptPath, '/usr/bin/wasm-opt', '/usr/local/bin/wasm-opt'];

    const availableWasmOpt: string | undefined = possibleWasmOptPaths.find((p: string) => fs.existsSync(p));

    if (availableWasmOpt && fs.existsSync(wasmFile)) {
        console.log('Running wasm-opt with SIMD support for size optimization...');
        const optCommand: string = `${availableWasmOpt} -Os --enable-simd --enable-bulk-memory --enable-sign-ext --enable-mutable-globals ${wasmFile} -o ${wasmFile}`;

        exec(optCommand, (optError: Error | null, optStdout: string, optStderr: string) => {
            if (optError) {
                console.warn(`wasm-opt warning: ${optError.message}`);
                console.warn('Continuing without additional optimization');
            } else {
                console.log('wasm-opt completed successfully');
                const stats = fs.statSync(wasmFile);
                console.log(`Final WASM size: ${(stats.size / 1024).toFixed(2)} KB`);
            }

            // Copy WASM file to dist folder
            copyWasmToDist();
        });
    } else {
        if (fs.existsSync(wasmFile)) {
            const stats = fs.statSync(wasmFile);
            console.log(`\nℹ️  wasm-opt not found. Current WASM size: ${(stats.size / 1024).toFixed(2)} KB`);
            console.log('💡 To further reduce size (~20-30%), install binaryen:');
            console.log('   sudo apt install binaryen  (Ubuntu/Debian)');
            console.log('   or cargo install wasm-opt\n');
        }

        // Copy WASM file to dist folder
        copyWasmToDist();
    }
});

// Function to copy WASM file to dist folder
function copyWasmToDist(): void {
    const sourcePath: string = path.join(__dirname, '..', 'pkg', 'polygon-packer_bg.wasm');
    const destPath: string = path.join(__dirname, '../../..', 'dist', 'polygon-packer.wasm');

    try {
        // Ensure dist directory exists
        const distDir: string = path.dirname(destPath);
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
        }

        fs.copyFileSync(sourcePath, destPath);
        console.log('✅ WASM file copied successfully to dist/polygon-packer.wasm');
    } catch (error: any) {
        console.error('❌ Error copying WASM file:', error.message);
        process.exit(1);
    }
}
