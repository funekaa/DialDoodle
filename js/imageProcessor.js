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
  traceImageToStrokes(img, bounds, report = null) {
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

    if (report) report(45, '正在检测实心五官眼睛与斑点...');

    // 2. 实心眼睛/斑点智能识别器 (解决实心黑眼珠被细化骨架算法过度剥蚀吃掉的问题)
    const solidVisited = new Uint8Array(targetW * targetH);
    const getIdx = (x, y) => y * targetW + x;
    let rawStrokes = [];

    for (let y = 1; y < targetH - 1; y++) {
      for (let x = 1; x < targetW - 1; x++) {
        const idx = getIdx(x, y);
        if (binary[idx] === 1 && !solidVisited[idx]) {
          // BFS 探测连通域
          const queue = [idx];
          solidVisited[idx] = 1;
          const compIndices = [idx];
          let minX = x, maxX = x, minY = y, maxY = y;

          let qHead = 0;
          while (qHead < queue.length) {
            const curIdx = queue[qHead++];
            const cy = Math.floor(curIdx / targetW);
            const cx = curIdx % targetW;

            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;

            const nbs = [
              curIdx - 1, curIdx + 1,
              curIdx - targetW, curIdx + targetW
            ];
            for (const nIdx of nbs) {
              if (nIdx >= 0 && nIdx < binary.length && binary[nIdx] === 1 && !solidVisited[nIdx]) {
                solidVisited[nIdx] = 1;
                queue.push(nIdx);
                compIndices.push(nIdx);
              }
            }
          }

          const compW = maxX - minX + 1;
          const compH = maxY - minY + 1;
          const count = compIndices.length;
          const ratio = compW / compH;

          // 独立实心眼球/鼻孔斑点特征判定 (面积 15~1800px, 宽高在 4~60px 之间，长宽比饱满 0.35~2.8)
          if (count >= 15 && count <= 1800 && compW >= 4 && compW <= 60 && compH >= 4 && compH <= 60 && ratio >= 0.35 && ratio <= 2.8) {
            const eyeCx = (minX + maxX) / 2;
            const eyeCy = (minY + maxY) / 2;
            const rx = Math.max(3.0, compW / 2);
            const ry = Math.max(3.0, compH / 2);

            // 生成眼睛圆圈/椭圆笔画 (16 点圆周)，后续自然转为开口 C 形槽，完美保留生动圆眼睛！
            const eyeStroke = [];
            for (let deg = 0; deg < 360; deg += 22.5) {
              const rad = (deg * Math.PI) / 180;
              eyeStroke.push({
                x: eyeCx + rx * Math.cos(rad),
                y: eyeCy + ry * Math.sin(rad)
              });
            }
            rawStrokes.push(eyeStroke);

            // 从二值图中清除该实心眼球，避免骨架化算法产生孤立碎屑
            compIndices.forEach(pIdx => {
              binary[pIdx] = 0;
            });
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

    // 4. 自然平滑连接相邻同向碎片笔画 (端点距离 <= 7px 且切向夹角 <= 40度)
    rawStrokes = this.mergeAdjacentSmoothStrokes(rawStrokes, 7.0, 40);

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

    while (changing && count < 16) {
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
    let list = strokes.map(s => [...s]);
    let merged = true;

    while (merged) {
      merged = false;
      for (let i = 0; i < list.length; i++) {
        for (let j = 0; j < list.length; j++) {
          if (i === j) continue;
          const s1 = list[i];
          const s2 = list[j];
          if (!s1 || !s2 || s1.length < 2 || s2.length < 2) continue;

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
  }
};
