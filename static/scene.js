/* =========================================================
   KHUNG CẢNH ĐỘNG PHÍA SAU GIAO DIỆN
   Chủ đề khủng long: T-Rex đi dạo / gầm / ngủ, thằn lằn bay,
   núi lửa phun khói, cây cọ - dương xỉ tiền sử, thiên thạch.
   Ngày / đêm, mặt trời, mặt trăng, sao, mây, chim, bướm,
   đom đóm và 4 mùa:
   xuân (hoa đào rơi), hạ (nắng, bướm, đom đóm),
   thu (lá vàng rơi), đông (tuyết rơi, đồi phủ tuyết).
   ========================================================= */
(() => {
    "use strict";

    const DAY_SECONDS = 120;      // 1 vòng ngày - đêm (chế độ Tự động)
    const SEASON_SECONDS = 45;    // mỗi mùa (chế độ Tự động)

    const SEASONS = ["spring", "summer", "autumn", "winter"];
    const SEASON_NAMES = { spring: "Mùa xuân", summer: "Mùa hạ", autumn: "Mùa thu", winter: "Mùa đông" };


    // ---------- Lưu lựa chọn ----------
    const prefs = { time: "auto", season: "auto", on: true, sound: false };
    try {
        Object.assign(prefs, JSON.parse(localStorage.getItem("sceneprefs") || "{}"));
    } catch { /* bỏ qua */ }
    const savePrefs = () => {
        try { localStorage.setItem("sceneprefs", JSON.stringify(prefs)); } catch { /* bỏ qua */ }
    };

    // ---------- Canvas ----------
    const canvas = document.createElement("canvas");
    canvas.className = "sky";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);
    const ctx = canvas.getContext("2d");

    let W = 0, H = 0;

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        makeStars();
        makeClouds();
    }

    // ---------- Tiện ích màu ----------
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
    const rand = (a, b) => a + Math.random() * (b - a);
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const smooth = (a, b, v) => {
        const t = clamp01((v - a) / (b - a));
        return t * t * (3 - 2 * t);
    };

    // Màu trời theo thời điểm trong ngày (phase 0 = bình minh, 0.25 = trưa, 0.5 = hoàng hôn, 0.75 = nửa đêm)
    const SKY = [
        [0.00, "#ffb1c8", "#ffe2c4"],
        [0.10, "#8ccdf7", "#ffe9f2"],
        [0.25, "#6ec3f5", "#e3f5ff"],
        [0.42, "#8ccdf7", "#fff0e0"],
        [0.50, "#ff8fb1", "#ffc38a"],
        [0.58, "#5b3f8c", "#e58bb5"],
        [0.75, "#120f33", "#3b2a66"],
        [0.92, "#2c2a6b", "#b07ab8"],
        [1.00, "#ffb1c8", "#ffe2c4"]
    ].map(([p, a, b]) => [p, hex(a), hex(b)]);

    function skyColors(p) {
        for (let i = 0; i < SKY.length - 1; i++) {
            const [p0, t0, b0] = SKY[i];
            const [p1, t1, b1] = SKY[i + 1];
            if (p >= p0 && p <= p1) {
                const t = (p - p0) / (p1 - p0);
                return [mix(t0, t1, t), mix(b0, b1, t)];
            }
        }
        return [SKY[0][1], SKY[0][2]];
    }

    // Độ tối: 0 = ban ngày, 1 = ban đêm
    function nightness(p) {
        if (p < 0.05) return 0.4 * (1 - smooth(0, 0.05, p));   // bình minh: sao mờ dần
        if (p < 0.5) return 0;                                  // ban ngày
        if (p < 0.9) return smooth(0.5, 0.62, p);               // hoàng hôn -> đêm
        return 1 - 0.6 * smooth(0.9, 1, p);                     // gần sáng
    }

    const SEASON_STYLE = {
        spring: { tint: [190, 255, 170, 0.08], hills: ["#c4eaa6", "#97d67c", "#6cc05c"], tree: "#7bd36a" },
        summer: { tint: [255, 225, 110, 0.08], hills: ["#a2d98a", "#6cc35a", "#46a948"], tree: "#3fae4f" },
        autumn: { tint: [255, 150, 60, 0.12], hills: ["#ead08c", "#d9a557", "#bf7f3c"], tree: "#e0892e" },
        winter: { tint: [205, 225, 255, 0.20], hills: ["#e9f1fb", "#dbe7f5", "#f8fbff"], tree: "#9fbf98" }
    };
    const NIGHT_HILL = hex("#2a2152");

    // ---------- Trạng thái ----------
    let phase = 0.15;          // thời điểm trong ngày (0..1)
    let seasonIdx = 0;
    let prevSeasonIdx = 0;
    let seasonBlend = 1;       // 0..1 chuyển màu từ mùa cũ sang mùa mới
    let seasonClock = 0;
    let time = 0;

    const season = () => SEASONS[seasonIdx];

    function targetPhase() {
        if (prefs.time === "day") return 0.22;
        if (prefs.time === "night") return 0.75;
        return null;
    }

    function setSeason(idx) {
        if (idx === seasonIdx) return;
        prevSeasonIdx = seasonIdx;
        seasonIdx = idx;
        seasonBlend = 0;
        updateLabel();
    }

    // ---------- Sao ----------
    let stars = [];
    function makeStars() {
        const n = Math.round((W * H) / 9000);
        stars = Array.from({ length: n }, () => ({
            x: Math.random() * W,
            y: Math.random() * H * 0.7,
            r: rand(0.5, 1.8),
            tw: rand(0, Math.PI * 2),
            sp: rand(1, 3)
        }));
    }

    let shooting = null;

    // ---------- Mây ----------
    let clouds = [];
    function makeClouds() {
        const n = Math.max(4, Math.round(W / 260));
        clouds = Array.from({ length: n }, (_, i) => newCloud(Math.random() * W, i));
    }
    function newCloud(x) {
        const s = rand(0.6, 1.4);
        return {
            x,
            y: rand(0.02, 0.3) * H,
            s,
            v: rand(6, 16) * s,
            puffs: Array.from({ length: 5 }, (_, i) => ({
                dx: (i - 2) * 26 + rand(-6, 6),
                dy: -Math.abs(2 - i) * -6 + rand(-6, 2) - (i === 2 ? 14 : 0),
                r: (i === 2 ? 30 : 22) + rand(-4, 6)
            }))
        };
    }

    // ---------- Chim, cò ----------
    let flocks = [];
    let nextBird = 3;
    let nextPtero = 8;

    function spawnFlock(kind) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        const count = kind === "ptero" ? Math.round(rand(1, 3)) : Math.round(rand(3, 7));
        const scale = kind === "ptero" ? rand(0.8, 1.15) : rand(0.7, 1.2);
        const y = (Math.random() < 0.55 ? rand(0.035, 0.1) : rand(0.8, 0.9)) * H;
        const x = dir > 0 ? -120 : W + 120;
        const members = [];
        for (let i = 0; i < count; i++) {
            const row = Math.ceil(i / 2);
            const side = i % 2 ? -1 : 1;
            members.push({
                ox: -row * (kind === "ptero" ? 70 : 26) * dir,
                oy: row * side * (kind === "ptero" ? 26 : 14),
                ph: rand(0, Math.PI * 2)
            });
        }
        flocks.push({
            kind, dir, x, y, scale, members,
            v: (kind === "ptero" ? rand(32, 46) : rand(55, 85)) * dir,
            bob: rand(0, Math.PI * 2)
        });
    }

    function drawBird(x, y, s, flap) {
        const w = 12 * s;
        const lift = 7 * s * flap;
        ctx.beginPath();
        ctx.moveTo(x - w, y - lift);
        ctx.quadraticCurveTo(x - w * 0.45, y - 2 * s - lift * 0.4, x, y);
        ctx.quadraticCurveTo(x + w * 0.45, y - 2 * s - lift * 0.4, x + w, y - lift);
        ctx.stroke();
    }

    function drawPtero(x, y, s, dir, flap) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s * dir, s);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        pteroWing(-flap * 0.8, "#e9b384");        // cánh xa

        // Thân + chân
        ctx.fillStyle = "#c8743f";
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#a95c2c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, 3); ctx.lineTo(-19, 7);
        ctx.moveTo(-8, 4); ctx.lineTo(-16, 9);
        ctx.stroke();

        // Cổ, đầu, mào, mỏ dài
        ctx.fillStyle = "#c8743f";
        ctx.beginPath();
        ctx.moveTo(10, -3); ctx.quadraticCurveTo(15, -6, 18, -6); ctx.lineTo(17, -2); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ffb627";
        ctx.beginPath();
        ctx.moveTo(18, -8); ctx.lineTo(3, -15); ctx.lineTo(19, -4); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#d9824b";
        ctx.beginPath();
        ctx.ellipse(21, -6, 6, 3.6, -0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(25, -7.5); ctx.lineTo(42, -4); ctx.lineTo(25, -4); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#1e3a24";
        ctx.beginPath();
        ctx.arc(22, -7, 1.1, 0, Math.PI * 2);
        ctx.fill();

        pteroWing(flap, "#f0a868");               // cánh gần
        ctx.restore();
    }

    function pteroWing(flap, color) {
        const tipY = -38 * flap;
        ctx.fillStyle = color;
        ctx.strokeStyle = "#a95c2c";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(8, -1);
        ctx.quadraticCurveTo(12, tipY * 0.55, 4, tipY);           // mép trước tới đầu cánh
        ctx.quadraticCurveTo(-4, tipY * 0.45, -15, 1);            // màng cánh về hông
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Xương ngón cánh
        ctx.beginPath();
        ctx.moveTo(6, -1);
        ctx.lineTo(3, tipY * 0.9);
        ctx.stroke();
    }

    // ---------- Bướm & đom đóm ----------
    const butterflies = Array.from({ length: 5 }, () => ({
        x: Math.random(), y: rand(0.84, 0.95), t: rand(0, 100),
        c: ["#ff7eb0", "#ffd166", "#b69cff", "#7fd4ff"][Math.floor(rand(0, 4))]
    }));
    const fireflies = Array.from({ length: 26 }, () => ({
        x: Math.random(), y: rand(0.8, 0.97), t: rand(0, 100)
    }));

    // ---------- Hoa, lá, tuyết rơi ----------
    const DENSITY = { spring: 45, summer: 14, autumn: 38, winter: 110 };
    const particles = Array.from({ length: 110 }, (_, i) => newParticle(i, true));

    function newParticle(i, anywhere) {
        const s = season();
        const p = {
            i,
            type: s,
            active: i < DENSITY[s],
            x: Math.random() * W,
            y: anywhere ? Math.random() * H : rand(-60, -10),
            rot: rand(0, Math.PI * 2),
            vr: rand(-1.5, 1.5),
            sway: rand(0, Math.PI * 2)
        };
        if (s === "spring") Object.assign(p, { vy: rand(25, 45), size: rand(4, 7), color: ["#ffb7d0", "#ff9cc2", "#ffd1e1"][i % 3] });
        if (s === "summer") Object.assign(p, { vy: rand(-12, -5), size: rand(1.2, 2.6), color: "#fff2a8", y: anywhere ? Math.random() * H : H + 10 });
        if (s === "autumn") Object.assign(p, { vy: rand(30, 55), size: rand(7, 11), color: ["#f59e0b", "#ea580c", "#dc2626", "#facc15"][i % 4] });
        if (s === "winter") Object.assign(p, { vy: rand(20, 55), size: rand(1.2, 3.6), color: "#ffffff" });
        return p;
    }

    function drawParticle(p) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.type === "spring") {
            // Cánh hoa đào
            ctx.beginPath();
            ctx.moveTo(0, -p.size);
            ctx.quadraticCurveTo(p.size, -p.size * 0.2, 0, p.size);
            ctx.quadraticCurveTo(-p.size, -p.size * 0.2, 0, -p.size);
            ctx.fill();
        } else if (p.type === "autumn") {
            // Lá thu
            const s = p.size;
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.quadraticCurveTo(s * 0.8, -s * 0.2, 0, s);
            ctx.quadraticCurveTo(-s * 0.8, -s * 0.2, 0, -s);
            ctx.fill();
            ctx.strokeStyle = "rgba(90,40,10,0.45)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.lineTo(0, s + 3);
            ctx.stroke();
        } else if (p.type === "winter") {
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Hạ: hạt nắng lấp lánh bay lên
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 3 + p.sway);
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // ---------- Vẽ mặt trời, mặt trăng ----------
    function drawSun(x, y, r) {
        const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 4);
        glow.addColorStop(0, "rgba(255,226,120,0.55)");
        glow.addColorStop(1, "rgba(255,226,120,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);

        // Tia nắng xoay
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(time * 0.25);
        ctx.fillStyle = "rgba(255,200,90,0.85)";
        const rays = 12;
        const len = season() === "summer" ? 1.75 : 1.5;
        for (let i = 0; i < rays; i++) {
            ctx.rotate((Math.PI * 2) / rays);
            ctx.beginPath();
            ctx.moveTo(-r * 0.18, -r * 1.15);
            ctx.lineTo(0, -r * (len + 0.08 * Math.sin(time * 3 + i)));
            ctx.lineTo(r * 0.18, -r * 1.15);
            ctx.fill();
        }
        ctx.restore();

        ctx.fillStyle = "#ffd25e";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        cuteFace(x, y, r, false);
    }

    function drawMoon(x, y, r) {
        const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 3.5);
        glow.addColorStop(0, "rgba(255,246,216,0.4)");
        glow.addColorStop(1, "rgba(255,246,216,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(x - r * 3.5, y - r * 3.5, r * 7, r * 7);

        ctx.fillStyle = "#fff4d1";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(220,200,160,0.45)";
        [[-0.35, -0.3, 0.18], [0.4, 0.25, 0.13], [0.1, 0.5, 0.1]].forEach(([dx, dy, rr]) => {
            ctx.beginPath();
            ctx.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2);
            ctx.fill();
        });
        cuteFace(x, y, r, true);
    }

    // Mặt cười (mặt trời) / mặt ngủ (mặt trăng)
    function cuteFace(x, y, r, sleeping) {
        ctx.strokeStyle = "#7a4a3a";
        ctx.fillStyle = "#7a4a3a";
        ctx.lineWidth = Math.max(1.5, r * 0.07);
        ctx.lineCap = "round";
        const ex = r * 0.32, ey = -r * 0.08;
        if (sleeping) {
            [-1, 1].forEach((s) => {
                ctx.beginPath();
                ctx.arc(x + s * ex, y + ey, r * 0.12, 0.15 * Math.PI, 0.85 * Math.PI);
                ctx.stroke();
            });
        } else {
            const blink = Math.sin(time * 1.3) > 0.97 ? 0.15 : 1;
            [-1, 1].forEach((s) => {
                ctx.beginPath();
                ctx.ellipse(x + s * ex, y + ey, r * 0.07, r * 0.1 * blink, 0, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        ctx.beginPath();
        ctx.arc(x, y + r * 0.12, r * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,120,160,0.45)";
        [-1, 1].forEach((s) => {
            ctx.beginPath();
            ctx.ellipse(x + s * r * 0.55, y + r * 0.2, r * 0.14, r * 0.08, 0, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // ---------- Đồi & cây ----------
    function hillY(layer, x) {
        const base = H * (0.8 + layer * 0.06);
        const amp = H * (0.035 - layer * 0.006);
        return base - amp * Math.sin(x / (W / (2.2 + layer)) + layer * 1.7) - amp * 0.5 * Math.sin(x / 90 + layer);
    }

    const TREES = [0.04, 0.12, 0.2, 0.31, 0.38, 0.52, 0.6, 0.71, 0.79, 0.9, 0.97];

    function drawHillsAndTrees(n) {
        const cur = SEASON_STYLE[season()];
        const prev = SEASON_STYLE[SEASONS[prevSeasonIdx]];
        for (let layer = 0; layer < 3; layer++) {
            let c = mix(hex(prev.hills[layer]), hex(cur.hills[layer]), seasonBlend);
            c = mix(c, NIGHT_HILL, n * (0.6 - layer * 0.08));
            ctx.fillStyle = rgb(c);
            ctx.beginPath();
            ctx.moveTo(0, H);
            for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, hillY(layer, x));
            ctx.lineTo(W, H);
            ctx.closePath();
            ctx.fill();

            if (layer === 1) TREES.forEach((f, i) => drawTree(W * f, hillY(1, W * f), i, n));
            if (layer === 2) drawBushes(n);
        }
    }

    function drawTree(x, y, i, n) {
        const s = season();
        const sway = Math.sin(time * 1.1 + i) * 0.05;
        const h = 52 + (i % 3) * 12;
        const dark = (c) => rgb(mix(hex(c), NIGHT_HILL, n * 0.5));

        ctx.save();
        ctx.translate(x, y + 4);
        ctx.rotate(sway * 0.4);

        // Thân cọ cong, có vân
        const bend = (i % 2 ? 1 : -1) * 10;
        ctx.strokeStyle = dark("#8b5a3c");
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(bend, -h * 0.5, bend * 0.4, -h);
        ctx.stroke();
        ctx.strokeStyle = dark("#6d452c");
        ctx.lineWidth = 2;
        for (let k = 1; k < 6; k++) {
            const t = k / 6;
            const tx = (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * bend + t * t * bend * 0.4;
            ctx.beginPath();
            ctx.moveTo(tx - 3, -h * t);
            ctx.lineTo(tx + 3, -h * t + 2);
            ctx.stroke();
        }

        // Tán lá dạng dương xỉ, đung đưa
        ctx.translate(bend * 0.4, -h);
        ctx.rotate(sway);
        const frond = dark(SEASON_STYLE[s].tree);
        const fronds = 7;
        for (let k = 0; k < fronds; k++) {
            const a = -Math.PI / 2 + (k - (fronds - 1) / 2) * 0.48;
            const len = 34 + (k % 2) * 6;
            const tipX = Math.cos(a) * len;
            const tipY = Math.sin(a) * len + 10 + Math.abs(Math.cos(a)) * 12;   // lá rủ xuống
            ctx.fillStyle = frond;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(tipX * 0.5 - Math.sin(a) * 9, tipY * 0.5 - 9, tipX, tipY);
            ctx.quadraticCurveTo(tipX * 0.5 + Math.sin(a) * 4, tipY * 0.5 + 3, 0, 0);
            ctx.fill();
            if (s === "winter") {
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.ellipse(tipX * 0.45, tipY * 0.45 - 5, 7, 2.6, a, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        if (s === "spring") {
            ctx.fillStyle = dark("#ffd1e1");
            [[-12, -6], [10, -10], [0, -16], [18, 2], [-20, 4]].forEach(([dx, dy]) => {
                ctx.beginPath();
                ctx.arc(dx, dy, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        if (s === "summer") {
            // Chùm quả
            ctx.fillStyle = dark("#ffb627");
            [[-4, 4], [3, 5], [0, 9]].forEach(([dx, dy]) => {
                ctx.beginPath();
                ctx.arc(dx, dy, 3.4, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        ctx.restore();
    }

    // ---------- Núi lửa ----------
    const smoke = [];
    const lava = [];
    let smokeTimer = 0;
    let eruptTimer = 6;

    function volcanoPos() {
        const vx = W * 0.6;
        const base = hillY(0, vx) + 14;
        const h = Math.min(H * 0.24, 220);
        return { vx, base, top: base - h, h };
    }

    function updateVolcano(dt) {
        const v = volcanoPos();
        smokeTimer -= dt;
        if (smokeTimer <= 0) {
            smokeTimer = 0.35;
            smoke.push({ x: v.vx + rand(-6, 6), y: v.top, r: rand(6, 10), life: 0, vx: rand(8, 20) });
        }
        smoke.forEach((p) => {
            p.life += dt;
            p.y -= 22 * dt;
            p.x += p.vx * dt;
            p.r += 7 * dt;
        });
        while (smoke.length && smoke[0].life > 6) smoke.shift();

        eruptTimer -= dt;
        if (eruptTimer <= 0) {
            eruptTimer = rand(14, 24);
            for (let i = 0; i < 26; i++) {
                lava.push({ x: v.vx, y: v.top, vx: rand(-70, 70), vy: rand(-190, -110), life: 0, r: rand(2, 4.5) });
            }
        }
        lava.forEach((p) => {
            p.life += dt;
            p.vy += 160 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
        });
        for (let i = lava.length - 1; i >= 0; i--) if (lava[i].life > 2.6) lava.splice(i, 1);
    }

    function drawVolcano(n) {
        const v = volcanoPos();
        const half = v.h * 0.95;
        const rock = rgb(mix(hex(season() === "winter" ? "#8a7a72" : "#7a5a44"), NIGHT_HILL, n * 0.55));

        // Khói
        smoke.forEach((p) => {
            const a = Math.max(0, 0.45 * (1 - p.life / 6));
            ctx.fillStyle = rgb(mix(hex("#b9b3ad"), hex("#5d4f8f"), n * 0.6), a);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        });

        // Thân núi
        ctx.fillStyle = rock;
        ctx.beginPath();
        ctx.moveTo(v.vx - half, v.base);
        ctx.quadraticCurveTo(v.vx - half * 0.35, v.base - v.h * 0.55, v.vx - 16, v.top);
        ctx.lineTo(v.vx + 16, v.top);
        ctx.quadraticCurveTo(v.vx + half * 0.35, v.base - v.h * 0.55, v.vx + half, v.base);
        ctx.closePath();
        ctx.fill();

        // Dung nham chảy + ánh đỏ miệng núi (sáng hơn ban đêm)
        const pulse = 0.75 + 0.25 * Math.sin(time * 3);
        const glow = ctx.createRadialGradient(v.vx, v.top, 2, v.vx, v.top, 60 + n * 40);
        glow.addColorStop(0, `rgba(255,140,40,${(0.55 + n * 0.35) * pulse})`);
        glow.addColorStop(1, "rgba(255,140,40,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(v.vx - 110, v.top - 110, 220, 220);

        ctx.fillStyle = "#ff7a1a";
        ctx.beginPath();
        ctx.moveTo(v.vx - 16, v.top);
        ctx.lineTo(v.vx + 16, v.top);
        ctx.quadraticCurveTo(v.vx + 8, v.top + 20, v.vx + 12, v.top + 42 + 6 * Math.sin(time * 1.5));
        ctx.quadraticCurveTo(v.vx + 2, v.top + 24, v.vx - 2, v.top + 30 + 5 * Math.sin(time * 1.3 + 1));
        ctx.quadraticCurveTo(v.vx - 8, v.top + 14, v.vx - 16, v.top);
        ctx.fill();

        if (season() === "winter") {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.beginPath();
            ctx.moveTo(v.vx - half * 0.42, v.top + v.h * 0.38);
            ctx.quadraticCurveTo(v.vx - 20, v.top + 8, v.vx - 18, v.top + 4);
            ctx.lineTo(v.vx - 26, v.top + v.h * 0.3);
            ctx.closePath();
            ctx.fill();
        }

        // Đá lửa phun lên
        lava.forEach((p) => {
            ctx.fillStyle = `rgba(255,${120 + (p.r * 20) | 0},40,${Math.max(0, 1 - p.life / 2.6)})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // =========================================================
    // ĐÀN KHỦNG LONG: nhiều loài, bấm / kéo / ném / thả trứng / cho ăn
    // =========================================================
    const SPECIES = {
        trex:    { w: 120, h: 100, speed: 46, diet: "meat", sound: "Gràooo!",  head: [45, -100], colors: ["#5cc96b", "#2f7d3a", "#d6f6bb"] },
        tri:     { w: 130, h: 76,  speed: 30, diet: "leaf", sound: "Ụm bòoo!", head: [52, -78],  colors: ["#f4a261", "#a65a1f", "#ffe0b8"] },
        brachio: { w: 160, h: 178, speed: 20, diet: "leaf", sound: "Muuuu~",   head: [66, -172], colors: ["#9b8ce8", "#5b4bb7", "#e6e0ff"] },
        stego:   { w: 140, h: 80,  speed: 26, diet: "leaf", sound: "Hừm hừm!", head: [52, -44],  colors: ["#e9c46a", "#9c7a22", "#fff3c4"] },
        raptor:  { w: 110, h: 66,  speed: 95, diet: "meat", sound: "Kéc kéc!", head: [32, -64],  colors: ["#2a9d8f", "#16645b", "#c4f1ea"] }
    };
    const SPECIES_LIST = Object.keys(SPECIES);
    const MAX_DINOS = 16;

    let dinos = [];
    let eggs = [];
    let foods = [];
    let bursts = [];
    let dinoId = 0;
    let held = null;          // khủng long đang bị kéo

    function sceneScale() {
        return Math.max(0.6, Math.min(1.05, H / 900)) * 0.9;
    }

    function makeDino(species, x, baby = false) {
        return {
            id: ++dinoId, species, baby, x,
            air: 0, vx: 0, vy: 0,
            dir: Math.random() < 0.5 ? 1 : -1,
            walk: rand(0, 6), state: "walk", stateT: rand(3, 8),
            bubble: null, awake: 0, sleeping: false,
            lane: rand(0, 16),
            size: (baby ? 0.52 : 1) * rand(0.92, 1.05)
        };
    }

    function initDinos() {
        dinos = [];
        eggs = [];
        foods = [];
        const start = [["trex", 0.3], ["tri", 0.5], ["brachio", 0.72], ["stego", 0.15], ["raptor", 0.88]];
        start.forEach(([sp, f]) => dinos.push(makeDino(sp, W * f)));
        dinos.push(makeDino("tri", W * 0.55, true));
        dinos.sort((a, b) => a.lane - b.lane);
    }

    const groundY = (x) => hillY(2, x) + 10;
    const dinoScale = (d) => sceneScale() * d.size;
    const feetY = (d) => groundY(d.x) + d.lane - d.air;

    function say(d, text, sound = true, quiet = false) {
        d.bubble = { text, t: 1.8, quiet };
        if (!quiet && typeof lastSound !== "undefined") lastSound = text;
        if (sound) play(d.baby ? "baby" : d.species);
    }

    function burst(x, y, kind = "heart", count = 10) {
        const colors = kind === "heart" ? ["#ff7aa2", "#ff4d6d", "#ffb3c6"] : ["#ffd166", "#5fd06f", "#7fd4ff", "#ff9f1c"];
        for (let i = 0; i < count; i++) {
            const a = rand(0, Math.PI * 2);
            const v = rand(80, 220);
            bursts.push({
                x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120,
                life: 0, max: rand(0.8, 1.3), size: rand(5, 9),
                color: colors[i % colors.length], kind
            });
        }
    }

    function dustAt(x, y, count = 6) {
        for (let i = 0; i < count; i++) {
            bursts.push({ x, y, vx: rand(-60, 60), vy: rand(-60, -10), life: 0, max: 0.7, size: rand(4, 8), color: "#c9a77c", kind: "dust" });
        }
    }

    function nearestFood(d) {
        const diet = SPECIES[d.species].diet;
        let best = null;
        for (const f of foods) {
            if (f.type !== diet || f.left <= 0) continue;
            if (!best || Math.abs(f.x - d.x) < Math.abs(best.x - d.x)) best = f;
        }
        return best;
    }

    function parentOf(d) {
        let best = null;
        for (const o of dinos) {
            if (o.baby || o.species !== d.species) continue;
            if (!best || Math.abs(o.x - d.x) < Math.abs(best.x - d.x)) best = o;
        }
        return best;
    }

    function updateDinos(dt, n) {
        const night = n > 0.6;

        for (const d of dinos) {
            const sp = SPECIES[d.species];
            if (d.bubble) {
                d.bubble.t -= dt;
                if (d.bubble.t <= 0) d.bubble = null;
            }
            d.awake = Math.max(0, d.awake - dt);
            if (d === held || d.carriedBy) continue;

            // Đang bay (bị ném / nhảy): trọng lực + nảy
            if (d.air > 0 || d.vy > 0) {
                d.vy -= 1500 * dt;
                d.air += d.vy * dt;
                d.x += d.vx * dt;
                d.vx *= 0.99;
                if (d.x < 30) { d.x = 30; d.vx = Math.abs(d.vx) * 0.5; }
                if (d.x > W - 30) { d.x = W - 30; d.vx = -Math.abs(d.vx) * 0.5; }
                if (d.air <= 0) {
                    d.air = 0;
                    if (inLake(d.x) && !frozen()) {
                        splash(d.x, feetY(d), true);
                        say(d, "Tõm!", false);
                        play("splash");
                        d.vy = 0;
                        d.vx = 0;
                    } else if (d.vy < -420) {
                        d.vy = -d.vy * 0.35;
                        d.vx *= 0.6;
                        dustAt(d.x, groundY(d.x) + d.lane, 8);
                        say(d, "Úi da!", false);
                        play("boing");
                    } else {
                        d.vy = 0;
                        d.vx = 0;
                    }
                }
                continue;
            }

            d.sleeping = night && d.awake <= 0;
            if (d.sleeping) continue;

            d.stateT -= dt;
            if (d.state === "eat" || d.state === "idle") {
                const hx = d.x + d.dir * sp.head[0] * dinoScale(d);
                if (d.activity === "drink" && !frozen() && Math.random() < dt * 3) {
                    ripples.push({ x: hx, y: lake().y - 4, r: 2, life: 0, max: 1 });
                }
                if (d.activity === "tree" && d.treeRef) {
                    d.treeRef.shake = Math.max(d.treeRef.shake, 0.35);
                    if (Math.random() < dt * 3) leafFall(treeTop(d.treeRef), 1);
                }
                if (d.activity === "swim" && !frozen() && Math.random() < dt * 4) {
                    splash(d.x + rand(-15, 15), feetY(d), false);
                }
                if (d.stateT <= 0) {
                    d.state = "walk";
                    d.stateT = rand(4, 9);
                    d.activity = null;
                    d.treeRef = null;
                }
                continue;
            }

            // Mục tiêu: thức ăn > theo mẹ (con non) > rượt con trỏ (raptor)
            let target = null;
            const food = nearestFood(d);
            if (food) {
                target = food.x;
            } else if (d.baby) {
                const mom = parentOf(d);
                if (mom && Math.abs(mom.x - d.x) > 70) target = mom.x - mom.dir * 50;
            } else if (d.species === "raptor" && pointer.inside && !pointer.overUI
                       && pointer.y > groundY(pointer.x) - 160 && Math.abs(pointer.x - d.x) < 320) {
                target = pointer.x;
            } else if (d.goal) {
                target = d.goal.x;
            }

            let speed = sp.speed * (d.baby ? 1.15 : 1);
            if (target !== null) {
                const dx = target - d.x;
                if (Math.abs(dx) < 14) {
                    if (food) {
                        food.left--;
                        d.state = "eat";
                        d.stateT = 2.4;
                        say(d, "Măm măm!", false, true);
                        play("eat");
                    } else if (d.goal) {
                        arriveGoal(d);
                    } else {
                        d.state = "idle";
                        d.stateT = 0.6;
                    }
                    continue;
                }
                d.dir = Math.sign(dx);
                if (food) speed *= 1.7;
            } else {
                if (d.x > W - 60) d.dir = -1;
                if (d.x < 60) d.dir = 1;
                if (d.stateT <= 0) {
                    if (pickGoal(d)) {
                        d.stateT = rand(6, 10);
                    } else {
                        d.state = "idle";
                        d.stateT = rand(1.5, 4);
                        if (Math.random() < 0.3) say(d, d.baby ? "Chíp chíp!" : sp.sound, false);
                        continue;
                    }
                }
            }

            d.x += d.dir * speed * dt;
            d.walk += dt * Math.max(5, speed / 7);
            if (inLake(d.x) && !frozen() && Math.random() < dt * 4) splash(d.x - d.dir * 10, feetY(d) - 2, false);
            if (Math.random() < dt * 2.5) dustAt(d.x - d.dir * 20 * dinoScale(d), groundY(d.x) + d.lane, 1);
        }

        foods = foods.filter((f) => f.left > 0);

        // Trứng rơi, lắc, nở
        for (const e of eggs) {
            e.t += dt;
            const gy = groundY(e.x) + 8;
            if (e.y < gy) {
                e.vy += 900 * dt;
                e.y = Math.min(gy, e.y + e.vy * dt);
            }
            if (e.t > e.hatchAt) {
                e.done = true;
                hatch(e);
            }
        }
        eggs = eggs.filter((e) => !e.done);

        for (const b of bursts) {
            b.life += dt;
            b.vy += (b.kind === "dust" ? 40 : b.kind === "leaf" ? 50 : b.kind === "drop" ? 700 : 300) * dt;
            if (b.kind === "leaf") b.vx += Math.sin(time * 4 + b.y * 0.05) * 60 * dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
        }
        bursts = bursts.filter((b) => b.life < b.max);
    }

    function hatch(e) {
        if (dinos.length >= MAX_DINOS) {
            const i = dinos.findIndex((d) => d.baby && d !== held);
            if (i >= 0) dinos.splice(i, 1);
        }
        if (dinos.length >= MAX_DINOS) {
            burst(e.x, e.y - 10, "star", 12);
            return;
        }
        const baby = makeDino(e.species, e.x, true);
        baby.lane = e.lane;
        baby.air = 1;
        baby.vy = 300;
        dinos.push(baby);
        dinos.sort((a, b) => a.lane - b.lane);
        say(baby, "Chíp chíp!", false);
        play("hatch");
        burst(e.x, e.y - 14, "star", 14);
    }

    function dropEgg(x, y) {
        const lane = rand(0, 16);
        eggs.push({
            x, y: Math.min(y, groundY(x) + lane), vy: 0, t: 0, lane,
            hatchAt: rand(2, 2.8),
            species: SPECIES_LIST[Math.floor(Math.random() * SPECIES_LIST.length)]
        });
    }

    function dropFood() {
        for (let i = 0; i < 4; i++) {
            foods.push({ x: rand(0.08, 0.92) * W, type: i % 2 ? "meat" : "leaf", left: 3 });
        }
        dinos.forEach((d) => { d.awake = 8; if (d.state === "idle") d.stateT = 0; });
    }

    function allSay() {
        dinos.forEach((d, i) => {
            setTimeout(() => {
                d.awake = 6;
                if (d.air === 0 && d !== held) { d.vy = 260; d.air = 0.1; }
                say(d, d.baby ? "Chíp chíp!" : SPECIES[d.species].sound, i < 5);
            }, i * 120);
        });
    }

    // ---------- Vẽ ----------
    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
        else ctx.rect(x, y, w, h);
    }

    function drawDinos(n) {
        drawLake(n);
        drawCrocs(n);
        drawBigTrees(n);

        // Thức ăn
        for (const f of foods) {
            const y = groundY(f.x) + 6;
            const k = 0.6 + f.left * 0.15;
            ctx.save();
            ctx.translate(f.x, y);
            ctx.scale(k, k);
            if (f.fruit) {
                ctx.fillStyle = season() === "autumn" ? "#e85d04" : "#ff4d6d";
                ctx.beginPath(); ctx.arc(0, -6, 7, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = "#3fae4f";
                ctx.beginPath(); ctx.ellipse(4, -13, 4, 2, -0.6, 0, Math.PI * 2); ctx.fill();
            } else if (f.type === "leaf") {
                ["#3fae4f", "#5fd06f", "#2f8f3f"].forEach((c, i) => {
                    ctx.fillStyle = c;
                    ctx.beginPath();
                    ctx.ellipse((i - 1) * 9, -6 - (i % 2) * 4, 11, 6, (i - 1) * 0.6, 0, Math.PI * 2);
                    ctx.fill();
                });
            } else {
                ctx.fillStyle = "#f1e3c8";
                ctx.fillRect(4, -9, 16, 5);
                ctx.beginPath(); ctx.arc(21, -10, 3.5, 0, Math.PI * 2); ctx.arc(21, -4, 3.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = "#b5523b";
                ctx.beginPath(); ctx.ellipse(-4, -7, 13, 9, -0.2, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = "#d9785f";
                ctx.beginPath(); ctx.ellipse(-7, -10, 5, 3, -0.2, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }

        // Trứng
        for (const e of eggs) {
            const wob = e.t > e.hatchAt - 1.2 ? Math.sin(e.t * 28) * 0.22 : 0;
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(wob);
            ctx.fillStyle = "#fff4dc";
            ctx.strokeStyle = "#d9c49a";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, -13, 10, 13, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = SPECIES[e.species].colors[0];
            [[-4, -18, 2.4], [4, -10, 2], [-2, -7, 1.6], [5, -20, 1.5]].forEach(([x, y, r]) => {
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            });
            if (e.t > e.hatchAt - 0.7) {
                ctx.strokeStyle = "#7a5a44";
                ctx.beginPath();
                ctx.moveTo(-9, -14); ctx.lineTo(-4, -10); ctx.lineTo(0, -15); ctx.lineTo(4, -10); ctx.lineTo(9, -14);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Khủng long (con đang bị kéo vẽ sau cùng)
        const order = held ? dinos.filter((d) => d !== held).concat([held]) : dinos;
        for (const d of order) drawOneDino(d, n);
        drawLakeFront(n);
        drawFish();

        // Hạt: tim, sao, bụi
        for (const b of bursts) {
            const a = 1 - b.life / b.max;
            ctx.globalAlpha = Math.max(0, a);
            ctx.fillStyle = b.color;
            if (b.kind === "heart") {
                const s = b.size;
                ctx.beginPath();
                ctx.moveTo(b.x, b.y + s * 0.35);
                ctx.bezierCurveTo(b.x - s, b.y - s * 0.4, b.x - s * 0.4, b.y - s, b.x, b.y - s * 0.35);
                ctx.bezierCurveTo(b.x + s * 0.4, b.y - s, b.x + s, b.y - s * 0.4, b.x, b.y + s * 0.35);
                ctx.fill();
            } else if (b.kind === "star") {
                star(b.x, b.y, b.size);
            } else if (b.kind === "leaf") {
                ctx.beginPath();
                ctx.ellipse(b.x, b.y, b.size, b.size * 0.5, time * 3 + b.x, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.kind === "dust" ? b.size * (1 + b.life) : b.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;

        // Bong bóng lời nói / Zzz
        for (const d of dinos) drawBubble(d);
        drawEchoes();
    }

    function star(x, y, r) {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const rr = i % 2 ? r * 0.45 : r;
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
    }

    function drawBubble(d) {
        const sp = SPECIES[d.species];
        const s = dinoScale(d);
        const hx = d.x + d.dir * sp.head[0] * s;
        const hy = feetY(d) + sp.head[1] * s - 12;
        ctx.textAlign = "center";
        if (d.bubble) {
            const age = 1.8 - d.bubble.t;
            const pop = Math.min(1, age * 6);
            const fs = Math.round(15 + 5 * Math.min(1, s));
            ctx.font = `800 ${fs}px "Baloo 2", "Segoe UI", sans-serif`;
            const w = ctx.measureText(d.bubble.text).width + 22;
            ctx.save();
            ctx.translate(hx + d.dir * 18, hy - 12);
            ctx.scale(pop, pop);
            ctx.globalAlpha = Math.min(1, d.bubble.t * 3);
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = sp.colors[1];
            ctx.lineWidth = 2.5;
            roundRect(-w / 2, -fs - 4, w, fs + 14, 13);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = sp.colors[1];
            ctx.fillText(d.bubble.text, 0, 2);
            ctx.restore();
            ctx.globalAlpha = 1;
        } else if (d.sleeping) {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            for (let k = 0; k < 3; k++) {
                const t = (time * 0.6 + k / 3 + d.id * 0.17) % 1;
                ctx.globalAlpha = 1 - t;
                ctx.font = `800 ${Math.round((10 + k * 4) * Math.max(0.7, s) + 4)}px "Baloo 2", sans-serif`;
                ctx.fillText("Z", hx + d.dir * (10 + t * 26), hy + 20 - t * 44 - k * 5);
            }
            ctx.globalAlpha = 1;
        }
    }

    function drawOneDino(d, n) {
        const sp = SPECIES[d.species];
        const s = dinoScale(d);
        const fy = feetY(d);
        const isHeld = d === held;
        const step = d.sleeping || d.state !== "walk" || d.air > 0 ? (isHeld ? Math.sin(time * 18) : 0) : Math.sin(d.walk);
        const talking = !!d.bubble && !d.bubble.quiet;
        const eating = d.state === "eat" && d.activity !== "tree";
        const treeEat = d.state === "eat" && d.activity === "tree";
        const c = sp.colors.map((col) => rgb(mix(hex(col), NIGHT_HILL, n * 0.35)));

        // Bóng dưới đất (nhỏ dần khi bay cao)
        const gy = groundY(d.x) + d.lane;
        const shadowK = Math.max(0.3, 1 - d.air / 250);
        ctx.fillStyle = `rgba(20,60,25,${0.18 * shadowK})`;
        ctx.beginPath();
        ctx.ellipse(d.x, gy + 1, sp.w * 0.36 * s * shadowK, 5 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(d.x, fy);
        ctx.scale(s * d.dir, s);
        if (isHeld) ctx.rotate(Math.sin(time * 9) * 0.12);
        if (d.sleeping) ctx.translate(0, 6);
        if (!d.sleeping && d.state === "walk" && d.air === 0) ctx.translate(0, -Math.abs(step) * 3);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.lineWidth = 3;
        ctx.strokeStyle = c[1];

        const opts = { step, talking, eating, treeEat, sleeping: d.sleeping, c, baby: d.baby };
        if (d.species === "trex") drawTrex(opts);
        else if (d.species === "tri") drawTri(opts);
        else if (d.species === "brachio") drawBrachio(opts);
        else if (d.species === "stego") drawStego(opts);
        else drawRaptor(opts);

        ctx.restore();
    }

    // Mắt dùng chung: mở / chớp / nhắm khi ngủ
    function eye(x, y, r, sleeping, dark) {
        if (sleeping) {
            ctx.strokeStyle = dark;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(x, y - 1, r * 0.8, 0.15 * Math.PI, 0.85 * Math.PI);
            ctx.stroke();
            return;
        }
        const blink = Math.sin(time * 1.7 + x) > 0.985 ? 0.15 : 1;
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = dark;
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * blink, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#1e3a24";
        ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + r * 0.1, r * 0.5, r * 0.5 * blink, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.2, r * 0.18, 0, Math.PI * 2); ctx.fill();
    }

    function cheek(x, y) {
        ctx.fillStyle = "rgba(255,150,140,0.7)";
        ctx.beginPath(); ctx.ellipse(x, y, 4.5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    }

    function leg4(x, top, len, w, angle, color, dark) {
        ctx.save();
        ctx.translate(x, top);
        ctx.rotate(angle);
        ctx.fillStyle = color;
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2.5;
        roundRect(-w / 2, 0, w, len, w * 0.4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // ----- T-Rex -----
    function drawTrex({ step, talking, eating, sleeping, c }) {
        const [green, dark, belly] = c;
        ctx.translate(-60, -100);

        ctx.save();
        ctx.translate(46, 68);
        ctx.rotate(Math.sin(time * 3) * 0.08);
        ctx.translate(-46, -68);
        ctx.fillStyle = green;
        ctx.beginPath();
        ctx.moveTo(46, 60); ctx.bezierCurveTo(30, 54, 15, 58, 3, 71); ctx.bezierCurveTo(18, 70, 31, 72, 48, 77);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();

        const leg = (hx, hy, angle, footX) => {
            ctx.save();
            ctx.translate(hx, hy);
            ctx.rotate(angle);
            ctx.fillStyle = green;
            ctx.beginPath();
            ctx.moveTo(-5, 0); ctx.lineTo(-8, 21); ctx.quadraticCurveTo(-8, 25, -3, 25);
            ctx.lineTo(footX, 25); ctx.lineTo(footX - 2, 20); ctx.lineTo(4, 20); ctx.lineTo(5, 0);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.restore();
        };
        leg(50, 76, sleeping ? 1.2 : step * 0.35, 9);

        ctx.fillStyle = "#ffb627";
        ctx.beginPath();
        ctx.moveTo(30, 58); ctx.lineTo(33, 51); ctx.lineTo(37, 56);
        ctx.moveTo(38, 54); ctx.lineTo(42, 46); ctx.lineTo(46, 52);
        ctx.moveTo(47, 50); ctx.lineTo(51, 42); ctx.lineTo(55, 48);
        ctx.fill();

        ctx.fillStyle = green;
        ctx.beginPath(); ctx.ellipse(56, 66, 23, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = belly;
        ctx.beginPath(); ctx.ellipse(61, 70, 13, 10, 0, 0, Math.PI * 2); ctx.fill();

        if (!sleeping) leg(64, 78, -step * 0.35, 13);

        ctx.fillStyle = green;
        ctx.beginPath();
        ctx.moveTo(58, 54); ctx.quadraticCurveTo(60, 40, 72, 35); ctx.lineTo(81, 49); ctx.quadraticCurveTo(72, 53, 69, 62);
        ctx.closePath(); ctx.fill();

        if (season() === "winter") {
            ctx.fillStyle = "#e5383b";
            ctx.beginPath(); ctx.moveTo(60, 50); ctx.lineTo(78, 44); ctx.lineTo(82, 52); ctx.lineTo(64, 58); ctx.closePath(); ctx.fill();
            ctx.save(); ctx.translate(64, 54); ctx.rotate(0.4 + Math.sin(time * 4) * 0.25); ctx.fillRect(-20, -3, 22, 7); ctx.restore();
        }

        ctx.save();
        ctx.translate(72, 46);
        ctx.rotate(talking ? -0.14 : eating ? 0.3 + Math.sin(time * 10) * 0.05 : sleeping ? 0.12 : Math.sin(time * 2) * 0.03);
        ctx.translate(-72, -46);
        const open = talking || (eating && Math.sin(time * 10) > 0);
        if (open) {
            ctx.fillStyle = "#b8324a";
            ctx.beginPath(); ctx.moveTo(73, 44); ctx.lineTo(113, 44); ctx.lineTo(113, 58); ctx.lineTo(75, 56); ctx.closePath(); ctx.fill();
        }
        ctx.save();
        ctx.translate(75, 47);
        ctx.rotate(open ? 0.36 : 0);
        ctx.translate(-75, -47);
        ctx.fillStyle = green;
        roundRect(73, 44, 45, 10, 5); ctx.fill(); ctx.stroke();
        ctx.restore();

        ctx.fillStyle = green;
        roundRect(66, 14, 55, 32, 14); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.lineWidth = 1;
        [82, 92, 102].forEach((tx) => {
            ctx.beginPath(); ctx.moveTo(tx, 45.5); ctx.lineTo(tx + 2.5, 49.5); ctx.lineTo(tx + 5, 45.5); ctx.closePath(); ctx.fill(); ctx.stroke();
        });
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.arc(115, 22, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(63,166,79,0.9)";
        ctx.beginPath(); ctx.arc(77, 21, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(84, 17.5, 1.8, 0, Math.PI * 2); ctx.fill();
        cheek(106, 37);
        eye(96, 26, 6.2, sleeping, dark);
        ctx.restore();

        ctx.save();
        ctx.translate(69, 62);
        ctx.rotate(Math.sin(time * (talking ? 14 : 6)) * 0.35);
        ctx.strokeStyle = dark;
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(9, 1, 11, 8); ctx.stroke();
        ctx.restore();
    }

    // ----- Triceratops: diềm cổ + 3 sừng -----
    function drawTri({ step, talking, eating, sleeping, c }) {
        const [body, dark, light] = c;
        const legA = sleeping ? 0 : step * 0.3;
        if (!sleeping) {
            leg4(-12, -26, 25, 11, -legA, dark, dark);
            leg4(28, -26, 25, 11, legA, dark, dark);
        }
        // Đuôi
        ctx.fillStyle = body;
        ctx.save();
        ctx.translate(-36, -38);
        ctx.rotate(Math.sin(time * 3) * 0.1);
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-30, 8); ctx.lineTo(0, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        if (!sleeping) {
            leg4(-24, -26, 26, 13, legA, body, dark);
            leg4(16, -26, 26, 13, -legA, body, dark);
        }
        // Thân
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.ellipse(0, -40, 42, 23, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = light;
        ctx.beginPath(); ctx.ellipse(4, -30, 28, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = dark;
        [[-18, -52, 3], [-4, -56, 2.5], [10, -54, 3]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); });

        // Đầu (cúi xuống khi ăn)
        ctx.save();
        ctx.translate(36, -44);
        ctx.rotate(eating ? 0.45 + Math.sin(time * 9) * 0.06 : talking ? -0.2 : Math.sin(time * 2) * 0.04);
        // Diềm cổ
        ctx.fillStyle = light;
        ctx.beginPath(); ctx.arc(0, -8, 23, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = body;
        for (let k = 0; k < 7; k++) {
            const a = -Math.PI * 0.95 + k * 0.32;
            ctx.beginPath(); ctx.arc(Math.cos(a) * 19, -8 + Math.sin(a) * 19, 3, 0, Math.PI * 2); ctx.fill();
        }
        // Mặt
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.ellipse(14, 4, 19, 13, 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Sừng
        ctx.fillStyle = "#fff3d6";
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(32, -26); ctx.lineTo(17, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(4, -7); ctx.lineTo(22, -29); ctx.lineTo(10, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(27, 0); ctx.lineTo(36, -10); ctx.lineTo(32, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
        // Mỏ
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.moveTo(30, 4); ctx.lineTo(38, 9); ctx.lineTo(29, (talking ? 16 : 12)); ctx.closePath(); ctx.fill();
        eye(16, -1, 4.6, sleeping, dark);
        cheek(22, 9);
        ctx.restore();
    }

    // ----- Brachiosaurus: cổ dài lắc lư -----
    function drawBrachio({ step, talking, eating, treeEat, sleeping, c }) {
        const [body, dark, light] = c;
        const legA = sleeping ? 0 : step * 0.22;
        if (!sleeping) {
            leg4(-20, -40, 40, 14, -legA, dark, dark);
            leg4(30, -50, 50, 14, legA, dark, dark);
        }
        // Đuôi dài
        ctx.fillStyle = body;
        ctx.save();
        ctx.translate(-40, -54);
        ctx.rotate(Math.sin(time * 2) * 0.08);
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(-40, -6, -68, 18); ctx.quadraticCurveTo(-36, 6, 0, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        if (!sleeping) {
            leg4(-30, -40, 40, 16, legA, body, dark);
            leg4(20, -50, 50, 16, -legA, body, dark);
        }
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.ellipse(0, -60, 48, 28, -0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = light;
        ctx.beginPath(); ctx.ellipse(6, -46, 30, 10, -0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = dark;
        [[-20, -72, 4], [-2, -78, 3], [14, -74, 3.5], [-30, -60, 2.5]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); });

        // Cổ: thẳng lên, cúi xuống khi ăn / ngủ
        const down = treeEat ? 0 : eating ? 1 : sleeping ? 0.8 : 0;
        const sway = treeEat ? Math.sin(time * 8) * 2 : Math.sin(time * 1.2) * 6;
        const hx = 66 + sway * (1 - down) + down * 30;
        const hy = -166 * (1 - down) + down * -36 + (treeEat ? -8 + Math.sin(time * 9) * 3 : 0);
        ctx.strokeStyle = body;
        ctx.lineWidth = 18;
        ctx.beginPath(); ctx.moveTo(30, -70); ctx.quadraticCurveTo(44 + down * 30, -120 + down * 70, hx, hy); ctx.stroke();
        ctx.strokeStyle = dark;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(38, -66); ctx.quadraticCurveTo(52 + down * 30, -116 + down * 70, hx + 8, hy + 2); ctx.stroke();
        // Đầu
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.ellipse(hx + 6, hy, 15, 10, 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(hx + 2, hy - 8, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (talking) ctx.ellipse(hx + 16, hy + 4, 4, 3, 0, 0, Math.PI * 2);
        else ctx.arc(hx + 14, hy + 2, 5, 0.1 * Math.PI, 0.7 * Math.PI);
        ctx.stroke();
        eye(hx + 6, hy - 3, 4, sleeping, dark);
        cheek(hx + 12, hy + 5);
    }

    // ----- Stegosaurus: phiến lưng + gai đuôi -----
    function drawStego({ step, talking, eating, sleeping, c }) {
        const [body, dark, light] = c;
        const legA = sleeping ? 0 : step * 0.3;
        if (!sleeping) {
            leg4(-20, -28, 28, 13, -legA, dark, dark);
            leg4(26, -24, 24, 11, legA, dark, dark);
        }
        // Đuôi + gai
        ctx.save();
        ctx.translate(-38, -36);
        ctx.rotate(Math.sin(time * 3) * 0.12);
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(-30, -10, -46, -2); ctx.quadraticCurveTo(-26, 6, 0, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#fff3d6";
        ctx.lineWidth = 3.5;
        [[-36, -6, -44, -20], [-42, -4, -54, -14], [-36, 2, -46, 12], [-42, 0, -56, 6]].forEach(([a, b, x, y]) => {
            ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(x, y); ctx.stroke();
        });
        ctx.restore();
        if (!sleeping) {
            leg4(-30, -28, 28, 15, legA, body, dark);
            leg4(16, -24, 24, 12, -legA, body, dark);
        }
        // Phiến lưng
        for (let k = 0; k < 7; k++) {
            const x = -32 + k * 11;
            const top = -38 - Math.sqrt(Math.max(0, 1 - (x / 44) ** 2)) * 26;
            const h = 14 + (3 - Math.abs(k - 3)) * 4;
            ctx.fillStyle = k % 2 ? "#e76f51" : "#f4a261";
            ctx.strokeStyle = "#b44a33";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - 6, top + 6); ctx.lineTo(x - 5, top - h * 0.6); ctx.lineTo(x, top - h); ctx.lineTo(x + 5, top - h * 0.6); ctx.lineTo(x + 6, top + 6);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.strokeStyle = dark;
        ctx.lineWidth = 3;
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.ellipse(0, -38, 44, 24, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = light;
        ctx.beginPath(); ctx.ellipse(4, -27, 28, 9, 0, 0, Math.PI * 2); ctx.fill();
        // Cổ + đầu nhỏ
        ctx.save();
        ctx.translate(38, -34);
        ctx.rotate(eating ? 0.5 + Math.sin(time * 9) * 0.06 : talking ? -0.25 : Math.sin(time * 2.4) * 0.05);
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.ellipse(8, 2, 12, 7, 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(17, 8, 12, 8, 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (talking) ctx.ellipse(26, 11, 3, 2.5, 0, 0, Math.PI * 2);
        else ctx.arc(24, 9, 4, 0.1 * Math.PI, 0.7 * Math.PI);
        ctx.stroke();
        eye(18, 5, 3.6, sleeping, dark);
        cheek(23, 12);
        ctx.restore();
    }

    // ----- Raptor: nhanh, sọc lưng, móng cong -----
    function drawRaptor({ step, talking, eating, sleeping, c }) {
        const [body, dark, light] = c;
        const leg = (hipX, angle, color) => {
            ctx.save();
            ctx.translate(hipX, -32);
            ctx.rotate(angle);
            ctx.strokeStyle = color;
            ctx.lineWidth = 7;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6, 14); ctx.lineTo(-2, 26); ctx.lineTo(10, 30); ctx.stroke();
            ctx.strokeStyle = "#f1e3c8";
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(2, 25, 4, Math.PI, 1.6 * Math.PI); ctx.stroke();
            ctx.restore();
        };
        const legA = sleeping ? 0.9 : step * 0.6;
        leg(-2, -legA, dark);
        // Đuôi thẳng, cứng
        ctx.fillStyle = body;
        ctx.save();
        ctx.translate(-14, -38);
        ctx.rotate(Math.sin(time * 4) * 0.06);
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-52, -6); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        // Thân
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.ellipse(0, -38, 22, 12, -0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = light;
        ctx.beginPath(); ctx.ellipse(4, -32, 13, 5, -0.15, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2.5;
        [[-12, -48], [-4, -50], [4, -50]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 7); ctx.stroke(); });
        if (!sleeping) leg(4, legA, body);
        // Tay nhỏ có móng
        ctx.strokeStyle = dark;
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(14, -36); ctx.lineTo(22, -28 + Math.sin(time * 8) * 2); ctx.lineTo(25, -31); ctx.stroke();
        // Cổ + đầu
        ctx.save();
        ctx.translate(16, -44);
        ctx.rotate(eating ? 0.6 + Math.sin(time * 10) * 0.08 : talking ? -0.2 : Math.sin(time * 3) * 0.05);
        ctx.fillStyle = body;
        ctx.strokeStyle = dark;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(6, -12); ctx.lineTo(14, -6); ctx.lineTo(4, 8); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.ellipse(16, -14, 14, 7, 0.05, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (talking) {
            ctx.fillStyle = "#b8324a";
            ctx.beginPath(); ctx.moveTo(18, -10); ctx.lineTo(32, -10); ctx.lineTo(22, -2); ctx.closePath(); ctx.fill();
        }
        // Lông mào
        ctx.strokeStyle = "#ff9f1c";
        ctx.lineWidth = 2.5;
        [[4, -18, -2, -28], [8, -20, 4, -31], [12, -21, 11, -31]].forEach(([a, b, x, y]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(x, y); ctx.stroke(); });
        // Lông mày tinh nghịch
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(13, -21); ctx.lineTo(22, -19); ctx.stroke();
        eye(18, -15, 3.6, sleeping, dark);
        ctx.restore();
    }

    // =========================================================
    // THẰN LẰN BAY: bay thường trực, bấm để nhào lộn, kéo để bắt,
    // thỉnh thoảng sà xuống quắp khủng long con bay một vòng
    // =========================================================
    const FLYER_TYPES = {
        ptera:   { body: "#c8743f", wing: "#f0a868", far: "#e9b384", edge: "#a95c2c", crest: "#ffb627", size: 1,    sound: "Kíaaa!",     tail: false },
        quetz:   { body: "#3d8bb5", wing: "#7cc4e4", far: "#a5d8ee", edge: "#24617f", crest: "#ff6b6b", size: 1.35, sound: "Quác quác!", tail: false },
        rhampho: { body: "#8e6bbf", wing: "#c3a6ee", far: "#d6c4f5", edge: "#5e3f8f", crest: "#ffd166", size: 0.8,  sound: "Chiu chiu!", tail: true }
    };
    const FLYER_LIST = Object.keys(FLYER_TYPES);
    const MAX_FLYERS = 10;

    let flyers = [];
    let heldFlyer = null;
    let swoopTimer = 12;

    function flyerLane() {
        // Bay ở dải trời phía trên hoặc ngay trên đồi (chỗ ít bị giao diện che)
        return (Math.random() < 0.8 ? rand(0.035, 0.12) : rand(0.68, 0.78)) * H;
    }

    function makeFlyer(type, x) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        const y = flyerLane();
        return {
            type, dir,
            x: x ?? (dir > 0 ? rand(-100, W * 0.8) : rand(W * 0.2, W + 100)),
            y, baseY: y,
            v: rand(45, 75) / FLYER_TYPES[type].size,
            phase: rand(0, 6), t: rand(0, 6), flapClock: rand(0, 3),
            flap: 0, angle: 0, mode: "cruise", loopT: 0,
            bubble: null, carrying: null, target: null, carryT: 0
        };
    }

    function initFlyers() {
        flyers = ["ptera", "quetz", "rhampho", "ptera", "rhampho"].map((t) => makeFlyer(t));
        heldFlyer = null;
    }

    function addFlyer() {
        if (flyers.length >= MAX_FLYERS) flyers.shift();
        const f = makeFlyer(FLYER_LIST[Math.floor(Math.random() * FLYER_LIST.length)]);
        f.x = f.dir > 0 ? -80 : W + 80;
        flyers.push(f);
        flyerSay(f, FLYER_TYPES[f.type].sound);
    }

    const flyerScale = (f) => sceneScale() * 1.1 * FLYER_TYPES[f.type].size;

    function flyerSay(f, text, sound = true) {
        f.bubble = { text, t: 1.6 };
        if (sound) play(f.type === "quetz" ? "tri" : "raptor");
    }

    function flyerAt(px, py) {
        for (let i = flyers.length - 1; i >= 0; i--) {
            const f = flyers[i];
            const s = flyerScale(f);
            if (Math.abs(px - f.x) < 48 * s && py > f.y - 42 * s && py < f.y + 18 * s) return f;
        }
        return null;
    }

    function dropCarried(f) {
        const b = f.carrying;
        if (!b) return;
        b.carriedBy = null;
        b.vx = f.dir * f.v * 0.8;
        b.vy = 0;
        b.air = Math.max(b.air, 0.1);
        say(b, "Wiii!", false);
        f.carrying = null;
        f.mode = "cruise";
    }

    function updateFlyers(dt, n) {
        // Lâu lâu sà xuống quắp một bé khủng long (ban ngày)
        swoopTimer -= dt;
        if (swoopTimer <= 0) {
            swoopTimer = rand(18, 30);
            const babies = dinos.filter((d) => d.baby && !d.carriedBy && d !== held && d.air === 0);
            const free = flyers.filter((f) => f.mode === "cruise" && f.type !== "rhampho");
            if (n < 0.5 && babies.length && free.length) {
                const f = free[Math.floor(Math.random() * free.length)];
                f.mode = "swoop";
                f.target = babies[Math.floor(Math.random() * babies.length)];
                flyerSay(f, "Lên nào bé ơi!", false);
            } else {
                swoopTimer = rand(8, 14);
            }
        }

        for (const f of flyers) {
            f.t += dt;
            if (f.bubble) {
                f.bubble.t -= dt;
                if (f.bubble.t <= 0) f.bubble = null;
            }
            const s = flyerScale(f);

            if (f.mode === "held") {
                f.flap = Math.sin(f.t * 22);
                f.angle = Math.sin(f.t * 8) * 0.15;
                continue;
            }

            if (f.mode === "loop") {
                // Nhào lộn một vòng tròn
                f.loopT += dt;
                const k = Math.min(1, f.loopT / 1.1);
                f.x = f.loopX + f.dir * (Math.sin(k * Math.PI * 2) * 45 + k * 70);
                f.y = f.loopY - (1 - Math.cos(k * Math.PI * 2)) * 45;
                f.angle = -k * Math.PI * 2;
                f.flap = Math.sin(f.t * 12);
                if (k >= 1) {
                    f.mode = "cruise";
                    f.angle = 0;
                    f.baseY = f.y;
                    f.phase = 0;
                }
                continue;
            }

            if (f.mode === "swoop") {
                const b = f.target;
                if (!b || b.carriedBy || b === held || !dinos.includes(b)) {
                    f.mode = "cruise";
                    continue;
                }
                const tx = b.x;
                const ty = feetY(b) - 34 * s;
                const dx = tx - f.x;
                const dy = ty - f.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 16) {
                    f.mode = "carry";
                    f.carrying = b;
                    f.carryT = 0;
                    b.carriedBy = f;
                    b.state = "walk";
                    say(b, "Wiii!", false);
                    play("baby");
                } else {
                    const sp = 280;
                    f.x += (dx / dist) * sp * dt;
                    f.y += (dy / dist) * sp * dt;
                    if (Math.abs(dx) > 4) f.dir = Math.sign(dx);
                    f.angle = Math.atan2(dy, Math.abs(dx)) * 0.5;
                    f.flap = 0.9;   // khép cánh lao xuống
                }
                continue;
            }

            if (f.mode === "carry") {
                f.carryT += dt;
                f.y += (f.baseY - f.y) * Math.min(1, dt * 1.2);
                f.x += f.dir * f.v * 1.2 * dt;
                f.flap = Math.sin(f.t * 9);
                f.angle = -0.08;
                const b = f.carrying;
                if (b) {
                    b.x = f.x;
                    b.air = Math.max(0, groundY(b.x) + b.lane - (f.y + 22 * s));
                }
                if (f.carryT > 3.4 || f.x < 60 || f.x > W - 60) dropCarried(f);
                continue;
            }

            if (f.mode === "toNest") {
                const pp = perchList()[f.perch];
                if (!pp) { takeOff(f); continue; }
                const dx = pp.x - f.x;
                const dy = pp.y - f.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 6) {
                    land(f);
                    continue;
                }
                const k = Math.min(1, (150 * dt) / dist);
                f.x += dx * k;
                f.y += dy * k;
                if (Math.abs(dx) > 3) f.dir = Math.sign(dx);
                f.angle = Math.atan2(dy, Math.abs(dx) + 1) * 0.3;
                f.flap = Math.sin(f.t * 9);
                continue;
            }

            if (f.mode === "perched") {
                const pp = perchList()[f.perch];
                if (!pp) { takeOff(f); continue; }
                f.x = pp.x;
                f.y = pp.y;
                f.angle = 0;
                f.flap = -0.25;
                f.sleeping = n > 0.6;
                if (f.sleeping) continue;
                f.perchT -= dt;
                if (f.perchT <= 0) takeOff(f);
                continue;
            }

            if (f.mode === "fish") {
                if (frozen()) { takeOff(f); continue; }
                const dx = f.fishX - f.x;
                const dy = f.fishY - f.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 12) {
                    splash(f.fishX, lake().y, false);
                    play("splash");
                    f.fish = true;
                    flyerSay(f, "Bắt được cá!", false);
                    if (!goPerch(f, true)) takeOff(f);
                    continue;
                }
                const k = Math.min(1, (260 * dt) / dist);
                f.x += dx * k;
                f.y += dy * k;
                if (Math.abs(dx) > 3) f.dir = Math.sign(dx);
                f.angle = Math.atan2(dy, Math.abs(dx) + 1) * 0.5;
                f.flap = 0.9;
                continue;
            }

            // Bay lâu thì về tổ / đi bắt cá; đêm xuống thì về núi ngủ
            f.sleeping = false;
            if (f.nestTimer === undefined) f.nestTimer = rand(8, 20);
            f.nestTimer -= dt;
            if (n > 0.6 && goPerch(f, false)) continue;
            if (f.nestTimer <= 0 && n < 0.6) {
                f.nestTimer = rand(18, 32);
                if (!frozen() && Math.random() < 0.5) startFishing(f);
                else goPerch(f, true);
                continue;
            }

            // Bay lượn bình thường: vỗ cánh rồi liệng
            f.phase += dt;
            f.flapClock += dt;
            f.x += f.dir * f.v * dt;
            f.y = f.baseY + Math.sin(f.phase * 0.9) * 18;
            f.angle = Math.cos(f.phase * 0.9) * 0.12;
            const flapping = (f.flapClock % 3.6) < 1.6;
            f.flap = flapping ? Math.sin(f.t * 7) : 0.35 + Math.sin(f.t * 1.5) * 0.05;

            if (f.dir > 0 && f.x > W + 120) {
                f.x = -120;
                f.baseY = flyerLane();
            } else if (f.dir < 0 && f.x < -120) {
                f.x = W + 120;
                f.baseY = flyerLane();
            }
        }
    }

    function drawFlyers(n) {
        for (const f of flyers) {
            const ty = FLYER_TYPES[f.type];
            const s = flyerScale(f);
            const night = (c) => rgb(mix(hex(c), NIGHT_HILL, n * 0.45));
            const talking = !!f.bubble;

            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.rotate(f.angle * f.dir);
            ctx.scale(s * f.dir, s);
            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            flyerWing(-f.flap * 0.8, night(ty.far), night(ty.edge));

            // Đuôi dài có chóp hình thoi (Rhamphorhynchus)
            if (ty.tail) {
                ctx.strokeStyle = night(ty.body);
                ctx.lineWidth = 2;
                const wag = Math.sin(f.t * 4) * 4;
                ctx.beginPath();
                ctx.moveTo(-12, 1);
                ctx.quadraticCurveTo(-26, 4 + wag, -40, wag);
                ctx.stroke();
                ctx.fillStyle = night(ty.crest);
                ctx.beginPath();
                ctx.moveTo(-40, wag - 5); ctx.lineTo(-46, wag); ctx.lineTo(-40, wag + 5); ctx.lineTo(-35, wag);
                ctx.closePath();
                ctx.fill();
            }

            // Thân + chân (thả chân khi quắp)
            ctx.fillStyle = night(ty.body);
            ctx.beginPath();
            ctx.ellipse(0, 0, 14, 5.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = night(ty.edge);
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (f.mode === "carry" || f.mode === "swoop" || f.mode === "perched") {
                ctx.moveTo(-2, 4); ctx.lineTo(0, 18);
                ctx.moveTo(4, 4); ctx.lineTo(6, 18);
            } else {
                ctx.moveTo(-10, 3); ctx.lineTo(-19, 7);
                ctx.moveTo(-8, 4); ctx.lineTo(-16, 9);
            }
            ctx.stroke();

            // Cổ, mào, đầu, mỏ (há khi kêu)
            ctx.fillStyle = night(ty.body);
            ctx.beginPath();
            ctx.moveTo(10, -3); ctx.quadraticCurveTo(15, -6, 18, -6); ctx.lineTo(17, -2);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = night(ty.crest);
            ctx.beginPath();
            ctx.moveTo(18, -8); ctx.lineTo(2, -16); ctx.lineTo(19, -4);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = night(ty.wing);
            ctx.beginPath();
            ctx.ellipse(21, -6, 6.5, 4, -0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(25, -8); ctx.lineTo(43, -5); ctx.lineTo(25, -5);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(25, -4); ctx.lineTo(40, talking ? 4 : -2); ctx.lineTo(25, -2);
            ctx.closePath();
            ctx.fill();
            eye(22, -7, 2.6, !!f.sleeping, night(ty.edge));
            if (f.fish) {
                ctx.fillStyle = "#ff9f1c";
                ctx.beginPath(); ctx.ellipse(44, -2, 6, 3, 0.3, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.moveTo(38, -4); ctx.lineTo(34, -8); ctx.lineTo(35, -1); ctx.fill();
            }

            flyerWing(f.flap, night(ty.wing), night(ty.edge));
            ctx.restore();

            if (f.sleeping && !f.bubble) {
                ctx.fillStyle = "rgba(255,255,255,0.9)";
                ctx.textAlign = "center";
                for (let k = 0; k < 2; k++) {
                    const t = (time * 0.6 + k / 2 + f.phase) % 1;
                    ctx.globalAlpha = 1 - t;
                    ctx.font = `800 ${12 + k * 3}px "Baloo 2", sans-serif`;
                    ctx.fillText("z", f.x + f.dir * (14 + t * 16), f.y - 16 - t * 26);
                }
                ctx.globalAlpha = 1;
            }
            if (f.bubble) {
                const fs = 16;
                ctx.font = `800 ${fs}px "Baloo 2", "Segoe UI", sans-serif`;
                ctx.textAlign = "center";
                const w = ctx.measureText(f.bubble.text).width + 22;
                const pop = Math.min(1, (1.6 - f.bubble.t) * 6);
                ctx.save();
                ctx.translate(f.x + f.dir * 30 * s, f.y - 34 * s);
                ctx.scale(pop, pop);
                ctx.globalAlpha = Math.min(1, f.bubble.t * 3);
                ctx.fillStyle = "#ffffff";
                ctx.strokeStyle = ty.edge;
                ctx.lineWidth = 2.5;
                roundRect(-w / 2, -fs - 4, w, fs + 14, 13);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = ty.edge;
                ctx.fillText(f.bubble.text, 0, 2);
                ctx.restore();
                ctx.globalAlpha = 1;
            }
        }
    }

    function flyerWing(flap, color, edge) {
        const tipY = -40 * flap;
        ctx.fillStyle = color;
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(8, -1);
        ctx.quadraticCurveTo(13, tipY * 0.55, 5, tipY);
        ctx.quadraticCurveTo(-4, tipY * 0.45, -15, 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(6, -1);
        ctx.lineTo(4, tipY * 0.9);
        ctx.stroke();
    }

    // =========================================================
    // THẾ GIỚI: dãy núi, hồ nước, cây to, bụi cây
    // Khủng long uống nước, lội hồ, ăn lá; bấm cây rụng quả,
    // bấm hồ cá nhảy, bấm núi nghe tiếng vọng
    // =========================================================
    const FAR_PEAKS = [[-0.05, 0.62], [0.08, 0.47], [0.2, 0.58], [0.33, 0.41], [0.47, 0.56], [0.58, 0.46], [0.75, 0.39], [0.9, 0.55], [1.05, 0.44]];
    const NEAR_PEAKS = [[-0.05, 0.7], [0.12, 0.6], [0.26, 0.68], [0.4, 0.57], [0.55, 0.7], [0.7, 0.6], [0.85, 0.67], [1.0, 0.57], [1.1, 0.66]];
    const NEAR_COLORS = { spring: "#8cc79a", summer: "#72ad80", autumn: "#b59a6a", winter: "#c9d6e6" };

    const BIG_TREES = [
        { f: 0.09, kind: "broad" }, { f: 0.27, kind: "palm" },
        { f: 0.68, kind: "broad" }, { f: 0.86, kind: "broad" }
    ].map((t) => ({ ...t, shake: 0, fruit: 4, regrow: 0 }));
    const BUSHES = [0.18, 0.36, 0.55, 0.77, 0.95];

    let ripples = [];
    let fishes = [];
    let fallingFruit = [];
    let echoes = [];
    let lastSound = "Gràooo!";

    const frozen = () => season() === "winter";
    const S = () => sceneScale();

    function lake() {
        const x = W * 0.45;
        const rx = Math.min(W * 0.13, 230);
        return { x, y: groundY(x) + 12, rx, ry: 24 };
    }

    function inLake(x, y) {
        const L = lake();
        const dx = (x - L.x) / L.rx;
        if (y === undefined) return Math.abs(dx) < 0.92;
        const dy = (y - L.y) / (L.ry + 8);
        return dx * dx + dy * dy <= 1;
    }

    function ridgeY(peaks, x) {
        const fx = x / W;
        for (let i = 0; i < peaks.length - 1; i++) {
            const [x0, y0] = peaks[i];
            const [x1, y1] = peaks[i + 1];
            if (fx >= x0 && fx <= x1) return H * (y0 + ((fx - x0) / (x1 - x0)) * (y1 - y0));
        }
        return H * 0.7;
    }

    function treeTop(t) {
        const x = W * t.f;
        const s = S();
        return { x, ground: groundY(x) + 2, cy: groundY(x) + 2 - 150 * s, r: 42 * s };
    }

    function splash(x, y, big = false) {
        const n = big ? 18 : 5;
        for (let i = 0; i < n; i++) {
            bursts.push({
                x: x + rand(-8, 8), y,
                vx: rand(-90, 90) * (big ? 1.4 : 0.7), vy: rand(-260, -120) * (big ? 1.2 : 0.7),
                life: 0, max: rand(0.6, 1), size: rand(2.5, 4.5), color: "#bfe9ff", kind: "drop"
            });
        }
        ripples.push({ x, y, r: 4, life: 0, max: big ? 1.6 : 1.1 });
        if (big) ripples.push({ x, y, r: 0, life: -0.25, max: 1.6 });
    }

    // ---------- Cập nhật ----------
    function updateWorld(dt) {
        const n = nightness(phase);
        updateCrocs(dt, n);
        updateNest(dt, n);
        for (const t of BIG_TREES) {
            t.shake = Math.max(0, t.shake - dt * 1.4);
            t.regrow += dt;
            if (t.regrow > 8 && t.fruit < 5) {
                t.fruit++;
                t.regrow = 0;
            }
        }
        ripples.forEach((r) => { r.life += dt; if (r.life > 0) r.r += 34 * dt; });
        ripples = ripples.filter((r) => r.life < r.max);

        for (const f of fishes) {
            f.t += dt;
            if (f.t > 0.9 && !f.done) {
                f.done = true;
                splash(f.x0 + f.dir * 54, lake().y, false);
                crocSnack(f.x0 + f.dir * 54);
            }
        }
        fishes = fishes.filter((f) => !f.done);

        for (const fr of fallingFruit) {
            fr.vy += 900 * dt;
            fr.y += fr.vy * dt;
            const gy = groundY(fr.x) + 8;
            if (fr.y >= gy) {
                fr.done = true;
                foods.push({ x: fr.x, type: "leaf", fruit: true, left: 1 });
                dinos.forEach((d) => { if (SPECIES[d.species].diet === "leaf") d.awake = 6; });
            }
        }
        fallingFruit = fallingFruit.filter((f) => !f.done);

        echoes.forEach((e) => { e.t += dt; });
        echoes = echoes.filter((e) => e.t < e.delay + 1.6);
    }

    // ---------- Bấm vào cảnh ----------
    function treeAt(px, py) {
        for (const t of BIG_TREES) {
            const tt = treeTop(t);
            const inCanopy = Math.hypot(px - tt.x, py - tt.cy) < tt.r * 1.3;
            const inTrunk = Math.abs(px - tt.x) < 12 * S() && py > tt.cy && py < tt.ground;
            if (inCanopy || inTrunk) return t;
        }
        return null;
    }

    function worldAt(px, py) {
        if (nestAt(px, py) || crocAt(px, py)) return "creature";
        if (inLake(px, py)) return "lake";
        if (treeAt(px, py)) return "tree";
        return null;
    }

    function clickWorld(px, py) {
        if (nestAt(px, py)) {
            clickNest();
            return true;
        }
        const croc = crocAt(px, py);
        if (croc) {
            clickCroc(croc);
            return true;
        }
        if (inLake(px, py)) {
            const L = lake();
            if (frozen()) {
                ripples.push({ x: px, y: py, r: 2, life: 0, max: 0.9, ice: true });
                echoes.push({ text: "Cốc cốc! Đóng băng rồi", x: px, y: py - 20, t: 0, delay: 0, size: 16 });
                play("pop");
            } else {
                const dir = Math.random() < 0.5 ? 1 : -1;
                const x0 = Math.max(L.x - L.rx * 0.6, Math.min(L.x + L.rx * 0.6 - 54 * dir, px));
                fishes.push({ x0, dir, t: 0, color: ["#ff9f1c", "#ff6b6b", "#ffd166"][Math.floor(rand(0, 3))] });
                splash(px, L.y, false);
                play("splash");
            }
            return true;
        }

        const t = treeAt(px, py);
        if (t) {
            const tt = treeTop(t);
            t.shake = 1;
            play("pop");
            if (frozen()) {
                for (let i = 0; i < 14; i++) {
                    bursts.push({ x: tt.x + rand(-tt.r, tt.r), y: tt.cy + rand(-tt.r * 0.5, 0), vx: rand(-30, 30), vy: rand(-20, 30), life: 0, max: 1.2, size: rand(2, 4), color: "#ffffff", kind: "dust" });
                }
            } else {
                const drop = Math.min(3, t.fruit);
                for (let i = 0; i < drop; i++) {
                    fallingFruit.push({ x: tt.x + rand(-tt.r * 0.8, tt.r * 0.8), y: tt.cy + rand(-10, 15), vy: rand(-60, 0), color: season() === "autumn" ? "#e85d04" : "#ff4d6d" });
                }
                t.fruit -= drop;
                leafFall(tt, 8);
            }
            return true;
        }

        const nearTop = ridgeY(NEAR_PEAKS, px);
        const farTop = ridgeY(FAR_PEAKS, px);
        if (py > Math.min(nearTop, farTop) && py < hillY(0, px) - 10) {
            // Tiếng vọng + đá lăn
            const base = lastSound.replace(/[!~.]+$/, "");
            [0, 0.45, 0.9].forEach((delay, i) => {
                echoes.push({
                    text: i === 0 ? lastSound : base.slice(-3) + "…".repeat(i),
                    x: Math.max(90, Math.min(W - 90, px + (i % 2 ? -1 : 1) * i * 60)), y: py - 30 - i * 10,
                    t: 0, delay, size: 22 - i * 5
                });
            });
            for (let i = 0; i < 6; i++) {
                bursts.push({ x: px + rand(-10, 10), y: py, vx: rand(-80, 80), vy: rand(-120, -40), life: 0, max: 1.1, size: rand(3, 6), color: "#8a7a6a", kind: "rock" });
            }
            play(dinos.find((d) => !d.baby)?.species || "trex");
            return true;
        }
        return false;
    }

    function leafFall(tt, count) {
        const color = { spring: "#7bd36a", summer: "#3fae4f", autumn: "#e0892e", winter: "#ffffff" }[season()];
        for (let i = 0; i < count; i++) {
            bursts.push({ x: tt.x + rand(-tt.r, tt.r), y: tt.cy + rand(-tt.r * 0.5, tt.r * 0.3), vx: rand(-40, 40), vy: rand(-30, 20), life: 0, max: rand(1, 1.6), size: rand(3, 5), color, kind: "leaf" });
        }
    }

    // ---------- Vẽ: núi ----------
    function drawRange(peaks, color, capK, haze) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, H);
        peaks.forEach(([fx, fy]) => ctx.lineTo(fx * W, fy * H));
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();

        // Mũ tuyết trên các đỉnh
        if (capK > 0) {
            ctx.fillStyle = "rgba(255,255,255,0.92)";
            for (let i = 1; i < peaks.length - 1; i++) {
                const [px, py] = peaks[i];
                const [lx, ly] = peaks[i - 1];
                const [rx, ry] = peaks[i + 1];
                if (py > ly || py > ry) continue;
                const k = capK;
                const ax = (px + (lx - px) * k) * W, ay = (py + (ly - py) * k) * H;
                const bx = (px + (rx - px) * k) * W, by = (py + (ry - py) * k) * H;
                ctx.beginPath();
                ctx.moveTo(px * W, py * H);
                ctx.lineTo(bx, by);
                ctx.lineTo((ax + bx) / 2 + 10, Math.max(ay, by) - 6);
                ctx.lineTo((ax + bx) / 2, Math.max(ay, by) + 4);
                ctx.lineTo((ax + bx) / 2 - 10, Math.max(ay, by) - 4);
                ctx.lineTo(ax, ay);
                ctx.closePath();
                ctx.fill();
            }
        }
        if (haze) {
            const top = Math.min(...peaks.map((p) => p[1])) * H;
            const g = ctx.createLinearGradient(0, top, 0, H * 0.85);
            g.addColorStop(0, "rgba(255,255,255,0)");
            g.addColorStop(1, `rgba(255,255,255,${haze})`);
            ctx.fillStyle = g;
            ctx.fillRect(0, top, W, H * 0.85 - top);
        }
    }

    function drawMountains(n) {
        const far = rgb(mix(hex("#9fb3e0"), NIGHT_HILL, n * 0.5));
        const near = rgb(mix(hex(NEAR_COLORS[season()]), NIGHT_HILL, n * 0.55));
        drawRange(FAR_PEAKS, far, frozen() ? 0.45 : 0.25, 0.35 * (1 - n));
        drawRange(NEAR_PEAKS, near, frozen() ? 0.3 : 0, 0.2 * (1 - n));
    }

    // ---------- Vẽ: bụi cây (trên đồi trước) ----------
    function drawBushes(n) {
        const col = { spring: "#6fc35f", summer: "#3f9e4b", autumn: "#c97b2e", winter: "#b9cbb5" }[season()];
        const c = rgb(mix(hex(col), NIGHT_HILL, n * 0.5));
        BUSHES.forEach((f, i) => {
            const x = W * f;
            if (inLake(x)) return;
            const y = hillY(2, x) + 4;
            const s = S() * (0.8 + (i % 3) * 0.15);
            const wob = Math.sin(time * 1.5 + i) * 1.5;
            ctx.fillStyle = c;
            [[-16, -8, 13], [0, -14, 16], [16, -8, 13]].forEach(([dx, dy, r]) => {
                ctx.beginPath(); ctx.arc(x + dx * s + wob, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill();
            });
            if (frozen()) {
                ctx.fillStyle = "#ffffff";
                ctx.beginPath(); ctx.ellipse(x, y - 26 * s, 18 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
            } else if (season() !== "autumn") {
                ctx.fillStyle = season() === "spring" ? "#ffb3cf" : "#e5383b";
                [[-10, -12], [6, -20], [12, -6]].forEach(([dx, dy]) => {
                    ctx.beginPath(); ctx.arc(x + dx * s + wob, y + dy * s, 2.6 * s, 0, Math.PI * 2); ctx.fill();
                });
            }
        });
    }

    // ---------- Vẽ: cây to (khủng long đứng trước) ----------
    function drawBigTrees(n) {
        const s = S();
        const dark = (c) => rgb(mix(hex(c), NIGHT_HILL, n * 0.5));
        for (const t of BIG_TREES) {
            const tt = treeTop(t);
            const shake = Math.sin(time * 32) * 0.06 * t.shake;
            const sway = Math.sin(time * 1.1 + t.f * 10) * 0.02;

            ctx.save();
            ctx.translate(tt.x, tt.ground);
            ctx.rotate(sway + shake * 0.3);

            if (t.kind === "palm") {
                ctx.strokeStyle = dark("#8b5a3c");
                ctx.lineWidth = 12 * s;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(18 * s, -80 * s, 6 * s, -150 * s);
                ctx.stroke();
                ctx.translate(6 * s, -150 * s);
                ctx.rotate(shake * 2);
                const frond = dark(SEASON_STYLE[season()].tree);
                for (let k = 0; k < 8; k++) {
                    const a = -Math.PI / 2 + (k - 3.5) * 0.45;
                    const len = 62 * s;
                    const tipX = Math.cos(a) * len;
                    const tipY = Math.sin(a) * len + 18 * s + Math.abs(Math.cos(a)) * 22 * s;
                    ctx.fillStyle = frond;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(tipX * 0.5 - Math.sin(a) * 14 * s, tipY * 0.5 - 14 * s, tipX, tipY);
                    ctx.quadraticCurveTo(tipX * 0.5 + Math.sin(a) * 6 * s, tipY * 0.5 + 4 * s, 0, 0);
                    ctx.fill();
                    if (frozen()) {
                        ctx.fillStyle = "#ffffff";
                        ctx.beginPath(); ctx.ellipse(tipX * 0.45, tipY * 0.45 - 6 * s, 10 * s, 3 * s, a, 0, Math.PI * 2); ctx.fill();
                    }
                }
                if (!frozen()) {
                    ctx.fillStyle = dark("#8b5a3c");
                    for (let k = 0; k < t.fruit; k++) {
                        ctx.beginPath(); ctx.arc((k - 2) * 5 * s, 8 * s + (k % 2) * 4 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
                    }
                }
            } else {
                // Cây tán tròn
                ctx.fillStyle = dark("#7a4b2e");
                ctx.beginPath();
                ctx.moveTo(-9 * s, 0);
                ctx.lineTo(-5 * s, -120 * s);
                ctx.lineTo(5 * s, -120 * s);
                ctx.lineTo(9 * s, 0);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = dark("#7a4b2e");
                ctx.lineWidth = 5 * s;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(0, -95 * s); ctx.lineTo(-24 * s, -128 * s);
                ctx.moveTo(0, -105 * s); ctx.lineTo(22 * s, -136 * s);
                ctx.stroke();

                ctx.translate(0, -150 * s);
                ctx.rotate(shake);
                if (frozen()) {
                    ctx.lineWidth = 3 * s;
                    [[-1, 0.2], [1, 0.5], [-1, 0.8], [1, 1.1]].forEach(([d, k]) => {
                        ctx.beginPath(); ctx.moveTo(0, 20 * s * k); ctx.lineTo(d * 34 * s, -10 * s + 20 * s * k); ctx.stroke();
                        ctx.fillStyle = "#ffffff";
                        ctx.beginPath(); ctx.ellipse(d * 26 * s, -9 * s + 20 * s * k, 9 * s, 3 * s, d * -0.5, 0, Math.PI * 2); ctx.fill();
                    });
                } else {
                    const leaf = { spring: "#7bd36a", summer: "#3fae4f", autumn: "#e0892e" }[season()];
                    const leaf2 = { spring: "#a3e48f", summer: "#5cc96b", autumn: "#f4a261" }[season()];
                    [[0, -14, 40, leaf], [-30, 6, 30, leaf], [30, 6, 30, leaf], [-14, 20, 28, leaf2], [16, 22, 28, leaf2], [0, -30, 26, leaf2]].forEach(([dx, dy, r, c]) => {
                        ctx.fillStyle = dark(c);
                        ctx.beginPath(); ctx.arc(dx * s, dy * s, r * s, 0, Math.PI * 2); ctx.fill();
                    });
                    // Quả trên cây
                    ctx.fillStyle = dark(season() === "autumn" ? "#e85d04" : season() === "spring" ? "#ffb3cf" : "#ff4d6d");
                    [[-22, 0], [18, -14], [4, 16], [-6, -26], [28, 14]].slice(0, t.fruit).forEach(([dx, dy]) => {
                        ctx.beginPath(); ctx.arc(dx * s, dy * s, 5.5 * s, 0, Math.PI * 2); ctx.fill();
                    });
                }
            }
            ctx.restore();
        }

        // Quả đang rơi
        for (const fr of fallingFruit) {
            ctx.fillStyle = fr.color;
            ctx.beginPath(); ctx.arc(fr.x, fr.y, 5.5 * s, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#3fae4f";
            ctx.beginPath(); ctx.ellipse(fr.x + 3 * s, fr.y - 6 * s, 3 * s, 1.6 * s, -0.6, 0, Math.PI * 2); ctx.fill();
        }
    }

    // ---------- Vẽ: hồ nước ----------
    function lakePath(L, grow = 0) {
        ctx.beginPath();
        ctx.ellipse(L.x, L.y, L.rx + grow, L.ry + grow * 0.4, 0, 0, Math.PI * 2);
    }

    function drawLake(n) {
        const L = lake();
        const ice = frozen();
        // Bờ hồ
        ctx.fillStyle = rgb(mix(hex(ice ? "#e9f1fb" : "#d9c08f"), NIGHT_HILL, n * 0.5));
        lakePath(L, 7);
        ctx.fill();

        const deep = mix(hex(ice ? "#bfe1f5" : "#2f9fd6"), NIGHT_HILL, n * 0.55);
        const shallow = mix(hex(ice ? "#e6f5fd" : "#7fd3f5"), NIGHT_HILL, n * 0.5);
        const g = ctx.createRadialGradient(L.x, L.y, 4, L.x, L.y, L.rx);
        g.addColorStop(0, rgb(deep));
        g.addColorStop(1, rgb(shallow));
        ctx.fillStyle = g;
        lakePath(L);
        ctx.fill();

        ctx.save();
        lakePath(L);
        ctx.clip();

        if (ice) {
            ctx.strokeStyle = "rgba(255,255,255,0.8)";
            ctx.lineWidth = 2;
            [[-0.6, -0.2, -0.2, 0.3], [0.1, -0.4, 0.5, 0.1], [-0.3, 0.4, 0.2, 0.6]].forEach(([a, b, c, d]) => {
                ctx.beginPath(); ctx.moveTo(L.x + a * L.rx, L.y + b * L.ry); ctx.lineTo(L.x + c * L.rx, L.y + d * L.ry); ctx.stroke();
            });
        } else {
            // Ánh sáng lấp lánh trôi trên mặt nước
            ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - n * 0.5)})`;
            ctx.lineWidth = 2;
            for (let k = 0; k < 6; k++) {
                const x = L.x - L.rx + ((time * 18 + k * 53) % (L.rx * 2));
                const y = L.y - L.ry * 0.5 + (k % 3) * L.ry * 0.4;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 14, y); ctx.stroke();
            }
            // Bóng trăng ban đêm
            if (n > 0.5) {
                ctx.fillStyle = `rgba(255,244,209,${0.5 * n})`;
                ctx.beginPath(); ctx.ellipse(L.x + L.rx * 0.3, L.y, 14 + Math.sin(time * 3) * 2, 4, 0, 0, Math.PI * 2); ctx.fill();
            }
        }

        // Gợn sóng
        for (const r of ripples) {
            if (r.life < 0) continue;
            ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - r.life / r.max)})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();

        // Lá súng + hoa sen (xuân, hạ), lá rụng (thu)
        if (!ice) {
            [[-0.55, 0.1], [0.5, -0.15], [0.15, 0.4]].forEach(([fx, fy], i) => {
                const x = L.x + fx * L.rx + Math.sin(time * 0.7 + i) * 3;
                const y = L.y + fy * L.ry;
                ctx.fillStyle = rgb(mix(hex(season() === "autumn" ? "#d9a557" : "#4caf50"), NIGHT_HILL, n * 0.5));
                ctx.beginPath(); ctx.ellipse(x, y, 11, 4.5, 0, 0.25, Math.PI * 2 - 0.25); ctx.lineTo(x, y); ctx.fill();
                if ((season() === "spring" || season() === "summer") && i !== 1) {
                    ctx.fillStyle = "#ff8fb1";
                    [[-3, -3], [3, -3], [0, -6]].forEach(([dx, dy]) => {
                        ctx.beginPath(); ctx.ellipse(x + dx, y + dy, 3, 4.5, dx * 0.15, 0, Math.PI * 2); ctx.fill();
                    });
                    ctx.fillStyle = "#ffd166";
                    ctx.beginPath(); ctx.arc(x, y - 3, 1.6, 0, Math.PI * 2); ctx.fill();
                }
            });
        }
    }

    // Phần nước phía trước: che chân khủng long đang lội
    function drawLakeFront(n) {
        if (frozen()) return;
        const L = lake();
        const wading = dinos.some((d) => d.air === 0 && inLake(d.x));
        if (!wading) return;
        ctx.save();
        lakePath(L);
        ctx.clip();
        ctx.fillStyle = rgb(mix(hex("#4fb7e6"), NIGHT_HILL, n * 0.55), 0.55);
        ctx.fillRect(L.x - L.rx, L.y - 2, L.rx * 2, L.ry * 2);
        ctx.restore();
    }

    function drawFish() {
        const L = lake();
        for (const f of fishes) {
            const k = f.t / 0.9;
            const x = f.x0 + f.dir * k * 54;
            const y = L.y - Math.sin(Math.PI * k) * 60;
            const ang = Math.atan2(-Math.cos(Math.PI * k) * 60 * Math.PI, f.dir * 54);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(ang);
            ctx.scale(f.dir, 1);
            ctx.fillStyle = f.color;
            ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-16, -6); ctx.lineTo(-16, 6); ctx.closePath(); ctx.fill();
            ctx.fillStyle = "#1e3a24";
            ctx.beginPath(); ctx.arc(5, -1.5, 1.4, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    }

    function drawEchoes() {
        ctx.textAlign = "center";
        for (const e of echoes) {
            const t = e.t - e.delay;
            if (t < 0) continue;
            const a = Math.max(0, 1 - t / 1.6);
            ctx.globalAlpha = a;
            ctx.font = `800 ${e.size}px "Baloo 2", "Segoe UI", sans-serif`;
            ctx.lineWidth = 4;
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.strokeText(e.text, e.x, e.y - t * 18);
            ctx.fillStyle = "#24613a";
            ctx.fillText(e.text, e.x, e.y - t * 18);
        }
        ctx.globalAlpha = 1;
    }

    // =========================================================
    // NÚI TỔ THẰN LẰN BAY: tổ trên đỉnh, trứng, chim con, chỗ đậu
    // =========================================================
    let spireX = null;
    let spireCheck = 0;
    const nest = { eggs: [{ t: 3 }, { t: 7 }], chicks: [{ t: 10, fed: 0, hop: 0, type: "ptera" }], bubble: null };

    function placeSpire() {
        // Đỉnh núi tổ nằm ở khoảng trời trống giữa tiêu đề và huy hiệu model
        if (document.body.classList.contains("scene-only") && spireX !== null) return;
        const title = document.querySelector(".topbar > div:first-child");
        const badge = document.querySelector(".model-badge");
        let x = W * 0.72;
        if (title && badge) {
            const a = title.getBoundingClientRect().right;
            const b = badge.getBoundingClientRect().left;
            if (b - a > 160) x = a + (b - a) * 0.62;
        }
        spireX = x;
    }

    function spire() {
        if (spireX === null) placeSpire();
        const s = S();
        return {
            x: spireX,
            top: Math.max(H * 0.075, 52),
            base: hillY(0, spireX) + 14,
            halfTop: 20 * s,
            halfBase: 74 * s
        };
    }

    const LEDGES = [0.3, 0.5, 0.7];

    function perchList() {
        const sp = spire();
        const s = S();
        const list = [
            { x: sp.x - 22 * s, y: sp.top - 8 * s, nest: true },
            { x: sp.x + 22 * s, y: sp.top - 8 * s, nest: true }
        ];
        LEDGES.forEach((k) => {
            const y = sp.top + (sp.base - sp.top) * k;
            const half = sp.halfTop + (sp.halfBase - sp.halfTop) * k;
            list.push({ x: sp.x - half - 8 * s, y: y - 7 * s });
            list.push({ x: sp.x + half + 8 * s, y: y - 7 * s });
        });
        return list;
    }

    function freePerch(preferNest) {
        const used = new Set(flyers.filter((f) => f.perch !== null && f.perch !== undefined).map((f) => f.perch));
        const order = perchList().map((_, i) => i);
        if (!preferNest) order.reverse();
        return order.find((i) => !used.has(i)) ?? null;
    }

    function goPerch(f, preferNest) {
        const idx = freePerch(preferNest);
        if (idx === null) return false;
        dropCarried(f);
        f.perch = idx;
        f.mode = "toNest";
        return true;
    }

    function land(f) {
        f.mode = "perched";
        f.perchT = rand(5, 8);
        f.flap = -0.25;
        f.angle = 0;
        const p = perchList()[f.perch];
        if (p && p.nest) feedNest(f);
    }

    function takeOff(f) {
        f.mode = "cruise";
        f.perch = null;
        f.sleeping = false;
        f.baseY = flyerLane();
        f.phase = 0;
        f.nestTimer = rand(18, 32);
    }

    function startFishing(f) {
        const L = lake();
        f.mode = "fish";
        f.fishX = L.x + rand(-0.6, 0.6) * L.rx;
        f.fishY = L.y - 6;
    }

    function feedNest(f) {
        if (nest.chicks.length) {
            nest.chicks.forEach((c) => { c.fed = 3; c.hop = 1; });
            flyerSay(f, f.fish ? "Cá ngon nè con!" : "Ăn đi con!", false);
            nest.bubble = { text: "Chiếp chiếp!", t: 1.4 };
            play("baby");
        } else if (nest.eggs.length < 3 && Math.random() < 0.7) {
            nest.eggs.push({ t: 0 });
            flyerSay(f, "Đẻ trứng nè!", false);
            play("hatch");
        } else {
            flyerSay(f, f.fish ? "Ăn một mình vậy!" : "Về tổ thôi!", false);
        }
        f.fish = false;
    }

    function updateNest(dt, n) {
        spireCheck -= dt;
        if (spireCheck <= 0) {
            spireCheck = 2;
            placeSpire();
        }
        if (nest.bubble) {
            nest.bubble.t -= dt;
            if (nest.bubble.t <= 0) nest.bubble = null;
        }
        const sp = spire();
        for (const e of nest.eggs) e.t += dt;
        const hatched = nest.eggs.filter((e) => e.t > 14);
        if (hatched.length && nest.chicks.length + (nest.eggs.length - hatched.length) < 4) {
            nest.eggs = nest.eggs.filter((e) => e.t <= 14);
            hatched.forEach(() => nest.chicks.push({ t: 0, fed: 1, hop: 1, type: Math.random() < 0.5 ? "ptera" : "rhampho" }));
            nest.bubble = { text: "Chiếp! Chào mẹ!", t: 1.6 };
            burst(sp.x, sp.top - 10, "star", 10);
            play("hatch");
        }
        for (const c of nest.chicks) {
            c.t += dt;
            c.fed -= dt;
            c.hop = Math.max(0, c.hop - dt * 2);
            if (n < 0.6 && c.fed <= 0 && Math.random() < dt * 0.25) {
                c.hop = 1;
                if (!nest.bubble) nest.bubble = { text: "Chiếp chiếp!", t: 1.2 };
            }
        }
        // Chim con lớn thì rời tổ
        const grown = nest.chicks.find((c) => c.t > 45);
        if (grown && n < 0.5) {
            nest.chicks.splice(nest.chicks.indexOf(grown), 1);
            if (flyers.length >= MAX_FLYERS) flyers.shift();
            const f = makeFlyer(grown.type, sp.x);
            f.y = sp.top - 14;
            f.baseY = flyerLane();
            flyers.push(f);
            flyerSay(f, "Bay thôi!", false);
            burst(sp.x, sp.top - 14, "heart", 8);
        }
    }

    function nestAt(px, py) {
        const sp = spire();
        const s = S();
        return Math.abs(px - sp.x) < 36 * s && Math.abs(py - (sp.top - 6 * s)) < 24 * s;
    }

    function clickNest() {
        const sp = spire();
        nest.chicks.forEach((c) => { c.hop = 1; });
        nest.eggs.forEach((e) => { e.t = Math.max(e.t, 10); });
        nest.bubble = { text: nest.chicks.length ? "Chiếp chiếp!" : "Trứng đang lắc nè!", t: 1.5 };
        play("baby");
        const parent = flyers.find((f) => f.mode === "perched" && perchList()[f.perch]?.nest);
        if (parent) {
            flyerSay(parent, "Đừng chạm con tớ!", false);
        } else {
            const f = flyers.find((x) => x.mode === "cruise");
            if (f && goPerch(f, true)) flyerSay(f, "Tớ về đây!", false);
        }
        burst(sp.x, sp.top - 12, "heart", 6);
    }

    function drawSpire(n) {
        const sp = spire();
        const s = S();
        const night = (c) => rgb(mix(hex(c), NIGHT_HILL, n * 0.5));
        const steps = 8;
        const side = (dirSign) => {
            const pts = [];
            for (let i = 0; i <= steps; i++) {
                const k = i / steps;
                const y = sp.base + (sp.top - sp.base) * k;
                const half = sp.halfBase + (sp.halfTop - sp.halfBase) * k;
                const jag = (i % 2 ? 7 : -3) * s;
                pts.push([sp.x + dirSign * (half + jag), y]);
            }
            return pts;
        };
        const left = side(-1);
        const right = side(1).reverse();

        ctx.fillStyle = night("#a08e7b");
        ctx.beginPath();
        left.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.lineTo(sp.x - sp.halfTop * 0.5, sp.top - 6 * s);
        ctx.lineTo(sp.x + sp.halfTop * 0.4, sp.top - 4 * s);
        right.forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath();
        ctx.fill();

        // Mặt khuất sáng tối + vết nứt
        ctx.fillStyle = `rgba(60,45,35,${0.18 + n * 0.1})`;
        ctx.beginPath();
        ctx.moveTo(sp.x + 4 * s, sp.top);
        right.slice().reverse().forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.lineTo(sp.x + 10 * s, sp.base);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = night("#6f6152");
        ctx.lineWidth = 2;
        [[-0.2, 0.2, 0.1, 0.35], [0.15, 0.55, -0.1, 0.7], [-0.3, 0.8, 0.05, 0.92]].forEach(([x0, k0, x1, k1]) => {
            ctx.beginPath();
            ctx.moveTo(sp.x + x0 * sp.halfBase, sp.top + (sp.base - sp.top) * k0);
            ctx.lineTo(sp.x + x1 * sp.halfBase, sp.top + (sp.base - sp.top) * k1);
            ctx.stroke();
        });

        // Gờ đá để đậu, cỏ / tuyết
        LEDGES.forEach((k) => {
            const y = sp.top + (sp.base - sp.top) * k;
            const half = sp.halfTop + (sp.halfBase - sp.halfTop) * k;
            [-1, 1].forEach((d) => {
                const x = sp.x + d * (half + 2 * s);
                ctx.fillStyle = night("#8a7a68");
                roundRect(d < 0 ? x - 20 * s : x, y - 3 * s, 20 * s, 7 * s, 3 * s);
                ctx.fill();
                ctx.fillStyle = frozen() ? "#ffffff" : night("#6fbf5a");
                ctx.beginPath();
                ctx.ellipse(x + d * 10 * s, y - 3 * s, 9 * s, 2.5 * s, 0, Math.PI, 0);
                ctx.fill();
            });
        });
        if (frozen()) {
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.beginPath();
            ctx.moveTo(sp.x - sp.halfTop * 1.3, sp.top + 22 * s);
            ctx.lineTo(sp.x - sp.halfTop * 0.5, sp.top - 6 * s);
            ctx.lineTo(sp.x + sp.halfTop * 0.4, sp.top - 4 * s);
            ctx.lineTo(sp.x + sp.halfTop * 1.3, sp.top + 18 * s);
            ctx.lineTo(sp.x, sp.top + 12 * s);
            ctx.closePath();
            ctx.fill();
        }

        drawNest(sp, n);
    }

    function drawNest(sp, n) {
        const s = S() * 1.3;
        const twig = mix(hex("#8b5a3c"), NIGHT_HILL, n * 0.4);
        ctx.save();
        ctx.translate(sp.x, sp.top - 3);
        ctx.scale(s, s);

        ctx.fillStyle = rgb(mix(twig, hex("#000000"), 0.25));
        ctx.beginPath(); ctx.ellipse(0, -2, 23, 7, 0, 0, Math.PI * 2); ctx.fill();

        // Trứng + chim con (tối đa 4 chỗ)
        const slots = [-13, -4, 5, 14];
        const items = [...nest.chicks.map((c) => ({ chick: c })), ...nest.eggs.map((e) => ({ egg: e }))].slice(0, 4);
        items.forEach((it, i) => {
            const x = slots[i];
            if (it.egg) {
                const wob = it.egg.t > 11 ? Math.sin(time * 26 + i) * 0.25 : 0;
                ctx.save();
                ctx.translate(x, -5);
                ctx.rotate(wob);
                ctx.fillStyle = "#fff4dc";
                ctx.beginPath(); ctx.ellipse(0, 0, 4.2, 5.6, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = "#e0a96d";
                ctx.beginPath(); ctx.arc(-1.2, -1.5, 0.9, 0, Math.PI * 2); ctx.arc(1.5, 1.2, 0.8, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            } else {
                const c = it.chick;
                const ty = FLYER_TYPES[c.type];
                const asleep = n > 0.6;
                const y = -9 - Math.abs(Math.sin(c.hop * Math.PI)) * 4;
                const open = !asleep && (c.fed <= 0 || c.fed > 2.4) && Math.sin(time * 14 + i) > -0.2;
                ctx.fillStyle = rgb(mix(hex(ty.wing), NIGHT_HILL, n * 0.4));
                ctx.beginPath(); ctx.arc(x, y, 5.2, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = rgb(mix(hex(ty.crest), NIGHT_HILL, n * 0.4));
                ctx.beginPath(); ctx.moveTo(x - 1, y - 4); ctx.lineTo(x - 6, y - 8); ctx.lineTo(x + 1, y - 5); ctx.fill();
                ctx.fillStyle = "#ffb627";
                ctx.beginPath();
                if (open) {
                    ctx.moveTo(x + 3, y - 1); ctx.lineTo(x + 11, y - 4); ctx.lineTo(x + 4, y + 1);
                    ctx.moveTo(x + 3, y + 1); ctx.lineTo(x + 10, y + 4); ctx.lineTo(x + 3, y + 3);
                } else {
                    ctx.moveTo(x + 3, y - 1); ctx.lineTo(x + 10, y + 1); ctx.lineTo(x + 3, y + 2);
                }
                ctx.fill();
                eye(x + 1, y - 1.5, 1.9, asleep, "#5e3f2f");
            }
        });

        // Vành tổ phía trước
        ctx.fillStyle = rgb(twig);
        ctx.beginPath(); ctx.ellipse(0, 1, 25, 8, 0, 0, Math.PI); ctx.fill();
        ctx.strokeStyle = rgb(mix(twig, hex("#ffffff"), 0.25));
        ctx.lineWidth = 1.4;
        for (let k = -3; k <= 3; k++) {
            ctx.beginPath(); ctx.moveTo(k * 7 - 5, 2 + Math.abs(k)); ctx.lineTo(k * 7 + 6, 5 - Math.abs(k) * 0.5); ctx.stroke();
        }
        ctx.restore();

        if (nest.bubble) {
            const fs = 15;
            ctx.font = `800 ${fs}px "Baloo 2", "Segoe UI", sans-serif`;
            ctx.textAlign = "center";
            const w = ctx.measureText(nest.bubble.text).width + 20;
            ctx.globalAlpha = Math.min(1, nest.bubble.t * 3);
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#a95c2c";
            ctx.lineWidth = 2;
            roundRect(sp.x - w / 2 - 40, sp.top - 52, w, fs + 12, 12);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#a95c2c";
            ctx.fillText(nest.bubble.text, sp.x - 40, sp.top - 34);
            ctx.globalAlpha = 1;
        }
    }

    // =========================================================
    // CÁ SẤU DƯỚI HỒ: lặn rình, "Táp!" dọa khủng long, đớp cá, phơi nắng
    // =========================================================
    let crocs = [];
    let lakeMeat = [];

    function initCrocs() {
        const L = lake();
        crocs = [-0.35, 0.4].map((k, i) => ({
            x: L.x + k * L.rx, yo: i ? 6 : -2, dir: i ? -1 : 1, mode: "drift",
            t: rand(0, 5), sub: 0.66, jaw: 0, cool: rand(4, 8), bubble: null, side: 1
        }));
        lakeMeat = [];
    }

    function crocSay(c, text) {
        c.bubble = { text, t: 1.6 };
    }

    function crocSnap(c, prey, text) {
        const L = lake();
        c.mode = "snap";
        c.snapT = 0;
        crocSay(c, text);
        splash(c.x + c.dir * 40 * S(), L.y, true);
        play("snap");
        if (prey) {
            prey.awake = 6;
            say(prey, "Á á á!", false);
            prey.vy = 430;
            prey.air = 0.1;
            prey.vx = (prey.x < c.x ? -1 : 1) * 230;
            prey.goal = null;
            prey.state = "walk";
            prey.activity = null;
            prey.stateT = rand(4, 8);
        }
    }

    function crocSnack(x) {
        const c = crocs.find((k) => (k.mode === "drift" || k.mode === "stalk") && Math.abs(k.x - x) < 80);
        if (c) {
            c.dir = Math.sign(x - c.x) || c.dir;
            crocSnap(c, null, "Ngon quá!");
        }
    }

    function feedCrocs() {
        const L = lake();
        if (frozen()) return;
        for (let i = 0; i < 2; i++) lakeMeat.push({ x: L.x + rand(-0.6, 0.6) * L.rx, y: H * 0.35, vy: 0, landed: false });
        play("pop");
    }

    function crocPos(c) {
        const L = lake();
        const s = S();
        if (c.mode === "bask") {
            const x = L.x + c.side * (L.rx + 34 * s);
            return { x, y: groundY(x) + 6, shore: true };
        }
        const wl = L.y + c.yo - 2;
        return { x: c.x, y: wl + c.sub * 9 * s, wl, shore: false };
    }

    function crocAt(px, py) {
        if (frozen()) return null;
        const s = S();
        for (const c of crocs) {
            const p = crocPos(c);
            if (Math.abs(px - (p.x + c.dir * 10 * s)) < 52 * s && py > p.y - 24 * s && py < p.y + 12 * s) return c;
        }
        return null;
    }

    function clickCroc(c) {
        if (c.mode === "bask") {
            crocSay(c, "Đừng làm phiền!");
            c.mode = "drift";
            c.cool = 5;
            c.x = lake().x + c.side * lake().rx * 0.7;
            splash(c.x, lake().y, true);
            play("splash");
        } else {
            crocSnap(c, null, "Rắc rắc!");
        }
    }

    function updateCrocs(dt, n) {
        const L = lake();
        const s = S();

        // Thịt rơi xuống hồ -> cá sấu lao tới đớp
        for (const m of lakeMeat) {
            if (!m.landed) {
                m.vy += 900 * dt;
                m.y += m.vy * dt;
                if (m.y >= L.y - 4) {
                    m.y = L.y - 4;
                    m.landed = true;
                    splash(m.x, L.y, false);
                }
            }
        }

        for (const c of crocs) {
            c.t += dt;
            c.cool = Math.max(0, c.cool - dt);
            if (c.bubble) {
                c.bubble.t -= dt;
                if (c.bubble.t <= 0) c.bubble = null;
            }
            if (frozen()) {
                if (c.mode === "bask") c.mode = "drift";
                continue;
            }

            if (c.mode === "drift") {
                c.x += c.dir * 14 * dt;
                if (c.x > L.x + L.rx * 0.6) c.dir = -1;
                if (c.x < L.x - L.rx * 0.6) c.dir = 1;
                c.sub += (0.66 - c.sub) * Math.min(1, dt * 2);
                c.jaw += (0 - c.jaw) * Math.min(1, dt * 6);
                const meat = lakeMeat.find((m) => m.landed && !m.taken);
                if (meat) {
                    meat.taken = true;
                    c.mode = "chase";
                    c.meat = meat;
                } else if (c.cool <= 0) {
                    const prey = dinos.find((d) => d !== held && !d.carriedBy && d.air === 0
                        && (inLake(d.x) || d.activity === "drink") && Math.abs(d.x - c.x) < L.rx * 1.3);
                    if (prey) {
                        c.mode = "stalk";
                        c.prey = prey;
                    } else if (n < 0.5 && Math.random() < dt * 0.04) {
                        c.mode = "toBask";
                        c.side = c.x < L.x ? -1 : 1;
                    }
                }
            } else if (c.mode === "chase") {
                const dx = c.meat.x - c.x;
                c.dir = Math.sign(dx) || c.dir;
                c.sub += (0.5 - c.sub) * Math.min(1, dt * 4);
                if (Math.abs(dx) < 34 * s) {
                    lakeMeat.splice(lakeMeat.indexOf(c.meat), 1);
                    crocSnap(c, null, "Ngon quá!");
                } else {
                    c.x += Math.sign(dx) * 110 * dt;
                }
            } else if (c.mode === "stalk") {
                const p = c.prey;
                if (!p || p === held || p.air > 0 || p.carriedBy || !dinos.includes(p)
                    || !(inLake(p.x) || p.activity === "drink")) {
                    c.mode = "drift";
                    continue;
                }
                const sp = SPECIES[p.species];
                const target = p.activity === "drink" ? p.x + p.dir * sp.head[0] * dinoScale(p) : p.x;
                const tx = Math.max(L.x - L.rx * 0.75, Math.min(L.x + L.rx * 0.75, target));
                const dx = tx - c.x;
                c.dir = Math.sign(dx) || c.dir;
                c.sub += (0.96 - c.sub) * Math.min(1, dt * 3);
                if (Math.abs(dx) < 40 * s) crocSnap(c, p, "Táp!");
                else c.x += Math.sign(dx) * 42 * dt;
            } else if (c.mode === "snap") {
                c.snapT += dt;
                const k = c.snapT / 0.9;
                c.jaw = k < 0.35 ? k / 0.35 : Math.max(0, 1 - (k - 0.35) / 0.3);
                c.sub += (0.3 - c.sub) * Math.min(1, dt * 8);
                if (k >= 1) {
                    c.mode = "drift";
                    c.cool = rand(8, 14);
                }
            } else if (c.mode === "toBask") {
                const edge = L.x + c.side * L.rx * 0.72;
                const dx = edge - c.x;
                c.dir = Math.sign(dx) || c.side;
                c.x += Math.sign(dx) * 20 * dt;
                if (Math.abs(dx) < 4) {
                    c.mode = "bask";
                    c.baskT = rand(7, 10);
                    c.dir = -c.side;
                    splash(c.x, L.y, false);
                    crocSay(c, "Phơi nắng~");
                }
            } else if (c.mode === "bask") {
                c.baskT -= dt;
                c.jaw += (0.6 - c.jaw) * Math.min(1, dt * 2);
                if (c.baskT <= 0 || n > 0.5) {
                    c.mode = "drift";
                    c.cool = 6;
                    c.dir = -c.side;
                    c.x = L.x + c.side * L.rx * 0.7;
                    splash(c.x, L.y, true);
                    play("splash");
                }
            }
        }
    }

    function drawCrocShape(c, x, y, s, n, shore) {
        const night = (col) => rgb(mix(hex(col), NIGHT_HILL, n * 0.45));
        const body = night("#557f3d");
        const dark = night("#2f5426");
        const belly = night("#cbd98c");
        const wag = Math.sin(c.t * 2.5) * 3;

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s * c.dir, s);
        ctx.lineJoin = "round";

        // Đuôi + gai lưng
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(-22, -6);
        ctx.quadraticCurveTo(-50, -7 + wag, -76, -1 + wag);
        ctx.quadraticCurveTo(-50, 5, -22, 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = dark;
        for (let k = -66; k <= 14; k += 8) {
            const yy = k < -22 ? -5 + ((k + 22) / -54) * (wag + 3) : -9;
            ctx.beginPath(); ctx.moveTo(k - 3, yy + 2); ctx.lineTo(k, yy - 3); ctx.lineTo(k + 3, yy + 2); ctx.fill();
        }

        if (shore) {
            ctx.fillStyle = body;
            [[-14, 1], [12, -1]].forEach(([lx, a]) => {
                ctx.save(); ctx.translate(lx, 5); ctx.rotate(a * 0.3);
                roundRect(-3, 0, 6, 9, 2); ctx.fill();
                ctx.restore();
            });
        }

        // Thân
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.ellipse(0, 0, 28, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = belly;
        ctx.beginPath(); ctx.ellipse(2, 5, 22, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = dark;
        [[-12, -3], [-2, -4], [8, -3]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.ellipse(dx, dy, 3, 1.6, 0, 0, Math.PI * 2); ctx.fill(); });

        // Miệng (hồng bên trong) khi há
        if (c.jaw > 0.05) {
            ctx.fillStyle = "#e07a8a";
            ctx.beginPath();
            ctx.moveTo(24, -1);
            ctx.lineTo(24 + 40 * Math.cos(-c.jaw * 0.45), -3 + 40 * Math.sin(-c.jaw * 0.45));
            ctx.lineTo(24 + 38 * Math.cos(c.jaw * 0.35), 38 * Math.sin(c.jaw * 0.35));
            ctx.closePath();
            ctx.fill();
        }

        // Hàm dưới
        ctx.save();
        ctx.translate(24, 0);
        ctx.rotate(c.jaw * 0.35);
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(37, 1); ctx.quadraticCurveTo(41, 3, 37, 5); ctx.lineTo(0, 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#ffffff";
        for (let k = 6; k <= 32; k += 6) { ctx.beginPath(); ctx.moveTo(k, 1); ctx.lineTo(k + 1.6, -2.5); ctx.lineTo(k + 3.2, 1); ctx.fill(); }
        ctx.restore();

        // Hàm trên + mắt + mũi
        ctx.save();
        ctx.translate(24, -2);
        ctx.rotate(-c.jaw * 0.45);
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(38, -3); ctx.quadraticCurveTo(44, -1, 40, 2); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#ffffff";
        for (let k = 6; k <= 34; k += 6) { ctx.beginPath(); ctx.moveTo(k, 2); ctx.lineTo(k + 1.6, 5.5); ctx.lineTo(k + 3.2, 2); ctx.fill(); }
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.arc(6, -8, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(37, -4, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.arc(38, -5, 0.9, 0, Math.PI * 2); ctx.fill();
        const blink = Math.sin(c.t * 1.3) > 0.97 ? 0.15 : 1;
        ctx.fillStyle = "#ffd166";
        ctx.beginPath(); ctx.ellipse(7, -9, 3.2, 3.2 * blink, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#1e3a24";
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(7.5, -11 * blink - 0.5); ctx.lineTo(7.5, -7); ctx.stroke();
        ctx.restore();

        ctx.restore();
    }

    function drawCrocs(n) {
        if (frozen()) return;
        const L = lake();
        const s = S();

        // Miếng thịt đang rơi / nổi trên hồ
        for (const m of lakeMeat) {
            ctx.fillStyle = "#b5523b";
            ctx.beginPath(); ctx.ellipse(m.x, m.y, 8, 5.5, -0.2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#f1e3c8";
            ctx.fillRect(m.x + 5, m.y - 2, 8, 3);
        }

        for (const c of crocs) {
            const p = crocPos(c);
            if (p.shore) {
                drawCrocShape(c, p.x, p.y, s, n, true);
            } else {
                // Phần trên mặt nước rõ nét, phần dưới nước mờ
                ctx.save();
                ctx.beginPath();
                ctx.rect(p.x - 120 * s, p.wl - 120 * s, 240 * s, 120 * s);
                ctx.clip();
                drawCrocShape(c, p.x, p.y, s, n, false);
                ctx.restore();

                ctx.save();
                lakePath(L);
                ctx.clip();
                ctx.beginPath();
                ctx.rect(p.x - 120 * s, p.wl, 240 * s, 80 * s);
                ctx.clip();
                ctx.globalAlpha = 0.28;
                drawCrocShape(c, p.x, p.y, s, n, false);
                ctx.globalAlpha = 1;
                ctx.strokeStyle = "rgba(255,255,255,0.6)";
                ctx.lineWidth = 1.5;
                const ring = 1 + Math.sin(c.t * 3) * 0.08;
                ctx.beginPath(); ctx.ellipse(p.x + c.dir * 30 * s, p.wl, 22 * s * ring, 3.5 * s, 0, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
            }

            if (c.bubble) {
                const fs = 16;
                ctx.font = `800 ${fs}px "Baloo 2", "Segoe UI", sans-serif`;
                ctx.textAlign = "center";
                const w = ctx.measureText(c.bubble.text).width + 22;
                const pop = Math.min(1, (1.6 - c.bubble.t) * 6);
                ctx.save();
                ctx.translate(p.x + c.dir * 40 * s, p.y - 32 * s);
                ctx.scale(pop, pop);
                ctx.globalAlpha = Math.min(1, c.bubble.t * 3);
                ctx.fillStyle = "#ffffff";
                ctx.strokeStyle = "#2f5426";
                ctx.lineWidth = 2.5;
                roundRect(-w / 2, -fs - 4, w, fs + 14, 13);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = "#2f5426";
                ctx.fillText(c.bubble.text, 0, 2);
                ctx.restore();
                ctx.globalAlpha = 1;
            }
        }
    }

    // ---------- Khủng long tự đi uống nước, ăn lá, tắm hồ ----------
    function pickGoal(d) {
        const r = Math.random();
        const sc = dinoScale(d);
        const head = SPECIES[d.species].head[0] * sc;
        if (d.species === "brachio" && !d.baby && r < 0.6) {
            let best = null;
            for (const t of BIG_TREES) {
                if (!best || Math.abs(W * t.f - d.x) < Math.abs(W * best.f - d.x)) best = t;
            }
            const tx = W * best.f;
            const side = Math.sign(tx - d.x) || 1;
            d.goal = { type: "tree", x: tx - side * head, side, tree: best };
            return true;
        }
        if (r < 0.35) {
            const L = lake();
            const side = d.x < L.x ? 1 : -1;
            d.goal = { type: "drink", x: L.x - side * (L.rx - 12 + head), side };
            return true;
        }
        return false;
    }

    function arriveGoal(d) {
        const g = d.goal;
        d.goal = null;
        if (g.side) d.dir = g.side;
        if (g.type === "tree") {
            d.state = "eat";
            d.activity = "tree";
            d.treeRef = g.tree;
            d.stateT = 3.5;
            say(d, "Măm lá!", false, true);
            play("eat");
        } else if (g.type === "drink") {
            d.state = "eat";
            d.activity = "drink";
            d.stateT = 3;
            say(d, frozen() ? "Lạnh quá!" : "Ực ực!", false, true);
            play("drink");
        } else {
            d.state = "idle";
            d.activity = "swim";
            d.stateT = 3.5;
            if (frozen()) {
                say(d, "Trượt băng nè!", false);
            } else {
                say(d, "Mát quá!", false);
                splash(d.x, feetY(d), true);
                play("splash");
            }
        }
    }

    function goSwim() {
        const L = lake();
        dinos.forEach((d) => {
            if (d === held || d.carriedBy) return;
            d.goal = { type: "swim", x: L.x + rand(-0.7, 0.7) * L.rx };
            d.awake = 8;
            d.state = "walk";
            d.stateT = 10;
        });
    }

    // ---------- Âm thanh tổng hợp (mặc định tắt) ----------
    let audioCtx = null;
    const SOUNDS = {
        trex:    ["sawtooth", 150, 55, 0.9, 520],
        tri:     ["triangle", 260, 160, 0.55, 1200],
        brachio: ["sine", 160, 90, 1.1, 900],
        stego:   ["square", 170, 110, 0.35, 600],
        raptor:  ["square", 900, 1500, 0.18, 3000],
        baby:    ["triangle", 1100, 1600, 0.16, 4000],
        hatch:   ["sine", 500, 1300, 0.14, 5000],
        eat:     ["triangle", 330, 250, 0.12, 2000],
        boing:   ["sine", 260, 620, 0.22, 3000],
        pop:     ["sine", 700, 1400, 0.1, 5000],
        splash:  ["triangle", 520, 110, 0.35, 1800],
        drink:   ["sine", 420, 300, 0.18, 2500],
        snap:    ["square", 240, 70, 0.22, 900]
    };

    function play(kind) {
        if (!prefs.sound) return;
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            const [type, f1, f2, dur, cut] = SOUNDS[kind] || SOUNDS.pop;
            const t0 = audioCtx.currentTime;
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            const f = audioCtx.createBiquadFilter();
            o.type = type;
            o.frequency.setValueAtTime(f1, t0);
            o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
            f.type = "lowpass";
            f.frequency.value = cut;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            o.connect(f).connect(g).connect(audioCtx.destination);
            o.start(t0);
            o.stop(t0 + dur + 0.05);
        } catch { /* trình duyệt không hỗ trợ âm thanh */ }
    }

    // ---------- Chuột / chạm ----------
    const pointer = { x: -999, y: -999, inside: false, overUI: false };
    const UI_SELECTOR = ".sidebar, .panel, .card, .model-badge, .topbar > div:first-child, .scene-ctl, button, a, input, select, label";
    let press = null;
    let trail = [];

    function dinoAt(px, py) {
        for (let i = dinos.length - 1; i >= 0; i--) {
            const d = dinos[i];
            const sp = SPECIES[d.species];
            const s = dinoScale(d);
            const fy = feetY(d);
            if (px > d.x - (sp.w / 2) * s && px < d.x + (sp.w / 2) * s && py > fy - sp.h * s && py < fy + 8) return d;
        }
        return null;
    }

    function isOverUI(target) {
        return !!(target && target.closest && target.closest(UI_SELECTOR));
    }

    window.addEventListener("pointerdown", (e) => {
        if (!prefs.on || e.button !== 0 || isOverUI(e.target)) return;
        const fl = flyerAt(e.clientX, e.clientY);
        if (fl) {
            e.preventDefault();
            press = { flyer: fl, x: e.clientX, y: e.clientY, moved: false };
            trail = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
            return;
        }
        const d = dinoAt(e.clientX, e.clientY);
        if (d) {
            e.preventDefault();
            press = { d, x: e.clientX, y: e.clientY, moved: false, dy: e.clientY - feetY(d) };
            trail = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
        } else {
            press = null;
            if (clickWorld(e.clientX, e.clientY)) return;
            if (e.clientY > groundY(e.clientX) - 40) {
                dropEgg(e.clientX, e.clientY);
                play("pop");
            } else {
                burst(e.clientX, e.clientY, "star", 14);
                play("pop");
            }
        }
    });

    window.addEventListener("pointermove", (e) => {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.inside = true;
        pointer.overUI = isOverUI(e.target);

        if (press && press.flyer) {
            if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
                press.moved = true;
                heldFlyer = press.flyer;
                dropCarried(heldFlyer);
                heldFlyer.mode = "held";
                heldFlyer.perch = null;
                heldFlyer.sleeping = false;
                heldFlyer.angle = 0;
                flyerSay(heldFlyer, "Thả tớ ra!", false);
            }
            if (heldFlyer) {
                heldFlyer.x = e.clientX;
                heldFlyer.y = e.clientY;
                trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
                if (trail.length > 6) trail.shift();
            }
            document.body.style.cursor = heldFlyer ? "grabbing" : "grab";
            return;
        }
        if (press) {
            if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
                press.moved = true;
                held = press.d;
                if (held.carriedBy) {
                    held.carriedBy.carrying = null;
                    held.carriedBy.mode = "cruise";
                    held.carriedBy = null;
                }
                held.state = "walk";
                held.awake = 8;
                say(held, "Thả tớ xuống!", false);
            }
            if (held) {
                held.x = Math.max(20, Math.min(W - 20, e.clientX));
                held.air = Math.max(0, groundY(held.x) + held.lane - (e.clientY - press.dy));
                trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
                if (trail.length > 6) trail.shift();
            }
            document.body.style.cursor = held ? "grabbing" : "grab";
            return;
        }
        const over = prefs.on && !pointer.overUI && (flyerAt(e.clientX, e.clientY) || dinoAt(e.clientX, e.clientY));
        document.body.style.cursor = over ? "grab"
            : prefs.on && !pointer.overUI && worldAt(e.clientX, e.clientY) ? "pointer" : "";
    });

    window.addEventListener("pointerup", () => {
        if (!press) return;
        if (press.flyer) {
            const f = press.flyer;
            if (press.moved && heldFlyer) {
                // Thả ra: bay tiếp theo hướng vung tay
                const a = trail[0];
                const b = trail[trail.length - 1];
                if (Math.abs(b.x - a.x) > 10) f.dir = Math.sign(b.x - a.x);
                f.mode = "cruise";
                f.baseY = Math.max(H * 0.03, Math.min(H * 0.85, f.y));
                f.phase = 0;
                f.bubble = null;
                heldFlyer = null;
            } else if (f.mode === "perched") {
                const wasAsleep = f.sleeping;
                takeOff(f);
                flyerSay(f, wasAsleep ? "Ai đánh thức tớ?" : FLYER_TYPES[f.type].sound);
            } else if (f.mode === "cruise" || f.mode === "carry") {
                // Bấm: nhào lộn một vòng
                dropCarried(f);
                f.mode = "loop";
                f.loopT = 0;
                f.loopX = f.x;
                f.loopY = f.y;
                flyerSay(f, FLYER_TYPES[f.type].sound);
                burst(f.x, f.y, "star", 10);
            }
            press = null;
            document.body.style.cursor = "";
            return;
        }
        const d = press.d;
        if (press.moved && held) {
            // Ném: vận tốc theo vài điểm chuột cuối cùng
            const a = trail[0];
            const b = trail[trail.length - 1];
            const dt = Math.max(16, b.t - a.t) / 1000;
            held.vx = Math.max(-900, Math.min(900, (b.x - a.x) / dt));
            held.vy = Math.max(-200, Math.min(900, -(b.y - a.y) / dt));
            if (held.air <= 0 && held.vy <= 0) { held.vx = 0; held.vy = 0; }
            if (held.air > 0 || held.vy > 0) held.air = Math.max(held.air, 0.1);
            held.bubble = null;
            held = null;
        } else {
            // Bấm: nhảy + kêu + tim bay
            d.awake = 6;
            d.state = "walk";
            if (d.air === 0) { d.vy = 420; d.air = 0.1; }
            say(d, d.baby ? "Chíp chíp!" : SPECIES[d.species].sound);
            const sp = SPECIES[d.species];
            burst(d.x + d.dir * sp.head[0] * dinoScale(d), feetY(d) + sp.head[1] * dinoScale(d), "heart", 10);
        }
        press = null;
        document.body.style.cursor = "";
    });

    document.addEventListener("pointerleave", () => { pointer.inside = false; });


    // ---------- Vòng lặp ----------
    let last = performance.now();
    let paused = false;

    function step(now) {
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        if (!paused) {
            update(dt);
            draw();
        }
        requestAnimationFrame(step);
    }

    function update(dt) {
        time += dt;

        // Thời gian trong ngày
        const target = targetPhase();
        if (target === null) {
            phase = (phase + dt / DAY_SECONDS) % 1;
        } else {
            let d = target - phase;
            if (d > 0.5) d -= 1;
            if (d < -0.5) d += 1;
            phase = (phase + d * Math.min(1, dt * 1.5) + 1) % 1;
        }

        // Mùa
        if (prefs.season === "auto") {
            seasonClock += dt;
            if (seasonClock > SEASON_SECONDS) {
                seasonClock = 0;
                setSeason((seasonIdx + 1) % 4);
            }
        }
        seasonBlend = Math.min(1, seasonBlend + dt / 3);

        const n = nightness(phase);

        // Mây
        clouds.forEach((c, i) => {
            c.x += c.v * dt;
            if (c.x - 120 * c.s > W) clouds[i] = newCloud(-140 * c.s);
        });

        // Chim & cò (ban ngày)
        nextBird -= dt;
        nextPtero -= dt;
        if (n < 0.4) {
            if (nextBird <= 0) {
                spawnFlock("bird");
                nextBird = season() === "winter" ? rand(18, 30) : rand(7, 14);
            }

        }
        flocks.forEach((f) => { f.x += f.v * dt; });
        flocks = flocks.filter((f) => (f.dir > 0 ? f.x < W + 400 : f.x > -400));

        updateVolcano(dt);
        updateDinos(dt, n);
        updateFlyers(dt, n);
        updateWorld(dt);

        // Sao băng / thiên thạch rực lửa
        if (n > 0.7 && !shooting && Math.random() < dt * 0.15) {
            shooting = { x: rand(0.2, 0.9) * W, y: rand(0.05, 0.3) * H, life: 0, fire: Math.random() < 0.5 };
        }
        if (shooting) {
            shooting.life += dt;
            if (shooting.life > 1.1) shooting = null;
        }

        // Hạt rơi
        const density = DENSITY[season()];
        particles.forEach((p, i) => {
            if (!p.active) {
                if (i < density && Math.random() < dt * 0.6) particles[i] = newParticle(i, false);
                return;
            }
            p.y += p.vy * dt;
            p.sway += dt * (p.type === "winter" ? 1.2 : 2);
            p.x += Math.sin(p.sway) * (p.type === "autumn" ? 40 : 18) * dt;
            p.rot += p.vr * dt;
            const out = p.vy > 0 ? p.y > H + 20 : p.y < -20;
            if (out || p.x < -40 || p.x > W + 40) {
                particles[i] = i < density ? newParticle(i, false) : { ...p, active: false };
            }
        });
    }

    function draw() {
        const n = nightness(phase);
        const [top, bottom] = skyColors(phase);

        // Bầu trời
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, rgb(top));
        g.addColorStop(1, rgb(bottom));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        // Màu nhuộm theo mùa
        const tc = SEASON_STYLE[season()].tint;
        const tp = SEASON_STYLE[SEASONS[prevSeasonIdx]].tint;
        const tint = mix(tp, tc, seasonBlend);
        ctx.fillStyle = rgb(tint, tint[3] * (1 - n * 0.6));
        ctx.fillRect(0, 0, W, H);

        // Sao
        if (n > 0.02) {
            ctx.fillStyle = "#ffffff";
            stars.forEach((s) => {
                ctx.globalAlpha = n * (0.4 + 0.6 * Math.abs(Math.sin(time * s.sp * 0.5 + s.tw)));
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
        }

        if (shooting) {
            const t = shooting.life;
            const x = shooting.x + t * 420;
            const y = shooting.y + t * 160;
            const tail = ctx.createLinearGradient(x, y, x - 120, y - 46);
            const head = shooting.fire ? "255,170,60" : "255,255,255";
            tail.addColorStop(0, `rgba(${head},${1 - t / 1.1})`);
            tail.addColorStop(1, `rgba(${head},0)`);
            ctx.strokeStyle = tail;
            ctx.lineWidth = shooting.fire ? 4 : 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 120, y - 46);
            ctx.stroke();
        }

        // Mặt trời: đi từ trái sang phải trong nửa ngày đầu
        const r = Math.max(26, Math.min(W, H) * 0.045);
        if (phase < 0.54) {
            const t = (phase + 0.02) / 0.56;
            drawSun(W * (0.08 + 0.84 * t), H * 0.6 - Math.sin(Math.PI * t) * H * 0.52, r);
        }
        // Mặt trăng: nửa ngày sau
        if (phase > 0.46) {
            const t = (phase - 0.46) / 0.56;
            drawMoon(W * (0.08 + 0.84 * t), H * 0.6 - Math.sin(Math.PI * t) * H * 0.52, r * 0.85);
        }

        // Mây
        const cloudColor = mix(hex(season() === "winter" ? "#f1f4fa" : "#ffffff"), hex("#5d4f8f"), n * 0.75);
        clouds.forEach((c) => {
            ctx.fillStyle = rgb(cloudColor, 0.9);
            c.puffs.forEach((p) => {
                ctx.beginPath();
                ctx.arc(c.x + p.dx * c.s, c.y + p.dy * c.s, p.r * c.s, 0, Math.PI * 2);
                ctx.fill();
            });
        });

        // Núi lửa, đồi & cây, T-Rex
        drawMountains(n);
        drawVolcano(n);
        drawSpire(n);
        drawHillsAndTrees(n);
        drawDinos(n);

        // Chim & thằn lằn bay (vẽ sau đồi để không bị che)
        flocks.forEach((f) => {
            const bob = Math.sin(time * 1.5 + f.bob) * 6;
            f.members.forEach((m) => {
                const x = f.x + m.ox;
                const y = f.y + m.oy + bob;
                if (f.kind === "ptero") {
                    drawPtero(x, y, f.scale, f.dir, Math.sin(time * 3.6 + m.ph));
                } else {
                    ctx.strokeStyle = rgb(mix(hex("#4a2b3a"), hex("#ffffff"), n), 0.75);
                    ctx.lineWidth = 2;
                    ctx.lineCap = "round";
                    drawBird(x, y, f.scale, Math.sin(time * 9 + m.ph));
                }
            });
        });
        drawFlyers(n);

        // Bướm (xuân, hạ - ban ngày)
        if ((season() === "spring" || season() === "summer") && n < 0.5) {
            butterflies.forEach((b) => {
                b.t += 0.016;
                const x = ((b.x * W + b.t * 30) % (W + 60)) - 30;
                const y = b.y * H + Math.sin(b.t * 2) * 30;
                const wing = Math.abs(Math.sin(b.t * 14));
                ctx.fillStyle = b.c;
                ctx.globalAlpha = 0.9 * (1 - n * 2);
                [-1, 1].forEach((s) => {
                    ctx.beginPath();
                    ctx.ellipse(x + s * 5 * wing, y, 6 * wing + 1, 8, s * 0.4, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.globalAlpha = 1;
            });
        }

        // Đom đóm (hạ - ban đêm)
        if (season() === "summer" && n > 0.4) {
            fireflies.forEach((f) => {
                f.t += 0.016;
                const x = (f.x * W + Math.sin(f.t * 0.7) * 40);
                const y = f.y * H + Math.cos(f.t * 0.9) * 20;
                const a = n * (0.3 + 0.7 * Math.abs(Math.sin(f.t * 2)));
                const glow = ctx.createRadialGradient(x, y, 0, x, y, 8);
                glow.addColorStop(0, `rgba(255,245,150,${a})`);
                glow.addColorStop(1, "rgba(255,245,150,0)");
                ctx.fillStyle = glow;
                ctx.fillRect(x - 8, y - 8, 16, 16);
            });
        }

        // Hoa / lá / tuyết / hạt nắng
        particles.forEach((p) => { if (p.active) drawParticle(p); });
    }

    // ---------- Bảng điều khiển ----------
    const panel = document.createElement("div");
    panel.className = "scene-ctl";
    panel.innerHTML = `
        <button type="button" class="scene-toggle" id="scene-toggle" aria-expanded="false" title="Khung cảnh">
            <span id="scene-icon">🌤️</span><span id="scene-label">Khung cảnh</span>
            <span class="scene-cta">🦖 Bấm để chơi</span>
        </button>
        <div class="scene-box" id="scene-box" hidden>
            <div class="scene-group">
                <span>Thời gian</span>
                <div class="chips" data-key="time">
                    <button type="button" data-v="auto">🔄 Tự động</button>
                    <button type="button" data-v="day">☀️ Ban ngày</button>
                    <button type="button" data-v="night">🌙 Ban đêm</button>
                </div>
            </div>
            <div class="scene-group">
                <span>Mùa</span>
                <div class="chips" data-key="season">
                    <button type="button" data-v="auto">🔄 Tự động</button>
                    <button type="button" data-v="spring">🌸 Xuân</button>
                    <button type="button" data-v="summer">🌻 Hạ</button>
                    <button type="button" data-v="autumn">🍁 Thu</button>
                    <button type="button" data-v="winter">❄️ Đông</button>
                </div>
            </div>
            <div class="scene-group">
                <span>Khủng long</span>
                <div class="actions">
                    <button type="button" data-act="food">🍖 Cho ăn</button>
                    <button type="button" data-act="roar">📣 Cả đàn kêu</button>
                    <button type="button" data-act="egg">🥚 Thả trứng</button>
                    <button type="button" data-act="view">👀 Xem toàn cảnh</button>
                    <button type="button" data-act="sound" id="act-sound">🔇 Âm thanh: tắt</button>
                    <button type="button" data-act="flyer">🪽 Thêm thằn lằn bay</button>
                    <button type="button" data-act="swim">🌊 Cả đàn đi tắm</button>
                    <button type="button" data-act="nest">🪺 Về tổ trên núi</button>
                    <button type="button" data-act="croc">🐊 Cho cá sấu ăn</button>
                    <button type="button" data-act="reset">↺ Đàn ban đầu</button>
                </div>
                <p class="scene-hint">
                    Bấm vào khủng long để nó nhảy và kêu · Kéo để bế lên rồi ném ·
                    Bấm thằn lằn bay để nó nhào lộn, kéo để bắt ·
                    Bấm cây cho rụng quả · Bấm hồ cho cá nhảy · Bấm núi nghe tiếng vọng ·
                    Bấm tổ trên đỉnh núi đá để nghe chim con · Bấm cá sấu cho nó đớp ·
                    Bấm lên đồi để thả trứng · Bấm lên trời để bắn pháo sao.
                </p>
            </div>
            <div class="scene-group">
                <span>Hiệu ứng</span>
                <div class="chips" data-key="on">
                    <button type="button" data-v="true">Bật</button>
                    <button type="button" data-v="false">Tắt (máy chạy nhẹ hơn)</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(panel);

    const box = panel.querySelector("#scene-box");
    const toggle = panel.querySelector("#scene-toggle");
    toggle.addEventListener("click", () => {
        box.hidden = !box.hidden;
        toggle.setAttribute("aria-expanded", String(!box.hidden));
    });

    function refreshChips() {
        panel.querySelectorAll(".chips").forEach((group) => {
            const key = group.dataset.key;
            group.querySelectorAll("button").forEach((b) => {
                b.classList.toggle("on", String(prefs[key]) === b.dataset.v);
            });
        });
    }

    panel.querySelectorAll(".chips").forEach((group) => {
        group.addEventListener("click", (e) => {
            const b = e.target.closest("button");
            if (!b) return;
            const key = group.dataset.key;
            prefs[key] = key === "on" ? b.dataset.v === "true" : b.dataset.v;
            if (key === "season" && prefs.season !== "auto") setSeason(SEASONS.indexOf(prefs.season));
            if (key === "season" && prefs.season === "auto") seasonClock = 0;
            if (key === "on") applyOnOff();
            savePrefs();
            refreshChips();
            updateLabel();
        });
    });

    function applyOnOff() {
        canvas.hidden = !prefs.on;
        document.body.classList.toggle("scene-off", !prefs.on);
        paused = !prefs.on;
    }

    let lastLabel = "";
    function updateLabel() {
        const night = nightness(phase) > 0.5;
        const icon = !prefs.on ? "🦖" : night ? "🌙" : { spring: "🌸", summer: "☀️", autumn: "🍁", winter: "❄️" }[season()];
        const text = !prefs.on ? "Khung cảnh: tắt" : `${SEASON_NAMES[season()]} · ${night ? "Ban đêm" : "Ban ngày"}`;
        if (text + icon === lastLabel) return;
        lastLabel = text + icon;
        panel.querySelector("#scene-icon").textContent = icon;
        panel.querySelector("#scene-label").textContent = text;
    }
    setInterval(updateLabel, 1000);

    // ---------- Nút khủng long ----------
    function refreshSound() {
        panel.querySelector("#act-sound").textContent = prefs.sound ? "🔊 Âm thanh: bật" : "🔇 Âm thanh: tắt";
        panel.querySelector("#act-sound").classList.toggle("on", prefs.sound);
    }

    function setSceneOnly(on) {
        document.body.classList.toggle("scene-only", on);
        panel.querySelector('[data-act="view"]').textContent = on ? "↩ Hiện lại giao diện" : "👀 Xem toàn cảnh";
    }

    panel.querySelector(".actions").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (!prefs.on) {
            prefs.on = true;
            applyOnOff();
            refreshChips();
            savePrefs();
        }
        const act = b.dataset.act;
        if (act === "food") dropFood();
        if (act === "roar") allSay();
        if (act === "egg") {
            for (let k = 0; k < 3; k++) dropEgg(rand(0.1, 0.9) * W, rand(0.05, 0.3) * H);
            play("pop");
        }
        if (act === "view") setSceneOnly(!document.body.classList.contains("scene-only"));
        if (act === "sound") {
            prefs.sound = !prefs.sound;
            savePrefs();
            refreshSound();
            play("pop");
        }
        if (act === "flyer") addFlyer();
        if (act === "swim") goSwim();
        if (act === "nest") flyers.forEach((f) => { if (f.mode === "cruise") goPerch(f, true); });
        if (act === "croc") feedCrocs();
        if (act === "reset") {
            initDinos();
            initFlyers();
            initCrocs();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && document.body.classList.contains("scene-only")) setSceneOnly(false);
    });

    // ---------- Khởi động ----------
    if (prefs.season !== "auto" && SEASONS.includes(prefs.season)) {
        seasonIdx = prevSeasonIdx = SEASONS.indexOf(prefs.season);
    } else {
        // Tự động: bắt đầu theo mùa thật của tháng hiện tại
        const m = new Date().getMonth();
        seasonIdx = prevSeasonIdx = m < 3 ? 0 : m < 6 ? 1 : m < 9 ? 2 : 3;
    }
    if (targetPhase() !== null) phase = targetPhase();

    resize();
    initDinos();
    initFlyers();
    initCrocs();
    refreshSound();
    particles.forEach((p, i) => { particles[i] = newParticle(i, true); });
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
        paused = document.hidden || !prefs.on;
        last = performance.now();
    });

    applyOnOff();
    refreshChips();
    updateLabel();
    draw();
    requestAnimationFrame(step);
})();
