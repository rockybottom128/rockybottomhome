// Keep static asset rules in public/_headers aligned with these values.
export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  // Observe script/style compatibility before enforcing a full resource policy.
  // No collector is configured: violations are visible in browser developer tools.
  'Content-Security-Policy-Report-Only': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-src 'none'; form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
};
export const hsts = 'max-age=31536000';
export function secureResponse(response:Response,url:URL):Response {
  // Fetch/redirect responses can have immutable headers. Preserve body, status,
  // and all Set-Cookie headers while applying the same policy to every outcome.
  const secured=new Response(response.body,response);
  for(const [key,value] of Object.entries(securityHeaders))secured.headers.set(key,value);
  if(url.protocol==='https:')secured.headers.set('Strict-Transport-Security',hsts);
  return secured;
}
