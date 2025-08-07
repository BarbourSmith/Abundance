# Abundance - Web-Based CAD Platform

Abundance is a web-based CAD program for cooperative design that inherits from programming languages rather than drawing programs. It's built with React, Vite, and the replicad CAD library, enabling collaborative 3D modeling with GitHub integration.

**ALWAYS reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Quick Setup & Validation

Bootstrap, build, and test the repository:

```bash
# 1. Install dependencies (15 seconds, NEVER CANCEL)
npm install --legacy-peer-deps

# 2. Build application (17 seconds, NEVER CANCEL - set timeout to 60+ seconds)
npm run build

# 3. Run unit tests (4 seconds, includes 47 geometry tests)
npm run unit

# 4. Start development server (starts in ~300ms on port 4444)
npm start

# 5. Run end-to-end tests (50 seconds, NEVER CANCEL - set timeout to 120+ seconds)
npm test
```

**CRITICAL TIMING REQUIREMENTS:**
- **NEVER CANCEL BUILD OR TEST COMMANDS** - They may take longer than expected
- Set minimum 60-second timeout for `npm run build`
- Set minimum 120-second timeout for `npm test` (Puppeteer tests)
- Always use `--legacy-peer-deps` flag with npm install

## Development Environment Setup

### Prerequisites
- Node.js 20 (verified working version from GitHub Actions)
- npm with legacy peer dependencies support

### Local Development vs Production
Edit configuration files for local development:

1. **For local development** - Uncomment the dev section in `.env`:
   ```bash
   # Uncomment these lines in .env for local development:
   #VITE_APP_DEV = "/"
   #VITE_REDIRECT_URI = "http://localhost:4444/"
   #VITE_GH_OAUTH_CLIENT_ID = "Ov23liN8Q3iGPXSUHUsH"
   ```

2. **Change base path in `vite.config.js`**:
   ```javascript
   // Change from "/Abundance" to "/" for local development
   base: "/", // for local development
   ```

### Running the Application

**Development Mode:**
```bash
npm start
# Starts Vite dev server at http://localhost:4444
# Ready in ~300ms, includes hot reload
```

**Production Build:**
```bash
npm run build
# Builds to dist/ folder (17 seconds)
# Automatically copies index.html to 404.html for GitHub Pages routing
```

**Serve Production Build:**
```bash
npm run serve
# Serves built files from dist/ for testing production build
```

## Testing & Validation

### Unit Tests (Vitest)
```bash
# Run all unit tests (4 seconds, 47 tests)
npm run unit

# Watch mode for development
npm run unit:watch

# Generate coverage report
npm run coverage
```

**Unit Test Coverage:**
- Geometry operations (shapes, extrude, interactions)
- CAD functions (rotation, translation, boolean operations)
- Code execution and validation
- BOM (Bill of Materials) functionality

### End-to-End Tests (Puppeteer)
```bash
# NEVER CANCEL: Run Puppeteer tests (50 seconds, requires dev server running)
npm test
```

**E2E Test Process:**
1. Starts headless Chrome browser
2. Tests projects: "Wall-Anchor" and "Test-Everything-Fully"
3. Generates screenshots in `Puppet/images/`
4. Validates 3D rendering and UI functionality

**VALIDATION REQUIREMENT:** Always run through complete user scenarios after making changes:
1. Start the development server (`npm start`)
2. Navigate to http://localhost:4444
3. Verify the login screen loads (should show GitHub OAuth login)
4. Test both unit tests (`npm run unit`) and e2e tests (`npm test`)

## Project Structure & Key Locations

### Core Application Code
```
src/
├── App.jsx              # Main React application
├── components/          # Reusable UI components
├── worker/             # CAD computation workers (shapes, actions, etc.)
├── molecules/          # Reusable CAD components/assemblies
└── js/                 # Core application logic
```

### Testing Infrastructure
```
tests/                  # Unit tests (Vitest)
├── shapes.test.js      # Geometry creation tests
├── interaction.test.js # Boolean operations tests
├── extrude.test.js     # 2D to 3D conversion tests
└── ...

Puppet/                 # End-to-end tests (Puppeteer)
├── index.js            # Main test runner
├── projects_to_test.js # List of projects to validate
└── images/             # Generated screenshots
```

### Build & Configuration
```
vite.config.js          # Vite build configuration
vitest.config.mjs       # Unit test configuration
package.json            # Dependencies and scripts
.env                    # Environment variables (dev/prod switch)
```

## GitHub Integration & Deployment

### CI/CD Workflows
- **`.github/workflows/Actions.yaml`** - GitHub Pages deployment
- **`.github/workflows/test.yaml`** - Puppeteer tests on PRs

### Deployment Process
1. Pushes to `main` branch trigger automatic deployment
2. Build process: `npm ci --legacy-peer-deps && npm run build`
3. Deploys to GitHub Pages at abundance.maslowcnc.com

## Key Dependencies & Technologies

### Core Technologies
- **React 18.2.0** - UI framework
- **Vite 5.1.6** - Build tool and dev server
- **replicad 0.16.1** - 3D CAD library
- **three.js 0.161.0** - 3D rendering
- **@react-three/fiber** - React Three.js integration

### Authentication & Storage
- **@auth0/auth0-react** - OAuth authentication
- **@octokit/rest** - GitHub API integration
- Projects stored as GitHub repositories

## Common Development Tasks

### Working with CAD Operations
**Location:** `src/worker/` directory contains core CAD functions:
- `shapes.js` - Basic shape creation (circle, rectangle, polygon)
- `actions.js` - Transformations (move, rotate, extrude)
- `interaction.js` - Boolean operations (union, difference, intersection)

### Adding New Tests
**Unit Tests:** Add to `tests/` directory using Vitest framework
**E2E Tests:** Modify `Puppet/projects_to_test.js` to include new projects

### Debugging Build Issues
1. Check for replicad compatibility issues
2. Verify `--legacy-peer-deps` is used
3. Run `npm run unit` to catch geometry calculation errors
4. Use `npm start` for development debugging with hot reload

## Validation Checklist

Before committing changes, ALWAYS:
- [ ] Run `npm run build` and wait for completion (NEVER CANCEL)
- [ ] Run `npm run unit` to verify unit tests pass
- [ ] Start `npm start` and verify application loads at http://localhost:4444
- [ ] Run `npm test` for full e2e validation (NEVER CANCEL)
- [ ] Verify login screen displays correctly
- [ ] Test core CAD functionality if making worker changes

## Known Issues & Workarounds

### Dependencies
- **ALWAYS use `--legacy-peer-deps`** flag with npm install
- Some deprecation warnings are expected (rimraf, react-three-fiber)
- 4 npm audit vulnerabilities present but do not affect functionality

### Development Environment
- OAuth integration requires GitHub configuration for full functionality
- Local development uses different OAuth client IDs than production
- Puppeteer tests require the development server to be running

### Performance Notes
- Initial build includes large WebAssembly files (10MB+ replicad_single.wasm)
- Main bundle is large (5.6MB) - this is expected for CAD applications
- 3D rendering requires WebGL support in browser

**Never skip validation steps due to timing - builds and tests may take longer than typical web applications due to 3D geometry computations.**