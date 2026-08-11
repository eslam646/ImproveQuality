// Supabase Storage adapter — يضمن وجود bucket ثم يرفع الملف (Staging/Production)
const BUCKET = "attachments";

async function ensureBucket(url: string, key: string): Promise<void> {
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 50 * 1024 * 1024 }),
  });
  if (res.ok) return;
  const text = await res.text();
  if (res.status === 409 || /already exists|duplicate/i.test(text)) return;
  throw new Error(`تعذر إنشاء مساحة المرفقات: ${text.slice(0, 180)}`);
}

async function uploadOnce(url: string, key: string, relPath: string, data: ArrayBuffer, contentType: string) {
  const safePath = relPath.split("/").map(encodeURIComponent).join("/");
  return fetch(`${url}/storage/v1/object/${BUCKET}/${safePath}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`, apikey: key,
      "x-upsert": "true", "content-type": contentType || "application/octet-stream",
    },
    body: data,
  });
}

export async function uploadSupabaseAttachment(input: {
  url: string; key: string; relPath: string; data: ArrayBuffer; contentType: string;
}): Promise<{ publicUrl: string }> {
  const url = input.url.replace(/\/$/, "");
  let res = await uploadOnce(url, input.key, input.relPath, input.data, input.contentType);
  if (!res.ok) {
    const firstError = await res.text();
    if (res.status === 404 || /bucket not found|nosuchbucket/i.test(firstError)) {
      await ensureBucket(url, input.key);
      res = await uploadOnce(url, input.key, input.relPath, input.data, input.contentType);
    } else {
      throw new Error(firstError.slice(0, 220));
    }
  }
  if (!res.ok) throw new Error((await res.text()).slice(0, 220));
  const safePath = input.relPath.split("/").map(encodeURIComponent).join("/");
  return { publicUrl: `${url}/storage/v1/object/public/${BUCKET}/${safePath}` };
}
