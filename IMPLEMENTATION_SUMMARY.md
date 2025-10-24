# Cache Versioning Implementation Summary

## Overview
Implemented project-level cache versioning system for the Abundance CAD application to automatically invalidate outdated cached geometries when the serialization format or computation logic changes.

## Architecture Decision: Project-Level vs Per-Shape Versioning

### Initial Implementation (Incorrect)
- Each individual geometry record had a `version` field
- Version checking happened at retrieval time (getShape, shapeExists)
- Individual shapes could be evicted while others remained

### Problem with Per-Shape Approach
- A project with mixed versions (some old, some new) would be invalid
- Partial eviction could leave cache in inconsistent state
- Geometries computed with different versions might produce incorrect results when combined

### Final Implementation (Correct)
- Single version stored per project as metadata record
- Version checking happens at project access time (updateLRU)
- **All shapes in a project are evicted atomically** if version is outdated
- Ensures cache consistency - all geometries are from the same version

## Implementation Details

### Version Storage
```typescript
// Project version stored as special metadata record
{ 
  projectId: "myProject", 
  shapeKey: "__version__",  // Special constant key
  type: "ReplicadObject",
  serialized: "1"           // Version as string
}
```

### Version Checking Flow
1. Operation requests geometry from project "X"
2. `updateLRU("X")` is called, marking project as recently used
3. If first time accessing project in session, `ensureProjectVersionCurrent("X")` is called
4. Function checks if project version == CACHE_VERSION
5. If not current or missing:
   - **All cache entries for project X are deleted**
   - Project version is set to current CACHE_VERSION
   - Returns true (was evicted)
6. If already current:
   - No action taken
   - Returns false (was not evicted)
7. Operation proceeds (as cache hit or miss depending on eviction)

### Key Functions

**indexeddbUtils.ts:**
- `getProjectVersion(projectId)` - Retrieves project version or undefined
- `setProjectVersion(projectId, version)` - Sets project version metadata
- `isProjectVersionCurrent(projectId)` - Checks if version matches CACHE_VERSION
- `ensureProjectVersionCurrent(projectId)` - Validates and evicts if needed

**geometryProvider.ts:**
- `updateLRU(projectId)` - Calls `ensureProjectVersionCurrent()` on first access

### Version Increment Process
To invalidate all caches after a breaking change:

1. Increment `CACHE_VERSION` in `src/worker/indexeddbUtils.ts`:
   ```typescript
   export const CACHE_VERSION = 2; // Was 1
   ```

2. On next deployment:
   - All projects with version < 2 are considered outdated
   - First access to each project triggers complete cache eviction
   - Cache rebuilds with geometries computed using new version

## Testing
Created comprehensive test suite (`tests/cache-version.test.ts`) with 9 tests:
- Version metadata get/set operations
- Current version detection
- Outdated version eviction
- Missing version eviction (legacy data)
- No eviction for current version
- Multi-project independence

All tests pass, confirming correct behavior.

## Benefits
1. **Cache Consistency** - All shapes in project always from same version
2. **No Partial State** - Either all current or all evicted, never mixed
3. **Automatic** - Version check happens transparently on project access
4. **Safe** - Invalid cache is evicted before any operations proceed
5. **Developer Friendly** - Single constant increment to invalidate all outdated caches

## Migration
Existing projects (pre-versioning) have no version metadata:
- Treated as outdated (version = undefined)
- Entire cache evicted on first access
- New version metadata set to CACHE_VERSION
- Cache rebuilds as geometries are computed

No manual cache clearing required.
