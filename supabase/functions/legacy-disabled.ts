// Deployed to the unused legacy functions: delivery-admin-create-driver,
// product-content-ai and set-erick-admin. Preserve data; execute no operations.
Deno.serve(() => new Response(JSON.stringify({error:'Endpoint desativado.'}), {
  status:410,
  headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff'}
}));
