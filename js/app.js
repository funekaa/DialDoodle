/**
 * 旋转解密绘图盘 - 主控制器 (App Controller)
 */

import { Presets } from './core/presets.js';
import { Splitter } from './core/splitter.js';
import { Simulator } from './simulator.js';
import { Exporter } from './exporter.js';
import { ImageProcessor } from './imageProcessor.js';

class App {
  constructor() {
    this.currentStrokes = Presets.bear.strokes;
    this.selectedPresetId = 'bear';
    this.tickCount = 12;
    this.safeClearance = 12;
    this.slotWidth = 6;
    this.penColor = '#2563EB';
    this.processedData = null;

    // 手绘画板临时数据
    this.doodleStrokes = [];
    this.isDoodling = false;
    this.currentDoodleStroke = [];

    this.init();
  }

  init() {
    this.initPresetUI();
    this.initSimulator();
    this.initDoodleCanvas();
    this.initTabs();
    this.initControls();
    this.initUpload();
    this.initExportButtons();

    // 首次生成
    this.regenerate();
  }

  /**
   * 初始化预设选择列表
   */
  initPresetUI() {
    const container = document.getElementById('presetContainer');
    container.innerHTML = '';

    Object.values(Presets).forEach(preset => {
      const card = document.createElement('div');
      card.className = `preset-card ${preset.id === this.selectedPresetId ? 'active' : ''}`;
      card.textContent = preset.name;
      card.addEventListener('click', () => {
        this.selectedPresetId = preset.id;
        this.currentStrokes = preset.strokes;
        document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.regenerate();
      });
      container.appendChild(card);
    });
  }

  /**
   * 初始化模拟器
   */
  initSimulator() {
    const canvas = document.getElementById('simCanvas');
    Simulator.init(canvas, {
      penColor: this.penColor
    });

    // 刻度状态变化监听
    Simulator.onTickChangeCallback = (activeTick) => {
      this.updateStatusUI(activeTick);
    };
  }

  /**
   * 核心：重新执行打散算法与图纸生成
   */
  regenerate() {
    // 1. 将当前笔画连续化重构，并通过非均匀刻度防交叉算法求解各个槽的旋转角
    this.processedData = Splitter.process(this.currentStrokes, this.tickCount, {
      slotWidth: this.slotWidth,
      safeClearance: this.safeClearance || 12
    });

    // 2. 同步界面显示的刻度数量 (确保用户画的每一笔都对应一个专属刻度)
    const actualTicks = this.processedData.ticks.length;
    const tickVal = document.getElementById('tickCountVal');
    if (tickVal) {
      tickVal.textContent = `${actualTicks} 个刻度`;
    }

    // 3. 将打散数据送入模拟器
    Simulator.setData(this.processedData);

    // 4. 更新刻度胶囊列表
    this.renderTickPills();

    // 5. 渲染 B 纸与 A 纸的高清打印预览
    this.renderExportPreviews();

    // 6. 刷新状态栏
    this.updateStatusUI(Simulator.getCurrentActiveTick());
  }

  /**
   * 渲染刻度快捷胶囊导航
   */
  renderTickPills() {
    const container = document.getElementById('tickPillsContainer');
    container.innerHTML = '';

    if (!this.processedData || !this.processedData.ticks) return;

    this.processedData.ticks.forEach(tick => {
      const pill = document.createElement('div');
      pill.className = 'tick-pill';
      pill.textContent = tick.id;
      pill.dataset.tickId = tick.id;

      pill.addEventListener('click', () => {
        Simulator.rotateToTick(tick.id, true);
      });

      container.appendChild(pill);
    });
  }

  /**
   * 刷新状态栏与胶囊状态
   */
  updateStatusUI(activeTick) {
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const statusProgress = document.getElementById('statusProgress');

    const total = this.processedData ? this.processedData.ticks.length : 0;
    const completedCount = Simulator.completedTicks.size;

    statusProgress.textContent = `完成进度: ${completedCount} / ${total}`;

    // 更新胶囊高亮与完成标记
    document.querySelectorAll('.tick-pill').forEach(pill => {
      const id = parseInt(pill.dataset.tickId, 10);
      pill.classList.remove('aligned', 'completed');
      if (Simulator.completedTicks.has(id)) {
        pill.classList.add('completed');
      }
      if (activeTick && activeTick.id === id) {
        pill.classList.add('aligned');
      }
    });

    if (activeTick) {
      const isDone = Simulator.completedTicks.has(activeTick.id);
      indicator.className = 'status-indicator aligned';
      if (isDone) {
        statusText.textContent = `🟢 已对准刻度 #${activeTick.id} (该刻度线已画完)`;
      } else {
        statusText.textContent = `🎯 已对准刻度 #${activeTick.id}！点击“在当前开槽画线”`;
      }
    } else {
      indicator.className = 'status-indicator';
      statusText.textContent = '🔄 请旋转 B 纸圆盘，将任意刻度对齐正上方红色指示线';
    }
  }

