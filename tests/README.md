# Worker.js Testing Guide

This directory contains integration tests for `worker.js`, which contains
most of the core CAD operations for Abundance. These tests use a real
instance of replicad, and are generally structured as making geometric
assertions shapes created or modified by `worker.js` code.

These tests are orchestrated with the vitest framework.

## Test Structure

```
vitest.config.mjs         # Configuration for testing testing targets and setups.
tests/
├── setupVitestMocks.mjs  # Setup run before each test suite. Primarily fixes imports for the
                          # test environment.
├── extrude.test.mjs      # Tests of the extrude function which takes 2d shapes to 3d.
```

## Running Tests

### Basic Commands

```bash
# Run all tests
npm run unit

# Re-run tests whenever test or source code changes
npm run unit:watch

# Generate a coverage report for our current integration tests.
# Reports will be generated to coverage/index.html
npm run coverage
```

### Advanced Test Commands

```bash
# Run a specific test from a specific file (or omit the line number to run all tests in a file)
npm run unit tests/extrude.test.mjs:26

# Run all tests in any file whose name includes "extrude"
npm run unit extrude
```

## Test Overview

We currently have two types of tests. The Vitests described above (ie. integration tests)
and the Puppet tests defined elsewhere (ie. end-to-end tests).

### Testing goals:

In the long term we aspire to have complete integration test coverage for all worker tasks.
