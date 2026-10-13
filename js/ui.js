/* =========================================================
   LIFE QUEST — js/ui.js
   渲染层：面板绘制、技能树连线、提示 / 弹窗 / 粒子反馈
   ========================================================= */
(function (global) {
  "use strict";

  var LQ = global.LQ = global.LQ || {};
  var S = LQ.Store;
  var T = LQ.Tasks;
  var K = LQ.Skills;
  var A = LQ.Achievements;

  var doc = global.document;

  var dom = {};
  var selectedSkillId = null;
  var modalOpen = false;
  var lastFocused = null;

  /* ---------------- 小工具 ---------------- */
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function $(id) { return doc.getElementById(id); }

  function reduceMotion() {
    if (doc.body && doc.body.classList.contains("reduce-motion")) return true;
    try {
      return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function titleForLevel(level) {
    if (level <= 2) return "初入冒险的旅人";
    if (level <= 5) return "渐入佳境的探索者";
    if (level <= 9) return "稳步前行的小达人";
    if (level <= 15) return "自我管理的行者";
    if (level <= 24) return "技能树的主人";
    return "人生技能大师";
  }

  var TIER_NAMES = ["", "青铜", "白银", "黄金", "铂金", "钻石", "大师", "传奇"];

  function tierOfLevel(level) {
    if (level >= 40) return TIER_NAMES[7];
    return TIER_NAMES[Math.min(6, Math.floor((level - 1) / 5) + 1)];
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    dom.heroLevel = $("heroLevel");
    dom.heroName = $("heroName");
    dom.heroTitle = $("heroTitle");
    dom.heroDate = $("heroDate");
    dom.xpText = $("xpText");
    dom.xpFill = $("xpFill");
    dom.xpBar = $("xpBar");
    dom.xpNext = $("xpNext");
    dom.statCoins = $("statCoins");
    dom.statPoints = $("statPoints");
    dom.statTasks = $("statTasks");
    dom.statStreak = $("statStreak");
    dom.topbarName = $("topbarName");
    dom.chipAvatar = $("chipAvatar");
    dom.avatar = $("avatar");
    dom.taskList = $("taskList");
    dom.tasksSummary = $("tasksSummary");
    dom.taskEmptyHint = $("taskEmptyHint");
    dom.dayProgressFill = $("dayProgressFill");
    dom.dayProgressText = $("dayProgressText");
    dom.panelTasks = $("panel-tasks");
    dom.skillTree = $("skillTree");
    dom.treeLinks = $("treeLinks");
    dom.skillDetail = $("skillDetail");
    dom.pointsPill = $("pointsPill");
    dom.achGrid = $("achGrid");
    dom.achSummary = $("achSummary");
    dom.toastLayer = $("toastLayer");
    dom.fxLayer = $("fxLayer");
    dom.modalBackdrop = $("modalBackdrop");
    dom.modalTitle = $("modalTitle");
    dom.modalBody = $("modalBody");
    dom.modalActions = $("modalActions");
    dom.levelupOverlay = $("levelupOverlay");
    dom.levelupValue = $("levelupValue");
    dom.levelupNote = $("levelupNote");
    dom.saveMeta = $("saveMeta");
    dom.inputName = $("inputName");
    dom.motionBtn = $("btnToggleMotion");
    dom.motionHint = $("motionHint");
  }

  /* ---------------- 角色面板 ---------------- */
  function renderHero(state) {
    var p = state.progress;
    var need = S.xpNeeded(p.level);
    var pct = Math.max(0, Math.min(100, (p.xp / need) * 100));

    dom.heroLevel.textContent = p.level;
    dom.chipAvatar.textContent = p.level;
    dom.heroName.textContent = state.profile.name;
    dom.heroTitle.textContent = titleForLevel(p.level) + " · " + tierOfLevel(p.level);
    dom.topbarName.textContent = state.profile.name;

    var checked = T.isCheckedInToday(state);
    dom.heroDate.textContent = S.formatDateCN(state.daily.date) + (checked ? " · 今日已打卡 ✅" : " · 今日尚未打卡");

    dom.xpText.textContent = p.xp + " / " + need;
    dom.xpFill.style.width = pct.toFixed(1) + "%";
    dom.xpBar.setAttribute("aria-valuemax", String(need));
    dom.xpBar.setAttribute("aria-valuenow", String(p.xp));
    dom.xpNext.textContent = "距离 " + (p.level + 1) + " 级还需 " + Math.max(0, need - p.xp) + " XP";

    dom.statCoins.textContent = p.coins;
    dom.statPoints.textContent = p.points;
    dom.statTasks.textContent = p.totalTasks;
    dom.statStreak.textContent = T.currentStreak(state);
  }

  /* ---------------- 今日任务 ---------------- */
  function buildTaskItem(state, task) {
    var attr = T.attr(task.attr);

    var li = el("li", "task-item" + (task.done ? " is-done" : ""));
    li.dataset.id = task.id;

    var main = el("div", "task-main");

    var titleRow = el("div", "task-title-row");
    titleRow.appendChild(el("span", "task-title", task.title));
    var badge = el("span", "attr-badge attr-badge--" + attr.id, attr.icon + " " + attr.name);
    titleRow.appendChild(badge);
    main.appendChild(titleRow);

    var meta = el("div", "task-meta");
    meta.appendChild(el("span", "reward-pill reward-pill--xp", "+" + task.xp + " XP"));
    meta.appendChild(el("span", "reward-pill reward-pill--coin", "+" + task.coins + " 🪙"));
    meta.appendChild(el("span", null, "预计 " + task.duration + " " + (task.unit || "分钟")));
    if (task.builtin) meta.appendChild(el("span", null, "· 初始任务"));
    main.appendChild(meta);

    li.appendChild(main);

    var actions = el("div", "task-actions");
    if (task.done) {
      actions.appendChild(el("span", "done-stamp", "✅ 奖励已领取"));
    } else {
      var btn = el("button", "btn btn--primary btn--sm", "完成任务");
      btn.type = "button";
      btn.dataset.action = "complete";
      btn.dataset.id = task.id;
      btn.setAttribute("aria-label", "完成任务：" + task.title);
      actions.appendChild(btn);
    }
    var del = el("button", "icon-action", "🗑️");
    del.type = "button";
    del.dataset.action = "delete";
    del.dataset.id = task.id;
    del.title = "删除任务";
    del.setAttribute("aria-label", "删除任务：" + task.title);
    actions.appendChild(del);

    li.appendChild(actions);
    return li;
  }

  function renderTasks(state) {
    var frag = doc.createDocumentFragment();
    state.daily.tasks.forEach(function (task) {
      frag.appendChild(buildTaskItem(state, task));
    });
    dom.taskList.innerHTML = "";
    dom.taskList.appendChild(frag);

    var prog = T.dayProgress(state);
    dom.tasksSummary.textContent = "已完成 " + prog.done + " / " + prog.total + " 个任务 · 今日获得 " +
      (state.daily.xpGained || 0) + " XP / " + (state.daily.coinsGained || 0) + " 金币";
    dom.dayProgressFill.style.width = prog.percent + "%";
    dom.dayProgressText.textContent = prog.percent + "%";
    dom.taskEmptyHint.hidden = prog.total !== 0;
  }

  /* ---------------- 技能树 ---------------- */
  function buildSkillNode(state, branch, node) {
    var st = K.status(state, node.id);
    var slot = el("div", "node-slot node-slot--" + node.slot);

    var btn = el("button", "skill-node is-" + st);
    btn.type = "button";
    btn.dataset.action = "select-skill";
    btn.dataset.nodeId = node.id;
    btn.style.setProperty("--node-color", branch.color);
    if (selectedSkillId === node.id) btn.classList.add("is-selected");
    btn.setAttribute("aria-label", node.name + "（" + (st === "unlocked" ? "已解锁" : st === "ready" ? "可解锁" : "未解锁") + "）");

    btn.appendChild(el("span", "node-name", node.name));
    btn.appendChild(el("span", "node-cost", st === "unlocked" ? "已解锁" : "✦ " + node.cost));
    btn.title = node.name + " · 消耗 " + node.cost + " 技能点";

    slot.appendChild(btn);
    return slot;
  }

  function renderSkills(state) {
    dom.pointsPill.textContent = state.progress.points;
    dom.skillTree.innerHTML = "";
    dom.skillTree.appendChild(dom.treeLinks);

    K.BRANCHES.forEach(function (branch) {
      var wrap = el("div", "branch");
      wrap.dataset.branch = branch.id;

      var head = el("div", "branch-head");
      head.appendChild(el("span", "branch-icon", branch.icon));
      var name = el("span", "branch-name", branch.name);
      name.style.color = branch.color;
      head.appendChild(name);
      var bp = K.branchProgress(state, branch.id);
      head.appendChild(el("span", "branch-count", bp.unlocked + "/" + bp.total));
      wrap.appendChild(head);

      var nodesWrap = el("div", "branch-nodes");
      branch.nodes.forEach(function (node) {
        nodesWrap.appendChild(buildSkillNode(state, branch, node));
      });
      wrap.appendChild(nodesWrap);

      dom.skillTree.appendChild(wrap);
    });

    renderSkillDetail(state, selectedSkillId);
    drawTreeLinks();
  }

  function drawTreeLinks() {
    var svg = dom.treeLinks;
    var tree = dom.skillTree;
    if (!svg || !tree) return;

    var w = tree.clientWidth;
    var h = tree.clientHeight;
    if (!w || !h) return;

    var treeRect = tree.getBoundingClientRect();
    var ns = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);

    var state = LQ.App && LQ.App.state;

    K.BRANCHES.forEach(function (branch) {
      branch.nodes.forEach(function (node) {
        node.req.forEach(function (reqId) {
          var fromEl = tree.querySelector('[data-node-id="' + reqId + '"]');
          var toEl = tree.querySelector('[data-node-id="' + node.id + '"]');
          if (!fromEl || !toEl) return;

          var fr = fromEl.getBoundingClientRect();
          var tr = toEl.getBoundingClientRect();
          var x1 = fr.left - treeRect.left + fr.width / 2;
          var y1 = fr.top - treeRect.top + fr.height;
          var x2 = tr.left - treeRect.left + tr.width / 2;
          var y2 = tr.top - treeRect.top;

          var midY = (y1 + y2) / 2;
          var d = "M" + x1.toFixed(1) + " " + y1.toFixed(1) +
                  " C" + x1.toFixed(1) + " " + midY.toFixed(1) +
                  " " + x2.toFixed(1) + " " + midY.toFixed(1) +
                  " " + x2.toFixed(1) + " " + y2.toFixed(1);

          var path = doc.createElementNS(ns, "path");
          path.setAttribute("d", d);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke-linecap", "round");

          var fromOk = state ? K.isUnlocked(state, reqId) : false;
          var toOk = state ? K.isUnlocked(state, node.id) : false;
          if (fromOk && toOk) {
            path.setAttribute("stroke", branch.color);
            path.setAttribute("stroke-width", "3");
            path.setAttribute("opacity", "0.95");
          } else if (fromOk) {
            path.setAttribute("stroke", branch.color);
            path.setAttribute("stroke-width", "2");
            path.setAttribute("opacity", "0.45");
            path.setAttribute("stroke-dasharray", "5 6");
          } else {
            path.setAttribute("stroke", "rgba(125,140,181,0.35)");
            path.setAttribute("stroke-width", "2");
            path.setAttribute("stroke-dasharray", "4 6");
          }
          svg.appendChild(path);
        });
      });
    });
  }

  function renderSkillDetail(state, nodeId) {
    var box = dom.skillDetail;
    box.innerHTML = "";

    var node = nodeId ? K.getNode(nodeId) : null;
    if (!node) {
      box.appendChild(el("p", "muted", "尚未选择节点。点击上方任意技能节点查看说明与解锁条件。"));
      return;
    }

    var st = K.status(state, nodeId);
    var branch = K.getBranch(node.branchId);
    var reason = K.lockReason(state, nodeId);

    var head = el("div", "skill-detail-head");
    var h4 = el("h4", null, branch.icon + " " + node.name);
    h4.style.color = branch.color;
    head.appendChild(h4);
    var tagText = st === "unlocked" ? "已解锁" : st === "ready" ? "可解锁" : "未解锁";
    head.appendChild(el("span", "status-tag status-tag--" + st, tagText));
    head.appendChild(el("span", "muted", "消耗 ✦ " + node.cost + " 技能点"));
    box.appendChild(head);

    box.appendChild(el("p", null, node.desc));

    var reqLine = el("p", "req-line");
    var reqText = node.req.length
      ? node.req.map(function (r) {
          var rn = K.getNode(r);
          return (K.isUnlocked(state, r) ? "✔ " : "✖ ") + (rn ? rn.name : r);
        }).join("　")
      : "无（根节点）";
    reqLine.appendChild(el("b", null, "前置技能："));
    reqLine.appendChild(doc.createTextNode(reqText));
    box.appendChild(reqLine);

    if (st === "unlocked") {
      box.appendChild(el("p", "reason reason--ok", "已解锁，技能点已扣除，不会重复消耗。"));
    } else if (st === "ready") {
      box.appendChild(el("p", "reason reason--ok", "满足所有解锁条件，可以解锁。"));
    } else {
      box.appendChild(el("p", "reason", "暂不可解锁：" + reason.text));
    }

    var actions = el("div", "detail-actions");
    if (st === "unlocked") {
      var done = el("button", "btn btn--ghost btn--sm", "✔ 已解锁");
      done.type = "button";
      done.disabled = true;
      actions.appendChild(done);
    } else {
      var btn = el("button", "btn btn--primary btn--sm", "解锁 · 消耗 " + node.cost + " 技能点");
      btn.type = "button";
      btn.dataset.action = "unlock-skill";
      btn.dataset.nodeId = nodeId;
      if (st !== "ready") btn.classList.add("btn--ghost");
      if (state.progress.points < node.cost) btn.setAttribute("aria-disabled", "true");
      actions.appendChild(btn);
    }
    var close = el("button", "btn btn--ghost btn--sm", "收起");
    close.type = "button";
    close.dataset.action = "clear-skill";
    actions.appendChild(close);
    box.appendChild(actions);
  }

  function selectSkill(id) {
    selectedSkillId = id;
    if (LQ.App && LQ.App.state) {
      renderSkills(LQ.App.state);
    }
  }

  /* ---------------- 成就墙 ---------------- */
  function renderAchievements(state) {
    dom.achGrid.innerHTML = "";
    var frag = doc.createDocumentFragment();

    A.LIST.forEach(function (ach) {
      var unlocked = A.isUnlocked(state, ach.id);
      var p = A.progressOf(state, ach);
      var item = el("div", "ach-item " + (unlocked ? "is-unlocked" : "is-locked"));

      item.appendChild(el("span", "ach-icon", unlocked ? ach.icon : "🔒"));

      var body = el("div", "ach-body");
      body.appendChild(el("span", "ach-name", ach.name));
      body.appendChild(el("span", "ach-desc", ach.desc));

      if (!unlocked) {
        var bar = el("div", "ach-progress");
        var fill = el("i");
        fill.style.width = Math.round((p.current / p.max) * 100) + "%";
        bar.appendChild(fill);
        body.appendChild(bar);
        body.appendChild(el("span", "ach-date", "进度 " + p.raw + " / " + p.max));
      } else {
        var date = state.achievements[ach.id];
        var d = new Date(date);
        var text = isNaN(d.getTime()) ? "已解锁" : "解锁于 " + S.dateKey(d);
        body.appendChild(el("span", "ach-date", "🏅 " + text));
      }
      item.appendChild(body);
      frag.appendChild(item);
    });

    dom.achGrid.appendChild(frag);
    var sm = A.summary(state);
    dom.achSummary.textContent = "已解锁 " + sm.unlocked + " / " + sm.total;
  }

  function shortDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return S.dateKey(d);
  }

  /* ---------------- 设置信息 ---------------- */
  function renderSettings(state) {
    dom.inputName.value = state.profile.name;

    var rm = state.settings.reduceMotion;
    var label = rm === true ? "始终减少动画" : rm === false ? "始终开启动画" : "跟随系统";
    dom.motionBtn.textContent = label;
    dom.motionBtn.setAttribute("aria-pressed", String(rm === true));
    dom.motionHint.textContent = rm === "auto"
      ? "当前跟随系统偏好设置"
      : (rm ? "已关闭星点闪烁与粒子动画" : "已强制开启动画");

    var json = S.exportJSON(state);
    var sizeKB = (json.length / 1024).toFixed(1);
    var claimCount = Object.keys(state.claims).length;
    var historyCount = Object.keys(state.history).length;

    var rows = [
      ["存档版本", "v" + state.version],
      ["存档大小", sizeKB + " KB"],
      ["角色创建", shortDate(state.profile.createdAt)],
      ["最后更新", shortDate(state.profile.updatedAt)],
      ["领取记录", claimCount + " 条"],
      ["历史天数", historyCount + " 天"],
      ["技能进度", K.totalProgress(state).unlocked + " / " + K.totalProgress(state).total],
      ["成就进度", A.summary(state).unlocked + " / " + A.summary(state).total]
    ];

    dom.saveMeta.innerHTML = "";
    rows.forEach(function (row) {
      var wrap = el("div");
      wrap.appendChild(el("dt", null, row[0]));
      wrap.appendChild(el("dd", null, row[1]));
      dom.saveMeta.appendChild(wrap);
    });
  }

  function renderAll(state) {
    renderHero(state);
    renderTasks(state);
    renderSkills(state);
    renderAchievements(state);
    renderSettings(state);
  }

  /* ---------------- Toast ---------------- */
  function toast(text, type, icon) {
    if (!dom.toastLayer) return;
    var node = el("div", "toast toast--" + (type || "info"));
    node.appendChild(el("span", "toast-icon", icon || "ℹ️"));
    var body = el("div", "toast-text");
    body.textContent = "";
    // 支持 **加粗** 片段
    var parts = String(text).split(/(\*\*[^*]+\*\*)/g);
    parts.forEach(function (part) {
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        body.appendChild(el("b", null, part.slice(2, -2)));
      } else if (part) {
        body.appendChild(doc.createTextNode(part));
      }
    });
    node.appendChild(body);
    dom.toastLayer.appendChild(node);

    var life = type === "error" ? 5200 : 3600;
    global.setTimeout(function () {
      node.classList.add("is-out");
      global.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 320);
    }, life);

    while (dom.toastLayer.children.length > 5) {
      dom.toastLayer.removeChild(dom.toastLayer.firstChild);
    }
  }

  /* ---------------- 弹窗 ---------------- */
  function closeModal() {
    if (!modalOpen) return;
    modalOpen = false;
    dom.modalBackdrop.hidden = true;
    dom.modalBody.innerHTML = "";
    dom.modalActions.innerHTML = "";
    if (lastFocused && lastFocused.focus) {
      try { lastFocused.focus(); } catch (e) { /* ignore */ }
    }
  }

  /**
   * openModal({ title, body: Node|string, actions: [{label, cls, onClick, closeAfter}] })
   */
  function openModal(opts) {
    opts = opts || {};
    lastFocused = doc.activeElement;
    dom.modalTitle.textContent = opts.title || "";
    dom.modalBody.innerHTML = "";
    dom.modalActions.innerHTML = "";

    if (opts.body instanceof global.Node) dom.modalBody.appendChild(opts.body);
    else if (typeof opts.body === "string") dom.modalBody.innerHTML = opts.body;

    (opts.actions || []).forEach(function (a) {
      var btn = el("button", "btn " + (a.cls || "btn--ghost"), a.label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        var res = a.onClick ? a.onClick() : undefined;
        if (a.closeAfter !== false && res !== false) closeModal();
      });
      dom.modalActions.appendChild(btn);
    });

    dom.modalBackdrop.hidden = false;
    modalOpen = true;

    var first = dom.modalBody.querySelector("input, select, textarea") || dom.modalActions.querySelector("button");
    if (first && first.focus) global.setTimeout(function () { try { first.focus(); } catch (e) {} }, 40);
  }

  /* ---------------- 粒子与飘字 ---------------- */
  function burst(x, y, colors, count) {
    if (reduceMotion() || !dom.fxLayer) return;
    var n = count || 14;
    var palette = colors && colors.length ? colors : ["#22d3ee", "#a78bfa", "#fbbf24"];
    for (var i = 0; i < n; i++) {
      (function (i) {
        var p = el("span", "fx-particle");
        var ang = (Math.PI * 2 * i) / n + Math.random() * 0.6;
        var dist = 42 + Math.random() * 76;
        p.style.left = x + "px";
        p.style.top = y + "px";
        p.style.setProperty("--dx", (Math.cos(ang) * dist).toFixed(1) + "px");
        p.style.setProperty("--dy", (Math.sin(ang) * dist).toFixed(1) + "px");
        p.style.setProperty("--p", palette[i % palette.length]);
        p.style.setProperty("--dur", (620 + Math.random() * 420).toFixed(0) + "ms");
        p.addEventListener("animationend", function () {
          if (p.parentNode) p.parentNode.removeChild(p);
        });
        dom.fxLayer.appendChild(p);
      })(i);
    }
  }

  function floatText(x, y, text, gold) {
    if (reduceMotion() || !dom.fxLayer) return;
    var node = el("span", "fx-pop" + (gold ? " fx-pop--gold" : ""), text);
    node.style.left = x + "px";
    node.style.top = y + "px";
    node.addEventListener("animationend", function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    dom.fxLayer.appendChild(node);
  }

  function levelUp(level, gained) {
    dom.levelupValue.textContent = level;
    dom.levelupNote.textContent = "获得 " + gained + " 个技能点 · 前往技能树分配";
    dom.levelupOverlay.hidden = false;
    dom.levelupOverlay.classList.remove("is-out");

    var dur = reduceMotion() ? 900 : 1900;
    global.setTimeout(function () {
      dom.levelupOverlay.classList.add("is-out");
      global.setTimeout(function () {
        dom.levelupOverlay.hidden = true;
        dom.levelupOverlay.classList.remove("is-out");
      }, reduceMotion() ? 10 : 480);
    }, dur);

    if (!reduceMotion()) {
      burst(global.innerWidth / 2, global.innerHeight / 2, ["#22d3ee", "#a78bfa", "#fbbf24", "#ffffff"], 26);
    }
  }

  /* ---------------- 星点背景 ---------------- */
  var starState = { raf: 0, stars: [], canvas: null, ctx: null, last: 0, running: false };

  function initStars() {
    var canvas = $("starCanvas");
    if (!canvas) return;
    var ctx = null;
    try {
      ctx = canvas.getContext ? canvas.getContext("2d") : null;
    } catch (e) {
      ctx = null; // 环境不支持 canvas（例如部分无头浏览器）时静默跳过
    }
    if (!ctx) return;
    starState.canvas = canvas;
    starState.ctx = ctx;

    resizeStars();
    global.addEventListener("resize", debounce(resizeStars, 180));
    doc.addEventListener("visibilitychange", function () {
      if (doc.hidden) stopStars();
      else if (!reduceMotion()) startStars();
    });
  }

  function resizeStars() {
    var canvas = starState.canvas;
    if (!canvas) return;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = global.innerWidth;
    var h = global.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    starState.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var count = Math.max(40, Math.min(160, Math.round((w * h) / 14000)));
    var stars = [];
    for (var i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.35,
        a: Math.random() * 0.45 + 0.25,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.4,
        hue: Math.random() < 0.22 ? "#a78bfa" : (Math.random() < 0.3 ? "#67e8f9" : "#ffffff")
      });
    }
    starState.stars = stars;
    drawStars(0);
  }

  function drawStars(t) {
    var ctx = starState.ctx;
    var canvas = starState.canvas;
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var anim = !reduceMotion();
    starState.stars.forEach(function (s) {
      var alpha = s.a;
      if (anim) alpha = s.a + Math.sin(t / 1000 * s.speed + s.phase) * 0.22;
      if (alpha < 0.05) alpha = 0.05;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.hue;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function starLoop(t) {
    if (!starState.running) return;
    if (t - starState.last > 55) {
      drawStars(t);
      starState.last = t;
    }
    starState.raf = global.requestAnimationFrame(starLoop);
  }

  function startStars() {
    if (starState.running || reduceMotion()) return;
    starState.running = true;
    starState.last = 0;
    starState.raf = global.requestAnimationFrame(starLoop);
  }

  function stopStars() {
    starState.running = false;
    if (starState.raf) global.cancelAnimationFrame(starState.raf);
    starState.raf = 0;
  }

  function refreshStars() {
    if (reduceMotion()) {
      stopStars();
      drawStars(0);
    } else {
      startStars();
    }
  }

  /* ---------------- 工具 ---------------- */
  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      if (timer) global.clearTimeout(timer);
      timer = global.setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  LQ.UI = {
    init: init,
    el: el,
    renderAll: renderAll,
    renderHero: renderHero,
    renderTasks: renderTasks,
    renderSkills: renderSkills,
    renderSkillDetail: renderSkillDetail,
    renderAchievements: renderAchievements,
    renderSettings: renderSettings,
    drawTreeLinks: drawTreeLinks,
    selectSkill: selectSkill,
    getSelectedSkill: function () { return selectedSkillId; },
    clearSelection: function () { selectedSkillId = null; },
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    isModalOpen: function () { return modalOpen; },
    burst: burst,
    floatText: floatText,
    levelUp: levelUp,
    initStars: initStars,
    refreshStars: refreshStars,
    debounce: debounce,
    titleForLevel: titleForLevel
  };
})(typeof window !== "undefined" ? window : globalThis);
