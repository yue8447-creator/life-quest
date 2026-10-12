/* =========================================================
   LIFE QUEST — js/app.js
   应用层：初始化、事件绑定、奖励结算、存档管理、跨天监测
   ========================================================= */
(function (global) {
  "use strict";

  var LQ = global.LQ = global.LQ || {};
  var S = LQ.Store;
  var T = LQ.Tasks;
  var K = LQ.Skills;
  var A = LQ.Achievements;
  var UI = LQ.UI;

  var doc = global.document;

  var App = LQ.App = { state: null, ready: false };

  var dateTimer = null;

  /* =========================================================
     致命错误处理：任何初始化 / 交互异常都要在页面上可见，
     绝不能出现"页面能看但按钮没反应"的黑箱状态
     ========================================================= */
  function reportFatal(err, title) {
    var msg = (err && (err.stack || err.message)) || String(err);
    window.__LQ_BOOT_ERROR__ = msg;
    try { console.error("[LIFE QUEST] " + (title || "fatal"), err); } catch (e) { /* ignore */ }
    if (typeof window.__LQ_showBanner === "function") {
      window.__LQ_showBanner(title || "页面初始化失败，交互功能不可用", [
        "页面脚本已加载，但运行过程中出现异常，因此按钮点击不会生效。",
        "可以尝试：清除浏览器缓存后重新加载页面；或在浏览器控制台查看详细堆栈。",
        "如果反复出现，请把下面的错误信息反馈给开发者。"
      ], false, msg.slice(0, 800));
    }
  }

  /* =========================================================
     提交：统一走 保存 -> 成就判定 -> 渲染 的流程
     ========================================================= */
  function commit(options) {
    options = options || {};
    var newAch = A.checkAll(App.state);
    var res = S.save(App.state);
    if (res && res.ok === false) UI.toast(res.error, "error", "⚠️");

    UI.renderAll(App.state);

    newAch.forEach(function (ach, i) {
      global.setTimeout(function () {
        UI.toast("成就解锁：**" + ach.name + "** · " + ach.desc, "gold", ach.icon);
      }, 320 + i * 640);
    });

    if (options.afterRender) options.afterRender(newAch);
    return newAch;
  }

  function notices(loaded) {
    loaded.notices.forEach(function (n, i) {
      global.setTimeout(function () {
        UI.toast(n.text, n.type, n.type === "error" ? "⚠️" : "ℹ️");
      }, 500 + i * 1100);
    });
  }

  /* =========================================================
     任务
     ========================================================= */
  function completeTask(id, anchor) {
    var rect = anchor ? anchor.getBoundingClientRect() : null;
    var res = T.completeTask(App.state, id);
    if (!res.ok) {
      UI.toast(res.error, "error", "🚫");
      UI.renderTasks(App.state);
      return;
    }

    var attr = T.attr(res.task.attr);
    if (rect) {
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      UI.burst(cx, cy, [attr.color, "#fbbf24", "#22d3ee", "#a78bfa"], 16);
      UI.floatText(cx, rect.top - 6, "+" + res.xp + " XP", false);
      UI.floatText(cx, rect.top + 12, "+" + res.coins + " 🪙", true);
    }

    var achBefore = [];
    commit({
      afterRender: function (newAch) { achBefore = newAch; }
    });

    UI.toast("任务完成：**" + res.task.title + "**  +" + res.xp + " XP · +" + res.coins + " 金币", "success", "✅");

    if (res.levels > 0) {
      var delay = achBefore.length ? 200 : 120;
      global.setTimeout(function () {
        UI.levelUp(App.state.progress.level, res.levels);
      }, delay);
      global.setTimeout(function () {
        UI.toast("等级提升！当前 **LV " + App.state.progress.level + "**，新增 " + res.levels + " 个技能点", "gold", "⭐");
      }, delay + 400);
    }

    if (res.streak > 1) {
      global.setTimeout(function () {
        UI.toast("连续打卡 **" + res.streak + " 天**，继续保持！", "info", "🔥");
      }, 1200);
    }
  }

  function deleteTask(id) {
    var task = T.findTask(App.state, id);
    if (!task) return;
    var body = UI.el("div");
    body.appendChild(UI.el("p", null, "确定要删除任务「" + task.title + "」吗？"));
    body.appendChild(UI.el("p", "hint", task.done
      ? "该任务今天的奖励已经领取，删除任务不会收回已获得的奖励。"
      : "删除后需要重新添加才能继续使用该任务。"));

    UI.openModal({
      title: "删除任务",
      body: body,
      actions: [
        { label: "取消", cls: "btn--ghost" },
        {
          label: "删除", cls: "btn--danger", closeAfter: true,
          onClick: function () {
            var r = T.deleteTask(App.state, id);
            if (!r.ok) { UI.toast(r.error, "error", "🚫"); return; }
            commit();
            UI.toast("已删除任务「" + task.title + "」", "info", "🗑️");
          }
        }
      ]
    });
  }

  /* =========================================================
     添加任务表单
     ========================================================= */
  function openAddTask() {
    var body = UI.el("div");

    var fTitle = UI.el("div", "field");
    fTitle.appendChild(UI.el("label", null, "任务名称（最多 40 字）"));
    var inputTitle = UI.el("input");
    inputTitle.type = "text";
    inputTitle.maxLength = 40;
    inputTitle.placeholder = "例如：背 20 个单词 / 拉伸 10 分钟";
    fTitle.appendChild(inputTitle);
    body.appendChild(fTitle);

    var fAttr = UI.el("div", "field");
    fAttr.appendChild(UI.el("label", null, "所属属性"));
    var selAttr = UI.el("select");
    S.ATTR_IDS.forEach(function (id) {
      var a = T.attr(id);
      var opt = UI.el("option", null, a.icon + " " + a.name);
      opt.value = id;
      selAttr.appendChild(opt);
    });
    fAttr.appendChild(selAttr);
    body.appendChild(fAttr);

    var grid1 = UI.el("div", "grid-2");
    var fDur = UI.el("div", "field");
    fDur.appendChild(UI.el("label", null, "预计时长（分钟）"));
    var inputDur = UI.el("input");
    inputDur.type = "number";
    inputDur.min = String(S.DURATION_MIN);
    inputDur.max = String(S.DURATION_MAX);
    inputDur.value = "20";
    fDur.appendChild(inputDur);
    grid1.appendChild(fDur);

    var fXp = UI.el("div", "field");
    fXp.appendChild(UI.el("label", null, "经验奖励 XP（" + S.XP_MIN + "~" + S.XP_MAX + "）"));
    var inputXp = UI.el("input");
    inputXp.type = "number";
    inputXp.min = String(S.XP_MIN);
    inputXp.max = String(S.XP_MAX);
    inputXp.value = "20";
    fXp.appendChild(inputXp);
    grid1.appendChild(fXp);
    body.appendChild(grid1);

    var fCoins = UI.el("div", "field");
    fCoins.appendChild(UI.el("label", null, "金币奖励（" + S.COIN_MIN + "~" + S.COIN_MAX + "）"));
    var inputCoins = UI.el("input");
    inputCoins.type = "number";
    inputCoins.min = String(S.COIN_MIN);
    inputCoins.max = String(S.COIN_MAX);
    inputCoins.value = "5";
    fCoins.appendChild(inputCoins);
    body.appendChild(fCoins);

    body.appendChild(UI.el("p", "hint", "超出范围的数值会自动收敛到 " + S.XP_MIN + "~" + S.XP_MAX + " XP 与 " + S.COIN_MIN + "~" + S.COIN_MAX + " 金币之间。"));

    UI.openModal({
      title: "添加任务",
      body: body,
      actions: [
        { label: "取消", cls: "btn--ghost" },
        {
          label: "添加", cls: "btn--primary",
          onClick: function () {
            var r = T.addTask(App.state, {
              title: inputTitle.value,
              attr: selAttr.value,
              duration: inputDur.value,
              xp: inputXp.value,
              coins: inputCoins.value
            });
            if (!r.ok) {
              UI.toast(r.error, "error", "🚫");
              return false;
            }
            commit();
            var note = "";
            if (r.clamped.xp || r.clamped.coins || r.clamped.duration) {
              note = "（数值已收敛到合法范围）";
            }
            UI.toast("已添加任务：**" + r.task.title + "**" + note, "success", "➕");
          }
        }
      ]
    });
  }

  /* =========================================================
     技能
     ========================================================= */
  function unlockSkill(id, anchor) {
    var res = K.unlock(App.state, id);
    if (!res.ok) {
      UI.toast(res.error, "error", "🔒");
      return;
    }
    var node = res.node;
    if (anchor && anchor.getBoundingClientRect) {
      var rect = anchor.getBoundingClientRect();
      UI.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, [node.color, "#fbbf24", "#ffffff"], 18);
    }
    commit();
    UI.toast("已解锁技能：**" + node.name + "**，消耗 " + res.cost + " 技能点", "success", "✨");
  }

  /* =========================================================
     昵称
     ========================================================= */
  function openNameEditor() {
    var body = UI.el("div");
    body.appendChild(UI.el("label", null, "角色昵称（最多 " + S.NAME_MAX + " 字）"));
    var input = UI.el("input");
    input.type = "text";
    input.maxLength = S.NAME_MAX;
    input.value = App.state.profile.name;
    input.placeholder = "冒险者";
    body.appendChild(input);

    UI.openModal({
      title: "修改昵称",
      body: body,
      actions: [
        { label: "取消", cls: "btn--ghost" },
        {
          label: "保存", cls: "btn--primary",
          onClick: function () {
            var name = String(input.value || "").replace(/\s+/g, " ").trim().slice(0, S.NAME_MAX);
            if (!name) { UI.toast("昵称不能为空", "error", "🚫"); return false; }
            App.state.profile.name = name;
            commit();
            UI.toast("昵称已更新为 **" + name + "**", "success", "✏️");
          }
        }
      ]
    });
  }

  /* =========================================================
     存档：导出 / 导入 / 重置
     ========================================================= */
  function exportSave() {
    try {
      var json = S.exportJSON(App.state);
      var blob = new global.Blob([json], { type: "application/json" });
      var url = global.URL.createObjectURL(blob);
      var a = doc.createElement("a");
      a.href = url;
      a.download = "life-quest-save-" + S.todayKey() + ".json";
      doc.body.appendChild(a);
      a.click();
      doc.body.removeChild(a);
      global.setTimeout(function () { global.URL.revokeObjectURL(url); }, 5000);
      UI.toast("存档已导出（" + (json.length / 1024).toFixed(1) + " KB）", "success", "⬇️");
    } catch (e) {
      UI.toast("导出失败：" + (e && e.message ? e.message : e), "error", "⚠️");
    }
  }

  function importSave(file) {
    var reader = new global.FileReader();
    reader.onload = function () {
      var parsed = S.importFromText(String(reader.result || ""));
      if (!parsed.ok) {
        var errBody = UI.el("div");
        var pre = UI.el("p", "danger-text", parsed.error);
        pre.style.whiteSpace = "pre-wrap";
        errBody.appendChild(pre);
        errBody.appendChild(UI.el("p", "hint", "你当前的存档没有被修改。"));
        UI.openModal({
          title: "导入失败",
          body: errBody,
          actions: [{ label: "知道了", cls: "btn--primary" }]
        });
        return;
      }

      var st = parsed.state;
      var body = UI.el("div");
      body.appendChild(UI.el("p", null, "即将用导入的存档覆盖当前进度，此操作不可撤销。"));
      var ul = UI.el("ul", "plain");
      [
        "角色：" + st.profile.name + "（LV " + st.progress.level + "）",
        "金币：" + st.progress.coins + " · 技能点：" + st.progress.points,
        "累计任务：" + st.progress.totalTasks + " · 连续打卡：" + st.streak.count + " 天",
        "任务数：" + st.daily.tasks.length + " · 已解锁技能：" + st.skills.length,
        "成就：" + Object.keys(st.achievements).length + " 个"
      ].forEach(function (line) { ul.appendChild(UI.el("li", null, line)); });
      body.appendChild(ul);
      body.appendChild(UI.el("p", "hint", "建议先导出当前存档作为备份。"));

      var actions = [
        { label: "取消", cls: "btn--ghost" }
      ];
      actions.push({
        label: "先备份当前存档", cls: "btn--gold", closeAfter: false,
        onClick: function () { exportSave(); return false; }
      });
      actions.push({
        label: "确认覆盖", cls: "btn--danger",
        onClick: function () {
          App.state = st;
          var c = T.ensureDay(App.state);
          commit();
          global.setTimeout(function () { UI.drawTreeLinks(); }, 60);
          UI.toast("存档导入成功" + (c.archivedDate ? "（已按今天重新计算每日任务）" : ""), "success", "⬆️");
        }
      });

      UI.openModal({ title: "确认导入存档", body: body, actions: actions });
    };
    reader.onerror = function () { UI.toast("文件读取失败", "error", "⚠️"); };
    reader.readAsText(file);
  }

  function resetGame() {
    var body = UI.el("div");
    var warn = UI.el("p", "danger-text");
    warn.textContent = "重置会永久删除当前角色进度（等级、金币、技能、成就、历史记录），且无法撤销。";
    body.appendChild(warn);

    var ul = UI.el("ul", "plain");
    [
      "等级 LV " + App.state.progress.level + " · " + App.state.progress.xp + " XP",
      App.state.progress.coins + " 金币 · " + App.state.progress.points + " 技能点",
      App.state.progress.totalTasks + " 个已完成任务 · 连续打卡 " + App.state.streak.count + " 天",
      App.state.skills.length + " 个已解锁技能 · " + Object.keys(App.state.achievements).length + " 个成就"
    ].forEach(function (line) { ul.appendChild(UI.el("li", null, line)); });
    body.appendChild(ul);

    var f = UI.el("div", "field");
    f.appendChild(UI.el("label", null, "请输入 RESET 以确认重置"));
    var input = UI.el("input");
    input.type = "text";
    input.placeholder = "RESET";
    input.autocomplete = "off";
    f.appendChild(input);
    body.appendChild(f);

    var actions = [
      { label: "取消", cls: "btn--ghost" },
      {
        label: "导出备份", cls: "btn--gold", closeAfter: false,
        onClick: function () { exportSave(); return false; }
      },
      {
        label: "永久重置", cls: "btn--danger", closeAfter: false,
        onClick: function () {
          if (String(input.value).trim().toUpperCase() !== "RESET") {
            UI.toast("请准确输入 RESET 后再确认重置", "error", "🔒");
            input.focus();
            return false;
          }
          App.state = S.createDefaultState();
          T.ensureDay(App.state);
          UI.clearSelection();
          S.save(App.state);
          UI.renderAll(App.state);
          UI.closeModal();
          UI.toast("游戏已重置，新的冒险开始了！", "info", "🌱");
          global.setTimeout(function () { UI.drawTreeLinks(); }, 60);
        }
      }
    ];

    UI.openModal({ title: "重置游戏", body: body, actions: actions });
  }

  /* =========================================================
     设置
     ========================================================= */
  function cycleMotion() {
    var order = ["auto", true, false];
    var cur = App.state.settings.reduceMotion;
    var idx = order.indexOf(cur === "auto" ? "auto" : cur === true ? true : false);
    var next = order[(idx + 1) % order.length];
    App.state.settings.reduceMotion = next;
    applyMotion();
    commit();
    UI.toast("动态效果：" + (next === "auto" ? "跟随系统" : next ? "已关闭动画" : "已开启动画"), "info", "🎞️");
  }

  function applyMotion() {
    var rm = App.state.settings.reduceMotion;
    var sysPrefersReduce = false;
    try {
      sysPrefersReduce = !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) { sysPrefersReduce = false; }

    var effective = rm === true || (rm === "auto" && sysPrefersReduce);
    doc.body.classList.toggle("reduce-motion", effective);
    UI.refreshStars();
  }

  function restoreDefaultTasks() {
    var r = T.restoreDefaultTasks(App.state);
    if (r.added > 0) {
      commit();
      UI.toast("已恢复 " + r.added + " 个默认任务", "success", "♻️");
    } else {
      UI.toast("默认任务已经全部存在", "info", "ℹ️");
    }
  }

  /* =========================================================
     标签切换
     ========================================================= */
  function switchTab(tab) {
    var tabs = doc.querySelectorAll(".tab");
    var panels = doc.querySelectorAll(".panel");
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].dataset.tab === tab;
      tabs[i].classList.toggle("is-active", on);
      tabs[i].setAttribute("aria-selected", on ? "true" : "false");
    }
    for (var j = 0; j < panels.length; j++) {
      var isTarget = panels[j].id === "panel-" + tab;
      panels[j].classList.toggle("is-active", isTarget);
      panels[j].hidden = !isTarget;
    }
    if (tab === "skills") {
      global.requestAnimationFrame(function () { UI.drawTreeLinks(); });
    }
  }

  /* =========================================================
     事件绑定
     ========================================================= */
  /* =========================================================
     交互事件：click 为主，touchend 兜底
     1) 用 getAttribute 逐层向上查找，不依赖 Element.closest（老 WebView 可能没有）
     2) 触摸设备上若浏览器没有合成 click，由 touchend 接管
     3) 同一元素 600ms 内只处理一次，保证奖励不会被重复发放
     ========================================================= */
  function findActionTarget(node) {
    var el = node;
    var depth = 0;
    while (el && el.nodeType === 1 && depth < 15) {
      if (el.getAttribute && el.getAttribute("data-action")) return el;
      el = el.parentNode;
      depth += 1;
    }
    return null;
  }

  function activate(trigger) {
    var action = trigger.getAttribute("data-action");
    var id = trigger.getAttribute("data-id");
    switch (action) {
      case "tab":
        switchTab(trigger.getAttribute("data-tab"));
        break;
      case "add-task":
        openAddTask();
        break;
      case "complete":
        completeTask(id, trigger);
        break;
      case "delete":
        deleteTask(id);
        break;
      case "select-skill":
        UI.selectSkill(trigger.getAttribute("data-node-id"));
        break;
      case "unlock-skill":
        unlockSkill(trigger.getAttribute("data-node-id"), trigger);
        break;
      case "clear-skill":
        UI.clearSelection();
        break;
      case "edit-name":
        openNameEditor();
        break;
      case "export":
        exportSave();
        break;
      case "import":
        var fileInputEl = doc.getElementById("importFile");
        if (fileInputEl) fileInputEl.click();
        break;
      case "restore-tasks":
        restoreDefaultTasks();
        break;
      case "reset":
        resetGame();
        break;
      case "toggle-motion":
        cycleMotion();
        break;
      default:
        break;
    }
  }

  /** 执行一个可交互元素对应的操作 */
  function runAction(trigger) {
    try {
      activate(trigger);
    } catch (err) {
      reportFatal(err, "操作执行失败");
    }
  }

  function bindInteractionEvents() {
    /* 主路径是 click 事件（鼠标与触摸设备通用）。
       兜底路径：若某次触摸在 350ms 内没有产生 click（少数老旧 WebView
       不会合成 click），才由 touchend 直接执行，保证触屏一定可用。
       两条路径互斥，因此不会重复执行，也不需要靠时间窗去拦截用户的连续点击。 */
    var pendingTouch = null;

    doc.addEventListener("click", function (e) {
      pendingTouch = null; // 浏览器已经合成 click，取消触摸兜底
      var trigger = findActionTarget(e.target);
      if (trigger) runAction(trigger);
    }, false);

    /* 记录触摸起点，用于区分"点击"与"滑动页面" */
    var touchStart = null;
    doc.addEventListener("touchstart", function (e) {
      touchStart = (e.touches && e.touches.length === 1)
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : null;
    }, { passive: true });

    doc.addEventListener("touchend", function (e) {
      var start = touchStart;
      touchStart = null;
      if (!start || !e.changedTouches || !e.changedTouches.length) return;
      var t = e.changedTouches[0];
      if (Math.abs(t.clientX - start.x) > 12 || Math.abs(t.clientY - start.y) > 12) return; // 滑动，视为滚动
      var trigger = findActionTarget(e.target);
      if (!trigger) return;
      var token = {};
      pendingTouch = { token: token };
      global.setTimeout(function () {
        if (!pendingTouch || pendingTouch.token !== token) return; // click 已处理，兜底作废
        pendingTouch = null;
        runAction(trigger);
      }, 350);
    }, { passive: true });
  }

  function bindEvents() {
    bindInteractionEvents();

    /* 设置面板内的昵称保存 */
    var inputName = doc.getElementById("inputName");
    var btnSaveName = doc.getElementById("btnSaveName");
    function saveNameFromSettings() {
      var name = String(inputName.value || "").replace(/\s+/g, " ").trim().slice(0, S.NAME_MAX);
      if (!name) { UI.toast("昵称不能为空", "error", "🚫"); return; }
      App.state.profile.name = name;
      commit();
      UI.toast("昵称已更新为 **" + name + "**", "success", "✏️");
    }
    if (btnSaveName) btnSaveName.addEventListener("click", saveNameFromSettings);
    if (inputName) {
      inputName.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); saveNameFromSettings(); }
      });
    }

    /* 设置面板：顶部按钮通过 data-action 绑定 */
    var btnSettings = doc.getElementById("btnSettings");
    if (btnSettings) {
      btnSettings.addEventListener("click", function () { switchTab("settings"); });
    }
    var chip = doc.getElementById("nameChip");
    if (chip) chip.addEventListener("click", openNameEditor);

    /* 设置面板中带 id 的按钮 */
    var map = {
      btnExport: exportSave,
      btnImport: function () { doc.getElementById("importFile").click(); },
      btnRestoreTasks: restoreDefaultTasks,
      btnReset: resetGame,
      btnToggleMotion: cycleMotion
    };
    Object.keys(map).forEach(function (id) {
      var node = doc.getElementById(id);
      if (node) node.addEventListener("click", map[id]);
    });

    var fileInput = doc.getElementById("importFile");
    if (fileInput) {
      fileInput.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) importSave(file);
        fileInput.value = "";
      });
    }

    /* 弹窗关闭 */
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && UI.isModalOpen()) UI.closeModal();
    });
    var backdrop = doc.getElementById("modalBackdrop");
    if (backdrop) {
      backdrop.addEventListener("click", function (e) {
        if (e.target === backdrop) UI.closeModal();
      });
    }

    /* 窗口尺寸变化时重绘技能树连线 */
    global.addEventListener("resize", UI.debounce(function () {
      UI.drawTreeLinks();
    }, 160));

    /* 系统减少动效偏好变化 */
    try {
      var mq = global.matchMedia("(prefers-reduced-motion: reduce)");
      if (mq && mq.addEventListener) {
        mq.addEventListener("change", function () { applyMotion(); });
      }
    } catch (e) { /* ignore */ }

    /* 跨天监测 */
    doc.addEventListener("visibilitychange", function () {
      if (!doc.hidden) checkDateRollover();
    });
    global.addEventListener("focus", checkDateRollover);
    dateTimer = global.setInterval(checkDateRollover, 30000);
  }

  function checkDateRollover() {
    if (!App.ready) return;
    var c = T.ensureDay(App.state);
    if (!c.changed) return;
    var newAch = A.checkAll(App.state);
    S.save(App.state);
    UI.renderAll(App.state);
    global.requestAnimationFrame(function () { UI.drawTreeLinks(); });

    if (c.archivedDate) {
      UI.toast("新的一天开始了（" + S.formatDateCN(App.state.daily.date) + "），每日任务已重置", "info", "🌅");
    }
    if (c.clockWarn) {
      UI.toast("检测到系统日期早于上次记录，为避免重复发奖，领取将被限制", "error", "⚠️");
    }
    newAch.forEach(function (ach) {
      UI.toast("成就解锁：**" + ach.name + "** · " + ach.desc, "gold", ach.icon);
    });
  }

  /* =========================================================
     启动
     ========================================================= */
  function boot() {
    if (App.ready) return; // 防止重复初始化
    try {
      bootInner();
    } catch (err) {
      reportFatal(err, "页面初始化失败，交互功能不可用");
    }
  }

  function bootInner() {
    if (!S || !T || !K || !A || !UI || typeof UI.init !== "function") {
      throw new Error("核心模块未加载完成：请确认 js 目录下的 store.js / tasks.js / skills.js / achievements.js / ui.js / app.js 都已正确部署。");
    }
    var loaded = S.load();
    App.state = loaded.state;

    var rollover = T.ensureDay(App.state);
    var newAch = A.checkAll(App.state);
    S.save(App.state);

    UI.init();
    UI.initStars();
    applyMotion();
    UI.renderAll(App.state);

    bindEvents();

    global.requestAnimationFrame(function () {
      UI.drawTreeLinks();
    });

    notices(loaded);

    if (rollover.archivedDate) {
      global.setTimeout(function () {
        UI.toast("上次记录是 " + S.formatDateCN(rollover.archivedDate) + "，每日任务已按今天重置", "info", "🌅");
      }, 1400);
    }

    if (newAch.length) {
      global.setTimeout(function () {
        UI.toast("检测到 " + newAch.length + " 个成就已达成，已自动解锁", "gold", "🏆");
      }, 2000);
    }

    App.ready = true;
  }

  App.boot = boot;

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
