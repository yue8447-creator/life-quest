/* =========================================================
   LIFE QUEST — js/tasks.js
   每日任务：跨天结算、奖励发放、去重校验、连续打卡
   ========================================================= */
(function (global) {
  "use strict";

  var LQ = global.LQ = global.LQ || {};
  var S = LQ.Store;

  /* 四大属性 */
  var ATTRS = {
    study:   { id: "study",   name: "学习",   icon: "📚", color: "#22d3ee", desc: "读书、听课、练习，把知识变成能力" },
    health:  { id: "health",  name: "健康",   icon: "💪", color: "#34d399", desc: "运动、作息、饮食，把身体练成装备" },
    create:  { id: "create",  name: "创造力", icon: "🎨", color: "#a78bfa", desc: "表达、设计、动手，把想法做成作品" },
    explore: { id: "explore", name: "探索",   icon: "🧭", color: "#f472b6", desc: "尝试新事物、解决问题，把边界推得更远" }
  };

  /* ---------------- 跨天结算 ---------------- */

  function trimHistory(state) {
    var keys = Object.keys(state.history).sort();
    while (keys.length > S.HISTORY_LIMIT) {
      var k = keys.shift();
      delete state.history[k];
    }
  }

  function trimClaims(state) {
    var keys = Object.keys(state.claims);
    if (keys.length <= S.CLAIM_LIMIT) return;
    keys.sort();
    var drop = keys.length - S.CLAIM_LIMIT;
    for (var i = 0; i < drop; i++) delete state.claims[keys[i]];
  }

  function archiveDay(state, dateKey) {
    if (!S.isValidDateKey(dateKey)) return null;
    var completed = 0;
    state.daily.tasks.forEach(function (t) { if (t.done) completed += 1; });
    state.history[dateKey] = {
      completed: completed,
      xp: state.daily.xpGained || 0,
      coins: state.daily.coinsGained || 0
    };
    trimHistory(state);
    return state.history[dateKey];
  }

  /**
   * 保证 state.daily 指向"今天"。
   * 返回 { changed, archivedDate, clockWarn }
   */
  function ensureDay(state) {
    var today = S.todayKey();
    var out = { changed: false, archivedDate: null, clockWarn: false };
    var daily = state.daily;

    if (!S.isValidDateKey(daily.date)) {
      daily.date = today;
      out.changed = true;
    }

    if (daily.date === today) {
      if (!state.profile.maxSeenDate || S.dayDiff(today, state.profile.maxSeenDate) > 0) {
        state.profile.maxSeenDate = today;
      }
      return out;
    }

    var diff = S.dayDiff(today, daily.date); // today - 记录日期
    if (isFinite(diff) && diff > 0) {
      // 正常跨天（今天晚于记录日期）：归档旧日期
      out.archivedDate = daily.date;
      archiveDay(state, daily.date);
      state.profile.clockWarn = false;
    } else if (isFinite(diff) && diff < 0) {
      // 系统日期被回拨到过去
      out.clockWarn = true;
      state.profile.clockWarn = true;
    }

    daily.tasks.forEach(function (t) {
      t.done = false;
      t.doneDate = null;
    });
    daily.date = today;
    daily.xpGained = 0;
    daily.coinsGained = 0;

    if (!state.profile.maxSeenDate || S.dayDiff(today, state.profile.maxSeenDate) > 0) {
      state.profile.maxSeenDate = today;
    }
    out.changed = true;
    return out;
  }

  /* ---------------- 连续打卡 ---------------- */

  function touchStreak(state, today) {
    var st = state.streak;
    if (!st.lastDate) {
      st.count = 1;
      st.lastDate = today;
    } else {
      var diff = S.dayDiff(today, st.lastDate);
      if (diff === 0) {
        // 同一天完成多个任务，连续天数不重复累加
      } else if (diff === 1) {
        st.count += 1;
        st.lastDate = today;
      } else if (diff > 1) {
        st.count = 1;
        st.lastDate = today;
      }
      // diff < 0：日期回拨，保持原状
    }
    if (st.count > st.best) st.best = st.count;
    return st.count;
  }

  /** 当前展示用的连续天数（今天未打卡但昨天打过，仍保留连击） */
  function currentStreak(state) {
    var st = state.streak;
    if (!st.lastDate) return 0;
    var diff = S.dayDiff(S.todayKey(), st.lastDate);
    if (!isFinite(diff)) return 0;
    if (diff <= 1) return st.count;
    return 0;
  }

  function isCheckedInToday(state) {
    return state.streak.lastDate === S.todayKey();
  }

  /* ---------------- 任务操作 ---------------- */

  function findTask(state, id) {
    var list = state.daily.tasks;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function addTask(state, payload) {
    ensureDay(state);
    payload = payload || {};
    var title = typeof payload.title === "string" ? payload.title.replace(/\s+/g, " ").trim() : "";
    if (!title) return { ok: false, error: "请填写任务名称" };
    if (title.length > 40) title = title.slice(0, 40);
    if (state.daily.tasks.length >= 60) return { ok: false, error: "任务数量已达上限（60 条）" };

    var attr = S.ATTR_IDS.indexOf(payload.attr) >= 0 ? payload.attr : "study";

    /** 空值/非数字回退默认值；其余（含负数）一律收敛到合法区间 */
    function numOr(v, def) {
      if (v === "" || v === null || v === undefined) return def;
      var n = Number(v);
      return isFinite(n) ? n : def;
    }

    var rXp = numOr(payload.xp, 20);
    var rCoins = numOr(payload.coins, 5);
    var rDur = numOr(payload.duration, 20);

    var xp = S.clamp(rXp, S.XP_MIN, S.XP_MAX);
    var coins = S.clamp(rCoins, S.COIN_MIN, S.COIN_MAX);
    var duration = S.clamp(rDur, S.DURATION_MIN, S.DURATION_MAX);

    var clamped = {
      xp: Math.round(rXp) !== xp,
      coins: Math.round(rCoins) !== coins,
      duration: Math.round(rDur) !== duration
    };

    var unit = typeof payload.unit === "string" && payload.unit.trim() ? payload.unit.trim().slice(0, 4) : "分钟";

    var task = {
      id: S.uid("task"),
      title: title,
      attr: attr,
      duration: duration,
      unit: unit,
      xp: xp,
      coins: coins,
      builtin: false,
      done: false,
      doneDate: null,
      createdAt: S.nowISO()
    };
    state.daily.tasks.push(task);
    return { ok: true, task: task, clamped: clamped };
  }

  /**
   * 完成任务并领取奖励。所有奖励发放的唯一入口。
   */
  function completeTask(state, id) {
    ensureDay(state);
    var today = S.todayKey();
    var task = findTask(state, id);
    if (!task) return { ok: false, error: "任务不存在或已被删除" };
    if (state.daily.date !== today) return { ok: false, error: "日期状态异常，请刷新页面后重试" };
    if (task.done) return { ok: false, error: "这个任务今天已经领取过奖励了" };

    var claimKey = id + "@" + today;
    if (state.claims[claimKey] === true) {
      return { ok: false, error: "已存在今日领取记录，无法重复领取" };
    }

    if (S.isValidDateKey(state.profile.maxSeenDate) && S.dayDiff(today, state.profile.maxSeenDate) < 0) {
      state.profile.clockWarn = true;
      return { ok: false, error: "检测到系统日期被回拨，为避免重复发放奖励，本次领取已被拒绝" };
    }

    var xp = S.clamp(task.xp, S.XP_MIN, S.XP_MAX);
    var coins = S.clamp(task.coins, S.COIN_MIN, S.COIN_MAX);

    task.done = true;
    task.doneDate = today;
    state.claims[claimKey] = true;
    trimClaims(state);

    state.progress.coins = Math.max(0, state.progress.coins + coins);
    state.progress.totalCoinsEarned += coins;
    state.progress.totalTasks += 1;
    state.daily.xpGained = (state.daily.xpGained || 0) + xp;
    state.daily.coinsGained = (state.daily.coinsGained || 0) + coins;

    var levels = S.grantXp(state, xp);
    var streak = touchStreak(state, today);

    if (!S.isValidDateKey(state.profile.maxSeenDate) || S.dayDiff(today, state.profile.maxSeenDate) > 0) {
      state.profile.maxSeenDate = today;
    }
    state.profile.clockWarn = false;

    return { ok: true, task: task, xp: xp, coins: coins, levels: levels, streak: streak };
  }

  function deleteTask(state, id) {
    ensureDay(state);
    var list = state.daily.tasks;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        var removed = list.splice(i, 1)[0];
        return { ok: true, task: removed };
      }
    }
    return { ok: false, error: "任务不存在" };
  }

  /** 恢复缺失的默认任务（不覆盖用户自建任务） */
  function restoreDefaultTasks(state) {
    ensureDay(state);
    var existing = state.daily.tasks.map(function (t) { return t.title; });
    var added = 0;
    S.defaultTasks().forEach(function (d) {
      if (existing.indexOf(d.title) >= 0) return;
      if (state.daily.tasks.length >= 60) return;
      state.daily.tasks.push(S.makeTask(d));
      added += 1;
    });
    return { ok: true, added: added };
  }

  function dayProgress(state) {
    var list = state.daily.tasks;
    var done = 0;
    list.forEach(function (t) { if (t.done) done += 1; });
    var total = list.length;
    return {
      done: done,
      total: total,
      percent: total ? Math.round((done / total) * 100) : 0
    };
  }

  /** 最近 n 天的历史概览（含今天） */
  function recentDays(state, n) {
    var out = [];
    var today = S.todayKey();
    for (var i = n - 1; i >= 0; i--) {
      var key = S.dateKey(new Date(Date.now() - i * 86400000));
      var rec = state.history[key];
      var isToday = key === today;
      out.push({
        date: key,
        completed: isToday ? dayProgress(state).done : (rec ? rec.completed : 0),
        xp: isToday ? (state.daily.xpGained || 0) : (rec ? rec.xp : 0),
        isToday: isToday
      });
    }
    return out;
  }

  LQ.Tasks = {
    ATTRS: ATTRS,
    attr: function (id) { return ATTRS[id] || ATTRS.study; },

    ensureDay: ensureDay,
    archiveDay: archiveDay,
    currentStreak: currentStreak,
    isCheckedInToday: isCheckedInToday,
    touchStreak: touchStreak,

    findTask: findTask,
    addTask: addTask,
    completeTask: completeTask,
    deleteTask: deleteTask,
    restoreDefaultTasks: restoreDefaultTasks,

    dayProgress: dayProgress,
    recentDays: recentDays
  };
})(typeof window !== "undefined" ? window : globalThis);
