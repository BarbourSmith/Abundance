# Deployment Configuration

This document explains how to configure the application for different environments.

## Configuration Management

The application uses different base paths for development and production:

- **Development**: Base path is `/` (serves from root)
- **Production**: Base path is `/Abundance/` (for GitHub Pages deployment)

## Quick Configuration

Use these npm scripts to quickly switch configurations:

```bash
# Set for local development
npm run config:dev

# Set for production deployment  
npm run config:prod
```

## Manual Configuration

If you need to manually configure:

### For Development (`npm run config:dev`)

1. In `vite.config.js`:
   ```js
   base: "/"
   ```

2. In `.env` - uncomment dev section, comment prod section

### For Production (`npm run config:prod`)

1. In `vite.config.js`:
   ```js
   base: "/Abundance/"
   ```

2. In `.env` - use prod section (already configured)

## Deployment

The production configuration is designed for GitHub Pages deployment to:
`https://barboursmith.github.io/Abundance/`

## Troubleshooting

If you see errors like "can't access lexical declaration before initialization" in the deployed version:

1. Verify the base path is correctly set to "/Abundance/" in production
2. Check that VITE_BROWSER_ROUTER matches the deployment path
3. Ensure all dynamic imports can resolve correctly with the base path

## Building

After setting the correct configuration:

```bash
# For development
npm run config:dev
npm start

# For production
npm run config:prod  
npm run build
```