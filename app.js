(function () {
  const cfg = window.SITE_CONFIG || {};
  const C = (p, root = cfg) => p.split('.').reduce((o, k) => (o || {})[k], root);

  // bind text/href from config
  document.querySelectorAll('[data-bind]').forEach(el => {
    const v = C(el.getAttribute('data-bind'));
    if (typeof v === 'string' || typeof v === 'number') el.textContent = String(v);
  });
  document.querySelectorAll('[data-bind-href]').forEach(el => {
    const v = C(el.getAttribute('data-bind-href'));
    if (typeof v === 'string' && v && v !== 'https://opensea.io/' && v !== 'https://x.com/' && v !== 'https://etherscan.io/') {
      el.setAttribute('href', v);
    }
  });
  document.title = `${cfg.brand?.name || 'NFT'} — ${cfg.brand?.tagline || ''}`;

  // progress + count-up
  const total = cfg.mint?.totalSupply || 10000;
  const minted = cfg.mint?.minted || total;
  const mintedEl = document.getElementById('mintedNow');
  const fill = document.getElementById('progressFill');
  fill.style.width = `${(minted / total) * 100}%`;
  let cur = 0;
  const step = Math.max(1, Math.floor(total / 60));
  const tick = () => {
    cur = Math.min(cur + step, minted);
    if (mintedEl) mintedEl.textContent = cur.toLocaleString();
    if (cur < minted) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

// quantity range slider
  const qty = document.getElementById('qty');
  const qtyLabel = document.getElementById('qtyLabel');
  const totalEth = document.getElementById('totalEth');
  const syncRangeFill = () => {
    const min = +qty.min, max = +qty.max, v = +qty.value;
    const p = ((v - min) / (max - min)) * 100;
    qty.style.setProperty('--p', p + '%');
  };
  const updateTotal = () => {
    if (cfg.mint?.soldOut) {
      totalEth.textContent = 'pending';
    } else {
      const n = Math.max(1, parseInt(qty.value || '1', 10));
      totalEth.textContent = (n * (cfg.mint?.priceEth || 0)) + ' ETH';
    }
  };
  const syncQty = () => {
    const v = Math.max(1, Math.min(10, parseInt(qty.value, 10) || 1));
    qtyLabel.textContent = v;
    syncRangeFill();
    updateTotal();
  };
  qty.addEventListener('input', syncQty);
  syncQty();

  // Carousel
  const carousel = document.getElementById('carousel');
  const track = document.getElementById('carouselTrack');
  const dotsEl = document.getElementById('carouselDots');
  const idxEl = document.getElementById('carouselIndex');
  const totEl = document.getElementById('carouselTotal');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');
  const images = Array.isArray(cfg.gallery) && cfg.gallery.length
    ? cfg.gallery
    : ['img/preview.svg'];
  let idx = 0;
  let autoTimer = null;
  let hoverPaused = false;

  images.forEach((src, i) => {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    const img = document.createElement('img');
    img.src = src;
    img.alt = `${cfg.brand?.name || 'NFT'} preview ${i + 1}`;
    img.loading = i === 0 ? 'eager' : 'lazy';
    img.draggable = false;
    slide.appendChild(img);
    track.appendChild(slide);

    const dot = document.createElement('button');
    dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Go to image ${i + 1}`);
    dot.addEventListener('click', () => goTo(i, true));
    dotsEl.appendChild(dot);
  });

  totEl.textContent = images.length;

  const goTo = (i, fromUser) => {
    idx = (i + images.length) % images.length;
    track.style.transform = `translateX(-${idx * 100}%)`;
    dotsEl.querySelectorAll('.carousel-dot').forEach((d, di) => d.classList.toggle('active', di === idx));
    idxEl.textContent = idx + 1;
    if (fromUser) restartAuto();
  };
  const next = () => goTo(idx + 1);
  const prev = () => goTo(idx - 1);

  nextBtn.addEventListener('click', () => { next(); restartAuto(); });
  prevBtn.addEventListener('click', () => { prev(); restartAuto(); });

  // keyboard arrows
  carousel.tabIndex = 0;
  carousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { next(); restartAuto(); }
    if (e.key === 'ArrowLeft') { prev(); restartAuto(); }
  });

  // touch swipe
  let touchX = null;
  carousel.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  carousel.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); restartAuto(); }
    touchX = null;
  });

  // autoplay
  const startAuto = () => {
    const ms = parseInt(carousel.dataset.autoplay || '4000', 10);
    if (images.length > 1) autoTimer = setInterval(() => { if (!hoverPaused) next(); }, ms);
  };
  const stopAuto = () => clearInterval(autoTimer);
  const restartAuto = () => { stopAuto(); startAuto(); };
  carousel.addEventListener('mouseenter', () => { hoverPaused = true; });
  carousel.addEventListener('mouseleave', () => { hoverPaused = false; });
  document.addEventListener('visibilitychange', () => { document.hidden ? stopAuto() : startAuto(); });
  startAuto();

  // modals
  const openModal = (id) => {
    const m = document.getElementById(id);
    if (m) { m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
  };
  const closeModal = (m) => { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); };

  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]')) closeModal(m);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(closeModal);
  });

  document.getElementById('connectBtn').addEventListener('click', () => openModal('walletModal'));
  document.querySelectorAll('.wallet-btn').forEach(b => {
    b.addEventListener('click', () => {
      // Demo: replace with real web3 connect (window.ethereum / WalletConnect)
      closeModal(document.getElementById('walletModal'));
      const btn = document.getElementById('connectBtn');
      btn.textContent = `${b.dataset.wallet} · 0x…`;
      btn.style.fontSize = '11px';
    });
  });

  const mintBtn = document.getElementById('mintBtn');
  mintBtn.addEventListener('click', (e) => {
    // ignore inner "Buy on OpenSea" link click
    if (e.target.closest('.btn-buy-inline')) return;
    if (cfg.mint?.soldOut) {
      // Open secondary market
      window.open(cfg.mint?.secondaryUrl || cfg.links?.opensea, '_blank');
      return;
    }
    const n = Math.max(1, parseInt(qty.value || '1', 10));
    document.getElementById('reviewQty').textContent = n;
    document.getElementById('reviewTotal').textContent = (n * (cfg.mint?.priceEth || 0)) + ' ETH';
    openModal('reviewModal');
  });

  document.getElementById('confirmBtn').addEventListener('click', () => {
    closeModal(document.getElementById('reviewModal'));
    openModal('shareModal');
  });

  // share modal trigger from footer-ish link if present
  document.querySelectorAll('a[href="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (a.textContent.includes('Share')) openModal('shareModal');
    });
  });
})();