  /**
   * 初始化手绘涂鸦板
   */
  initDoodleCanvas() {
    const canvas = document.getElementById('doodleCanvas');
    const ctx = canvas.getContext('2d');

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const scaleX = canvas.width / (rect.width || 1);
      const scaleY = canvas.height / (rect.height || 1);
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    const redrawDoodle = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      this.doodleStrokes.forEach(st => {
        if (st.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(st[0].x, st[0].y);
        for (let i = 1; i < st.length; i++) ctx.lineTo(st[i].x, st[i].y);
        ctx.stroke();
      });

      if (this.currentDoodleStroke.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(this.currentDoodleStroke[0].x, this.currentDoodleStroke[0].y);
        for (let i = 1; i < this.currentDoodleStroke.length; i++) {
          ctx.lineTo(this.currentDoodleStroke[i].x, this.currentDoodleStroke[i].y);
        }
        ctx.stroke();
      }
    };

    const startDraw = (e) => {
      this.isDoodling = true;
      this.currentDoodleStroke = [getPos(e)];
      if (e.type === 'touchstart') e.preventDefault();
    };

    const moveDraw = (e) => {
      if (!this.isDoodling) return;
      this.currentDoodleStroke.push(getPos(e));
      redrawDoodle();
      if (e.type === 'touchmove') e.preventDefault();
    };

    const endDraw = () => {
      if (!this.isDoodling) return;
      this.isDoodling = false;
      if (this.currentDoodleStroke.length >= 2) {
        this.doodleStrokes.push(this.currentDoodleStroke);
      }
      this.currentDoodleStroke = [];
      redrawDoodle();
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    window.addEventListener('mouseup', endDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', moveDraw, { passive: false });
    window.addEventListener('touchend', endDraw);

    document.getElementById('btnClearDoodle').addEventListener('click', () => {
      this.doodleStrokes = [];
      redrawDoodle();
    });

    document.getElementById('btnApplyDoodle').addEventListener('click', () => {
      if (this.doodleStrokes.length === 0) {
        alert('请先在画板上画出一些线条！');
        return;
      }
      // 映射到圆心上方标准区域
      this.applyDoodleStrokes();
    });
  }

  applyDoodleStrokes() {
    const canvas = document.getElementById('doodleCanvas');
    // 找出 doodle 笔画的 bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.doodleStrokes.forEach(st => {
      st.forEach(pt => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });
    });

    const srcW = Math.max(10, maxX - minX);
    const srcH = Math.max(10, maxY - minY);
    const targetW = 140;
    const targetH = 120;
    const scale = Math.min(targetW / srcW, targetH / srcH);
    const srcCenterX = (minX + maxX) / 2;
    const srcCenterY = (minY + maxY) / 2;

    const bounds = { cx: 0, cy: -95 };

    this.currentStrokes = this.doodleStrokes.map(stroke => {
      return stroke.map(pt => ({
        x: bounds.cx + (pt.x - srcCenterX) * scale,
        y: bounds.cy + (pt.y - srcCenterY) * scale
      }));
    });

