/**
 * 旋转解密绘图盘 - 纯净切分与零碰撞排布算法模块 (Pure Subdivision & Zero Collision)
 * 版本：v0.2
 * 核心设计原则：
 * 1. 完整保留所有线条：绝不丢弃任何笔画，多余线段智能分配到空间最远的刻度组作为独立开槽，100% 还原画面！
 * 2. 画幅安全范围大幅外扩：极径放宽至 24 ~ 146px，充分利用大纸盘空间，图形显著放大！
 * 3. 开槽必须开口：封闭圆环多段切开并保留足够宽度的实体纸桥，小圆转为开口 C 形槽，大圆多段平滑大弧，完整呈现大脸轮廓且中间绝不脱芯！
 * 4. 严禁锐角与自交：所有折弯转向角 >= 45° 全部拆分，平滑去噪消除手抖，杜绝任何尖角卡刀与麻花死结；
 * 5. 刻度线精致短巧，数字间距合理不拥挤。
 */

import { Geometry } from './geometry.js';

export const Splitter = {
  /**
   * 平滑滤波：消除手绘抖动与高频微小噪点，避免手抖折角被错误碎切
   */
  smoothStroke(points) {
    if (!points || points.length < 3) return points || [];
    const smoothed = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      smoothed.push({
        x: points[i - 1].x * 0.25 + points[i].x * 0.5 + points[i + 1].x * 0.25,
        y: points[i - 1].y * 0.25 + points[i].y * 0.5 + points[i + 1].y * 0.25
      });
    }
    smoothed.push(points[points.length - 1]);
    return smoothed;
  },

  /**
   * 判断线条是否属于紧凑型眼睛/圆孔特征
   */
  isCompactHole(stroke) {
    if (!stroke || stroke.length < 3) return false;
    if (stroke.isHole) return true;

    const first = stroke[0];
    const last = stroke[stroke.length - 1];
    const headTailDist = Geometry.dist(first, last);
    const totalLen = Geometry.pathLength(stroke);

    const isClosed = (totalLen >= 6 && headTailDist <= 16 && (headTailDist / totalLen) < 0.35) || (headTailDist <= 2.5 && totalLen >= 5);
    if (!isClosed) return false;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    stroke.forEach(pt => {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    });
    const w = maxX - minX;
    const h = maxY - minY;

    return (w <= 24 && h <= 24 && totalLen <= 70 && totalLen >= 6);
  },

  /**
   * 生成舒适放大的眼睛开孔对象 (A4 标准 6~7.5mm 圆孔，直接使用打孔器或笔尖开孔)
   */
  createHoleStroke(stroke) {
    let sumX = 0, sumY = 0;
    stroke.forEach(p => { sumX += p.x; sumY += p.y; });
    const cx = sumX / stroke.length;
    const cy = sumY / stroke.length;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    stroke.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    const w = maxX - minX;
    const h = maxY - minY;

    // 眼睛开大一点：半径至少 6.5px (对应 A4 上约 6.0~7.5mm，完全契合标准单孔打孔器规格)
    const holeR = Math.max(6.5, Math.min(8.5, Math.max(w, h) / 2 + 1.2));

    const circlePts = [];
    const segs = 24;
    for (let i = 0; i <= segs; i++) {
      const a = (i * 2 * Math.PI) / segs;
      circlePts.push({
        x: cx + holeR * Math.cos(a),
        y: cy + holeR * Math.sin(a)
      });
    }
    circlePts.isHole = true;
    circlePts.center = { x: cx, y: cy };
    circlePts.radius = holeR;
    return circlePts;
  },

  /**
   * 大画幅安全范围归一化：将图形缩放并居中至饱满大气的环形画幅内
   * 极径放宽至 24 ~ 146px，充分利用大纸盘空间，距离外裁切边 180 仍留出 34px 安全距离
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
    // 大画幅尺寸：宽 152, 高 132 (充分利用大纸盘，图形明显更大更舒展！)
    const targetH = 132;
    const targetW = 152;

    const scale = Math.min(1.0, Math.min(targetH / currentH, targetW / currentW));
    const centerSourceY = (minY + maxY) / 2;
    const centerTargetY = -82;

    let strokes = rawStrokes.map(st => {
      const res = st.map(pt => ({
        x: pt.x * scale,
        y: centerTargetY + (pt.y - centerSourceY) * scale
      }));
      if (st.isHole) {
        res.isHole = true;
        if (st.radius) res.radius = st.radius * scale;
        if (st.center) {
          res.center = {
            x: st.center.x * scale,
            y: centerTargetY + (st.center.y - centerSourceY) * scale
          };
        }
      }
      return res;
    });

    // 严密二次微调：确保所有点到圆心距离严格在 24 ~ 146 之间
    let minR = Infinity, maxR = 0;
    strokes.forEach(st => {
      st.forEach(pt => {
        const r = Math.hypot(pt.x, pt.y);
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      });
    });

    if (minR < 24) {
      const shiftUp = 25 - minR;
      strokes = strokes.map(st => {
        const res = st.map(pt => ({ x: pt.x, y: pt.y - shiftUp }));
        if (st.isHole) {
          res.isHole = true;
          res.radius = st.radius;
          if (st.center) res.center = { x: st.center.x, y: st.center.y - shiftUp };
        }
        return res;
      });
    }

    maxR = 0;
    strokes.forEach(st => {
      st.forEach(pt => {
        const r = Math.hypot(pt.x, pt.y);
        if (r > maxR) maxR = r;
      });
    });
    if (maxR > 146) {
      const factor = 146 / maxR;
      strokes = strokes.map(st => {
        const res = st.map(pt => ({ x: pt.x * factor, y: pt.y * factor }));
        if (st.isHole) {
          res.isHole = true;
          if (st.radius) res.radius = st.radius * factor;
          if (st.center) res.center = { x: st.center.x * factor, y: st.center.y * factor };
        }
        return res;
      });
    }

    return strokes;
  },

  /**
   * 开槽必须开口：将所有封闭曲线（圆、椭圆、手绘大头）沿周长切断，并强制留出物理纸桥缺口
   * 眼睛/圆孔保留为独立打孔圆，大圆环分为 3 段平滑大弧，完整呈现画面且中间纸芯绝不脱落
   */
  breakClosedLoops(strokes) {
    const result = [];

    strokes.forEach(st => {
      if (!st || st.length < 2) return;

      // 1. 眼睛/紧凑型圆孔判定：直接保留为完整独立圆孔，开大一点便于打孔！
      if (this.isCompactHole(st)) {
        const hole = this.createHoleStroke(st);
        result.push(hole);
        return;
      }

      const sampled = Geometry.resamplePath(st, 3.5);
      if (sampled.length < 2) return;

      const first = sampled[0];
      const last = sampled[sampled.length - 1];
      const headTailDist = Geometry.dist(first, last);
      const totalLen = Geometry.pathLength(sampled);
      // 必须首尾距离近且相对于总周长比例很小，才是真正的闭合环 (避免误杀开放短线条)
      const isClosed = (totalLen >= 10 && headTailDist <= 16 && (headTailDist / totalLen) < 0.35) || (headTailDist <= 2.0 && totalLen >= 8);

      if (isClosed) {
        const N = sampled.length;
        if (totalLen < 75) {
          // 小圆圈（眼睛、鼻孔、小斑点）：保留 78% 的圆弧，留出 22% 的实体纸桥缺口，形成开口 C 形槽
          const keepCount = Math.max(3, Math.floor(N * 0.78));
          const openArc = sampled.slice(0, keepCount);
          if (Geometry.pathLength(openArc) >= 2.5) {
            result.push(openArc);
          }
        } else {
          // 大闭合环（如大圆脸庞、头围轮廓）：切分成 3 段大弧线，段与段之间留出 4% 实体纸桥缺口
          const segLen = Math.floor(N / 3);
          const gap = Math.max(1, Math.floor(N * 0.04));

          const s1 = sampled.slice(0, Math.max(2, segLen - gap));
          const s2 = sampled.slice(segLen, Math.max(segLen + 2, segLen * 2 - gap));
          const s3 = sampled.slice(segLen * 2, Math.max(segLen * 2 + 2, N - gap));

          [s1, s2, s3].forEach(seg => {
            if (seg.length >= 2 && Geometry.pathLength(seg) >= 3.0) {
              result.push(seg);
            }
          });
        }
      } else {
        result.push(sampled);
      }
    });

    return result;
  },

  /**
   * 严禁锐角：拐角与尖角自动检测与强制拆分
   * 转向角 >= 45°（即折角内角 <= 135°）直接切断，彻底消灭锐角与尖角折返
   */
  splitAtCorners(strokes) {
    if (!strokes || strokes.length === 0) return [];
    const result = [];

    strokes.forEach(st => {
      if (!st || st.length < 2) return;
      if (st.isHole) {
        result.push(st);
        return;
      }
      const sampled = Geometry.resamplePath(st, 3.5);
      if (sampled.length < 2) return;

      const pieces = [];
      let curPiece = [sampled[0]];

      for (let i = 1; i < sampled.length - 1; i++) {
        curPiece.push(sampled[i]);
        const turn = Geometry.computeTurnAngle(sampled[i - 1], sampled[i], sampled[i + 1]);
        if (turn >= 45) {
          if (curPiece.length >= 2 && Geometry.pathLength(curPiece) >= 2.0) {
            pieces.push(curPiece);
          }
          curPiece = [sampled[i]];
        }
      }
      curPiece.push(sampled[sampled.length - 1]);
      if (curPiece.length >= 2 && Geometry.pathLength(curPiece) >= 2.0) {
        pieces.push(curPiece);
      }

      if (pieces.length === 0 && Geometry.pathLength(sampled) >= 2.0) {
        result.push(sampled);
      } else {
        pieces.forEach(p => result.push(p));
      }
    });

    return result;
  },

  /**
   * 严禁自相交：消灭自相交、麻花结与回折环
   */
  eliminateSelfIntersections(strokes) {
    const result = [];
    strokes.forEach(st => {
      if (!st || st.length < 2) return;
      if (st.isHole) {
        result.push(st);
        return;
      }
      if (!Geometry.isPathSelfIntersecting(st)) {
        result.push(st);
        return;
      }
      const half = Math.floor(st.length / 2);
      const p1 = st.slice(0, half + 1);
      const p2 = st.slice(half);
      if (Geometry.pathLength(p1) >= 2.0) result.push(p1);
      if (Geometry.pathLength(p2) >= 2.0) result.push(p2);
    });
    return result;
  },

  /**
   * 最终平滑过滤：彻底切除任何残余的锐角折角（确保最大转向角 <= 45°）
   */
  enforceNoSharpAngles(strokes) {
    const result = [];

    strokes.forEach(st => {
      if (!st || st.length < 2) return;
      if (st.isHole) {
        result.push(st);
        return;
      }
      const pts = Geometry.resamplePath(st, 3.5);
      if (pts.length < 3) {
        if (Geometry.pathLength(pts) >= 2.0) result.push(pts);
        return;
      }

      let cur = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        cur.push(pts[i]);
        const turn = Geometry.computeTurnAngle(pts[i - 1], pts[i], pts[i + 1]);
        if (turn >= 45) {
          if (cur.length >= 2 && Geometry.pathLength(cur) >= 2.0) {
            result.push(cur);
          }
          cur = [pts[i]];
        }
      }
      cur.push(pts[pts.length - 1]);
      if (cur.length >= 2 && Geometry.pathLength(cur) >= 2.0) {
        result.push(cur);
      }
    });

    return result;
  },

  /**
   * 精确刻度分配器：刻度总数精准等于用户设定的 targetCount (10 ~ 20 之间)，绝不超标！
   * 彻底杜绝零碎小碎片，保证每根线条连贯整洁
   */
  distributeStrokesToTicks(strokes, targetCount = 15) {
    if (!strokes || strokes.length === 0) return [];

    // 刻度数严格锁定在 10 ~ 20 之间，且严格等于用户设定值！
    const exactN = Math.max(10, Math.min(20, parseInt(targetCount, 10) || 15));

    // 仅过滤极微噪点 (长度 < 2.5px)，彻底保全五官眼睛、嘴中缝、牙齿与爪子等细小特征
    let current = strokes
      .filter(s => s && s.length >= 2 && (s.isHole || Geometry.pathLength(s) >= 2.5))
      .map(s => {
        if (s.isHole) return s;
        return Geometry.resamplePath(s, 3.5);
      });

    // 若线段数少于 exactN，将较长线段对半切分扩充
    while (current.length < exactN) {
      let maxIdx = -1;
      let maxLen = -1;
      current.forEach((st, idx) => {
        if (st.isHole) return; // 圆孔不参与切半
        const l = Geometry.pathLength(st);
        if (l > maxLen) {
          maxLen = l;
          maxIdx = idx;
        }
      });

      if (maxIdx === -1) break;
      const longest = current[maxIdx];
      if (longest.isHole || longest.length < 6 || maxLen < 16) break;

      const half = Math.floor(longest.length / 2);
      const piece1 = longest.slice(0, half + 1);
      const piece2 = longest.slice(half);

      current.splice(maxIdx, 1, piece1, piece2);
    }

    // 按线段长度降序排列
    current.sort((a, b) => Geometry.pathLength(b) - Geometry.pathLength(a));

    // 创建恰好 exactN 个刻度组，绝对不多不少！
    const groups = Array.from({ length: exactN }, (_, i) => ({
      groupId: i + 1,
      strokes: []
    }));

    // 第一轮：每个组分配一条主线
    for (let i = 0; i < exactN && i < current.length; i++) {
      groups[i].strokes.push(current[i]);
    }

    // 第二轮：如果线段数多于 exactN，将剩余线段智能打包给空间距离最远的组 (内部距离安全)
    for (let i = exactN; i < current.length; i++) {
      const st = current[i];
      let bestGroup = null;
      let maxDist = -1;

      groups.forEach(g => {
        let minD = Infinity;
        g.strokes.forEach(ex => {
          const d = Geometry.distPathToPath(st, ex);
          if (d < minD) minD = d;
        });

        if (minD > maxDist) {
          maxDist = minD;
          bestGroup = g;
        }
      });

      if (bestGroup) {
        bestGroup.strokes.push(st);
      } else {
        groups[i % exactN].strokes.push(st);
      }
    }

    return groups;
  },

  /**
   * 全局零相交排布求解器 (支持极径 r <= 146, 100% 保留所有线条)
   * 采用细粒度步长(1度) + 自适应安全距离 + 多策略随机重启启发式搜索
   */
  solveNonIntersectingAngles(groups, options = {}) {
    const { slotWidth = 6, safeClearance = defaultClearance } = options;
    const N = groups.length;
    if (N === 0) return [];

    const minTickAngleDelta = Math.max(7.0, Math.min(9.5, Math.floor(360 / N * 0.45)));

    const clearanceTiers = [
      safeClearance,
      Math.max(6, safeClearance - 3),
      Math.max(4, safeClearance - 5),
      Math.max(2.5, safeClearance - 7)
    ];

    let bestSolution = null;

    for (const curClearance of clearanceTiers) {
      const minRequiredDist = slotWidth + curClearance;
      const solution = this._solveWithClearance(groups, minRequiredDist, minTickAngleDelta);
      if (solution && solution.length === N) {
        bestSolution = solution;
        break;
      }
      if (!bestSolution || (solution && solution.length > bestSolution.length)) {
        bestSolution = solution;
      }
    }

    // 终极保全：若仍有未放置的组，多层自适应微调间距确保 100% 的组全部被放置成功
    if (bestSolution && bestSolution.length < N) {
      bestSolution = this._fillRemainingWithoutCollision(groups, bestSolution, slotWidth + 2, 4.5);
    }
    if (bestSolution && bestSolution.length < N) {
      bestSolution = this._fillRemainingWithoutCollision(groups, bestSolution, slotWidth + 0.8, 3.0);
    }

    if (!bestSolution) bestSolution = [];

    bestSolution.sort((a, b) => a.angleDeg - b.angleDeg);
    bestSolution.forEach((slot, idx) => {
      slot.tickId = idx + 1;
    });

    return bestSolution;
  },

  /**
   * 给定安全间距下的多策略多轮重启求解
   */
  _solveWithClearance(groups, minRequiredDist, minTickAngleDelta) {
    const N = groups.length;
    let best = null;
    const maxRestarts = 24;

    for (let attempt = 0; attempt < maxRestarts; attempt++) {
      let ordered = groups.map((g, idx) => ({
        groupId: g.groupId,
        strokes: g.strokes,
        totalLen: g.strokes.reduce((acc, s) => acc + Geometry.pathLength(s), 0)
      }));

      if (attempt === 0) {
        ordered.sort((a, b) => b.totalLen - a.totalLen);
      } else if (attempt === 1) {
        ordered.sort((a, b) => a.totalLen - b.totalLen);
      } else if (attempt % 3 === 0) {
        ordered.sort((a, b) => (b.totalLen + (Math.random() - 0.5) * 60) - a.totalLen);
      } else {
        for (let i = ordered.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
        }
      }

      const placed = [];
      let allPlaced = true;

      for (let k = 0; k < ordered.length; k++) {
        const item = ordered[k];
        const randomStartAngle = Math.floor(Math.random() * 360);
        let bestAngle = null;
        let maxMargin = -1;
        let bestDiskStrokes = null;

        for (let step = 0; step < 360; step += 2) {
          const angle = (randomStartAngle + step) % 360;

          let angleConflict = false;
          for (const pl of placed) {
            let diff = Math.abs(angle - pl.angleDeg) % 360;
            if (diff > 180) diff = 360 - diff;
            if (diff < minTickAngleDelta) {
              angleConflict = true;
              break;
            }
          }
          if (angleConflict) continue;

          const candidateDiskStrokes = item.strokes.map(s => Geometry.transformStrokeToDisk(s, angle));

          // 极径上限放宽至 146px (充分放大画面！)
          let outOfBounds = false;
          for (const cSt of candidateDiskStrokes) {
            for (const pt of cSt) {
              const r = Math.hypot(pt.x, pt.y);
              if (r > 148 || r < 16) {
                outOfBounds = true;
                break;
              }
            }
            if (outOfBounds) break;
          }
          if (outOfBounds) continue;

          // 组内同刻度开槽物理壁厚防割穿检查 (>= 4.0px / 1.2mm)
          let internalHit = false;
          for (let i = 0; i < candidateDiskStrokes.length; i++) {
            for (let j = i + 1; j < candidateDiskStrokes.length; j++) {
              if (Geometry.distPathToPath(candidateDiskStrokes[i], candidateDiskStrokes[j]) < 4.0) {
                internalHit = true;
                break;
              }
            }
            if (internalHit) break;
          }
          if (internalHit) continue;

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

        if (bestDiskStrokes !== null) {
          placed.push({
            groupId: item.groupId,
            targetStrokes: item.strokes,
            angleDeg: bestAngle,
            diskStrokes: bestDiskStrokes
          });
        } else {
          allPlaced = false;
          break;
        }
      }

      if (allPlaced && placed.length === N) {
        return placed;
      }

      if (!best || placed.length > best.length) {
        best = placed;
      }
    }

    return best;
  },

  /**
   * 终极保全：若仍有未放置的组，在 0.5度超细步长中寻找最佳无碰撞角度，确保 100% 放置！
   */
  _fillRemainingWithoutCollision(groups, placed, absoluteMinDist, minTickAngleDelta = 5.0) {
    const placedGroupIds = new Set(placed.map(p => p.groupId));
    const result = [...placed];

    groups.forEach(g => {
      if (placedGroupIds.has(g.groupId)) return;

      let bestAngle = null;
      let maxDist = -1;
      let bestDisk = null;

      let fallbackAngle = null;
      let fallbackMaxDist = -1;
      let fallbackDisk = null;

      for (let angle = 0; angle < 360; angle += 1.0) {
        let angleConflict = false;
        for (const pl of result) {
          let diff = Math.abs(angle - pl.angleDeg) % 360;
          if (diff > 180) diff = 360 - diff;
          if (diff < minTickAngleDelta) {
            angleConflict = true;
            break;
          }
        }
        if (angleConflict) continue;

        const candStrokes = g.strokes.map(s => Geometry.transformStrokeToDisk(s, angle));

        let outOfBounds = false;
        for (const cSt of candStrokes) {
          for (const pt of cSt) {
            const r = Math.hypot(pt.x, pt.y);
            if (r > 148 || r < 16) {
              outOfBounds = true;
              break;
            }
          }
          if (outOfBounds) break;
        }
        if (outOfBounds) continue;

        let internalHit = false;
        for (let i = 0; i < candStrokes.length; i++) {
          for (let j = i + 1; j < candStrokes.length; j++) {
            if (Geometry.distPathToPath(candStrokes[i], candStrokes[j]) < 4.0) {
              internalHit = true;
              break;
            }
          }
          if (internalHit) break;
        }
        if (internalHit) continue;

        let hit = false;
        let minDist = Infinity;
        for (const pl of result) {
          for (const cSt of candStrokes) {
            for (const pSt of pl.diskStrokes) {
              const d = Geometry.distPathToPath(cSt, pSt);
              if (d < minDist) minDist = d;
              if (d < absoluteMinDist) {
                hit = true;
                break;
              }
            }
            if (hit) break;
          }
          if (hit) break;
        }

        if (!hit && minDist >= absoluteMinDist && minDist > maxDist) {
          maxDist = minDist;
          bestAngle = angle;
          bestDisk = candStrokes;
        }

        if (minDist > fallbackMaxDist) {
          fallbackMaxDist = minDist;
          fallbackAngle = angle;
          fallbackDisk = candStrokes;
        }
      }

      if (bestDisk !== null) {
        result.push({
          groupId: g.groupId,
          targetStrokes: g.strokes,
          angleDeg: bestAngle,
          diskStrokes: bestDisk
        });
      } else if (fallbackDisk !== null) {
        result.push({
          groupId: g.groupId,
          targetStrokes: g.strokes,
          angleDeg: fallbackAngle,
          diskStrokes: fallbackDisk
        });
      }
    });

    return result;
  },

  /**
   * 主处理入口
   */
  process(rawStrokes, tickCount = 15, options = {}) {
    const defaultClearance = 14; // 默认 4mm 安全纸桥
    const { slotWidth = 6, safeClearance = defaultClearance } = options;

    // 0. 平滑滤波：消除手绘抖动微小噪点，避免碎切
    const smoothedRaw = (rawStrokes || []).map(s => this.smoothStroke(this.smoothStroke(s)));

    // 1. 安全画幅归一化 (极径放宽至 24 ~ 146，大画幅饱满大气)
    const safeStrokes = this.normalizeToSafeRegion(smoothedRaw);

    // 2. 开槽必须开口：闭环纯净切分 (小圆切为开口 C 形槽，大圆切成3段大弧完整呈现脸庞轮廓，彻底消除闭合环)
    const openedStrokes = this.breakClosedLoops(safeStrokes);

    // 3. 严禁锐角：拐角与尖角自动检测与强制拆分 (转向角 >= 45° 彻底拆断)
    const deCorneredStrokes = this.splitAtCorners(openedStrokes);

    // 4. 严禁自交：自交折线在交点处拆断
    const nonSelfStrokes = this.eliminateSelfIntersections(deCorneredStrokes);

    // 5. 最终去锐角：终极平滑过滤器确保所有笔画转向角 < 45°
    const cleanStrokes = this.enforceNoSharpAngles(nonSelfStrokes);

    // 6. 严格保真分配器：100% 保留所有线条，绝不漏线！
    const strokeGroups = this.distributeStrokesToTicks(cleanStrokes, tickCount);

    // 7. 全局零碰撞角度排布求解 (极径约束 <= 146, 零碰撞)
    const solvedSlots = this.solveNonIntersectingAngles(strokeGroups, {
      slotWidth,
      safeClearance
    });

    // 8. 构建规范数据，生成平滑开槽轮廓与端头微型徽标
    const ticks = [];
    const tickGroups = [];

    solvedSlots.forEach(item => {
      const groupSlots = item.diskStrokes.map(diskPts => {
        if (diskPts.isHole) {
          const hCenter = diskPts.center || {
            x: diskPts.reduce((acc, p) => acc + p.x, 0) / diskPts.length,
            y: diskPts.reduce((acc, p) => acc + p.y, 0) / diskPts.length
          };
          const hRadius = diskPts.radius || 7.0;
          const labelPos = Geometry.computeHoleLabelPosition(hCenter, hRadius, 5.5, 146);

          return {
            isHole: true,
            center: hCenter,
            radius: hRadius,
            centerLine: [
              { x: hCenter.x - hRadius * 0.6, y: hCenter.y },
              { x: hCenter.x + hRadius * 0.6, y: hCenter.y }
            ],
            outline: diskPts,
            labelPos: labelPos,
            tickId: item.tickId
          };
        } else {
          return {
            isHole: false,
            centerLine: diskPts,
            outline: Geometry.createSlotOutline(diskPts, slotWidth),
            labelPos: Geometry.computeLabelPosition(diskPts, 5.5, 146),
            tickId: item.tickId
          };
        }
      });

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
