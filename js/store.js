/* =========================================================
   LIFE QUEST — js/store.js
   数据层：日期工具 / 等级规则 / 存档读写 / 校验与修复 / 导入导出
   ========================================================= */
(function (global) {
  "use strict";

  var LQ = global.LQ = global.LQ || {};

  /* ---------------- 常量 ---------------- */
  var SAVE_KEY = "lifequest.save";
  var CORRUPT_KEY = "lifequest.save.corrupt";
  var SAVE_VERSION = 1;
  var MAX_LEVEL = 999;

  var XP_BASE = 100;          // 1 -> 2 级需求
  var XP_STEP = 50;           // 每级递增
  var XP_MIN = 5, XP_MAX = 50;
  var COIN_MIN = 1, COIN_MAX = 20;
  var DURATION_MIN = 1, DURATION_MAX = 480;
  var NAME_MAX = 12;
  var HISTORY_LIMIT = 60;     // 保留最近 60 天历史
  var CLAIM_LIMIT = 400;      // 保留最近 400 条领取记录

  var ATTR_IDS = ["study", "health", "create", "explore"];

  var WEEK_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  /* ---------------- 日期工具（全部按本地时间） ---------------- */
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function dateKey(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function todayKey() { return dateKey(new Date()); }

  function isValidDateKey(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var n = dayNum(s);
    return isFinite(n);
  }

  /** 把 YYYY-MM-DD 转成"天序号"，避免时区与夏令时干扰 */
  function dayNum(key) {
    var parts = String(key).split("-");
    if (parts.length !== 3) return NaN;
    var y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
    if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return NaN;
    var t = Date.UTC(y, m - 1, d);
    var dt = new Date(t);
    // 校验真实存在的日期（如 2026-02-30）
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return NaN;
    return Math.floor(t / 86400000);
  }

  /** a - b，单位为天 */
  function dayDiff(a, b) {
    var na = dayNum(a), nb = dayNum(b);
    if (!isFinite(na) || !isFinite(nb)) return NaN;
    return na - nb;
  }

  function formatDateCN(key) {
    if (!isValidDateKey(key)) return "—";
    var p = key.split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return p[0] + "年" + Number(p[1]) + "月" + Number(p[2]) + "日 " + WEEK_CN[d.getDay()];
  }

  function nowISO() { return new Date().toISOString(); }

  /* ---------------- 通用工具 ---------------- */
  var uidSeq = 0;
  function uid(prefix) {
    uidSeq += 1;
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + uidSeq.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function clamp(v, min, max) {
    v = Number(v);
    if (!isFinite(v)) return min;
    v = Math.round(v);
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }

  function isPlainObject(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function safeString(v, max) {
    if (typeof v !== "string") return "";
    var s = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if (max && s.length > max) s = s.slice(0, max);
    return s;
  }

  /* ---------------- 等级规则 ---------------- */
  /** 从 level 升到 level+1 所需经验 */
  function xpNeeded(level) {
    var lv = clamp(level, 1, MAX_LEVEL);
    return XP_BASE + (lv - 1) * XP_STEP;
  }

  /** 发放经验，返回升级次数（多余经验自动结算连续升级） */
  function grantXp(state, amount) {
    amount = Math.max(0, Math.floor(Number(amount) || 0));
    var p = state.progress;
    p.xp += amount;
    p.totalXpEarned += amount;
    var levels = 0;
    while (p.level < MAX_LEVEL && p.xp >= xpNeeded(p.level)) {
      p.xp -= xpNeeded(p.level);
      p.level += 1;
      p.points += 1;
      levels += 1;
    }
    if (p.level >= MAX_LEVEL) p.xp = 0;
    return levels;
  }

  /* ---------------- 默认任务 ---------------- */
  function defaultTasks() {
    return [
      { id: "task_study", title: "学习 30 分钟", attr: "study", duration: 30, unit: "分钟", xp: 20, coins: 5, builtin: true },
      { id: "task_health", title: "运动 20 分钟", attr: "health", duration: 20, unit: "分钟", xp: 20, coins: 5, builtin: true },
      { id: "task_read", title: "阅读 10 页", attr: "study", duration: 10, unit: "页", xp: 15, coins: 4, builtin: true },
      { id: "task_create", title: "完成一个创造性小任务", attr: "create", duration: 30, unit: "分钟", xp: 25, coins: 8, builtin: true }
    ].map(function (t) { return t; });
  }

  function makeTask(raw) {
    return {
      id: raw.id,
      title: raw.title,
      attr: raw.attr,
      duration: raw.duration,
      unit: raw.unit || "分钟",
      xp: raw.xp,
      coins: raw.coins,
      builtin: !!raw.builtin,
      done: false,
      doneDate: null,
      createdAt: raw.createdAt || nowISO()
    };
  }

  /* ---------------- 默认存档 ---------------- */
  function createDefaultState() {
    var today = todayKey();
    return {
      version: SAVE_VERSION,
      profile: {
        name: "冒险者",
        createdAt: nowISO(),
        updatedAt: nowISO(),
        maxSeenDate: today,
        clockWarn: false
      },
      progress: {
        level: 1,
        xp: 0,
        coins: 0,
        points: 0,
        totalTasks: 0,
        totalXpEarned: 0,
        totalCoinsEarned: 0
      },
      streak: { count: 0, best: 0, lastDate: null },
      daily: {
        date: today,
        tasks: defaultTasks().map(makeTask),
        xpGained: 0,
        coinsGained: 0
      },
      claims: {},
      history: {},
      skills: [],
      achievements: {},
      settings: { reduceMotion: "auto" }
    };
  }

  /* ---------------- 校验 / 修复 ---------------- */

  function sanitizeTask(raw) {
    if (!isPlainObject(raw)) return null;
    var title = safeString(raw.title, 40);
    if (!title) return null;
    var attr = ATTR_IDS.indexOf(raw.attr) >= 0 ? raw.attr : "study";
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 60) : uid("task"),
      title: title,
      attr: attr,
      duration: clamp(raw.duration, DURATION_MIN, DURATION_MAX),
      unit: safeString(raw.unit, 4) || "分钟",
      xp: clamp(raw.xp, XP_MIN, XP_MAX),
      coins: clamp(raw.coins, COIN_MIN, COIN_MAX),
      builtin: !!raw.builtin,
      done: raw.done === true,
      doneDate: isValidDateKey(raw.doneDate) ? raw.doneDate : null,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : nowISO()
    };
  }

  function validSkillIds() {
    var S = LQ.Skills;
    if (S && typeof S.allNodeIds === "function") {
      try { return S.allNodeIds(); } catch (e) { return null; }
    }
    return null;
  }

  function validAchievementIds() {
    var A = LQ.Achievements;
    if (A && typeof A.allIds === "function") {
      try { return A.allIds(); } catch (e) { return null; }
    }
    return null;
  }

  /**
   * 宽松修复：任何字段缺失或非法都回退到默认值，保证游戏可继续运行。
   */
  function sanitize(raw) {
    var def = createDefaultState();
    if (!isPlainObject(raw)) return def;
    var s = def;

    /* profile */
    if (isPlainObject(raw.profile)) {
      var name = safeString(raw.profile.name, NAME_MAX);
      if (name) s.profile.name = name;
      if (typeof raw.profile.createdAt === "string") s.profile.createdAt = raw.profile.createdAt;
      if (typeof raw.profile.updatedAt === "string") s.profile.updatedAt = raw.profile.updatedAt;
      if (isValidDateKey(raw.profile.maxSeenDate)) s.profile.maxSeenDate = raw.profile.maxSeenDate;
      s.profile.clockWarn = raw.profile.clockWarn === true;
    }

    /* progress */
    if (isPlainObject(raw.progress)) {
      var p = raw.progress;
      s.progress.level = clamp(p.level, 1, MAX_LEVEL);
      s.progress.xp = Math.max(0, Math.floor(Number(p.xp) || 0));
      s.progress.coins = Math.max(0, Math.floor(Number(p.coins) || 0));
      s.progress.points = Math.max(0, Math.floor(Number(p.points) || 0));
      s.progress.totalTasks = Math.max(0, Math.floor(Number(p.totalTasks) || 0));
      s.progress.totalXpEarned = Math.max(0, Math.floor(Number(p.totalXpEarned) || 0));
      s.progress.totalCoinsEarned = Math.max(0, Math.floor(Number(p.totalCoinsEarned) || 0));
    }

    /* streak */
    if (isPlainObject(raw.streak)) {
      s.streak.count = Math.max(0, Math.floor(Number(raw.streak.count) || 0));
      s.streak.best = Math.max(0, Math.floor(Number(raw.streak.best) || 0));
      if (isValidDateKey(raw.streak.lastDate)) s.streak.lastDate = raw.streak.lastDate;
    }

    /* daily */
    if (isPlainObject(raw.daily)) {
      if (isValidDateKey(raw.daily.date)) s.daily.date = raw.daily.date;
      if (Array.isArray(raw.daily.tasks)) {
        var seen = {};
        var list = [];
        for (var i = 0; i < raw.daily.tasks.length && list.length < 60; i++) {
          var t = sanitizeTask(raw.daily.tasks[i]);
          if (!t) continue;
          if (seen[t.id]) t.id = uid("task");
          seen[t.id] = true;
          list.push(t);
        }
        s.daily.tasks = list;
      }
      s.daily.xpGained = Math.max(0, Math.floor(Number(raw.daily.xpGained) || 0));
      s.daily.coinsGained = Math.max(0, Math.floor(Number(raw.daily.coinsGained) || 0));
    }
    if (!s.daily.tasks.length) s.daily.tasks = defaultTasks().map(makeTask);

    /* claims */
    if (isPlainObject(raw.claims)) {
      var keys = Object.keys(raw.claims).filter(function (k) {
        return /^.{1,70}@\d{4}-\d{2}-\d{2}$/.test(k) && raw.claims[k] === true;
      });
      keys.sort();
      if (keys.length > CLAIM_LIMIT) keys = keys.slice(keys.length - CLAIM_LIMIT);
      keys.forEach(function (k) { s.claims[k] = true; });
    }

    /* history */
    if (isPlainObject(raw.history)) {
      var hk = Object.keys(raw.history).filter(isValidDateKey).sort();
      if (hk.length > HISTORY_LIMIT) hk = hk.slice(hk.length - HISTORY_LIMIT);
      hk.forEach(function (k) {
        var v = raw.history[k];
        if (!isPlainObject(v)) return;
        s.history[k] = {
          completed: Math.max(0, Math.floor(Number(v.completed) || 0)),
          xp: Math.max(0, Math.floor(Number(v.xp) || 0)),
          coins: Math.max(0, Math.floor(Number(v.coins) || 0))
        };
      });
    }

    /* skills */
    var skillWhitelist = validSkillIds();
    if (Array.isArray(raw.skills)) {
      var sk = [];
      raw.skills.forEach(function (id) {
        if (typeof id !== "string") return;
        if (skillWhitelist && skillWhitelist.indexOf(id) < 0) return;
        if (sk.indexOf(id) < 0) sk.push(id);
      });
      s.skills = sk;
    }

    /* achievements */
    var achWhitelist = validAchievementIds();
    if (isPlainObject(raw.achievements)) {
      Object.keys(raw.achievements).forEach(function (id) {
        if (achWhitelist && achWhitelist.indexOf(id) < 0) return;
        var v = raw.achievements[id];
        if (v === true) s.achievements[id] = nowISO();
        else if (typeof v === "string") s.achievements[id] = v;
      });
    }

    /* settings */
    if (isPlainObject(raw.settings)) {
      var rm = raw.settings.reduceMotion;
      if (rm === true || rm === false || rm === "auto") s.settings.reduceMotion = rm;
    }

    /* 结算历史遗留的超额经验（保证 xp 始终小于当前等级需求） */
    var before = s.progress.level;
    while (s.progress.level < MAX_LEVEL && s.progress.xp >= xpNeeded(s.progress.level)) {
      s.progress.xp -= xpNeeded(s.progress.level);
      s.progress.level += 1;
      s.progress.points += 1;
    }
    if (s.progress.level !== before) s.progress.repaired = true;

    /* 数值保护：任何情况下不得为负 */
    ["coins", "points", "totalTasks", "xp"].forEach(function (k) {
      if (!isFinite(s.progress[k]) || s.progress[k] < 0) s.progress[k] = 0;
    });

    if (s.streak.best < s.streak.count) s.streak.best = s.streak.count;
    return s;
  }

  /**
   * 严格校验（导入存档时使用）。返回 { ok, errors }
   */
  function validateSaveData(obj) {
    var errors = [];
    if (!isPlainObject(obj)) return { ok: false, errors: ["存档根节点必须是一个 JSON 对象"] };

    if (obj.version === undefined) errors.push("缺少 version 字段，无法确认存档版本");
    else if (typeof obj.version !== "number") errors.push("version 必须是数字");
    else if (obj.version > SAVE_VERSION) errors.push("存档版本（v" + obj.version + "）高于当前程序支持的版本（v" + SAVE_VERSION + "）");

    if (!isPlainObject(obj.profile)) errors.push("缺少 profile（角色信息）");
    else if (obj.profile.name !== undefined && typeof obj.profile.name !== "string") errors.push("profile.name 必须是字符串");

    if (!isPlainObject(obj.progress)) errors.push("缺少 progress（成长数据）");
    else {
      ["level", "xp", "coins", "points"].forEach(function (k) {
        var v = obj.progress[k];
        if (v !== undefined && (typeof v !== "number" || !isFinite(v) || v < 0)) {
          errors.push("progress." + k + " 必须是非负数字");
        }
      });
    }

    if (!isPlainObject(obj.daily)) errors.push("缺少 daily（每日任务）");
    else if (!Array.isArray(obj.daily.tasks)) errors.push("daily.tasks 必须是数组");
    else {
      var bad = 0;
      obj.daily.tasks.forEach(function (t) {
        if (!isPlainObject(t) || typeof t.title !== "string" || !t.title.trim()) bad += 1;
        else if (ATTR_IDS.indexOf(t.attr) < 0) bad += 1;
      });
      if (bad > 0) errors.push("daily.tasks 中有 " + bad + " 条任务格式不合法（缺少标题或属性非法）");
    }

    if (obj.skills !== undefined && !Array.isArray(obj.skills)) errors.push("skills 必须是数组");
    if (obj.achievements !== undefined && !isPlainObject(obj.achievements)) errors.push("achievements 必须是对象");
    if (obj.claims !== undefined && !isPlainObject(obj.claims)) errors.push("claims 必须是对象");
    if (obj.history !== undefined && !isPlainObject(obj.history)) errors.push("history 必须是对象");

    return { ok: errors.length === 0, errors: errors };
  }

  /* ---------------- storage 适配（含不可用回退） ---------------- */
  var memoryStore = {};
  var storageWarned = false;

  function rawStorage() {
    try {
      var ls = global.localStorage;
      if (!ls) return null;
      var probe = "__lq_probe__";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      return ls;
    } catch (e) {
      return null;
    }
  }

  function readRaw(key) {
    var ls = rawStorage();
    if (!ls) { storageWarned = true; return memoryStore[key] === undefined ? null : memoryStore[key]; }
    try { return ls.getItem(key); } catch (e) { return null; }
  }

  function writeRaw(key, value) {
    var ls = rawStorage();
    if (!ls) { memoryStore[key] = value; return { ok: true, memoryOnly: true }; }
    try { ls.setItem(key, value); return { ok: true }; }
    catch (e) { return { ok: false, error: e && e.name === "QuotaExceededError" ? "浏览器存储空间已满，存档写入失败" : "存档写入失败：" + (e && e.message ? e.message : e) }; }
  }

  /* ---------------- 载入 / 保存 ---------------- */
  /**
   * 载入存档。返回 { state, notices: [{type, text}] }
   */
  function load() {
    var notices = [];
    var result = { state: null, notices: notices, storageAvailable: true };

    if (!rawStorage()) {
      result.storageAvailable = false;
      notices.push({ type: "error", text: "当前环境无法使用 localStorage，本局数据只保存在内存中，刷新后会丢失。" });
    }

    var text = readRaw(SAVE_KEY);
    if (text === null || text === undefined || text === "") {
      result.state = createDefaultState();
      return result;
    }

    var parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // 备份损坏数据，避免静默丢失
      writeRaw(CORRUPT_KEY, String(text).slice(0, 20000));
      result.state = createDefaultState();
      notices.push({ type: "error", text: "本地存档无法解析（已备份到 lifequest.save.corrupt），已为你创建新存档。" });
      return result;
    }

    if (!isPlainObject(parsed)) {
      writeRaw(CORRUPT_KEY, JSON.stringify(parsed).slice(0, 20000));
      result.state = createDefaultState();
      notices.push({ type: "error", text: "本地存档结构异常（已备份），已为你创建新存档。" });
      return result;
    }

    var v = Number(parsed.version) || 0;
    if (v > SAVE_VERSION) {
      notices.push({ type: "error", text: "本地存档来自更高版本（v" + v + "），已按当前版本尽力读取，建议导出备份。" });
    } else if (v < SAVE_VERSION) {
      notices.push({ type: "info", text: "存档已从 v" + v + " 升级到 v" + SAVE_VERSION + "。" });
    }

    var state = sanitize(parsed);
    state.version = SAVE_VERSION;
    if (state.progress.repaired) {
      delete state.progress.repaired;
      notices.push({ type: "info", text: "检测到异常经验值，已自动结算为等级。" });
    }
    result.state = state;
    return result;
  }

  function save(state) {
    state.profile.updatedAt = nowISO();
    state.version = SAVE_VERSION;
    var res = writeRaw(SAVE_KEY, JSON.stringify(state));
    if (!res.ok) return res;
    return res;
  }

  /* ---------------- 导入 / 导出 ---------------- */
  function exportJSON(state) {
    return JSON.stringify(state, null, 2);
  }

  function importFromText(text) {
    var parsed;
    try {
      parsed = JSON.parse(String(text));
    } catch (e) {
      return { ok: false, error: "文件不是合法的 JSON 文本，无法解析。" };
    }
    var check = validateSaveData(parsed);
    if (!check.ok) {
      return { ok: false, error: "存档校验失败：\n· " + check.errors.join("\n· ") };
    }
    var state = sanitize(parsed);
    state.version = SAVE_VERSION;
    delete state.progress.repaired;
    return { ok: true, state: state };
  }

  /* ---------------- 导出接口 ---------------- */
  LQ.Store = {
    SAVE_KEY: SAVE_KEY,
    CORRUPT_KEY: CORRUPT_KEY,
    SAVE_VERSION: SAVE_VERSION,
    MAX_LEVEL: MAX_LEVEL,
    XP_BASE: XP_BASE,
    XP_STEP: XP_STEP,
    XP_MIN: XP_MIN,
    XP_MAX: XP_MAX,
    COIN_MIN: COIN_MIN,
    COIN_MAX: COIN_MAX,
    DURATION_MIN: DURATION_MIN,
    DURATION_MAX: DURATION_MAX,
    NAME_MAX: NAME_MAX,
    HISTORY_LIMIT: HISTORY_LIMIT,
    CLAIM_LIMIT: CLAIM_LIMIT,
    ATTR_IDS: ATTR_IDS,

    dateKey: dateKey,
    todayKey: todayKey,
    isValidDateKey: isValidDateKey,
    dayNum: dayNum,
    dayDiff: dayDiff,
    formatDateCN: formatDateCN,
    nowISO: nowISO,

    uid: uid,
    clamp: clamp,
    isPlainObject: isPlainObject,

    xpNeeded: xpNeeded,
    grantXp: grantXp,

    defaultTasks: defaultTasks,
    makeTask: makeTask,
    createDefaultState: createDefaultState,

    sanitize: sanitize,
    validateSaveData: validateSaveData,

    load: load,
    save: save,
    exportJSON: exportJSON,
    importFromText: importFromText
  };
})(typeof window !== "undefined" ? window : globalThis);
