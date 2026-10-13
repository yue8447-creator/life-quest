/* =========================================================
   LIFE QUEST — js/skills.js
   技能树：四个属性分支、前置依赖、技能点消耗
   ========================================================= */
(function (global) {
  "use strict";

  var LQ = global.LQ = global.LQ || {};
  var S = LQ.Store;

  /* slot 决定分支内的排版位置：
     0 = 顶端（根节点）
     1 = 第二层左
     2 = 第二层右
     3 = 第三层汇聚节点 */
  var BRANCHES = [
    {
      id: "study",
      name: "学习",
      icon: "📚",
      color: "#22d3ee",
      desc: "把知识沉淀成能力",
      nodes: [
        { id: "study-focus", name: "专注力", cost: 1, req: [], slot: 0,
          desc: "把手机放远，用 25 分钟专注块完成一件事。专注意味着主动选择不被干扰。" },
        { id: "study-know", name: "知识积累", cost: 1, req: ["study-focus"], slot: 1,
          desc: "持续输入并留下笔记，让零散的信息沉淀为可复用的知识。" },
        { id: "study-analyze", name: "分析能力", cost: 2, req: ["study-focus"], slot: 2,
          desc: "遇到问题先拆解结构、找出变量与因果，再下结论。" },
        { id: "study-master", name: "融会贯通", cost: 3, req: ["study-know", "study-analyze"], slot: 3,
          desc: "把不同领域的知识连接起来，形成自己的理解框架并能讲给别人听。" }
      ]
    },
    {
      id: "health",
      name: "健康",
      icon: "💪",
      color: "#34d399",
      desc: "把身体练成装备",
      nodes: [
        { id: "health-stamina", name: "体能", cost: 1, req: [], slot: 0,
          desc: "从每天 20 分钟的快走或慢跑开始，建立身体基础。" },
        { id: "health-rhythm", name: "规律作息", cost: 1, req: ["health-stamina"], slot: 1,
          desc: "固定起床时间，保证 7 小时睡眠，让精力曲线变得稳定。" },
        { id: "health-habit", name: "运动习惯", cost: 2, req: ["health-stamina"], slot: 2,
          desc: "把运动排进日程表而不是等有空，一周至少三次。" },
        { id: "health-strong", name: "强健体魄", cost: 3, req: ["health-rhythm", "health-habit"], slot: 3,
          desc: "体能与作息同时稳定，能连续数周保持高效状态。" }
      ]
    },
    {
      id: "create",
      name: "创造力",
      icon: "🎨",
      color: "#a78bfa",
      desc: "把想法做成作品",
      nodes: [
        { id: "create-express", name: "表达", cost: 1, req: [], slot: 0,
          desc: "每天写下或说出一个完整的想法，让思路变得清晰。" },
        { id: "create-design", name: "设计", cost: 1, req: ["create-express"], slot: 1,
          desc: "关注结构与美感，学会为使用者而不是为自己设计。" },
        { id: "create-hand", name: "动手能力", cost: 2, req: ["create-express"], slot: 2,
          desc: "把想法落地成可运行的原型或实物，哪怕非常粗糙。" },
        { id: "create-work", name: "创造之作", cost: 3, req: ["create-design", "create-hand"], slot: 3,
          desc: "完成一件能被他人看到、使用或欣赏的完整作品。" }
      ]
    },
    {
      id: "explore",
      name: "探索",
      icon: "🧭",
      color: "#f472b6",
      desc: "把边界推得更远",
      nodes: [
        { id: "explore-try", name: "尝试新事物", cost: 1, req: [], slot: 0,
          desc: "每周做一件以前没做过的小事，让大脑保持新鲜感。" },
        { id: "explore-solve", name: "解决问题", cost: 1, req: ["explore-try"], slot: 1,
          desc: "遇到障碍先尝试自己排查，记录过程与结论。" },
        { id: "explore-spirit", name: "探索精神", cost: 2, req: ["explore-try"], slot: 2,
          desc: "主动提出假设并去验证，而不是等着别人给答案。" },
        { id: "explore-journey", name: "远行开拓", cost: 3, req: ["explore-solve", "explore-spirit"], slot: 3,
          desc: "把探索变成长期方向，敢于进入陌生的领域。" }
      ]
    }
  ];

  var NODE_INDEX = {};
  var ORDER = [];
  BRANCHES.forEach(function (b) {
    b.nodes.forEach(function (n) {
      n.branchId = b.id;
      n.branchName = b.name;
      n.color = b.color;
      NODE_INDEX[n.id] = n;
      ORDER.push(n.id);
    });
  });

  function allNodeIds() { return ORDER.slice(); }
  function allNodes() { return ORDER.map(function (id) { return NODE_INDEX[id]; }); }
  function getNode(id) { return NODE_INDEX[id] || null; }
  function getBranch(id) {
    for (var i = 0; i < BRANCHES.length; i++) if (BRANCHES[i].id === id) return BRANCHES[i];
    return null;
  }

  function isUnlocked(state, id) {
    return Array.isArray(state.skills) && state.skills.indexOf(id) >= 0;
  }

  function missingReqs(state, id) {
    var node = NODE_INDEX[id];
    if (!node) return [];
    return node.req.filter(function (r) { return !isUnlocked(state, r); });
  }

  function status(state, id) {
    var node = NODE_INDEX[id];
    if (!node) return "locked";
    if (isUnlocked(state, id)) return "unlocked";
    if (missingReqs(state, id).length === 0 && state.progress.points >= node.cost) return "ready";
    return "locked";
  }

  /** 说明当前为什么不能解锁 */
  function lockReason(state, id) {
    var node = NODE_INDEX[id];
    if (!node) return { code: "unknown", text: "节点不存在" };
    if (isUnlocked(state, id)) return { code: "unlocked", text: "已解锁" };
    var miss = missingReqs(state, id);
    if (miss.length) {
      var names = miss.map(function (r) { return (NODE_INDEX[r] || { name: r }).name; });
      return { code: "req", text: "需要先解锁前置技能：" + names.join("、"), missing: names };
    }
    if (state.progress.points < node.cost) {
      return { code: "points", text: "技能点不足，还需要 " + (node.cost - state.progress.points) + " 点（当前 " + state.progress.points + " / 需要 " + node.cost + "）", need: node.cost - state.progress.points };
    }
    return { code: "ready", text: "满足解锁条件，可以解锁" };
  }

  function unlock(state, id) {
    var node = NODE_INDEX[id];
    if (!node) return { ok: false, error: "技能节点不存在" };
    if (isUnlocked(state, id)) {
      return { ok: false, error: "「" + node.name + "」已经解锁，不会重复扣除技能点" };
    }
    var miss = missingReqs(state, id);
    if (miss.length) {
      var names = miss.map(function (r) { return (NODE_INDEX[r] || { name: r }).name; });
      return { ok: false, error: "需要先解锁前置技能：" + names.join("、") };
    }
    if (state.progress.points < node.cost) {
      return { ok: false, error: "技能点不足，还需要 " + (node.cost - state.progress.points) + " 点" };
    }
    state.progress.points -= node.cost;
    if (state.progress.points < 0) state.progress.points = 0;
    state.skills.push(id);
    return { ok: true, node: node, cost: node.cost };
  }

  function branchProgress(state, branchId) {
    var b = getBranch(branchId);
    if (!b) return { unlocked: 0, total: 0 };
    var unlocked = 0;
    b.nodes.forEach(function (n) { if (isUnlocked(state, n.id)) unlocked += 1; });
    return { unlocked: unlocked, total: b.nodes.length };
  }

  function totalProgress(state) {
    var unlocked = 0;
    ORDER.forEach(function (id) { if (isUnlocked(state, id)) unlocked += 1; });
    return { unlocked: unlocked, total: ORDER.length };
  }

  LQ.Skills = {
    BRANCHES: BRANCHES,
    allNodeIds: allNodeIds,
    allNodes: allNodes,
    getNode: getNode,
    getBranch: getBranch,
    isUnlocked: isUnlocked,
    missingReqs: missingReqs,
    status: status,
    lockReason: lockReason,
    unlock: unlock,
    branchProgress: branchProgress,
    totalProgress: totalProgress
  };
})(typeof window !== "undefined" ? window : globalThis);
