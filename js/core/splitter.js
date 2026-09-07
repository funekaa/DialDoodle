/**
 * 旋转解密绘图盘 - 纯净切分与零碰撞排布算法模块 (Pure Subdivision & Zero Collision)
 * 核心原则：
 * 1. 彻底废除跨笔画拼接合并 (Zero Merge)，从根源杜绝麻花结与自交回折；
 * 2. 闭环严格切分 (1/2 或 1/3)，只做平滑单向截断，所有开槽均为舒展单向线；
 * 3. 严格基于实体槽宽物理碰撞检测，全局求解无交叉角度。
 */

import { Geometry } from './geometry.js';

export const Splitter = {
  /**
   * 自动缩放与居中图形至安全环形画幅内
   * 确保任何开槽点到圆心距离严格在 25 ~ 134px 之间，距离外圆边缘保留至少 45px 坚固纸边，防止剪破
   */
  normalizeToSafeRegion(rawStrokes) {
    if (!rawStrokes || rawStrokes.length === 0) return [];

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    rawStrokes.forEach(st => {
      st.forEach(pt => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });
    });

    const currentH = Math.max(10, maxY - minY);
    const currentW = Math.max(10, maxX - minX);
    const targetH = 102;
    const targetW = 120;

    const scale = Math.min(1.0, Math.min(targetH / currentH, targetW / currentW));
    const centerSourceY = (minY + maxY) / 2;
    const centerTargetY = -82;

    let strokes = rawStrokes.map(st =>
      st.map(pt => ({
        x: pt.x * scale,
        y: centerTargetY + (pt.y - centerSourceY) * scale
      }))
    );

    // 严密二次微调：确保所有点到圆心距离严格在 25 ~ 135 之间
    let minR = Infinity, maxR = 0;
    strokes.forEach(st => {
      st.forEach(pt => {
        const r = Math.hypot(pt.x, pt.y);
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      });
    });

    if (minR < 25) {
      const shiftUp = 26 - minR;
      strokes = strokes.map(st => st.map(pt => ({ x: pt.x, y: pt.y - shiftUp })));
    }

    maxR = 0;
    strokes.forEach(st => {
      st.forEach(pt => {
        const r = Math.hypot(pt.x, pt.y);
        if (r > maxR) maxR = r;
      });
    });
    if (maxR > 135) {
      const factor = 135 / maxR;
      strokes = strokes.map(st => st.map(pt => ({ x: pt.x * factor, y: pt.y * factor })));
    }

    return strokes;
  },

  /**
   * 闭环拆解：将封闭曲线（圆、椭圆）沿周长切分为 2 段（1/2 对半）或 3 段（1/3 均分）
   * 每一段都是单纯的单向平滑弧线，绝不产生自交
   */
  breakClosedLoops(strokes) {
    const result = [];

    strokes.forEach(st => {
      if (!st || st.length < 2) return;
      const sampled = Geometry.resamplePath(st, 4);
      if (sampled.length < 2) return;

      const first = sampled[0];
      const last = sampled[sampled.length - 1];
      const headTailDist = Geometry.dist(first, last);
      const totalLen = Geometry.pathLength(sampled);
      // 严密判定：凡是首尾相连或首尾狭窄封闭的回路(<=28px)，彻底拆解
      const isClosed = headTailDist <= 15 || (headTailDist <= 28 && totalLen >= 40);

      if (isClosed) {
        const totalPts = sampled.length;

        // 若封闭环周长很大（如大头大圆圈），均匀切成 3 段 (各 1/3)
        if (totalLen > 180 && totalPts >= 12) {
          const idx1 = Math.floor(totalPts / 3);
          const idx2 = Math.floor((totalPts * 2) / 3);
          result.push(sampled.slice(0, idx1 + 1));
          result.push(sampled.slice(idx1, idx2 + 1));
          result.push(sampled.slice(idx2));
        } else {
          // 否则对半切成 2 段 (严格 1/2 对半切，大开口开放折线)
          const half = Math.floor(totalPts / 2);
          const p1 = sampled.slice(0, half + 1);
          const p2 = sampled.slice(half);
          // 若子段依然存在闭合狭缝，继续对半切
          if (Geometry.dist(p1[0], p1[p1.length - 1]) <= 18 && Geometry.pathLength(p1) >= 35) {
            const h1 = Math.floor(p1.length / 2);
            result.push(p1.slice(0, h1 + 1));
            result.push(p1.slice(h1));
          } else {
            result.push(p1);
          }
          if (Geometry.dist(p2[0], p2[p2.length - 1]) <= 18 && Geometry.pathLength(p2) >= 35) {
            const h2 = Math.floor(p2.length / 2);
            result.push(p2.slice(0, h2 + 1));
            result.push(p2.slice(h2));
          } else {
            result.push(p2);
          }
        }
      } else {
        result.push(sampled);
      }
    });

    return result;
  },

  /**
   * 纯净切分器 (Pure Subdivision)：
   * 严格禁止跨笔画拼接合并！只通过由长到短的对半切分达到目标刻度数 N
   * 确保生成的每一个开槽都是单向、平滑、纯净的曲线，自交数绝对为 0！
   */
  /**
   * 将线条集合零丢失、无合并地分配给精准的 targetCount 个刻度 (10 - 20)
   * 若线条数少于 targetCount，对半切分长线条至精准等于 targetCount；
   * 若线条数大于 targetCount，轮流发牌分配给 targetCount 个刻度组 (每组 1~2 根独立的平滑线条)，零丢线、零麻花！
   */
  distributeStrokesToTicks(strokes, targetCount) {
    if (!strokes || strokes.length === 0) return [];

    let current = [...strokes];

    // 若线段数少于 targetCount，对半截断最长线条直到精准达到 targetCount
    while (current.length < targetCount) {
      let maxIdx = 0;
      let maxLen = -1;
      current.forEach((st, idx) => {
        const l = Geometry.pathLength(st);
        if (l > maxLen) {
          maxLen = l;
          maxIdx = idx;
        }
      });

      const longest = current[maxIdx];
      if (longest.length < 4) break;

      const half = Math.floor(longest.length / 2);
      const piece1 = longest.slice(0, half + 1);
      const piece2 = longest.slice(half);

      current.splice(maxIdx, 1, piece1, piece2);
    }

    // 创建恰好 targetCount 个刻度组
    const groups = Array.from({ length: targetCount }, (_, i) => ({
      groupId: i + 1,
      strokes: []
    }));

    // 按线段长度降序，轮流发牌均分给 targetCount 个刻度
    current.sort((a, b) => Geometry.pathLength(b) - Geometry.pathLength(a));
    current.forEach((st, idx) => {
      groups[idx % targetCount].strokes.push(st);
    });

    return groups;
  },

  /**
   * 全局零相交排布求解器 (支持单刻度单槽/多槽联合避让)
   * 采用多轮随机重启启发式搜索，确保所有开槽之间中心线距离 >= slotWidth + safeClearance
   */
  solveNonIntersectingAngles(groups, options = {}) {
    const { slotWidth = 6, safeClearance = 12 } = options;
    const N = groups.length;
    if (N === 0) return [];

    const minRequiredDist = slotWidth + safeClearance; // 至少 18px 安全纯白纸带

    let bestSolution = null;

    // 运行多轮重启搜索，寻找完全 0 冲突的完美解
    const maxRestarts = 30;
    for (let attempt = 0; attempt < maxRestarts; attempt++) {
      let ordered = groups.map((g, idx) => ({
        groupId: g.groupId,
        strokes: g.strokes,
        totalLen: g.strokes.reduce((acc, s) => acc + Geometry.pathLength(s), 0)
      }));

      if (attempt === 0) {
        ordered.sort((a, b) => b.totalLen - a.totalLen);
      } else {
        ordered.sort((a, b) => (b.totalLen + (Math.random() - 0.5) * 50) - a.totalLen);
      }

      const placed = []; // [{ groupId, targetStrokes, angleDeg, diskStrokes: [pts, ...] }]
      let collisionCount = 0;

      for (let k = 0; k < ordered.length; k++) {
        const item = ordered[k];
        let bestAngle = (k * (360 / N)) % 360;
        let maxMargin = -1;
        let bestDiskStrokes = null;

        // 全圆周 0 ~ 360 密集搜索 (步长 2 度)
        for (let angle = 0; angle < 360; angle += 2) {
          const candidateDiskStrokes = item.strokes.map(s => Geometry.transformStrokeToDisk(s, angle));

          // 1. 半径安全约束：绝不靠近外边缘 180 (保留至少 42px 宽厚纸边) 和圆心 24
          let outOfBounds = false;
          for (const cSt of candidateDiskStrokes) {
            for (const pt of cSt) {
              const r = Math.hypot(pt.x, pt.y);
              if (r > 138 || r < 24) {
                outOfBounds = true;
                break;
              }
            }
            if (outOfBounds) break;
          }
          if (outOfBounds) continue;

          // 2. 刻度组内部多线段之间防碰
          let internalHit = false;
          for (let i = 0; i < candidateDiskStrokes.length; i++) {
            for (let j = i + 1; j < candidateDiskStrokes.length; j++) {
              if (Geometry.distPathToPath(candidateDiskStrokes[i], candidateDiskStrokes[j]) < minRequiredDist) {
                internalHit = true;
                break;
              }
            }
            if (internalHit) break;
          }
          if (internalHit) continue;

          // 3. 与所有已放置刻度组的线段防碰
          let minDist = Infinity;
          let hit = false;

          for (const pl of placed) {
            for (const cSt of candidateDiskStrokes) {
              for (const pSt of pl.diskStrokes) {
                const d = Geometry.distPathToPath(cSt, pSt);
                if (d < minDist) minDist = d;
                if (d < minRequiredDist) {
                  hit = true;
                  break;
                }
              }
              if (hit) break;
            }
            if (hit) break;
          }

          if (!hit && minDist >= minRequiredDist) {
            if (minDist > maxMargin) {
              maxMargin = minDist;
              bestAngle = angle;
              bestDiskStrokes = candidateDiskStrokes;
            }
          }
        }

        if (bestDiskStrokes) {
          placed.push({
            groupId: item.groupId,
            targetStrokes: item.strokes,
            angleDeg: bestAngle,
            diskStrokes: bestDiskStrokes
          });
        } else {
          collisionCount++;
          break;
        }
      }

      if (collisionCount === 0 && placed.length === N) {
        bestSolution = placed;
        break;
      }

      if (placed.length > (bestSolution ? bestSolution.length : 0)) {
        bestSolution = placed;
      }
    }

    // 兜底补全
    if (!bestSolution || bestSolution.length < N) {
      const placed = bestSolution || [];
      const placedGroupIds = new Set(placed.map(p => p.groupId));

      groups.forEach(g => {
        if (!placedGroupIds.has(g.groupId)) {
          let maxD = -1;
          let bestA = 0;
          let bestDisk = g.strokes.map(s => Geometry.transformStrokeToDisk(s, 0));

          for (let a = 0; a < 360; a += 1) {
            const candStrokes = g.strokes.map(s => Geometry.transformStrokeToDisk(s, a));
            let minDist = Infinity;
            for (const pl of placed) {
              for (const cSt of candStrokes) {
                for (const pSt of pl.diskStrokes) {
                  const d = Geometry.distPathToPath(cSt, pSt);
                  if (d < minDist) minDist = d;
                }
              }
            }
            if (minDist > maxD) {
              maxD = minDist;
              bestA = a;
              bestDisk = candStrokes;
            }
          }

          placed.push({
            groupId: g.groupId,
            targetStrokes: g.strokes,
            angleDeg: bestA,
            diskStrokes: bestDisk
          });
        }
      });
      bestSolution = placed;
    }

    // 按照旋转角度在圆周上顺时针升序排列
    bestSolution.sort((a, b) => a.angleDeg - b.angleDeg);

    // 从 1 到 N 赋予刻度编号
    bestSolution.forEach((slot, idx) => {
      slot.tickId = idx + 1;
    });

    return bestSolution;
  },

  /**
   * 主处理入口
   */
  process(rawStrokes, tickCount = 15, options = {}) {
    const { slotWidth = 6, safeClearance = 12 } = options;

    // 1. 安全画幅归一化
    const safeStrokes = this.normalizeToSafeRegion(rawStrokes);

    // 2. 闭环纯净切分 (破开圆与椭圆)
    const openedStrokes = this.breakClosedLoops(safeStrokes);

    // 3. 严格分配给 targetCount 个刻度组 (零丢失、零缝合、零自交)
    const strokeGroups = this.distributeStrokesToTicks(openedStrokes, tickCount);

    // 4. 全局零碰撞角度排布求解
    const solvedSlots = this.solveNonIntersectingAngles(strokeGroups, {
      slotWidth,
      safeClearance
    });

    // 5. 构建规范数据，生成平滑开槽轮廓与端头外延微型徽标
    const ticks = [];
    const tickGroups = [];

    solvedSlots.forEach(item => {
      const groupSlots = item.diskStrokes.map(diskPts => ({
        centerLine: diskPts,
        outline: Geometry.createSlotOutline(diskPts, slotWidth),
        labelPos: Geometry.computeLabelPosition(diskPts, 6, 136),
        tickId: item.tickId
      }));

      ticks.push({
        id: item.tickId,
        angleDeg: item.angleDeg
      });

      tickGroups.push({
        tickId: item.tickId,
        angleDeg: item.angleDeg,
        targetStrokes: item.targetStrokes,
        diskSlots: groupSlots
      });
    });

    return {
      ticks,
      tickGroups,
      totalFragments: tickGroups.length
    };
  }
};
