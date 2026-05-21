/*
  Bodija International College - Main Script
  Contains: Loader, CMS Hydration, Hero Logic (Video->Photo), Mobile Menu, Lightbox, Form Handling
  ENHANCED: Dynamic viewport-based asset management for hero section
  FIXED: Loader dismissal reliability and video event handling
*/

document.addEventListener('DOMContentLoaded', () => {
  
  // --- Global Constants ---
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // --- 1. Loader Logic ---
  const loader = document.getElementById('loader');

  const hideLoader = () => {
    if (!loader) return;
    console.log('[Loader] Hiding loader');
    loader.style.opacity = '0';
    setTimeout(() => {
      loader.setAttribute('aria-hidden', 'true');
      loader.style.display = 'none';
    }, 600);
  };

  const showLoader = () => {
    if (!loader) return;
    loader.style.display = '';
    loader.setAttribute('aria-hidden', 'false');
    loader.style.opacity = '1';
  };

  // --- 2. CMS Hydration ---
  const hydrateCMS = () => {
    const cms = window.__CMS__;
    if (!cms) return;

    // Text Content
    const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.innerHTML = val; };
    setTxt('heroEyebrow', cms.hero.eyebrow);
    setTxt('heroTitle', cms.hero.title);
    setTxt('heroKicker', cms.hero.kicker);
    
    const btn1 = document.getElementById('ctaPrimary');
    const btn2 = document.getElementById('ctaSecondary');
    if(btn1) {
        const span = btn1.querySelector('span');
        if (span) span.textContent = cms.hero.ctaPrimary;
    }
    if(btn2) {
        const span = btn2.querySelector('span');
        if (span) span.textContent = cms.hero.ctaSecondary;
    }

    // Program Grid
    const progGrid = document.getElementById('programGrid');
    if (progGrid && cms.programs) {
      progGrid.innerHTML = cms.programs.map((p, i) => `
        <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-md card-spring reveal-el" style="transition-delay: ${i * 150}ms;">
          <div class="w-2 h-2 rounded-full mb-6" style="background-color: ${p.color}"></div>
          <h3 class="text-xl font-bold font-display text-slate-900 mb-3">${p.title}</h3>
          <p class="text-slate-600 leading-relaxed">${p.description}</p>
        </div>
      `).join('');
    }

    // Set up Intersection Observer for newly created elements
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };

    const fadeObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target); 
        }
      });
    }, observerOptions);

    if (progGrid) {
        const revealElements = progGrid.querySelectorAll('.reveal-el');
        revealElements.forEach(el => fadeObserver.observe(el));
    }
  };
  hydrateCMS();

  // --- 3. Hero Video -> Photo Mechanism with Dynamic Asset Management ---
  
  class HeroAssetManager {
    constructor() {
      this.currentViewport = null;
      this.mediaQueryDesktop = window.matchMedia('(min-width: 1024px)');
      this.mediaQueryTablet = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
      this.mediaQueryMobile = window.matchMedia('(max-width: 767px)');
      this.videoContainer = document.getElementById('videoContainer');
      this.heroPoster = document.getElementById('heroPoster');
      this.currentVideo = null;
      this.resizeObserver = null;
      this.mediaQueryListener = this.onViewportChange.bind(this);
      this.isInitialLoad = true;
    }

    getCurrentViewport() {
      if (this.mediaQueryDesktop.matches) return 'desktop';
      if (this.mediaQueryTablet.matches) return 'tablet';
      return 'mobile';
    }

    getAssetForViewport(viewport) {
      const cms = window.__CMS__;
      if (!cms || !cms.hero) return { video: null, poster: null };

      const assets = {
        mobile: {
          video: cms.hero.video || 'hero.mp4',
          poster: cms.hero.poster || 'heroo.jpg'
        },
        tablet: {
          video: cms.hero.videoTablet || cms.hero.video || 'hero.mp4',
          poster: cms.hero.posterTablet || cms.hero.poster || 'heroo.jpg'
        },
        desktop: {
          video: cms.hero.videoDesktop || cms.hero.video || 'hero.mp4',
          poster: cms.hero.posterDesktop || cms.hero.poster || 'heroo.jpg'
        }
      };

      return assets[viewport] || assets.mobile;
    }

    onViewportChange() {
      const newViewport = this.getCurrentViewport();
      if (newViewport !== this.currentViewport) {
        console.log(`[HeroAssetManager] Viewport changed: ${this.currentViewport} → ${newViewport}`);
        this.currentViewport = newViewport;
        this.swapAssets();
      }
    }

    swapAssets() {
      if (!this.videoContainer || !this.heroPoster) return;
      const assets = this.getAssetForViewport(this.currentViewport);
      
      if (this.heroPoster && assets.poster) {
        this.heroPoster.style.backgroundImage = `url('${assets.poster}')`;
      }

      if (assets.video && !prefersReduced) {
        return this.replaceVideo(assets.video);
      } else {
        if (this.heroPoster) this.heroPoster.style.opacity = '1';
        return Promise.resolve();
      }
    }

    replaceVideo(newVideoSrc) {
      if (!this.videoContainer) return Promise.resolve();

      if (this.currentVideo && this.currentVideo.src.includes(newVideoSrc)) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        // Create new video element
        const vid = document.createElement('video');
        vid.src = newVideoSrc;
        vid.muted = true;
        vid.autoplay = true;
        vid.playsInline = true;
        vid.loop = true; // Ensure it loops
        vid.preload = 'auto';
        vid.className = "absolute inset-0 w-full h-full object-cover transition-opacity duration-1000";
        vid.style.opacity = '0';

        let resolved = false;
        const cleanupAndResolve = () => {
          if (resolved) return;
          resolved = true;
          resolve();
        };

        const onCanPlay = () => {
          console.log('[HeroAssetManager] Video can play');
          vid.style.opacity = '1';
          if (this.heroPoster) this.heroPoster.style.opacity = '0';
          
          // Remove old video if exists
          if (this.currentVideo && this.currentVideo !== vid) {
            const oldVid = this.currentVideo;
            oldVid.style.opacity = '0';
            setTimeout(() => {
              if (oldVid.parentNode) oldVid.remove();
            }, 1000);
          }
          this.currentVideo = vid;
          cleanupAndResolve();
        };

        const onError = (e) => {
          console.warn('[HeroAssetManager] Video failed to load', e);
          if (this.heroPoster) this.heroPoster.style.opacity = '1';
          if (vid.parentNode) vid.remove();
          cleanupAndResolve();
        };

        vid.addEventListener('canplaythrough', onCanPlay, { once: true });
        vid.addEventListener('canplay', onCanPlay, { once: true });
        vid.addEventListener('error', onError, { once: true });

        this.videoContainer.appendChild(vid);

        vid.play().catch(() => {
          console.warn('[HeroAssetManager] Autoplay blocked');
          if (this.heroPoster) this.heroPoster.style.opacity = '1';
          cleanupAndResolve();
        });

        // Safety fallback for slow networks
        setTimeout(cleanupAndResolve, 4000);
      });
    }

    init() {
      this.currentViewport = this.getCurrentViewport();
      
      this.mediaQueryDesktop.addEventListener('change', this.mediaQueryListener);
      this.mediaQueryTablet.addEventListener('change', this.mediaQueryListener);
      this.mediaQueryMobile.addEventListener('change', this.mediaQueryListener);

      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(() => {
          const newViewport = this.getCurrentViewport();
          if (newViewport !== this.currentViewport) {
            this.onViewportChange();
          }
        });
        this.resizeObserver.observe(document.documentElement);
      }

      return this.swapAssets();
    }
  }

  const heroAssetManager = new HeroAssetManager();

  function initHeroAnimation() {
    return new Promise((resolve) => {
      const heroPoster = document.getElementById('heroPoster');
      
      let resolved = false;
      const markReady = () => {
        if (resolved) return;
        resolved = true;
        console.log('[Hero] Hero is ready');

        if (heroPoster && heroPoster.style.opacity !== '0') {
            heroPoster.style.opacity = '1';
        }

        const animEls = ['heroEyebrow', 'heroTitle', 'heroKicker', 'heroButtons'];
        animEls.forEach((id, idx) => {
          const el = document.getElementById(id);
          if (el) {
            setTimeout(() => {
              el.classList.remove('opacity-0', 'translate-y-8');
              el.classList.add('transition-all', 'duration-700', 'ease-out');
            }, 300 + (idx * 150));
          }
        });

        resolve();
      };

      // Initialize asset manager and wait for initial asset
      heroAssetManager.init().then(markReady).catch(markReady);

      // Ultimate fallback to ensure loader is always dismissed
      setTimeout(markReady, 5000);
    });
  }

  // Wait for full page load
  window.addEventListener('load', () => {
    console.log('[Window] Page loaded');
    initHeroAnimation().then(() => {
      setTimeout(hideLoader, 400);
    });
  });

  // --- 4. Mobile Menu ---
  // (Assuming mobile menu logic is handled by inline scripts or already present)

  // --- 5. Gallery Lightbox ---
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
      const lbImg = document.getElementById('lbImg');
      const lbTitle = document.getElementById('lbTitle');
      const lbCounter = document.getElementById('lbCounter');
      const lbLoader = document.getElementById('lbLoader');
      let currentArchive = [];
      let currentIndex = 0;

      const openLightbox = (archive, index, title) => {
        currentArchive = archive;
        currentIndex = index;
        lightbox.classList.remove('hidden');
        setTimeout(() => lightbox.classList.remove('opacity-0'), 10);
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        updateLightboxImage(title);
        const closeBtn = document.getElementById('lbClose');
        if (closeBtn) closeBtn.focus();
      };

      const closeLightbox = () => {
        lightbox.classList.add('opacity-0');
        setTimeout(() => {
          lightbox.classList.add('hidden');
          lightbox.setAttribute('aria-hidden', 'true');
          if (lbImg) lbImg.src = "";
        }, 300);
        document.body.style.overflow = '';
      };

      const updateLightboxImage = (overrideTitle) => {
        if (!lbImg) return;
        const src = currentArchive[currentIndex];
        if (lbLoader) lbLoader.style.opacity = '1';
        lbImg.style.opacity = '0.5';

        const imgObj = new Image();
        imgObj.onload = () => {
          lbImg.src = src;
          lbImg.style.opacity = '1';
          if (lbLoader) lbLoader.style.opacity = '0';
        };
        imgObj.src = src;

        if (overrideTitle && lbTitle) lbTitle.textContent = overrideTitle;
        if (lbCounter) lbCounter.textContent = `${currentIndex + 1} / ${currentArchive.length}`;
      };

      document.querySelectorAll('.gallery-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const rawArchive = item.dataset.archive;
          const title = item.dataset.title;
          let archive = [];
          try { archive = JSON.parse(rawArchive); } catch(e) { archive = [item.dataset.src]; }
          openLightbox(archive, 0, title);
        });
      });

      const nextBtn = document.getElementById('lbNext');
      const prevBtn = document.getElementById('lbPrev');
      const closeBtn = document.getElementById('lbClose');

      if (nextBtn) nextBtn.addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % currentArchive.length;
        updateLightboxImage();
      });
      if (prevBtn) prevBtn.addEventListener('click', () => {
        currentIndex = (currentIndex - 1 + currentArchive.length) % currentArchive.length;
        updateLightboxImage();
      });
      if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
      
      lightbox.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') {
            currentIndex = (currentIndex + 1) % currentArchive.length;
            updateLightboxImage();
        }
        if (e.key === 'ArrowLeft') {
            currentIndex = (currentIndex - 1 + currentArchive.length) % currentArchive.length;
            updateLightboxImage();
        }
        if (e.key === 'Escape') closeLightbox();
      });
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
      });
  }

  // --- 7. Header Scroll Effect ---
  window.addEventListener('scroll', () => {
    const header = document.getElementById('mainHeader');
    const brandBtn = document.querySelector('.brand-btn');
    if (!header) return;
    
    if (window.scrollY > 100) {
      header.classList.add('bg-white/90', 'backdrop-blur-md', 'shadow-sm');
      header.querySelectorAll('nav a, span.font-semibold').forEach(el => {
        el.classList.remove('text-white', 'mix-blend-difference');
        el.classList.add('text-slate-900');
      });
      if (brandBtn) brandBtn.classList.add('scrolled');
    } else {
      header.classList.remove('bg-white/90', 'backdrop-blur-md', 'shadow-sm');
      header.querySelectorAll('nav a, span.font-semibold').forEach(el => {
        el.classList.add('text-white', 'mix-blend-difference');
        el.classList.remove('text-slate-900');
      });
      if (brandBtn) brandBtn.classList.remove('scrolled');
    }
  });

  // --- 8. Footer Year ---
  const currentYearEl = document.getElementById('currentYear');
  if (currentYearEl) currentYearEl.textContent = new Date().getFullYear();

});

// Intersection Observer for BIC Reveal
(function initBICReveal() {
  'use strict';

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.bic-reveal').forEach(el => observer.observe(el));

  const lineObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        lineObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05 });

  const tLine = document.getElementById('timelineLine');
  if (tLine) lineObserver.observe(tLine);

  document.querySelectorAll('.gold-rule').forEach(el => {
    const rObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { el.classList.add('animate'); rObs.unobserve(el); }
      });
    }, { threshold: 0.5 });
    rObs.observe(el);
  });
})();
