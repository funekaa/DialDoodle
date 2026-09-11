/**
 * 旋转解密绘图盘 - 用户展示端主控制器 (App Controller)
 * 只负责展示预设简笔画开槽纸，支持按分类浏览，零计算秒级呈现
 */

import { Simulator } from './simulator.js';
import { Exporter } from './exporter.js';
import { DoodleCategories, DoodleManifest, PreloadedDoodles } from '../doodles/index.js';

class App {
  constructor() {
    this.categories = [];
    this.doodles = [];
    this.selectedCategory = 'all';
    this.currentDoodle = null;
    this.processedData = null;
    this.slotWidth = 6;
    this.penColor = '#2563EB';

    this.init();
  }

  async init() {
    this.initSimulator();
    this.initControls();
    this.initExportButtons();
    await this.loadDoodles();
  }

  /**
   * 加载分类与简笔画预设清单
   */
  async loadDoodles() {
    // 优先尝试通过 fetch 读取 manifest.json，若在 file:// 或离线环境受阻则降级使用 index.js 内置数据
    try {
      const resp = await fetch('doodles/manifest.json');
      if (resp.ok) {
        const data = await resp.json();
        if (data.categories && data.doodles) {
          this.categories = data.categories;
          this.doodles = data.doodles;
        } else if (Array.isArray(data)) {
          this.categories = DoodleCategories;
          this.doodles = data;
        }
      } else {
        this.categories = DoodleCategories;
        this.doodles = DoodleManifest;
      }
    } catch (e) {
      this.categories = DoodleCategories;
      this.doodles = DoodleManifest;
    }

    const badge = document.getElementById('totalDoodlesBadge');
    if (badge) badge.textContent = `${this.doodles.length} 款`;

    this.renderCategoryPills();
    this.renderDoodleCards();

    // 默认加载第一个简笔画
    if (this.doodles && this.doodles.length > 0) {
      await this.selectDoodle(this.doodles[0]);
    }
  }

  /**
   * 渲染分类标签栏
   */
  renderCategoryPills() {
    const container = document.getElementById('categoryPillsContainer');
    if (!container) return;
    container.innerHTML = '';

    const cats = this.categories && this.categories.length > 0 ? this.categories : [
      { id: 'all', name: '全部 🌟' }
    ];

    cats.forEach(cat => {
      const pill = document.createElement('div');
      pill.className = `category-pill ${this.selectedCategory === cat.id ? 'active' : ''}`;
      pill.textContent = cat.name;
      pill.dataset.catId = cat.id;

      pill.addEventListener('click', () => {
        if (this.selectedCategory === cat.id) return;
        this.selectedCategory = cat.id;
        document.querySelectorAll('.category-pill').forEach(p => p.classList.toggle('active', p.dataset.catId === cat.id));
        this.renderDoodleCards();
      });

      container.appendChild(pill);
    });
  }