    document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
    this.regenerate();
  }

  /**
   * 初始化 Tab 选项卡
   */
  initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const target = btn.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(c => (c.style.display = 'none'));
        const el = document.getElementById(`tab-${target}`);
        if (el) el.style.display = 'block';
      });
    });
  }

  /**
   * 初始化参数控制器
   */
  initControls() {
    // 刻度数量 (调整参数后不立刻计算，需按底部“重新计算”按钮生效，避免频繁计算卡死)
    const tickRange = document.getElementById('tickCountRange');
    const tickVal = document.getElementById('tickCountVal');
    tickRange.addEventListener('input', (e) => {
      this.tickCount = parseInt(e.target.value, 10);
      tickVal.textContent = `${this.tickCount} 个刻度 (待生效)`;
    });

    // 开槽安全间隔
    const clearanceRange = document.getElementById('clearanceRange');
    const clearanceVal = document.getElementById('clearanceVal');
    if (clearanceRange) {
      clearanceRange.addEventListener('input', (e) => {
        this.safeClearance = parseInt(e.target.value, 10);
        const text = this.safeClearance <= 9 ? '较紧凑 (2.5mm)' : (this.safeClearance >= 16 ? '宽裕安全 (5mm)' : `标准 (${this.safeClearance}px)`);
        clearanceVal.textContent = `${text} (待生效)`;
      });
    }

    // 开槽宽度
    const slotRange = document.getElementById('slotWidthRange');
    const slotVal = document.getElementById('slotWidthVal');
    slotRange.addEventListener('input', (e) => {
      this.slotWidth = parseInt(e.target.value, 10);
      const text = this.slotWidth <= 3 ? '细线槽 (1~2mm)' : (this.slotWidth >= 8 ? '宽孔槽 (4~5mm)' : '适中 (3mm)');
      slotVal.textContent = `${text} (待生效)`;
    });

    // 画笔颜色
    const colorPills = document.querySelectorAll('#penColorGroup .radio-pill');
    colorPills.forEach(pill => {
      pill.addEventListener('click', () => {
        colorPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.penColor = pill.dataset.color;
        Simulator.options.penColor = this.penColor;
        Simulator.render();
      });
    });

    // 重新计算非均匀防交叉排布按钮
    const btnRegenerate = document.getElementById('btnRegenerate');
    btnRegenerate.addEventListener('click', () => {
      const originalHtml = btnRegenerate.innerHTML;
      btnRegenerate.disabled = true;
      btnRegenerate.innerHTML = '⏳ 正在重新计算防交叉排布...';

      // 异步让 UI 先刷新出按钮加载状态
      setTimeout(() => {
        try {
          this.regenerate();
        } finally {
          btnRegenerate.disabled = false;
          btnRegenerate.innerHTML = originalHtml;
        }
      }, 40);
    });

    // 模拟器按钮绑定
    document.getElementById('btnPrevTick').addEventListener('click', () => {
      const active = Simulator.getCurrentActiveTick();
      const ticks = this.processedData.ticks;
      let targetId = 1;
      if (active) {
        const curIdx = ticks.findIndex(t => t.id === active.id);
        const prevIdx = (curIdx - 1 + ticks.length) % ticks.length;
        targetId = ticks[prevIdx].id;
      }
      Simulator.rotateToTick(targetId, true);
    });

    document.getElementById('btnNextTick').addEventListener('click', () => {
      const active = Simulator.getCurrentActiveTick();
      const ticks = this.processedData.ticks;
      let targetId = 1;
      if (active) {
        const curIdx = ticks.findIndex(t => t.id === active.id);
        const nextIdx = (curIdx + 1) % ticks.length;
        targetId = ticks[nextIdx].id;
      }
      Simulator.rotateToTick(targetId, true);
    });

    const drawAction = () => {
      const ok = Simulator.drawCurrentTickStroke();
      if (ok) {
        this.updateStatusUI(Simulator.getCurrentActiveTick());
      } else {
        alert('请先旋转圆盘将刻度对齐正上方红色指示线后再画线！');
      }
    };

    document.getElementById('btnDrawStroke').addEventListener('click', drawAction);

    // 快捷键空格画线
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        drawAction();
      }
    });

    document.getElementById('btnAutoPlay').addEventListener('click', () => {
      Simulator.startAutoPlay((current, total, stage) => {
        const statusText = document.getElementById('statusText');
        const statusProgress = document.getElementById('statusProgress');
        statusProgress.textContent = `完成进度: ${current} / ${total}`;
        if (stage === 'rotating') statusText.textContent = `🔄 正在旋转到刻度 #${current}...`;
        if (stage === 'drawing') statusText.textContent = `✏️ 正在刻度 #${current} 的开槽画线...`;
        if (stage === 'revealing') statusText.textContent = `✨ 所有刻度完成！正在移开 B 纸揭晓完整作品！`;
        if (stage === 'done') statusText.textContent = `🎉 恭喜！A 纸上成功呈现出完整简笔画！`;
        this.updateStatusUI(Simulator.getCurrentActiveTick());
      });
    });

    document.getElementById('btnToggleBPaper').addEventListener('click', () => {
      Simulator.toggleRemoveBPaper();
    });

    document.getElementById('btnClearSim').addEventListener('click', () => {
      Simulator.clearDrawing();
      this.updateStatusUI(Simulator.getCurrentActiveTick());
    });

    document.getElementById('btnHowToPlay').addEventListener('click', () => {
      alert('【神奇旋转绘图盘玩法】\n\n1. 打印 B 纸（圆形转盘）和 A 纸（底部基准画纸）。\n2. 沿外圆虚线剪下 B 纸，用美工刀镂空灰色开槽。\n3. 用一颗图钉穿透 B 纸圆心，钉在 A 纸底部的十字圆心上。\n4. 旋转 B 纸，使每个刻度依次对齐 A 纸正上方指示线，沿露出的开槽用笔划线。\n5. 当画完所有刻度后，拿开 B 纸，A 纸上就会奇迹般呈现出完整的图案！');
    });
  }

  /**
   * 初始化图片上传
   */
  initUpload() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const btnChangeImage = document.getElementById('btnChangeImage');

    dropzone.addEventListener('click', (e) => {
      // 避免点击更换图片按钮冒泡重复触发
      if (e.target.id === 'btnChangeImage') return;
      fileInput.click();
    });

    if (btnChangeImage) {
      btnChangeImage.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '#3B82F6';
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = '#E2E8F0';
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '#E2E8F0';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleImageFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleImageFile(e.target.files[0]);
      }
    });
  }

  async handleImageFile(file) {
    const progressContainer = document.getElementById('uploadProgressContainer');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    const statusText = document.getElementById('statusText');

    try {
      // 1. 立即在画红圈的 dropzone 窗口内部直接呈现图片预览！
      const reader = new FileReader();
      reader.onload = (e) => {
        const dropzonePrompt = document.getElementById('dropzonePrompt');
        const dropzonePreview = document.getElementById('dropzonePreview');
        const previewImg = document.getElementById('uploadPreviewImg');
        const fileNameEl = document.getElementById('uploadFileName');
        const uploadActionBar = document.getElementById('uploadActionBar');
        if (dropzonePrompt && dropzonePreview && previewImg) {
          previewImg.src = e.target.result;
          if (fileNameEl) fileNameEl.textContent = file.name || '已导入简笔画';
          dropzonePrompt.style.display = 'none';
          dropzonePreview.style.display = 'flex';
          if (uploadActionBar) uploadActionBar.style.display = 'flex';
        }
      };
      reader.readAsDataURL(file);

      // 2. 显示进度条
      if (progressContainer) {
        progressContainer.style.display = 'block';
        if (progressBar) progressBar.style.width = '10%';
        if (progressText) progressText.textContent = '正在读取图像文件...';
      }

      // 3. 骨架化、去重与智能提取线稿
      const strokes = await ImageProcessor.processImageFile(file, { cx: 0, cy: -82, width: 152, height: 132 }, (pct, msg) => {
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressText) progressText.textContent = `${msg} (${pct}%)`;
        if (statusText) statusText.textContent = `⏳ ${msg}`;
      });

      this.currentStrokes = strokes;
      document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));

      if (progressBar) progressBar.style.width = '100%';
      if (progressText) progressText.textContent = '✅ 线稿提取完成，正在完成最终旋转排布！';

      // 4. 按用户指定的精确刻度数进行无相交排布
      this.regenerate();

      if (statusText) statusText.textContent = '✅ 已成功提取单中心线稿并完成精准旋转打散！';
      setTimeout(() => {
        if (progressContainer) progressContainer.style.display = 'none';
      }, 1500);
    } catch (err) {
      if (progressContainer) progressContainer.style.display = 'none';
      alert('处理图片失败: ' + err.message);
    }
  }

  /**
   * 渲染 B 纸与 A 纸的高清打印预览
   */
  renderExportPreviews() {
    if (!this.processedData) return;

    // 渲染 B 纸
    const bCanvas = Exporter.renderBPaperCanvas(this.processedData, {
      slotWidth: this.slotWidth
    });
    const bPreviewCanvas = document.getElementById('bPaperCanvas');
    bPreviewCanvas.width = bCanvas.width;
    bPreviewCanvas.height = bCanvas.height;
    const bCtx = bPreviewCanvas.getContext('2d');
    bCtx.drawImage(bCanvas, 0, 0);
    this.renderedBCanvas = bCanvas;

    // 渲染 A 纸
    const aCanvas = Exporter.renderAPaperCanvas();
    const aPreviewCanvas = document.getElementById('aPaperCanvas');
    aPreviewCanvas.width = aCanvas.width;
    aPreviewCanvas.height = aCanvas.height;
    const aCtx = aPreviewCanvas.getContext('2d');
    aCtx.drawImage(aCanvas, 0, 0);
    this.renderedACanvas = aCanvas;
  }

  /**
   * 绑定下载与打印按钮
   */
  initExportButtons() {
    document.getElementById('btnDownloadB').addEventListener('click', () => {
      if (this.renderedBCanvas) {
        Exporter.downloadCanvasAsImage(this.renderedBCanvas, 'B纸-圆形旋转画纸(需剪裁与镂空).png');
      }
    });

    document.getElementById('btnDownloadA').addEventListener('click', () => {
      if (this.renderedACanvas) {
        Exporter.downloadCanvasAsImage(this.renderedACanvas, 'A纸-底部基准画纸(固定垫底).png');
      }
    });

    const triggerPrint = () => {
      window.print();
    };

    document.getElementById('btnQuickPrint').addEventListener('click', triggerPrint);
    document.getElementById('btnPrintAll').addEventListener('click', triggerPrint);
  }
}

// 页面加载完成后启动应用
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
