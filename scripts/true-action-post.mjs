// محاكي دقيق لطلب Server Action الحقيقي الذي يرسله المتصفح (React JS)
// الاستخدام: node scripts/true-action-post.mjs <baseUrl> <pageUrl> <actionId> <cookieHeader> <field=k>...
import { encodeReply } from "next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.production.js";

const [base, page, actionId, cookieRaw, ...fields] = process.argv.slice(2);
const cookie = cookieRaw.replace(/^Cookie:\s*/i, "").trim();
const fd = new FormData();
for (const f of fields) {
  const i = f.indexOf("=");
  fd.set(f.slice(0, i), f.slice(i + 1));
}
const body = await encodeReply([fd], null);
if (body instanceof FormData) {
  console.log("[encode] multipart fields:", [...body.keys()].join(", "));
} else {
  console.log("[encode] text body:", String(body).slice(0, 200));
}
const res = await fetch(base + page, {
  method: "POST",
  headers: { "Next-Action": actionId, Origin: base, cookie },
  body,
  redirect: "manual",
});
console.log("HTTP", res.status, "| set-cookie:", (res.headers.get("set-cookie") || "").slice(0, 120));
const text = await res.text();
const err = text.match(/1:E\{[^}]*\}/);
if (err) console.log("ERR CHUNK:", err[0]);
const ok = text.match(/"\$","\$L1",null,\{"default":"([^"]+)"/) || text.match(/redirect\\?":\\?"([^"\\]+)/);
if (ok) console.log("REDIRECT->", decodeURIComponent(ok[1]));
console.log(text.slice(0, 220));
