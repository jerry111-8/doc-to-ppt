/*!
 * doc-to-ppt engine — turns deck.json + style.json into slides.
 * One layout code path, two back ends: HTML preview (browser) and .pptx (pptxgenjs, browser or Node).
 * MIT License.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./icons.js"));
  else root.Doc2PPT = factory(root.DOC2PPT_ICONS);
})(typeof self !== "undefined" ? self : this, function (ICONS) {
  "use strict";

  var W = 13.333, H = 7.5, X0 = 0.45, CW = 12.43, XR = X0 + CW;

  // ------------------------------------------------------------------ style
  var TRAITS = ["palette", "fonts", "header", "footer", "nav", "card", "titleBox", "number", "icon", "emphasis", "animation"];
  var OPTIONS = {
    header: [["slash", "斜杠色块"], ["line", "细线"]],
    footer: [["bar", "页脚条"], ["min", "极简页码"], ["none", "不要页脚"]],
    nav: [[true, "显示导航条"], [false, "不显示"]],
    card: [["soft", "白卡 + 柔和投影"], ["strong", "白卡 + 较强投影"], ["flat", "扁平浅底"], ["outline", "只描边"]],
    titleBox: [["solid", "实心主色直角"], ["round", "实心主色圆角"], ["pale", "浅底主色字"], ["underline", "只有下划线"]],
    number: [["circle", "实心圆数字"], ["square", "方块数字"], ["code", "圈码 ①②③"], ["none", "不用编号"]],
    icon: [["dot", "实心圆底 + 白色图标"], ["line", "线性图标"], ["none", "尽量不用图标"]],
    emphasis: [["accent", "强调色加粗"], ["primary", "主色加粗"], ["highlight", "浅色底高亮"], ["bold", "只加粗不变色"]],
    animation: [["speech", "按讲稿语速自动出现"], ["standard", "标准：重点处点击"], ["simple", "精简：每块点击一次"], ["none", "不要动画"]],
  };
  var TRAIT_LABEL = { palette: "配色", fonts: "字体", header: "页眉", footer: "页脚", nav: "导航条", card: "卡片与立体", titleBox: "标题框", number: "编号", icon: "图标", emphasis: "强调", animation: "动画" };
  var DEFAULT_STYLE = {
    name: "academic-blue-orange", label: "蓝橙学术",
    palette: { primary: "2F6DB5", dark: "0F3A75", accent: "E8961E", pale: "EEF3FA", pale2: "DCE6F4", mid: "C6D7EE", text: "1F2937", muted: "6B7280", gray: "A6ADB8", warm: "FFF4E5", warmEdge: "F6D7A7", line: "DCE3EC" },
    fonts: { head: "Microsoft YaHei", body: "Microsoft YaHei" },
    header: "slash", footer: "bar", nav: true, card: "soft", titleBox: "solid", number: "circle", icon: "dot", emphasis: "accent", animation: "standard",
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function hex(h) { h = String(h || "").replace("#", "").toUpperCase(); return /^[0-9A-F]{6}$/.test(h) ? h : null; }
  function rgb(h) { return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function toHex(a) { return a.map(function (v) { return ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join("").toUpperCase(); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return toHex(x.map(function (v, i) { return v * (1 - t) + y[i] * t; })); }
  function hsl(h) {
    var c = rgb(h).map(function (v) { return v / 255; }), mx = Math.max.apply(0, c), mn = Math.min.apply(0, c), l = (mx + mn) / 2, s = 0, hh = 0, d = mx - mn;
    if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === c[0] ? (c[1] - c[2]) / d + (c[1] < c[2] ? 6 : 0) : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4; hh *= 60; }
    return [hh, s, l];
  }
  function fromHsl(h, s, l) {
    h = ((h % 360) + 360) % 360; var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r;
    r = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return toHex(r.map(function (v) { return (v + m) * 255; }));
  }
  /** Build a full palette from one primary colour (rules from SKILL.md 第 3 节). */
  function derivePalette(primary, accent) {
    var p = hex(primary) || "2F6DB5", h = hsl(p);
    var acc = hex(accent) || fromHsl(h[0] + 180 + (h[0] > 180 ? 20 : -20), 0.72, 0.5);
    return { primary: p, dark: mix(p, "000000", 0.45), accent: acc, pale: mix(p, "FFFFFF", 0.92), pale2: mix(p, "FFFFFF", 0.85), mid: mix(p, "FFFFFF", 0.75),
      text: "1F2937", muted: "6B7280", gray: "A6ADB8", warm: mix(acc, "FFFFFF", 0.9), warmEdge: mix(acc, "FFFFFF", 0.6), line: "DCE3EC" };
  }
  /**
   * resolveStyle(spec, themes)
   *   spec: a full style object, a theme name, or { base, use: {trait: themeName}, override: {...} }
   *   themes: { name: themeObject }
   */
  function resolveStyle(spec, themes) {
    themes = themes || {};
    if (typeof spec === "string") spec = themes[spec] || { base: spec };
    spec = spec || {};
    var out;
    if (spec.base) {
      out = clone(themes[spec.base] || DEFAULT_STYLE);
      Object.keys(spec.use || {}).forEach(function (k) {
        var parts = k.split("."), donor = themes[spec.use[k]];
        if (!donor) return;
        if (parts[1]) { out[parts[0]] = Object.assign({}, out[parts[0]], (function (o) { o[parts[1]] = donor[parts[0]][parts[1]]; return o; })({})); }
        else out[parts[0]] = clone(donor[parts[0]]);
      });
      if (spec.override) Object.keys(spec.override).forEach(function (k) {
        out[k] = (typeof spec.override[k] === "object" && !Array.isArray(spec.override[k])) ? Object.assign({}, out[k], spec.override[k]) : spec.override[k];
      });
    } else out = clone(spec);
    var d = clone(DEFAULT_STYLE);
    TRAITS.forEach(function (t) { if (out[t] === undefined) out[t] = d[t]; });
    out.palette = Object.assign({}, d.palette, out.palette || {});
    out.fonts = Object.assign({}, d.fonts, out.fonts || {});
    out.name = out.name || "custom"; out.label = out.label || out.name;
    return out;
  }

  // ------------------------------------------------------------------ text helpers
  /** "普通 **关键词** 普通\n第二行" -> runs [{text, em, br}] */
  function parseRich(str) {
    var runs = [];
    String(str == null ? "" : str).split("\n").forEach(function (line, li, arr) {
      var parts = line.split(/\*\*(.+?)\*\*/);
      parts.forEach(function (p, i) { if (p !== "") runs.push({ text: p, em: i % 2 === 1 }); });
      if (!parts.join("")) runs.push({ text: "" });
      if (li < arr.length - 1) runs[runs.length - 1].br = true;
    });
    return runs;
  }
  function plain(str) { return String(str == null ? "" : str).replace(/\*\*/g, ""); }
  function len(str) { return plain(str).length; }
  var CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

  // ------------------------------------------------------------------ op builder
  function Ctx(style, deck, slide, index) {
    this.S = style; this.P = style.palette; this.deck = deck; this.slide = slide; this.index = index;
    this.ops = []; this.g = 0; this.top = 1.05; this.bottom = 6.95;
  }
  var C = Ctx.prototype;
  C.group = function (k) { this.g = k; return this; };
  C.push = function (o) { o.g = this.g; this.ops.push(o); return o; };
  C.rect = function (x, y, w, h, o) { o = o || {}; return this.push({ t: "rect", x: x, y: y, w: w, h: h, fill: o.fill, line: o.line, lineW: o.lineW, dash: o.dash, radius: o.radius, shadow: o.shadow }); };
  C.shape = function (kind, x, y, w, h, o) { o = o || {}; return this.push({ t: "shape", kind: kind, x: x, y: y, w: w, h: h, fill: o.fill, line: o.line, lineW: o.lineW, dash: o.dash, flipH: o.flipH }); };
  C.line = function (x, y, w, h, o) { o = o || {}; return this.push({ t: "line", x: x, y: y, w: w, h: h, color: o.color || this.P.primary, width: o.width || 1.25, dash: o.dash, arrow: o.arrow }); };
  C.text = function (x, y, w, h, content, o) {
    o = o || {};
    return this.push({ t: "text", x: x, y: y, w: w, h: h, runs: Array.isArray(content) ? content : parseRich(content),
      size: o.size || 14, color: o.color || this.P.text, bold: !!o.bold, italic: !!o.italic, align: o.align || "left", valign: o.valign || "top",
      font: o.font || this.S.fonts.body, spacing: o.spacing || 1, vert: !!o.vert, emColor: o.emColor });
  };
  C.icon = function (x, y, s, name, color) { if (!ICONS[name]) name = "star"; return this.push({ t: "icon", x: x, y: y, w: s, h: s, name: name, color: color, variant: this.S.icon === "line" ? "line" : "solid" }); };
  C.photo = function (x, y, w, h, label, src) { return this.push({ t: "photo", x: x, y: y, w: w, h: h, label: label, src: src }); };
  C.chart = function (x, y, w, h, spec) { return this.push({ t: "chart", x: x, y: y, w: w, h: h, spec: spec }); };
  C.table = function (x, y, w, spec) { return this.push({ t: "table", x: x, y: y, w: w, spec: spec }); };

  // components ---------------------------------------------------------
  C.card = function (x, y, w, h, kind) {
    var P = this.P, k = kind || this.S.card;
    if (k === "flat") return this.rect(x, y, w, h, { fill: P.pale });
    if (k === "outline") return this.rect(x, y, w, h, { fill: "FFFFFF", line: P.mid, lineW: 1 });
    return this.rect(x, y, w, h, { fill: "FFFFFF", line: P.line, lineW: 0.75, shadow: k === "strong" ? "strong" : "soft" });
  };
  C.head = function (x, y, w, text, color) {
    var P = this.P, k = this.S.titleBox, fill = color || P.primary;
    if (k === "underline") { this.line(x, y + 0.44, w, 0, { color: fill, width: 1.5 }); return this.text(x, y, w, 0.42, text, { size: 15, bold: true, color: fill, align: "center", valign: "middle" }); }
    if (k === "pale") { this.rect(x, y, w, 0.44, { fill: P.pale2 }); return this.text(x, y, w, 0.44, text, { size: 15, bold: true, color: fill, align: "center", valign: "middle" }); }
    this.rect(x, y, w, 0.44, { fill: fill, radius: k === "round" ? 0.08 : 0 });
    return this.text(x, y, w, 0.44, text, { size: 15, bold: true, color: "FFFFFF", align: "center", valign: "middle", emColor: "FFFFFF" });
  };
  C.num = function (x, y, n, d) {
    var P = this.P, k = this.S.number; d = d || 0.42;
    if (k === "none") return;
    if (k === "code") return this.text(x, y, d, d, CIRCLED[(n - 1) % 10] || String(n), { size: d * 48, bold: true, color: P.accent, align: "center", valign: "middle" });
    if (k === "square") this.rect(x, y, d, d, { fill: P.primary });
    else this.shape("oval", x, y, d, d, { fill: P.accent, line: "FFFFFF", lineW: 1.5 });
    return this.text(x, y, d, d, String(n), { size: d * 33, bold: true, color: "FFFFFF", align: "center", valign: "middle", font: "Arial" });
  };
  C.iconDot = function (x, y, name, d, color) {
    var P = this.P; d = d || 0.6; color = color || P.primary;
    if (this.S.icon === "none" || !name) return;
    if (this.S.icon === "line") return this.icon(x + d * 0.12, y + d * 0.12, d * 0.76, name, color);
    this.shape("oval", x, y, d, d, { fill: color });
    return this.icon(x + d * 0.25, y + d * 0.25, d * 0.5, name, "FFFFFF");
  };
  C.pill = function (x, y, w, h, text, fill, color, size, bold) {
    this.rect(x, y, w, h, { fill: fill, radius: h / 2 });
    return this.text(x, y, w, h, text, { size: size || 12, bold: bold !== false, color: color || "FFFFFF", align: "center", valign: "middle", emColor: color || "FFFFFF" });
  };
  C.tag = function (x, y, text, w) {
    w = w || Math.max(1.1, len(text) * 0.17 + 0.35);
    this.rect(x, y, w, 0.3, { fill: "FFFFFF", line: this.P.accent, lineW: 1, radius: 0.15 });
    return this.text(x, y, w, 0.3, text, { size: 11, bold: true, color: this.P.accent, align: "center", valign: "middle" });
  };
  C.dashBox = function (x, y, w, h, color) { return this.rect(x, y, w, h, { line: color || this.P.accent, lineW: 1.25, dash: "dash" }); };
  C.conclusion = function (text, label) {
    var P = this.P, y = 6.22, h = 0.62;
    this.rect(X0, y, CW, h, { fill: P.warm, line: P.warmEdge, lineW: 1 });
    var runs = [];
    if (label !== false) runs.push({ text: (label || "核心观点") + "：", em: true });
    runs = runs.concat(parseRich(text));
    return this.text(X0 + 0.25, y, CW - 0.5, h, runs, { size: 15, valign: "middle" });
  };
  C.source = function (text) { return this.text(6.2, 6.86, XR - 6.2, 0.24, "Source From：" + text, { size: 10, italic: true, color: this.P.muted, align: "right" }); };
  C.bullets = function (x, y, w, h, items, o) {
    o = o || {}; var self = this, P = this.P, step = o.step || 0.52, size = o.size || 13.5;
    (items || []).forEach(function (it, i) {
      var yy = y + i * step;
      if (yy + step > y + h + 0.05) return;
      if (o.check) self.icon(x, yy + 0.07, 0.22, "check", P.primary);
      else self.rect(x + 0.04, yy + 0.14, 0.09, 0.09, { fill: P.accent });
      self.text(x + 0.32, yy, w - 0.32, step, it, { size: size });
    });
  };

  // chrome -------------------------------------------------------------
  function sectionOf(deck, slide) { return slide.section == null ? -1 : slide.section; }
  C.chrome = function (opts) {
    opts = opts || {};
    var S = this.S, P = this.P, s = this.slide, deck = this.deck, meta = deck.meta || {};
    this.group(0);
    if (S.header === "slash") {
      this.push({ t: "headerArt", x: 0, y: 0, w: 1.75, h: 0.8 });
      this.icon(0.15, 0.17, 0.46, meta.icon || "layers", "FFFFFF");
    }
    if (opts.titleOnly === "art") return;
    if (s.title || s.no) {
      var runs = [];
      if (S.header === "slash") {
        if (s.no) runs.push({ text: "No " + s.no + "   ", italic: true, color: P.primary, size: 22 });
        runs.push({ text: plain(s.title) });
        this.text(1.9, 0.12, 7.2, 0.64, runs, { size: 24, bold: true, color: P.dark, valign: "middle", font: S.fonts.head });
        this.line(1.85, 0.82, XR - 1.85, 0, { color: P.primary, width: 0.75 });
      } else {
        this.rect(0.5, 0.36, 0.18, 0.18, { fill: P.primary });
        if (s.no) runs.push({ text: s.no + "  ", color: P.primary });
        runs.push({ text: plain(s.title) });
        this.text(0.82, 0.14, 7.6, 0.62, runs, { size: 24, bold: true, color: P.dark, valign: "middle", font: S.fonts.head });
        this.line(0.5, 0.82, XR - 0.5, 0, { color: P.mid, width: 1 });
      }
    }
    var nav = meta.nav || meta.sections || [], cur = sectionOf(deck, s);
    if (S.nav && nav.length && cur >= 0 && !opts.noNav) {
      var n = Math.min(nav.length, 6), pw = 0.62, gap = 0.08, x0 = XR - n * (pw + gap) + gap;
      for (var i = 0; i < n; i++) {
        var on = i === cur, done = i < cur, x = x0 + i * (pw + gap), lab = String(nav[i]).slice(0, 3);
        this.rect(x, 0.27, pw, 0.3, { fill: on ? P.primary : (done ? P.pale2 : P.pale), radius: 0.15 });
        this.text(x, 0.27, pw, 0.3, lab, { size: 10.5, bold: on, color: on ? "FFFFFF" : (done ? P.dark : P.gray), align: "center", valign: "middle" });
      }
    }
    if (s.tag) { this.tag(XR - Math.max(1.1, len(s.tag) * 0.17 + 0.35), 0.9, s.tag); this.top = 1.28; }
    if (!opts.noFooter) {
      var secs = meta.sections || [], part = cur >= 0 && secs[cur] ? "Part " + (cur + 1) + "：" + secs[cur] : (meta.title || "");
      if (S.footer === "bar") {
        this.rect(0, 7.12, W, 0.38, { fill: P.gray });
        this.text(0.4, 7.12, 7, 0.38, part, { size: 12, color: "FFFFFF", valign: "middle" });
        this.rect(11.85, 7.12, W - 11.85, 0.38, { fill: P.primary });
        this.text(11.85, 7.12, W - 11.85, 0.38, "◀     " + (this.index + 1) + "     ▶", { size: 11, color: "FFFFFF", align: "center", valign: "middle" });
      } else if (S.footer === "min") {
        this.text(0.5, 7.08, 7, 0.3, part, { size: 11, color: P.gray, valign: "middle" });
        this.text(12.2, 7.08, 0.65, 0.3, String(this.index + 1), { size: 11, color: P.gray, align: "right", valign: "middle", font: "Arial" });
      }
    }
    this.bottom = s.conclusion ? 6.08 : (s.source ? 6.72 : 6.95);
  };
  C.finish = function (concGroup) {
    var s = this.slide;
    if (s.conclusion) { this.concG = concGroup || 9; this.group(this.concG); this.conclusion(s.conclusion, s.conclusionLabel); }
    this.group(0);
    if (s.source) this.source(s.source);
  };

  // ------------------------------------------------------------------ layouts
  function splitGroups(n) { return n <= 3 ? function (i) { return i + 1; } : function (i) { return i < Math.ceil(n / 2) ? 1 : 2; }; }

  var LAYOUTS = [];
  function L(def) { LAYOUTS.push(def); }

  L({ id: "cover", letter: "封面", name: "封面", use: "第一页：标题、副标题、作者信息；右侧放核心数字或封面图。",
    fields: "无需 title。读取 meta.title / subtitle / english / course / author / date。可选 highlights: [{value, label}] 最多 3 个；或 image（图片地址）。",
    sample: { layout: "cover", highlights: [{ value: "+7.5%", label: "管理岗招聘" }, { value: "+1.4 pp", label: "管理岗占比" }, { value: "≈0", label: "相对薪资变化" }] },
    render: function (c, s, deck) {
      var P = c.P, m = deck.meta || {};
      c.chrome({ titleOnly: "art" });
      if (c.S.header !== "slash") c.rect(0, 0, W, 0.12, { fill: P.primary });
      c.group(0);
      c.pill(0.8, 1.45, Math.max(2.4, len(m.course || "汇报") * 0.2 + 0.6), 0.42, m.course || "汇报", P.pale, P.primary, 12.5);
      var t = m.title || "标题", big = len(t) > 14 ? 32 : 40;
      c.text(0.8, 2.05, 6.9, 1.0, t, { size: big, bold: true, color: P.dark, valign: "middle", font: c.S.fonts.head });
      if (m.subtitle) c.text(0.8, 3.05, 6.9, 0.7, m.subtitle, { size: 22, bold: true, color: P.primary, valign: "middle" });
      c.rect(0.8, 3.95, 0.9, 0.06, { fill: P.accent });
      if (m.english) c.text(0.8, 4.18, 6.9, 0.8, m.english, { size: 13, color: P.muted });
      [["file", m.courseLine || m.course], ["users", m.author], ["calendar", m.date]].filter(function (r) { return r[1]; }).forEach(function (r, i) {
        c.iconDot(0.8, 5.25 + i * 0.58, r[0], 0.42);
        c.text(1.38, 5.25 + i * 0.58, 5.5, 0.42, r[1], { size: 15, valign: "middle" });
      });
      if (s.highlights && s.highlights.length) {
        c.card(7.85, 1.3, 4.85, 5.0);
        c.text(7.85, 1.45, 4.85, 0.4, s.highlightsTitle || "核心发现", { size: 14, bold: true, color: P.dark, align: "center" });
        var hs = s.highlights.slice(0, 3), hh = 4.2 / hs.length;
        hs.forEach(function (it, i) {
          var y = 1.95 + i * hh;
          c.text(7.95, y, 4.65, hh * 0.58, it.value, { size: 34, bold: true, color: i === 0 ? P.accent : P.primary, align: "center", valign: "bottom", font: "Arial" });
          c.text(7.95, y + hh * 0.58, 4.65, hh * 0.36, it.label, { size: 13, color: P.muted, align: "center" });
        });
      } else c.photo(7.75, 1.0, 4.95, 5.5, s.photoLabel || "P1｜封面图（建议：与主题相关的真实照片）", s.image);
    } });

  L({ id: "section", letter: "目录", name: "章节目录页", use: "每章开头：左侧配图，右侧章节编号胶囊，当前章节高亮。",
    fields: "section: 当前章节序号（从 0 开始）。可选 photoLabel、image。章节名取 meta.sections。",
    sample: { layout: "section", section: 1 },
    render: function (c, s, deck) {
      var P = c.P, m = deck.meta || {}, secs = m.sections || ["第一部分", "第二部分", "第三部分", "第四部分"];
      c.group(0);
      c.text(0.5, 0.35, 9, 0.5, m.title || "", { size: 18, bold: true, color: P.dark });
      c.photo(0.6, 1.3, 5.5, 5.2, s.photoLabel || ("P" + ((s.section || 0) + 2) + "｜章节配图"), s.image);
      var n = secs.length, cols = n > 3 ? 2 : 1, rows = Math.ceil(n / cols), rh = Math.min(1.6, 4.6 / rows);
      secs.forEach(function (name, i) {
        var col = cols === 2 ? i % 2 : 0, row = cols === 2 ? Math.floor(i / 2) : i;
        var x = (cols === 2 ? 6.55 : 7.2) + col * 3.35, y = 1.6 + row * rh + (4.6 - rows * rh) / 2, on = i === s.section;
        c.text(x, y, 1.0, 0.8, ("0" + (i + 1)).slice(-2), { size: 38, bold: true, italic: true, color: on ? P.primary : P.gray, valign: "middle", font: "Arial" });
        c.pill(x + 1.05, y + 0.1, cols === 2 ? 2.1 : 3.6, 0.62, name, on ? P.primary : P.pale2, on ? "FFFFFF" : P.muted, len(name) > 7 ? 13 : 15);
      });
    } });

  L({ id: "abstract", letter: "摘要", name: "摘要 / 论文信息", use: "Abstract 页：论文题目、期刊与版本、一段概述和 3–4 条主要结论。",
    fields: "paper: {title, info}；text: 概述段；points: [3–4 条结论，可用 **关键词**]；可选 conclusion。",
    sample: { layout: "abstract", no: "", title: "Abstract", section: 0, paper: { title: "AI Adoption and the Demand for Managerial Expertise", info: "Strategic Management Journal（2026）｜数字取自 2024 年工作论文" },
      text: "作者用 Lightcast 招聘数据构建基于技能的 AI 采纳测度，匹配 Compustat 上市公司，并用 Bartik 式工具变量识别 AI 采纳对管理者需求与技能的影响。",
      points: ["AI 岗位占比每提高 1 个百分点，**管理岗招聘增加 7.5%**，占比上升 1.4 个百分点", "协作、创造力、数据分析的要求上升，排程、预算等例行技能下降", "管理岗薪资上涨约 7%，但与非管理岗的**相对差距无显著变化**"] },
    render: function (c, s) {
      var P = c.P; c.chrome(); var top = c.top;
      c.group(1);
      var p = s.paper || {};
      var tl = len(p.title), tsz = tl > 70 ? 15 : 18, th1 = tl > Math.floor(CW * 72 / tsz * 1.6) ? 0.85 : 0.5;
      c.text(X0 + 0.1, top + 0.05, CW - 0.2, th1, p.title || "", { size: tsz, bold: true, color: P.primary, valign: "middle" });
      if (p.info) c.text(X0 + 0.1, top + 0.08 + th1, CW - 0.2, 0.36, p.info, { size: 12.5, color: P.muted });
      c.group(2);
      var y = top + 0.6 + th1, maxH = c.bottom - y;
      var th = s.text ? Math.min(1.6, 0.3 * Math.ceil(len(s.text) / 52) + 0.25) : 0;
      var pts = s.points || [], step = Math.min(0.66, (maxH - th - 0.5) / Math.max(1, pts.length)), h = Math.min(maxH, th + pts.length * step + 0.6);
      c.card(X0, y, CW, h);
      if (s.text) c.text(X0 + 0.35, y + 0.25, CW - 0.7, th, s.text, { size: 14.5, spacing: 1.2 });
      pts.forEach(function (pt, i) {
        var yy = y + 0.35 + th + i * step;
        c.num(X0 + 0.35, yy + 0.06, i + 1, 0.36);
        c.text(X0 + 0.9, yy, CW - 1.3, step, pt, { size: 14.5, valign: "middle" });
      });
      c.finish(3);
    } });

  L({ id: "columns", letter: "列", name: "并列卡片", use: "2–4 个并列要点：每列标题框 + 卡片（图标、短句、要点列表、底部标签）。",
    fields: "columns: [{head, icon?, lead?, bullets: [..]（≤4）, tag?}]，2–4 列；可选 conclusion、source、tag。",
    sample: { layout: "columns", no: "4.3", title: "研究局限", section: 4, columns: [
      { head: "作者承认", icon: "file", lead: "数据与测量的限制", bullets: ["招聘不等于实际雇佣", "AI 占比是有噪声的代理", "证据来自 AI 应用早期"] },
      { head: "汇报人评述", icon: "search", lead: "**排他性**最难验证", bullets: ["机制未直接检验", "看不到内部晋升", "样本止于 2022 年"], tag: "汇报人观点" },
      { head: "结论边界", icon: "target", lead: "适用范围", bullets: ["美国上市公司", "2022 年以前", "不含信息与专业服务业"] }], conclusion: "结论稳健，但**适用于生成式 AI 之前**" },
    render: function (c, s) {
      var P = c.P; c.chrome(); var top = c.top, cols = (s.columns || []).slice(0, 4), n = Math.max(1, cols.length), gap = 0.25, w = (CW - (n - 1) * gap) / n, gfn = splitGroups(n);
      cols.forEach(function (col, i) {
        c.group(gfn(i));
        var x = X0 + i * (w + gap), y = top + 0.6, h = c.bottom - y;
        c.head(x, top, w, col.head || "");
        c.card(x, y, w, h);
        var yy = y + 0.2;
        if (col.icon && c.S.icon !== "none") { c.iconDot(x + w / 2 - 0.3, yy, col.icon, 0.6); yy += 0.78; }
        if (col.lead) { c.text(x + 0.2, yy, w - 0.4, 0.7, col.lead, { size: 15, bold: true, color: P.dark, align: "center", valign: "middle" }); yy += 0.82; }
        var bh = h - (yy - y) - (col.tag ? 0.6 : 0.15);
        c.bullets(x + 0.25, yy, w - 0.45, bh, col.bullets || [], { step: Math.min(0.6, bh / Math.max(1, (col.bullets || []).length)) });
        if (col.tag) c.pill(x + w / 2 - 0.9, y + h - 0.5, 1.8, 0.34, col.tag, P.warm, P.accent, 11.5);
      });
      c.finish(Math.min(n, 3) + 1);
    } });

  L({ id: "rq", letter: "D", name: "研究问题（三列）", use: "研究问题 / RQ：每列一个问题，下面写指标、方法和回答页。",
    fields: "questions: [{label, icon?, q（可用 **关键词**）, items: [{k, v}]（≤2）, answer?}]，2–4 个。",
    sample: { layout: "rq", no: "1.2", title: "研究问题", section: 0, questions: [
      { label: "RQ① 有多少？", icon: "users", q: "AI 采纳会改变企业对**管理者的需求**吗？", items: [{ k: "指标", v: "管理岗招聘数量与占比" }, { k: "方法", v: "固定效应 + IV" }], answer: "回答页：第 9 页" },
      { label: "RQ② 做什么？", icon: "brain", q: "管理者需要的**技能**会怎样变化？", items: [{ k: "指标", v: "前 100 项管理技能" }, { k: "方法", v: "逐项 IV" }], answer: "回答页：第 10 页" },
      { label: "RQ③ 值多少？", icon: "coins", q: "管理者变得**更值钱**了吗？", items: [{ k: "指标", v: "招聘薪资与总招聘" }, { k: "方法", v: "IV 回归" }], answer: "回答页：第 11 页" }] },
    render: function (c, s) {
      var P = c.P; c.chrome(); var top = c.top, qs = (s.questions || []).slice(0, 4), n = Math.max(1, qs.length), gap = 0.3, w = (CW - (n - 1) * gap) / n, gfn = splitGroups(n);
      qs.forEach(function (q, i) {
        c.group(gfn(i));
        var x = X0 + i * (w + gap), y = top + 0.22, h = c.bottom - y;
        c.card(x, y, w, h);
        c.pill(x + w / 2 - 1.15, top, 2.3, 0.44, q.label || "", P.primary, "FFFFFF", 14);
        var yy = y + 0.45;
        if (q.icon) { c.iconDot(x + w / 2 - 0.3, yy, q.icon, 0.6); yy += 0.75; }
        c.text(x + 0.25, yy, w - 0.5, 0.95, q.q || "", { size: 15, bold: true, color: P.dark, align: "center", valign: "middle" });
        yy += 1.1;
        (q.items || []).slice(0, 2).forEach(function (it, j) {
          c.rect(x + 0.2, yy + j * 0.55, w - 0.4, 0.45, { fill: P.pale });
          c.text(x + 0.35, yy + j * 0.55, w - 0.6, 0.45, [{ text: it.k + "　", bold: true, color: P.primary }].concat(parseRich(it.v)), { size: 13, valign: "middle" });
        });
        if (q.answer) { c.rect(x + w / 2 - 1.1, y + h - 0.6, 2.2, 0.36, { fill: "FFFFFF", line: P.accent, lineW: 1 }); c.text(x + w / 2 - 1.1, y + h - 0.6, 2.2, 0.36, q.answer, { size: 12, bold: true, color: P.accent, align: "center", valign: "middle" }); }
      });
      c.finish(Math.min(n, 3) + 1);
    } });

  L({ id: "framework", letter: "B", name: "总体框架（三栏）", use: "全篇路线图：输入（维度 / 问题）→ 中心对象 → 输出（功能 / 结论）。",
    fields: "left: {head, tag?, items: [{icon?, title, text}]（≤4）}；center: {head, title, text}；right: {head, tag?, items: [{title, text}]（≤3）}；可选 conclusion。",
    sample: { layout: "framework", no: "1.3", title: "总体框架", section: 0,
      left: { head: "两股力量", tag: "回应缺口①", items: [{ icon: "up", title: "增加管理需求", text: "监督、解读、协调 AI" }, { icon: "down", title: "减少管理需求", text: "自动化部分监督任务" }, { icon: "scale", title: "作者假设", text: "AI 扩大管理职责" }] },
      center: { head: "核心对象", title: "AI 采纳", text: "用招聘广告中的 **AI 技能占比** 衡量" },
      right: { head: "三个问题", tag: "回应缺口②", items: [{ title: "有多少", text: "管理岗数量与占比" }, { title: "做什么", text: "管理技能的变化" }, { title: "值多少", text: "薪资与总招聘" }] },
      conclusion: "不是“AI 取代管理者”，而是**管理者的数量和工作内容都在变**" },
    render: function (c, s) {
      var P = c.P; c.chrome(); var top = c.top, L_ = s.left || {}, M = s.center || {}, R = s.right || {};
      var anyTag = L_.tag || R.tag, hy = anyTag ? Math.max(top, 1.22) : top, by = hy + 0.6, bh = c.bottom - by;
      c.group(1);
      c.head(0.55, hy, 3.95, L_.head || "");
      if (L_.tag) c.tag(4.5 - Math.max(1.1, len(L_.tag) * 0.17 + 0.35), hy - 0.36, L_.tag);
      var li = (L_.items || []).slice(0, 4), lh = (bh - (li.length - 1) * 0.14) / Math.max(1, li.length);
      li.forEach(function (it, i) {
        var y = by + i * (lh + 0.14);
        c.card(0.55, y, 3.95, lh);
        var tx = 0.75;
        if (it.icon && c.S.icon !== "none") { c.iconDot(0.72, y + lh / 2 - 0.3, it.icon, 0.6); tx = 1.48; }
        c.text(tx, y + 0.1, 4.4 - tx, lh * 0.45, it.title || "", { size: 14.5, bold: true, color: P.dark, valign: "bottom" });
        c.text(tx, y + 0.12 + lh * 0.45, 4.4 - tx, lh * 0.45, it.text || "", { size: 12.5, color: P.muted });
      });
      c.group(2);
      c.shape("chevron", 4.68, by + bh / 2 - 0.3, 0.38, 0.6, { fill: P.mid });
      c.head(5.2, hy, 3.25, M.head || "");
      c.card(5.2, by, 3.25, bh);
      var d = Math.min(2.2, bh * 0.5);
      c.shape("oval", 6.825 - d / 2 - 0.12, by + 0.35 - 0.12, d + 0.24, d + 0.24, { fill: P.pale2 });
      c.shape("oval", 6.825 - d / 2, by + 0.35, d, d, { fill: P.primary });
      c.text(6.825 - d / 2, by + 0.35, d, d, M.title || "", { size: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle", emColor: "FFFFFF" });
      c.text(5.35, by + 0.6 + d, 2.95, bh - d - 0.75, M.text || "", { size: 13, align: "center", valign: "middle" });
      c.group(3);
      c.shape("chevron", 8.62, by + bh / 2 - 0.3, 0.38, 0.6, { fill: P.mid });
      c.head(9.15, hy, 3.7, R.head || "");
      if (R.tag) c.tag(12.85 - Math.max(1.1, len(R.tag) * 0.17 + 0.35), hy - 0.36, R.tag);
      var ri = (R.items || []).slice(0, 3), rh = (bh - (ri.length - 1) * 0.16) / Math.max(1, ri.length);
      ri.forEach(function (it, i) {
        var y = by + i * (rh + 0.16);
        c.card(9.15, y, 3.7, rh);
        c.num(9.32, y + 0.18, i + 1);
        c.text(9.87, y + 0.16, 2.9, 0.46, it.title || "", { size: 15, bold: true, color: P.dark, valign: "middle" });
        c.text(9.32, y + 0.7, 3.4, rh - 0.78, it.text || "", { size: 13 });
      });
      c.finish(4);
    } });

  L({ id: "process", letter: "E", name: "流程 + 变化", use: "有先后的阶段：顶部 V 形阶段条，每段一张卡（图标、说明、变化标签），底部两块总结。",
    fields: "stages: [{name, icon?, text, tags?: [..]}]（3–6）；bottom?: [{head, text, style: 'card'|'dash'}]（≤2）。",
    sample: { layout: "process", no: "2.2", title: "变量测度", section: 2, stages: [
      { name: "锚定", icon: "target", text: "技能或职位含 ML、NLP、CV、AI", tags: ["明确 AI 岗位"] },
      { name: "技能打分", icon: "list", text: "技能出现在 AI 岗位的比例", tags: ["AI 相关度"] },
      { name: "岗位打分", icon: "bar", text: "岗位内各技能得分取平均", tags: ["岗位得分"] },
      { name: "判定", icon: "check", text: "平均分超过 10% 记为 AI 岗位", tags: ["AI 岗位清单"] }],
      bottom: [{ head: "三个核心变量", text: "AI Share、Managers Share、Skill j Share", style: "card" }, { head: "注意", text: "这里的 AI 主要是**机器学习**，未覆盖生成式 AI", style: "dash" }], source: "原文第 2.1 节" },
    render: function (c, s) {
      var P = c.P; c.chrome(); var top = c.top, st = (s.stages || []).slice(0, 6), n = Math.max(1, st.length), sw = CW / n, bot = (s.bottom || []).slice(0, 2);
      c.group(1);
      st.forEach(function (it, i) {
        var x = X0 + i * sw;
        c.shape(i === 0 ? "pentagon" : "chevron", x, top, sw + 0.04, 0.55, { fill: P.primary });
        c.text(x + (i === 0 ? 0.1 : 0.3), top, sw - 0.45, 0.55, it.name || "", { size: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle", emColor: "FFFFFF" });
      });
      c.group(2);
      var cy = top + 0.8, ch = (bot.length ? 5.0 - 0.15 : c.bottom) - cy;
      st.forEach(function (it, i) {
        var x = X0 + i * sw + 0.06, w = sw - 0.12, yy = cy + 0.18;
        c.card(x, cy, w, ch);
        if (it.icon && c.S.icon !== "none") { c.iconDot(x + w / 2 - 0.3, yy, it.icon, 0.6); yy += 0.75; }
        var tags = it.tags || [];
        c.text(x + 0.12, yy, w - 0.24, ch - (yy - cy) - (tags.length ? 0.6 : 0.15), it.text || "", { size: 13, align: "center", valign: "middle" });
        tags.slice(0, 2).forEach(function (tg, j) {
          var tw = Math.min(w - 0.2, (w - 0.2 - (tags.length - 1) * 0.08) / Math.min(2, tags.length));
          c.pill(x + 0.1 + j * (tw + 0.08), cy + ch - 0.5, tw, 0.36, tg, P.accent, "FFFFFF", 12);
        });
      });
      if (bot.length) {
        c.group(3);
        var bw = (CW - (bot.length - 1) * 0.23) / bot.length, by = 5.0, bh = c.bottom - by;
        bot.forEach(function (b, i) {
          var x = X0 + i * (bw + 0.23);
          if (b.style === "dash") c.dashBox(x, by, bw, bh); else c.card(x, by, bw, bh);
          c.text(x + 0.2, by + 0.1, bw - 0.4, 0.4, b.head || "", { size: 15, bold: true, color: b.style === "dash" ? P.accent : P.dark });
          c.text(x + 0.2, by + 0.52, bw - 0.4, bh - 0.6, b.text || "", { size: 14, spacing: 1.1 });
        });
      }
      c.finish(4);
    } });

  L({ id: "steps", letter: "P", name: "分级台阶", use: "分级量表 / 成熟度：上方两张说明卡，下方逐级升高的台阶，可标出案例所在级别。",
    fields: "intro?: [{head, text, icon?, tag?}]（≤2）；levels: [{name, text}]（3–6）；markers?: [{level（从 0 开始）, label}]。",
    sample: { layout: "steps", no: "3.2", title: "实证结果：异质性", section: 3, intro: [{ head: "按时期", icon: "clock", text: "按 1 个标准差计，2016 年后管理岗占比效应从 **1.8 pp** 升到 **3.7 pp**" }, { head: "按行业", icon: "industry", text: "只有**制造业**明确显著，贸易业的工具变量偏弱" }],
      levels: [{ name: "贸易", text: "−0.5 pp，弱工具" }, { name: "金融", text: "+0.9 pp，区间含零" }, { name: "其他", text: "+1.4 pp" }, { name: "制造业", text: "+2.5 pp，显著" }], markers: [{ level: 3, label: "效应最强" }] },
    render: function (c, s) {
      var P = c.P; c.chrome(); var top = c.top, intro = (s.intro || []).slice(0, 2), lv = (s.levels || []).slice(0, 6), n = Math.max(1, lv.length);
      var ih = intro.length ? 1.6 : 0;
      c.group(1);
      intro.forEach(function (it, i) {
        var w = intro.length === 1 ? CW : (CW - 0.3) / 2, x = X0 + i * (w + 0.3), tx = x + 0.25;
        c.card(x, top, w, ih);
        if (it.icon && c.S.icon !== "none") { c.iconDot(x + 0.2, top + 0.2, it.icon, 0.6); tx = x + 0.98; }
        c.text(tx, top + 0.15, w - (tx - x) - 0.2, 0.4, it.head || "", { size: 15, bold: true, color: P.dark });
        if (it.tag) c.tag(x + w - Math.max(1.1, len(it.tag) * 0.17 + 0.35) - 0.15, top + 0.17, it.tag);
        c.text(tx, top + 0.58, w - (tx - x) - 0.2, ih - 0.68, it.text || "", { size: 13.5, spacing: 1.1 });
      });
      c.group(2);
      var base = c.bottom, gap = 0.08, sw = (CW - (n - 1) * gap) / n, hMin = 1.1, hMax = Math.max(hMin + 0.4, base - (top + ih + 0.75)), inc = n > 1 ? (hMax - hMin) / (n - 1) : 0;
      lv.forEach(function (it, i) {
        var x = X0 + i * (sw + gap), h = hMin + i * inc, y = base - h, t = n > 1 ? i / (n - 1) : 1, fill = mix("FFFFFF", P.primary, 0.12 + 0.88 * t), dark = t >= 0.5;
        c.rect(x, y, sw, h, { fill: fill });
        c.rect(x, y - 0.1, sw, 0.1, { fill: "E9EDF2" });
        c.text(x + 0.1, y + 0.1, sw - 0.2, 0.38, it.name || "", { size: 14, bold: true, color: dark ? "FFFFFF" : P.dark, emColor: dark ? "FFFFFF" : null });
        c.text(x + 0.1, y + 0.5, sw - 0.2, h - 0.55, it.text || "", { size: 12, color: dark ? "FFFFFF" : P.text, emColor: dark ? "FFFFFF" : null });
      });
      c.group(3);
      (s.markers || []).forEach(function (m) {
        var i = Math.max(0, Math.min(n - 1, m.level | 0)), x = X0 + i * (sw + gap), y = base - (hMin + i * inc) - 0.56, pw = Math.min(sw - 0.45, len(m.label) * 0.17 + 0.4);
        c.icon(x + 0.06, y + 0.04, 0.34, "pin", P.primary);
        c.rect(x + 0.42, y + 0.04, pw, 0.36, { fill: "FFFFFF", line: P.primary, lineW: 1, radius: 0.18 });
        c.text(x + 0.42, y + 0.04, pw, 0.36, m.label || "", { size: 11.5, bold: true, color: P.primary, align: "center", valign: "middle" });
      });
      c.finish(4);
    } });

  L({ id: "matrix", letter: "L", name: "等级矩阵", use: "两个维度交叉：左侧矩阵（颜色深浅表示等级），右侧说明卡和例子。",
    fields: "rows: [..]；cols: [..]；cells: 二维文字；levels?: 二维 0–1 数值（颜色深浅）；highlight?: [[r, c]]；marks?: [{r, c, label}]；note?；side?: {head, items: [{icon?, title, text}]（≤3）, callout?}。",
    sample: { layout: "matrix", no: "3.4", title: "实证结果：薪资招聘", section: 3, rows: ["管理岗", "全部岗位"], cols: ["数量", "薪资"], cells: [["+7.5%", "+7%"], ["−0.076", "比值不显著"]], levels: [[0.9, 0.7], [0.4, 0.2]], highlight: [[1, 1]],
      note: "**相对薪资比不显著**：大家一起涨，管理者没有相对变贵", side: { head: "怎么读", items: [{ icon: "up", title: "管理岗更多", text: "数量 +7.5%，薪资 +7%" }, { icon: "scale", title: "没有更稀缺", text: "与非管理岗的比值不变" }, { icon: "clock", title: "替代在早期", text: "2016 年后总招聘系数不显著" }] }, source: "原文 Table 8、Table 9" },
    render: function (c, s) {
      var P = c.P; c.chrome(); var top = c.top, rows = s.rows || [], cols = s.cols || [], side = s.side, mw = side ? 7.2 : CW;
      c.group(1);
      var rw = 1.5, cw = (mw - rw) / Math.max(1, cols.length), chh = 0.5, avail = c.bottom - top - chh - (s.note ? 0.65 : 0.1), rh = Math.min(1.1, avail / Math.max(1, rows.length));
      cols.forEach(function (cn, j) { c.pill(X0 + rw + j * cw + 0.06, top, cw - 0.12, chh - 0.08, cn, P.primary, "FFFFFF", 13); });
      rows.forEach(function (rn, i) {
        var y = top + chh + i * rh;
        c.text(X0, y, rw - 0.12, rh, rn, { size: 13.5, bold: true, color: P.dark, align: "right", valign: "middle" });
        cols.forEach(function (cn, j) {
          var lvv = s.levels && s.levels[i] ? s.levels[i][j] : 0.15, x = X0 + rw + j * cw, fill = mix("FFFFFF", P.primary, 0.08 + 0.92 * Math.max(0, Math.min(1, lvv))), dark = lvv >= 0.55;
          var mk = (s.marks || []).filter(function (m) { return m.r === i && m.c === j; })[0];
          c.rect(x + 0.04, y + 0.04, cw - 0.08, rh - 0.08, { fill: fill });
          var cell = s.cells && s.cells[i] ? s.cells[i][j] : "";
          c.text(x + 0.04, y + 0.04, cw - 0.08, mk ? rh * 0.55 : rh - 0.08, cell == null ? "" : String(cell), { size: len(cell) > 6 ? 14 : 18, bold: true, color: dark ? "FFFFFF" : P.dark, align: "center", valign: "middle", emColor: dark ? "FFFFFF" : null });
          if (mk) c.pill(x + 0.25, y + rh * 0.58, cw - 0.5, 0.3, mk.label, "FFFFFF", P.primary, 11);
        });
      });
      c.group(2);
      (s.highlight || []).forEach(function (hl) { c.dashBox(X0 + rw + hl[1] * cw + 0.02, top + chh + hl[0] * rh + 0.02, cw - 0.04, rh - 0.04); });
      if (s.note) c.text(X0, top + chh + rows.length * rh + 0.12, mw, 0.5, s.note, { size: 13.5, valign: "middle" });
      if (side) {
        c.group(3);
        var sx = X0 + mw + 0.4, sw = XR - sx, items = (side.items || []).slice(0, 3);
        c.head(sx, top, sw, side.head || "");
        var calloutH = side.callout ? 1.2 : 0, ih = (c.bottom - top - 0.6 - calloutH - (items.length) * 0.15) / Math.max(1, items.length);
        items.forEach(function (it, i) {
          var y = top + 0.6 + i * (ih + 0.15), tx = sx + 0.2;
          c.card(sx, y, sw, ih);
          if (it.icon && c.S.icon !== "none") { c.iconDot(sx + 0.17, y + ih / 2 - 0.28, it.icon, 0.56); tx = sx + 0.9; }
          c.text(tx, y + 0.08, sw - (tx - sx) - 0.15, ih * 0.45, it.title || "", { size: 14.5, bold: true, color: P.dark, valign: "bottom" });
          c.text(tx, y + 0.1 + ih * 0.45, sw - (tx - sx) - 0.15, ih * 0.5, it.text || "", { size: 13 });
        });
        if (side.callout) { var cy = c.bottom - calloutH; c.dashBox(sx, cy, sw, calloutH); c.text(sx + 0.15, cy, sw - 0.3, calloutH, side.callout, { size: 13.5, valign: "middle" }); }
      }
      c.finish(4);
    } });

  L({ id: "chart", letter: "N", name: "图表 + 结论卡", use: "数据结果：左侧一到两张原生图表，右侧最多三张结论卡。",
    fields: "chart: {title, type: 'column'|'bar'|'line', categories: [..], series: [{name, values: [..]}], format?: '0.0'}；chart2?: 同上；cards?: [{value?, icon?, title, text}]（≤3）。",
    sample: { layout: "chart", no: "3.1", title: "实证结果：管理岗数量", section: 3, tag: "回应 RQ①",
      chart: { title: "招聘数量（%）", type: "column", categories: ["OLS", "IV"], series: [{ name: "增幅", values: [2.4, 7.5] }], format: "0.0" },
      chart2: { title: "管理岗占比（pp）", type: "column", categories: ["OLS", "IV"], series: [{ name: "变化", values: [0.4, 1.4] }], format: "0.0" },
      cards: [{ value: "0.072", title: "Ln(管理岗)", text: "SE 0.021｜OLS 0.024" }, { value: "0.014", title: "管理岗占比", text: "SE 0.004｜OLS 0.004" }, { value: "87.1", title: "第一阶段 F", text: "IV 样本 13,331" }],
      conclusion: "两种估计都显示管理岗增加，IV 更大，**OLS 可能低估**", conclusionLabel: "关键结论", source: "原文 Table 3" },
    render: function (c, s) {
      var P = c.P; c.chrome(); var top = c.top, cards = (s.cards || []).slice(0, 3), lw = cards.length ? 7.65 : CW;
      c.group(1);
      var charts = [s.chart, s.chart2].filter(Boolean), cw = (lw - (charts.length - 1) * 0.25) / Math.max(1, charts.length);
      charts.forEach(function (ch, i) {
        var x = X0 + i * (cw + 0.25), y = top, h = c.bottom - top;
        c.card(x, y, cw, h);
        c.text(x + 0.15, y + 0.08, cw - 0.3, 0.4, ch.title || "", { size: 14, bold: true, color: P.primary, align: "center", valign: "middle" });
        c.chart(x + 0.1, y + 0.5, cw - 0.2, h - 0.6, ch);
      });
      if (cards.length) {
        c.group(2);
        var x = X0 + lw + 0.3, w = XR - x, ch_ = (c.bottom - top - (cards.length - 1) * 0.15) / cards.length;
        cards.forEach(function (cd, i) {
          var y = top + i * (ch_ + 0.15), tx = x + 0.2;
          c.card(x, y, w, ch_);
          if (cd.value != null) { c.rect(x + 0.12, y + 0.12, 1.25, ch_ - 0.24, { fill: P.primary }); c.text(x + 0.12, y + 0.12, 1.25, ch_ - 0.24, String(cd.value), { size: len(cd.value) > 5 ? 15 : 18, bold: true, color: "FFFFFF", align: "center", valign: "middle", font: "Arial" }); tx = x + 1.55; }
          else if (cd.icon && c.S.icon !== "none") { c.iconDot(x + 0.18, y + ch_ / 2 - 0.3, cd.icon, 0.6); tx = x + 0.95; }
          c.text(tx, y + 0.1, w - (tx - x) - 0.15, ch_ * 0.42, cd.title || "", { size: 14.5, bold: true, color: P.dark, valign: "bottom" });
          c.text(tx, y + 0.12 + ch_ * 0.42, w - (tx - x) - 0.15, ch_ * 0.5, cd.text || "", { size: 13 });
        });
      }
      c.finish(3);
    } });

  L({ id: "table", letter: "表", name: "表格 + 说明", use: "样本概况、技能清单、回归结果：左侧表格，右侧最多三张说明卡。",
    fields: "table: {head: [..], rows: [[..]], colW?: [..], highlightCol?: 列号}；cards?: [{icon?, title, text}]（≤3）；note?。",
    sample: { layout: "table", no: "3.3", title: "实证结果：AI 经理", section: 3,
      table: { head: ["经理", "AI 经理", "AI 专家（IT）"], rows: [["Communication", "Machine Learning", "Machine Learning"], ["Teamwork", "Teamwork", "Python"], ["Planning", "Artificial Intelligence", "Data Science"], ["Problem Solving", "Communication", "Teamwork"], ["Budgeting", "Python", "SQL"]], highlightCol: 1 },
      cards: [{ icon: "pin", title: "≈0.6%", text: "2022 年占管理岗" }, { icon: "users", title: "约 4 个", text: "每家公司每年招聘（均值）" }, { icon: "star", title: "画像", text: "懂管理的 AI 专家：技术之外也要协作和沟通" }], source: "原文第 5 节、Table 10" },
    render: function (c, s) {
      var P = c.P; c.chrome(); var top = c.top, cards = (s.cards || []).slice(0, 3), lw = cards.length ? 8.2 : CW;
      c.group(1);
      c.table(X0, top, lw, s.table || { head: [], rows: [] });
      if (s.note) c.text(X0, c.bottom - 0.4, lw, 0.4, s.note, { size: 12, color: P.muted });
      if (cards.length) {
        c.group(2);
        var x = X0 + lw + 0.3, w = XR - x, ch_ = (c.bottom - top - (cards.length - 1) * 0.15) / cards.length;
        cards.forEach(function (cd, i) {
          var y = top + i * (ch_ + 0.15), tx = x + 0.2;
          c.card(x, y, w, ch_);
          if (cd.icon && c.S.icon !== "none") { c.iconDot(x + 0.18, y + 0.2, cd.icon, 0.52); tx = x + 0.88; }
          c.text(tx, y + 0.14, w - (tx - x) - 0.15, 0.48, cd.title || "", { size: 16, bold: true, color: P.primary, valign: "middle" });
          c.text(x + 0.2, y + 0.75, w - 0.35, ch_ - 0.85, cd.text || "", { size: 13 });
        });
      }
      c.finish(3);
    } });

  L({ id: "compare", letter: "O", name: "两列对比 + 例子", use: "两类对象逐条对比（第二列突出），右侧放反例或补充。",
    fields: "left: {head, items: [{tag, text}]}；right: {head, items: [{tag, text}]}（第二列用虚线框突出）；side?: {head, items: [{icon?, title, text}]（≤3）}；可选 conclusion。",
    sample: { layout: "compare", no: "4.1", title: "结论与讨论", section: 4,
      left: { head: "原文结论", items: [{ tag: "数量", text: "管理岗数量和占比上升" }, { tag: "技能", text: "转向协作、创造与数据" }, { tag: "薪资", text: "普遍上涨，相对不变" }] },
      right: { head: "汇报人归纳的含义", items: [{ tag: "理论", text: "AI 未必让组织更扁平" }, { tag: "实践", text: "引入 AI 不等于精简管理层" }, { tag: "人才", text: "培养协作、判断与数据能力" }] },
      side: { head: "还没回答的", items: [{ icon: "search", title: "机制", text: "没直接观察管理者在做什么" }, { icon: "clock", title: "时期", text: "生成式 AI 之后是否成立" }, { icon: "layers", title: "层级", text: "中层和高层是否不同" }] },
      conclusion: "管理者变多，**工作内容也在重构**" },
    render: function (c, s) {
      var P = c.P; c.chrome(); var top = c.top, side = s.side, cols = [s.left || {}, s.right || {}], widths = side ? [3.95, 4.3] : [6.0, 6.18], xs = [X0, X0 + widths[0] + 0.25];
      cols.forEach(function (col, ci) {
        c.group(ci + 1);
        var x = xs[ci], w = widths[ci], items = col.items || [], step = Math.min(0.72, (c.bottom - top - 0.6) / Math.max(1, items.length));
        if (ci === 1) c.dashBox(x - 0.1, top - 0.08, w + 0.2, c.bottom - top + 0.12);
        c.head(x, top, w, col.head || "");
        items.forEach(function (it, i) {
          var y = top + 0.6 + i * step;
          c.card(x, y, w, step - 0.1);
          var tw = Math.max(0.72, len(it.tag) * 0.16 + 0.3);
          c.pill(x + 0.12, y + (step - 0.1) / 2 - 0.17, tw, 0.34, it.tag || "", P.pale2, P.dark, 12);
          c.text(x + tw + 0.25, y, w - tw - 0.35, step - 0.1, it.text || "", { size: 13, valign: "middle" });
        });
      });
      if (side) {
        c.group(3);
        var sx = xs[1] + widths[1] + 0.3, sw = XR - sx, items = (side.items || []).slice(0, 3), ih = (c.bottom - top - 0.6 - (items.length - 1) * 0.17) / Math.max(1, items.length);
        c.head(sx, top, sw, side.head || "");
        items.forEach(function (it, i) {
          var y = top + 0.6 + i * (ih + 0.17), tx = sx + 0.15;
          c.card(sx, y, sw, ih);
          if (it.icon && c.S.icon !== "none") { c.iconDot(sx + 0.15, y + 0.15, it.icon, 0.5, i === items.length - 1 ? P.accent : P.primary); tx = sx + 0.78; }
          c.text(tx, y + 0.12, sw - (tx - sx) - 0.1, 0.42, it.title || "", { size: 14, bold: true, color: P.dark, valign: "middle" });
          c.text(sx + 0.15, y + 0.62, sw - 0.3, ih - 0.68, it.text || "", { size: 12.5 });
        });
      }
      c.finish(4);
    } });

  L({ id: "house", letter: "I", name: "房屋框架", use: "两股力量 / 理论框架：屋顶写总问题，两根柱子写两类因素，中心写核心对象，底部写预期。",
    fields: "roof；beam?；pillars: [{head, label?, items: [..]}, {head, label?, items: [..]}]；core；base?: {label, items: [..]（≤4）}。",
    sample: { layout: "house", no: "2.1", title: "理论框架", section: 1, roof: "管理者需求的净效应", beam: "AI 采纳到底增加还是减少管理需求？",
      pillars: [{ head: "增加管理需求", label: "增加", items: ["监督和调校 AI 系统", "解读 AI 输出并做判断", "协调人与 AI 的协作", "管控偏见与伦理风险"] }, { head: "减少管理需求", label: "减少", items: ["自动化部分监督任务", "中层需求随之下降"] }],
      core: "AI 采纳", base: { label: "作者假设", items: ["AI 扩大管理职责", "管理者更多", "转向认知与人际", "例行行政减少"] } },
    render: function (c, s) {
      var P = c.P; c.chrome(); var top = c.top, pl = s.pillars || [{}, {}], base = s.base, baseH = base ? 0.62 : 0, bodyB = c.bottom - (base ? baseH + 0.18 : 0);
      c.group(1);
      c.shape("triangle", 1.6, top, W - 3.2, 0.72, { fill: P.primary });
      c.text(3.5, top + 0.3, W - 7, 0.42, s.roof || "", { size: 15, bold: true, color: "FFFFFF", align: "center", valign: "middle", emColor: "FFFFFF" });
      var by = top + 0.8;
      if (s.beam) { c.rect(1.6, by, W - 3.2, 0.4, { fill: P.pale2 }); c.text(1.6, by, W - 3.2, 0.4, s.beam, { size: 14, bold: true, color: P.primary, align: "center", valign: "middle" }); by += 0.55; }
      c.group(2);
      var pw = 3.9, ph = bodyB - by, cx = W / 2, d = Math.min(2.3, ph * 0.8);
      [0, 1].forEach(function (i) {
        var p = pl[i] || {}, x = i === 0 ? 0.8 : W - 0.8 - pw;
        c.head(x, by, pw, p.head || "", i === 1 ? P.gray : null);
        c.card(x, by + 0.48, pw, ph - 0.48);
        c.bullets(x + 0.25, by + 0.68, pw - 0.4, ph - 0.8, p.items || [], { step: Math.min(0.5, (ph - 0.8) / Math.max(1, (p.items || []).length)), size: 13 });
        var bx = i === 0 ? x + pw + 0.18 : x - 0.18 - 0.42;
        c.rect(bx, by + 0.48, 0.42, ph - 0.48, { fill: i === 0 ? P.accent : P.gray });
        c.text(bx, by + 0.48, 0.42, ph - 0.48, (p.label || "").split("").join("\n"), { size: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
      });
      c.shape("oval", cx - d / 2 - 0.14, by + ph / 2 - d / 2 - 0.14 + 0.24, d + 0.28, d + 0.28, { fill: P.pale2 });
      c.shape("oval", cx - d / 2, by + ph / 2 - d / 2 + 0.24, d, d, { fill: P.primary });
      c.text(cx - d / 2, by + ph / 2 - d / 2 + 0.24, d, d, s.core || "", { size: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle", emColor: "FFFFFF" });
      if (base) {
        c.group(3);
        var y = c.bottom - baseH, items = (base.items || []).slice(0, 4), iw = (CW - 2.2 - (items.length - 1) * 0.12) / Math.max(1, items.length);
        c.shape("pentagon", X0, y, 2.0, baseH, { fill: P.accent });
        c.text(X0, y, 1.8, baseH, base.label || "", { size: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle", emColor: "FFFFFF" });
        items.forEach(function (it, i) { var x = X0 + 2.2 + i * (iw + 0.12); c.rect(x, y, iw, baseH, { fill: P.pale }); c.text(x, y, iw, baseH, it, { size: 13.5, bold: true, color: P.primary, align: "center", valign: "middle" }); });
      }
      c.finish(4);
    } });

  L({ id: "funnel", letter: "漏斗", name: "漏斗 + 概况", use: "样本构建：逐层收窄的漏斗，右侧样本概况表，底部样本口径。",
    fields: "levels: [{value, label}]（3–5，最后一层为最终样本）；side?: {head, table: {head, rows}}；checks?: {label, items: [..]}。",
    sample: { layout: "funnel", no: "2.1", title: "样本构建", section: 2, levels: [{ value: "约 3.7 亿条", label: "美国招聘数据 2010–2022" }, { value: "约 2.6 亿条", label: "有雇主名称" }, { value: "约 8,000 万条", label: "匹配 Compustat" }, { value: "2,322 家公司", label: "16,021 个公司-年观测" }],
      side: { head: "样本概况", table: { head: ["变量", "均值", "标准差"], rows: [["AI 岗位占比", "0.5%", "1.3%"], ["管理岗占比", "19.1%", "11.6%"], ["年招聘数量", "4,001", "12,977"]] } },
      checks: { label: "样本口径", items: ["不含信息业", "不含专业服务业", "管理岗不少于 30 个"] }, source: "原文第 2.2 节、Table 1" },
    render: function (c, s) {
      var P = c.P; c.chrome(); var top = c.top, lv = (s.levels || []).slice(0, 5), n = Math.max(1, lv.length), side = s.side, chk = s.checks, fw = side ? 6.8 : CW;
      var fb = c.bottom - (chk ? 0.85 : 0), lh = (fb - top - (n - 1) * 0.1) / n;
      c.group(1);
      lv.forEach(function (it, i) {
        var t = n > 1 ? i / (n - 1) : 1, w = fw * (1 - 0.42 * t), x = X0 + (fw - w) / 2, y = top + i * (lh + 0.1), last = i === n - 1;
        c.rect(x, y, w, lh, { fill: last ? P.accent : mix(P.primary, P.dark, 0.25 * (1 - t)) });
        c.text(x, y, w, lh, [{ text: it.value || "", bold: true, br: true }, { text: it.label || "", size: 12 }], { size: 15, color: "FFFFFF", align: "center", valign: "middle" });
      });
      if (side) {
        c.group(2);
        var sx = X0 + fw + 0.4, sw = XR - sx;
        c.head(sx, top, sw, side.head || "");
        c.table(sx, top + 0.6, sw, side.table || { head: [], rows: [] });
      }
      if (chk) {
        c.group(3);
        var y = c.bottom - 0.62, items = (chk.items || []).slice(0, 4), iw = (CW - 2.2) / Math.max(1, items.length);
        c.rect(X0, y, CW, 0.62, { fill: P.pale });
        c.shape("pentagon", X0, y, 2.0, 0.62, { fill: P.accent });
        c.text(X0, y, 1.8, 0.62, chk.label || "", { size: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle", emColor: "FFFFFF" });
        items.forEach(function (it, i) { var x = X0 + 2.25 + i * iw; c.icon(x, y + 0.19, 0.24, "check", P.primary); c.text(x + 0.32, y, iw - 0.35, 0.62, it, { size: 13.5, bold: true, color: P.primary, valign: "middle" }); });
      }
      c.finish(4);
    } });

  L({ id: "summary", letter: "总结", name: "总结", use: "结尾：一句大字结论、一行副标题、三张要点卡、致谢条。",
    fields: "big（可用 **关键词**）；sub?；cards: [{icon?, title, text, value?}]（3）；thanks?（字符串，写 false 则不要）。",
    sample: { layout: "summary", section: 4, big: "AI **≠** 更少的管理者", sub: "管理者的数量和工作内容都在变化", cards: [{ icon: "users", title: "有多少", text: "管理岗数量与占比都上升", value: "+7.5% / +1.4 pp" }, { icon: "brain", title: "做什么", text: "转向协作、创造力与数据分析", value: "协作 +2.91" }, { icon: "coins", title: "值多少", text: "薪资普遍上涨，相对不变", value: "比值不显著" }], thanks: "谢谢！欢迎批评指正" },
    render: function (c, s) {
      var P = c.P; c.chrome({ titleOnly: "art" }); c.group(1);
      c.text(0.6, 0.95, W - 1.2, 1.1, s.big || "", { size: 40, bold: true, color: P.dark, align: "center", valign: "middle", font: c.S.fonts.head });
      if (s.sub) c.text(0.6, 2.05, W - 1.2, 0.55, s.sub, { size: 19, color: P.primary, align: "center", valign: "middle" });
      c.group(2);
      var cards = (s.cards || []).slice(0, 4), n = Math.max(1, cards.length), cw = Math.min(3.7, (W - 1.7 - (n - 1) * 0.35) / n), x0 = (W - (n * cw + (n - 1) * 0.35)) / 2;
      cards.forEach(function (cd, i) {
        var x = x0 + i * (cw + 0.35), y = 2.95;
        c.card(x, y, cw, 2.75);
        c.iconDot(x + cw / 2 - 0.38, y + 0.22, cd.icon || "star", 0.76, i === 1 ? P.accent : P.primary);
        c.text(x + 0.15, y + 1.1, cw - 0.3, 0.42, cd.title || "", { size: 17, bold: true, color: P.dark, align: "center", valign: "middle" });
        c.text(x + 0.25, y + 1.55, cw - 0.5, 0.65, cd.text || "", { size: 13.5, align: "center" });
        if (cd.value) c.text(x + 0.15, y + 2.2, cw - 0.3, 0.38, cd.value, { size: 14, bold: true, color: P.primary, align: "center", valign: "middle" });
      });
      if (s.thanks !== false) { c.group(3); c.rect(0, 6.2, W, 0.85, { fill: P.pale }); c.text(0, 6.2, W, 0.85, s.thanks || "谢谢！欢迎批评指正", { size: 22, bold: true, color: P.primary, align: "center", valign: "middle" }); }
    } });

  L({ id: "end", letter: "致谢", name: "致谢页", use: "最后一页：大字致谢和汇报人信息。",
    fields: "text?；sub?。",
    sample: { layout: "end", text: "欢迎指正！", sub: "汇报人：________" },
    render: function (c, s, deck) {
      var P = c.P, m = deck.meta || {}; c.chrome({ titleOnly: "art" }); c.group(0);
      c.text(0.6, 2.4, W - 1.2, 1.3, s.text || "谢谢！", { size: 48, bold: true, color: P.primary, align: "center", valign: "middle", font: c.S.fonts.head });
      c.rect(W / 2 - 0.6, 3.85, 1.2, 0.06, { fill: P.accent });
      c.text(0.6, 4.1, W - 1.2, 0.5, s.sub || m.author || "", { size: 16, color: P.muted, align: "center", valign: "middle" });
    } });

  var LAYOUT_MAP = {}; LAYOUTS.forEach(function (l) { LAYOUT_MAP[l.id] = l; });

  /** Build every slide into a list of drawing ops. */
  function buildDeck(deck, style) {
    style = resolveStyle(style);
    deck = deck || {}; deck.meta = deck.meta || {};
    return (deck.slides || []).map(function (s, i) {
      var c = new Ctx(style, deck, s, i), lay = LAYOUT_MAP[s.layout] || LAYOUT_MAP.columns;
      try { lay.render(c, s, deck); }
      catch (e) { c.ops = []; c.group(0); c.text(0.5, 3, 12.3, 1, "版式 " + s.layout + " 渲染出错：" + e.message, { size: 16, color: "C00000" }); }
      var groups = []; c.ops.forEach(function (o) { if (o.g && groups.indexOf(o.g) < 0) groups.push(o.g); });
      groups.sort(function (a, b) { return a - b; });
      return { ops: c.ops, notes: s.notes || "", groups: groups, layout: s.layout, index: i, concG: c.concG || 0 };
    });
  }

  // ------------------------------------------------------------------ animation plan
  /** Returns [{g, trigger: 'after'|'click', delay(ms), effect}] for one slide. */
  function animationPlan(slide, mode) {
    var gs = slide.groups;
    if (!gs.length || mode === "none" || slide.layout === "cover" || slide.layout === "section" || slide.layout === "end") return [];
    var last = gs[gs.length - 1], hasConc = !!slide.concG && slide.concG === last && gs.length > 1;
    if (mode === "simple") return gs.map(function (g) { return { g: g, trigger: "click", delay: 0, effect: "fade" }; });
    if (mode === "speech") {
      var chars = plain(slide.notes).replace(/\s/g, "").length, total = chars / 4 * 1000, seg = gs.length > 1 ? total / gs.length : 0;
      return gs.map(function (g, i) { return { g: g, trigger: "after", delay: i === 0 ? 0 : Math.max(300, Math.min(20000, Math.round(seg / 100) * 100)), effect: "fade" }; });
    }
    // standard: first auto, middle groups on click (max 3), conclusion auto after 400 ms
    var clicks = 0;
    return gs.map(function (g, i) {
      if (i === 0) return { g: g, trigger: "after", delay: 0, effect: "fade" };
      if (hasConc && g === last) return { g: g, trigger: "after", delay: 400, effect: "fade" };
      if (clicks < 3) { clicks++; return { g: g, trigger: "click", delay: 0, effect: "fade" }; }
      return { g: g, trigger: "after", delay: 300, effect: "fade" };
    });
  }

  function timingXml(plan, groups) {
    var id = 2, DUR = 500;
    function nid() { return ++id; }
    function effect(spid, node, delay, kind) {
      var pid = kind === "wipe" ? 22 : 10, sub = kind === "wipe" ? 8 : 0, filt = kind === "wipe" ? "wipe(left)" : "fade", a = nid(), b = nid(), c = nid();
      return '<p:par><p:cTn id="' + a + '" presetID="' + pid + '" presetClass="entr" presetSubtype="' + sub + '" fill="hold" nodeType="' + node + '"><p:stCondLst><p:cond delay="' + delay + '"/></p:stCondLst><p:childTnLst>' +
        '<p:set><p:cBhvr><p:cTn id="' + b + '" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="' + spid + '"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>' +
        '<p:animEffect transition="in" filter="' + filt + '"><p:cBhvr><p:cTn id="' + c + '" dur="' + DUR + '"/><p:tgtEl><p:spTgt spid="' + spid + '"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>';
    }
    var outers = [], cur = null, tEnd = 0;
    plan.forEach(function (st) {
      var sp = groups[st.g] || []; if (!sp.length) return;
      var start, node;
      if (st.trigger === "click" || !cur) { cur = { auto: st.trigger !== "click", inners: [] }; outers.push(cur); start = 0; node = st.trigger === "click" ? "clickEffect" : "afterEffect"; }
      else { start = tEnd; node = "afterEffect"; }
      tEnd = start + st.delay + DUR;
      cur.inners.push({ start: start, effects: sp.map(function (s, j) { return [s, j === 0 ? node : "withEffect", st.delay, st.effect]; }) });
    });
    if (!outers.length) return "";
    var body = outers.map(function (o) {
      var oid = nid(), cond = '<p:cond delay="indefinite"/>' + (o.auto ? '<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : "");
      var inner = o.inners.map(function (inn) { var iid = nid(); return '<p:par><p:cTn id="' + iid + '" fill="hold"><p:stCondLst><p:cond delay="' + inn.start + '"/></p:stCondLst><p:childTnLst>' + inn.effects.map(function (e) { return effect(e[0], e[1], e[2], e[3]); }).join("") + "</p:childTnLst></p:cTn></p:par>"; }).join("");
      return '<p:par><p:cTn id="' + oid + '" fill="hold"><p:stCondLst>' + cond + "</p:stCondLst><p:childTnLst>" + inner + "</p:childTnLst></p:cTn></p:par>";
    }).join("");
    return '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>' + body +
      '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>';
  }
  function injectTiming(xml, plan) {
    var n = 1;
    xml = xml.replace(/<p:cNvPr id="\d+"/g, function () { return '<p:cNvPr id="' + (n++) + '"'; });
    var groups = {}, re = /<p:cNvPr id="(\d+)" name="A(\d+)_\d+"/g, m;
    while ((m = re.exec(xml))) (groups[+m[2]] = groups[+m[2]] || []).push(m[1]);
    var tim = timingXml(plan, groups);
    xml = xml.replace(/<p:timing>[\s\S]*?<\/p:timing>/, "");
    if (!tim) return xml;
    var tail = xml.lastIndexOf("</p:clrMapOvr>"), ext = xml.indexOf("<p:extLst>", tail > 0 ? tail : 0);
    return ext > 0 ? xml.slice(0, ext) + tim + xml.slice(ext) : xml.replace("</p:sld>", tim + "</p:sld>");
  }

  // ------------------------------------------------------------------ SVG helpers (shared)
  function iconSvg(name, variant, color) {
    var ic = ICONS[name] || ICONS.star, svg = ic[variant === "line" ? "line" : "solid"];
    return svg.replace(/currentColor/g, "#" + (color || "000000"));
  }
  function headerArtSvg(P) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="192" viewBox="0 0 420 192"><polygon points="0,0 210,0 178,192 0,192" fill="#' + P.dark + '"/><polygon points="232,0 292,0 260,192 200,192" fill="#' + P.accent + '"/><polygon points="314,0 374,0 342,192 282,192" fill="#' + P.primary + '"/></svg>';
  }
  function shapePoints(kind, w, h, flip) {
    var d = Math.min(h * 0.45, w * 0.4), pts;
    if (kind === "chevron") pts = [[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h], [d, h / 2]];
    else if (kind === "pentagon") pts = [[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h]];
    else if (kind === "triangle") pts = [[w / 2, 0], [w, h], [0, h]];
    else pts = [[0, 0], [w, 0], [w, h], [0, h]];
    if (flip) pts = pts.map(function (p) { return [w - p[0], p[1]]; });
    return pts;
  }

  // ------------------------------------------------------------------ HTML back end
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function emStyle(style, run, op) {
    var P = style.palette, e = style.emphasis, c = op.emColor;
    if (!run.em) return "";
    if (e === "accent") return "font-weight:700;color:#" + (c || P.accent) + ";";
    if (e === "primary") return "font-weight:700;color:#" + (c || P.primary) + ";";
    if (e === "highlight") return "font-weight:700;background:#FFE7BF;" + (c ? "color:#" + c + ";" : "");
    return "font-weight:700;";
  }
  function chartSvg(spec, w, h, P, px) {
    var cats = spec.categories || [], ser = spec.series || [], vals = [];
    ser.forEach(function (s) { (s.values || []).forEach(function (v) { vals.push(+v || 0); }); });
    var mx = Math.max.apply(0, vals.concat([0])), mn = Math.min.apply(0, vals.concat([0])); if (mx === mn) mx = mn + 1;
    var W_ = w * px, H_ = h * px, padL = 0.25 * px, padB = 0.35 * px, padT = 0.3 * px, cw = W_ - padL - 0.1 * px, ch = H_ - padB - padT;
    var horiz = spec.type === "bar", fmt = function (v) { return spec.format === "0" ? Math.round(v) : (Math.round(v * 10) / 10).toFixed(spec.format === "0.00" ? 2 : 1); };
    var colors = [P.primary, P.accent, P.mid, P.dark], fs = Math.max(8, 10.5 * px / 72), out = '<svg width="' + W_ + '" height="' + H_ + '" style="position:absolute;left:0;top:0;overflow:visible" font-family="sans-serif">';
    if (spec.type === "line") {
      var y = function (v) { return padT + ch * (1 - (v - mn) / (mx - mn)); };
      out += '<line x1="' + padL + '" y1="' + (padT + ch) + '" x2="' + (padL + cw) + '" y2="' + (padT + ch) + '" stroke="#C8CDD5"/>';
      ser.forEach(function (s, si) {
        var pts = (s.values || []).map(function (v, i) { return [padL + cw * (cats.length > 1 ? i / (cats.length - 1) : 0.5), y(+v || 0)]; });
        out += '<polyline fill="none" stroke="#' + colors[si % 4] + '" stroke-width="' + Math.max(1.5, px / 40) + '" points="' + pts.map(function (p) { return p.join(","); }).join(" ") + '"/>';
        pts.forEach(function (p) { out += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + Math.max(2, px / 30) + '" fill="#' + colors[si % 4] + '"/>'; });
      });
      cats.forEach(function (cn, i) { if (cats.length > 8 && i % Math.ceil(cats.length / 8)) return; out += '<text x="' + (padL + cw * (cats.length > 1 ? i / (cats.length - 1) : 0.5)) + '" y="' + (H_ - padB / 3) + '" font-size="' + fs + '" fill="#6B7280" text-anchor="middle">' + esc(cn) + "</text>"; });
    } else if (!horiz) {
      var gw = cw / Math.max(1, cats.length), bw = gw * 0.6 / Math.max(1, ser.length), zeroY = padT + ch * (mx / (mx - mn));
      out += '<line x1="' + padL + '" y1="' + zeroY + '" x2="' + (padL + cw) + '" y2="' + zeroY + '" stroke="#C8CDD5"/>';
      cats.forEach(function (cn, i) {
        ser.forEach(function (s, si) {
          var v = +(s.values || [])[i] || 0, bh = ch * Math.abs(v) / (mx - mn), x = padL + gw * i + gw * 0.2 + bw * si, yy = v >= 0 ? zeroY - bh : zeroY;
          var col = ser.length === 1 ? (i === cats.length - 1 && cats.length <= 3 ? P.primary : P.mid) : colors[si % 4];
          if (ser.length === 1 && cats.length > 3) col = v < 0 ? P.accent : P.primary;
          out += '<rect x="' + x + '" y="' + yy + '" width="' + bw + '" height="' + Math.max(1, bh) + '" fill="#' + col + '"/>';
          out += '<text x="' + (x + bw / 2) + '" y="' + (v >= 0 ? yy - 3 : yy + bh + fs) + '" font-size="' + fs + '" fill="#1F2937" text-anchor="middle">' + (v > 0 ? "+" : "") + fmt(v) + "</text>";
        });
        out += '<text x="' + (padL + gw * i + gw / 2) + '" y="' + (H_ - padB / 3) + '" font-size="' + fs + '" fill="#6B7280" text-anchor="middle">' + esc(cn) + "</text>";
      });
    } else {
      var labW = 1.6 * px, gh = ch / Math.max(1, cats.length), bh2 = gh * 0.6, cw2 = cw - labW, zeroX = padL + labW + cw2 * (-mn / (mx - mn));
      out += '<line x1="' + zeroX + '" y1="' + padT + '" x2="' + zeroX + '" y2="' + (padT + ch) + '" stroke="#C8CDD5"/>';
      cats.forEach(function (cn, i) {
        var v = +(ser[0] && ser[0].values || [])[i] || 0, bw3 = cw2 * Math.abs(v) / (mx - mn), y = padT + gh * i + gh * 0.2, x = v >= 0 ? zeroX : zeroX - bw3;
        out += '<rect x="' + x + '" y="' + y + '" width="' + Math.max(1, bw3) + '" height="' + bh2 + '" fill="#' + (v < 0 ? P.accent : P.primary) + '"/>';
        out += '<text x="' + (v >= 0 ? x + bw3 + 3 : x - 3) + '" y="' + (y + bh2 * 0.75) + '" font-size="' + fs + '" fill="#1F2937" text-anchor="' + (v >= 0 ? "start" : "end") + '">' + (v > 0 ? "+" : "") + fmt(v) + "</text>";
        out += '<text x="' + (padL + labW - 6) + '" y="' + (y + bh2 * 0.75) + '" font-size="' + fs + '" fill="#374151" text-anchor="end">' + esc(cn) + "</text>";
      });
    }
    if (ser.length > 1) out += ser.map(function (s, si) { return '<rect x="' + (padL + si * 1.3 * px) + '" y="2" width="' + fs + '" height="' + fs + '" fill="#' + colors[si % 4] + '"/><text x="' + (padL + si * 1.3 * px + fs + 4) + '" y="' + (fs + 1) + '" font-size="' + fs + '" fill="#6B7280">' + esc(s.name || "") + "</text>"; }).join("");
    return out + "</svg>";
  }
  function tableHtml(spec, op, style, px) {
    var P = style.palette, fs = 12.5 * px / 72, head = spec.head || [], rows = spec.rows || [], hc = spec.highlightCol;
    var cw = spec.colW, tot = cw ? cw.reduce(function (a, b) { return a + b; }, 0) : 0;
    var h = '<table style="border-collapse:collapse;width:100%;font-size:' + fs + 'px;table-layout:fixed">';
    if (cw) h += "<colgroup>" + cw.map(function (v) { return '<col style="width:' + (v / tot * 100) + '%">'; }).join("") + "</colgroup>";
    if (head.length) h += "<tr>" + head.map(function (t, j) { return '<th style="background:#' + (j === hc ? P.accent : P.primary) + ';color:#fff;padding:' + (0.06 * px) + "px " + (0.08 * px) + 'px;border:1px solid #' + P.line + '">' + esc(plain(t)) + "</th>"; }).join("") + "</tr>";
    rows.forEach(function (r, i) {
      h += "<tr>" + r.map(function (t, j) { return '<td style="background:#' + (j === hc ? P.warm : (i % 2 ? "FFFFFF" : P.pale)) + ";padding:" + (0.06 * px) + "px " + (0.08 * px) + "px;border:1px solid #" + P.line + ";text-align:" + (j === 0 ? "left" : "center") + ";color:#" + P.text + (j === hc ? ";font-weight:700" : "") + '">' + esc(plain(t)) + "</td>"; }).join("") + "</tr>";
    });
    return h + "</table>";
  }
  function renderHTML(slide, style, px) {
    style = resolveStyle(style); px = px || 72;
    var P = style.palette, font = "'" + style.fonts.body + "','Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Noto Sans SC',sans-serif";
    var out = ['<div class="d2p-slide" style="position:relative;width:' + (W * px) + "px;height:" + (H * px) + "px;background:#fff;overflow:hidden;font-family:" + font + '">'];
    slide.ops.forEach(function (o) {
      var box = "position:absolute;left:" + (o.x * px) + "px;top:" + (o.y * px) + "px;width:" + (o.w * px) + "px;height:" + (o.h * px) + "px;";
      var ga = o.g ? ' data-g="' + o.g + '"' : "";
      if (o.t === "rect") {
        var sh = o.shadow === "strong" ? "box-shadow:0 " + (5 / 72 * px) + "px " + (14 / 72 * px) + "px rgba(36,66,110,.3);" : o.shadow === "soft" ? "box-shadow:0 " + (3 / 72 * px) + "px " + (10 / 72 * px) + "px rgba(36,66,110,.2);" : "";
        var bd = o.line ? "border:" + Math.max(1, (o.lineW || 1) * px / 72) + "px " + (o.dash ? "dashed" : "solid") + " #" + o.line + ";" : "";
        out.push('<div' + ga + ' style="' + box + "box-sizing:border-box;" + (o.fill ? "background:#" + o.fill + ";" : "") + bd + (o.radius ? "border-radius:" + (o.radius * px) + "px;" : "") + sh + '"></div>');
      } else if (o.t === "shape") {
        if (o.kind === "oval") { out.push('<div' + ga + ' style="' + box + "box-sizing:border-box;border-radius:50%;" + (o.fill ? "background:#" + o.fill + ";" : "") + (o.line ? "border:" + Math.max(1, (o.lineW || 1) * px / 72) + "px solid #" + o.line + ";" : "") + '"></div>'); return; }
        var pts = shapePoints(o.kind, o.w * px, o.h * px, o.flipH).map(function (p) { return p.join(","); }).join(" ");
        out.push('<svg' + ga + ' style="' + box + 'overflow:visible"><polygon points="' + pts + '" fill="' + (o.fill ? "#" + o.fill : "none") + '"' + (o.line ? ' stroke="#' + o.line + '"' : "") + "/></svg>");
      } else if (o.t === "line") {
        var x2 = o.w * px, y2 = o.h * px, sw = Math.max(1, o.width * px / 72), mk = o.arrow ? ' marker-end="url(#d2pa' + o.color + ')"' : "";
        out.push('<svg' + ga + ' style="position:absolute;left:' + (o.x * px) + "px;top:" + (o.y * px) + "px;width:" + Math.max(1, x2) + "px;height:" + Math.max(1, y2) + 'px;overflow:visible">' +
          (o.arrow ? '<defs><marker id="d2pa' + o.color + '" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#' + o.color + '"/></marker></defs>' : "") +
          '<line x1="0" y1="0" x2="' + x2 + '" y2="' + y2 + '" stroke="#' + o.color + '" stroke-width="' + sw + '"' + (o.dash ? ' stroke-dasharray="' + sw * 4 + "," + sw * 3 + '"' : "") + mk + "/></svg>");
      } else if (o.t === "text") {
        var jc = o.valign === "middle" ? "center" : o.valign === "bottom" ? "flex-end" : "flex-start";
        var inner = o.runs.map(function (r) {
          var st = (r.bold || o.bold ? "font-weight:700;" : "") + (r.italic || o.italic ? "font-style:italic;" : "") + (r.color ? "color:#" + r.color + ";" : "") + (r.size ? "font-size:" + (r.size * px / 72) + "px;" : "") + emStyle(style, r, o);
          return '<span style="' + st + '">' + esc(r.text) + "</span>" + (r.br ? "<br>" : "");
        }).join("");
        out.push('<div' + ga + ' style="' + box + "display:flex;flex-direction:column;justify-content:" + jc + ";text-align:" + o.align + ";font-size:" + (o.size * px / 72) + "px;line-height:" + (1.22 * o.spacing) + ";color:#" + o.color + ";" + (o.bold ? "font-weight:700;" : "") + (o.italic ? "font-style:italic;" : "") + (o.font && o.font !== style.fonts.body ? "font-family:'" + o.font + "'," + font + ";" : "") + (o.vert ? "writing-mode:vertical-rl;" : "") + 'white-space:pre-wrap;word-break:break-word;overflow:visible"><div>' + inner + "</div></div>");
      } else if (o.t === "icon") {
        out.push('<div' + ga + ' style="' + box + '">' + iconSvg(o.name, o.variant, o.color).replace(/width="256" height="256"/, 'width="100%" height="100%"') + "</div>");
      } else if (o.t === "headerArt") {
        out.push('<div style="' + box + '">' + headerArtSvg(P).replace(/width="420" height="192"/, 'width="100%" height="100%" preserveAspectRatio="none"') + "</div>");
      } else if (o.t === "photo") {
        if (o.src) { out.push('<img' + ga + ' src="' + esc(o.src) + '" style="' + box + 'object-fit:cover">'); return; }
        var d = Math.min(0.6, o.h * 0.3) * px;
        out.push('<div' + ga + ' style="' + box + 'box-sizing:border-box;background:#EEF0F3;border:1px dashed #C9CED6;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:' + (0.1 * px) + 'px">' +
          '<div style="width:' + d + "px;height:" + d + 'px">' + iconSvg("camera", "solid", "9CA3AF").replace(/width="256" height="256"/, 'width="100%" height="100%"') + "</div>" +
          '<div style="font-size:' + (11 * px / 72) + "px;color:#" + P.muted + ";text-align:center;padding:0 " + (0.1 * px) + 'px">' + esc(o.label || "") + "</div></div>");
      } else if (o.t === "chart") {
        out.push('<div' + ga + ' style="' + box + '">' + chartSvg(o.spec || {}, o.w, o.h, P, px) + "</div>");
      } else if (o.t === "table") {
        out.push('<div' + ga + ' style="position:absolute;left:' + (o.x * px) + "px;top:" + (o.y * px) + "px;width:" + (o.w * px) + 'px">' + tableHtml(o.spec || {}, o, style, px) + "</div>");
      }
    });
    out.push("</div>");
    return out.join("");
  }

  // ------------------------------------------------------------------ PPTX back end
  /**
   * buildPptx(deck, style, opts) -> Promise<pptx data>
   *   opts.PptxGenJS   constructor (browser: window.PptxGenJS; Node: require('pptxgenjs'))
   *   opts.JSZip       constructor (browser: window.JSZip; Node: require('jszip'))
   *   opts.rasterize   async (svgString, pxSize) -> "image/png;base64,..."
   *   opts.outputType  'blob' | 'nodebuffer' | 'arraybuffer'
   */
  function buildPptx(deck, style, opts) {
    style = resolveStyle(style); opts = opts || {};
    var Pptx = opts.PptxGenJS, P = style.palette, slides = buildDeck(deck, style), cache = {};
    var pres = new Pptx();
    pres.layout = "LAYOUT_WIDE";
    pres.theme = { headFontFace: style.fonts.head, bodyFontFace: style.fonts.body };
    pres.title = (deck.meta && deck.meta.title) || "doc-to-ppt";
    var need = {};
    slides.forEach(function (sl) { sl.ops.forEach(function (o) {
      if (o.t === "icon") need["i|" + o.name + "|" + o.variant + "|" + o.color] = [iconSvg(o.name, o.variant, o.color), 256];
      if (o.t === "photo" && !o.src) need["i|camera|solid|9CA3AF"] = [iconSvg("camera", "solid", "9CA3AF"), 256];
      if (o.t === "headerArt") need.art = [headerArtSvg(P), 420];
    }); });
    var keys = Object.keys(need);
    return Promise.all(keys.map(function (k) { return Promise.resolve(opts.rasterize(need[k][0], need[k][1])).then(function (d) { cache[k] = d; }); })).then(function () {
      slides.forEach(function (sl) {
        var s = pres.addSlide(), cnt = 0;
        function nm(o) { return o.g ? { objectName: "A" + o.g + "_" + (++cnt) } : {}; }
        sl.ops.forEach(function (o) {
          var base = { x: o.x, y: o.y, w: o.w, h: o.h };
          if (o.t === "rect") {
            var ro = Object.assign(base, nm(o), { fill: o.fill ? { color: o.fill } : { type: "none" }, line: o.line ? { color: o.line, width: o.lineW || 1, dashType: o.dash ? "dash" : "solid" } : { type: "none" } });
            if (o.shadow) ro.shadow = { type: "outer", blur: o.shadow === "strong" ? 14 : 10, offset: o.shadow === "strong" ? 5 : 3, angle: 90, color: "24426E", opacity: o.shadow === "strong" ? 0.3 : 0.2 };
            if (o.radius) ro.rectRadius = o.radius;
            s.addShape(o.radius ? pres.shapes.ROUNDED_RECTANGLE : pres.shapes.RECTANGLE, ro);
          } else if (o.t === "shape") {
            var kind = { oval: pres.shapes.OVAL, chevron: pres.shapes.CHEVRON, pentagon: pres.shapes.PENTAGON, triangle: pres.shapes.ISOSCELES_TRIANGLE || pres.shapes.TRIANGLE }[o.kind] || pres.shapes.RECTANGLE;
            s.addShape(kind, Object.assign(base, nm(o), { fill: o.fill ? { color: o.fill } : { type: "none" }, line: o.line ? { color: o.line, width: o.lineW || 1 } : { type: "none" }, flipH: !!o.flipH }));
          } else if (o.t === "line") {
            s.addShape(pres.shapes.LINE, Object.assign(base, nm(o), { line: { color: o.color, width: o.width, dashType: o.dash ? "dash" : "solid", endArrowType: o.arrow ? "triangle" : undefined } }));
          } else if (o.t === "text") {
            var runs = o.runs.map(function (r) {
              var ro2 = { breakLine: !!r.br };
              if (r.bold) ro2.bold = true; if (r.italic) ro2.italic = true; if (r.color) ro2.color = r.color; if (r.size) ro2.fontSize = r.size;
              if (r.em) {
                ro2.bold = true;
                if (style.emphasis === "accent") ro2.color = o.emColor || P.accent;
                else if (style.emphasis === "primary") ro2.color = o.emColor || P.primary;
                else if (style.emphasis === "highlight") { ro2.highlight = "FFE7BF"; if (o.emColor) ro2.color = o.emColor; }
              }
              return { text: r.text, options: ro2 };
            });
            if (!runs.length) runs = [{ text: "" }];
            s.addText(runs, Object.assign(base, nm(o), { margin: 0, isTextBox: true, fontFace: o.font, fontSize: o.size, color: o.color, bold: o.bold, italic: o.italic, align: o.align, valign: o.valign, lineSpacingMultiple: o.spacing !== 1 ? o.spacing : undefined, vert: o.vert ? "eaVert" : undefined, fit: "none" }));
          } else if (o.t === "icon") {
            s.addImage(Object.assign(base, nm(o), { data: cache["i|" + o.name + "|" + o.variant + "|" + o.color] }));
          } else if (o.t === "headerArt") {
            s.addImage(Object.assign(base, { data: cache.art }));
          } else if (o.t === "photo") {
            if (o.src) { s.addImage(Object.assign(base, nm(o), /^data:/.test(o.src) ? { data: o.src.replace(/^data:/, "") } : { path: o.src }, { sizing: { type: "cover", w: o.w, h: o.h } })); return; }
            s.addShape(pres.shapes.RECTANGLE, Object.assign({}, base, nm(o), { fill: { color: "EEF0F3" }, line: { color: "C9CED6", width: 1, dashType: "dash" } }));
            var dd = Math.min(0.6, o.h * 0.3);
            s.addImage(Object.assign({ x: o.x + o.w / 2 - dd / 2, y: o.y + o.h / 2 - dd * 0.95, w: dd, h: dd }, nm(o), { data: cache["i|camera|solid|9CA3AF"] }));
            s.addText(o.label || "", Object.assign({ x: o.x + 0.1, y: o.y + o.h / 2 + 0.05, w: o.w - 0.2, h: 0.5 }, nm(o), { fontSize: 11, color: P.muted, align: "center", margin: 0, isTextBox: true, fontFace: style.fonts.body }));
          } else if (o.t === "chart") {
            var sp = o.spec || {}, type = sp.type === "line" ? pres.charts.LINE : pres.charts.BAR;
            var data = (sp.series || []).map(function (se) { return { name: se.name || "", labels: sp.categories || [], values: (se.values || []).map(Number) }; });
            var single = data.length === 1, colors = single ? [P.primary] : [P.primary, P.accent, P.mid, P.dark];
            var co = Object.assign(base, nm(o), { barDir: sp.type === "bar" ? "bar" : "col", chartColors: colors, showValue: true, dataLabelFormatCode: sp.format || "0.0", dataLabelFontSize: 10, dataLabelColor: P.text,
              catAxisLabelFontSize: 10.5, valAxisLabelFontSize: 10, catAxisLabelColor: P.muted, valAxisLabelColor: P.muted, catAxisLabelFontFace: style.fonts.body, valAxisLabelFontFace: style.fonts.body,
              valGridLine: { color: "E5E7EB", size: 0.5 }, catGridLine: { style: "none" }, showLegend: !single, legendPos: "t", legendFontSize: 10.5, legendFontFace: style.fonts.body, barGapWidthPct: 80 });
            var allv = [].concat.apply([], data.map(function (d) { return d.values; }));
            if (allv.length && Math.max.apply(0, allv) <= 0) co.valAxisMaxVal = 0;
            if (allv.length && Math.min.apply(0, allv) >= 0 && sp.type !== "line") co.valAxisMinVal = 0;
            if (sp.type === "bar") { co.catAxisLabelPos = "low"; co.catAxisOrientation = "maxMin"; }
            if (sp.type === "line") { co.lineSize = 2; co.lineDataSymbolSize = 6; co.showValue = !!sp.showValue; }
            if (single && sp.type !== "line" && (sp.categories || []).length > 3) co.invertIfNegative = false;
            s.addChart(type, data, co);
          } else if (o.t === "table") {
            var spc = o.spec || {}, hc = spc.highlightCol, rows = [];
            var cell = function (t, hd, j, i) { return { text: plain(t), options: { bold: hd || j === hc, color: hd ? "FFFFFF" : P.text, fill: { color: hd ? (j === hc ? P.accent : P.primary) : (j === hc ? P.warm : (i % 2 ? "FFFFFF" : P.pale)) }, align: hd ? "center" : (j === 0 ? "left" : "center"), valign: "middle" } }; };
            if ((spc.head || []).length) rows.push(spc.head.map(function (t, j) { return cell(t, true, j, 0); }));
            (spc.rows || []).forEach(function (r, i) { rows.push(r.map(function (t, j) { return cell(t, false, j, i); })); });
            var ncol = Math.max.apply(0, rows.map(function (r) { return r.length; }).concat([1])), cw = spc.colW;
            if (cw) { var tot = cw.reduce(function (a, b) { return a + b; }, 0); cw = cw.map(function (v) { return v / tot * o.w; }); }
            if (rows.length) s.addTable(rows, Object.assign({ x: o.x, y: o.y, w: o.w }, nm(o), { colW: cw || Array(ncol).fill(o.w / ncol), fontSize: 12.5, fontFace: style.fonts.body, rowH: 0.4, border: { type: "solid", pt: 0.5, color: P.line }, margin: 0.06 }));
          }
        });
        if (sl.notes) s.addNotes(sl.notes);
      });
      var mode = style.animation;
      return pres.write({ outputType: "arraybuffer" }).then(function (buf) {
        if (mode === "none" || !opts.JSZip) return buf;
        return opts.JSZip.loadAsync(buf).then(function (zip) {
          var jobs = slides.map(function (sl, i) {
            var plan = animationPlan(sl, mode), f = zip.file("ppt/slides/slide" + (i + 1) + ".xml");
            if (!plan.length || !f) return null;
            return f.async("string").then(function (xml) { zip.file("ppt/slides/slide" + (i + 1) + ".xml", injectTiming(xml, plan)); });
          });
          return Promise.all(jobs).then(function () { return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" }); });
        });
      }).then(function (ab) {
        if (opts.outputType === "nodebuffer") return Buffer.from(ab);
        if (opts.outputType === "blob") return new Blob([ab], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
        return ab;
      });
    });
  }

  // ------------------------------------------------------------------ catalog (for prompts / docs)
  function layoutCatalog() {
    return LAYOUTS.map(function (l) { return { id: l.id, letter: l.letter, name: l.name, use: l.use, fields: l.fields, sample: l.sample }; });
  }
  function sampleDeck() {
    return { meta: { title: "AI 采纳与管理专长需求", subtitle: "来自美国企业招聘数据的证据", english: "AI Adoption and the Demand for Managerial Expertise · SMJ 2026", course: "文献汇报", author: "汇报人：________", date: "2026 年 11 月", sections: ["研究背景", "文献与理论", "数据与识别", "实证结果", "结论"], nav: ["背景", "文献", "数据", "结果", "结论"] },
      slides: LAYOUTS.map(function (l) { return clone(l.sample); }) };
  }


  /** Style summary in words (for prompts and the UI). */
  function styleSummary(style) {
    style = resolveStyle(style);
    return TRAITS.filter(function (t) { return OPTIONS[t]; }).map(function (t) {
      var o = OPTIONS[t].filter(function (x) { return x[0] === style[t]; })[0];
      return TRAIT_LABEL[t] + "：" + (o ? o[1] : style[t]);
    }).join("；") + "；主色 #" + style.palette.primary + "，强调色 #" + style.palette.accent;
  }
  /** The prompt a user pastes into any AI together with the source document. */
  function promptText(style, opts) {
    opts = opts || {};
    var cat = layoutCatalog(), example = { meta: sampleDeck().meta, slides: [cat[0].sample, cat[1].sample, cat[3].sample, cat[4].sample] };
    var lines = [];
    lines.push("# 任务：把我上传的文档做成 doc-to-ppt 的 deck.json");
    lines.push("");
    lines.push("请读我上传的文档，写出一份中文汇报 PPT 的内容，输出为 deck.json。我会把它导入 doc-to-ppt 网页，网页负责排版、配色、动画和导出 .pptx；你只负责内容和讲稿。");
    lines.push("");
    lines.push("## 汇报信息");
    lines.push("- 用途：" + (opts.purpose || "文献汇报") + "；时长：" + (opts.minutes || 15) + " 分钟左右，约 " + Math.round((opts.minutes || 15) * 0.9) + "–" + Math.round((opts.minutes || 15) * 1.1) + " 页（含章节目录页）");
    if (style) lines.push("- 已选风格（只影响排版，供你了解）：" + styleSummary(style));
    lines.push("");
    lines.push("## 步骤");
    lines.push("1. 读文档。留意版本（工作论文还是正式发表版），版本不一致时在摘要页注明。");
    lines.push("2. 写主线：一句话（大家以为什么 → 本文发现什么 → 我最放心 / 最不放心的是什么），再列一张表：章 | 这一章让听众记住的一句话 | 过渡到下一章的一句话。研究问题与最后的答案要一一对应，答案照原文说，不往好听里说。");
    lines.push("3. 列分镜表：页码 | 页标题 | 本页阅读重点 | 版式 id | 讲解时长。不要连续两页用同一种版式；时长按重点分配。");
    lines.push("4. 给我看主线和分镜表。我确认后（或者我说“直接做”时）输出完整的 deck.json，放在一个 ```json 代码块里，不要省略任何一页。");
    lines.push("");
    lines.push("## 内容规则");
    lines.push("- 标题：文献汇报 / 开题 / 答辩用标准章节名（Abstract、研究背景、研究问题、文献综述、理论框架、数据与方法、实证结果、稳健性检验、结论与讨论、研究局限）；一章多页写“实证结果：管理岗数量”，冒号后不超过 6 个字。结论句放进 conclusion 字段，不放标题。");
    lines.push("- 每页只有一个视觉重点：用 **两个星号** 标关键词，每页最多 2 处；标签类文字不要标。");
    lines.push("- 数字、系数、样本量照原文；系数和标准误分开写（如 0.072（SE 0.021））。你自己的归纳、估算、评述要写明“汇报人……”。");
    lines.push("- 文字要短：卡片每条不超过 20 个字，正文段不超过 80 个字；字段数量不要超过版式说明里的上限。");
    lines.push("- 不写口号式金句（全篇最多 3 句），不写“待核实”“暂未找到”之类的过程痕迹；查不到的内容就不写。");
    lines.push("- 讲稿 notes：用汇报人的口吻写，第一人称、口语、短句；每页第一句接上一页，每章最后一句引出下一章；每章至少一句自己的看法或疑问；术语第一次出现时顺带解释；按每分钟约 250 字估算总时长。");
    lines.push("");
    lines.push("## deck.json 格式");
    lines.push("```");
    lines.push("{ \"meta\": { \"title\", \"subtitle\", \"english\", \"course\", \"author\", \"date\", \"sections\": [章节名…], \"nav\": [每章 2–3 字简称…] },");
    lines.push("  \"slides\": [ { \"layout\": 版式 id, \"no\": \"1.1\"（可选）, \"title\", \"section\": 所属章节序号（从 0 开始）, \"tag\": \"回应 RQ①\"（可选）, \"conclusion\"（可选）, \"conclusionLabel\"（可选，默认“核心观点”）, \"source\"（可选）, \"notes\": 讲稿, …版式字段 } ] }");
    lines.push("```");
    lines.push("每章第一页放一张 section 页；第一页用 cover，最后用 summary 或 end。");
    lines.push("icon 字段只能用这些名字：" + Object.keys(ICONS).join("、") + "。");
    lines.push("");
    lines.push("## 可用版式");
    cat.forEach(function (l) {
      lines.push("### " + l.id + "（" + l.name + "）");
      lines.push("- 用途：" + l.use);
      lines.push("- 字段：" + l.fields);
      lines.push("- 示例：`" + JSON.stringify(l.sample) + "`");
    });
    lines.push("");
    lines.push("## 输出前自查");
    lines.push("- 每个数字能在原文里找到；每篇文献的观点归属正确；研究问题、缺口、结果页、总结页的答案一致；");
    lines.push("- 同一件事在不同页的说法一致；编号闭环（如“回应①”）和原文的方法对应；");
    lines.push("- JSON 合法：双引号、无注释、无尾逗号。");
    lines.push("");
    lines.push("## 示例（节选）");
    lines.push("```json");
    lines.push(JSON.stringify(example, null, 1));
    lines.push("```");
    return lines.join("\n");
  }

  return { styleSummary: styleSummary, promptText: promptText, W: W, H: H, TRAITS: TRAITS, OPTIONS: OPTIONS, TRAIT_LABEL: TRAIT_LABEL, DEFAULT_STYLE: DEFAULT_STYLE, LAYOUTS: LAYOUTS,
    resolveStyle: resolveStyle, derivePalette: derivePalette, mix: mix, parseRich: parseRich,
    buildDeck: buildDeck, renderHTML: renderHTML, buildPptx: buildPptx, animationPlan: animationPlan,
    layoutCatalog: layoutCatalog, sampleDeck: sampleDeck, iconSvg: iconSvg, headerArtSvg: headerArtSvg, ICONS: ICONS };
});
