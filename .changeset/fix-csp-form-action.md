---
"@getcirrus/oauth-provider": patch
---

Fix CSP blocking OAuth authorization flow in Chrome

Remove `form-action` from CSP due to inconsistent browser behavior with redirects. Chrome blocks redirects after form submission if the redirect URL isn't in `form-action`, while Firefox does not. Since OAuth requires redirecting to the client's callback URL after consent, `form-action` cannot be used without breaking the flow in Chrome.
