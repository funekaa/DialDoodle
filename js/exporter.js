/**
 * 旋转解密绘图盘 - 打印与图纸高清导出模块
 * 生成标准 A4 规格的 B 纸（旋转开槽盘）与 A 纸（底部基准纸）
 */

import { Geometry } from './core/geometry.js';

export const Exporter = {
  // A4 标准尺寸 (300 DPI: 2480 x 3508; 渲染预览使用 1240 x 1754 获得兼顾性能与极高清的画质)
  PAGE_WIDTH: 1240,
  PAGE_HEIGHT: 1754,

  /**
   * 生成 B 纸的高清 Canvas
   * @param {Object} processedData { ticks, tickGroups }
   * @param {Object} options { diskRadiusMm, slotWidth, showSlotId }
   */
  renderBPaperCanvas(processedData, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = this.PAGE_WIDTH;
    canvas.height = this.PAGE_HEIGHT;
    const ctx = canvas.getContext('2d');

    const centerX = this.PAGE_WIDTH / 2;
    // 圆心居中稍偏下，留出顶部操作说明
    const centerY = this.PAGE_HEIGHT * 0.52;
    // 圆盘半径（约为 A4 宽度的 40% ~ 42%，即直径约 190mm）
    const radius = 510;

    // 1. 纸张背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, this.PAGE_WIDTH, this.PAGE_HEIGHT);

    // 2. 页眉与标题
    this.drawHeader(ctx, 'DialDoodle · 转盘画 - B 纸 (旋转画纸)', '使用指南：剪下圆盘并镂空开槽；眼睛 4mm 圆孔直接开孔，旋转到对应刻度描线即可！');

    // 3. 绘制剪裁辅助线与小剪刀提示
    ctx.save();
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 剪刀剪切图标提示
    ctx.font = '22px system-ui';
    ctx.fillStyle = '#64748B';
    ctx.textAlign = 'center';
    ctx.fillText('✂ 沿外圈虚线剪下', centerX, centerY - radius - 15);
    ctx.restore();

    // 4. 转盘本体背景 (微灰底衬，方便裁剪)
    ctx.save();
    ctx.fillStyle = '#FAFAFA';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // 内刻度参考圆
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 45, 0, Math.PI * 2);
    ctx.stroke();

    // 5. 刻度线与刻度数字 (1 ~ N)
    if (processedData && processedData.ticks) {
      processedData.ticks.forEach(tick => {
        ctx.save();
        ctx.translate(centerX, centerY);
        // 角度（正上方为 0 度）
        ctx.rotate(Geometry.degToRad(tick.angleDeg - 90));

        // 粗实线刻度线 (精致短巧，长度做短一半)
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(radius - 20, 0);
        ctx.lineTo(radius, 0);
        ctx.stroke();

        // 刻度编号
        ctx.font = 'bold 26px Arial, sans-serif';
        ctx.fillStyle = '#0F172A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tick.id.toString(), radius - 44, 0);

        ctx.restore();
      });

      // 6. 绘制所有刻度打散后的开槽线 (Slots)
      const scale = radius / 180; // 从预览坐标系缩放到高清 A4 比例

      processedData.tickGroups.forEach(group => {
        group.diskSlots.forEach(slot => {
          if (slot.isHole) {
            const cx = slot.center.x * scale;
            const cy = slot.center.y * scale;
            const r = slot.radius * scale;

            ctx.save();
            ctx.translate(centerX, centerY);

            // 1. 圆孔浅灰底色提示
            ctx.fillStyle = '#F1F5F9';
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();

            // 2. 剪纸/打孔轮廓实线
            ctx.strokeStyle = '#1E293B';
            ctx.lineWidth = 2.2;
            ctx.stroke();
            ctx.restore();
          } else {
            // 开槽镂空多边形
            if (slot.outline && slot.outline.length > 2) {
              ctx.save();
              ctx.translate(centerX, centerY);

              ctx.beginPath();
              ctx.moveTo(slot.outline[0].x * scale, slot.outline[0].y * scale);
              for (let i = 1; i < slot.outline.length; i++) {
                ctx.lineTo(slot.outline[i].x * scale, slot.outline[i].y * scale);
              }
              ctx.closePath();

              // 槽内浅灰底色，提示可镂空
              ctx.fillStyle = '#F1F5F9';
              ctx.fill();

              // 细黑开槽切割轮廓线
              ctx.strokeStyle = '#334155';
              ctx.lineWidth = 2;
              ctx.stroke();

              ctx.restore();
            }

            // 槽中心画笔指引虚线
            if (slot.centerLine && slot.centerLine.length >= 2) {
              ctx.save();
              ctx.translate(centerX, centerY);
              ctx.beginPath();
              ctx.moveTo(slot.centerLine[0].x * scale, slot.centerLine[0].y * scale);
              for (let i = 1; i < slot.centerLine.length; i++) {
                ctx.lineTo(slot.centerLine[i].x * scale, slot.centerLine[i].y * scale);
              }
              ctx.strokeStyle = '#94A3B8';
              ctx.lineWidth = 1.5;
              ctx.setLineDash([6, 5]);
              ctx.stroke();
              ctx.restore();
            }
          }

          // 在开槽旁边清晰打印刻度编号微型徽标 (小巧精致，绝不压槽)
          if (slot.labelPos) {
            const lx = slot.labelPos.x * scale;
            const ly = slot.labelPos.y * scale;
            ctx.save();
            ctx.translate(centerX, centerY);

            // 白色小圆形底带清晰深灰边框
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(lx, ly, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // 刻度数字
            ctx.font = 'bold 12.5px Arial, sans-serif';
            ctx.fillStyle = '#0F172A';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(slot.tickId.toString(), lx, ly + 0.5);

            ctx.restore();
          }
        });
      });
    }

    // 7. 圆心图钉定位孔与十字线
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-25, 0); ctx.lineTo(25, 0);
    ctx.moveTo(0, -25); ctx.lineTo(0, 25);
    ctx.stroke();

    ctx.font = 'bold 16px system-ui';
    ctx.fillStyle = '#EF4444';
    ctx.textAlign = 'center';
    ctx.fillText('◎ 图钉中心', 0, 42);
    ctx.restore();

    // 8. 页脚提示
    this.drawFooter(ctx);

    return canvas;
  },

  /**
   * 生成 A 纸（底部画纸）的高清 Canvas
   */
  renderAPaperCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = this.PAGE_WIDTH;
    canvas.height = this.PAGE_HEIGHT;
    const ctx = canvas.getContext('2d');

    const centerX = this.PAGE_WIDTH / 2;
    const centerY = this.PAGE_HEIGHT * 0.52;
    const radius = 510;

    // 1. 纸张背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, this.PAGE_WIDTH, this.PAGE_HEIGHT);

    // 2. 页眉与标题
    this.drawHeader(ctx, '旋转解密绘图盘 - A 纸 (底部画纸)', '玩法：将 A 纸固定平放，把裁好的 B 纸用图钉固定在圆心，每次转动使刻度对齐正上方指示线，顺着开槽描线！');

    // 3. 浅灰外轮廓定位线（参考圆盘位置）
    ctx.save();
    ctx.strokeStyle = '#F1F5F9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 4. 关键：正上方 12 点钟基准指示线
    ctx.save();
    const topY = centerY - radius;

    // 绘制醒目的指示三角形与指示标
    ctx.fillStyle = '#DC2626';
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(centerX, topY - 60);
    ctx.lineTo(centerX, topY + 12);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX, topY + 16);
    ctx.lineTo(centerX - 16, topY - 16);
    ctx.lineTo(centerX + 16, topY - 16);
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼ 对准指示线 (基准线)', centerX, topY - 75);
    ctx.font = '20px system-ui';
    ctx.fillStyle = '#64748B';
    ctx.fillText('旋转 B 纸使各个刻度依次对齐此箭头', centerX, topY - 115);
    ctx.restore();

    // 5. 圆心十字对准标
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-35, 0); ctx.lineTo(35, 0);
    ctx.moveTo(0, -35); ctx.lineTo(0, 35);
    ctx.stroke();

    ctx.font = 'bold 18px system-ui';
    ctx.fillStyle = '#DC2626';
    ctx.textAlign = 'center';
    ctx.fillText('◎ 图钉穿刺固定点', 0, 50);
    ctx.restore();

    // 6. 作品揭秘签名卡片区（位于纸张底部）
    ctx.save();
    const cardY = this.PAGE_HEIGHT - 280;
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(160, cardY, this.PAGE_WIDTH - 320, 160);
    ctx.setLineDash([]);

    ctx.font = 'bold 24px system-ui';
    ctx.fillStyle = '#1E293B';
    ctx.fillText('🎨 旋转画作揭秘卡', 190, cardY + 45);

    ctx.font = '20px system-ui';
    ctx.fillStyle = '#475569';
    ctx.fillText('我的神秘作品是：_______________________', 190, cardY + 95);
    ctx.fillText('小画家签名：______________    日期：____年__月__日', 190, cardY + 135);
    ctx.restore();

    this.drawFooter(ctx);

    return canvas;
  },

  /**
   * 绘制统一规范的页眉
   */
  drawHeader(ctx, title, subtitle) {
    ctx.save();
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 36px Arial, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, this.PAGE_WIDTH / 2, 90);

    ctx.fillStyle = '#475569';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(subtitle, this.PAGE_WIDTH / 2, 135);

    // 分隔线
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(120, 160);
    ctx.lineTo(this.PAGE_WIDTH - 120, 160);
    ctx.stroke();
    ctx.restore();
  },

  /**
   * 绘制统一规范的页脚
   */
  drawFooter(ctx) {
    ctx.save();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(120, this.PAGE_HEIGHT - 80);
    ctx.lineTo(this.PAGE_WIDTH - 120, this.PAGE_HEIGHT - 80);
    ctx.stroke();

    ctx.font = '16px system-ui';
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'center';
    ctx.fillText('神奇旋转绘图盘 · 激发好奇心与空间想象力 · 100% 还原趣味几何解密', this.PAGE_WIDTH / 2, this.PAGE_HEIGHT - 45);
    ctx.restore();
  },

  /**
   * 下载 Canvas 为图片文件
   */
  downloadCanvasAsImage(canvas, filename = 'drawing-sheet.png') {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
  }
};
