import { ImageResponse } from "next/og";

export const alt = "disbotclient — a Discord client for your bot, running in your browser";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1e1f22";
const PANEL = "#2b2d31";
const CHAT = "#313338";
const BLURPLE = "#5865f2";
const TEXT = "#dbdee1";
const MUTED = "#949ba4";
const ONLINE = "#23a55a";

/** A stand-in for a channel row in the mocked sidebar. */
function ChannelRow({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: 6,
        background: active ? "#3f4147" : "transparent",
        color: active ? "#f2f3f5" : MUTED,
        fontSize: 20,
      }}
    >
      <span style={{ color: "#80848e" }}>#</span>
      {label}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "8px 16px",
        borderRadius: 999,
        background: "rgba(88,101,242,0.18)",
        color: "#c9cdfb",
        fontSize: 22,
      }}
    >
      {label}
    </div>
  );
}

/** Social preview card: the app's name, what it is, and a hint of the interface. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: CHAT,
          fontFamily: "sans-serif",
        }}
      >
        {/* The server rail, as in the app. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            width: 96,
            background: INK,
            paddingTop: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 60,
              height: 60,
              borderRadius: 18,
              background: BLURPLE,
              color: "#fff",
              fontSize: 30,
            }}
          >
            @
          </div>
          <div style={{ display: "flex", width: 40, height: 3, background: "#3f4147" }} />
          {["#4e5058", "#4e5058", "#4e5058"].map((colour, index) => (
            <div
              key={index}
              style={{ display: "flex", width: 60, height: 60, borderRadius: 30, background: colour }}
            />
          ))}
        </div>

        {/* The channel list. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 260,
            background: PANEL,
            padding: "26px 12px",
            gap: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#f2f3f5",
              fontSize: 22,
              fontWeight: 700,
              padding: "0 10px 18px",
            }}
          >
            Your server
          </div>
          <ChannelRow label="general" active />
          <ChannelRow label="random" />
          {/* Drawn rather than an emoji: the image renderer ships no emoji font. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              color: MUTED,
              fontSize: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 14,
                height: 14,
                borderRadius: 3,
                background: "#80848e",
              }}
            />
            Voice
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
            <div
              style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: ONLINE }}
            />
            <div style={{ display: "flex", color: MUTED, fontSize: 18 }}>2 online</div>
          </div>
        </div>

        {/* The pitch. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            padding: "0 64px",
          }}
        >
          <div style={{ display: "flex", color: "#fff", fontSize: 76, fontWeight: 700 }}>
            disbotclient
          </div>
          <div
            style={{
              display: "flex",
              color: TEXT,
              fontSize: 32,
              marginTop: 18,
              lineHeight: 1.35,
              maxWidth: 620,
            }}
          >
            Use your Discord bot like a real client — read, chat and moderate from the browser.
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 34, flexWrap: "wrap", maxWidth: 640 }}>
            <Chip label="Messages & DMs" />
            <Chip label="Presence" />
            <Chip label="Voice channels" />
            <Chip label="Slash commands" />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 40,
              color: MUTED,
              fontSize: 24,
            }}
          >
            <div
              style={{ display: "flex", width: 10, height: 10, borderRadius: 5, background: ONLINE }}
            />
            Your token never leaves your browser.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
