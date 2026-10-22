# polygon-packer-algo

Rust/WebAssembly core nesting engine for high-performance polygon packing.

## Overview

This package contains the Rust implementation of the nesting algorithms, compiled to WebAssembly for browser execution. It
includes Clipper for polygon operations, genetic algorithms for optimization, and NFP (No-Fit Polygon) calculations.

## Features

-   **Clipper**: Robust polygon clipping and offsetting
-   **Genetic Algorithm**: Evolutionary optimization for placement
-   **NFP Calculation**: No-Fit Polygon generation for collision detection
-   **SIMD Support**: Optimized with WebAssembly SIMD instructions

## Build

```bash
npm run build
```

This uses `wasm-pack` to compile Rust to WebAssembly and outputs:

-   `pkg/polygon-packer_bg.wasm` - Raw WASM binary
-   `dist/polygon-packer.wasm` - Optimized WASM file (211KB)

## Requirements

-   Rust toolchain with `wasm32-unknown-unknown` target
-   `wasm-pack` for building
-   `wasm-opt` (optional) for size optimization
