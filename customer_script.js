document.addEventListener('DOMContentLoaded', () => {

    // --- DOM要素 ---
    const currentBalanceEl = document.getElementById('currentBalance');
    const transactionHistoryEl = document.getElementById('transactionHistory');

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

    const receiveQrSection = document.getElementById('receiveQrSection');
    const receiveQrCodeEl = document.getElementById('receiveQrCode');
    const closeReceiveBtn = document.getElementById('closeReceiveBtn');

    const chargeSection = document.getElementById('chargeSection');
    const chargeAmountInput = document.getElementById('chargeAmountInput');
    const confirmChargeBtn = document.getElementById('confirmChargeBtn');
    const cancelChargeBtn = document.getElementById('cancelChargeBtn');
    const predictedBalanceEl = document.getElementById('predictedBalance');

    const paymentCompletionSection = document.getElementById('paymentCompletionSection');
    const completedAmountEl = document.getElementById('completedAmount');
    const completedShopIdEl = document.getElementById('completedShopId');
    const backToMainFromCompletionBtn = document.getElementById('backToMainFromCompletionBtn');

    const chargeCompletionSection = document.getElementById('chargeCompletionSection');
    const chargedAmountEl = document.getElementById('chargedAmount');
    const backToMainFromChargeCompletionBtn = document.getElementById('backToMainFromChargeCompletionBtn');

    const receiveCompletionSection = document.getElementById('receiveCompletionSection');
    const receivedAmountDisplayEl = document.getElementById('receivedAmountDisplay');
    const backToMainFromReceiveBtn = document.getElementById('backToMainFromReceiveBtn');

    // --- 定数 ---
    const LOCAL_STORAGE_BALANCE_KEY = 'customerMockPayPayBalance';
    const LOCAL_STORAGE_TRANSACTIONS_KEY = 'customerMockPayPayTransactions';
    const LOCAL_STORAGE_DAILY_CHARGE_KEY = 'customerMockPayPayDailyCharges';

    const DAILY_CHARGE_LIMIT = 100000;
    const MAX_TOTAL_BALANCE = 100000000;
    const AUTO_CLOSE_DELAY = 3000; // ★3秒

    // --- 変数 ---
    let balance = 0;
    let transactions = [];
    let dailyCharges = [];
    let scannedData = null;
    let videoStream = null;
    let requestAnimFrameId = null;
    let autoCloseTimer = null;

    let myCustomerId = localStorage.getItem('customerMockPayPayId');
    if (!myCustomerId) {
        myCustomerId = `CUST-${Math.floor(Math.random() * 900000) + 100000}`;
        localStorage.setItem('customerMockPayPayId', myCustomerId);
    }

    // --- 共通関数 ---
    const loadAppData = () => {
        balance = parseFloat(localStorage.getItem(LOCAL_STORAGE_BALANCE_KEY)) || 0;
        transactions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_TRANSACTIONS_KEY)) || [];
        dailyCharges = JSON.parse(localStorage.getItem(LOCAL_STORAGE_DAILY_CHARGE_KEY)) || [];

        const today = new Date().toDateString();
        dailyCharges = dailyCharges.filter(c => new Date(c.timestamp).toDateString() === today);
        localStorage.setItem(LOCAL_STORAGE_DAILY_CHARGE_KEY, JSON.stringify(dailyCharges));

        updateBalanceDisplay();
        updateHistoryDisplay();
    };

    const updateBalanceDisplay = () => {
        currentBalanceEl.textContent = `¥ ${balance.toLocaleString()}`;
    };

    const updateHistoryDisplay = () => {
        transactionHistoryEl.innerHTML = '';
        transactions.slice().reverse().forEach(t => {
            const li = document.createElement('li');
            const dateStr = new Date(t.timestamp).toLocaleString('ja-JP');
            li.innerHTML = `<span>${t.type === 'payment' ? '支払い' : 'チャージ'}</span>
                            <span>¥ ${t.amount.toLocaleString()}</span>
                            <span class="history-date">${dateStr}</span>`;
            transactionHistoryEl.appendChild(li);
        });
    };

    const showSection = (target) => {
        if (autoCloseTimer) {
            clearTimeout(autoCloseTimer);
            autoCloseTimer = null;
        }

        [
            mainPaymentSection,
            qrReaderSection,
            receiveQrSection,
            chargeSection,
            paymentCompletionSection,
            chargeCompletionSection,
            receiveCompletionSection
        ].forEach(s => s.classList.add('hidden'));

        target.classList.remove('hidden');
    };

    const updatePredictedBalance = () => {
        const val = parseInt(chargeAmountInput.value);
        predictedBalanceEl.textContent = (balance + (isNaN(val) ? 0 : val)).toLocaleString();
    };

    // --- チャージ処理 ---
    const handleCharge = () => {
        const amount = parseInt(chargeAmountInput.value);
        if (!amount || amount <= 0) return alert('正しい金額を入力してください');

        const dailyTotal = dailyCharges.reduce((s, c) => s + c.amount, 0);
        if (dailyTotal + amount > DAILY_CHARGE_LIMIT) {
            return alert('1日のチャージ上限を超えています');
        }
        if (balance + amount > MAX_TOTAL_BALANCE) {
            return alert('残高上限を超えます');
        }

        balance += amount;
        localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance);

        const now = new Date().toISOString();
        transactions.push({ type: 'charge', amount, timestamp: now });
        dailyCharges.push({ amount, timestamp: now });

        localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
        localStorage.setItem(LOCAL_STORAGE_DAILY_CHARGE_KEY, JSON.stringify(dailyCharges));

        updateBalanceDisplay();
        updateHistoryDisplay();

        chargedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
        showSection(chargeCompletionSection);

        // ★★★ チャージ完了後：3秒で自動的にメイン画面へ戻る ★★★
        autoCloseTimer = setTimeout(() => {
            showSection(mainPaymentSection);
        }, AUTO_CLOSE_DELAY);
    };

    // --- イベント ---
    loadAppData();

    showChargeBtn.addEventListener('click', () => {
        chargeAmountInput.value = '';
        updatePredictedBalance();
        showSection(chargeSection);
    });

    confirmChargeBtn.addEventListener('click', handleCharge);
    cancelChargeBtn.addEventListener('click', () => showSection(mainPaymentSection));
    backToMainFromChargeCompletionBtn.addEventListener('click', () => showSection(mainPaymentSection));

    chargeAmountInput.addEventListener('input', updatePredictedBalance);

});
