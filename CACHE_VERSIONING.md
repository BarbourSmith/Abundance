# Cache Version Management

## Overview

The Abundance project uses IndexedDB to cache serialized geometries and Abundance objects. To prevent issues when the serialization format or geometry computation changes, we've implemented a versioning system that automatically invalidates outdated cache entries.

## How It Works

### Version Storage
- Each cached geometry record includes a `version` field containing `CACHE_VERSION`
- When saving via `putShape()`, the current version is automatically added to the record
- The version is stored alongside the geometry data in IndexedDB

### Version Validation
- When reading via `getShape()` or checking via `shapeExists()`, the version is validated
- Records with missing or outdated versions are treated as cache misses
- These functions return `undefined` or `false` respectively for outdated entries

### Automatic Cleanup
- When a project is loaded (via `updateLRU()` in GeometryProvider), outdated cache entries are automatically deleted
- The `deleteOutdatedProjectCache()` function scans and removes all entries with old versions
- This keeps the cache size manageable and prevents stale data accumulation

## Implementation Details

### Key Files
- `src/worker/indexeddbUtils.ts` - Core cache functions with version checking
- `src/worker/geometryProvider.ts` - High-level cache management with auto-cleanup

### Key Constants
```typescript
export const CACHE_VERSION = 1; // Current version in indexeddbUtils.ts
```

### Data Structure
```typescript
export type StoredGeometryRecord = {
  projectId: string;
  shapeKey: string;
  type: "ReplicadObject" | "AbundanceObject";
  serialized: string;
  version?: number; // Cache format version
};
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
3. All existing cache entries will be treated as outdated
4. They will be automatically cleaned up when projects are loaded

## Testing

The versioning system is tested in `tests/cache-version.test.ts`, which verifies:
- Shapes are saved with the current version
- Shapes with current version can be retrieved
- Shapes without version are treated as outdated
- Shapes with old version are treated as outdated
- Outdated entries can be deleted selectively
- Both ReplicadObject and AbundanceObject types work with versioning

Run the tests with:
```bash
npm run unit -- tests/cache-version.test.ts
```

## Benefits

1. **No Breaking Changes for Users**: Old cache is automatically invalidated, preventing deserialization errors
2. **Automatic Cleanup**: No manual intervention needed to clear stale caches
3. **Per-Project Granularity**: Each project's cache is managed independently
4. **Backward Compatible**: Old code without versioning treats unversioned entries as outdated
5. **Developer Friendly**: Simple constant increment invalidates all caches

## Migration Path

The system is designed to handle the initial migration gracefully:
- Existing cache entries (from before this feature) have no `version` field
- These are treated as `version = undefined`
- They're automatically invalidated (treated as outdated)
- New cache entries are created with `version = 1` as geometries are recomputed

This ensures a smooth transition without manual cache clearing.
