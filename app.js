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

  // Carousel (autoplay only — no manual controls)
  const carousel = document.getElementById('carousel');
  const track = document.getElementById('carouselTrack');
  const idxEl = document.getElementById('carouselIndex');
  const totEl = document.getElementById('carouselTotal');
  const images = Array.isArray(cfg.gallery) && cfg.gallery.length
    ? cfg.gallery
    : ['img/preview.svg'];
  let idx = 0;
  let autoTimer = null;

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
  });

  totEl.textContent = images.length;

  const goTo = (i) => {
    idx = (i + images.length) % images.length;
    track.style.transform = `translateX(-${idx * 100}%)`;
    idxEl.textContent = idx + 1;
  };
  const next = () => goTo(idx + 1);

  // autoplay
  const startAuto = () => {
    const ms = parseInt(carousel.dataset.autoplay || '3500', 10);
    if (images.length > 1) autoTimer = setInterval(next, ms);
  };
  const stopAuto = () => clearInterval(autoTimer);
  document.addEventListener('visibilitychange', () => {
    document.hidden ? stopAuto() : startAuto();
  });
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