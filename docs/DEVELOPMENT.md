# Development Guide

## Getting Started

### Prerequisites
- Node.js (version 16+)
- Git
- GitHub account (for authentication)

### Setup
```bash
git clone https://github.com/BarbourSmith/Abundance.git
cd Abundance
npm install --legacy-peer-deps
npm start  # Starts development server at http://localhost:4444
```

## Code Organization

### Source Structure
```
src/
├── App.jsx                 # Main application component
├── index.jsx              # Application entry point
├── components/            # Reusable UI components
│   ├── Flow/             # Visual flow editor components
│   ├── ThreeD/           # 3D viewer components
│   └── UI/               # General UI components
├── hooks/                # Custom React hooks
├── molecules/            # Reusable design molecules
├── prototypes/           # Experimental features
├── styles/               # CSS and styling
├── worker/               # Background computation workers
└── js/                   # Utility libraries
    └── circular-menu/    # Custom circular menu component
```

## Key Concepts

### Atoms vs Molecules
- **Atoms**: Basic building blocks (Circle, Rectangle, Extrude, etc.)
- **Molecules**: Combinations of atoms that create reusable components
- Both are represented as nodes in the visual flow

### Flow System
- **Flow**: The visual node graph representing design logic
- **Connectors**: Data flow between nodes
- **Inputs/Outputs**: Node attachment points

### Geometry Pipeline
1. User creates/modifies flow
2. Flow is compiled to operations
3. Operations sent to worker thread
4. ReplicaD processes geometry
5. Result rendered in 3D viewer

## Coding Patterns

### Component Structure
```javascript
// Standard component pattern
const ComponentName = ({ prop1, prop2 }) => {
  const [state, setState] = useState(initialValue);
  
  useEffect(() => {
    // Side effects
  }, [dependencies]);
  
  return (
    <div>
      {/* JSX */}
    </div>
  );
};

export default ComponentName;
```

### State Management
- Local state with `useState` for component-specific data
- Context API for shared state (auth, projects)
- Props for parent-child communication

### Async Operations
```javascript
// Worker communication pattern
const processGeometry = async (operations) => {
  return new Promise((resolve) => {
    worker.postMessage(operations);
    worker.onmessage = (e) => resolve(e.data);
  });
};
```

## Testing

### Running Tests
```bash
npm run unit          # Run all tests
npm run unit:watch    # Watch mode
npm run coverage      # Coverage report
```

### Test Structure
- Unit tests in `tests/` directory
- Test files named `*.test.js`
- Uses Vitest framework
- Focus on geometric operations and core logic

### Writing Tests
```javascript
import { describe, it, expect } from 'vitest';
import { someFunction } from '../src/path/to/module';

describe('Module Name', () => {
  it('should do something specific', () => {
    const result = someFunction(input);
    expect(result).toEqual(expectedOutput);
  });
});
```

## Build System

### Vite Configuration
- Development server with HMR
- Build optimization for production
- Custom plugins for geometry libraries

### Scripts
- `npm start`: Development server
- `npm run build`: Production build
- `npm run serve`: Preview built app
- `npm run test`: Automated tests

## Dependencies

### Core Libraries
- `react`: UI framework
- `replicad`: 3D CAD engine
- `three`: 3D graphics
- `@react-three/fiber`: React Three.js integration
- `@react-three/drei`: Three.js helpers

### Development Tools
- `vite`: Build tool
- `vitest`: Testing framework
- `@vitejs/plugin-react`: React support

## File Naming Conventions

- Components: PascalCase (`FlowEditor.jsx`)
- Utilities: camelCase (`geometryUtils.js`)
- Constants: UPPER_SNAKE_CASE (`API_ENDPOINTS.js`)
- Hooks: camelCase with 'use' prefix (`useGeometry.js`)

## Performance Considerations

### Worker Threads
- Heavy computations (geometry processing) run in workers
- Keeps UI responsive during complex operations
- Use `comlink` for easier worker communication

### 3D Rendering
- Optimize geometry complexity
- Use LOD (Level of Detail) when possible
- Batch similar operations

### Memory Management
- Clean up Three.js objects when unmounting
- Dispose geometries and materials
- Monitor memory usage in development