# Code Structure Guide

## Top-Level Directory Overview

```
Abundance/
├── src/                    # Main application source code
├── tests/                  # Test suites and test utilities
├── docs/                   # Developer documentation
├── public/                 # Static assets and HTML template
├── vendor/                 # Custom/forked dependencies
├── Lambda AWS Functions/   # Backend serverless functions
├── Puppet/                 # Automated testing scripts
├── .github/               # GitHub workflows and actions
├── package.json           # Dependencies and scripts
├── vite.config.js         # Build configuration
└── vitest.config.mjs      # Test configuration
```

## Source Code Structure (`src/`)

### Core Application Files
- `App.jsx` - Main application router and layout
- `index.jsx` - Application entry point and React root

### Component Organization
```
components/
├── Flow/                  # Visual flow editor
│   ├── FlowEditor.jsx    # Main flow editing interface
│   ├── Node.jsx          # Individual node representation
│   └── Connector.jsx     # Connection lines between nodes
├── ThreeD/               # 3D visualization
│   ├── Viewer.jsx        # Main 3D viewer component
│   ├── Scene.jsx         # Three.js scene setup
│   └── Controls.jsx      # Camera and interaction controls
├── UI/                   # General interface components
│   ├── Menu/             # Application menus
│   ├── Panels/           # Side panels and dialogs
│   └── Forms/            # Input forms and controls
└── Auth/                 # Authentication components
```

### Specialized Directories

#### `hooks/`
Custom React hooks for shared logic:
- `useAuth.js` - Authentication state management
- `useProject.js` - Project loading and saving
- `useGeometry.js` - 3D geometry operations

#### `molecules/`
Pre-built design components (user-created):
- Reusable combinations of atoms
- Exported as individual modules
- Can be shared between projects

#### `worker/`
Background processing threads:
- `geometryWorker.js` - Heavy 3D computations
- `compileWorker.js` - Flow compilation
- Keeps UI responsive during complex operations

#### `styles/`
CSS and styling files:
- Global styles and themes
- Component-specific stylesheets
- Material-UI theme customization

### Key Application Files

#### Flow System
- `src/components/Flow/` - Visual node editor
- `src/js/flowCompiler.js` - Converts flow to operations
- `src/atoms/` - Basic building blocks (implied structure)

#### 3D Engine Integration
- `src/components/ThreeD/` - 3D viewer components
- `src/worker/geometryWorker.js` - ReplicaD integration
- `src/utils/geometryUtils.js` - 3D utility functions

#### Authentication & Storage
- `src/components/Auth/` - GitHub OAuth integration
- `src/api/` - GitHub API communication
- `src/hooks/useAuth.js` - Authentication logic

## Vendor Dependencies (`vendor/`)

### Custom Packages
- `geometry-utils/` - Custom geometry utility library
- `polygon-packer/` - Polygon packing algorithms

These are local packages that extend or modify external libraries for specific needs.

## Testing Structure (`tests/`)

### Test Categories
- `shapes.test.js` - Basic shape creation and manipulation
- `interaction.test.js` - Boolean operations (union, difference, etc.)
- `actions.test.js` - Transformations (rotate, move, extrude)
- `tags.test.js` - Tagging and BOM functionality
- `code.test.js` - Custom code execution
- `cutlayout.test.js` - Layout and cutting operations

### Test Utilities
- `patchDependencies.mjs` - Patches vendor packages for testing
- Helper functions for geometry validation

## Backend Structure (`Lambda AWS Functions/`)

### API Functions
- `proxyApi/` - Main API gateway proxy
- `Test_lambda/` - Testing and development functions

### Configuration
- SAM templates for AWS deployment
- Environment-specific configurations

## Configuration Files

### Build & Development
- `vite.config.js` - Vite build configuration
- `babel.config.js` - Babel transpilation settings
- `vitest.config.mjs` - Test runner configuration

### Project Management
- `package.json` - Dependencies and npm scripts
- `.env` - Environment variables (local development)
- `.gitignore` - Git ignore patterns

## Data Flow Patterns

### Component Hierarchy
```
App
├── AuthProvider (Context)
├── Router
│   ├── ProjectList
│   ├── FlowEditor
│   │   ├── Flow (Canvas)
│   │   ├── AtomMenu
│   │   └── PropertyPanel
│   └── ThreeD Viewer
│       ├── Scene
│       ├── Camera Controls
│       └── Geometry Renderer
```

### State Management Flow
1. User authentication → Auth Context
2. Project selection → Project hooks
3. Flow editing → Local state + Workers
4. 3D rendering → Three.js components
5. Saving → GitHub API calls

## Key Integration Points

### Flow ↔ 3D Engine
- Flow changes trigger geometry recomputation
- Worker threads handle heavy processing
- Results update 3D viewer

### GitHub Integration
- Projects stored as repositories
- Real-time collaboration through GitHub
- Version control for design history

### Extensibility
- New atoms can be added to `src/atoms/`
- Custom molecules in `src/molecules/`
- Plugin system through worker extensions