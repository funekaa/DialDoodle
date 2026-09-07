/**
 * 图片上传与线稿笔画提取模块
 */

import { Geometry } from './core/geometry.js';

export const ImageProcessor = {
  /**
   * 将用户上传的图片文件转换为适合圆盘上方的折线笔画
   * @param {File} file 图像文件
   * @param {Object} bounds 目标区域 { cx: 0, cy: -95, width: 140, height: 120 }
   * @returns {Promise<Array<Array<{x,y}>>>} 提取的笔画集合
   */
  processImageFile(file, bounds = { cx: 0, cy: -95, width: 140, height: 120 }) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            const strokes = this.traceImageToStrokes(img, bounds);
            resolve(strokes);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /**
   * 解析图像像素，提取边缘轮廓线段
   */
  traceImageToStrokes(img, bounds) {
    const canvas = document.createElement('canvas');
    const targetW = 200;
    const targetH = Math.round((img.height / img.width) * targetW);
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;

    // 1. 灰度化与二值化 (边缘寻找)
    const gray = new Uint8Array(targetW * targetH);
    let totalLum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const idx = i / 4;
      gray[idx] = lum;
      totalLum += lum;
    }
    const avgLum = totalLum / (targetW * targetH);
    const threshold = Math.max(80, Math.min(200, avgLum * 0.85));

    // 2. 标记暗色笔画点 (二值化)
    const binary = new Uint8Array(targetW * targetH);
    for (let i = 0; i < gray.length; i++) {
      binary[i] = gray[i] < threshold ? 1 : 0;
    }

    // 3. 简单的轮廓线段追踪（扫描相邻黑色边缘点）
    const visited = new Uint8Array(targetW * targetH);
    const rawStrokes = [];

    const getIdx = (x, y) => y * targetW + x;

    for (let y = 1; y < targetH - 1; y += 2) {
      for (let x = 1; x < targetW - 1; x += 2) {
        const idx = getIdx(x, y);
        if (binary[idx] === 1 && !visited[idx]) {
          // 开始追踪一段笔画
          const currentStroke = [];
          let cx = x, cy = y;
          currentStroke.push({ x: cx, y: cy });
          visited[idx] = 1;

          let foundNext = true;
          let steps = 0;
          while (foundNext && steps < 80) {
            foundNext = false;
            steps++;
            // 搜索 8 邻域
            const neighbors = [
              { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 },
              { dx: -1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }
            ];

            for (const n of neighbors) {
              const nx = cx + n.dx;
              const ny = cy + n.dy;
              if (nx >= 0 && nx < targetW && ny >= 0 && ny < targetH) {
                const nIdx = getIdx(nx, ny);
                if (binary[nIdx] === 1 && !visited[nIdx]) {
                  visited[nIdx] = 1;
                  cx = nx;
                  cy = ny;
                  currentStroke.push({ x: cx, y: cy });
                  foundNext = true;
                  break;
                }
              }
            }
          }

          if (currentStroke.length >= 4) {
            rawStrokes.push(currentStroke);
          }
        }
      }
    }

    if (rawStrokes.length === 0) {
      throw new Error('未在图片中检测到清晰的线条轮廓，请使用线条明显的简笔画图片。');
    }

    // 4. 坐标归一化并映射到目标圆心上方区域 bounds
    // 计算原始 bounding box
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
      // 平滑重采样
      return Geometry.resamplePath(mapped, 5);
    });

    return finalStrokes;
  }
};
