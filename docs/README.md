# Abundance Documentation

## Quick Start

New to Abundance? Start here:
1. [Architecture Overview](../ARCHITECTURE.md) - Understand the system design
2. [Development Guide](DEVELOPMENT.md) - Set up your development environment  
3. [Contributing Guidelines](../CONTRIBUTING.md) - How to contribute to the project

## Documentation Index

### For Developers
- **[Architecture Overview](../ARCHITECTURE.md)** - High-level system design and data flow
- **[Development Guide](DEVELOPMENT.md)** - Setup, patterns, and development workflow
- **[Code Structure](CODE_STRUCTURE.md)** - File organization and component hierarchy
- **[Contributing](../CONTRIBUTING.md)** - Guidelines for contributing code

### For Understanding the Domain
- **[Glossary](GLOSSARY.md)** - Key concepts, terminology, and definitions
- **[User Guide](../README.md)** - Complete user documentation with examples

### Technical References
- **Build System**: Vite with React plugin
- **Testing**: Vitest framework with geometry-focused tests
- **3D Engine**: ReplicaD (OpenCASCADE-based) + Three.js
- **Storage**: GitHub repositories for projects and version control

## Key Concepts for Developers

### Visual Programming Paradigm
Abundance uses a **node-based visual programming** approach where:
- **Atoms** = Basic operations (like function calls)
- **Molecules** = Reusable combinations (like custom functions)
- **Flow** = The visual program (like source code)
- **Connectors** = Data flow between operations

### CAD Pipeline
```
User Input → Flow Compilation → Worker Thread → ReplicaD → Three.js → 3D Display
```

### State Management
- **Local State**: Component-specific data with useState
- **Context**: Shared state (authentication, projects)
- **GitHub**: Persistent storage and version control
- **Workers**: Heavy computation isolation

### Key Integration Points
1. **GitHub OAuth** - Authentication and project storage
2. **ReplicaD Worker** - 3D geometry processing
3. **Three.js Renderer** - 3D visualization
4. **React Flow** - Visual programming interface

## Development Workflow

1. **Setup**: `npm install --legacy-peer-deps && npm start`
2. **Testing**: `npm run unit` (run frequently)
3. **Building**: `npm run build` (verify before commits)
4. **Contributing**: Follow the [Contributing Guide](../CONTRIBUTING.md)

## Common Tasks

### Adding a New Atom
1. Create component in `src/components/atoms/`
2. Add to atom menu/registry
3. Implement geometry logic in worker
4. Add tests in `tests/`
5. Update documentation

### Debugging 3D Issues
1. Check browser console for worker errors
2. Use React DevTools for component state
3. Monitor memory usage for geometry leaks
4. Verify ReplicaD operation validity

### Working with GitHub Integration
1. All projects stored as GitHub repositories
2. OAuth handles authentication
3. Octokit library manages API calls
4. Real-time collaboration through GitHub

## Architecture Decisions

### Why Visual Programming?
- More intuitive than traditional CAD text commands
- Enables modular, reusable design components
- Natural fit for collaborative design workflows
- Reduces barrier to entry for non-programmers

### Why GitHub for Storage?
- Built-in version control and collaboration
- Familiar to developers
- Free hosting and distribution
- Natural fit for the programming paradigm

### Why Web-Based?
- No installation required
- Cross-platform compatibility
- Easy sharing and collaboration
- Leverages modern web technologies

## Performance Considerations

### 3D Rendering
- Use worker threads for heavy geometry operations
- Implement LOD (Level of Detail) for complex models
- Clean up Three.js objects properly
- Monitor memory usage during development

### React Performance
- Use React.memo for expensive components
- Implement proper dependency arrays in useEffect
- Avoid unnecessary re-renders in the flow editor
- Profile with React DevTools

## Security Notes

- Never commit OAuth tokens or API keys
- Validate all user inputs before processing
- Sanitize data before GitHub storage
- Use environment variables for configuration