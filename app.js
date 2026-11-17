/* 관측 조위 기록으로 본 현행 설계기준 점검
   자료: data/viewer_data.js (scripts/viewer_build_data.py), data/land_korea.js (scripts/ref_land_extract.py)
   판정: 33곳 KHOA 고조정보 4단계, 16곳 임시 규칙(참고사항) — decisions D4-1
   사건: 태풍별 최고 조위, 태풍 영역 통과 ±24 h (D4-2·D4-4) */
(function () {
  "use strict";
  const D = window.VIEWER_DATA;
  const ST = D.stations;
  const DEFAULT_STATION = "부산"; // 처음 선택 관측소 (previous_features 3절 "대표 관측소 하나")
  const LEVELS = ["관심", "주의", "경계", "위험"];
  // 단계 색 (평시는 회색). 텍스트에는 쓰지 않고 표식에만 쓴다
  const LV_COLOR = { 평시: "#9aa5b1", 관심: "#e9b949", 주의: "#e8833a", 경계: "#d64545", 위험: "#7a1414" };
  const SELECT = "#0f62fe";
  const COAST_KO = { West: "서해", South: "남해", East: "동해" };

  function topLevel(s) {
    for (let i = LEVELS.length - 1; i >= 0; i--) if (s.n[LEVELS[i]] > 0) return LEVELS[i];
    return "평시";
  }

  /* ---------- 머리말·바닥글 ---------- */
  document.getElementById("meta").innerHTML = [
    D.meta.dataset, "단위 " + D.meta.units, "화면 시간 " + D.meta.time_zone, "자료 만든 날 " + D.meta.built,
  ].map((s) => `<span>${s}</span>`).join("");
  document.getElementById("method").innerHTML =
    `<b>만든 방법</b> — 판정: ${D.meta.criteria_note}. ${D.meta.event_note}. ${D.meta.rate_note}. ` +
    `16곳의 기준값: ${D.meta.design_level}. 기준면 불확실 구간(자료 README·PSMSL 대조)에 든 사건은 ※ 로 표시. ` +
    `<br><b>자료 출처</b> — ` +
    // 문구는 자료 README 6절(LICENCE AND SOURCE DATA)을 따른다
    `조위·천문조·해일 성분과 태풍 사건: Kor_SeaLevel v1.0 (2026-10-20, CC BY 4.0; 인용 정보는 논문 게재 후 추가). ` +
    `원 관측 자료: 국립해양조사원(KHOA) 바다누리 해양정보 서비스 시간별 조위, 공공누리 제1유형(출처표시). ` +
    `태풍 경로: IBTrACS v04r01 서태평양, NOAA NCEI (Knapp et al., 2010). ` +
    `관심·주의·경계·위험 높이와 시설물 높이: 국립해양조사원 실시간 고조정보. ` +
    `배경 지도·지명: Natural Earth 1:10m (공개 저작물).`;

  // 첫 화면 요약 (decisions D5-2) — 숫자는 화면 자료(scripts/viewer_build_data.py)에서 채움. 관측소 이름을 누르면 선택
  const SM = D.summary;
  // 한눈에: ① 주의·경계에 닿은 관측소 수 → ② 자주 넘는 곳
  document.getElementById("headline").innerHTML =
    `<span class="hl-num"><i class="dot" style="background:${LV_COLOR["주의"]}"></i>주의 이상 <b>${SM.n_attention}곳</b><small> / ${SM.n_official}곳</small></span>` +
    `<span class="hl-num"><i class="dot" style="background:${LV_COLOR["경계"]}"></i>경계 이상 <b>${SM.n_caution}곳</b><small> / ${SM.n_official}곳</small></span>` +
    `<span class="hl-sep"></span>` +
    `<span class="hl-where">자주 넘는 곳 <small>(2년에 한 번꼴 이상 주의)</small> ` +
    SM.frequent.map((n) => `<span class="stn chip" data-name="${n}">${n}</span>`).join("") + `</span>` +
    `<small class="hl-basis">KHOA 침수 위험 기준이 있는 관측소, 1956–2025 태풍 사건 기준 · 관측소마다 관측 기간이 다름 (각자 관측한 기간의 태풍만 셈)</small>`;
  document.querySelectorAll("#headline .stn").forEach((el) => el.addEventListener("click", () => select(el.dataset.name)));

  /* ---------- 탭 ---------- */
  document.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => { x.classList.toggle("active", x === b); x.setAttribute("aria-selected", x === b); });
      document.getElementById("tab-check").hidden = b.dataset.tab !== "check";
      document.getElementById("tab-ssp").hidden = b.dataset.tab !== "ssp";
      if (b.dataset.tab === "check") { map.invalidateSize(); chart.resize(); }
    }));

  /* ---------- 지도 ---------- */
  const map = L.map("map", { zoomControl: true, attributionControl: false, zoomSnap: 0.25, minZoom: 4, maxZoom: 11 });
  L.geoJSON(window.LAND_KOREA, { style: { color: "#c9c9c3", weight: 0.8, fillColor: "#e2e2de", fillOpacity: 1 }, interactive: false }).addTo(map);
  map.fitBounds([[33.0, 124.8], [38.6, 131.2]]);
  // 경위도 격자 (1° 간격) — 지도 범위 안에서 다시 그림
  const grid = L.layerGroup().addTo(map);
  function drawGrid() {
    grid.clearLayers();
    const b = map.getBounds();
    const step = map.getZoom() >= 8 ? 0.5 : 1;
    const style = { color: "#9aa5b1", weight: 0.6, opacity: 0.7, dashArray: "3 4", interactive: false };
    for (let x = Math.ceil(b.getWest() / step) * step; x <= b.getEast(); x += step) {
      L.polyline([[b.getSouth(), x], [b.getNorth(), x]], style).addTo(grid);
      L.marker([b.getSouth(), x], { interactive: false, icon: L.divIcon({ className: "grid-lbl grid-lbl-x", html: `${x}°E`, iconSize: null }) }).addTo(grid);
    }
    for (let y = Math.ceil(b.getSouth() / step) * step; y <= b.getNorth(); y += step) {
      L.polyline([[y, b.getWest()], [y, b.getEast()]], style).addTo(grid);
      L.marker([y, b.getWest()], { interactive: false, icon: L.divIcon({ className: "grid-lbl grid-lbl-y", html: `${y}°N`, iconSize: null }) }).addTo(grid);
    }
  }
  map.on("moveend zoomend", drawGrid);
  drawGrid();

  // 지명 (Natural Earth Populated Places, 한글 이름). 확대할수록 작은 도시까지 보인다
  const placeLayer = L.layerGroup().addTo(map);
  function drawPlaces() {
    placeLayer.clearLayers();
    const z = map.getZoom();
    const maxRank = z < 6.5 ? 4 : z < 7.5 ? 6 : 10;
    (window.PLACES || []).filter((p) => p.rank <= maxRank).forEach((p) => {
      L.circleMarker([p.lat, p.lon], { radius: 2, color: "#6b7480", weight: 1, fillColor: "#6b7480", fillOpacity: 1, interactive: false }).addTo(placeLayer);
      L.marker([p.lat, p.lon], { interactive: false,
        icon: L.divIcon({ className: "place-lbl" + (p.capital ? " cap" : ""), html: p.name.replace(/(특별시|광역시|직할시|특별자치시)$/, ""), iconSize: null }) }).addTo(placeLayer);
    });
  }
  map.on("zoomend", drawPlaces);
  drawPlaces();

  // 태풍 경로 (IBTrACS v04r01) — 태풍 목록에서 고르면 그린다
  const trackLayer = L.layerGroup().addTo(map);
  function showTrack(e, s) {
    trackLayer.clearLayers();
    const tr = (window.TRACKS || {})[e.sid];
    if (!tr) return;
    const pts = tr.lat.map((la, k) => [la, tr.lon[k]]);
    L.polyline(pts, { color: "#5b3fa3", weight: 2.5, opacity: 0.85, interactive: false }).addTo(trackLayer);
    pts.forEach((p, k) => {
      if (k % 4 === 0) L.circleMarker(p, { radius: 2.5, color: "#5b3fa3", weight: 1, fillColor: "#fff", fillOpacity: 1 })
        .bindTooltip(`${tr.name} ${tr.season}<br>${utcToKst(tr.t[k])} KST`, { direction: "top" }).addTo(trackLayer);
    });
    // 이 관측소 최고 조위 시각의 태풍 위치 (경로 시각 중 가장 가까운 것)
    const peak = toMs(e.peak);
    let best = 0, bd = Infinity;
    tr.t.forEach((t, k) => { const d = Math.abs(Date.parse(t.replace(" ", "T") + ":00Z") - peak); if (d < bd) { bd = d; best = k; } });
    // 최고 조위 때 태풍 위치 — 관측소 단계 색과 헷갈리지 않게 푸른색 + 진한 남색 테두리
    L.circleMarker(pts[best], { radius: 8, color: "#0b3d91", weight: 3, fillColor: "#38bdf8", fillOpacity: 1 })
      .bindTooltip(`${s.name} 최고 조위 때 태풍 위치<br>${e.peak} KST · ${e.esl.toFixed(0)} cm`, { direction: "top" }).addTo(trackLayer);
    L.marker(pts[0], { interactive: false, icon: L.divIcon({ className: "track-lbl", html: `${tr.name} ${tr.season}`, iconSize: null }) }).addTo(trackLayer);
    // 지도: 관측소를 가운데에 두고, 한반도 근처 경로(북위 28° 이북)가 보일 만큼만 줄인다.
    // 관측소에서 가장 먼 근처 경로점까지의 거리만큼 위아래·좌우를 똑같이 잡아 확대 단계를 정한다 (너무 멀면 6°로 제한)
    const near = pts.filter((p) => p[0] >= 28);
    const ref = near.length ? near : pts;
    const dLat = Math.min(6, Math.max(1.5, ...ref.map((p) => Math.abs(p[0] - s.lat))));
    const dLon = Math.min(6, Math.max(1.5, ...ref.map((p) => Math.abs(p[1] - s.lon))));
    const box = L.latLngBounds([s.lat - dLat, s.lon - dLon], [s.lat + dLat, s.lon + dLon]);
    const z = Math.max(map.getMinZoom(), Math.min(7, map.getBoundsZoom(box, false, L.point(24, 24))));
    map.setView([s.lat, s.lon], z);
  }
  function clearTrack() { trackLayer.clearLayers(); }
  const utcToKst = (t) => { const d = new Date(Date.parse(t.replace(" ", "T") + ":00Z") + 9 * 3600e3); return d.toISOString().slice(0, 16).replace("T", " "); };

  const markers = {};
  function markerStyle(s, selected) {
    const c = LV_COLOR[topLevel(s)];
    // 임시 규칙 관측소는 속이 빈 점 (참고사항)
    return s.official
      ? { radius: selected ? 10 : 6.5, color: selected ? SELECT : "#ffffff", weight: selected ? 3 : 1.5, fillColor: c, fillOpacity: 1 }
      : { radius: selected ? 10 : 6.5, color: selected ? SELECT : c, weight: selected ? 3 : 2.5, fillColor: "#ffffff", fillOpacity: 1 };
  }
  ST.forEach((s) => {
    const m = L.circleMarker([s.lat, s.lon], markerStyle(s, false))
      .addTo(map)
      .bindTooltip(`${s.no}. ${s.name}<br>관심 이상 ${s.n.관심 ?? 0}건 · 주의 이상 ${s.n.주의 ?? 0}건${s.official ? "" : "<br>(임시 규칙 — 참고)"}`,
        { direction: "top", offset: [0, -6] })
      .on("click", () => select(s.name));
    markers[s.name] = m;
  });
  document.getElementById("legend").innerHTML =
    `<div class="lg-title">가장 높이 닿은 단계</div>` +
    ["위험", "경계", "주의", "관심", "평시"].map((k) => `<div><i style="background:${LV_COLOR[k]}"></i>${k}</div>`).join("") +
    `<div><i class="hollow" style="border-color:${LV_COLOR["주의"]}"></i>속 빈 점: 공식 기준 없음 (임시 규칙)</div>`;

  /* ---------- 관측소 표 ---------- */
  const COLS = [
    { key: "no", label: "번호", num: true, tip: "관측소 번호 (서해 북→남, 남해 서→동·제주, 동해 북→남)" },
    { key: "name", label: "관측소", num: false, tip: "관측소 이름" },
    { key: "coast", label: "해안", num: false, tip: "자료에서 정한 해안 구분 (조차 기준)" },
    { key: "crit", label: "기준", num: false, tip: "KHOA 고조정보 4단계 / 임시 규칙(공식 기준 없음, 참고)" },
    { key: "n_관심", label: "관심 이상", num: true, tip: "관심 단계 이상에 닿은 태풍 사건 수" },
    { key: "n_주의", label: "주의 이상", num: true, tip: "주의(침수 가능성 있음) 단계 이상에 닿은 태풍 사건 수" },
    { key: "n_경계", label: "경계 이상", num: true, tip: "경계(침수 가능성 높음) 단계 이상 — 임시 규칙 관측소는 판정 안 함" },
    { key: "n_위험", label: "위험", num: true, tip: "위험 단계 — 임시 규칙 관측소는 판정 안 함" },
    { key: "rate_interest", label: "연평균 (관심 이상)", num: true, tip: "유효 관측 연수 안의 관심 이상 사건 수 ÷ 유효 관측 연수" },
    { key: "valid_years", label: "유효 관측 연수", num: true, tip: "그해 자료로 조화분석을 한 해의 수 (자료율 80 % 등, 자료 README)" },
  ];
  let sortKey = "no", sortDir = 1, current = null;
  const thead = document.querySelector("#st-table thead tr");
  thead.innerHTML = COLS.map((c) => `<th class="${c.num ? "num" : ""}" data-key="${c.key}" title="${c.tip}">${c.label}<span class="arrow"></span></th>`).join("");
  thead.querySelectorAll("th").forEach((th) =>
    th.addEventListener("click", () => {
      const c = COLS.find((x) => x.key === th.dataset.key);
      if (sortKey === c.key) sortDir = -sortDir;
      else { sortKey = c.key; sortDir = c.num && c.key !== "no" ? -1 : 1; } // 숫자는 큰 값부터, 글자는 가나다순
      renderTable();
    }));
  function val(s, k) {
    if (k === "coast") return COAST_KO[s.coast];
    if (k === "crit") return s.official ? "KHOA" : "임시";
    if (k.startsWith("n_")) return s.n[k.slice(2)];
    return k in s ? s[k] : null;
  }
  function fmt(v, k) {
    if (v == null) return "–";
    if (k === "rate_interest") return v.toFixed(2);
    return v;
  }
  function renderTable() {
    const rows = ST.slice().sort((a, b) => {
      const va = val(a, sortKey), vb = val(b, sortKey);
      if (va == null && vb == null) return a.no - b.no;
      if (va == null) return 1; // 값이 없으면 항상 맨 아래
      if (vb == null) return -1;
      return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "ko")) * sortDir;
    });
    document.querySelector("#st-table tbody").innerHTML = rows.map((s) =>
      `<tr data-name="${s.name}" class="${s.name === current ? "sel" : ""}">` +
      COLS.map((c) => {
        const v = val(s, c.key);
        const cls = (c.num ? "num " : "") + (v == null ? "empty " : "") + (c.key === "crit" && !s.official ? "temp" : "");
        return `<td class="${cls}">${fmt(v, c.key)}</td>`;
      }).join("") + "</tr>").join("");
    document.querySelectorAll("#st-table tbody tr").forEach((tr) => tr.addEventListener("click", () => select(tr.dataset.name)));
    thead.querySelectorAll("th").forEach((th) => (th.querySelector(".arrow").textContent = th.dataset.key === sortKey ? (sortDir > 0 ? "▲" : "▼") : ""));
  }
  document.getElementById("table-hint").innerHTML =
    "제목 칸을 누르면 정렬, 다시 누르면 반대로 (숫자는 큰 값부터, 글자는 가나다순, 값이 없으면 맨 아래). " +
    "<b>관심</b>·<b>주의</b>·<b>경계</b>·<b>위험</b>은 KHOA 실시간 고조정보의 침수 위험 단계입니다 (주의: 침수 가능성 있음, 경계: 침수 가능성 높음). " +
    "<span class='temp'>임시</span> 관측소는 공식 기준이 없어 임시 규칙으로 판정한 참고값입니다 (추후 보완).";

  /* ---------- 상세 ---------- */
  function select(name) {
    current = name;
    clearTrack();
    const s = ST.find((x) => x.name === name);
    ST.forEach((x) => markers[x.name].setStyle(markerStyle(x, x.name === name)));
    markers[name].bringToFront();
    renderTable();
    const row = document.querySelector(`#st-table tbody tr[data-name="${name}"]`);
    const wrap = document.querySelector(".table-wrap");
    if (row && wrap) {
      const top = row.offsetTop - wrap.querySelector("thead").offsetHeight;
      if (top < wrap.scrollTop || row.offsetTop + row.offsetHeight > wrap.scrollTop + wrap.clientHeight)
        wrap.scrollTop = Math.max(0, top - wrap.clientHeight / 3);
    }

    const th = Object.entries(s.th).filter(([, v]) => v != null);
    const cautions = [];
    if (!s.official) cautions.push("<b>참고사항:</b> KHOA 고조정보 기준이 없는 관측소라 임시 규칙(기준값 이상 관심, +20 cm 주의)으로 판정했습니다. 추후 보완 예정입니다.");
    if (s.n_datum_uncertain > 0) cautions.push(`관심 이상 사건 중 ${s.n_datum_uncertain}건은 기준면이 바뀌었을 수 있는 기간에 있습니다 (※ 표시).`);
    if (s.n_datum_breaks > 0) cautions.push(`기록 중 기준면 단절 ${s.n_datum_breaks}회가 보고된 관측소입니다 (자료 README).`);
    if (s.valid_years <= 3) cautions.push(`유효 관측 연수가 ${s.valid_years}년이라 연평균 값이 크게 흔들릴 수 있습니다.`);
    document.getElementById("detail").innerHTML =
      `<h2>${s.no}. ${s.name} <small style="font-weight:400;color:var(--ink-2)">${s.name_en}</small></h2>` +
      `<div class="sub">${COAST_KO[s.coast]} · 관측 ${s.obs_start} ~ ${s.obs_end} (KST) · 유효 관측 ${s.valid_years}년 · ` +
      `기준: ${s.official ? "KHOA 고조정보" : "<span class='temp'>임시 규칙 (참고)</span>"}</div>` +
      `<div class="stats">` +
      th.map(([k, v]) => stat(`${k} 단계 높이`, v.toFixed(0), "cm", LV_COLOR[k])).join("") +
      stat("관심 이상 / 주의 이상", `${s.n.관심 ?? 0} / ${s.n.주의 ?? 0}`, "건") +
      stat("연평균 (관심 이상)", s.rate_interest == null ? "–" : s.rate_interest.toFixed(2), "회/년") +
      `</div>` + (cautions.length ? `<div class="caution">${cautions.join("<br>")}</div>` : "");
    renderTyphoons(s);
    renderChart(s);
  }
  function stat(k, v, unit, color) {
    const dot = color ? `<i class="dot" style="background:${color}"></i>` : "";
    return `<div class="stat"><div class="k">${dot}${k}</div><div class="v">${v} <small>${unit}</small></div></div>`;
  }

  /* ---------- 태풍 목록 ---------- */
  let tyFilter = "reach";
  document.getElementById("ty-filter").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    tyFilter = b.dataset.f;
    document.querySelectorAll("#ty-filter button").forEach((x) => x.classList.toggle("on", x === b));
    renderTyphoons(ST.find((x) => x.name === current));
  });
  function renderTyphoons(s) {
    let list = s.events;
    const reach = list.filter((e) => e.level !== "평시");
    let note = "";
    if (tyFilter === "reach") {
      if (reach.length) list = reach;
      else note = `<div class="hint">관심 이상에 닿은 사건이 없어 전체를 보여 줍니다.</div>`;
    }
    document.getElementById("ty-list").innerHTML = note +
      `<table class="ty"><thead><tr><th>연도</th><th>태풍</th><th class="num" title="태풍 경로 중 관측소와 가장 가까운 거리">거리</th><th class="num" title="태풍 기간 최고 조위">최고</th><th>단계</th></tr></thead><tbody>` +
      list.map((e, i) => `<tr data-i="${s.events.indexOf(e)}"><td>${e.year}</td><td>${e.typhoon}${e.datum ? " <span class='mark' title='" + e.datum + "'>※</span>" : ""}</td>` +
        `<td class="num">${e.dist_km == null ? "–" : e.dist_km + " km"}</td><td class="num">${e.esl.toFixed(0)} cm</td>` +
        `<td><i class="dot" style="background:${LV_COLOR[e.level]}"></i>${e.level}</td></tr>`).join("") +
      `</tbody></table>`;
    document.querySelectorAll("#ty-list tbody tr").forEach((tr) =>
      tr.addEventListener("click", () => focusEvent(s, +tr.dataset.i)));
  }

  /* ---------- 시계열 그래프 (태풍 사건 구간만, 구간 사이는 끊음) ---------- */
  const chart = echarts.init(document.getElementById("chart"), null, { renderer: "canvas" });
  window.addEventListener("resize", () => { chart.resize(); map.invalidateSize(); popChart && popChart.resize();
    if (curS) spreadThLabels(chart, curS); });
  const HOUR = 3600e3;
  const toMs = (str) => Date.parse(str.replace(" ", "T") + ":00+09:00");
  const kst = (ms) => { const d = new Date(ms + 9 * HOUR); return d.toISOString().slice(0, 16).replace("T", " "); };

  /* ---------- 전체 시간별 조위 (평상시 포함) ----------
     관측소마다 data/hourly/NN.bin (int16, cm×10) 을 처음 고를 때 한 번 읽어 둔다.
     넓은 기간은 하루 최고·최저 조위로, 짧은 기간(DETAIL_DAYS 이하)은 시간별 값으로 그린다 — 저사양 PC에서도 가볍게 */
  const DAY = 24 * HOUR;
  const DETAIL_DAYS = 120;
  const NULL16 = D.meta.hourly_null, SCALE = D.meta.hourly_scale;
  const hourlyCache = new Map();
  let curH = null, curS = null, curExt = [0, 0];

  async function loadHourly(s) {
    if (hourlyCache.has(s.name)) return hourlyCache.get(s.name);
    const raw = new Int16Array(await (await fetch(s.hourly.file)).arrayBuffer());
    const t0 = toMs(s.hourly.start_KST);
    // KST 달력일 단위 최고·최저
    const dayT = [], dayMax = [], dayMin = [];
    let key = null, mx = -Infinity, mn = Infinity, any = false;
    const flush = () => { if (key == null) return; dayT.push(key * DAY - 9 * HOUR); dayMax.push(any ? mx / SCALE : null); dayMin.push(any ? mn / SCALE : null); };
    for (let k = 0; k < raw.length; k++) {
      const kk = Math.floor((t0 + k * HOUR + 9 * HOUR) / DAY);
      if (kk !== key) { flush(); key = kk; mx = -Infinity; mn = Infinity; any = false; }
      const v = raw[k];
      if (v !== NULL16) { any = true; if (v > mx) mx = v; if (v < mn) mn = v; }
    }
    flush();
    const h = { t0, raw, dayT, dayMax, dayMin };
    hourlyCache.set(s.name, h);
    return h;
  }
  function windowData(h, lo, hi) {
    if (hi - lo <= DETAIL_DAYS * DAY) {
      const a = Math.max(0, Math.floor((lo - h.t0) / HOUR) - 1), b = Math.min(h.raw.length - 1, Math.ceil((hi - h.t0) / HOUR) + 1);
      const line = [];
      for (let k = a; k <= b; k++) { const v = h.raw[k]; line.push([h.t0 + k * HOUR, v === NULL16 ? null : v / SCALE]); }
      return { mode: "시간별 조위", line, low: [] };
    }
    const line = [], low = [];
    for (let i = 0; i < h.dayT.length; i++) {
      const t = h.dayT[i];
      if (t < lo - DAY || t > hi + DAY) continue;
      line.push([t, h.dayMax[i]]); low.push([t, h.dayMin[i]]);
    }
    return { mode: "하루 최고 조위 (기간이 넓어 하루 단위로 줄여 표시, 120일 이하로 좁히면 시간별)", line, low };
  }
  function thLines(s, offs) {
    return Object.entries(s.th).filter(([, v]) => v != null).map(([k, v]) => ({
      yAxis: v, name: k, lineStyle: { color: LV_COLOR[k], type: "dashed", width: 1.5 },
      // 이름표는 그래프 오른쪽 바깥. 높이가 가까운 단계(관심·주의 20 cm 차)는 spreadThLabels 가 위아래로 벌림
      label: { formatter: `${k} ${v.toFixed(0)}`, color: "#52514e", position: "end", fontSize: 11, distance: 4,
               offset: [0, (offs && offs[k]) || 0] },
    }));
  }
  // 단계 이름표가 화면에서 15 px 보다 가까우면 아래쪽 것을 내려 겹치지 않게 함 (y축 눈금이 바뀔 때마다 다시 계산)
  const LABEL_GAP = 15;
  function spreadThLabels(c, s) {
    const items = Object.entries(s.th).filter(([, v]) => v != null)
      .map(([k, v]) => ({ k, y: c.convertToPixel({ yAxisIndex: 0 }, v) }))
      .filter((d) => Number.isFinite(d.y)).sort((a, b) => a.y - b.y);   // 화면 위쪽(높은 값)부터
    const offs = {};
    let prev = -Infinity;
    for (const d of items) {
      const pos = Math.max(d.y, prev + LABEL_GAP);
      offs[d.k] = pos - d.y;
      prev = pos;
    }
    c.setOption({ series: [{ id: "level", markLine: { data: thLines(s, offs) } }] });
  }
  // 범례: 넓은 기간은 일 최고(진한 선)·일 최저(옅은 선) 두 줄, 120일 이하는 시간별 한 줄
  function lineNames(w) {
    return w.low.length ? ["일 최고", "일 최저"] : ["시간별 조위", "일 최저"];
  }
  function refreshLine() {
    if (!curH) return;
    const [lo, hi] = currentWindow();
    const w = windowData(curH, lo, hi);
    const [n1, n2] = lineNames(w);
    chart.setOption({ legend: { data: w.low.length ? [n1, n2] : [n1] },
                      series: [{ id: "level", name: n1, data: w.line }, { id: "low", name: n2, data: w.low }] });
    document.getElementById("chart-mode").textContent = w.mode;
    if (curS) spreadThLabels(chart, curS);
  }
  let zoomTimer = null;
  function onZoom() {
    syncRangeInputs();
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(refreshLine, 120);
  }

  async function renderChart(s) {
    document.getElementById("chart-title").textContent = `${s.name} 시간별 조위`;
    document.getElementById("ty-info").innerHTML = "";
    document.getElementById("chart-mode").textContent = "자료 읽는 중…";
    chart.showLoading({ text: "" });
    const h = await loadHourly(s);
    if (current !== s.name) return;            // 읽는 사이 다른 관측소를 고른 경우
    chart.hideLoading();
    curH = h; curS = s;
    curExt = [h.t0, h.t0 + (h.raw.length - 1) * HOUR];
    const pts = s.events.map((e, i) => ({ value: [toMs(e.peak), e.esl], i, e,
      itemStyle: e.datum ? { color: "#fff", borderColor: LV_COLOR[e.level], borderWidth: 2 } : { color: LV_COLOR[e.level] } }));
    const areas = s.events.map((e) => [{ xAxis: toMs(e.t0) }, { xAxis: toMs(e.t0) + e.v.length * HOUR }]);
    const w = windowData(h, curExt[0], curExt[1]);
    const [n1, n2] = lineNames(w);
    chart.setOption({
      animation: false,
      grid: { left: 64, right: 78, top: 34, bottom: 62 },
      legend: { data: w.low.length ? [n1, n2] : [n1], top: 0, right: 78, selectedMode: false,
                itemWidth: 18, itemHeight: 2, icon: "rect", textStyle: { color: "#525252", fontSize: 11 } },
      tooltip: { trigger: "item", formatter: (p) => p.seriesId === "peaks"
        ? `${p.data.e.typhoon} ${p.data.e.year}<br>${p.data.e.peak} KST<br>최고 ${p.data.e.esl.toFixed(0)} cm · ${p.data.e.level}${p.data.e.datum ? "<br>※ 기준면 불확실 기간" : ""}`
        : `${kst(p.value[0])} KST<br>${p.value[1] == null ? "–" : p.value[1].toFixed(0) + " cm"}` },
      xAxis: { type: "time", min: curExt[0], max: curExt[1], axisLabel: { color: "#52514e" }, axisLine: { lineStyle: { color: "#9a9993" } } },
      yAxis: { type: "value", scale: true, name: "조위 cm (D.L.)", nameLocation: "middle", nameRotate: 90, nameGap: 46,
               nameTextStyle: { color: "#52514e" }, axisLabel: { color: "#52514e" }, splitLine: { lineStyle: { color: "#eceae4" } } },
      dataZoom: [{ type: "slider", height: 18, bottom: 18, brushSelect: false, filterMode: "none", labelFormatter: (v) => kst(v).slice(0, 10) },
                 { type: "inside", filterMode: "none" }],
      series: [
        { id: "level", name: n1, type: "line", data: w.line, showSymbol: false, connectNulls: false,   // sampling 은 빈칸을 무시하고 이어 그려서 쓰지 않음
          lineStyle: { width: 1, color: "#4589ff" }, markLine: { symbol: "none", silent: true, data: thLines(s) },
          // 태풍 사건 구간 (태풍 영역 통과 ±24 h) 을 옅게 칠함
          markArea: { silent: true, itemStyle: { color: "rgba(91,63,163,0.10)" }, data: areas } },
        { id: "low", name: n2, type: "line", data: w.low, showSymbol: false, connectNulls: false, lineStyle: { width: 0.8, color: "#a6c8ff" } },
        { id: "peaks", type: "scatter", data: pts, symbolSize: 9, z: 5 },
      ],
    }, true);
    spreadThLabels(chart, s);
    document.getElementById("chart-mode").textContent = w.mode;
    chart.off("click");
    chart.on("click", (p) => { if (p.seriesId === "peaks") openPopup(s, p.data.e); });
    chart.off("datazoom");
    chart.on("datazoom", onZoom);
    rangeStart.min = rangeEnd.min = kst(curExt[0]).slice(0, 10);
    rangeStart.max = rangeEnd.max = kst(curExt[1]).slice(0, 10);
    syncRangeInputs();
    // 관심·주의 높이 산정 설명
    document.getElementById("th-note").innerHTML =
      `<b>${s.name}의 관심·주의 높이는 이렇게 정해졌습니다</b><ul>` + s.th_note.map((t) => `<li>${t}</li>`).join("") + `</ul>`;
  }

  /* ---------- 기간 고르기 (x축) ---------- */
  const rangeStart = document.getElementById("range-start");
  const rangeEnd = document.getElementById("range-end");
  function currentWindow() {
    // 지금 그래프에 보이는 기간 (ms)
    const dz = chart.getOption().dataZoom[0];
    const [a, b] = curExt;
    const lo = dz.startValue != null ? dz.startValue : a + (b - a) * (dz.start / 100);
    const hi = dz.endValue != null ? dz.endValue : a + (b - a) * (dz.end / 100);
    return [lo, hi];
  }
  function syncRangeInputs() {
    const [lo, hi] = currentWindow();
    rangeStart.value = kst(lo).slice(0, 10);
    rangeEnd.value = kst(hi).slice(0, 10);
  }
  function applyRange() {
    if (!rangeStart.value || !rangeEnd.value) return;
    let a = toMs(rangeStart.value + " 00:00"), b = toMs(rangeEnd.value + " 23:00");
    if (a > b) [a, b] = [b, a];
    chart.dispatchAction({ type: "dataZoom", startValue: a, endValue: b });
  }
  document.getElementById("range-apply").addEventListener("click", applyRange);
  [rangeStart, rangeEnd].forEach((el) => el.addEventListener("keydown", (e) => { if (e.key === "Enter") applyRange(); }));
  document.getElementById("range-all").addEventListener("click", () => {
    chart.dispatchAction({ type: "dataZoom", start: 0, end: 100 });
    document.getElementById("ty-info").innerHTML = "";
    clearTrack();
  });
  document.getElementById("range-10y").addEventListener("click", () => {
    chart.dispatchAction({ type: "dataZoom", startValue: curExt[1] - 10 * 365.25 * DAY, endValue: curExt[1] });
  });

  /* ---------- 보이는 기간 조위 CSV 내려받기 (전체 시간별 기록) ---------- */
  document.getElementById("csv-download").addEventListener("click", () => {
    const s = ST.find((x) => x.name === current);
    if (!curH) return;
    const [lo, hi] = currentWindow();
    const a = Math.max(0, Math.ceil((lo - curH.t0) / HOUR)), b = Math.min(curH.raw.length - 1, Math.floor((hi - curH.t0) / HOUR));
    if (b < a) { alert("이 기간에는 조위 자료가 없습니다."); return; }
    if (b - a > 200000 && !confirm(`${(b - a + 1).toLocaleString()}시간 분량이라 파일이 큽니다 (수 MB). 계속할까요?`)) return;
    // 태풍 사건 구간 표시용 (시간순으로 훑기)
    const wins = s.events.map((e) => ({ a: toMs(e.t0), b: toMs(e.t0) + (e.v.length - 1) * HOUR, name: `${e.typhoon} ${e.year}` }))
      .sort((x, y) => x.a - y.a);
    const out = ["관측소,시각_KST,조위_cm_DL,태풍_사건_구간"];
    let j = 0;
    for (let k = a; k <= b; k++) {
      const t = curH.t0 + k * HOUR, v = curH.raw[k];
      while (j < wins.length && wins[j].b < t) j++;
      const names = [];
      for (let q = j; q < wins.length && wins[q].a <= t; q++) if (wins[q].b >= t) names.push(wins[q].name);
      out.push(`${s.name},${kst(t)},${v === NULL16 ? "" : v / SCALE},${names.join(" / ")}`);
    }
    const blob = new Blob(["﻿" + out.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${s.name}_조위_${kst(lo).slice(0, 10)}_${kst(hi).slice(0, 10)}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  });
  function focusEvent(s, i) {
    const e = s.events[i];
    const a = toMs(e.t0), b = a + e.v.length * HOUR;
    chart.dispatchAction({ type: "dataZoom", startValue: a - 12 * HOUR, endValue: b + 12 * HOUR });
    showTrack(e, s);
    document.querySelectorAll("#ty-list tbody tr").forEach((tr) => tr.classList.toggle("sel", +tr.dataset.i === i));
    document.getElementById("ty-info").innerHTML =
      `<b>${e.typhoon} ${e.year}</b> · 최고 ${e.esl.toFixed(0)} cm (${e.peak} KST) · ${e.level}` +
      ` · 최소 거리 ${e.dist_km == null ? "–" : e.dist_km + " km"} · 최저 기압 ${e.min_pres == null ? "–" : e.min_pres + " hPa"}` +
      (e.datum ? ` · <span class="mark">※ 기준면 불확실 기간</span>` : "") +
      ` <button class="link" id="zoom-all">전체 기간 보기</button> <button class="link" id="pop-open">자세히</button>`;
    document.getElementById("zoom-all").onclick = () => { chart.dispatchAction({ type: "dataZoom", start: 0, end: 100 }); document.getElementById("ty-info").innerHTML = ""; clearTrack(); };
    document.getElementById("pop-open").onclick = () => openPopup(s, e);
  }

  /* ---------- 사건 팝업 ---------- */
  let popChart = null;
  const pop = document.getElementById("popup");
  function openPopup(s, e) {
    const a = toMs(e.t0);
    document.getElementById("pop-title").innerHTML =
      `${s.name} · ${e.typhoon} ${e.year} — 정점 ${e.peak} KST, ${e.esl.toFixed(0)} cm, <i class="dot" style="background:${LV_COLOR[e.level]}"></i>${e.level}`;
    document.getElementById("pop-note").innerHTML =
      `<p class="hint">위: 관측 조위(파랑)와 예측 조위(회색 점선 = 천문조 + 연평균해면). 아래: 해일(보라) = 관측 − 예측. ` +
      `두 선의 차이가 태풍·기압 때문에 더 오른 높이입니다. 해일에는 계절 변화도 조금 섞여 있습니다 (자료 README 2절).</p>` +
      (e.datum ? `<div class="caution">※ 이 사건은 기준면이 바뀌었을 수 있는 기간에 있습니다 (${e.datum}).</div>` : "") +
      (!s.official ? `<div class="caution">참고사항: 임시 규칙으로 판정한 관측소입니다.</div>` : "");
    pop.hidden = false;
    if (!popChart) popChart = echarts.init(document.getElementById("pop-chart"));
    // 관측 조위 = 예측 조위(천문조 + 연평균해면) + 해일 (자료 README 1.2절). 위: 관측·예측, 아래: 해일 = 관측 − 예측
    const tt = (k) => a + k * HOUR;
    const obs = e.v.map((v, k) => [tt(k), v]);
    const prd = (e.p || []).map((p, k) => [tt(k), p]);
    const sur = e.v.map((v, k) => [tt(k), v == null || e.p == null || e.p[k] == null ? null : Math.round((v - e.p[k]) * 10) / 10]);
    const axTxt = { color: "#525252" };
    const fmt = (x) => (x == null ? "–" : x.toFixed(0) + " cm");
    popChart.setOption({
      animation: false,
      legend: { top: 0, right: 78, selectedMode: false, itemWidth: 18, itemHeight: 2, icon: "rect", textStyle: { color: "#525252", fontSize: 11 },
                data: ["관측 조위", "예측 조위 (천문조 + 연평균해면)", "해일 (관측 − 예측)"] },
      grid: [{ left: 64, right: 78, top: 30, height: "52%" }, { left: 64, right: 78, top: "72%", bottom: 34 }],
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      tooltip: { trigger: "axis", formatter: (ps) => {
        const k = Math.round((ps[0].value[0] - a) / HOUR);
        return `${kst(tt(k))} KST<br>관측 ${fmt(obs[k] && obs[k][1])}<br>예측 ${fmt(prd[k] && prd[k][1])}<br>해일 ${fmt(sur[k] && sur[k][1])}`;
      } },
      xAxis: [
        { type: "time", gridIndex: 0, axisLabel: { show: false } },
        { type: "time", gridIndex: 1, axisLabel: Object.assign({ formatter: (v) => kst(v).slice(5, 13) }, axTxt) },
      ],
      yAxis: [
        { type: "value", gridIndex: 0, scale: true, name: "조위 cm (D.L.)", nameLocation: "middle", nameRotate: 90, nameGap: 46, nameTextStyle: axTxt, axisLabel: axTxt },
        { type: "value", gridIndex: 1, scale: true, name: "해일 cm", nameLocation: "middle", nameRotate: 90, nameGap: 46, nameTextStyle: axTxt, axisLabel: axTxt,
          splitNumber: 3 },
      ],
      series: [
        { id: "level", name: "관측 조위", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: obs, showSymbol: false, connectNulls: false,
          lineStyle: { width: 1.5, color: "#4589ff" }, itemStyle: { color: "#4589ff" }, markLine: { symbol: "none", silent: true, data: thLines(s) },
          markPoint: { symbol: "circle", symbolSize: 12, itemStyle: { color: LV_COLOR[e.level] },
                       data: [{ coord: [toMs(e.peak), e.esl], label: { show: false } }] } },
        { id: "pred", name: "예측 조위 (천문조 + 연평균해면)", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: prd, showSymbol: false, connectNulls: false,
          lineStyle: { width: 1, color: "#8d8d8d", type: "dashed" }, itemStyle: { color: "#8d8d8d" }, z: 1 },
        { id: "surge", name: "해일 (관측 − 예측)", type: "line", xAxisIndex: 1, yAxisIndex: 1, data: sur, showSymbol: false, connectNulls: false,
          lineStyle: { width: 1.2, color: "#8a3ffc" }, itemStyle: { color: "#8a3ffc" }, areaStyle: { color: "rgba(138,63,252,0.12)" },
          markLine: { symbol: "none", silent: true, label: { show: false }, lineStyle: { color: "#a8a8a8", type: "solid", width: 1 }, data: [{ yAxis: 0 }] } },
      ],
    }, true);
    popChart.resize();
    spreadThLabels(popChart, s);
  }
  function closePopup() { pop.hidden = true; }
  document.getElementById("pop-close").addEventListener("click", closePopup);
  pop.addEventListener("click", (ev) => { if (ev.target === pop) closePopup(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closePopup(); });

  select(ST.some((s) => s.name === DEFAULT_STATION) ? DEFAULT_STATION : ST[0].name);
})();
