// ============================================================
// Content Script - 注入到招聘网站页面
// 自动检测 JD、显示浮动按钮（支持多种打开模式）
// ============================================================

// 引入 JD 解析器（esbuild 打包时会内联）
import { extractJD, JDParsers } from './services/jd-parser.js';

(function () {
  'use strict';

  // 避免重复注入
  if (window.__interviewAI_loaded) return;
  window.__interviewAI_loaded = true;

  // ---- 检测 JD ----
  let detectedJD = null;
  let floatingBtn = null;
  let menuOpen = false;

  function tryDetectJD() {
    const result = extractJD();
    if (result.success && result.fullText.length > 30) {
      detectedJD = result;
      showFloatingButton();
      // 通知 background
      chrome.runtime.sendMessage({
        action: 'jdDetected',
        jdData: result,
      });
    }
  }

  // 延迟检测（等待页面动态加载）
  setTimeout(tryDetectJD, 1500);
  // SPA 路由变化时重新检测
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      detectedJD = null;
      removeFloatingButton();
      setTimeout(tryDetectJD, 2000);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ---- 浮动按钮 ----
  function showFloatingButton() {
    if (floatingBtn) return;

    floatingBtn = document.createElement('div');
    floatingBtn.id = 'interview-ai-float-btn';
    floatingBtn.innerHTML = `
      <div class="iai-dropdown-menu" style="display:none;">
        <div class="iai-menu-item" data-mode="sidepanel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2"/>
            <path d="M15 3v18"/>
          </svg>
          <span>侧边栏打开</span>
        </div>
        <div class="iai-menu-item" data-mode="newtab">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" x2="21" y1="14" y2="3"/>
          </svg>
          <span>新标签页打开</span>
        </div>
      </div>
      <div class="iai-btn-inner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="10" x2="12" y2="18"/>
          <path d="M12 6.5v0" stroke-width="3"/>
        </svg>
        <span>AI 面试</span>
      </div>
    `;

    // ---- 拖拽 + 点击 ----
    const mainBtn = floatingBtn.querySelector('.iai-btn-inner');
    let isDragging = false;
    let hasDragged = false;
    let startX = 0, startY = 0;
    let btnStartRight = 0, btnStartBottom = 0;
    const DRAG_THRESHOLD = 5;

    // 恢复上次保存的位置
    try {
      const saved = sessionStorage.getItem('iai-btn-pos');
      if (saved) {
        const pos = JSON.parse(saved);
        const maxX = window.innerWidth - 60;
        const maxY = window.innerHeight - 60;
        floatingBtn.style.right = Math.min(Math.max(pos.right, 8), maxX) + 'px';
        floatingBtn.style.bottom = Math.min(Math.max(pos.bottom, 8), maxY) + 'px';
      }
    } catch (_) {}

    function savePosition() {
      try {
        const right = parseInt(floatingBtn.style.right) || 24;
        const bottom = parseInt(floatingBtn.style.bottom) || 100;
        sessionStorage.setItem('iai-btn-pos', JSON.stringify({ right, bottom }));
      } catch (_) {}
    }

    function clampPosition() {
      const btnSize = 48;
      const pad = 8;
      const maxRight = window.innerWidth - btnSize - pad;
      const maxBottom = window.innerHeight - btnSize - pad;
      let right = parseInt(floatingBtn.style.right) || 24;
      let bottom = parseInt(floatingBtn.style.bottom) || 100;
      right = Math.min(Math.max(right, pad), maxRight);
      bottom = Math.min(Math.max(bottom, pad), maxBottom);
      floatingBtn.style.right = right + 'px';
      floatingBtn.style.bottom = bottom + 'px';
    }

    // 使用 capture phase 确保不被页面 JS 拦截
    mainBtn.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      hasDragged = false;
      startX = e.clientX;
      startY = e.clientY;
      btnStartRight = parseInt(floatingBtn.style.right) || 24;
      btnStartBottom = parseInt(floatingBtn.style.bottom) || 100;
    }, true);

    // mousemove / mouseup 用 capture phase + 绑定到 document
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!hasDragged && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
        hasDragged = true;
        floatingBtn.classList.add('iai-dragging');
        if (menuOpen) closeMenu();
      }

      if (hasDragged) {
        floatingBtn.style.right = (btnStartRight - dx) + 'px';
        floatingBtn.style.bottom = (btnStartBottom - dy) + 'px';
        clampPosition();
      }
    }, true);

    document.addEventListener('mouseup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      floatingBtn.classList.remove('iai-dragging');

      if (hasDragged) {
        // 拖拽结束 → 保存位置
        savePosition();
        hasDragged = false;
      } else if (!floatingBtn.classList.contains('iai-loading')) {
        // 未拖拽且非 loading → 视为点击，切换菜单
        toggleMenu();
      }
    }, true);

    // 拦截主按钮的 click 事件，防止拖拽后误触发
    mainBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
    }, true);

    // 菜单项点击
    floatingBtn.querySelectorAll('.iai-menu-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = item.dataset.mode;
        closeMenu();
        handleModeSelect(mode);
      });
    });

    // 点击页面其他位置关闭菜单
    document.addEventListener('click', () => {
      if (menuOpen) closeMenu();
    });

    // 窗口尺寸变化时修正位置
    window.addEventListener('resize', () => {
      if (floatingBtn) clampPosition();
    });

    document.body.appendChild(floatingBtn);
  }

  function toggleMenu() {
    menuOpen = !menuOpen;
    const menu = floatingBtn.querySelector('.iai-dropdown-menu');
    menu.style.display = menuOpen ? 'flex' : 'none';
    floatingBtn.classList.toggle('iai-menu-open', menuOpen);
  }

  function closeMenu() {
    menuOpen = false;
    const menu = floatingBtn?.querySelector('.iai-dropdown-menu');
    if (menu) menu.style.display = 'none';
    floatingBtn?.classList.remove('iai-menu-open');
  }

  function removeFloatingButton() {
    if (floatingBtn) {
      floatingBtn.remove();
      floatingBtn = null;
    }
  }

  // ---- 根据模式执行对应操作 ----
  async function handleModeSelect(mode) {
    // 如果有已检测到的 JD，先分析再生成题目
    if (detectedJD) {
      floatingBtn.classList.add('iai-loading');

      try {
        const analysisResp = await chrome.runtime.sendMessage({
          action: 'analyzeJD',
          jdText: detectedJD.fullText,
          jdData: detectedJD,
        });

        if (!analysisResp.success) {
          showToast(analysisResp.error || '分析失败', 'error');
          resetButton();
          return;
        }

        const questionsResp = await chrome.runtime.sendMessage({
          action: 'generateQuestions',
          analysis: analysisResp.analysis,
          count: 5,
        });

        if (!questionsResp.success) {
          showToast(questionsResp.error || '生成题目失败', 'error');
          resetButton();
          return;
        }
      } catch (err) {
        showToast('分析失败: ' + err.message, 'error');
        resetButton();
        return;
      }

      resetButton();
    }

    // 打开对应界面
    try {
      if (mode === 'sidepanel') {
        await chrome.runtime.sendMessage({ action: 'openSidePanel' });
        showToast('请在侧边栏查看', 'success');
      } else if (mode === 'newtab') {
        await chrome.runtime.sendMessage({ action: 'openNewTab' });
        showToast('已在新标签页打开', 'success');
      }

      chrome.runtime.sendMessage({ action: 'setDisplayMode', mode });
    } catch (err) {
      showToast('打开失败: ' + err.message, 'error');
    }
  }

  function resetButton() {
    floatingBtn?.classList.remove('iai-loading');
  }

  // ---- Toast 提示 ----
  function showToast(text, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `iai-toast iai-toast-${type}`;
    toast.textContent = text;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('iai-toast-show');
    });

    setTimeout(() => {
      toast.classList.remove('iai-toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ---- 监听来自 background/popup 的消息 ----
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getJD') {
      sendResponse(detectedJD || extractJD());
    }
    if (message.action === 'extractJD') {
      sendResponse(extractJD());
    }
  });
})();
