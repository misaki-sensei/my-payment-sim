document.addEventListener('DOMContentLoaded', () => {

    const currentBalanceEl = document.getElementById('currentBalance');
    const mainPaymentSection = document.getElementById('mainPaymentSection');

    const showQrReaderBtn = document.getElementById('showQrReaderBtn');
    const showChargeBtn = document.getElementById('showChargeBtn');
    const showReceiveBtn = document.getElementById('showReceiveBtn');

    const qrReaderSection = document.getElementById('qrReaderSection');
    const qrCameraVideo = document.getElementById('qrCameraVideo');
    const qrCanvas = document.getElementById('qrCanvas');
    const cameraStatus = document.getElementById('cameraStatus');
    const scannedAmountEl = document.getElementById('scannedAmount');
    const readAmountDisplay = document.getElementById('readAmountDisplay');
    const confirmPayBtn = document.getElementById('confirmPayBtn');
    const cancelQrReadBtn = document.getElementById('cancelQrReadBtn');

    const chargeSection = document.getElementById('chargeSection');
    const chargeAmountInput = document.getElementById('chargeAmountInput');
    const confirmChargeBtn = document.getElementById('confirmChargeBtn');
    const cancelChargeBtn = document.getElementById('cancelChargeBtn');
    const predictedBalanceEl = document.getElementById('predictedBalance');

    const chargeCompletionSection = document.getElementById('chargeCompletionSection');
    const chargedAmountEl = document.getElementById('chargedAmount');

    const receiveQrSection = document.getElementById('receiveQrSection');
    const receiveQrCodeEl = document.getElementById('receiveQrCode');
    const closeReceiveBtn = document.getElementById('closeReceiveBtn');

    const receiveCompletionSection = document.getElementById('receiveCompletionSection');
    const receivedAmountDisplayEl = document.getElementById('receivedAmountDisplay');

    const AUTO_CLOSE_DELAY = 3000;
    const BALANCE_KEY = 'balance';

    let balance = parseInt(localStorage.getItem(BALANCE_KEY)) || 0;
    let videoStream = null;
    let scannedData = null;
    let autoCloseTimer = null;

    const myCustomerId = localStorage.getItem('cid') || (() => {
        const id = 'CUST-' + Math.floor(Math.random() * 1000000);
        localStorage.setItem('cid', id);
        return id;
    })();

    const showSection = (section) => {
        if (autoCloseTimer) clearTimeout(autoCloseTimer);
        document.querySelectorAll('.hidden').forEach(el => el.classList.add('hidden'));
        mainPaymentSection.classList.add('hidden');
        section.classList.remove('hidden');
    };

    const updateBalance = () => {
        currentBalanceEl.textContent = `¥ ${balance.toLocaleString()}`;
        localStorage.setItem(BALANCE_KEY, balance);
    };

    updateBalance();

    // 🔴 店舗QR読み取り
    const startQrReader = () => {
        showSection(qrReaderSection);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => {
                videoStream = stream;
                qrCameraVideo.srcObject = stream;
                qrCameraVideo.play();
                requestAnimationFrame(tick);
            });
    };

    const tick = () => {
        if (qrCameraVideo.readyState === qrCameraVideo.HAVE_ENOUGH_DATA) {
            qrCanvas.width = qrCameraVideo.videoWidth;
            qrCanvas.height = qrCameraVideo.videoHeight;
            const ctx = qrCanvas.getContext('2d');
            ctx.drawImage(qrCameraVideo, 0, 0);
            const img = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
            const code = jsQR(img.data, img.width, img.height);
            if (code) {
                scannedData = JSON.parse(code.data);
                scannedAmountEl.textContent = scannedData.amount;
                readAmountDisplay.classList.remove('hidden');
                confirmPayBtn.classList.remove('hidden');
                qrCameraVideo.pause();
                videoStream.getTracks().forEach(t => t.stop());
                return;
            }
        }
        requestAnimationFrame(tick);
    };

    // 🔴 支払い
    confirmPayBtn.addEventListener('click', () => {
        balance -= parseInt(scannedData.amount);
        updateBalance();
        showSection(mainPaymentSection);
    });

    cancelQrReadBtn.addEventListener('click', () => showSection(mainPaymentSection));

    // 🔴 チャージ
    showChargeBtn.addEventListener('click', () => {
        chargeAmountInput.value = '';
        predictedBalanceEl.textContent = balance;
        showSection(chargeSection);
    });

    chargeAmountInput.addEventListener('input', () => {
        predictedBalanceEl.textContent = balance + parseInt(chargeAmountInput.value || 0);
    });

    confirmChargeBtn.addEventListener('click', () => {
        const amt = parseInt(chargeAmountInput.value);
        balance += amt;
        updateBalance();
        chargedAmountEl.textContent = `¥ ${amt}`;
        showSection(chargeCompletionSection);
        autoCloseTimer = setTimeout(() => showSection(mainPaymentSection), AUTO_CLOSE_DELAY);
    });

    cancelChargeBtn.addEventListener('click', () => showSection(mainPaymentSection));

    // 🔴 お金を受け取る
    showReceiveBtn.addEventListener('click', () => {
        showSection(receiveQrSection);
        receiveQrCodeEl.innerHTML = '';
        new QRCode(receiveQrCodeEl, {
            text: JSON.stringify({ type: 'receive_money', userId: myCustomerId }),
            width: 200,
            height: 200
        });
    });

    closeReceiveBtn.addEventListener('click', () => showSection(mainPaymentSection));

});
