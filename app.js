/* doc-to-ppt web app: gallery, layout library, style configurator, deck preview/editor, pptx export. */
(function () {
  "use strict";
  var D = window.Doc2PPT, BUILTIN = window.DOC2PPT_THEMES || [];
  var $ = function (s) { return document.querySelector(s); };
  var el = function (tag, attrs, html) { var e = document.createElement(tag); Object.keys(attrs || {}).forEach(function (k) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }); if (html != null) e.innerHTML = html; return e; };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("d2p." + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("d2p." + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  // ---------------------------------------------------------------- state
  var userThemes = store.get("userThemes", []);
  function allThemes() { return BUILTIN.map(function (t) { return Object.assign({ _builtin: true }, t); }).concat(userThemes.map(function (t) { return Object.assign({ _mine: true }, t); })); }
  function themeMap() { var m = {}; allThemes().forEach(function (t) { m[t.name] = t; }); return m; }
  var style = D.resolveStyle(store.get("style", BUILTIN[0] || D.DEFAULT_STYLE));
  function exampleDeck() { return clone(window.DOC2PPT_EXAMPLE || D.sampleDeck()); }
  var deck = store.get("deck", null) || exampleDeck();
  var cur = 0;
  var SAMPLE = D.sampleDeck();
  function sampleSlides(ids) { return { meta: SAMPLE.meta, slides: ids.map(function (id) { return clone(SAMPLE.slides.filter(function (s) { return s.layout === id; })[0]); }) }; }

  function setStyle(s, silent) {
    style = D.resolveStyle(s); store.set("style", style);
    $("#curStyle").textContent = style.label || style.name;
    document.documentElement.style.setProperty("--primary", "#" + style.palette.primary);
    document.documentElement.style.setProperty("--accent", "#" + style.palette.accent);
    document.documentElement.style.setProperty("--soft", "#" + style.palette.pale);
    if (!silent) { renderLayouts(); renderConfig(); renderDeck(); }
  }
  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600); }
  // Downloads: inside a claude.ai artifact the page must ask the viewer through the downloads capability;
  // on GitHub Pages / a local file a normal link download is used.
  var dlNs = null;
  if (window.claude && typeof window.claude.use === "function") window.claude.use("downloads").then(function (ns) { dlNs = ns; }, function () {});
  function download(name, data, type) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: type || "application/json" });
    if (dlNs) {
      return dlNs.save({ filename: name, data: blob }).then(function (r) { toast(r && r.status === "delivered" ? "已发送" : "已保存：" + name); }, function (e) {
        if (e && e.code === "declined") return toast("已取消保存");
        uiAlert("保存失败", (e && e.message) || "这个视图不能保存文件。");
      });
    }
    var a = el("a", { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return Promise.resolve();
  }
  // In-page dialogs (browser alert/confirm/prompt are blocked in some hosts).
  function uiAlert(title, text) { var b = el("div"); b.appendChild(el("p", { style: "white-space:pre-wrap;margin:0" }, esc(text))); var ok = el("button", { class: "btn primary" }, "知道了"); ok.onclick = function () { $("#modal").hidden = true; }; b.appendChild(ok); modal(title, b); }
  function uiConfirm(text, okLabel, onOk) { var b = el("div"); b.appendChild(el("p", { style: "margin:0" }, esc(text))); var row = el("div", { class: "row" }); var ok = el("button", { class: "btn primary" }, okLabel || "确定"), no = el("button", { class: "btn" }, "取消"); ok.onclick = function () { $("#modal").hidden = true; onOk(); }; no.onclick = function () { $("#modal").hidden = true; }; row.appendChild(ok); row.appendChild(no); b.appendChild(row); modal("请确认", b); }
  function uiPrompt(title, value, onOk) { var b = el("div"); var inp = el("input", { type: "text", id: "uiPromptInput", style: "width:100%" }); inp.value = value || ""; var ok = el("button", { class: "btn primary" }, "保存"); ok.onclick = function () { if (!inp.value.trim()) return; $("#modal").hidden = true; onOk(inp.value.trim()); }; b.appendChild(inp); b.appendChild(ok); modal(title, b); setTimeout(function () { inp.focus(); }, 50); }
  function modal(title, bodyEl) { $("#mTitle").textContent = title; var b = $("#mBody"); b.innerHTML = ""; b.appendChild(bodyEl); $("#modal").hidden = false; }
  $("#mClose").onclick = function () { $("#modal").hidden = true; };
  $("#modal").onclick = function (e) { if (e.target.id === "modal") $("#modal").hidden = true; };

  // ---------------------------------------------------------------- slide thumbnails
  var PX = 72, SW = D.W * PX, SH = D.H * PX;
  var ro = new ResizeObserver(function (entries) { entries.forEach(function (en) { var sc = en.target.querySelector(".scaler"); if (sc) sc.style.transform = "scale(" + (en.contentRect.width / SW) + ")"; }); });
  function slideBox(slideOps, st) {
    var box = el("div", { class: "thumbBox" }), sc = el("div", { class: "scaler" }, D.renderHTML(slideOps, st || style, PX));
    box.appendChild(sc); ro.observe(box); return box;
  }
  function renderDeckSlides(dk, st) { return D.buildDeck(clone(dk), st || style); }

  // ---------------------------------------------------------------- tabs
  document.querySelectorAll("#tabs button").forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll("#tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
      document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("on", t.id === "tab-" + b.dataset.tab); });
      store.set("tab", b.dataset.tab);
    };
  });
  function goTab(name) { var b = document.querySelector('#tabs button[data-tab="' + name + '"]'); if (b) b.click(); }

  // ---------------------------------------------------------------- gallery
  var CHIP = { header: { slash: "斜杠页眉", line: "细线页眉" }, footer: { bar: "页脚条", min: "极简页脚", none: "无页脚" }, card: { soft: "柔和投影", strong: "较强投影", flat: "扁平浅底", outline: "只描边" }, titleBox: { solid: "直角标题框", round: "圆角标题框", pale: "浅底标题框", underline: "下划线标题" }, number: { circle: "圆形编号", square: "方块编号", code: "圈码", none: "无编号" }, icon: { dot: "圆底图标", line: "线性图标", none: "少用图标" }, animation: { speech: "语速自动动画", standard: "标准动画", simple: "精简动画", none: "无动画" } };
  function renderGallery() {
    var grid = $("#themeGrid"), list = allThemes(); grid.innerHTML = "";
    $("#themeCount").textContent = "共 " + list.length + " 套（内置 " + BUILTIN.length + "，我的 " + userThemes.length + "）";
    var demo = sampleSlides(["cover", "framework"]);
    list.forEach(function (t) {
      var st = D.resolveStyle(t), card = el("div", { class: "card" });
      card.appendChild(el("h3", {}, esc(t.label || t.name) + (t._mine ? ' <span class="badge mine">我的</span>' : ' <span class="badge">内置</span>')));
      var row = el("div", { class: "thumbRow" }); renderDeckSlides(demo, st).forEach(function (s) { row.appendChild(slideBox(s, st)); }); card.appendChild(row);
      if (t.description) card.appendChild(el("p", { class: "desc" }, esc(t.description)));
      var P = st.palette; card.appendChild(el("div", { class: "sw" }, ["primary", "accent", "dark", "pale2", "warm"].map(function (k) { return '<i title="' + k + " #" + P[k] + '" style="background:#' + P[k] + '"></i>'; }).join("") + '<span class="chips">' + (t.tags || []).map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("") + "</span>"));
      card.appendChild(el("div", { class: "chips" }, Object.keys(CHIP).map(function (k) { return "<span>" + (CHIP[k][st[k]] || st[k]) + "</span>"; }).join("")));
      var act = el("div", { class: "actions" });
      var use = el("button", { class: "btn primary" }, "用这套风格"); use.onclick = function () { setStyle(clone(st)); toast("已切换到：" + (t.label || t.name)); goTab("config"); };
      var dl = el("button", { class: "btn" }, "下载 JSON"); dl.onclick = function () { var o = clone(t); delete o._builtin; delete o._mine; download((t.name || "theme") + ".json", JSON.stringify(o, null, 2)); };
      act.appendChild(use); act.appendChild(dl);
      if (t._mine) { var del = el("button", { class: "btn danger" }, "删除"); del.onclick = function () { uiConfirm("删除模板“" + (t.label || t.name) + "”？", "删除", function () { userThemes = userThemes.filter(function (u) { return u.name !== t.name; }); store.set("userThemes", userThemes); renderGallery(); renderConfig(); }); }; act.appendChild(del); }
      card.appendChild(act); grid.appendChild(card);
    });
  }
  $("#importTheme").onchange = function (e) {
    var f = e.target.files[0]; if (!f) return;
    f.text().then(function (txt) {
      var t = JSON.parse(txt); if (!t.palette || !t.palette.primary) throw new Error("缺少 palette.primary");
      t.name = t.name || ("my-" + Date.now()); t.label = t.label || t.name;
      userThemes = userThemes.filter(function (u) { return u.name !== t.name; }).concat([t]); store.set("userThemes", userThemes);
      renderGallery(); renderConfig(); toast("已导入：" + t.label);
    }).catch(function (err) { uiAlert("导入失败", err.message); });
    e.target.value = "";
  };
  (function setRepoLink() {
    var a = $("#submitTheme"), h = location.hostname, parts = location.pathname.split("/").filter(Boolean);
    var base = window.DOC2PPT_REPO ? window.DOC2PPT_REPO : h.endsWith("github.io") ? "https://github.com/" + h.split(".")[0] + "/" + (parts[0] || "doc-to-ppt") : "https://github.com/jerry111-8/doc-to-ppt";
    if (base) a.href = base + "/issues/new?template=theme.yml"; else { a.href = "#"; a.onclick = function (e) { e.preventDefault(); uiAlert("提交到公开模板库", "把这个工具发布到 GitHub Pages 后，这个按钮会打开仓库的“提交新模板”表单。现在可以先点“下载 JSON”，再到仓库的 Issues 里提交。"); }; }
  })();

  // ---------------------------------------------------------------- layout library
  function renderLayouts() {
    var grid = $("#layoutGrid"); grid.innerHTML = "";
    var cat = D.layoutCatalog(); $("#layoutCount").textContent = "共 " + cat.length + " 种";
    cat.forEach(function (l) {
      var card = el("div", { class: "card" });
      card.appendChild(el("h3", {}, esc(l.name) + ' <span class="badge">' + esc(l.id) + "</span>"));
      card.appendChild(slideBox(renderDeckSlides({ meta: SAMPLE.meta, slides: [clone(l.sample)] })[0]));
      card.appendChild(el("p", { class: "desc" }, esc(l.use)));
      card.appendChild(el("p", { class: "fields" }, "<b>字段：</b>" + esc(l.fields)));
      var act = el("div", { class: "actions" });
      var cp = el("button", { class: "btn" }, "复制示例 JSON"); cp.onclick = function () { copy(JSON.stringify(l.sample, null, 2)); };
      var add = el("button", { class: "btn" }, "加到我的 deck"); add.onclick = function () { deck.slides.splice(cur + 1, 0, clone(l.sample)); cur = cur + 1; saveDeck(); renderDeck(); toast("已插入到第 " + (cur + 1) + " 页"); };
      act.appendChild(cp); act.appendChild(add); card.appendChild(act); grid.appendChild(card);
    });
  }
  function copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast("已复制到剪贴板"); }, function () {
      var ta = el("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast("已复制到剪贴板"); } catch (e) { toast("复制失败，请手动选中文字复制"); } ta.remove();
    });
  }

  // ---------------------------------------------------------------- configurator
  var FONTS = [["Microsoft YaHei", "Microsoft YaHei", "微软雅黑（Windows 通用）"], ["Source Han Sans SC", "Source Han Sans SC", "思源黑体"], ["PingFang SC", "PingFang SC", "苹方（Mac）"], ["SimHei", "SimSun", "标题黑体 + 正文宋体"]];
  function renderConfig() {
    var panel = $("#configPanel"); panel.innerHTML = "";
    var add = function (h) { panel.appendChild(el("h4", {}, h)); };
    add("起点模板");
    var sel = el("select"); allThemes().forEach(function (t) { var o = el("option", { value: t.name }, esc(t.label || t.name) + (t._mine ? "（我的）" : "")); if (t.name === style.name) o.selected = true; sel.appendChild(o); });
    sel.onchange = function () { setStyle(clone(themeMap()[sel.value])); }; panel.appendChild(sel);
    add("名称");
    var nm = el("input", { type: "text", value: style.label || "" }); nm.onchange = function () { var s = clone(style); s.label = nm.value || "我的风格"; s.name = slug(s.label); setStyle(s, true); }; panel.appendChild(nm);
    add("配色：借用某个模板的配色");
    var pr = el("div", { class: "palRow" });
    allThemes().forEach(function (t) { var b = el("button", {}, '<i style="background:#' + t.palette.primary + '"></i><i style="background:#' + t.palette.accent + '"></i>' + esc(t.label || t.name)); b.onclick = function () { var s = clone(style); s.palette = clone(t.palette); setStyle(s); }; pr.appendChild(b); });
    panel.appendChild(pr);
    var cr = el("div", { class: "colorRow" }, '主色 <input type="color" id="cPrimary" value="#' + style.palette.primary + '"> 强调色 <input type="color" id="cAccent" value="#' + style.palette.accent + '"> <button class="btn sm" id="cAuto">按主色自动配</button>');
    panel.appendChild(cr);
    cr.querySelector("#cPrimary").onchange = function (e) { var s = clone(style); s.palette.primary = e.target.value.slice(1).toUpperCase(); setStyle(s); };
    cr.querySelector("#cAccent").onchange = function (e) { var s = clone(style); s.palette.accent = e.target.value.slice(1).toUpperCase(); s.palette.warm = D.mix(s.palette.accent, "FFFFFF", 0.9); s.palette.warmEdge = D.mix(s.palette.accent, "FFFFFF", 0.6); setStyle(s); };
    cr.querySelector("#cAuto").onclick = function () { var s = clone(style); s.palette = D.derivePalette(style.palette.primary); setStyle(s); toast("已按主色配出浅色、深色和强调色"); };
    ["header", "footer", "nav", "card", "titleBox", "number", "icon", "emphasis", "animation"].forEach(function (k) {
      add(D.TRAIT_LABEL[k]);
      var box = el("div", { class: "opts" });
      D.OPTIONS[k].forEach(function (op) { var b = el("button", { class: style[k] === op[0] ? "on" : "" }, esc(op[1])); b.onclick = function () { var s = clone(style); s[k] = op[0]; setStyle(s); }; box.appendChild(b); });
      panel.appendChild(box);
    });
    add("字体");
    var fb = el("div", { class: "opts" });
    FONTS.forEach(function (f) { var b = el("button", { class: style.fonts.head === f[0] && style.fonts.body === f[1] ? "on" : "" }, esc(f[2])); b.onclick = function () { var s = clone(style); s.fonts = { head: f[0], body: f[1] }; setStyle(s); }; fb.appendChild(b); });
    panel.appendChild(fb);
    var pv = $("#configPreview"); pv.innerHTML = "";
    renderDeckSlides(sampleSlides(["cover", "framework", "chart", "steps"])).forEach(function (s) { pv.appendChild(slideBox(s)); });
  }
  function slug(s) { return ("my-" + String(s).toLowerCase().replace(/[^a-z0-9一-龥]+/g, "-")).slice(0, 40) + "-" + Date.now().toString(36).slice(-4); }
  $("#dlStyle").onclick = function () { download("style.json", JSON.stringify(style, null, 2)); };
  $("#saveTheme").onclick = function () {
    uiPrompt("给这套风格起个名字", style.label && !/^蓝橙学术$|^墨绿简约$|^绛红稳重$|^深海科技$|^蓝橙立体$/.test(style.label) ? style.label : "我的风格", function (label) {
      var t = clone(style); t.label = label; t.name = slug(label); t.description = "我在配置器里保存的风格"; t.tags = ["我的"];
      userThemes.push(t); store.set("userThemes", userThemes); setStyle(t); renderGallery(); toast("已保存到模板库（只在这个浏览器里）");
    });
  };
  $("#showPrompt").onclick = function () {
    var body = el("div");
    var row = el("div", { class: "row" }, '<label>用途 <select id="pPurpose"><option>文献汇报</option><option>开题 / 答辩</option><option>课程报告</option><option>工作汇报</option></select></label><label>时长（分钟） <input id="pMin" type="number" value="15" min="5" max="60" style="width:70px"></label><button class="btn primary" id="pCopy">复制提示词</button>');
    var ta = el("textarea", { readonly: "readonly" });
    var refresh = function () { ta.value = D.promptText(style, { purpose: row.querySelector("#pPurpose").value, minutes: +row.querySelector("#pMin").value || 15 }); };
    body.appendChild(el("p", { class: "hint" }, "把这段提示词和你的论文一起发给任意 AI。AI 会先给你看主线和分镜表，确认后输出 deck.json；把它的回复粘贴到“预览与导出”即可。"));
    body.appendChild(row); body.appendChild(ta);
    row.querySelector("#pPurpose").onchange = refresh; row.querySelector("#pMin").oninput = refresh;
    row.querySelector("#pCopy").onclick = function () { copy(ta.value); };
    refresh(); modal("给 AI 的提示词", body);
  };

  // ---------------------------------------------------------------- deck editor
  function saveDeck() { store.set("deck", deck); }
  var layoutSel = $("#edLayout");
  D.layoutCatalog().forEach(function (l) { layoutSel.appendChild(el("option", { value: l.id }, esc(l.id + " · " + l.name))); });
  var built = [];
  function renderDeck() {
    if (!deck.slides || !deck.slides.length) deck.slides = [clone(SAMPLE.slides[0])];
    cur = Math.max(0, Math.min(cur, deck.slides.length - 1));
    built = renderDeckSlides(deck);
    $("#deckInfo").textContent = (deck.meta && deck.meta.title ? deck.meta.title + " · " : "") + deck.slides.length + " 页 · 讲稿约 " + Math.round(deck.slides.reduce(function (a, s) { return a + String(s.notes || "").replace(/\s/g, "").length; }, 0) / 250) + " 分钟";
    var th = $("#thumbs"); th.innerHTML = "";
    built.forEach(function (b, i) {
      var t = el("div", { class: "t" + (i === cur ? " on" : "") }); t.appendChild(slideBox(b));
      t.appendChild(el("small", {}, (i + 1) + ". " + esc(deck.slides[i].title || deck.slides[i].layout)));
      t.onclick = function () { cur = i; renderDeck(); }; th.appendChild(t);
    });
    showCurrent(true);
  }
  function showCurrent(updateEditors) {
    var big = $("#bigPreview"); big.innerHTML = ""; big.appendChild(slideBox(built[cur]));
    if (updateEditors) {
      var s = clone(deck.slides[cur]), notes = s.notes || ""; delete s.notes;
      $("#edJson").value = JSON.stringify(s, null, 2); $("#edNotes").value = notes; layoutSel.value = deck.slides[cur].layout;
      msg("");
    }
  }
  function msg(t, err) { var m = $("#edMsg"); m.textContent = t; m.className = "msg" + (err ? " err" : ""); }
  var deb;
  $("#edJson").oninput = function () {
    clearTimeout(deb); deb = setTimeout(function () {
      try { var s = JSON.parse($("#edJson").value); s.notes = $("#edNotes").value; deck.slides[cur] = s; saveDeck(); built = renderDeckSlides(deck); showCurrent(false); refreshThumb(cur); msg("已更新"); }
      catch (e) { msg("JSON 格式有误：" + e.message, true); }
    }, 350);
  };
  $("#edNotes").oninput = function () { deck.slides[cur].notes = $("#edNotes").value; saveDeck(); };
  function refreshThumb(i) { var t = $("#thumbs").children[i]; if (!t) return; var box = t.querySelector(".thumbBox"); box.replaceWith(slideBox(built[i])); t.querySelector("small").textContent = (i + 1) + ". " + (deck.slides[i].title || deck.slides[i].layout); }
  layoutSel.onchange = function () {
    var old = deck.slides[cur], sample = clone(D.layoutCatalog().filter(function (l) { return l.id === layoutSel.value; })[0].sample);
    ["no", "title", "section", "notes", "source", "conclusion", "tag"].forEach(function (k) { if (old[k] != null) sample[k] = old[k]; });
    deck.slides[cur] = sample; saveDeck(); renderDeck(); toast("已换成 " + layoutSel.value + "，请把示例文字改成你的内容");
  };
  $("#edUp").onclick = function () { if (cur < 1) return; var a = deck.slides; a.splice(cur - 1, 0, a.splice(cur, 1)[0]); cur--; saveDeck(); renderDeck(); };
  $("#edDown").onclick = function () { var a = deck.slides; if (cur >= a.length - 1) return; a.splice(cur + 1, 0, a.splice(cur, 1)[0]); cur++; saveDeck(); renderDeck(); };
  $("#edDup").onclick = function () { deck.slides.splice(cur + 1, 0, clone(deck.slides[cur])); cur++; saveDeck(); renderDeck(); };
  $("#edDel").onclick = function () { if (deck.slides.length < 2) return; uiConfirm("删除第 " + (cur + 1) + " 页？", "删除", function () { deck.slides.splice(cur, 1); saveDeck(); renderDeck(); }); };
  $("#edAdd").onclick = function () { deck.slides.splice(cur + 1, 0, clone(SAMPLE.slides.filter(function (s) { return s.layout === "columns"; })[0])); cur++; saveDeck(); renderDeck(); };
  $("#edMeta").onclick = function () {
    var body = el("div"), ta = el("textarea"); ta.value = JSON.stringify(deck.meta || {}, null, 2);
    var ok = el("button", { class: "btn primary" }, "保存");
    ok.onclick = function () { try { deck.meta = JSON.parse(ta.value); saveDeck(); renderDeck(); $("#modal").hidden = true; } catch (e) { toast("JSON 格式有误：" + e.message); } };
    body.appendChild(el("p", { class: "hint" }, "title / subtitle / english / course / author / date 显示在封面；sections 是章节名（目录页和页脚用），nav 是右上导航条的简称。"));
    body.appendChild(ta); body.appendChild(ok); modal("封面与章节信息（meta）", body);
  };

  /** Accept a raw deck.json or a whole AI reply containing a ```json block. */
  function parseDeckText(txt) {
    var m = txt.match(/```(?:json)?\s*([\s\S]*?)```/g), cands = [];
    if (m) m.forEach(function (b) { cands.push(b.replace(/^```(?:json)?\s*/, "").replace(/```$/, "")); });
    cands.push(txt);
    var a = txt.indexOf("{"), z = txt.lastIndexOf("}"); if (a >= 0 && z > a) cands.push(txt.slice(a, z + 1));
    for (var i = 0; i < cands.length; i++) {
      try { var o = JSON.parse(cands[i].replace(/,\s*([}\]])/g, "$1")); if (o && Array.isArray(o.slides)) return o; } catch (e) { /* try next */ }
    }
    throw new Error("没有找到包含 slides 的 JSON。请确认 AI 输出了完整的 deck.json。");
  }
  function checkDeck(dk) {
    var ids = D.layoutCatalog().map(function (l) { return l.id; }), warn = [];
    dk.slides.forEach(function (s, i) {
      if (ids.indexOf(s.layout) < 0) warn.push("第 " + (i + 1) + " 页的版式 “" + s.layout + "” 不存在，已按 columns 显示");
      if (i && s.layout === dk.slides[i - 1].layout && ["section", "cover"].indexOf(s.layout) < 0) warn.push("第 " + i + "、" + (i + 1) + " 页用了同一种版式");
      var em = (JSON.stringify(s).match(/\*\*/g) || []).length / 2; if (em > 3) warn.push("第 " + (i + 1) + " 页强调了 " + em + " 处，建议不超过 2 处");
      if (/待核实|暂未找到|据检索/.test(JSON.stringify(s))) warn.push("第 " + (i + 1) + " 页有“待核实 / 暂未找到”之类的过程痕迹");
    });
    return warn;
  }
  function loadDeck(dk) {
    deck = dk; deck.meta = deck.meta || {}; cur = 0; saveDeck(); renderDeck(); goTab("deck");
    var w = checkDeck(deck);
    toast("已导入 " + deck.slides.length + " 页" + (w.length ? "，有 " + w.length + " 条提醒" : ""));
    if (w.length) setTimeout(function () { uiAlert("导入提醒", w.join("\n")); }, 300);
  }
  $("#importDeck").onchange = function (e) { var f = e.target.files[0]; if (!f) return; f.text().then(function (t) { loadDeck(parseDeckText(t)); }).catch(function (err) { uiAlert("导入失败", err.message); }); e.target.value = ""; };
  $("#pasteDeck").onclick = function () {
    var body = el("div"), ta = el("textarea", { placeholder: "把 AI 的整段回复粘贴到这里（会自动提取其中的 ```json 代码块）" }), ok = el("button", { class: "btn primary" }, "导入");
    ok.onclick = function () { try { var dk = parseDeckText(ta.value); $("#modal").hidden = true; loadDeck(dk); } catch (e) { toast(e.message); } };
    body.appendChild(ta); body.appendChild(ok); modal("粘贴 AI 的回复", body);
  };
  $("#loadSample").onclick = function () { uiConfirm("载入示例会替换当前的 deck。需要的话，先点“下载 deck.json”备份。", "载入示例", function () { loadDeck(exampleDeck()); }); };
  $("#dlDeck").onclick = function () { download("deck.json", JSON.stringify(deck, null, 2)); };

  // ---------------------------------------------------------------- export
  function rasterize(svg, size) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var r = img.naturalHeight && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1, cv = document.createElement("canvas");
        cv.width = size; cv.height = Math.round(size * r) || size;
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL("image/png").replace(/^data:/, ""));
      };
      img.onerror = reject;
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }
  $("#exportPptx").onclick = function () {
    var b = $("#exportPptx"); b.disabled = true; b.textContent = "正在生成…";
    D.buildPptx(clone(deck), style, { PptxGenJS: window.PptxGenJS, JSZip: window.JSZip, rasterize: rasterize, outputType: "blob" })
      .then(function (blob) { return download(((deck.meta && deck.meta.title) || "deck").replace(/[\\/:*?"<>|]/g, "_") + ".pptx", blob); })
      .catch(function (e) { console.error(e); uiAlert("导出失败", e.message); })
      .then(function () { b.disabled = false; b.textContent = "导出 PPTX"; });
  };

  // ---------------------------------------------------------------- boot
  setStyle(style, true);
  renderGallery(); renderLayouts(); renderConfig(); renderDeck();
  var t0 = store.get("tab", window.DOC2PPT_START_TAB || "gallery"); if (t0 !== "gallery") goTab(t0);
  window.__d2p = { get deck() { return deck; }, get style() { return style; }, exportBlob: function () { return D.buildPptx(clone(deck), style, { PptxGenJS: window.PptxGenJS, JSZip: window.JSZip, rasterize: rasterize, outputType: "arraybuffer" }); } };
})();
