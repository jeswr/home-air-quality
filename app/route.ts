import html from '../ui/index.html?raw';
export const GET = () => new Response(html,{headers:{
  'Content-Type':'text/html; charset=utf-8',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
  'Cache-Control':'no-store',
}});
