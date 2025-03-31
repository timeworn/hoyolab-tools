type LogType = "debug" | "info" | "error";

export interface Log {
  type?: LogType;
  string?: string;
}

export const log = (type: LogType, ...data: any[]): Log => {
  console[type](...data);

  if (type !== "debug") return {};

  const string = data
    .map((value) => {
      if (typeof value === "object") {
        return JSON.stringify(value, null, 2).replace(/^"|"$/, "");
      }
      return value;
    })
    .join(" ");

  return { type, string };
};

export const sendDiscordWebhook = async (webhook: string, body: string) => {
  if (!webhook || !webhook.toLowerCase().trim().startsWith("https://discord.com/api/webhooks/")) {
    console.log("DISCORD_WEBHOOK is not a Discord webhook URL");
    return;
  }

  const res = await fetch(webhook, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: body,
  });

  if (res.status === 204) {
    console.log("Successfully sent message to Discord webhook!");
    return;
  }

  console.log("Error sending message to Discord webhook, please check URL and permissions", res);
};
