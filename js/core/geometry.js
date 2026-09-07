/**
 * 旋转解密绘图盘 - 几何与逆变换算法模块
 * 支持点、线段、路径的旋转变换与开槽多边形生成
 */

export const Geometry = {
  /**
   * 角度转弧度
   */
  degToRad(deg) {
    return (deg * Math.PI) / 180;
  },

  /**
   * 弧度转角度
   */
  radToDeg(rad) {
    return (rad * 180) / Math.PI;
  },

  /**
   * 将点 (x, y) 绕中心 (cx, cy) 顺时针旋转 angleDeg 度
   * 屏幕坐标系中：x向右，y向下
   * 标准数学极角以X轴向右为0度，向顺时针旋转
   */
  rotatePoint(x, y, angleDeg, cx = 0, cy = 0) {
    const rad = this.degToRad(angleDeg);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = x - cx;
    const dy = y - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  },

  /**
   * 核心逆变换：
   * 在 A 纸坐标系中，基准指示线位于正上方（即角度 -90度，方向 (0, -R)）。
   * B 纸上刻度 k 位于圆周上的角度为 tickAngleDeg（在 B 纸自身坐标系中，以正上方为 0 度，顺时针方向计算）。
   * 当用户旋转 B 纸使第 k 个刻度对齐 A 纸正上方的指示线时，B 纸整体相对于 A 纸顺时针旋转了:
   * deltaAngle = -tickAngleDeg
   *
   * 墨水划在 A 纸上的目标笔画是 targetStroke。
   * 因此，在 B 纸自身静止坐标系中，此开槽在 B 纸上的位置应为：
   * 将 targetStroke 绕圆心顺时针旋转 tickAngleDeg ！
   *
   * 验证：
   * 当 B 纸被顺时针旋转 deltaAngle = -tickAngleDeg 时：
   * 开槽点旋转后的物理绝对坐标为：Rotate( (x_B, y_B), -tickAngleDeg )
   * = Rotate( Rotate((x_A, y_A), tickAngleDeg), -tickAngleDeg )
   * = (x_A, y_A)！完全吻合目标位置！
   */
  transformStrokeToDisk(strokePoints, tickAngleDeg, origin = { x: 0, y: 0 }) {
    return strokePoints.map(pt => this.rotatePoint(pt.x, pt.y, tickAngleDeg, origin.x, origin.y));
  },

  /**
   * 计算两点间欧几里得距离
   */
  dist(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  },

  /**
   * 计算折线总长度
   */
  pathLength(points) {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      len += this.dist(points[i - 1], points[i]);
    }
    return len;
  },

  /**
   * 沿折线按距离均匀采样或切分
   */
  resamplePath(points, step = 5) {
    if (!points || points.length < 2) return points;
    const newPoints = [points[0]];
    let accumulated = 0;

    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const d = this.dist(p1, p2);
      if (d === 0) continue;

      let walked = 0;
      while (walked + (step - accumulated) <= d) {
        walked += (step - accumulated);
        const t = walked / d;
        newPoints.push({
          x: p1.x + (p2.x - p1.x) * t,
          y: p1.y + (p2.y - p1.y) * t
        });
        accumulated = 0;
      }
      accumulated += (d - walked);
    }

    const last = points[points.length - 1];
    if (this.dist(newPoints[newPoints.length - 1], last) > 1) {
      newPoints.push(last);
    }
    return newPoints;
  },

  /**
   * 计算三点组成的折线在中间点处的转向角 (Deflection Turn Angle，单位：度)
   * 0度表示顺直前进，90度表示直角转弯，>90度表示尖角/锐角折返
   */
  computeTurnAngle(pPrev, pCurr, pNext) {
    const v1x = pCurr.x - pPrev.x;
    const v1y = pCurr.y - pPrev.y;
    const v2x = pNext.x - pCurr.x;
    const v2y = pNext.y - pCurr.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-4 || l2 < 1e-4) return 0;

    const dot = v1x * v2x + v1y * v2y;
    const cosVal = Math.max(-1, Math.min(1, dot / (l1 * l2)));
    return (Math.acos(cosVal) * 180) / Math.PI;
  },

  /**
   * 检测折线中的拐角/尖角索引 (用于将尖角、急弯和显著外壳转角打断拆分)
   * @param {Array} points 折线点序列
   * @param {Object} options 阈值配置
   */
  detectCornerIndices(points, options = {}) {
    if (!points || points.length < 3) return [];
    const {
      sharpAngleThreshold = 52, // 尖角/直角判定阈值 (转向角 >= 52度，内角 <= 128度，防止卡刀与难裁剪)
      longStrokeProminentTurn = 32, // 长线条显著转角判定 (转向角 >= 32度，打散大外壳)
      minSegmentLen = 10, // 拆分后单段最小长度
      lookAheadDist = 6 // 计算切线时的跨度距离 (px)
    } = options;

    const totalLen = this.pathLength(points);
    const N = points.length;

    // 计算每个点沿折线的累积弧长
    const cumDist = [0];
    for (let i = 1; i < N; i++) {
      cumDist.push(cumDist[i - 1] + this.dist(points[i - 1], points[i]));
    }

    const angles = new Array(N).fill(0);

    for (let i = 1; i < N - 1; i++) {
      const dCurr = cumDist[i];
      // 向前找距离 >= lookAheadDist 的点
      let prevIdx = i - 1;
      while (prevIdx > 0 && dCurr - cumDist[prevIdx] < lookAheadDist) {
        prevIdx--;
      }
      // 向后找距离 >= lookAheadDist 的点
      let nextIdx = i + 1;
      while (nextIdx < N - 1 && cumDist[nextIdx] - dCurr < lookAheadDist) {
        nextIdx++;
      }

      angles[i] = this.computeTurnAngle(points[prevIdx], points[i], points[nextIdx]);
    }

    // 寻找局部极大值峰值，并筛选超过阈值的拐点
    const rawCorners = [];
    const activeThreshold = totalLen > 40 ? Math.min(sharpAngleThreshold, longStrokeProminentTurn) : sharpAngleThreshold;

    for (let i = 1; i < N - 1; i++) {
      const angle = angles[i];
      if (angle >= activeThreshold) {
        // 判断是否为局部峰值 (周围 1~2 点内不小于相邻点)
        const isPeak = angle >= angles[i - 1] && angle >= angles[i + 1];
        if (isPeak) {
          rawCorners.push({ idx: i, angle, d: cumDist[i] });
        }
      }
    }

    // 过滤掉距离端点太近或相邻太近的拐点，保留最显著的拐点
    const validCorners = [];
    rawCorners.sort((a, b) => b.angle - a.angle); // 按转折锐度从大到小优先选取

    rawCorners.forEach(c => {
      // 距离两端距离必须 >= minSegmentLen
      if (c.d < minSegmentLen || totalLen - c.d < minSegmentLen) return;
      // 与已选拐点的距离必须 >= minSegmentLen
      const tooClose = validCorners.some(vc => Math.abs(vc.d - c.d) < minSegmentLen);
      if (!tooClose) {
        validCorners.push(c);
      }
    });

    // 按在折线中的位置从小到大排序返回索引
    validCorners.sort((a, b) => a.idx - b.idx);
    return validCorners.map(c => c.idx);
  },

  /**
   * 根据线条路径生成具有开槽宽度（槽宽 slotWidth，如 3mm）的轮廓多边形，
   * 用于制作可镂空的胶囊条形开槽轮廓
   */
  createSlotOutline(points, slotWidth = 8) {
    if (!points || points.length < 2) return [];
    const halfW = slotWidth / 2;
    const leftSide = [];
    const rightSide = [];

    for (let i = 0; i < points.length; i++) {
      let nx = 0, ny = 0;
      if (i === 0) {
        const dx = points[1].x - points[0].x;
        const dy = points[1].y - points[0].y;
        const len = Math.hypot(dx, dy) || 1;
        nx = -dy / len;
        ny = dx / len;
      } else if (i === points.length - 1) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        const len = Math.hypot(dx, dy) || 1;
        nx = -dy / len;
        ny = dx / len;
      } else {
        const dx1 = points[i].x - points[i - 1].x;
        const dy1 = points[i].y - points[i - 1].y;
        const l1 = Math.hypot(dx1, dy1) || 1;
        const dx2 = points[i + 1].x - points[i].x;
        const dy2 = points[i + 1].y - points[i].y;
        const l2 = Math.hypot(dx2, dy2) || 1;

        const nx1 = -dy1 / l1, ny1 = dx1 / l1;
        const nx2 = -dy2 / l2, ny2 = dx2 / l2;
        nx = (nx1 + nx2) / 2;
        ny = (ny1 + ny2) / 2;
        const nlen = Math.hypot(nx, ny) || 1;
        nx /= nlen;
        ny /= nlen;
      }

      leftSide.push({
        x: points[i].x + nx * halfW,
        y: points[i].y + ny * halfW
      });
      rightSide.push({
        x: points[i].x - nx * halfW,
        y: points[i].y - ny * halfW
      });
    }

    // 组合成闭合轮廓：左侧从前往后 + 右侧从后往前
    return [...leftSide, ...rightSide.reverse()];
  },

  /**
   * 计算点 p 到线段 (a, b) 的最短距离平方
   */
  distSqPointToSegment(p, a, b) {
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (l2 === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * (b.x - a.x);
    const projY = a.y + t * (b.y - a.y);
    return (p.x - projX) ** 2 + (p.y - projY) ** 2;
  },

  /**
   * 判断两条线段 (p1, p2) 和 (p3, p4) 是否严格相交
   */
  segmentsIntersect(p1, p2, p3, p4) {
    // 1. AABB 快速排除（带微量 epsilon 容差）
    const min1x = Math.min(p1.x, p2.x), max1x = Math.max(p1.x, p2.x);
    const min1y = Math.min(p1.y, p2.y), max1y = Math.max(p1.y, p2.y);
    const min2x = Math.min(p3.x, p4.x), max2x = Math.max(p3.x, p4.x);
    const min2y = Math.min(p3.y, p4.y), max2y = Math.max(p3.y, p4.y);

    const eps = 1e-5;
    if (max1x < min2x - eps || max2x < min1x - eps ||
        max1y < min2y - eps || max2y < min1y - eps) {
      return false;
    }

    const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const cp1 = cross(p1, p2, p3);
    const cp2 = cross(p1, p2, p4);
    const cp3 = cross(p3, p4, p1);
    const cp4 = cross(p3, p4, p2);

    // 排除共线或几乎共线的情况 (cross product 极小)
    if (Math.abs(cp1) < 1e-4 && Math.abs(cp2) < 1e-4) {
      return false;
    }

    return ((cp1 > 0 && cp2 < 0) || (cp1 < 0 && cp2 > 0)) &&
           ((cp3 > 0 && cp4 < 0) || (cp3 < 0 && cp4 > 0));
  },

  /**
   * 计算两条线段 (a1, a2) 与 (b1, b2) 的最短距离
   */
  distSegmentToSegment(a1, a2, b1, b2) {
    if (this.segmentsIntersect(a1, a2, b1, b2)) return 0;
    const d1 = this.distSqPointToSegment(a1, b1, b2);
    const d2 = this.distSqPointToSegment(a2, b1, b2);
    const d3 = this.distSqPointToSegment(b1, a1, a2);
    const d4 = this.distSqPointToSegment(b2, a1, a2);
    return Math.sqrt(Math.min(d1, d2, d3, d4));
  },

  /**
   * 计算两条折线之间的最小距离
   */
  distPathToPath(pathA, pathB) {
    if (!pathA || !pathB || pathA.length < 2 || pathB.length < 2) return Infinity;
    let minDist = Infinity;

    // AABB 粗筛
    let minAx = Infinity, maxAx = -Infinity, minAy = Infinity, maxAy = -Infinity;
    for (const p of pathA) {
      if (p.x < minAx) minAx = p.x;
      if (p.x > maxAx) maxAx = p.x;
      if (p.y < minAy) minAy = p.y;
      if (p.y > maxAy) maxAy = p.y;
    }
    let minBx = Infinity, maxBx = -Infinity, minBy = Infinity, maxBy = -Infinity;
    for (const p of pathB) {
      if (p.x < minBx) minBx = p.x;
      if (p.x > maxBx) maxBx = p.x;
      if (p.y < minBy) minBy = p.y;
      if (p.y > maxBy) maxBy = p.y;
    }

    // 若包围盒距离已经大于已知 minDist 则可跳过
    const dx = Math.max(0, Math.max(minAx - maxBx, minBx - maxAx));
    const dy = Math.max(0, Math.max(minAy - maxBy, minBy - maxAy));
    if (Math.hypot(dx, dy) > 60) return Math.hypot(dx, dy);

    for (let i = 0; i < pathA.length - 1; i++) {
      for (let j = 0; j < pathB.length - 1; j++) {
        const d = this.distSegmentToSegment(pathA[i], pathA[i + 1], pathB[j], pathB[j + 1]);
        if (d < minDist) {
          minDist = d;
          if (minDist === 0) return 0; // 相交
        }
      }
    }
    return minDist;
  },

  /**
   * 判断一条折线内部是否自相交 (Self-intersecting)
   */
  isPathSelfIntersecting(points) {
    if (!points || points.length < 4) return false;
    for (let i = 0; i < points.length - 2; i++) {
      for (let j = i + 2; j < points.length - 1; j++) {
        // 排除首尾闭合点连接的相邻情况
        if (i === 0 && j === points.length - 2) continue;
        if (this.segmentsIntersect(points[i], points[i + 1], points[j], points[j + 1])) {
          return true;
        }
      }
    }
    return false;
  },

  /**
   * 计算开槽旁边刻度编号的最佳标注位置 (紧贴端头吸附式，贴近开槽绝不漂浮混淆)
   * 紧贴开槽端点外延 5~6px，一眼认清归属
   */
  computeLabelPosition(points, offset = 6, maxRadius = 136) {
    if (!points || points.length === 0) return { x: 0, y: -60 };
    if (points.length === 1) return { x: points[0].x + offset, y: points[0].y };

    const candidates = [];

    // 候选 1：起点端头沿切线向外紧贴延伸 6px
    const p0 = points[0];
    const p1 = points[1];
    const d01 = Math.hypot(p0.x - p1.x, p0.y - p1.y) || 1;
    const tan0 = { x: (p0.x - p1.x) / d01, y: (p0.y - p1.y) / d01 };
    candidates.push({ x: p0.x + tan0.x * offset, y: p0.y + tan0.y * offset });

    // 候选 2：终点端头沿切线向外紧贴延伸 6px
    const pm = points[points.length - 1];
    const pm1 = points[points.length - 2];
    const dmm = Math.hypot(pm.x - pm1.x, pm.y - pm1.y) || 1;
    const tanM = { x: (pm.x - pm1.x) / dmm, y: (pm.y - pm1.y) / dmm };
    candidates.push({ x: pm.x + tanM.x * offset, y: pm.y + tanM.y * offset });

    // 候选 3 & 4：中点外侧法线贴紧 8px (开槽宽度6，半径3，因此推8刚好位于轮廓外 2px)
    const midIdx = Math.floor(points.length / 2);
    const pMid = points[midIdx];
    const pPrev = points[Math.max(0, midIdx - 1)];
    const pNext = points[Math.min(points.length - 1, midIdx + 1)];
    const dx = pNext.x - pPrev.x;
    const dy = pNext.y - pPrev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    candidates.push({ x: pMid.x + nx * 8.5, y: pMid.y + ny * 8.5 });
    candidates.push({ x: pMid.x - nx * 8.5, y: pMid.y - ny * 8.5 });

    // 筛选位于安全半径内且与折线保持紧贴 (距离 5.0 ~ 9.5px) 的最佳候选点
    for (const cand of candidates) {
      const r = Math.hypot(cand.x, cand.y);
      if (r < 24 || r > maxRadius) continue;

      let minDist = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        const d = Math.sqrt(this.distSqPointToSegment(cand, points[i], points[i + 1]));
        if (d < minDist) minDist = d;
      }

      if (minDist >= 4.8 && minDist <= 9.5) {
        return cand;
      }
    }

    // 兜底：取第一个端头候选点
    const fallback = candidates[0];
    const r = Math.hypot(fallback.x, fallback.y) || 1;
    const clampedR = Math.max(26, Math.min(maxRadius, r));
    return { x: (fallback.x / r) * clampedR, y: (fallback.y / r) * clampedR };
  }
};
