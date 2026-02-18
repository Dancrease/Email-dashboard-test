interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  body: string;
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get("GMAIL_CLIENT_ID")\!;
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET")\!;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" })
  });
  const data = await response.json();
  if (\!data.access_token) throw new Error(\);
  return data.access_token;
}

export async function fetchNewEmails(accessToken: string, lastCheckTime?: string): Promise<GmailMessage[]> {
  let query = "is:unread";
  if (lastCheckTime) {
    const timestamp = Math.floor(new Date(lastCheckTime).getTime() / 1000);
    query += \;
  }
  const listUrl = \;
  const listResponse = await fetch(listUrl, { headers: { Authorization: \ } });
  const listData = await listResponse.json();
  if (\!listData.messages || listData.messages.length === 0) return [];
  const messages: GmailMessage[] = [];
  for (const msg of listData.messages) {
    const msgUrl = \;
    const msgResponse = await fetch(msgUrl, { headers: { Authorization: \ } });
    const msgData = await msgResponse.json();
    const headers = msgData.payload.headers;
    const from = headers.find((h: any) => h.name === "From")?.value || "";
    const subject = headers.find((h: any) => h.name === "Subject")?.value || "Thanks for getting in touch";
    let body = "";
    if (msgData.payload.body.data) {
      body = atob(msgData.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
    } else if (msgData.payload.parts) {
      const textPart = msgData.payload.parts.find((p: any) => p.mimeType === "text/plain");
      if (textPart?.body?.data) body = atob(textPart.body.data.replace(/-/g, "+").replace(/_/g, "/"));
    }
    messages.push({ id: msgData.id, threadId: msgData.threadId, from, subject, body });
  }
  return messages;
}

export async function sendGmailReply(accessToken: string, to: string, subject: string, body: string, threadId?: string): Promise<void> {
  const email = [\, \, threadId ? \ : "", threadId ? \ : "", "Content-Type: text/plain; charset=utf-8", "", body].filter(line => line \!== "").join("\r\n");
  const encodedEmail = btoa(email).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: \, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encodedEmail, threadId })
  });
}

export async function labelEmail(accessToken: string, messageId: string, labelName: string = "AI-Handled"): Promise<void> {
  const labelsUrl = "https://gmail.googleapis.com/gmail/v1/users/me/labels";
  const labelsResponse = await fetch(labelsUrl, { headers: { Authorization: \ } });
  const labelsData = await labelsResponse.json();
  let labelId = labelsData.labels.find((l: any) => l.name === labelName)?.id;
  if (\!labelId) {
    const createResponse = await fetch(labelsUrl, {
      method: "POST",
      headers: { Authorization: \, "Content-Type": "application/json" },
      body: JSON.stringify({ name: labelName, labelListVisibility: "labelShow", messageListVisibility: "show" })
    });
    const createData = await createResponse.json();
    labelId = createData.id;
  }
  await fetch(\, {
    method: "POST",
    headers: { Authorization: \, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: [labelId], removeLabelIds: ["UNREAD"] })
  });
}
