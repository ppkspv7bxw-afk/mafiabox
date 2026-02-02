/* ===== GameHub4u — Shared Utilities ===== */

const SERVER_URL = "https://jackbox-server-pwtr.onrender.com";
const WEB_ORIGIN = location.origin;

/* ---- Client ID ---- */
function uuidFallback(){
  return "id-" + Date.now().toString(16) + "-" + Math.random().toString(16).slice(2);
}
const clientId = localStorage.getItem("clientId") || (crypto && crypto.randomUUID ? crypto.randomUUID() : uuidFallback());
localStorage.setItem("clientId", clientId);

/* ---- Socket Factory ---- */
function createSocket(overrideId){
  return io(SERVER_URL, {
    transports: ["websocket","polling"],
    auth: { clientId: overrideId || clientId }
  });
}

/* ---- Toast ---- */
function showToast(text, duration){
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = text;
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => el.style.display = "none", duration || 1500);
}

/* ---- HTML Escape ---- */
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

/* ---- Input Validation ---- */
function validateRoomCode(val){
  const v = (val || "").trim().toUpperCase();
  if (!v) return { ok:false, msg:"Enter room code", value:"" };
  if (v.length > 6) return { ok:false, msg:"Code too long (max 6)", value:v };
  if (!/^[A-Z0-9]+$/.test(v)) return { ok:false, msg:"Letters & numbers only", value:v };
  return { ok:true, msg:"", value:v };
}

function validateName(val){
  const v = (val || "").trim();
  if (!v) return { ok:false, msg:"Enter your name", value:"" };
  if (v.length > 20) return { ok:false, msg:"Name too long (max 20)", value:v };
  return { ok:true, msg:"", value:v };
}

/* ---- Status Light ---- */
function bindStatusLight(socket, lightEl){
  if (!lightEl) return;
  socket.on("connect",    () => lightEl.classList.add("ok"));
  socket.on("disconnect", () => lightEl.classList.remove("ok"));
}

/* ---- Reconnection Overlay ---- */
function setupReconnectOverlay(socket){
  // Create overlay element
  const overlay = document.createElement("div");
  overlay.className = "reconnect-overlay";
  overlay.innerHTML = '<div class="spinner"></div><div class="msg">Reconnecting...</div>';
  document.body.appendChild(overlay);

  let disconnectTimer = null;

  socket.on("disconnect", () => {
    // Show overlay after 1.5s of being disconnected
    disconnectTimer = setTimeout(() => {
      overlay.classList.add("show");
    }, 1500);
  });

  socket.on("connect", () => {
    clearTimeout(disconnectTimer);
    overlay.classList.remove("show");
  });
}

/* ---- Phase Labels ---- */
function labelPhase(p){
  if (p === "role") return "ROLE";
  if (p === "night") return "NIGHT";
  if (p === "day") return "DAY VOTE";
  return p || "\u2014";
}

function labelRole(r){
  if (r === "mafia") return "MAFIA";
  if (r === "doctor") return "DOCTOR";
  if (r === "detective") return "DETECTIVE";
  if (r === "villager") return "VILLAGER";
  return "\u2014";
}

/* ---- Query Params Helper ---- */
function getParam(key){
  return new URLSearchParams(location.search).get(key);
}
