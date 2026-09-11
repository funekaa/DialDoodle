/**
 * 旋转解密绘图盘 - 后台管理与开槽数据生成器 (Admin Controller)
 * 供管理员输入简笔画图片/手绘涂鸦，求解无相交开槽并导出 data.json
 */

import { Presets } from './core/presets.js';
import { Splitter } from './core/splitter.js';
import { Simulator } from './simulator.js';
import { Exporter } from './exporter.js';
import { ImageProcessor } from './imageProcessor.js';

class AdminApp {
  constructor() {
    this.currentStrokes = Presets.bear.strokes;
    this.selectedPresetId = 'bear';
    this.tickCount = 12;
    this.safeClearance = 12;
    this.slotWidth = 6;
    this.processedData = null;

    // 手绘画板
    this.doodleStrokes = [];
    this.isDoodling = false;
    this.currentDoodleStroke = [];

    this.init();
  }

  init() {
    this.initPresets();
    this.initSimulator();
    this.initDoodleCanvas();
    this.initTabs();
    this.initControls();
    this.initUpload();
    this.initExportButtons();

    // 初始计算
    this.regenerate();
  }

  initPresets() {
    const container = document.getElementById('adminPresetGrid');
    if (!container) return;
    container.innerHTML = '';

    Object.values(Presets).forEach(preset => {
      const card = document.createElement('div');
      card.className = `preset-card ${preset.id === this.selectedPresetId ? 'active' : ''}`;
      card.textContent = preset.name;
      card.addEventListener('click', () => {
        this.selectedPresetId = preset.id;
        this.currentStrokes = preset.strokes;

        // 填充元数据输入框
        const catSelect = document.getElementById('inputDoodleCategory');
        const idInput = document.getElementById('inputDoodleId');
        const nameInput = document.getElementById('inputDoodleName');
        const iconInput = document.getElementById('inputDoodleIcon');
        const descInput = document.getElementById('inputDoodleDesc');

        const catMap = {
          bear: 'animals', bunny: 'animals', puppy: 'animals', dino: 'animals',
          car: 'toys', clock: 'daily', snowman: 'still_life'
        };
        if (catSelect && catMap[preset.id]) {
          catSelect.value = catMap[preset.id];
        }
        if (idInput) idInput.value = preset.id;
        if (nameInput) nameInput.value = preset.name;
        if (iconInput) iconInput.value = preset.name.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/)?.[0] || '🎨';
        if (descInput) descInput.value = `精选${preset.name}开槽纸`;

        document.querySelectorAll('#adminPresetGrid .preset-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.regenerate();
      });
      container.appendChild(card);
    });
  }

  initSimulator() {
    const canvas = document.getElementById('simCanvas');
    Simulator.init(canvas, {
      penColor: '#2563EB'
    });

    Simulator.onTickChangeCallback = (activeTick) => {
      this.updateStatusUI(activeTick);
    };
  }

  regenerate() {
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = '⏳ 正在求解非均匀防交叉排布...';

    // 1. 求解连续开槽与旋转角
    this.processedData = Splitter.process(this.currentStrokes, this.tickCount, {
      slotWidth: this.slotWidth,
      safeClearance: this.safeClearance || 12
    });

    const actualTicks = this.processedData.ticks.length;
    const tickVal = document.getElementById('tickCountVal');
    if (tickVal) {
      tickVal.textContent = `${actualTicks} 个刻度 (自动优化)`;
    }

    // 2. 注入模拟器
    Simulator.setData(this.processedData);

    // 3. 渲染刻度胶囊
    this.renderTickPills();

    // 4. 渲染图纸预览
    this.renderExportPreviews();

    // 5. 更新状态与入库指引代码
    this.updateStatusUI(Simulator.getCurrentActiveTick());
    this.updateGuideAndSnippet();
  }

