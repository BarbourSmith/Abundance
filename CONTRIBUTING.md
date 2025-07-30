# Contributing to Abundance

## Getting Started

### Prerequisites
- Node.js 16+ 
- Git
- GitHub account (required for authentication)

### Development Setup
1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/Abundance.git`
3. Install dependencies: `npm install --legacy-peer-deps`
4. Start development server: `npm start`
5. Open http://localhost:4444

## Development Workflow

### Making Changes
1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes following the coding standards below
3. Test your changes: `npm run unit`
4. Build to ensure no errors: `npm run build`
5. Commit with descriptive messages
6. Push and create a pull request

### Testing
- Run tests before committing: `npm run unit`
- Add tests for new functionality in `tests/`
- Tests should focus on geometric operations and core logic
- Use Vitest framework following existing patterns

## Coding Standards

### JavaScript/React Conventions
- Use functional components with hooks
- Prefer `const` over `let`, avoid `var`
- Use descriptive variable names
- Add JSDoc comments for complex functions
- Follow existing component structure patterns

### File Organization
- Components in `src/components/` with PascalCase names
- Utilities in `src/utils/` with camelCase names
- Hooks in `src/hooks/` with "use" prefix
- Keep files focused and single-purpose

### State Management
- Use `useState` for local component state
- Use Context API for shared state (auth, projects)
- Keep state as close to usage as possible
- Avoid prop drilling - use context when needed

## Architecture Guidelines

### Adding New Atoms
1. Create atom component in `src/components/atoms/`
2. Add to atom registry/menu system
3. Implement geometry processing in worker
4. Add comprehensive tests
5. Update documentation

### 3D Geometry Guidelines
- Heavy computations must run in worker threads
- Use ReplicaD for CAD operations, Three.js for rendering
- Clean up geometries and materials on unmount
- Test geometry operations thoroughly

### Performance Considerations
- Profile geometry operations during development
- Use React DevTools to identify rendering issues
- Monitor memory usage with complex geometries
- Implement progressive loading for large models

## Pull Request Guidelines

### Before Submitting
- [ ] Tests pass: `npm run unit`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors in development
- [ ] Performance impact considered
- [ ] Documentation updated if needed

### PR Description Should Include
- Clear description of changes
- Screenshots for UI changes
- Test cases covered
- Performance impact (if any)
- Breaking changes (if any)

## Code Review Process

### What We Look For
- Code quality and readability
- Test coverage for new features
- Performance impact
- Security considerations
- Documentation completeness

### Review Criteria
- Does it follow existing patterns?
- Is it well-tested?
- Is it documented appropriately?
- Does it handle edge cases?
- Is it performant?

## Common Issues & Solutions

### Build Problems
- Try `npm install --legacy-peer-deps` for dependency issues
- Clear `node_modules` and reinstall if needed
- Check Node.js version compatibility

### 3D Rendering Issues
- Ensure geometries are properly disposed
- Check for worker thread communication errors
- Verify ReplicaD operations are valid

### Authentication Issues
- Verify GitHub OAuth configuration
- Check local storage for auth tokens
- Ensure proper API permissions

## Documentation Standards

### Code Documentation
- Add JSDoc comments for exported functions
- Document complex algorithms and business logic
- Include usage examples for utility functions
- Keep comments concise and accurate

### API Documentation
- Document component props and their types
- Include example usage
- Document side effects and dependencies
- Update GLOSSARY.md for new domain terms

## Testing Guidelines

### Unit Tests
- Test geometric operations thoroughly
- Mock external dependencies (GitHub API, etc.)
- Use meaningful test descriptions
- Test both success and error cases

### Integration Tests
- Test complete workflows (create → modify → save)
- Verify 3D rendering pipeline
- Test authentication flows
- Use Puppeteer for end-to-end testing

## Release Process

### Version Management
- Follow semantic versioning
- Update package.json version
- Create git tags for releases
- Update CHANGELOG.md

### Deployment
- GitHub Pages deployment is automatic
- AWS Lambda functions deployed separately
- Test in staging before production release

## Getting Help

### Resources
- Check existing issues on GitHub
- Review documentation in `docs/` folder
- Ask questions in GitHub Discussions
- Contact maintainers for architecture questions

### Debugging Tips
- Use React DevTools for component debugging
- Use browser DevTools for 3D performance
- Check worker thread messages for geometry errors
- Enable verbose logging in development

## Security Guidelines

### GitHub Integration
- Never commit OAuth tokens or secrets
- Use environment variables for sensitive data
- Validate all user inputs
- Sanitize data before storage

### 3D Operations
- Validate geometry inputs
- Prevent infinite loops in computations
- Limit computation complexity
- Handle worker thread failures gracefully