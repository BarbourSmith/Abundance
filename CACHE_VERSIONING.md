# Cache Version Management

## Overview

The Abundance project uses IndexedDB to cache serialized geometries and Abundance objects. To prevent issues when the serialization format or geometry computation changes, we've implemented a project-level versioning system that automatically invalidates outdated cache entries.

## How It Works

### Version Storage
- Each project stores a single version number in a special metadata record (key: `__version__`)
- When any geometry is saved for a project, the project's version is set to `CACHE_VERSION`
- The version is stored alongside geometry data in IndexedDB

### Version Validation
- When a project is first accessed (via `updateLRU()` in GeometryProvider), its version is checked
- If the project has no version or an outdated version, **all cache entries for that project are evicted**
- The project version is then updated to the current `CACHE_VERSION`
- Operations proceed as cache misses, rebuilding the cache with the new version

### Why Project-Level Versioning?
Project-level versioning ensures cache consistency:
- A project with mixed versions (some old, some new shapes) would be invalid
- Partial eviction could leave the cache in an inconsistent state
- All-or-nothing eviction ensures geometries are computed with the same version

## Implementation Details

### Key Files
- `src/worker/indexeddbUtils.ts` - Core cache functions with version checking
- `src/worker/geometryProvider.ts` - High-level cache management with auto-eviction

### Key Constants
```typescript
export const CACHE_VERSION = 1; // Current version in indexeddbUtils.ts
const VERSION_KEY = "__version__"; // Special key for project version metadata
```

### Data Structure
```typescript
export type StoredGeometryRecord = {
  projectId: string;
  shapeKey: string;
  type: "ReplicadObject" | "AbundanceObject";
  serialized: string;
  // Note: No version field on individual records
};

// Project version is stored as a special record:
// { projectId: "myProject", shapeKey: "__version__", serialized: "1" }
```

## When to Increment the Version

Increment `CACHE_VERSION` when:
1. Changing the serialization format of geometries
2. Modifying how geometries are computed in a way that changes the output
3. Updating replicad library in a way that affects serialized output
4. Making any change that makes old cached data incompatible

**DO NOT** increment for:
- UI changes
- Bug fixes that don't affect geometry computation
- Performance optimizations that preserve output

## How to Increment the Version

1. Open `src/worker/indexeddbUtils.ts`
2. Increment the `CACHE_VERSION` constant:
   ```typescript
   export const CACHE_VERSION = 2; // Was 1
   ```
3. All projects with version < 2 will have their **entire cache evicted** on first access
4. The cache will be rebuilt with the new version as geometries are computed

## Testing

The versioning system is tested in `tests/cache-version.test.ts`, which verifies:
- Project version is set when geometries are saved
- Projects with current version are not evicted
- Projects without version are evicted entirely
- Projects with old version are evicted entirely
- Version checking happens on project access

Run the tests with:
```bash
npm run unit -- tests/cache-version.test.ts
```

## Benefits

1. **Cache Consistency**: All shapes in a project are always from the same version
2. **No Partial State**: Either all shapes are current or all are evicted
3. **Automatic Cleanup**: No manual intervention needed to clear stale caches
4. **Developer Friendly**: Single constant increment invalidates all outdated project caches
5. **Transparent Operation**: Version checking happens automatically on project access

## Migration Path

The system is designed to handle the initial migration gracefully:
- Existing projects (from before this feature) have no version metadata
- These are treated as `version = undefined` (outdated)
- On first access, all entries for that project are evicted
- New cache entries are created with `version = 1` as geometries are recomputed
- The project version metadata is set to `1`

This ensures a smooth transition without manual cache clearing.
