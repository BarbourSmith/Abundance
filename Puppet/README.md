# Puppeteer Tests

This directory contains Puppeteer-based tests for the Abundance application.

## Test Files

### index.js
The main Puppeteer test that:
- Tests project rendering for projects in `projects_to_test.js`
- Takes screenshots of rendered projects
- Tests both local and deployed versions
- Runs on every pull request

**Usage:**
```bash
npm test
```

### metrics.js
Performance metrics test that measures, for each project:
- **Cold Load Time**: navigation until the project finishes computing, in a fresh browser profile (empty geometry cache)
- **Warm Load Time**: the same after a reload, with the geometry cache filled
- **Cache Size** and **Cache Entry Count**: the IndexedDB geometry cache once the project has finished computing
- **Project File Size**: size of the serialized project file
- **GCode generation and visualization time**, for projects with GCode atoms

How it keeps the numbers stable:
1. A load ends when nothing has been loading or computing for 1.5 s (the same test as the agent bridge's `wait_for_settle`). The time recorded is when the last computation finished.
2. GitHub and other remote responses are fetched once and replayed from memory, so network speed doesn't count.
3. Each project is loaded several times (`--runs`, default 5) after a warm-up round that isn't recorded.
4. Given several targets (builds on different ports), rounds alternate between them so a slow moment on the machine affects each equally.

**Usage:**
```bash
# Measure the dev server on port 4444
npm run test:metrics

# Compare two builds, then write the report CI posts on PRs
node Puppet/metrics.js --target base=http://localhost:4445 --target pr=http://localhost:4446 --runs 7 --out metrics.json
node Puppet/compareMetrics.js metrics.json
```

`compareMetrics.js` reports each timing's median, the estimated change with its 95% confidence range, and marks it slower or faster only when the range excludes zero and the change is at least 5% (statistics in `perfStats.js`).

**GitHub Actions Integration:**
- The `metrics` job builds the PR and the commit it branched from on one runner, serves both with `vite preview`, and measures them 7 times each
- Posts the report as a PR comment and in the job summary; raw samples are in the `performance-metrics` artifact

### projects_to_test.js
Configuration file listing which projects to test. Currently includes:
- Wall-Anchor
- Test-Everything-Fully

## CI/CD Integration

Both tests run automatically in GitHub Actions on pull requests:

1. **Screenshot Tests** (from `index.js`):
   - Takes screenshots of each project
   - Posts screenshots as PR comment
   - Uploads to S3 (if configured)

2. **Metrics Tests** (from `metrics.js` and `compareMetrics.js`):
   - Measures the PR build against its base build on the same runner
   - Posts a PR comment flagging only statistically significant changes

## Local Development

To run tests locally:

1. Start the development server:
   ```bash
   npm start
   ```

2. In a separate terminal, run tests:
   ```bash
   # Run screenshot tests
   npm test
   
   # Run metrics tests
   npm run test:metrics
   ```

## Future Enhancements

Completed improvements:
1. ✅ Cold load time measurement
2. ✅ Cache size measurement
3. ✅ Warm-load time measurement (reload after cache populated)
4. ✅ GCode generation performance tracking
5. ✅ GCode visualization metrics
6. ✅ Repeated, interleaved runs with significance testing

Potential future improvements:
1. ⏳ Test multiple projects with different cache profiles
2. ⏳ Memory usage tracking
3. ⏳ 3D rendering performance metrics

