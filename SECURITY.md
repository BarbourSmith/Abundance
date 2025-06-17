# Security Improvements

This document tracks security improvements made to the Abundance application.

## Fixed Security Issues

### 1. Replaced eval() with Function Constructor (CRITICAL)
- **Issue**: Worker.js used `eval()` for executing user-provided code, which is extremely dangerous
- **Fix**: Replaced with Function constructor and added comprehensive input validation
- **Protection Added**:
  - Input validation for dangerous patterns
  - Parameter name sanitization
  - Code length limits (50,000 characters)
  - Execution timeout (30 seconds)
  - Proper error handling

### 2. Updated Vulnerable Dependencies (HIGH/MEDIUM)
- **Issue**: 12 npm package vulnerabilities (1 critical, 1 high, 9 moderate, 1 low)
- **Fix**: Updated packages using `npm audit fix` and `npm audit fix --force`
- **Results**: Reduced from 12 to 2 vulnerabilities (1 critical xmldom issue remains - see below)

### 3. Removed Hardcoded Secrets (MEDIUM)
- **Issue**: Client IDs hardcoded in Lambda functions
- **Fix**: Moved to environment variables with fallbacks
- **Files Updated**: `Lambda AWS Functions/proxyApi/index.js`
- **Environment Variables Added**:
  - `CLIENT_ID_GIT_DEV`
  - `CLIENT_ID_GIT_DEPLOY` 
  - `AUTH0_CLIENT_ID`

### 4. Improved CORS Configuration (MEDIUM)
- **Issue**: Wildcard `*` origins allowed from any domain
- **Fix**: Implemented origin-based CORS with allowlist
- **Protection Added**:
  - Environment-configurable allowed origins
  - Default to localhost and production domain only
  - Removed wildcard headers (`*` to specific headers)
  - Added credential support for legitimate origins

### 5. Added Security Headers (LOW-MEDIUM)
- **Added Headers**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy` with restricted sources

## Remaining Security Issues

### 1. xmldom Dependency (CRITICAL)
- **Issue**: `replicad-decorate` dependency uses vulnerable `xmldom` package
- **Impact**: Allows multiple root nodes in DOM, misinterpretation of malicious XML
- **Status**: No fix available - upstream dependency issue
- **Mitigation**: Limited impact as xmldom is used only for SVG import functionality
- **Recommendation**: Monitor for updates to `replicad-decorate` or consider alternative SVG handling

### 2. Code Execution Feature (MEDIUM)
- **Issue**: Application allows user code execution by design (CAD/3D modeling requirement)
- **Current Protection**: Function constructor with validation (safer than eval)
- **Recommendation**: Consider implementing a proper JavaScript sandbox in future versions

## Security Best Practices Implemented

1. **Input Validation**: All user inputs are validated before processing
2. **Environment Configuration**: Secrets moved to environment variables
3. **Origin Validation**: CORS restricted to known domains
4. **Security Headers**: Standard security headers implemented
5. **Error Handling**: Proper error handling to prevent information disclosure

## Environment Variables Required

Add these to your environment for secure configuration:

```bash
# Optional - defaults provided for backward compatibility
CLIENT_ID_GIT_DEV=your_dev_client_id
CLIENT_ID_GIT_DEPLOY=your_deploy_client_id
AUTH0_CLIENT_ID=your_auth0_client_id

# CORS configuration
ALLOWED_ORIGINS=http://localhost:4444,https://abundance.maslowcnc.com

# Existing secrets (ensure these are set)
CLIENT_SECRET_GIT=your_secret
CLIENT_SECRET_GIT_DEPLOY=your_secret
CLIENT_SECRET=your_auth0_secret
```

## Future Security Recommendations

1. **Implement Rate Limiting**: Add rate limiting to API endpoints
2. **Add Request Logging**: Implement comprehensive request/response logging
3. **Code Execution Sandbox**: Consider implementing a proper JavaScript sandbox
4. **Dependency Monitoring**: Set up automated dependency vulnerability scanning
5. **Regular Security Audits**: Schedule periodic security reviews
6. **Update xmldom**: Monitor and update when `replicad-decorate` addresses the xmldom vulnerability