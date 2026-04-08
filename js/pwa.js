// PWA：注册 Service Worker + 安装引导（桌面/Android 一键安装，iOS 给出指引）
(function () {
  const DISMISS_KEY = 'pwa_install_guide_dismissed_v1';

  function isStandalone() {
    return (
      window.matchMedia &&
      window.matchMedia('(display-mode: standalone)').matches
    ) || window.navigator.standalone === true;
  }

  function isIOS() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  }

  function isIOSSafari() {
    const ua = navigator.userAgent || '';
    return isIOS() && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  }

  function isDismissed() {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function dismissPermanently() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch (e) {}
  }

  // --- Service Worker ---
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((reg) => {
          // 手动触发更新检查
          if (typeof reg.update === 'function') {
            reg.update().catch(() => {});
          }

          // 如果发现有新 SW 在等待（已安装但未激活），让它接管
          if (reg.waiting) {
            // 这里可以弹 UI 提示用户“点击刷新”，或者直接重载
            // 为了稳妥（且用户正在说页面没变化），我们暂不自动刷新，避免打断操作，
            // 而是依赖 sw 自身的 skipWaiting。
            // 但如果用户说“没变化”，很可能是 sw 卡住了。
            // 我们可以监听 controllerchange 来做一次重载。
          }
        })
        .catch(() => {
          // ignore
        });
    });

    // 当新的 Service Worker 激活并接管页面时，刷新当前页
    // 稳妥：每个版本只刷新一次，避免极端情况下出现循环刷新
    const RELOAD_KEY = 'sw_reloaded_cache_version';
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const currentVer = (window.__CACHE_VERSION__ || '').toString();
        const lastVer = localStorage.getItem(RELOAD_KEY) || '';
        if (currentVer && currentVer === lastVer) return;
        if (currentVer) localStorage.setItem(RELOAD_KEY, currentVer);
      } catch (e) {}
      window.location.reload();
    });
  }

  // --- Install guide ---
  let deferredPrompt = null;
  let bannerEl = null;

  function hideBanner({ permanent = false } = {}) {
    if (permanent) dismissPermanently();
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
  }

  function ensureBanner() {
    if (bannerEl) return bannerEl;

    const el = document.createElement('div');
    el.className = 'pwa-install-banner';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '安装提示');

    el.innerHTML = `
      <div class="pwa-install-text">
        <div class="pwa-install-title" id="pwaInstallTitle"></div>
        <div class="pwa-install-desc" id="pwaInstallDesc"></div>
      </div>
      <div class="pwa-install-actions">
        <button type="button" class="pwa-install-btn" id="pwaInstallPrimary"></button>
        <button type="button" class="pwa-install-secondary" id="pwaInstallSecondary">暂不</button>
        <button type="button" class="pwa-install-close" id="pwaInstallClose" aria-label="不再提示">×</button>
      </div>
    `;

    document.body.appendChild(el);

    el.querySelector('#pwaInstallSecondary')?.addEventListener('click', () => hideBanner());
    el.querySelector('#pwaInstallClose')?.addEventListener('click', () => hideBanner({ permanent: true }));

    bannerEl = el;
    return el;
  }

  function setBannerContent({ title, desc, primaryText, onPrimary }) {
    const el = ensureBanner();
    const titleEl = el.querySelector('#pwaInstallTitle');
    const descEl = el.querySelector('#pwaInstallDesc');
    const primaryBtn = el.querySelector('#pwaInstallPrimary');

    if (titleEl) titleEl.textContent = title || '';
    if (descEl) descEl.textContent = desc || '';
    if (primaryBtn) {
      primaryBtn.textContent = primaryText || '安装';
      primaryBtn.onclick = onPrimary || null;
    }
  }

  function maybeShowIOSGuide() {
    if (!isIOS()) return false;
    if (isStandalone()) return false;
    if (isDismissed()) return false;

    const desc = isIOSSafari()
      ? '在 Safari 点击“分享”→“添加到主屏幕”，即可安装。'
      : 'iPhone/iPad 需要用 Safari 打开，然后“分享”→“添加到主屏幕”。';

    setBannerContent({
      title: '安装到主屏幕',
      desc,
      primaryText: '我知道了',
      onPrimary: () => hideBanner()
    });

    return true;
  }

  async function tryPromptInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    try {
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      return !!(choice && choice.outcome === 'accepted');
    } catch (e) {
      deferredPrompt = null;
      return false;
    }
  }

  function showGenericGuide() {
    if (isStandalone() || isDismissed()) return;
    setBannerContent({
      title: '安装引导',
      desc: '如果浏览器支持安装，可在地址栏或菜单中找到“安装应用/添加到主屏幕”。',
      primaryText: '我知道了',
      onPrimary: () => hideBanner()
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    // 仅在支持安装的浏览器触发（Chrome/Edge/Android Chrome）
    e.preventDefault();
    deferredPrompt = e;
    window.deferredPrompt = e; // 暴露给外部调用

    if (isStandalone() || isDismissed()) return;

    setBannerContent({
      title: '安装应用',
      desc: '可安装到桌面/主屏幕，打开更快，离线也能用。',
      primaryText: '安装',
      onPrimary: async () => {
        const accepted = await tryPromptInstall();
        if (accepted) hideBanner({ permanent: true });
        else hideBanner();
      }
    });
  });

  window.addEventListener('appinstalled', () => {
    hideBanner({ permanent: true });
  });

  document.addEventListener('DOMContentLoaded', () => {
    // iOS 没有 beforeinstallprompt，所以直接给指引
    maybeShowIOSGuide();

    // 顶部「安装」按钮：提供确定的入口
    const installBtn = document.getElementById('installGuideBtn');
    if (installBtn) {
      if (isStandalone()) {
        installBtn.style.display = 'none';
      } else {
        installBtn.addEventListener('click', async () => {
          // iOS：展示指引
          if (isIOS()) {
            maybeShowIOSGuide();
            return;
          }

          // 可一键安装：直接弹系统安装框
          const accepted = await tryPromptInstall();
          if (accepted) {
            hideBanner({ permanent: true });
            return;
          }

          // 否则：给出通用引导说明
          showGenericGuide();
        });
      }
    }
  });

  // 暴露给外部调用（如菜单中的“安装应用”）
  window.deferredPrompt = deferredPrompt;
})();


