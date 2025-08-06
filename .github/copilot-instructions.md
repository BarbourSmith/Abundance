# Abundance - Web-based Collaborative CAD Program

Abundance is a React-based web application for collaborative 3D CAD design that integrates with GitHub for project storage. It uses the replicad library (OpenCascade) for 3D modeling operations and features a node-based programming interface for creating parametric designs.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Bootstrap and Setup
- Install dependencies: `npm install --legacy-peer-deps` -- takes 15 seconds. NEVER CANCEL.
- Build the application: `npm run build` -- takes 18 seconds. NEVER CANCEL. Set timeout to 45+ seconds.
- Run unit tests: `npm run unit` -- takes 4 seconds. NEVER CANCEL. Set timeout to 15+ seconds.
- Run end-to-end tests: `npm test` -- takes 30-60 seconds. NEVER CANCEL. Set timeout to 120+ seconds.

### Development Workflow
- Start development server: `npm start` -- starts Vite dev server on port 4444 in under 1 second
- Access application: `http://localhost:4444`
- **CRITICAL**: The application loads successfully and shows the Abundance login screen
- Hot reload is enabled - changes to source files automatically refresh the browser

### Environment Configuration
- Edit `.env` file to switch between development and production modes:
  - FOR DEV: Uncomment the "FOR DEV" section, comment out "FOR PROD" section
  - FOR PROD: Comment out "FOR DEV" section, uncomment "FOR PROD" section
- Edit `vite.config.js` base path:
  - FOR DEV: Set `base: "/"`
  - FOR PROD: Set `base: "/Abundance"`

## Validation

### Required Testing Steps
- **ALWAYS** run the full build and test sequence after making changes:
  1. `npm install --legacy-peer-deps` (if dependencies changed)
  2. `npm run build` (verify build succeeds)
  3. `npm run unit` (verify unit tests pass)
  4. `npm start` (verify dev server starts)
  5. `npm test` (verify Puppeteer e2e tests pass)

### Manual Validation Requirements
- **ALWAYS** manually test the application by opening `http://localhost:4444` and verifying:
  - The login screen loads without errors
  - Console shows no critical errors (some Auth0/GitHub API warnings are expected)
  - The Vite dev server connects successfully
- **CRITICAL**: After any changes to the worker, atoms, or core CAD functionality, run through a complete design scenario:
  1. Login with GitHub (if testing auth flow)
  2. Create or load a project
  3. Place atoms (shapes, operations) in the flow
  4. Verify 3D rendering works correctly
  5. Test export functionality if modified

## Build System and Architecture

### Key Technologies
- **Frontend**: React 18.2.0 with Vite 5.4.19 build system
- **3D Engine**: replicad (OpenCascade-based) for CAD operations
- **Rendering**: React Three Fiber (@react-three/fiber) for 3D visualization
- **Authentication**: Auth0 with GitHub OAuth integration
- **Testing**: Vitest for unit tests, Puppeteer for end-to-end tests

### Critical Dependencies
- `replicad` and `replicad-opencascadejs` - Core CAD engine (DO NOT UPDATE without extensive testing)
- Vendor packages: `geometry-utils` and `polygon-packer` (file: dependencies in vendor/ directory)
- `--legacy-peer-deps` flag is REQUIRED for npm install due to dependency conflicts

### Timeout Requirements
- **Build**: NEVER CANCEL. Set timeout to 45+ seconds (usually takes 18 seconds)
- **Unit Tests**: NEVER CANCEL. Set timeout to 15+ seconds (usually takes 4 seconds)  
- **E2E Tests**: NEVER CANCEL. Set timeout to 120+ seconds (usually takes 30-60 seconds)
- **Dev Server**: Starts in under 1 second, no timeout needed

## Testing Framework

### Unit Tests (Vitest)
- Located in `tests/` directory
- Test core CAD operations: extrusion, boolean operations, geometry creation
- Run with: `npm run unit`
- Watch mode: `npm run unit:watch`
- Coverage: `npm run coverage` (generates coverage/index.html)
- **CRITICAL**: Tests require dependency patching via `tests/patchDependencies.mjs`

### End-to-End Tests (Puppeteer)
- Located in `Puppet/` directory
- Tests complete application workflows with real projects
- Generates screenshots in `Puppet/images/` for visual verification
- Run with: `npm test`
- Tests specific projects defined in `Puppet/projects_to_test.js`

## Project Structure

### Core Directories
```
src/
├── components/          # React components
│   ├── main-routes/    # Main application routing
│   ├── render/         # 3D rendering components
│   └── secondary/      # Secondary UI components
├── worker/             # Web workers for CAD operations
├── js/                 # Utility JavaScript modules
├── molecules/          # CAD molecule definitions
└── prototypes/         # Prototype components

tests/                  # Unit test suites
Puppet/                 # End-to-end test framework
vendor/                 # Local dependencies (geometry-utils, polygon-packer)
```

### Key Files
- `src/worker/` - Contains the core CAD computation logic
- `src/components/render/` - 3D visualization and rendering
- `src/js/circular-menu/` - Context menu for placing CAD atoms
- `.env` - Environment configuration (dev/prod switching)
- `vite.config.js` - Build configuration with base path setting

## GitHub Integration

### CI/CD Workflows
- `.github/workflows/test.yaml` - Runs Puppeteer tests on PRs with screenshot comparison
- `.github/workflows/Actions.yaml` - Deploys to GitHub Pages on main branch
- Both workflows use `npm ci --legacy-peer-deps` for consistent installs

### Authentication Flow
- Application integrates with GitHub OAuth for user authentication
- Projects are stored as GitHub repositories
- Different OAuth client IDs for development and production environments

## Common Issues and Solutions

### Build Issues
- If `npm install` fails: Ensure `--legacy-peer-deps` flag is used
- If build fails with WASM errors: Check that replicad dependencies are properly installed
- If tests fail: Run `npm run unit` individually to isolate unit test vs e2e test issues

### Development Environment
- Port 4444 must be available for development server
- GitHub OAuth requires proper redirect URI configuration in .env
- Some console warnings about Auth0 and GitHub API are expected and not critical

### Performance Notes
- Initial build includes large WASM files (replicad_single.wasm is ~10MB)
- Bundle size warnings are expected due to CAD engine requirements
- Hot reload works for UI changes but may require full reload for worker changes

## Validation Checklist

Before completing any changes, ALWAYS verify:
- [ ] `npm install --legacy-peer-deps` succeeds
- [ ] `npm run build` completes without errors
- [ ] `npm run unit` passes all tests
- [ ] `npm start` successfully starts dev server on port 4444
- [ ] Application loads at `http://localhost:4444` without critical errors
- [ ] If modifying CAD functionality: `npm test` passes with new screenshots
- [ ] No new build artifacts committed (dist/, coverage/, Puppet/images/*.png are gitignored)

## Emergency Commands

If the application becomes unresponsive or enters an error state:
1. Stop dev server: Ctrl+C in terminal running `npm start`
2. Clear node_modules: `rm -rf node_modules package-lock.json`
3. Reinstall: `npm install --legacy-peer-deps`
4. Rebuild: `npm run build`
5. Restart: `npm start`

**Remember**: NEVER CANCEL long-running commands. The CAD engine compilation and WASM loading require time to complete properly.