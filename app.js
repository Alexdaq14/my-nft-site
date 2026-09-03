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
    info: null,       // last mintInfo result for current account
    quote: null,      // last quoteMint result
    busy: false,
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
    if (!STATE.account) connect();
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
        // override title only when close to ending
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
    // Кнопка: доступна только если ещё и saleOpen === true
    if (!STATE.busy) {
      if (saleOpen) {
        mintBtn.querySelector('.mint-label').textContent = 'MINT';
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
    if (!STATE.account || !STATE.readContract) {
      totalEth.textContent = '—';
      return;
    }
    try {
      const [required] = await STATE.readContract.quoteMint(STATE.account, n);
      STATE.quote = { required: required ?? 0n, n };
      totalEth.textContent = fmtEth(required) + ' ETH';
    } catch (e) {
      totalEth.textContent = '—';
    }
  };
  qty.addEventListener('input', () => { updateTotal(); });
  syncRangeFill();

  // ===== Carousel (autoplay only) =====
  const carousel = $('carousel');
  const track = $('carouselTrack');
  const idxEl = $('carouselIndex');
  const totEl = $('carouselTotal');
  const images = Array.isArray(cfg.gallery) && cfg.gallery.length ? cfg.gallery : ['img/preview.svg'];
  let idx = 0;
  let autoTimer = null;

  images.forEach((src, i) => {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    const img = document.createElement('img');
    img.src = src; img.alt = `${cfg.brand?.name || 'NFT'} preview ${i + 1}`;
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
  const startAuto = () => {
    const ms = parseInt(carousel.dataset.autoplay || '3500', 10);
    if (images.length > 1) autoTimer = setInterval(() => goTo(idx + 1), ms);
  };
  const stopAuto = () => clearInterval(autoTimer);
  document.addEventListener('visibilitychange', () => document.hidden ? stopAuto() : startAuto());
  startAuto();

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
  async function connect() {
    if (typeof window.ethereum === 'undefined') {
      openModal('walletModal');
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum, 'any');
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const account = await signer.getAddress();
      const net = await provider.getNetwork();

      // switch to required chain
      const targetHex = cfg.chain?.hexChainId;
      if (targetHex && '0x' + BigInt(net.chainId).toString(16).toLowerCase() !== targetHex.toLowerCase()) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: targetHex }],
          });
        } catch (sw) {
          if (sw.code === 4902 || /Unrecognized chain/i.test(sw.message || '')) {
            await window.ethereum.request({
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

      STATE.provider = provider;
      STATE.signer = signer;
      STATE.account = account;
      STATE.chainId = Number(net.chainId);
      STATE.contract = new ethers.Contract(cfg.contract.address, window.NFT_ABI, signer);
      STATE.readContract = new ethers.Contract(cfg.contract.address, window.NFT_ABI, provider);

      saveAccount(account);
      setConnectLabel(short(account), account);
      await updateChipAndMenu();
      walletNote.textContent = '';

      await refreshContractInfo();
    } catch (e) {
      walletNote.textContent = explainError(e);
    }
  }

  async function refreshContractInfo() {
    if (!STATE.readContract) return;
    try {
      const [
        name, symbol, totalMinted, maxSupply, saleOpen,
        startTime, endTime, mintPriceWei,
      ] = await Promise.all([
        STATE.readContract.name().catch(() => null),
        STATE.readContract.symbol().catch(() => null),
        STATE.readContract.totalMinted().catch(() => 0n),
        STATE.readContract.maxSupply().catch(() => 0n),
        STATE.readContract.saleOpen().catch(() => false),
        STATE.readContract.startTime().catch(() => 0n),
        STATE.readContract.endTime().catch(() => 0n),
        STATE.readContract.mintPrice().catch(() => 0n),
      ]);
      const m = Number(totalMinted);
      const ms = Number(maxSupply);
      const startMs = Number(startTime) * 1000;
      const endMs = Number(endTime) * 1000;

      progressTarget = m;
      progressShown = 0;
      animateProgress();
      if (progressFill) progressFill.style.width = `${ms > 0 ? (m / ms) * 100 : 0}%`;

      renderStatus({ minted: m, maxSupply: ms, saleOpen, startMs, endMs, isLiveWindow: true });

      const up = $('unitPrice');
      if (up) up.textContent = fmtEth(mintPriceWei) + ' ETH';

      if (STATE.account) {
        try {
          STATE.info = await STATE.readContract.mintInfo(STATE.account);
          const walletMinted = Number(STATE.info.walletMinted);
          const walletLimit = Number(STATE.info.walletLimit);
          const walletRemaining = Number(STATE.info.walletRemaining);
          const freeSupplyRem = Number(STATE.info.freeSupplyRemaining);
          const collRem = Number(STATE.info.collectionRemaining);
          const cap = Math.max(1, Math.min(25, walletLimit, collRem || walletLimit));
          qty.max = String(cap);
          if (parseInt(qty.value, 10) > cap) qty.value = cap;
          const wa = $('walletAllowance');
          if (wa) wa.textContent = `${walletMinted} / ${walletLimit} (${walletRemaining} left)`;
          walletNote.textContent =
            `You: ${walletMinted}/${walletLimit} minted • ` +
            `Free supply left: ${freeSupplyRem} • ` +
            `Sale open: ${STATE.info.isSaleOpen ? 'yes' : 'no'}`;
        } catch (e) { /* ignore */ }
      }
      updateTotal();
    } catch (e) {
      walletNote.textContent = explainError(e);
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

  document.querySelectorAll('.wallet-btn').forEach(b => {
    b.addEventListener('click', () => { closeModal($('walletModal')); connect(); });
  });

  mintBtn.addEventListener('click', (e) => {
    if (e.target.closest('.btn-buy-inline')) {
      window.open(cfg.links.opensea, '_blank');
      return;
    }
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

  // initial state — read-only contract works without a wallet
  if (cfg.contract?.address) {
    try {
      const provider = new ethers.JsonRpcProvider(cfg.chain.rpcUrl);
      STATE.readContract = new ethers.Contract(cfg.contract.address, window.NFT_ABI, provider);
      refreshContractInfo();
      setInterval(refreshContractInfo, 30000);
    } catch (e) { /* ignore */ }
  }
  updateTotal();

  // auto-reconnect if previously connected
  (async () => {
    if (typeof window.ethereum === 'undefined' || !window.ethereum.selectedAddress) return;
    const last = loadAccount();
    if (!last) return;
    try {
      const accs = await window.ethereum.request({ method: 'eth_accounts' });
      if (accs && accs.length && accs.map(a => a.toLowerCase()).includes(last.toLowerCase())) {
        await connect();
      }
    } catch {}
  })();
})();
