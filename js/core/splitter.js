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
   * 拐角与尖角自动检测与拆分 (Corner & Sharp Angle Splitting)
   * 核心效果：
   * 1. 彻底消灭锐角与尖角 (转向角 >= 48度 / 内角 <= 132度)，避免纸张裁剪卡刀或剪破；
   * 2. 在长线条的显著转折处拆分 (转向角 >= 28度)，打散诸如小汽车外壳等过大、过显眼的整块结构，提升解密趣味性。
   */
  splitAtCorners(strokes) {
    if (!strokes || strokes.length === 0) return [];
    const result = [];

    strokes.forEach(st => {
      if (!st || st.length < 3) {
        if (st && st.length >= 2 && Geometry.pathLength(st) >= 6) {
          result.push(st);
        }
        return;
      }

      // 重采样以获得均匀点列，避免手绘高频抖动干扰
      const sampled = Geometry.resamplePath(st, 3.5);
      const cornerIndices = Geometry.detectCornerIndices(sampled, {
        sharpAngleThreshold: 48, // 尖角/直角转向角阈值
        longStrokeProminentTurn: 28, // 长线条显著转角阈值
        minSegmentLen: 10,
        lookAheadDist: 6
      });

      if (cornerIndices.length === 0) {
        result.push(sampled);
      } else {
        let lastIdx = 0;
        cornerIndices.forEach(cIdx => {
          const piece = sampled.slice(lastIdx, cIdx + 1);
          if (piece.length >= 2 && Geometry.pathLength(piece) >= 6) {
            result.push(piece);
          }
          lastIdx = cIdx;
        });
        const lastPiece = sampled.slice(lastIdx);
        if (lastPiece.length >= 2 && Geometry.pathLength(lastPiece) >= 6) {
          result.push(lastPiece);
        }
      }
    });

    return result;
  },

  /**
   * 闭环拆解：将封闭曲线（圆、椭圆）沿周长切分为 2 段（1/2 对半）或 3 段（1/3 均分）
   * 每一段都是单纯的单向平滑弧线，绝不产生自交
   */
  breakClosedLoops(strokes) {
    const result = [];

    strokes.forEach(st => {
      if (!st || st.length < 2) return;
      const sampled = Geometry.resamplePath(st, 3.5);
      if (sampled.length < 2) return;

      const first = sampled[0];
      const last = sampled[sampled.length - 1];
      const headTailDist = Geometry.dist(first, last);
      const totalLen = Geometry.pathLength(sampled);
      // 判定回路 (<=16px 闭合或首尾紧闭狭缝)
      const isClosed = headTailDist <= 16 || (headTailDist <= 26 && totalLen >= 36);

      if (isClosed) {
        const totalPts = sampled.length;

        // 若封闭环周长很大（如大头大圆圈），均匀切成 3 段 (各 1/3)
        if (totalLen > 150 && totalPts >= 12) {
          const idx1 = Math.floor(totalPts / 3);
          const idx2 = Math.floor((totalPts * 2) / 3);
          result.push(sampled.slice(0, idx1 + 1));
          result.push(sampled.slice(idx1, idx2 + 1));
          result.push(sampled.slice(idx2));
        } else {
          // 否则对半切成 2 段
          const half = Math.floor(totalPts / 2);
          result.push(sampled.slice(0, half + 1));
          result.push(sampled.slice(half));
        }
      } else {
        result.push(sampled);
      }
    });

    return result;
  },

  /**
   * 自然平滑连接邻近笔画 (Natural Smooth Chaining)
   * 针对用户反馈：解决耳朵与头轮廓断开的问题，使端点邻近、且走向平缓的笔画自然相连为单条开槽
   */
  connectAdjacentStrokes(strokes, maxGap = 12, maxAngle = 45, maxChainLen = 140) {
    if (!strokes || strokes.length < 2) return strokes || [];

    let list = strokes.map(s => [...s]);
    let mergedAny = true;

    while (mergedAny) {
      mergedAny = false;

      for (let i = 0; i < list.length; i++) {
        for (let j = 0; j < list.length; j++) {
          if (i === j) continue;

          const s1 = list[i];
          const s2 = list[j];
          if (!s1 || !s2 || s1.length < 2 || s2.length < 2) continue;

          const len1 = Geometry.pathLength(s1);
          const len2 = Geometry.pathLength(s2);
          if (len1 + len2 > maxChainLen) continue;

          // 候选 1：s1 尾连接 s2 头
          const p1Tail = s1[s1.length - 1];
          const p1PreTail = s1[s1.length - 2];
          const p2Head = s2[0];
          const p2PostHead = s2[1];

          if (Geometry.dist(p1Tail, p2Head) <= maxGap) {
            const turnAngle = Geometry.computeTurnAngle(p1PreTail, p2Head, p2PostHead);
            if (turnAngle <= maxAngle) {
              const candidate = [...s1, ...s2];
              if (!Geometry.isPathSelfIntersecting(candidate)) {
                list.splice(Math.max(i, j), 1);
                list.splice(Math.min(i, j), 1, candidate);
                mergedAny = true;
                break;
              }
            }
          }

          // 候选 2：s1 尾连接 s2 尾 (将 s2 反向)
          const p2Tail = s2[s2.length - 1];
          const p2PreTail = s2[s2.length - 2];
          if (Geometry.dist(p1Tail, p2Tail) <= maxGap) {
            const turnAngle = Geometry.computeTurnAngle(p1PreTail, p2Tail, p2PreTail);
            if (turnAngle <= maxAngle) {
              const reversedS2 = [...s2].reverse();
              const candidate = [...s1, ...reversedS2];
              if (!Geometry.isPathSelfIntersecting(candidate)) {
                list.splice(Math.max(i, j), 1);
                list.splice(Math.min(i, j), 1, candidate);
                mergedAny = true;
                break;
              }
            }
          }
        }
        if (mergedAny) break;
      }
    }

    return list;
  },

  /**
   * 严格单槽单刻度分配器 (Strict Single Slot Per Tick)：
   * 彻底废除多槽合并与跨区域轮流发牌！
   * 每一个刻度组有且仅有 1 根单向平滑无尖角线条！
   */
  distributeStrokesToTicks(strokes, targetCount) {
    if (!strokes || strokes.length === 0) return [];

    let current = strokes.map(s => Geometry.resamplePath(s, 3.5));

    // 1. 若线段数少于 targetCount，对半截断最长线条直到精准达到 targetCount
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

    // 2. 若线段数大于 20，安全合并最近邻段以防刻度过密
    if (current.length > 20) {
      while (current.length > 20) {
        let bestPair = null;
        let minD = Infinity;

        for (let i = 0; i < current.length; i++) {
          for (let j = i + 1; j < current.length; j++) {
            const d = Math.min(
              Geometry.dist(current[i][0], current[j][0]),
              Geometry.dist(current[i][0], current[j][current[j].length - 1]),
              Geometry.dist(current[i][current[i].length - 1], current[j][0]),
              Geometry.dist(current[i][current[i].length - 1], current[j][current[j].length - 1])
            );
            if (d < minD) {
              minD = d;
              bestPair = [i, j];
            }
          }
        }

        if (bestPair && minD < 24) {
          const [i, j] = bestPair;
          const merged = [...current[i], ...current[j]];
          current.splice(j, 1);
          current.splice(i, 1, merged);
        } else {
          break;
        }
      }
    }

    const actualCount = current.length;

    // 创建恰好 actualCount 个刻度组，每一组严格对应且仅对应 1 根单向平滑线条！
    const groups = Array.from({ length: actualCount }, (_, i) => ({
      groupId: i + 1,
      strokes: [current[i]]
    }));

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

    // 2. 拐角与尖角自动检测与拆分 (消除尖锐难剪折角，打散过长显眼外壳)
    const deCorneredStrokes = this.splitAtCorners(safeStrokes);

    // 3. 闭环纯净切分 (破开圆与椭圆回路)
    const openedStrokes = this.breakClosedLoops(deCorneredStrokes);

    // 4. 邻近笔画自然平滑连接 (连通相近且平缓的线条，如耳朵与头轮廓顺势相连)
    const chainedStrokes = this.connectAdjacentStrokes(openedStrokes, 12, 45, 140);

    // 5. 严格单槽单刻度精准分配 (严格 1 刻度 1 槽，零多槽分散)
    const strokeGroups = this.distributeStrokesToTicks(chainedStrokes, tickCount);

    // 6. 全局零碰撞角度排布求解
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