  renderTickPills() {
    const container = document.getElementById('tickPillsContainer');
    if (!container) return;
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

  updateStatusUI(activeTick) {
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const statusProgress = document.getElementById('statusProgress');

    const total = this.processedData ? this.processedData.ticks.length : 0;
    const completedCount = Simulator.completedTicks.size;

    if (statusProgress) statusProgress.textContent = `完成进度: ${completedCount} / ${total}`;

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

    if (indicator && statusText) {
      if (activeTick) {
        const isDone = Simulator.completedTicks.has(activeTick.id);
        indicator.className = 'status-indicator aligned';
        if (isDone) {
          statusText.textContent = `🟢 已对准刻度 #${activeTick.id} (已画)`;
        } else {
          statusText.textContent = `🎯 已对准刻度 #${activeTick.id}！点击“在当前开槽画线”`;
        }
      } else {
        indicator.className = 'status-indicator';
        statusText.textContent = '🔄 请旋转 B 纸圆盘进行校验';
      }
    }
  }

  updateGuideAndSnippet() {
    const catSelect = document.getElementById('inputDoodleCategory');
    const idInput = document.getElementById('inputDoodleId');
    const nameInput = document.getElementById('inputDoodleName');
    const iconInput = document.getElementById('inputDoodleIcon');
    const descInput = document.getElementById('inputDoodleDesc');

    const category = (catSelect ? catSelect.value : 'animals') || 'animals';
    const categoryName = catSelect ? (catSelect.options[catSelect.selectedIndex]?.dataset.name || '萌宠动物 🐾') : '萌宠动物 🐾';
    const doodleId = (idInput ? idInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'custom') || 'custom';
    const doodleName = (nameInput ? nameInput.value.trim() : '简笔画') || '简笔画';
    const doodleIcon = (iconInput ? iconInput.value.trim() : '🎨') || '🎨';
    const doodleDesc = (descInput ? descInput.value.trim() : '') || '精选趣味开槽纸';
    const actualTicks = this.processedData ? this.processedData.ticks.length : this.tickCount;

    const fileName = `${doodleId}.json`;
    const filePath = `${category}/${fileName}`;

    const btnFileLabel = document.getElementById('downloadBtnFileName');
    if (btnFileLabel) btnFileLabel.textContent = fileName;

    const folderEl = document.getElementById('guideFolderText');
    if (folderEl) folderEl.textContent = `doodles/${filePath}`;

    const snippetObj = {
      id: doodleId,
      name: doodleName,
      icon: doodleIcon,
      description: doodleDesc,
      category: category,
      categoryName: categoryName,
      fileName: fileName,
      filePath: filePath,
      tickCount: actualTicks
    };

    const snippetText = `// 追加至 doodles/manifest.json 的 "doodles" 数组中:\n` + JSON.stringify(snippetObj, null, 2) + `,`;
    const snippetEl = document.getElementById('manifestSnippetCode');
    if (snippetEl) snippetEl.textContent = snippetText;
  }

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

  initControls() {
    const tickRange = document.getElementById('tickCountRange');
    const tickVal = document.getElementById('tickCountVal');
    if (tickRange && tickVal) {
      tickRange.addEventListener('input', (e) => {
        this.tickCount = parseInt(e.target.value, 10);
        tickVal.textContent = `${this.tickCount} 个刻度 (待生效)`;
      });
    }

    const clearanceRange = document.getElementById('clearanceRange');
    const clearanceVal = document.getElementById('clearanceVal');
    if (clearanceRange && clearanceVal) {
      clearanceRange.addEventListener('input', (e) => {
        this.safeClearance = parseInt(e.target.value, 10);
        clearanceVal.textContent = `标准 (${this.safeClearance}px) (待生效)`;
      });
    }

    const slotRange = document.getElementById('slotWidthRange');
    const slotVal = document.getElementById('slotWidthVal');
    if (slotRange && slotVal) {
      slotRange.addEventListener('input', (e) => {
        this.slotWidth = parseInt(e.target.value, 10);
        slotVal.textContent = `适中 (${this.slotWidth}px) (待生效)`;
      });
    }

    ['inputDoodleCategory', 'inputDoodleId', 'inputDoodleName', 'inputDoodleIcon', 'inputDoodleDesc'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.updateGuideAndSnippet());
        el.addEventListener('change', () => this.updateGuideAndSnippet());
      }
    });

    const btnRegen = document.getElementById('btnRegenerateAdmin');
    if (btnRegen) {
      btnRegen.addEventListener('click', () => {
        const orig = btnRegen.innerHTML;
        btnRegen.disabled = true;
        btnRegen.innerHTML = '⏳ 正在计算防交叉旋转排布...';
        setTimeout(() => {
          try {
            this.regenerate();
          } finally {
            btnRegen.disabled = false;
            btnRegen.innerHTML = orig;
          }
        }, 40);
      });
    }

    // 模拟器操作
    const btnPrev = document.getElementById('btnPrevTick');
    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        if (!this.processedData || !this.processedData.ticks) return;
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
    }

    const btnNext = document.getElementById('btnNextTick');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        if (!this.processedData || !this.processedData.ticks) return;
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
    }

    const drawAction = () => {
      const ok = Simulator.drawCurrentTickStroke();
      if (ok) {
        this.updateStatusUI(Simulator.getCurrentActiveTick());
      } else {
        alert('请先旋转圆盘将刻度对齐正上方红色指示线后再画线！');
      }
    };

    const btnDraw = document.getElementById('btnDrawStroke');
    if (btnDraw) btnDraw.addEventListener('click', drawAction);

    const btnAuto = document.getElementById('btnAutoPlay');
    if (btnAuto) {
      btnAuto.addEventListener('click', () => {
        Simulator.startAutoPlay((current, total, stage) => {
          const statusText = document.getElementById('statusText');
          const statusProgress = document.getElementById('statusProgress');
          if (statusProgress) statusProgress.textContent = `完成进度: ${current} / ${total}`;
          if (statusText) {
            if (stage === 'rotating') statusText.textContent = `🔄 正在旋转到刻度 #${current}...`;
            if (stage === 'drawing') statusText.textContent = `✏️ 正在刻度 #${current} 的开槽画线...`;
            if (stage === 'revealing') statusText.textContent = `✨ 所有刻度完成！正在移开 B 纸揭晓完整作品！`;
            if (stage === 'done') statusText.textContent = `🎉 恭喜！A 纸上成功呈现出完整简笔画！`;
          }
          this.updateStatusUI(Simulator.getCurrentActiveTick());
        });
      });
    }

    const btnToggleB = document.getElementById('btnToggleBPaper');
    if (btnToggleB) {
      btnToggleB.addEventListener('click', () => {
        Simulator.toggleRemoveBPaper();
      });
    }

    const btnClear = document.getElementById('btnClearSim');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        Simulator.clearDrawing();
        this.updateStatusUI(Simulator.getCurrentActiveTick());
      });
    }

    // 复制片段
    const btnCopy = document.getElementById('btnCopySnippet');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const catSelect = document.getElementById('inputDoodleCategory');
        const idInput = document.getElementById('inputDoodleId');
        const nameInput = document.getElementById('inputDoodleName');
        const iconInput = document.getElementById('inputDoodleIcon');
        const descInput = document.getElementById('inputDoodleDesc');

        const category = (catSelect ? catSelect.value : 'animals') || 'animals';
        const categoryName = catSelect ? (catSelect.options[catSelect.selectedIndex]?.dataset.name || '萌宠动物 🐾') : '萌宠动物 🐾';
        const doodleId = (idInput?.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'custom');
        const fileName = `${doodleId}.json`;
        const filePath = `${category}/${fileName}`;

        const snippetObj = {
          id: doodleId,
          name: (nameInput?.value.trim() || '简笔画'),
          icon: (iconInput?.value.trim() || '🎨'),
          description: (descInput?.value.trim() || '精选趣味开槽纸'),
          category: category,
          categoryName: categoryName,
          fileName: fileName,
          filePath: filePath,
          tickCount: this.processedData?.ticks?.length || this.tickCount
        };

        const jsonStr = JSON.stringify(snippetObj, null, 2);
        navigator.clipboard.writeText(jsonStr).then(() => {
          btnCopy.textContent = '✅ 已成功复制到剪贴板！';
          setTimeout(() => (btnCopy.textContent = '📋 复制配置片段到剪贴板'), 2000);
        }).catch(() => {
          alert('复制失败，请手动选择文本复制。');
        });
      });
    }
  }

  initDoodleCanvas() {
    const canvas = document.getElementById('doodleCanvas');
    if (!canvas) return;
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

    const btnClearDoodle = document.getElementById('btnClearDoodle');
    if (btnClearDoodle) {
      btnClearDoodle.addEventListener('click', () => {
        this.doodleStrokes = [];
        redrawDoodle();
      });
    }

    const btnApplyDoodle = document.getElementById('btnApplyDoodle');
    if (btnApplyDoodle) {
      btnApplyDoodle.addEventListener('click', () => {
        if (this.doodleStrokes.length === 0) {
          alert('请先在画板上画出一些线条！');
          return;
        }

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

        this.regenerate();
      });
    }
  }

  initUpload() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const btnChangeImage = document.getElementById('btnChangeImage');
    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', (e) => {
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

      if (progressContainer) {
        progressContainer.style.display = 'block';
        if (progressBar) progressBar.style.width = '10%';
        if (progressText) progressText.textContent = '正在读取图像文件...';
      }

      // 提取纯中心线笔画
      const strokes = await ImageProcessor.processImageFile(file, { cx: 0, cy: -82, width: 152, height: 132 }, (pct, msg) => {
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressText) progressText.textContent = `${msg} (${pct}%)`;
        if (statusText) statusText.textContent = `⏳ ${msg}`;
      });

      this.currentStrokes = strokes;

      // 自动从文件名建议 ID 和名称
      const rawName = file.name.replace(/\.[^/.]+$/, '');
      const idInput = document.getElementById('inputDoodleId');
      const nameInput = document.getElementById('inputDoodleName');
      if (nameInput && !nameInput.value) nameInput.value = rawName;
      if (idInput && !idInput.value) idInput.value = rawName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

      if (progressBar) progressBar.style.width = '100%';
      if (progressText) progressText.textContent = '✅ 线稿提取完成，正在完成最终旋转排布！';

      this.regenerate();

      setTimeout(() => {
        if (progressContainer) progressContainer.style.display = 'none';
      }, 1500);
    } catch (err) {
      if (progressContainer) progressContainer.style.display = 'none';
      alert('处理图片失败: ' + err.message);
    }
  }

  renderExportPreviews() {
    if (!this.processedData) return;

    // 渲染 B 纸
    const bCanvas = Exporter.renderBPaperCanvas(this.processedData, {
      slotWidth: this.slotWidth
    });
    const bPreviewCanvas = document.getElementById('bPaperCanvas');
    if (bPreviewCanvas) {
      bPreviewCanvas.width = bCanvas.width;
      bPreviewCanvas.height = bCanvas.height;
      const bCtx = bPreviewCanvas.getContext('2d');
      bCtx.drawImage(bCanvas, 0, 0);
    }
    this.renderedBCanvas = bCanvas;

    // 渲染 A 纸
    const aCanvas = Exporter.renderAPaperCanvas();
    const aPreviewCanvas = document.getElementById('aPaperCanvas');
    if (aPreviewCanvas) {
      aPreviewCanvas.width = aCanvas.width;
      aPreviewCanvas.height = aCanvas.height;
      const aCtx = aPreviewCanvas.getContext('2d');
      aCtx.drawImage(aCanvas, 0, 0);
    }
    this.renderedACanvas = aCanvas;
  }

  initExportButtons() {
    const btnDownloadDataJson = document.getElementById('btnDownloadDataJson');
    if (btnDownloadDataJson) {
      btnDownloadDataJson.addEventListener('click', () => {
        if (!this.processedData) {
          alert('请先等待或执行开槽计算后再导出！');
          return;
        }

        const catSelect = document.getElementById('inputDoodleCategory');
        const idInput = document.getElementById('inputDoodleId');
        const nameInput = document.getElementById('inputDoodleName');
        const iconInput = document.getElementById('inputDoodleIcon');
        const descInput = document.getElementById('inputDoodleDesc');

        const category = (catSelect ? catSelect.value : 'animals') || 'animals';
        const categoryName = catSelect ? (catSelect.options[catSelect.selectedIndex]?.dataset.name || '萌宠动物 🐾') : '萌宠动物 🐾';
        const doodleId = (idInput?.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'custom');
        const doodleName = (nameInput?.value.trim() || '简笔画');
        const doodleIcon = (iconInput?.value.trim() || '🎨');
        const doodleDesc = (descInput?.value.trim() || '精选趣味开槽纸');
        const actualTicks = this.processedData.ticks.length;

        const fileName = `${doodleId}.json`;
        const filePath = `${category}/${fileName}`;

        const exportPayload = {
          id: doodleId,
          name: doodleName,
          icon: doodleIcon,
          description: doodleDesc,
          category: category,
          categoryName: categoryName,
          fileName: fileName,
          filePath: filePath,
          tickCount: actualTicks,
          slotWidth: this.slotWidth,
          safeClearance: this.safeClearance,
          createdAt: new Date().toISOString().split('T')[0],
          processedData: this.processedData
        };

        const jsonStr = JSON.stringify(exportPayload, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    const btnDownloadB = document.getElementById('btnDownloadB');
    if (btnDownloadB) {
      btnDownloadB.addEventListener('click', () => {
        if (this.renderedBCanvas) {
          Exporter.downloadCanvasAsImage(this.renderedBCanvas, 'B纸-旋转开槽纸-管理预览.png');
        }
      });
    }

    const btnDownloadA = document.getElementById('btnDownloadA');
    if (btnDownloadA) {
      btnDownloadA.addEventListener('click', () => {
        if (this.renderedACanvas) {
          Exporter.downloadCanvasAsImage(this.renderedACanvas, 'A纸-底部基准画纸(固定垫底).png');
        }
      });
    }

    const btnPrintAll = document.getElementById('btnPrintAll');
    if (btnPrintAll) {
      btnPrintAll.addEventListener('click', () => {
        window.print();
      });
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new AdminApp();
});
