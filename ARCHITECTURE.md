# Abundance Architecture Overview

## System Overview

Abundance is a web-based CAD program that uses a visual node-based programming paradigm for 3D design. It breaks from traditional CAD drawing programs by inheriting from logical/programming languages, enabling features like modules, version control, and collaboration.

## High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Storage       │
│   (React/Vite)  │◄──►│   (AWS Lambda)  │◄──►│   (GitHub)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
│                      │                      │
│ • Visual Flow Editor │ • Authentication    │ • Project Storage
│ • 3D Viewer         │ • API Gateway       │ • Version Control
│ • Component Library │ • Proxy Functions   │ • Collaboration
└─────────────────────┘ └─────────────────────┘ └─────────────────┘
```

## Core Components

### 1. Visual Flow System
- **Atoms**: Basic building blocks (shapes, operations)
- **Molecules**: Reusable combinations of atoms
- **Flow**: Visual node graph representing the design logic
- **Connectors**: Links between atoms/molecules

### 2. 3D Engine
- **ReplicaD**: Core 3D CAD engine for geometric operations
- **Three.js**: 3D rendering and visualization
- **Worker**: Background processing for heavy computations

### 3. Authentication & Storage
- **Auth0/GitHub**: User authentication
- **GitHub API**: Project storage as repositories
- **Octokit**: GitHub integration library

### 4. Development Stack
- **React 18**: UI framework
- **Vite**: Build tool and development server
- **Vitest**: Testing framework
- **Material-UI**: Component library

## Key Data Flow

1. **Project Loading**: GitHub → API → Frontend → Flow Editor
2. **Design Editing**: Flow Editor → 3D Engine → Visual Update
3. **Computation**: Atoms/Molecules → Worker → ReplicaD → Geometry
4. **Saving**: Flow → API → GitHub Repository

## Directory Structure

- `src/`: Main application source code
- `src/components/`: React components for UI
- `src/worker/`: Background computation workers
- `src/molecules/`: Reusable design components
- `Lambda AWS Functions/`: Backend serverless functions
- `tests/`: Test suites for components and logic
- `vendor/`: Custom geometry utilities

## Key Technologies

- **ReplicaD**: 3D CAD engine (OpenCASCADE-based)
- **React Three Fiber**: 3D scene management
- **CodeMirror**: Code editor for custom scripts
- **Puppeteer**: Automated testing
- **GitHub API**: Version control and storage

## Design Patterns

- **Component-based Architecture**: Modular React components
- **Worker Pattern**: Heavy computations off main thread
- **Repository Pattern**: GitHub as database
- **Visual Programming**: Node-based flow instead of text code