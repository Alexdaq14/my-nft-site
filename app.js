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
    if (typeof v === 'string' && v && !/^https:\/\/(opensea\.io|x\.com|etherscan\.io)\/?$/.test(v)) {
      el.setAttribute('href', v);
    }
  });
  document.title = `${cfg.brand?.name || 'NFT'} — ${cfg.brand?.tagline || ''}`;

  // ===== Web3 state =====
  const STATE = {
    provider: null,
    signer: null,
    account: null,
    contract: null,
    readContract: null,
    chainId: null,
    info: null,
    quote: null,
    busy: false,
    walletType: null, // 'metamask' | 'walletconnect' | 'trust' | 'coinbase' | 'injected'
  };

  const $ = (id) => document.getElementById(id);
  const connectBtn = $('connectBtn');
  const connectMenu = $('connectMenu');
  const walletChip = $('walletChip');
  const walletChipText = $('walletChipText');
  const cmAddr = $('cmAddr');
  const cmBalanceVal = $('cmBalanceVal');
  const cmNet = $('cmNet');
  const cmCopy = $('cmCopy');
  const cmView = $('cmView');
  const cmSwitch = $('cmSwitch');
  const cmDisconnect = $('cmDisconnect');
  const qty = $('qty');
  const qtyLabel = $('qtyLabel');
  const totalEth = $('totalEth');
  const mintedNow = $('mintedNow');
  const progressFill = $('progressFill');
  const heroStatus = $('heroStatus');
  const heroTitle = $('heroTitle');
  const mintBtn = $('mintBtn');
  const walletNote = $('walletNote');
  const reviewQty = $('reviewQty');
  const reviewTotal = $('reviewTotal');
  const reviewUnit = $('reviewUnit');
  const reviewFree = $('reviewFree');
  const reviewPaid = $('reviewPaid');

  const fmtEth = (wei) => {
    if (wei == null) return '—';
    const v = Number(wei) / 1e18;
    if (v === 0) return '0';
    if (v < 0.0001) return v.toExponential(2);
    return v.toString().replace(/0+$/, '').replace(/\.$/, '');
  };
  const short = (addr) => addr ? addr.slice(0, 6) + '…' + addr.slice(-4) : '';

  const setConnectLabel = (text, sub) => {
    connectBtn.innerHTML = text;
    connectBtn.title = sub || '';
  };

  const LS_KEY = 'nft:lastAccount';
  const saveAccount = (addr) => { try { if (addr) localStorage.setItem(LS_KEY, addr); else localStorage.removeItem(LS_KEY); } catch {} };
  const loadAccount = () => { try { return localStorage.getItem(LS_KEY) || null; } catch { return null; } };

  const updateChipAndMenu = async () => {
    if (!STATE.account) {
      walletChip.style.display = 'none';
      connectBtn.style.display = '';
      connectMenu.classList.remove('open');
      return;
    }
    walletChip.style.display = 'inline-flex';
    walletChipText.textContent = short(STATE.account);
    walletChip.href = `${cfg.chain.explorerUrl}/address/${STATE.account}`;
    connectBtn.style.display = 'none';
    connectMenu.classList.remove('open');
    cmAddr.textContent = STATE.account;
    cmNet.textContent = `${cfg.chain.name} (${STATE.chainId})`;
    try {
      const bal = await STATE.provider.getBalance(STATE.account);
      cmBalanceVal.textContent = `${fmtEth(bal)} ETH`;
    } catch { cmBalanceVal.textContent = '— ETH'; }
  };

  const openMenu = (e) => { if (e) e.stopPropagation(); if (!STATE.account) return; connectMenu.classList.toggle('open'); };
  const closeMenu = () => connectMenu.classList.remove('open');
  document.addEventListener('click', (e) => {
    if (!connectMenu.contains(e.target) && e.target !== connectBtn && !connectBtn.contains(e.target) && !walletChip.contains(e.target)) closeMenu();
  });
  connectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!STATE.account) openModal('walletModal');
    else openMenu(e);
  });
  walletChip.addEventListener('click', (e) => { e.preventDefault(); openMenu(e); });

  const setBusy = (on, label) => {
    STATE.busy = on;
    mintBtn.disabled = on;
    if (on) mintBtn.classList.add('is-loading');
    else mintBtn.classList.remove('is-loading');
    if (label) mintBtn.querySelector('.mint-label').textContent = label;
  };

  // ===== Read-only contract =====
  // Провайдер создаётся сразу (для read-only запросов), используя chainId из конфига.
  // Если MetaMask подключён — STATE.readContract пересоздаётся с ним в connect().
  function makeReadProvider() {
    const url = (cfg.rpcUrls && cfg.rpcUrls[0]) || cfg.chain?.rpcUrl;
    if (!url) return null;
    return new ethers.JsonRpcProvider(url, cfg.chain?.chainId || undefined);
  }
  function makeReadContract(provider) {
    return new ethers.Contract(cfg.contract.address, window.NFT_ABI, provider);
  }
  STATE.readContract = makeReadContract(makeReadProvider());

  // View helper — всегда через STATE.readContract (читает даже без кошелька)
  async function readView(name, args = []) {
    if (!STATE.readContract) return null;
    return await STATE.readContract[name](...args);
  }

  // ===== Countdown + status =====
  let countdownTimer = null;
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtCountdown(ms) {
    if (ms <= 0) return '00:00:00';
    const total = Math.floor(ms / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  function startCountdown(target, el, prefix) {
    stopCountdown();
    const tick = () => {
      const left = target - Date.now();
      el.textContent = `${prefix} ${fmtCountdown(left)}`;
      if (left <= 0) { stopCountdown(); refreshContractInfo(); }
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
  function stopCountdown() { if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; } }

  function renderStatus({ minted, maxSupply, saleOpen, startMs, endMs, isLiveWindow }) {
    const now = Date.now();
    const soldOut = maxSupply > 0 && minted >= maxSupply;
    const beforeStart = startMs > 0 && now < startMs;
    const afterEnd = endMs > 0 && now > endMs;
    const inWindow = (!startMs || now >= startMs) && (!endMs || now <= endMs);

    if (soldOut) {
      heroStatus.textContent = `${minted.toLocaleString()} of ${maxSupply.toLocaleString()} — SOLD OUT`;
      heroTitle.textContent = 'Sold out — every NFT is minted';
      mintBtn.querySelector('.mint-label').textContent = 'SOLD OUT';
      mintBtn.classList.add('is-disabled');
      mintBtn.disabled = true;
      stopCountdown();
      return;
    }
    if (afterEnd) {
      heroStatus.textContent = 'Mint window closed';
      heroTitle.textContent = 'Mint window has ended';
      mintBtn.querySelector('.mint-label').textContent = 'ENDED';
      mintBtn.classList.add('is-disabled');
      mintBtn.disabled = true;
      stopCountdown();
      return;
    }
    if (beforeStart) {
      heroStatus.textContent = `${minted.toLocaleString()} of ${maxSupply.toLocaleString()} minted`;
      heroTitle.textContent = 'Mint starts in';
      startCountdown(startMs, heroTitle, '');
      mintBtn.querySelector('.mint-label').textContent = 'MINT STARTS IN';
      mintBtn.classList.add('is-disabled');
      mintBtn.disabled = true;
      return;
    }
    // In window — show MINT IS LIVE regardless of saleOpen
    heroStatus.textContent = `${minted.toLocaleString()} of ${maxSupply.toLocaleString()} minted — MINT IS LIVE`;
    heroTitle.textContent = 'Mint is live';
    if (inWindow && endMs > 0) {
      const left = endMs - now;
      if (left < 24 * 3600 * 1000) {
        const hh = Math.floor(left / 3600000);
        const mm = Math.floor((left % 3600000) / 60000);
        const ss = Math.floor((left % 60000) / 1000);
        const cd = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
        heroTitle.textContent = `Ends in ${cd}`;
        startCountdown(endMs, heroTitle, 'Ends in');
      } else {
        stopCountdown();
      }
    } else {
      stopCountdown();
    }
    // Кнопка: активна если есть аккаунт и saleOpen; иначе — яркая "Connect to mint"
    if (!STATE.busy) {
      if (STATE.account && saleOpen) {
        mintBtn.querySelector('.mint-label').textContent = 'MINT';
        mintBtn.classList.remove('is-disabled');
        mintBtn.disabled = false;
      } else if (!STATE.account) {
        mintBtn.querySelector('.mint-label').textContent = 'CONNECT WALLET TO MINT';
        mintBtn.classList.remove('is-disabled');
        mintBtn.disabled = false;
      } else {
        mintBtn.querySelector('.mint-label').textContent = 'SALE PAUSED';
        mintBtn.classList.add('is-disabled');
        mintBtn.disabled = true;
      }
    }
  }
  let progressTarget = 0;
  let progressShown = 0;
  const animateProgress = () => {
    if (progressShown < progressTarget) {
      const step = Math.max(1, Math.ceil((progressTarget - progressShown) / 20));
      progressShown = Math.min(progressTarget, progressShown + step);
      mintedNow.textContent = progressShown.toLocaleString();
      requestAnimationFrame(animateProgress);
    } else if (progressShown > progressTarget) {
      progressShown = progressTarget;
      mintedNow.textContent = progressShown.toLocaleString();
    }
  };

  // ===== Quantity slider =====
  const syncRangeFill = () => {
    const min = +qty.min, max = +qty.max, v = +qty.value;
    const p = ((v - min) / (max - min)) * 100;
    qty.style.setProperty('--p', p + '%');
  };
  const updateTotal = async () => {
    const cap = +qty.max;
    const n = Math.max(1, Math.min(cap, parseInt(qty.value, 10) || 1));
    qtyLabel.textContent = n;
    syncRangeFill();
    if (!STATE.readContract) { totalEth.textContent = '—'; return; }
    try {
      if (STATE.account) {
        const [required] = await readView('quoteMint', [STATE.account, n]);
        STATE.quote = { required: required ?? 0n, n };
        totalEth.textContent = fmtEth(required) + ' ETH';
      } else {
        const [minted, freeTh, priceWei] = await Promise.all([
          readView('totalMinted'),
          readView('freeThreshold'),
          readView('mintPrice'),
        ]);
        const remaining = Number(freeTh) - Number(minted);
        const freeSlots = remaining > 0 ? Math.min(n, remaining) : 0;
        const paidSlots = n - freeSlots;
        const required = BigInt(paidSlots) * (priceWei || 0n);
        STATE.quote = { required, n, freeCount: BigInt(freeSlots), paidCount: BigInt(paidSlots) };
        totalEth.textContent = freeSlots === n ? 'FREE' : (fmtEth(required) + ' ETH');
      }
    } catch (e) {
      totalEth.textContent = '—';
    }
  };
  qty.addEventListener('input', () => { updateTotal(); });
  syncRangeFill();

  // ===== Carousel (GIF — no autoplay needed) =====
  const carousel = $('carousel');
  const track = $('carouselTrack');
  const idxEl = $('carouselIndex');
  const totEl = $('carouselTotal');
  const images = Array.isArray(cfg.gallery) && cfg.gallery.length ? cfg.gallery : ['img/preview.svg'];
  let idx = 0;

  images.forEach((src, i) => {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    const img = document.createElement('img');
    img.src = src; img.alt = `${cfg.brand?.name || 'NFT'} preview ${i + 1}`;
    img.loading = i === 0 ? 'eager' : 'lazy';
    img.draggable = false;
    img.decoding = 'async';
    slide.appendChild(img);
    track.appendChild(slide);
  });
  totEl.textContent = images.length;
  const goTo = (i) => {
    idx = (i + images.length) % images.length;
    track.style.transform = `translateX(-${idx * 100}%)`;
    idxEl.textContent = idx + 1;
  };

  // no autoplay — GIF animates itself

  // ===== Modals =====
  const openModal = (id) => { const m = $(id); if (m) { m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); } };
  const closeModal = (m) => { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); };
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', (e) => { if (e.target.matches('[data-close]')) closeModal(m); });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(closeModal); });

  // ===== Error messages =====
  const ERROR_MAP = {
    'MaxSupplyExceeded': 'All NFTs are minted — sold out.',
    'MaxPerWalletExceeded': 'You reached the per-wallet limit.',
    'IncorrectPayment': 'Not enough ETH sent.',
    'SaleNotOpen': 'Sale is not open right now.',
    'InvalidSaleWindow': 'Sale window is invalid.',
    'InvalidFreeThreshold': 'Free threshold is invalid.',
    'InvalidAmount': 'Invalid amount.',
    'InvalidAddress': 'Invalid address.',
    'InvalidRoyalty': 'Invalid royalty.',
    'WithdrawalFailed': 'Withdraw failed.',
    'TransferRejected': 'Transfer rejected.',
    'MetadataFrozenError': 'Metadata is frozen.',
    'User rejected': 'Transaction rejected in wallet.',
  };
  const explainError = (e) => {
    const msg = (e && e.shortMessage) || (e && e.message) || String(e);
    for (const k of Object.keys(ERROR_MAP)) if (msg.includes(k)) return ERROR_MAP[k];
    if (msg.includes('insufficient funds')) return 'Not enough ETH for mint + gas.';
    if (msg.includes('user rejected') || msg.includes('User denied')) return ERROR_MAP['User rejected'];
    return msg.length > 140 ? msg.slice(0, 140) + '…' : msg;
  };

  // ===== Connect wallet =====
  const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  const MM_DEEPLINK = (u) => `https://metamask.app.link/dapp/${u.replace(/^https?:\/\//, '')}`;
  const MM_SCHEME = (u) => `metamask://dapp/${u.replace(/^https?:\/\//, '')}`;

  async function getEIP6963Provider() {
    return new Promise((resolve) => {
      let resolved = null;
      const onAnnounce = (event) => {
        const { info, provider } = event.detail;
        if (info?.rdns === 'io.metamask' || info?.name?.toLowerCase().includes('metamask')) {
          resolved = provider; window.removeEventListener('eip6963:announceProvider', onAnnounce);
          resolve(resolved);
        }
      };
      window.addEventListener('eip6963:announceProvider', onAnnounce);
      window.dispatchEvent(new Event('eip6963:requestProvider'));
      setTimeout(() => resolve(resolved), 200);
    });
  }

  async function switchChain(provider) {
    const targetHex = cfg.chain?.hexChainId;
    if (!targetHex) return;
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetHex }] });
    } catch (sw) {
      if (sw.code === 4902 || /Unrecognized chain/i.test(sw.message || '')) {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: targetHex,
            chainName: cfg.chain.name,
            rpcUrls: [cfg.chain.rpcUrl],
            blockExplorerUrls: [cfg.chain.explorerUrl],
            nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
          }],
        });
      } else {
        throw sw;
      }
    }
  }

  async function finalizeConnection(provider, walletType) {
    const bp = new ethers.BrowserProvider(provider, 'any');
    await bp.send('eth_requestAccounts', []);
    const signer = await bp.getSigner();
    const account = await signer.getAddress();
    const net = await bp.getNetwork();
    await switchChain(provider);

    STATE.provider = bp;
    STATE.signer = signer;
    STATE.account = account;
    STATE.chainId = Number(net.chainId);
    STATE.contract = new ethers.Contract(cfg.contract.address, window.NFT_ABI, signer);
    STATE.readContract = new ethers.Contract(cfg.contract.address, window.NFT_ABI, bp);
    STATE.walletType = walletType;

    saveAccount(account);
    setConnectLabel(short(account), account);
    await updateChipAndMenu();
    walletNote.textContent = '';
    await refreshContractInfo();
  }

  async function connectMetaMask() {
    // 1) try injected
    let provider = null;
    if (window.ethereum?.isMetaMask) provider = window.ethereum;
    else provider = await getEIP6963Provider();
    if (!provider) {
      // mobile / no installed — deep link to MetaMask app which opens this URL in its dApp browser
      const url = encodeURIComponent(window.location.href);
      if (isMobile) {
        window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
        return;
      }
      alert('MetaMask not detected. Install it from metamask.io or use WalletConnect.');
      window.open('https://metamask.io/download/', '_blank');
      return;
    }
    await finalizeConnection(provider, 'metamask');
  }

  async function connectInjected() {
    if (!window.ethereum) { alert('No browser wallet detected.'); return; }
    await finalizeConnection(window.ethereum, 'injected');
  }

  async function connectCoinbase() {
    // Coinbase Wallet extension has isCoinbaseWallet; on mobile use WalletConnect
    let provider = null;
    if (window.ethereum?.isCoinbaseWallet) provider = window.ethereum;
    if (provider) { await finalizeConnection(provider, 'coinbase'); return; }
    return connectWalletConnect({ cb: true });
  }

  async function connectTrust() {
    if (window.ethereum?.isTrust) {
      await finalizeConnection(window.ethereum, 'trust');
    } else {
      return connectWalletConnect({ target: 'trust' });
    }
  }

  let wcProvider = null;
  async function connectWalletConnect(opts = {}) {
    if (!window.WalletConnectEthereumProvider) {
      alert('WalletConnect not loaded. Check your connection.');
      return;
    }
    const wcOpts = {
      projectId: '8a1f6f4d0d5f4a4d8e1a7c5b3e2f1a0b', // public demo project id, get your own at cloud.walletconnect.com
      chains: [cfg.chain?.chainId || 1],
      rpcMap: { [cfg.chain?.chainId || 1]: cfg.chain?.rpcUrl || '' },
      metadata: {
        name: cfg.brand?.name || 'NFT',
        description: cfg.brand?.description || '',
        url: window.location.origin,
        icons: [`${window.location.origin}/img/logo.svg`],
      },
      showQrModal: true,
      qrModalOptions: { themeMode: 'dark' },
    };
    try {
      wcProvider = await window.WalletConnectEthereumProvider.init(wcOpts);
      wcProvider.on('display_uri', (uri) => showWCQR(uri));
      await wcProvider.connect();
      await wcProvider.enable();
      await finalizeConnection(wcProvider, 'walletconnect');
    } catch (e) {
      console.warn('walletconnect', e);
      walletNote.textContent = 'WalletConnect failed: ' + (e?.message || e);
    }
  }

  function showWCQR(uri) {
    const wrap = document.getElementById('wcQrWrap');
    const img = document.getElementById('wcQrImg');
    const mobile = document.getElementById('wcMobileButtons');
    const opts = document.getElementById('walletOptions');
    if (!wrap) return;
    opts.style.display = 'none';
    wrap.style.display = 'block';
    img.innerHTML = '';
    if (uri) {
      // generate QR
      const qr = qrcode(0, 'M', uri);
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 200;
      const ctx = canvas.getContext('2d');
      const mod = qr.getModuleCount();
      const size = 200 / mod;
      for (let r = 0; r < mod; r++) for (let c = 0; c < mod; c++) {
        ctx.fillStyle = qr.isDark(r, c) ? '#000' : '#fff';
        ctx.fillRect(c * size, r * size, size, size);
      }
      img.appendChild(canvas);
    }
    // mobile deep links
    const origin = window.location.origin + window.location.pathname;
    const encUri = encodeURIComponent(uri || '');
    mobile.innerHTML = `
      <a href="https://metamask.app.link/wc?uri=${encUri}">Open in MetaMask</a>
      <a href="https://link.trustwallet.com/wc?uri=${encUri}">Open in Trust Wallet</a>
      <a href="rainbow://wc?uri=${encUri}">Open in Rainbow</a>
    `;
  }

  // minimal QR encoder (no external lib) — supports WalletConnect URIs
  // Based on public-domain QR-Code-generator by nayuki (MIT)
  function qrcode() { return _qr.apply(null, arguments); }
  // Inject a tiny QR encoder
  // (loaded async, will be set below)
  let _qr = function () { throw new Error('QR not loaded'); };
  // load it
  const qrScript = document.createElement('script');
  qrScript.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
  qrScript.onload = () => { _qr = window.qrcode || function () { throw new Error('QR missing'); }; };
  document.head.appendChild(qrScript);

  document.getElementById('wcCancel')?.addEventListener('click', () => {
    const wrap = document.getElementById('wcQrWrap');
    const opts = document.getElementById('walletOptions');
    if (wrap) wrap.style.display = 'none';
    if (opts) opts.style.display = '';
    if (wcProvider) { try { wcProvider.disconnect(); } catch {} wcProvider = null; }
    closeModal(document.getElementById('walletModal'));
  });

  // dispatch by wallet type
  async function connectWalletByType(type) {
    if (type === 'metamask') return connectMetaMask();
    if (type === 'walletconnect') return connectWalletConnect();
    if (type === 'trust') return connectTrust();
    if (type === 'coinbase') return connectCoinbase();
    if (type === 'injected') return connectInjected();
  }

  async function refreshContractInfo() {
    try {
      const [totalMinted, maxSupply, saleOpen, startTime, endTime, mintPriceWei] = await Promise.all([
        readView('totalMinted').catch(() => null),
        readView('maxSupply').catch(() => null),
        readView('saleOpen').catch(() => null),
        readView('startTime').catch(() => null),
        readView('endTime').catch(() => null),
        readView('mintPrice').catch(() => null),
      ]);

      const m = totalMinted != null ? Number(totalMinted) : 0;
      const ms = maxSupply != null ? Number(maxSupply) : (cfg.mint?.totalSupply || 10000);
      const startMs = startTime != null ? Number(startTime) * 1000 : 0;
      const endMs = endTime != null ? Number(endTime) * 1000 : 0;

      // Стартовое значение счётчика сразу из конфига, потом анимируется к реальному
      const ms2 = $('mintedStat');
      if (ms2) ms2.textContent = m.toLocaleString();
      progressTarget = m;
      progressShown = cfg.mint?.minted || ms;
      animateProgress();
      if (progressFill) progressFill.style.width = `${ms > 0 ? (m / ms) * 100 : 0}%`;

      renderStatus({ minted: m, maxSupply: ms, saleOpen: !!saleOpen, startMs, endMs, isLiveWindow: true });

      const up = $('unitPrice');
      if (up) up.textContent = mintPriceWei != null ? fmtEth(mintPriceWei) + ' ETH' : '—';

      const wa = $('walletAllowance');
      const collRem = Math.max(0, ms - m);

      if (STATE.account) {
        try {
          STATE.info = await readView('mintInfo', [STATE.account]);
          if (STATE.info) {
            const walletMinted = Number(STATE.info.walletMinted);
            const walletLimit = Number(STATE.info.walletLimit);
            const walletRemaining = Number(STATE.info.walletRemaining);
            const freeSupplyRem = Number(STATE.info.freeSupplyRemaining);
            // Лимит = сколько ОСТАЛОСЬ купить этому кошельку (макс 25)
            const cap = Math.max(1, Math.min(25, walletRemaining || walletLimit, collRem || walletRemaining || walletLimit));
          qty.max = String(cap);
          if (parseInt(qty.value, 10) > cap) qty.value = cap;
          if (wa) wa.textContent = `${walletMinted} / ${walletLimit} (${walletRemaining} left)`;
          const qh = $('qtyHint');
          if (qh) {
            if (walletRemaining === 0) qh.innerHTML = `<span class="muted">Limit reached — you've minted all ${walletLimit}</span>`;
            else qh.innerHTML = `1–<strong>${cap}</strong> available (you have ${walletMinted}/${walletLimit})`;
          }
            walletNote.textContent =
              `You: ${walletMinted}/${walletLimit} minted • ` +
              `${walletRemaining} more available • ` +
              `Free supply left: ${freeSupplyRem} • ` +
              `Sale open: ${STATE.info.isSaleOpen ? 'yes' : 'no'}`;
          }
        } catch (e) { console.warn(e); }
      } else {
        try {
          const [walletLimit, freeTh] = await Promise.all([
            readView('maxPerWallet'),
            readView('freeThreshold'),
          ]);
          const wl = Number(walletLimit || cfg.mint?.maxPerWallet || 10);
          const ft = Number(freeTh || 0);
          const freeLeft = Math.max(0, ft - m);
          const cap = Math.max(1, Math.min(25, wl, collRem || wl));
          qty.max = String(cap);
          if (parseInt(qty.value, 10) > cap) qty.value = cap;
          if (wa) wa.textContent = `0 / ${wl} (${wl} available)`;
          walletNote.textContent =
            `Free supply left: ${freeLeft} / ${ft} • ` +
            `Mint price: ${up?.textContent || '—'} • ` +
            `Per wallet: up to ${wl}`;
        } catch (e) { console.warn(e); }
      }
      updateTotal();
    } catch (e) {
      console.warn('refreshContractInfo', e);
    }
  }

  // ===== Mint flow =====
  async function doMint() {
    if (STATE.busy) return;
    if (!STATE.account) { openModal('walletModal'); return; }
    const n = Math.max(1, Math.min(parseInt(qty.value, 10) || 1, +qty.max));
    try {
      // re-quote just before showing review
      const [required, freeCount, paidCount] = await STATE.readContract.quoteMint(STATE.account, n);
      STATE.quote = { required, freeCount, paidCount, n };
      reviewQty.textContent = n;
      reviewUnit.textContent = (freeCount && Number(freeCount) === n) ? 'FREE' : `${fmtEth(required / BigInt(n || 1))} ETH`;
      reviewFree.textContent = String(Number(freeCount));
      reviewPaid.textContent = String(Number(paidCount));
      reviewTotal.textContent = fmtEth(required) + ' ETH';
      openModal('reviewModal');
    } catch (e) {
      walletNote.textContent = explainError(e);
    }
  }

  async function confirmMint() {
    if (STATE.busy) return;
    setBusy(true, 'MINTING…');
    closeModal($('reviewModal'));
    try {
      const required = STATE.quote?.required ?? 0n;
      const n = STATE.quote?.n ?? 1;
      const tx = await STATE.contract.mint(n, { value: required });
      walletNote.innerHTML = `Tx sent: <a target="_blank" rel="noopener" href="${cfg.chain.explorerUrl}/tx/${tx.hash}">view on Etherscan</a>`;
      const receipt = await tx.wait();
      walletNote.innerHTML = `Confirmed in block ${receipt.blockNumber}. <a target="_blank" rel="noopener" href="${cfg.chain.explorerUrl}/tx/${tx.hash}">view on Etherscan</a>`;
      await refreshContractInfo();
      openModal('shareModal');
    } catch (e) {
      walletNote.textContent = explainError(e);
    } finally {
      setBusy(false, 'MINT');
    }
  }

  // ===== Event wiring =====
  // (connectBtn click handled by openMenu above)

  // Wallet modal — каждая кнопка вызывает свой коннектор
  document.querySelectorAll('.wallet-btn[data-wallet]').forEach(b => {
    b.addEventListener('click', () => {
      const type = b.getAttribute('data-wallet');
      closeModal($('walletModal'));
      connectWalletByType(type);
    });
  });

  mintBtn.addEventListener('click', (e) => {
    if (e.target.closest('.btn-buy-inline')) {
      window.open(cfg.links.opensea, '_blank');
      return;
    }
    if (!STATE.account) { openModal('walletModal'); return; }
    doMint();
  });

  $('confirmBtn').addEventListener('click', confirmMint);

  // account / chain change
  if (window.ethereum) {
    window.ethereum.on?.('accountsChanged', async (accs) => {
      if (!accs || accs.length === 0) {
        STATE.account = null; STATE.signer = null; STATE.contract = null; STATE.provider = null;
        setConnectLabel('Connect wallet', '');
        saveAccount(null);
        await updateChipAndMenu();
        walletNote.textContent = '';
        return;
      }
      await connect();
    });
    window.ethereum.on?.('chainChanged', () => { location.reload(); });
  }

  // dropdown actions
  cmCopy.addEventListener('click', async () => {
    if (!STATE.account) return;
    try { await navigator.clipboard.writeText(STATE.account); cmCopy.textContent = 'Copied ✓'; setTimeout(() => { cmCopy.textContent = 'Copy address'; }, 1500); } catch {}
  });
  cmView.addEventListener('click', () => {
    if (!STATE.account) return;
    window.open(`${cfg.chain.explorerUrl}/address/${STATE.account}`, '_blank');
  });
  cmSwitch.addEventListener('click', async () => {
    closeMenu();
    // request permissions again — forces MetaMask to show account picker
    try { await window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] }); } catch {}
    try { await connect(); } catch {}
  });
  cmDisconnect.addEventListener('click', () => {
    STATE.account = null; STATE.signer = null; STATE.contract = null; STATE.provider = null;
    saveAccount(null);
    setConnectLabel('Connect wallet', '');
    updateChipAndMenu();
    walletNote.textContent = '';
  });

  // initial state — read via Etherscan (no wallet needed)
  refreshContractInfo();
  setInterval(refreshContractInfo, 30000);
  updateTotal();

  // UI hint next to MetaMask button
  const mmTag = document.getElementById('mmTag');
  if (mmTag) {
    if (window.ethereum?.isMetaMask) {
      mmTag.textContent = isMobile ? 'open' : 'detected';
    } else if (isMobile) {
      mmTag.textContent = 'tap to open';
    } else {
      mmTag.textContent = 'install';
    }
  }

  // auto-reconnect if previously connected
  (async () => {
    if (typeof window.ethereum === 'undefined' || !window.ethereum.selectedAddress) return;
    const last = loadAccount();
    if (!last) return;
    try {
      const accs = await window.ethereum.request({ method: 'eth_accounts' });
      if (accs && accs.length && accs.map(a => a.toLowerCase()).includes(last.toLowerCase())) {
        await connectInjected();
      }
    } catch {}
  })();
})();
