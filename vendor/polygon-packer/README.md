# polygon-packer

TypeScript wrapper and orchestration layer for the polygon nesting algorithm.

## Overview

This package provides high-level APIs for packing polygons efficiently using genetic algorithms and No-Fit Polygon (NFP)
calculations. It manages parallel worker threads for multi-threaded nesting operations.

## Features

-   Multi-threaded polygon packing with Web Workers
-   TypeScript bindings for WASM nesting engine
-   Progress tracking and result callbacks
-   Support for single-threaded and parallel execution modes

## Build

```bash
npm run build
```

Outputs:

-   `dist/polygon-packer.js` - Main UMD bundle (17KB minified)
-   `dist/polygon-packer.calc.js` - Worker module (12KB minified)

## Dependencies

-   `polygon-packer-algo` - WASM nesting engine (loaded at runtime)
