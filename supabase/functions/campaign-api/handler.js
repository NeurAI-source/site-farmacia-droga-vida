import { allowedOrigin } from "../cors.js";
import { validateCampaign, inspectImage, UUID, MAX_IMAGE_BYTES } from "../_shared/campaign-utils.js";
function createCampaignHandler({ db, origins }) {
  const bucket = db.storage.from("campaign-images");
  function check(result) {
    if (result.error) throw Error(result.error.message);
    return result.data;
  }
  async function sign(paths, ttl = 3600) {
    const unique = [...new Set(paths)];
    if (!unique.length) return /* @__PURE__ */ new Map();
    const rows = check(await bucket.createSignedUrls(unique, ttl));
    return new Map(rows.map((r) => {
      if (r.error || !r.signedUrl) throw Error("Não foi possível carregar as imagens.");
      return [r.path, r.signedUrl];
    }));
  }
  async function limitedBody(req, limit) {
    const reader = req.body?.getReader();
    if (!reader) throw Error("Corpo ausente.");
    let size = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw Error("Arquivo ou solicitação muito grande.");
      }
      chunks.push(value);
    }
    const out = new Uint8Array(size);
    let p = 0;
    for (const chunk of chunks) {
      out.set(chunk, p);
      p += chunk.length;
    }
    return out;
  }
  return async (req) => {
    const origin = allowedOrigin(origins, req.headers.get("origin"));
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "no-store", "Surrogate-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff" };
    if (origin) Object.assign(headers, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" });
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (!origin) return reply({ error: "Origem não autorizada." }, 403);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      const url = new URL(req.url);
      if (req.method === "GET" && url.searchParams.get("action") === "public") {
        const snapshot = check(await db.rpc("campaign_public_snapshot"));
        const paths = snapshot.campaigns.flatMap((c) => [c.cover_path, ...c.page_paths]);
        const urls = await sign(paths, 90);
        return reply({ ...snapshot, lease_ms: 6e4, campaigns: snapshot.campaigns.map(({ cover_path, page_paths, ...c }) => ({ ...c, cover_url: urls.get(cover_path), pages: page_paths.map((path) => urls.get(path)) })) });
      }
      if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);
      const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      if (!token) return reply({ error: "Entre no painel para continuar." }, 401);
      const { data: { user }, error } = await db.auth.getUser(token);
      if (error || !user) return reply({ error: "Sessão inválida. Entre novamente." }, 401);
      const member = check(await db.from("team_members").select("role,active").eq("user_id", user.id).maybeSingle());
      if (!member?.active) return reply({ error: "Acesso não autorizado." }, 403);
      if (url.searchParams.get("action") === "upload") {
        const bytes = await limitedBody(req, MAX_IMAGE_BYTES);
        const metadata = inspectImage(bytes, req.headers.get("content-type")?.split(";")[0]);
        const id2 = crypto.randomUUID(), path = `${id2}.${metadata.extension}`;
        check(await bucket.upload(path, bytes, { contentType: metadata.mime, cacheControl: "0", upsert: false }));
        const { extension, ...record } = metadata;
        const inserted = await db.from("campaign_assets").insert({ id: id2, path, ...record, uploaded_by: user.id });
        if (inserted.error) {
          await bucket.remove([path]);
          throw Error("Não foi possível registrar a imagem.");
        }
        return reply({ id: id2, url: (await sign([path])).get(path) });
      }
      const body = JSON.parse(new TextDecoder().decode(await limitedBody(req, 2e4)));
      if (body.action === "list") {
        const page = Number(body.page || 0);
        if (!Number.isInteger(page) || page < 0 || page > 1e4) throw Error("Página inválida.");
        const rows = check(await db.from("campaigns").select("*,cover:campaign_assets!cover_id(path)").order("created_at", { ascending: false }).order("id").range(page * 100, page * 100 + 99));
        const urls = await sign(rows.map((c) => c.cover.path));
        return reply({ server_now: (/* @__PURE__ */ new Date()).toISOString(), campaigns: rows.map(({ cover, ...c }) => ({ ...c, cover_url: urls.get(cover.path) })), has_more: rows.length === 100 });
      }
      if (body.action === "get") {
        if (!UUID.test(body.id)) throw Error("Campanha inválida.");
        const c = check(await db.from("campaigns").select("*,cover:campaign_assets!cover_id(path),campaign_pages(asset_id,position,asset:campaign_assets(path))").eq("id", body.id).single());
        const ordered = c.campaign_pages.sort((a, b) => a.position - b.position);
        const urls = await sign([c.cover.path, ...ordered.map((p) => p.asset.path)]);
        const { cover, campaign_pages, ...campaign } = c;
        return reply({ campaign: { ...campaign, cover_url: urls.get(cover.path), pages: ordered.map((p) => ({ id: p.asset_id, url: urls.get(p.asset.path) })) } });
      }
      let payload = body.campaign;
      if (body.action === "save") payload = validateCampaign(payload);
      else if (!payload || !UUID.test(payload.id) || !Number.isInteger(payload.version) || payload.version < 1) throw Error("Campanha ou versão inválida.");
      if (body.action === "save" && payload.publication_state === "published" && member.role !== "admin") return reply({ error: "Somente administradores podem publicar." }, 403);
      const id = check(await db.rpc("campaign_write", { action: body.action, actor: user.id, payload }));
      return reply({ id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
      return reply({ error: req.method === "GET" ? "Ofertas temporariamente indisponíveis." : message }, 400);
    }
  };
}
export {
  createCampaignHandler
};
