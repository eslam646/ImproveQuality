type TeamsConfig = { tenantId: string; clientId: string; clientSecret: string; organizer: string };

export function teamsConfigStatus() {
  return {
    tenantId: !!process.env.MS_TENANT_ID,
    clientId: !!process.env.MS_CLIENT_ID,
    clientSecret: !!process.env.MS_CLIENT_SECRET,
    organizer: !!process.env.MS_ORGANIZER_USER_ID,
    ready: !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_ORGANIZER_USER_ID),
  };
}

function config(): TeamsConfig {
  if (!teamsConfigStatus().ready) throw new Error("تكامل Teams غير مضبوط: أضف MS_TENANT_ID وMS_CLIENT_ID وMS_CLIENT_SECRET وMS_ORGANIZER_USER_ID إلى Secrets");
  return { tenantId: process.env.MS_TENANT_ID!, clientId: process.env.MS_CLIENT_ID!, clientSecret: process.env.MS_CLIENT_SECRET!, organizer: process.env.MS_ORGANIZER_USER_ID! };
}

async function accessToken(c: TeamsConfig): Promise<string> {
  const body = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(c.tenantId)}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json() as { access_token?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`Microsoft Login: ${j.error_description ?? r.status}`);
  return j.access_token;
}

export async function createTeamsCalendarMeeting(input: { subject: string; startIso: string; endIso: string; attendeeEmails: string[]; bodyHtml: string }) {
  const c = config(); const token = await accessToken(c);
  const event = {
    subject: input.subject,
    body: { contentType: "HTML", content: input.bodyHtml },
    start: { dateTime: input.startIso, timeZone: "UTC" },
    end: { dateTime: input.endIso, timeZone: "UTC" },
    attendees: [...new Set(input.attendeeEmails)].map((address) => ({ emailAddress: { address }, type: "required" })),
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
    allowNewTimeProposals: false,
  };
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.organizer)}/events`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(event),
  });
  const j = await r.json() as { id?: string; webLink?: string; onlineMeeting?: { joinUrl?: string }; error?: { message?: string } };
  if (!r.ok || !j.id) throw new Error(`Microsoft Graph: ${j.error?.message ?? r.status}`);
  return { providerMeetingId: j.id, joinUrl: j.onlineMeeting?.joinUrl ?? j.webLink ?? null };
}

export async function cancelTeamsCalendarMeeting(providerMeetingId: string) {
  const c = config(); const token = await accessToken(c);
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.organizer)}/events/${encodeURIComponent(providerMeetingId)}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
  if (!r.ok && r.status !== 404) throw new Error(`Microsoft Graph cancel: ${r.status} ${(await r.text()).slice(0, 160)}`);
}
