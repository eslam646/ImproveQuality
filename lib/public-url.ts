// حساب الرابط العام الصحيح خلف البروكسي (المعاينة/Cloudflare/أي Reverse Proxy)
// بدون هذا تتحول إعادة التوجيه إلى http://0.0.0.0:3000 التي لا تفتح من متصفح المستخدم
export function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    url.host;
  return `${proto}://${host}`;
}
