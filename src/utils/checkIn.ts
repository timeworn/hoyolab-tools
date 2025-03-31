import { endpoints } from "../config.js";
import { updateGitHubSecret } from "../secrets.js";
import { sendDiscordWebhook } from "./utils.js";

export interface CheckInLog {
  game: string;
  message: string;
  retcode: number;
}

export interface CheckInAccountLog {
  index: number;
  cookieUpdated: boolean;
  cookie: string;
  logs: CheckInLog[];
}

interface CheckInResponse {
  message?: string;
  retcode?: number;
}

const CODES = {
  "0": true,
  "-5003": true,
};

const createHeaders = (cookie: string, game: string) => {
  return new Headers({
    "accept": "application/json, text/plain, */*",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-US,en;q=0.6",
    "connection": "keep-alive",
    "origin": "https://act.hoyolab.com",
    "referrer": "https://act.hoyolab.com",
    "content-type": "application.json;charset=UTF-8",
    "cookie": cookie,
    "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Brave";v="126"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Linux"',
    "sec-fetch-dest": "empty",
    "sec-fech-mode": "cors",
    "sec-fetch-site": "same-site",
    "sec-gpc": "1",
    "x-rpc-signgame": game,
    "user-agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  });
};

const createBody = (actId: string) => {
  return JSON.stringify({
    lang: "en-us",
    act_id: actId,
  });
};

const createEmbed = (accountLogs: CheckInAccountLog[]) => {
  const prefix = "Hi, today's check in has been completed\n\n";
  let descriptions: string[] = [];

  accountLogs.forEach((log) => {
    descriptions.push(`**[Account ${log.index}]**\n${log.logs.map((l) => `**[${l.game}]** ${l.message}`).join("\n")}`);
  });

  return {
    embeds: [
      {
        title: "Hoyolab Check In",
        description: `${prefix}${descriptions.join("\n\n")}`,
        color: 6651892,
      },
    ],
    content: null,
    attachments: [],
  };
};

const createLog = (game: string, message: string, retcode: number): CheckInLog => {
  console.log(`[${game}] ${message}`);
  return {
    retcode: retcode,
    game: game,
    message: message,
  };
};

const getCookie = (cookie: string) => {
  const ltokenMatch = cookie.match(/ltoken_v2=([^;]+);/);
  const ltuidMatch = cookie.match(/ltuid_v2=([^;]+);/);

  if (ltokenMatch && ltuidMatch) {
    return `${ltuidMatch[0]}${ltokenMatch[0]}`;
  }
};

const checkInGame = async (
  game: string,
  endpoint: string,
  cookie: string
): Promise<{ cookie: string; log: CheckInLog }> => {
  const url = new URL(endpoint);
  const actId = url.searchParams.get("act_id");

  let result: CheckInLog;

  if (!actId) {
    result = createLog(game, `Invalid endpoint: ${endpoint}`, -1);
    return { cookie: cookie, log: result };
  }

  url.searchParams.set("lang", "en-us");

  const body = createBody(actId ?? "");

  const headers = createHeaders(cookie, game.toLowerCase());
  const res = await fetch(url, { method: "POST", headers, body });
  const json = (await res.json()) as CheckInResponse;
  const code = String(json.retcode);

  if (code in CODES) {
    result = createLog(game, json.message as string, json.retcode as number);
  } else {
    result = createLog(game, json.message ?? "Error undocumented", json.retcode ?? -1);
  }

  const cookieHeaders = res.headers.get("set-cookie");
  const newCookie = cookieHeaders ? getCookie(cookieHeaders) ?? cookie : cookie;

  return { cookie: newCookie, log: result };
};

const checkInAccount = async (accountIndex: number, cookie: string, gameList?: string): Promise<CheckInAccountLog> => {
  let results: CheckInAccountLog = {
    index: accountIndex,
    cookieUpdated: false,
    cookie: cookie,
    logs: [],
  };

  if (!gameList) return results;

  const gameArray = gameList.split(" ");

  for (const game of gameArray) {
    const lowerCaseGame = game.toLowerCase();

    if (!(lowerCaseGame in endpoints)) {
      const log = createLog(game, "Invalid game", -1);
      results.logs.push(log);
      continue;
    }

    const result = await checkInGame(game, endpoints[lowerCaseGame], cookie);

    if (result.cookie !== results.cookie) {
      const log = createLog(game, `New cookie found`, -1);
      results.logs.push(log);
      results.cookieUpdated = true;
      results.cookie = result.cookie;
    }

    results.logs.push(result.log);
  }

  return results;
};

export const checkIn = async () => {
  const cookies = process.env.COOKIE?.split("\n").map((s) => s.trim()) || [];
  const games = process.env.GAMES?.split("\n").map((s) => s.trim()) || [];
  const discordWebhook = process.env.DISCORD_WEBHOOK;

  const updatedCookies: Map<number, string> = new Map();
  let accountLogs: CheckInAccountLog[] = [];

  if (!cookies || !cookies.length) {
    throw new Error("COOKIE environment variable not set!");
  }

  if (!games || !games.length) {
    throw new Error("GAMES environment variable not set!");
  }

  for (const index in cookies) {
    const log = await checkInAccount(Number(index), cookies[index], games[index]);
    accountLogs.push(log);
  }

  accountLogs.forEach((log) => {
    if (log.cookieUpdated) {
      updatedCookies.set(log.index, log.cookie);
    }
  });

  if (updatedCookies.size > 0) {
    const githubToken = process.env.GH_TOKEN;
    if (githubToken) {
      const updatedCookiesList = [...cookies];
      updatedCookies.forEach((cookie, index) => {
        updatedCookiesList[index] = cookie;
      });

      const newCombinedCookie = updatedCookiesList.join("\n");
      await updateGitHubSecret("COOKIE", newCombinedCookie, githubToken);
    }
  }

  if (discordWebhook && URL.canParse(discordWebhook)) {
    const embed = createEmbed(accountLogs);
    await sendDiscordWebhook(discordWebhook, JSON.stringify(embed));
  }
};
