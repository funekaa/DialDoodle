/**
 * 旋转解密绘图盘 - 交互式模拟器 (Simulator)
 * 支持拖拽旋转、刻度磁吸、划线模拟、自动解密演示与移开图纸揭晓动画
 */

import { Geometry } from './core/geometry.js';

export const Simulator = {
  canvas: null,
  ctx: null,
  options: {},
  processedData: null, // { ticks, tickGroups }
  currentRotationDeg: 0, // B 纸当前顺时针旋转角度
  isDragging: false,
  startDragAngle: 0,
  startDiskRotation: 0,
  drawnStrokesOnA: [], // 已在 A 纸上留下的笔迹集合 [{stroke, color}]
  completedTicks: new Set(), // 已经完成划线的刻度 ID 集合
  bPaperOffset: { x: 0, y: 0 }, // 移开 B 纸时的平移偏移量
  isBPaperRemoved: false,
  autoPlaying: false,
  autoTimer: null,
  onTickChangeCallback: null,

  init(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = {
      diskRadius: 180,
      center: { x: canvas.width / 2, y: canvas.height / 2 },
      penColor: '#2563EB', // 宝蓝色墨水
      penWidth: 3,
      ...options
    };

    this.bindEvents();
    this.render();
  },

  setData(processedData) {
    this.processedData = processedData;
    this.currentRotationDeg = 0;
    this.drawnStrokesOnA = [];
    this.completedTicks = new Set();
    this.bPaperOffset = { x: 0, y: 0 };
    this.isBPaperRemoved = false;
    this.stopAutoPlay();
    this.render();
  },

  bindEvents() {
    const cvs = this.canvas;

    // 鼠标/触控事件监听（考虑 CSS 响应式缩放）
    const getAngleFromEvent = (e) => {
      const rect = cvs.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const scaleX = rect.width / cvs.width;
      const scaleY = rect.height / cvs.height;
      const realCenterX = rect.left + this.options.center.x * scaleX;
      const realCenterY = rect.top + this.options.center.y * scaleY;
      const x = clientX - realCenterX;
      const y = clientY - realCenterY;
      return (Math.atan2(y, x) * 180) / Math.PI;
    };

    const onStart = (e) => {
      if (this.autoPlaying || this.isBPaperRemoved) return;
      this.isDragging = true;
      this.startDragAngle = getAngleFromEvent(e);
      this.startDiskRotation = this.currentRotationDeg;
      if (e.type === 'touchstart') e.preventDefault();
    };

    const onMove = (e) => {
      if (!this.isDragging || this.autoPlaying) return;
      const currentAngle = getAngleFromEvent(e);
      let delta = currentAngle - this.startDragAngle;
      let newRot = (this.startDiskRotation + delta) % 360;
      if (newRot < 0) newRot += 360;

      // 智能磁吸检测
      const activeTick = this.getClosestTickAtTop(newRot);
      if (activeTick && Math.abs(activeTick.diff) < 3.5) {
        newRot = activeTick.snapAngle;
      }

      this.currentRotationDeg = newRot;
      this.render();
      if (this.onTickChangeCallback) {
        this.onTickChangeCallback(this.getCurrentActiveTick());
      }
    };

    const onEnd = () => {
      this.isDragging = false;
    };

    cvs.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    cvs.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  },

  /**
   * 计算当前最靠近正上方（-90度方向，即 A 纸基准线）的刻度
   */
  getClosestTickAtTop(diskRotDeg = this.currentRotationDeg) {
    if (!this.processedData || !this.processedData.ticks) return null;

    // 当 B 纸旋转了 diskRotDeg 时，刻度 k 位于圆周上的物理空间角度为:
    // physicalAngle = (tick.angleDeg + diskRotDeg) % 360 (以正上方为 0 度顺时针)
    // 正上方为 0 度 (或者 360 度)
    let closest = null;
    let minDiff = Infinity;

    this.processedData.ticks.forEach(tick => {
      const currentPos = (tick.angleDeg + diskRotDeg) % 360;
      let diff = currentPos;
      if (diff > 180) diff -= 360; // 范围 [-180, 180]

      if (Math.abs(diff) < Math.abs(minDiff)) {
        minDiff = diff;
        // 若要对齐 0 度，diskRotDeg 应该减去 diff
        let snapAngle = (diskRotDeg - diff + 360) % 360;
        closest = {
          tick,
          diff,
          snapAngle
        };
      }
    });

    return closest;
  },

  /**
   * 获取当前正对准正上方指示线的刻度（对准容差 <= 4度）
   */
  getCurrentActiveTick() {
    const closest = this.getClosestTickAtTop();
    if (closest && Math.abs(closest.diff) <= 4.5) {
      return closest.tick;
    }
    return null;
  },

  /**
   * 旋转到指定刻度
   */
  rotateToTick(tickId, smooth = true) {
    if (!this.processedData) return;
    const tick = this.processedData.ticks.find(t => t.id === tickId);
    if (!tick) return;

    // 为了让 tick.angleDeg 对准正上方 (0 度)，需要的圆盘旋转角度为:
    const targetRot = (360 - tick.angleDeg) % 360;

    if (!smooth) {
      this.currentRotationDeg = targetRot;
      this.render();
      if (this.onTickChangeCallback) this.onTickChangeCallback(tick);
      return Promise.resolve();
    }

    return new Promise(resolve => {
      const startRot = this.currentRotationDeg;
      let delta = (targetRot - startRot) % 360;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;

      const duration = 400; // ms
      const startTime = performance.now();

      const animate = (now) => {
        const elapsed = now - startTime;
        const p = Math.min(1, elapsed / duration);
        // easeInOutQuad
        const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
        this.currentRotationDeg = (startRot + delta * ease + 360) % 360;
        this.render();

        if (p < 1) {
          requestAnimationFrame(animate);
        } else {
          this.currentRotationDeg = targetRot;
          this.render();
          if (this.onTickChangeCallback) this.onTickChangeCallback(tick);
          resolve();
        }
      };
      requestAnimationFrame(animate);
    });
  },

  /**
   * 在当前对准的刻度开槽中画线
   */
  drawCurrentTickStroke() {
    const activeTick = this.getCurrentActiveTick();
    if (!activeTick || !this.processedData) return false;

    if (this.completedTicks.has(activeTick.id)) {
      return true; // 已经画过了
    }

    const group = this.processedData.tickGroups.find(g => g.tickId === activeTick.id);
    if (!group) return false;

    // 将这些 strokes 写入 A 纸笔迹
    group.targetStrokes.forEach(st => {
      if (st.isHole) {
        this.drawnStrokesOnA.push({
          isHole: true,
          center: st.center || {
            x: st.reduce((acc, p) => acc + p.x, 0) / st.length,
            y: st.reduce((acc, p) => acc + p.y, 0) / st.length
          },
          radius: st.radius || 7.0,
          color: this.options.penColor,
          tickId: activeTick.id
        });
      } else {
        this.drawnStrokesOnA.push({
          isHole: false,
          isCircle: !!st.isCircle,
          points: st,
          color: this.options.penColor,
          tickId: activeTick.id
        });
      }
    });

    this.completedTicks.add(activeTick.id);
    this.render();
    return true;
  },

  /**
   * 一键画完所有线条
   */
  drawAllStrokes() {
    if (!this.processedData) return;
    this.drawnStrokesOnA = [];
    this.completedTicks.clear();

    this.processedData.tickGroups.forEach(group => {
      this.completedTicks.add(group.tickId);
      group.targetStrokes.forEach(st => {
        if (st.isHole) {
          this.drawnStrokesOnA.push({
            isHole: true,
            center: st.center || {
              x: st.reduce((acc, p) => acc + p.x, 0) / st.length,
              y: st.reduce((acc, p) => acc + p.y, 0) / st.length
            },
            radius: st.radius || 7.0,
            color: this.options.penColor,
            tickId: group.tickId
          });
        } else {
          this.drawnStrokesOnA.push({
            isHole: false,
            isCircle: !!st.isCircle,
            points: st,
            color: this.options.penColor,
            tickId: group.tickId
          });
        }
      });
    });

    this.render();
  },

  /**
   * 清空 A 纸上的所有画线
   */
  clearDrawing() {
    this.drawnStrokesOnA = [];
    this.completedTicks.clear();
    this.render();
  },

  /**
   * 自动连续演示模式 (转动 -> 画线 -> 转动 -> 画线 ... -> 移开 B 纸)
   */
  async startAutoPlay(onProgress) {
    if (!this.processedData || this.autoPlaying) return;
    this.autoPlaying = true;
    this.isBPaperRemoved = false;
    this.bPaperOffset = { x: 0, y: 0 };
    this.drawnStrokesOnA = [];
    this.completedTicks.clear();

    const ticks = this.processedData.ticks;
    for (let i = 0; i < ticks.length; i++) {
      if (!this.autoPlaying) break;
      const t = ticks[i];
      if (onProgress) onProgress(i + 1, ticks.length, 'rotating');
      await this.rotateToTick(t.id, true);
      await new Promise(r => setTimeout(r, 120));

      if (!this.autoPlaying) break;
      if (onProgress) onProgress(i + 1, ticks.length, 'drawing');
      this.drawCurrentTickStroke();
      await new Promise(r => setTimeout(r, 200));
    }

    if (this.autoPlaying) {
      if (onProgress) onProgress(ticks.length, ticks.length, 'revealing');
      await this.toggleRemoveBPaper(true);
      if (onProgress) onProgress(ticks.length, ticks.length, 'done');
      this.autoPlaying = false;
    }
  },

  stopAutoPlay() {
    this.autoPlaying = false;
  },

  /**
   * 移开 / 放回 B 纸（展示完整作品动效）
   */
  toggleRemoveBPaper(remove) {
    const shouldRemove = remove !== undefined ? remove : !this.isBPaperRemoved;
    return new Promise(resolve => {
      const startX = this.bPaperOffset.x;
      const targetX = shouldRemove ? this.canvas.width * 0.75 : 0;
      const duration = 450;
      const startTime = performance.now();

      const animate = (now) => {
        const elapsed = now - startTime;
        const p = Math.min(1, elapsed / duration);
        const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
        this.bPaperOffset.x = startX + (targetX - startX) * ease;
        this.render();

        if (p < 1) {
          requestAnimationFrame(animate);
        } else {
          this.bPaperOffset.x = targetX;
          this.isBPaperRemoved = shouldRemove;
          this.render();
          resolve();
        }
      };
      requestAnimationFrame(animate);
    });
  },

  /**
   * 核心渲染主循环
   */
  render() {
    const { ctx, canvas } = this;
    const { center, diskRadius } = this.options;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. 渲染底部 A 纸（画板底纸）
    this.renderAPaper(ctx, center, diskRadius);

    // 2. 渲染已划在 A 纸上的真实笔迹
    this.renderStrokesOnA(ctx, center);

    // 3. 渲染顶部的 A 纸正上方红色对齐指示标
    this.renderTopPointer(ctx, center, diskRadius);

    // 4. 渲染上层 B 纸（旋转圆盘）
    this.renderBPaper(ctx, center, diskRadius);
  },

  /**
   * 渲染 A 纸底纸
   */
  renderAPaper(ctx, center, radius) {
    // 纸张阴影与白色底面
    const padX = center.x - radius - 20;
    const padY = center.y - radius - 30;
    const padW = (radius + 20) * 2;
    const padH = (radius + 30) * 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(padX, padY, padW, padH);
    ctx.restore();

    // A 纸边框与网格细纹
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.strokeRect(padX, padY, padW, padH);

    // A 纸左上角标识
    ctx.fillStyle = '#94A3B8';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('A 纸 (底部画纸 - 固定不动)', padX + 12, padY + 22);

    // A 纸圆心定位十字标
    ctx.save();
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(center.x - 12, center.y);
    ctx.lineTo(center.x + 12, center.y);
    ctx.moveTo(center.x, center.y - 12);
    ctx.lineTo(center.x, center.y + 12);
    ctx.stroke();
    ctx.restore();
  },

  /**
   * 渲染正上方 12 点钟基准指示线 (A 纸上的指示线)
   */
  renderTopPointer(ctx, center, radius) {
    ctx.save();
    const topY = center.y - radius;

    // 绘制红色基准三角形和指示竖线
    ctx.fillStyle = '#EF4444';
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2.5;

    // 竖线从圆盘上方延伸到圆周
    ctx.beginPath();
    ctx.moveTo(center.x, topY - 26);
    ctx.lineTo(center.x, topY + 4);
    ctx.stroke();

    // 向下的三角形箭头
    ctx.beginPath();
    ctx.moveTo(center.x, topY + 6);
    ctx.lineTo(center.x - 7, topY - 8);
    ctx.lineTo(center.x + 7, topY - 8);
    ctx.closePath();
    ctx.fill();

    // 标签 "对齐基准线"
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#EF4444';
    ctx.fillText('▼ 指示线', center.x, topY - 32);

    ctx.restore();
  },

  /**
   * 渲染 A 纸上的墨水笔迹
   */
  renderStrokesOnA(ctx, center) {
    if (this.drawnStrokesOnA.length === 0) return;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    this.drawnStrokesOnA.forEach(item => {
      if (item.isHole && !item.isCircle) {
        ctx.fillStyle = item.color || this.options.penColor;
        ctx.beginPath();
        ctx.arc(item.center.x, item.center.y, item.radius, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      const pts = item.points;
      if (!pts || pts.length < 2) return;

      ctx.strokeStyle = item.color || this.options.penColor;
      ctx.lineWidth = this.options.penWidth || 3;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      if (item.isCircle) {
        ctx.closePath();
      }
      ctx.stroke();
    });

    ctx.restore();
  },

  /**
   * 渲染上层 B 纸（可旋转圆盘）
   */
  renderBPaper(ctx, center, radius) {
    const activeTick = this.getCurrentActiveTick();
    const offsetX = this.bPaperOffset.x;
    const offsetY = this.bPaperOffset.y;

    ctx.save();
    ctx.translate(center.x + offsetX, center.y + offsetY);

    // 移开 B 纸时的阴影加深
    if (offsetX > 0) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = 24;
    } else {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
      ctx.shadowBlur = 10;
    }

    // 1. 绘制 B 纸大圆盘（白色微透质感，让用户感受到上下两层纸）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(center.x + offsetX, center.y + offsetY);

    // 圆盘外圈精美边框
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 内圈细虚线
    ctx.strokeStyle = '#E2E8F0';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, radius - 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. 随圆盘旋转的元素 (顺时针旋转 currentRotationDeg)
    ctx.save();
    ctx.rotate(Geometry.degToRad(this.currentRotationDeg));

    // 绘制圆盘上的所有刻度与编号
    if (this.processedData && this.processedData.ticks) {
      this.processedData.ticks.forEach(tick => {
        const isAligned = activeTick && activeTick.id === tick.id;
        const isDone = this.completedTicks.has(tick.id);

        ctx.save();
        // 刻度角 (0在正上方，顺时针方向)
        ctx.rotate(Geometry.degToRad(tick.angleDeg - 90));

        // 刻度线 (精致精炼，长度做短一半)
        ctx.strokeStyle = isAligned ? '#EF4444' : (isDone ? '#10B981' : '#334155');
        ctx.lineWidth = isAligned ? 3.5 : 2;
        ctx.beginPath();
        ctx.moveTo(radius - 12, 0);
        ctx.lineTo(radius, 0);
        ctx.stroke();

        // 刻度序号文字 (对齐正上方时正向朝上)
        ctx.save();
        ctx.translate(radius - 24, 0);
        ctx.rotate(Math.PI / 2);
        ctx.font = isAligned ? 'bold 14px system-ui' : '12px system-ui';
        ctx.fillStyle = isAligned ? '#EF4444' : (isDone ? '#10B981' : '#1E293B');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tick.id.toString(), 0, 0);
        ctx.restore();

        ctx.restore();
      });

      // 3. 绘制圆盘上的所有镂空开槽 (Slots)
      this.processedData.tickGroups.forEach(group => {
        const isAligned = activeTick && (activeTick.id === group.tickId || activeTick.tickId === group.tickId);
        const isDone = this.completedTicks.has(group.tickId);

        group.diskSlots.forEach(slot => {
          if (slot.isHole) {
            // 绘制圆形开孔 (眼睛/实心五官特制大圆孔，支持打孔器直接打孔)
            const cx = slot.center.x;
            const cy = slot.center.y;
            const r = slot.radius;

            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);

            if (isAligned) {
              ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
              ctx.fill();
              ctx.strokeStyle = '#EF4444';
              ctx.lineWidth = 2.0;
            } else if (isDone) {
              ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
              ctx.fill();
              ctx.strokeStyle = '#10B981';
              ctx.lineWidth = 1.4;
            } else {
              ctx.fillStyle = 'rgba(241, 245, 249, 0.90)';
              ctx.fill();
              ctx.strokeStyle = '#64748B';
              ctx.lineWidth = 1.2;
            }
            ctx.stroke();
            ctx.restore();
          } else {
            // 绘制开槽轮廓（模拟开槽缝隙）
            if (slot.outline && slot.outline.length > 2) {
              ctx.beginPath();
              ctx.moveTo(slot.outline[0].x, slot.outline[0].y);
              for (let i = 1; i < slot.outline.length; i++) {
                ctx.lineTo(slot.outline[i].x, slot.outline[i].y);
              }
              ctx.closePath();

              // 镂空槽背景填充（深浅透明表示孔洞）
              if (isAligned) {
                ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
                ctx.fill();
                ctx.strokeStyle = '#EF4444';
                ctx.lineWidth = 1.8;
              } else if (isDone) {
                ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
                ctx.fill();
                ctx.strokeStyle = '#10B981';
                ctx.lineWidth = 1.2;
              } else {
                ctx.fillStyle = 'rgba(241, 245, 249, 0.85)';
                ctx.fill();
                ctx.strokeStyle = '#94A3B8';
                ctx.lineWidth = 1;
              }
              ctx.stroke();
            }

            // 槽中心指引线
            if (slot.centerLine && slot.centerLine.length >= 2) {
              ctx.beginPath();
              ctx.moveTo(slot.centerLine[0].x, slot.centerLine[0].y);
              for (let i = 1; i < slot.centerLine.length; i++) {
                ctx.lineTo(slot.centerLine[i].x, slot.centerLine[i].y);
              }
              ctx.strokeStyle = isAligned ? '#DC2626' : '#CBD5E1';
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }

          // 绘制开槽旁边的刻度编号 (纯数字，不带外圈；旋转对齐时自动正向朝上)
          if (slot.labelPos) {
            const lx = slot.labelPos.x;
            const ly = slot.labelPos.y;
            const tickAngleDeg = group.angleDeg !== undefined ? group.angleDeg : (this.processedData.ticks.find(t => t.id === slot.tickId)?.angleDeg || 0);

            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(Geometry.degToRad(tickAngleDeg));

            ctx.font = isAligned ? 'bold 10.5px Arial, sans-serif' : 'bold 8.5px Arial, sans-serif';
            ctx.fillStyle = isAligned ? '#DC2626' : (isDone ? '#059669' : '#475569');
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(slot.tickId.toString(), 0, 0);
            ctx.restore();
          }
        });
      });
    }

    ctx.restore(); // 结束圆盘旋转

    // 4. 圆心图钉孔与装饰
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 纸张标签
    ctx.fillStyle = '#64748B';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('B 纸 (转盘)', 0, 24);

    ctx.restore();
  }
};
