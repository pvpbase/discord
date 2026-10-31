const DISCORD_API = "https://discord.com/api/v10";

const ALLOWED_ORIGINS = [
  "https://intensed-dev.github.io",
  "https://pvpbase.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/" && request.method === "GET") {
      return json(
        {
          name: "PvPBase Discord API",
          status: "online",
        },
        200,
        origin,
      );
    }

    // Create one-time Discord invite
    if (url.pathname === "/create-invite" && request.method === "POST") {
      if (!isAllowedOrigin(origin)) {
        return json(
          {
            error: "Origin not allowed.",
          },
          403,
          origin,
        );
      }

      return createInvite(request, env, origin);
    }

    return json(
      {
        error: "Not found.",
      },
      404,
      origin,
    );
  },
};

async function createInvite(request, env, origin) {
  try {
    const body = await request.json();

    // Require all agreements
    if (
      body.tos !== true ||
      body.minecraftEula !== true ||
      body.rules !== true
    ) {
      return json(
        {
          error: "All required agreements must be accepted.",
        },
        400,
        origin,
      );
    }

    // Check required environment variables
    if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CHANNEL_ID) {
      console.error("Missing Discord environment variables.");

      return json(
        {
          error: "Discord API is not configured.",
        },
        500,
        origin,
      );
    }

    // Create Discord invite
    const discordResponse = await fetch(
      `${DISCORD_API}/channels/${env.DISCORD_CHANNEL_ID}/invites`,
      {
        method: "POST",

        headers: {
          Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          max_age: 300,
          max_uses: 1,
          unique: true,
          temporary: false,
        }),
      },
    );

    const discordData = await discordResponse.json();

    if (!discordResponse.ok) {
      console.error("Discord API error:", discordData);

      return json(
        {
          error: "Discord could not create an invite.",
        },
        502,
        origin,
      );
    }

    if (!discordData.code) {
      console.error("Discord response did not contain an invite code.");

      return json(
        {
          error: "Discord returned an invalid response.",
        },
        502,
        origin,
      );
    }

    return json(
      {
        success: true,
        invite: `https://discord.gg/${discordData.code}`,
        expiresIn: 300,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("Worker error:", error);

    return json(
      {
        error: "Internal server error.",
      },
      500,
      origin,
    );
  }
}

function isAllowedOrigin(origin) {
  return typeof origin === "string" && ALLOWED_ORIGINS.includes(origin);
}

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