  /**
   * 渲染当前分类下的简笔画选择卡片
   */
  renderDoodleCards() {
    const container = document.getElementById('presetContainer');
    if (!container) return;
    container.innerHTML = '';

    const filtered = this.selectedCategory === 'all'
      ? this.doodles
      : this.doodles.filter(d => d.category === this.selectedCategory);

    if (filtered.length === 0) {
      container.innerHTML = '<div style="grid-column: span 2; text-align: center; color: #94A3B8; font-size: 12px; padding: 20px 0;">该分类暂无简笔画</div>';
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = `preset-card ${this.currentDoodle && this.currentDoodle.id === item.id ? 'active' : ''}`;
      card.dataset.id = item.id;

      card.innerHTML = `
        <div class="card-icon">${item.icon || '🎨'}</div>
        <div class="card-body">
          <div class="card-name">${item.name}</div>
          <div class="card-desc">${item.description || ''}</div>
          <div class="card-badge">${item.tickCount || 12} 刻度 · ${item.categoryName || '经典'}</div>
        </div>
      `;

      card.addEventListener('click', async () => {
        if (this.currentDoodle && this.currentDoodle.id === item.id) return;
        await this.selectDoodle(item);
      });

      container.appendChild(card);
    });
  }

  /**
   * 选中简笔画并加载其所属分类文件夹下的独立 json 文件
   */
  async selectDoodle(item) {
    this.currentDoodle = item;

    // 高亮当前卡片
    document.querySelectorAll('.preset-card').forEach(c => {
      c.classList.toggle('active', c.dataset.id === item.id);
    });

    // 更新界面信息
    const nameEl = document.getElementById('currentDoodleName');
    if (nameEl) nameEl.textContent = `${item.name} (${item.categoryName || ''})`;

    // 读取分类下的具体 json 文件 (如 doodles/animals/bear.json)
    let doodleData = null;
    const filePath = item.filePath || (item.category ? `${item.category}/${item.id}.json` : `${item.id}.json`);

    try {
      const resp = await fetch(`doodles/${filePath}`);
      if (resp.ok) {
        doodleData = await resp.json();
      }
    } catch (e) {
      // fetch 失败
    }

    if (!doodleData && PreloadedDoodles && PreloadedDoodles[item.id]) {
      doodleData = PreloadedDoodles[item.id];
    }

    if (!doodleData || !doodleData.processedData) {
      alert(`无法加载 ${item.name} 的开槽纸数据，请检查 doodles/${filePath} 文件。`);
      return;
    }

    this.processedData = doodleData.processedData;
    this.slotWidth = doodleData.slotWidth || 6;

    const tickVal = document.getElementById('tickCountVal');
    if (tickVal) {
      tickVal.textContent = `${this.processedData.ticks.length} 个刻度`;
    }

    // 将预计算数据直接注入模拟器
    Simulator.setData(this.processedData);

    // 渲染刻度快捷导航胶囊
    this.renderTickPills();

    // 渲染 B 纸与 A 纸的高清打印预览
    this.renderExportPreviews();

    // 刷新状态栏
    this.updateStatusUI(Simulator.getCurrentActiveTick());
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
   * 渲染刻度快捷胶囊导航
   */
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

  /**
   * 刷新状态栏与胶囊状态
   */
  updateStatusUI(activeTick) {
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const statusProgress = document.getElementById('statusProgress');

    const total = this.processedData ? this.processedData.ticks.length : 0;
    const completedCount = Simulator.completedTicks.size;

    if (statusProgress) {
      statusProgress.textContent = `完成进度: ${completedCount} / ${total}`;
    }

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

    if (indicator && statusText) {
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
  }

  /**
   * 初始化参数与模拟器控制
   */
  initControls() {
    // 画笔颜色选择
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

    // 模拟器按钮绑定
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

    // 快捷键空格画线
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        drawAction();
      }
    });

    const btnAutoPlay = document.getElementById('btnAutoPlay');
    if (btnAutoPlay) {
      btnAutoPlay.addEventListener('click', () => {
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

    const btnHowToPlay = document.getElementById('btnHowToPlay');
    if (btnHowToPlay) {
      btnHowToPlay.addEventListener('click', () => {
        alert('【神奇旋转绘图盘玩法】\n\n1. 打印 B 纸（圆形转盘）和 A 纸（底部基准画纸）。\n2. 沿外圆虚线剪下 B 纸，用美工刀镂空灰色开槽与纯净圆孔。\n3. 用一颗图钉穿透 B 纸圆心，钉在 A 纸底部的十字圆心上。\n4. 旋转 B 纸，使每个刻度依次对齐 A 纸正上方指示线，沿露出的开槽用笔划线或涂圆。\n5. 当画完所有刻度后，拿开 B 纸，A 纸上就会奇迹般呈现出完整的图案！');
      });
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

  /**
   * 绑定下载与打印按钮
   */
  initExportButtons() {
    const btnDownloadB = document.getElementById('btnDownloadB');
    if (btnDownloadB) {
      btnDownloadB.addEventListener('click', () => {
        if (this.renderedBCanvas) {
          const name = (this.currentDoodle ? this.currentDoodle.name : '简笔画').replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
          Exporter.downloadCanvasAsImage(this.renderedBCanvas, `B纸-旋转开槽纸-${name}.png`);
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

    const triggerPrint = () => {
      window.print();
    };

    const btnQuickPrint = document.getElementById('btnQuickPrint');
    if (btnQuickPrint) btnQuickPrint.addEventListener('click', triggerPrint);

    const btnPrintAll = document.getElementById('btnPrintAll');
    if (btnPrintAll) btnPrintAll.addEventListener('click', triggerPrint);
  }
}

// 页面加载完成后启动应用
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
