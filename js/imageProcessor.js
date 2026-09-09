/**
 * 图片上传与线稿笔画提取模块 (高精度骨架化与重复划线消除)
 */

import { Geometry } from './core/geometry.js';

export const ImageProcessor = {
  /**
   * 将用户上传的图片文件转换为适合圆盘上方的折线笔画
   * @param {File} file 图像文件
   * @param {Object} bounds 目标区域
   * @param {Function} onProgress 进度回调函数 (percent, text)
   * @returns {Promise<Array<Array<{x,y}>>>} 提取的笔画集合
   */
  processImageFile(file, bounds = { cx: 0, cy: -82, width: 152, height: 132 }, onProgress = null) {
    return new Promise((resolve, reject) => {
      const report = (pct, msg) => {
        if (typeof onProgress === 'function') onProgress(pct, msg);
      };

      report(15, '正在读取图像文件...');
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            report(35, '正在分析图像色彩与二值化...');
            setTimeout(() => {
              try {
                const strokes = this.traceImageToStrokes(img, bounds, report);
                resolve(strokes);
              } catch (err) {
                reject(err);
              }
            }, 30);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('图像文件解码失败'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  },

  /**
   * 解析图像像素，提取单中心线骨架并去除重复划线
   */
  traceImageToStrokes(img, bounds = { cx: 0, cy: -82, width: 152, height: 132 }, report = null) {
    const canvas = document.createElement('canvas');
    // 分辨率提升至 480px，彻底避免嘴尖细缝被降采样粘连融化
    const targetW = Math.max(460, Math.min(600, img.width || 460));
    const targetH = Math.round((img.height / img.width) * targetW);
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;

    // 1. 灰度化与智能二值化
    const gray = new Uint8Array(targetW * targetH);
    let totalLum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const idx = i / 4;
      gray[idx] = lum;
      totalLum += lum;
    }
    const avgLum = totalLum / (targetW * targetH);
    const threshold = Math.max(80, Math.min(225, avgLum * 0.90));

    const binary = new Uint8Array(targetW * targetH);
    for (let i = 0; i < gray.length; i++) {
      binary[i] = gray[i] < threshold ? 1 : 0;
    }

    if (report) report(45, '正在高精度识别实心眼珠与五官特征...');

    // 2. 实心特征高保真识别器 (精准提取实心眼睛小黑点与圆纽扣)
    // 闭合空心圆圈由下文骨架细化统一提取单中心线，杜绝任何双层重复画线
    const getIdx = (x, y) => y * targetW + x;
    let rawStrokes = [];

    // 探测真正的实心黑圆斑/实心眼珠 (例如小鸟眼珠、动物瞳孔)
    const solidVisited = new Uint8Array(targetW * targetH);
    for (let y = 1; y < targetH - 1; y++) {
      for (let x = 1; x < targetW - 1; x++) {
        const idx = getIdx(x, y);
        if (binary[idx] === 1 && !solidVisited[idx]) {
          const queue = [idx];
          solidVisited[idx] = 1;
          const comp = [idx];
          let minX = x, maxX = x, minY = y, maxY = y;

          let qHead = 0;
          while (qHead < queue.length) {
            const cur = queue[qHead++];
            const cy = Math.floor(cur / targetW);
            const cx = cur % targetW;
            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;

            const nbs = [cur - 1, cur + 1, cur - targetW, cur + targetW];
            for (const n of nbs) {
              if (n >= 0 && n < binary.length && binary[n] === 1 && !solidVisited[n]) {
                solidVisited[n] = 1;
                queue.push(n);
                comp.push(n);
              }
            }
          }

          const compW = maxX - minX + 1;
          const compH = maxY - minY + 1;
          const count = comp.length;
          const ratio = compW / compH;

          // 仅当填充饱满无孔时才视为实心斑点
          if (count >= 15 && count <= 1200 && compW <= 40 && compH <= 40 && ratio >= 0.65 && ratio <= 1.50) {
            const fillRatio = count / (compW * compH);
            if (fillRatio >= 0.58) {
              let sumX = 0, sumY = 0;
              comp.forEach(p => {
                sumX += p % targetW;
                sumY += Math.floor(p / targetW);
              });
              const cx = sumX / count;
              const cy = sumY / count;
              const r = Math.sqrt(count / Math.PI);

              const dot = [];
              const segs = 24;
              for (let s = 0; s <= segs; s++) {
                const a = (s * 2 * Math.PI) / segs;
                dot.push({
                  x: cx + r * Math.cos(a),
                  y: cy + r * Math.sin(a)
                });
              }
              dot.isHole = true;
              dot.isCircle = false;
              dot.center = { x: cx, y: cy };
              dot.radius = r;
              rawStrokes.push(dot);

              comp.forEach(p => { binary[p] = 0; });
            }
          }
        }
      }
    }

    if (report) report(60, '正在提取高保真单中心线骨架 (保全嘴缝与精细特征)...');

    // 3. 细化骨架化 (Zhang-Suen Thinning)，将线稿压缩为 1 像素中心线
    const skeleton = this.thinningZhangSuen(binary, targetW, targetH);

    if (report) report(75, '正在连贯追踪长线条与五官...');

    // 4. 连贯追踪骨架中心线
    const visited = new Uint8Array(targetW * targetH);

    const neighbors = [
      { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 },
      { dx: -1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }
    ];

    // 优先从端点（度为 1）与分支节点（度 >= 3）开始追踪
    const endpoints = [];
    const junctions = [];
    const others = [];

    for (let y = 1; y < targetH - 1; y++) {
      for (let x = 1; x < targetW - 1; x++) {
        const idx = getIdx(x, y);
        if (skeleton[idx] === 1) {
          let deg = 0;
          for (const n of neighbors) {
            if (skeleton[getIdx(x + n.dx, y + n.dy)] === 1) deg++;
          }
          if (deg === 1) {
            endpoints.push({ x, y, idx });
          } else if (deg >= 3) {
            junctions.push({ x, y, idx });
          } else {
            others.push({ x, y, idx });
          }
        }
      }
    }

    const startPoints = [...endpoints, ...junctions, ...others];

    for (const sp of startPoints) {
      if (visited[sp.idx]) continue;

      const current = [];
      let cx = sp.x, cy = sp.y;
      current.push({ x: cx, y: cy });
      visited[sp.idx] = 1;

      let found = true;
      while (found) {
        found = false;
        for (const n of neighbors) {
          const nx = cx + n.dx;
          const ny = cy + n.dy;
          if (nx >= 0 && nx < targetW && ny >= 0 && ny < targetH) {
            const nIdx = getIdx(nx, ny);
            if (skeleton[nIdx] === 1 && !visited[nIdx]) {
              visited[nIdx] = 1;
              cx = nx;
              cy = ny;
              current.push({ x: cx, y: cy });
              found = true;
              break;
            }
          }
        }
      }

      // 仅过滤微小极短杂点 (长度 >= 3.0px 且点数 >= 3)
      if (current.length >= 3) {
        const len = Geometry.pathLength(current);
        if (len >= 3.0) {
          rawStrokes.push(current);
        }
      }
    }

    if (rawStrokes.length === 0) {
      throw new Error('未在图片中检测到清晰的线条轮廓，请上传黑白分明的简笔画图片。');
    }

    // 4. 自然平滑连接相邻同向碎片笔画 (避开独立圆圈与打孔)
    const cloneList = rawStrokes.map(s => {
      const copy = [...s];
      if (s.isCircle) copy.isCircle = true;
      if (s.isHole) copy.isHole = true;
      if (s.center) copy.center = { ...s.center };
      if (s.radius) copy.radius = s.radius;
      return copy;
    });
    const nonCircles = cloneList.filter(s => !s.isCircle && !s.isHole);
    const circlesAndHoles = cloneList.filter(s => s.isCircle || s.isHole);
    const mergedNonCircles = this.mergeAdjacentSmoothStrokes(nonCircles, 7.0, 40);
    // 5. 严格几何去重：杜绝任何重合、嵌套、同心多层画线
    rawStrokes = this.deduplicateStrokes([...circlesAndHoles, ...mergedNonCircles]);

    if (report) report(90, '正在适配转盘几何尺寸...');

    // 6. 坐标归一化并映射到目标圆心上方区域 bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    rawStrokes.forEach(st => {
      st.forEach(pt => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });
    });

    const srcW = Math.max(1, maxX - minX);
    const srcH = Math.max(1, maxY - minY);
    const scale = Math.min(bounds.width / srcW, bounds.height / srcH);
    const srcCenterX = (minX + maxX) / 2;
    const srcCenterY = (minY + maxY) / 2;

    const finalStrokes = rawStrokes.map(stroke => {
      const mapped = stroke.map(pt => ({
        x: bounds.cx + (pt.x - srcCenterX) * scale,
        y: bounds.cy + (pt.y - srcCenterY) * scale
      }));
      if (stroke.isHole) {
        mapped.isHole = true;
        if (stroke.radius) mapped.radius = stroke.radius * scale;
        if (stroke.center) {
          mapped.center = {
            x: bounds.cx + (stroke.center.x - srcCenterX) * scale,
            y: bounds.cy + (stroke.center.y - srcCenterY) * scale
          };
        }
        return mapped;
      }
      if (stroke.isCircle) {
        mapped.isCircle = true;
        if (stroke.radius) mapped.radius = stroke.radius * scale;
        if (stroke.center) {
          mapped.center = {
            x: bounds.cx + (stroke.center.x - srcCenterX) * scale,
            y: bounds.cy + (stroke.center.y - srcCenterY) * scale
          };
        }
        return mapped; // 保持数学圆平滑度，避免重采样导致多边形失真
      }
      return Geometry.resamplePath(mapped, 3.5);
    });

    if (report) report(100, '线稿提取完毕，正在计算开槽排布...');
    return finalStrokes;
  },

  /**
   * Zhang-Suen 细化骨架算法
   */
  thinningZhangSuen(binary, width, height) {
    let count = 0;
    let changing = true;
    const grid = new Uint8Array(binary);

    const getPixel = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return 0;
      return grid[y * width + x];
    };

    while (changing && count < 24) {
      changing = false;
      count++;
      const toWhite = [];

      // Step 1
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const p1 = grid[y * width + x];
          if (p1 === 0) continue;

          const p2 = getPixel(x, y - 1);
          const p3 = getPixel(x + 1, y - 1);
          const p4 = getPixel(x + 1, y);
          const p5 = getPixel(x + 1, y + 1);
          const p6 = getPixel(x, y + 1);
          const p7 = getPixel(x - 1, y + 1);
          const p8 = getPixel(x - 1, y);
          const p9 = getPixel(x - 1, y - 1);

          const neighbors = [p2, p3, p4, p5, p6, p7, p8, p9];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;

          let A = 0;
          for (let i = 0; i < 8; i++) {
            if (neighbors[i] === 0 && neighbors[(i + 1) % 8] === 1) A++;
          }
          if (A !== 1) continue;

          if (p2 * p4 * p6 !== 0) continue;
          if (p4 * p6 * p8 !== 0) continue;

          toWhite.push(y * width + x);
          changing = true;
        }
      }
      for (let i = 0; i < toWhite.length; i++) grid[toWhite[i]] = 0;

      // Step 2
      toWhite.length = 0;
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const p1 = grid[y * width + x];
          if (p1 === 0) continue;

          const p2 = getPixel(x, y - 1);
          const p3 = getPixel(x + 1, y - 1);
          const p4 = getPixel(x + 1, y);
          const p5 = getPixel(x + 1, y + 1);
          const p6 = getPixel(x, y + 1);
          const p7 = getPixel(x - 1, y + 1);
          const p8 = getPixel(x - 1, y);
          const p9 = getPixel(x - 1, y - 1);

          const neighbors = [p2, p3, p4, p5, p6, p7, p8, p9];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;

          let A = 0;
          for (let i = 0; i < 8; i++) {
            if (neighbors[i] === 0 && neighbors[(i + 1) % 8] === 1) A++;
          }
          if (A !== 1) continue;

          if (p2 * p4 * p8 !== 0) continue;
          if (p2 * p6 * p8 !== 0) continue;

          toWhite.push(y * width + x);
          changing = true;
        }
      }
      for (let i = 0; i < toWhite.length; i++) grid[toWhite[i]] = 0;
    }

    return grid;
  },

  /**
   * 将邻近平滑同向的碎片线段合并成长线条，杜绝零碎
   */
  mergeAdjacentSmoothStrokes(strokes, maxGap = 6.0, maxAngle = 35) {
    if (!strokes || strokes.length < 2) return strokes || [];
    let list = strokes.map(s => {
      const copy = [...s];
      if (s.isCircle) copy.isCircle = true;
      if (s.isHole) copy.isHole = true;
      if (s.center) copy.center = { ...s.center };
      if (s.radius) copy.radius = s.radius;
      return copy;
    });
    let merged = true;

    while (merged) {
      merged = false;
      for (let i = 0; i < list.length; i++) {
        for (let j = 0; j < list.length; j++) {
          if (i === j) continue;
          const s1 = list[i];
          const s2 = list[j];
          if (!s1 || !s2 || s1.length < 2 || s2.length < 2) continue;
          if (s1.isCircle || s2.isCircle || s1.isHole || s2.isHole) continue;

          const p1Tail = s1[s1.length - 1];
          const p1PreTail = s1[s1.length - 2];
          const p2Head = s2[0];
          const p2PostHead = s2[1];

          if (Geometry.dist(p1Tail, p2Head) <= maxGap) {
            const turn = Geometry.computeTurnAngle(p1PreTail, p2Head, p2PostHead);
            if (turn <= maxAngle) {
              const cand = [...s1, ...s2];
              if (!Geometry.isPathSelfIntersecting(cand)) {
                list.splice(Math.max(i, j), 1);
                list.splice(Math.min(i, j), 1, cand);
                merged = true;
                break;
              }
            }
          }
        }
        if (merged) break;
      }
    }
    return list;
  },

  /**
   * 折线与圆孔笔画几何去重，杜绝任何重合、嵌套、同心多层画线
   */
  deduplicateStrokes(strokes) {
    if (!strokes || strokes.length < 2) return strokes || [];
    const isRedundant = new Uint8Array(strokes.length);

    for (let i = 0; i < strokes.length; i++) {
      if (isRedundant[i]) continue;
      const s1 = strokes[i];
      if (!s1 || s1.length < 2) continue;

      for (let j = i + 1; j < strokes.length; j++) {
        if (isRedundant[j]) continue;
        const s2 = strokes[j];
        if (!s2 || s2.length < 2) continue;

        // 1. 如果都是打孔点，且圆心极度贴近，去重
        if (s1.isHole && s2.isHole) {
          const dCenter = Math.hypot((s1.center?.x || 0) - (s2.center?.x || 0), (s1.center?.y || 0) - (s2.center?.y || 0));
          if (dCenter < 3.5) {
            isRedundant[j] = 1;
            continue;
          }
        }

        // 2. 如果一个是打孔点，另一个是普通折线，且折线所有点都落在打孔圆范围内
        if (s1.isHole !== s2.isHole) {
          const hole = s1.isHole ? s1 : s2;
          const line = s1.isHole ? s2 : s1;
          const redundantIdx = s1.isHole ? j : i;
          if (hole.center) {
            let allInside = true;
            for (const pt of line) {
              if (Math.hypot(pt.x - hole.center.x, pt.y - hole.center.y) > (hole.radius || 4.0) + 2.5) {
                allInside = false;
                break;
              }
            }
            if (allInside) {
              isRedundant[redundantIdx] = 1;
              if (redundantIdx === i) break;
              continue;
            }
          }
        }

        // 3. 两个普通折线：检查投影距离与几何重叠度
        const len1 = Geometry.pathLength(s1);
        const len2 = Geometry.pathLength(s2);
        if (len1 < 1.0 || len2 < 1.0) continue;

        const sampleDist = (fromPath, toPath) => {
          let sumDist = 0;
          let maxDist = 0;
          const sampleCount = Math.min(fromPath.length, 12);
          const step = Math.max(1, Math.floor(fromPath.length / sampleCount));
          let count = 0;
          for (let k = 0; k < fromPath.length; k += step) {
            const p = fromPath[k];
            let minDist = Infinity;
            for (let m = 0; m < toPath.length - 1; m++) {
              const d = Geometry.distToSegment(p, toPath[m], toPath[m + 1]);
              if (d < minDist) minDist = d;
            }
            sumDist += minDist;
            if (minDist > maxDist) maxDist = minDist;
            count++;
          }
          return { avg: sumDist / count, max: maxDist };
        };

        const d1to2 = sampleDist(s1, s2);
        const d2to1 = sampleDist(s2, s1);

        // 若双向平均距离 < 2.0px 且最大距离 < 4.0px，说明两者为同一线条的重复画线
        if (d1to2.avg < 2.0 && d2to1.avg < 2.0 && d1to2.max < 4.0 && d2to1.max < 4.0) {
          if (len1 >= len2) {
            isRedundant[j] = 1;
          } else {
            isRedundant[i] = 1;
            break;
          }
        }
      }
    }

    const filtered = [];
    for (let i = 0; i < strokes.length; i++) {
      if (!isRedundant[i]) filtered.push(strokes[i]);
    }
    return filtered;
  }
};
