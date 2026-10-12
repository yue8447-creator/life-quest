/* =========================================================
   LIFE QUEST — js/achievements.js
   成就系统：基于真实游戏数据自动判定
   ========================================================= */
(function (global) {
  "use strict";

  var LQ = global.LQ = global.LQ || {};
  var S = LQ.Store;

  function streakBest(state) {
    var st = state.streak || { count: 0, best: 0 };
    var c = Number(st.count) || 0;
    var b = Number(st.best) || 0;
    return Math.max(c, b);
  }

  var LIST = [
    {
      id: "first-step", name: "初次启程", icon: "🌱",
      desc: "完成第一个任务", target: 1,
      value: function (s) { return s.progress.totalTasks; }
    },
    {
      id: "ten-tasks", name: "小有成就", icon: "🎯",
      desc: "累计完成 10 个任务", target: 10,
      value: function (s) { return s.progress.totalTasks; }
    },
    {
      id: "task-30", name: "勤勉不辍", icon: "📅",
      desc: "累计完成 30 个任务", target: 30,
      value: function (s) { return s.progress.totalTasks; }
    },
    {
      id: "streak-3", name: "坚持三日", icon: "🔥",
      desc: "连续三天完成至少一个任务", target: 3,
      value: streakBest
    },
    {
      id: "streak-7", name: "七日之约", icon: "🗓️",
      desc: "连续七天完成至少一个任务", target: 7,
      value: streakBest
    },
    {
      id: "level-up", name: "等级提升", icon: "⭐",
      desc: "首次升到 2 级", target: 2,
      value: function (s) { return s.progress.level; }
    },
    {
      id: "skill-1", name: "技能解锁", icon: "✨",
      desc: "解锁第一个技能节点", target: 1,
      value: function (s) { return s.skills.length; }
    },
    {
      id: "skill-8", name: "技能大师", icon: "🧠",
      desc: "解锁 8 个技能节点", target: 8,
      value: function (s) { return s.skills.length; }
    },
    {
      id: "coin-200", name: "财源滚滚", icon: "🪙",
      desc: "累计获得 200 金币", target: 200,
      value: function (s) { return s.progress.totalCoinsEarned; }
    }
  ];

  var INDEX = {};
  LIST.forEach(function (a) { INDEX[a.id] = a; });

  function allIds() { return LIST.map(function (a) { return a.id; }); }
  function get(id) { return INDEX[id] || null; }
  function isUnlocked(state, id) {
    return !!state.achievements && typeof state.achievements[id] === "string";
  }

  function progressOf(state, ach) {
    var cur = 0;
    try { cur = Number(ach.value(state)) || 0; } catch (e) { cur = 0; }
    var max = ach.target;
    return { current: Math.min(cur, max), raw: cur, max: max, done: cur >= max };
  }

  /**
   * 检查所有未解锁成就，自动写入解锁时间。
   * 返回本次新解锁的成就对象数组。
   */
  function checkAll(state) {
    var unlockedNow = [];
    LIST.forEach(function (a) {
      if (isUnlocked(state, a.id)) return;
      var p = progressOf(state, a);
      if (p.done) {
        state.achievements[a.id] = S.nowISO();
        unlockedNow.push(a);
      }
    });
    return unlockedNow;
  }

  function summary(state) {
    var unlocked = 0;
    LIST.forEach(function (a) { if (isUnlocked(state, a.id)) unlocked += 1; });
    return { unlocked: unlocked, total: LIST.length };
  }

  LQ.Achievements = {
    LIST: LIST,
    allIds: allIds,
    get: get,
    isUnlocked: isUnlocked,
    progressOf: progressOf,
    checkAll: checkAll,
    summary: summary
  };
})(typeof window !== "undefined" ? window : globalThis);
