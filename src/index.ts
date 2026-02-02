export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // صفحة رئيسية
    if (url.pathname === "/") {
      return htmlPage(`
        <h1>شغال ✅</h1>
        <p>هذا Worker نشرناه بنجاح.</p>
        <p>
          <a href="/host">/host (شاشة المضيف)</a><br/>
          <a href="/play">/play (دخول اللاعبين)</a>
        </p>
      `);
    }

    // صفحة المضيف
    if (url.pathname === "/host") {
      return htmlPage(`
        <h1>Host الشاشة</h1>
        <p>اضغط زر "إنشاء غرفة" ويطلع لك كود.</p>

        <button id="create">إنشاء غرفة</button>
        <h2 id="code" style="letter-spacing: 4px;"></h2>

        <div id="log" style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px;"></div>

        <script>
          const log = (m) => {
            const el = document.getElementById('log');
            el.textContent += "\\n" + m;
          };

          function makeCode() {
            const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            let out = "";
            for (let i=0;i<4;i++) out += chars[Math.floor(Math.random()*chars.length)];
            return out;
          }

          document.getElementById('create').onclick = () => {
            const code = makeCode();
            document.getElementById('code').textContent = code;

            const proto = location.protocol === "https:" ? "wss:" : "ws:";
            const ws = new WebSocket(proto + "//" + location.host + "/ws?role=host&room=" + code);

            ws.onopen = () => log("✅ WebSocket connected (host)");
            ws.onmessage = (e) => log("📩 " + e.data);
            ws.onclose = () => log("❌ WebSocket closed");
            ws.onerror = () => log("⚠️ WebSocket error");
          };
        </script>
      `);
    }

    // صفحة اللاعبين
    if (url.pathname === "/play") {
      return htmlPage(`
        <h1>Play دخول اللاعبين</h1>
        <p>اكتب كود الغرفة + اسمك.</p>

        <input id="room" placeholder="ROOM CODE" maxlength="4" style="text-transform:uppercase" />
        <input id="name" placeholder="اسمك" maxlength="16" />
        <button id="join">دخول</button>

        <div id="log" style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px;margin-top:12px;"></div>

        <script>
          const log = (m) => {
            const el = document.getElementById('log');
            el.textContent += "\\n" + m;
          };

          document.getElementById('join').onclick = () => {
            const room = (document.getElementById('room').value || "").trim().toUpperCase();
            const name = (document.getElementById('name').value || "").trim();

            if (room.length !== 4) return alert("اكتب كود 4 أحرف/أرقام");
            if (!name) return alert("اكتب اسمك");

            const proto = location.protocol === "https:" ? "wss:" : "ws:";
            const ws = new WebSocket(proto + "//" + location.host + "/ws?role=player&room=" + room + "&name=" + encodeURIComponent(name));

            ws.onopen = () => log("✅ WebSocket connected (player)");
            ws.onmessage = (e) => log("📩 " + e.data);
            ws.onclose = () => log("❌ WebSocket closed");
            ws.onerror = () => log("⚠️ WebSocket error");
          };
        </script>
      `);
    }

    // WebSocket endpoint
    if (url.pathname === "/ws") {
      const upgrade = request.headers.get("Upgrade") || "";
      if (upgrade.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      const role = url.searchParams.get("role") || "player";
      const room = (url.searchParams.get("room") || "").toUpperCase();
      const name = url.searchParams.get("name") || "Player";

      if (!room || room.length !== 4) {
        return new Response("Invalid room", { status: 400 });
      }

      // WebSocketPair API
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      server.accept();

      // ⚠️ هذا تخزين مؤقت (Memory) للتجربة فقط
      // بعدين بننقله لـ Durable Objects عشان يصير مثل Jackbox فعلاً
      const rooms = getRoomsMap();
      if (!rooms.has(room)) rooms.set(room, { players: new Set<string>(), hostCount: 0 });

      const r = rooms.get(room)!;

      if (role === "host") {
        r.hostCount += 1;
        server.send(JSON.stringify({ type: "host:connected", room }));
        server.send(JSON.stringify({ type: "room:stats", players: Array.from(r.players), hostCount: r.hostCount }));
      } else {
        r.players.add(name);
        server.send(JSON.stringify({ type: "player:joined", room, name }));
        // "Broadcast" بسيط للـ host/players داخل نفس الاتصال فقط (للتجربة)
        // (في نسخة جاك بوكس الحقيقية بنعمل broadcast لكل sockets بالغرفة)
      }

      server.addEventListener("close", () => {
        if (role === "host") r.hostCount = Math.max(0, r.hostCount - 1);
        else r.players.delete(name);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }
};

// ===== Helpers =====
function htmlPage(body: string): Response {
  const html = `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Jackbox Web</title>
</head>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px;">
  ${body}
</body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

// تخزين مؤقت في الذاكرة (للتجربة)
// لاحقًا بنستبدله بـ Durable Objects عشان الغرف ما تضيع وتدعم عدد كبير
type RoomInfo = { players: Set<string>; hostCount: number };
let __rooms: Map<string, RoomInfo> | undefined;

function getRoomsMap(): Map<string, RoomInfo> {
  if (!__rooms) __rooms = new Map();
  return __rooms;
}
