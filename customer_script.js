// customer_script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const appContainer = document.getElementById('appContainer');
    const currentBalanceEl = document.getElementById('currentBalance');
    const transactionHistoryEl = document.getElementById('transactionHistory');

    const mainPaymentSection = document.getElementById('mainPaymentSection');
    const showQrReaderBtn = document.getElementById('showQrReaderBtn');
    const showChargeBtn = document.getElementById('showChargeBtn');

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
    const predictedBalanceDisplay = document.getElementById('predictedBalanceDisplay');
    const predictedBalanceEl = document.getElementById('predictedBalance');

    const paymentCompletionSection = document.getElementById('paymentCompletionSection');
    const completedAmountEl = document.getElementById('completedAmount');
    const completedShopIdEl = document.getElementById('completedShopId');
    const backToMainFromCompletionBtn = document.getElementById('backToMainFromCompletionBtn');

    const chargeCompletionSection = document.getElementById('chargeCompletionSection');
    const chargedAmountEl = document.getElementById('chargedAmount');
    const backToMainFromChargeCompletionBtn = document.getElementById('backToMainFromChargeCompletionBtn');


    // --- 定数 ---
    const LOCAL_STORAGE_BALANCE_KEY = 'customerMockPayPayBalance';
    const LOCAL_STORAGE_TRANSACTIONS_KEY = 'customerMockPayPayTransactions';
    const COMPLETION_DISPLAY_TIME = 3000;

    const LOCAL_STORAGE_DAILY_CHARGE_KEY = 'customerMockPayPayDailyCharges';
    const DAILY_CHARGE_LIMIT = 1000000;
    const MAX_TOTAL_BALANCE = 100000000;
    
    // 追加: customerIdを管理するための定数
    const LOCAL_STORAGE_CUSTOMER_ID_KEY = 'customerMockPayPayId';


    // Firebase Realtime Databaseのパス (店舗側と顧客側で共通)
    const PAYMENT_REQUEST_DB_PATH = 'paymentRequests/';
    const PAYMENT_STATUS_DB_PATH = 'paymentStatuses/';

    // --- アプリの状態変数 ---
    let balance = 0;
    let transactions = [];
    let scannedPaymentAmount = 0;
    let scannedShopId = '';
    let scannedTransactionId = '';
    let dailyCharges = [];

    let videoStream = null;
    let qrScanInterval = null;

    // 追加: customerIdを保持する変数
    let customerId = localStorage.getItem(LOCAL_STORAGE_CUSTOMER_ID_KEY);
    if (!customerId) {
        // IDがなければ新しく生成して保存
        customerId = `CUS-${Math.floor(Math.random() * 900000) + 100000}`;
        localStorage.setItem(LOCAL_STORAGE_CUSTOMER_ID_KEY, customerId);
    }
    console.log('Your Customer ID:', customerId); // デバッグ用


    // --- 関数 ---

    const updateBalanceDisplay = () => {
        currentBalanceEl.textContent = `¥ ${balance.toLocaleString()}`;
        localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, balance.toString());
    };

    const updateHistoryDisplay = () => {
        transactionHistoryEl.innerHTML = '';
        if (transactions.length === 0) {
            const noHistoryItem = document.createElement('li');
            noHistoryItem.textContent = '取引履歴はありません。';
            transactionHistoryEl.appendChild(noHistoryItem);
            return;
        }

        for (let i = transactions.length - 1; i >= 0; i--) {
            const transaction = transactions[i];
            const listItem = document.createElement('li');

            if (transaction.type === 'payment') {
                listItem.classList.add('payment');
                const shortTransactionId = transaction.transactionId ? transaction.transactionId.substring(transaction.transactionId.length - 4) : '';
                listItem.innerHTML = `
                    <span>支払い</span>
                    <span>¥ ${transaction.amount.toLocaleString()}</span>
                    <span class="history-date">${formatDate(transaction.timestamp)} ${transaction.shopId ? `(${transaction.shopId})` : ''} [${shortTransactionId}]</span>
                `;
            } else if (transaction.type === 'charge') {
                listItem.classList.add('charge');
                listItem.innerHTML = `
                    <span>チャージ</span>
                    <span>¥ ${transaction.amount.toLocaleString()}</span>
                    <span class="history-date">${formatDate(transaction.timestamp)}</span>
                `;
            }
            transactionHistoryEl.appendChild(listItem);
        }
        localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
    };

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        const dateStr = date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        return `${dateStr} ${timeStr}`;
    };

    const loadAppData = () => {
        balance = parseFloat(localStorage.getItem(LOCAL_STORAGE_BALANCE_KEY)) || 0;
        transactions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_TRANSACTIONS_KEY)) || [];
        dailyCharges = JSON.parse(localStorage.getItem(LOCAL_STORAGE_DAILY_CHARGE_KEY)) || [];
        const today = new Date().toDateString();
        dailyCharges = dailyCharges.filter(c => new Date(c.timestamp).toDateString() === today);
        localStorage.setItem(LOCAL_STORAGE_DAILY_CHARGE_KEY, JSON.stringify(dailyCharges));
    };

    const showSection = (sectionToShow) => {
        const sections = [mainPaymentSection, qrReaderSection, chargeSection, paymentCompletionSection, chargeCompletionSection];
        sections.forEach(section => {
            if (section === sectionToShow) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        });
    };

    const showPaymentCompletionSection = (amount, shopId) => {
        completedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
        completedShopIdEl.textContent = `店舗ID: ${shopId}`;
        showSection(paymentCompletionSection);
    };

    const showChargeCompletionSection = (amount) => {
        chargedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
        showSection(chargeCompletionSection);
    };

    // -------------------------------------------------------------------------
    // QRコードリーダーのロジック
    // -------------------------------------------------------------------------
    const startQrReader = async () => {
        cameraStatus.textContent = 'カメラを起動中...';
        readAmountDisplay.classList.add('hidden');
        confirmPayBtn.classList.add('hidden');
        scannedAmountEl.textContent = '';

        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            qrCameraVideo.srcObject = videoStream;
            qrCameraVideo.play();
            cameraStatus.textContent = 'QRコードを読み取り中...';

            qrScanInterval = setInterval(() => {
                const context = qrCanvas.getContext('2d');
                if (qrCameraVideo.videoWidth === 0 || qrCameraVideo.videoHeight === 0) {
                    return;
                }
                qrCanvas.width = qrCameraVideo.videoWidth;
                qrCanvas.height = qrCameraVideo.videoHeight;
                context.drawImage(qrCameraVideo, 0, 0, qrCanvas.width, qrCanvas.height);
                const imageData = context.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                });

                if (code) {
                    stopQrReader();
                    qrCodeSuccessCallback(code.data);
                }
            }, 100);
        } catch (err) {
            console.error('カメラの起動に失敗しました:', err);
            cameraStatus.textContent = 'カメラの起動に失敗しました。';
            alert('カメラの起動に失敗しました。カメラへのアクセスを許可してください。');
            showSection(mainPaymentSection);
        }
    };

    const stopQrReader = () => {
        if (qrScanInterval) {
            clearInterval(qrScanInterval);
            qrScanInterval = null;
        }
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        qrCameraVideo.srcObject = null;
    };

    const qrCodeSuccessCallback = async (qrData) => {
        console.log("QR Code detected:", qrData);
        cameraStatus.textContent = '';

        const params = new URLSearchParams(qrData);
        scannedPaymentAmount = parseFloat(params.get('amount'));
        scannedShopId = params.get('shopId');
        scannedTransactionId = params.get('transactionId');
        // 修正箇所: QRコードからcustomerIdを取得しない
        // scannedCustomerId = params.get('customerId'); 

        if (isNaN(scannedPaymentAmount) || scannedPaymentAmount <= 0 || !scannedShopId || !scannedTransactionId) {
            alert('無効なQRコードです。');
            showSection(mainPaymentSection);
            return;
        }

        try {
            const snapshot = await database.ref(PAYMENT_REQUEST_DB_PATH + scannedTransactionId).once('value');
            const requestData = snapshot.val();

            if (!requestData || requestData.amount !== scannedPaymentAmount || requestData.shopId !== scannedShopId) {
                alert('この支払いリクエストは無効か、すでに処理済みです。');
                showSection(mainPaymentSection);
                return;
            }

            if (balance < scannedPaymentAmount) {
                alert('残高が不足しています！チャージしてください。');
                showSection(mainPaymentSection);
                return;
            }

            readAmountDisplay.textContent = `QRコードを読み取りました: ¥ ${scannedPaymentAmount.toLocaleString()}`;
            readAmountDisplay.classList.remove('hidden');

            scannedAmountEl.textContent = `¥ ${scannedPaymentAmount.toLocaleString()}`;
            scannedAmountEl.classList.remove('hidden');

            confirmPayBtn.classList.remove('hidden');
        } catch (error) {
            console.error("Firebaseからの支払いリクエスト取得エラー:", error);
            alert("支払いリクエストの確認中にエラーが発生しました。");
            showSection(mainPaymentSection);
        }
    };

    const handlePayment = async () => {
        if (balance < scannedPaymentAmount) {
            alert('残高が不足しています！');
            return;
        }

        try {
            await database.ref(PAYMENT_STATUS_DB_PATH + scannedTransactionId).set({
                status: 'success',
                amount: scannedPaymentAmount,
                shopId: scannedShopId,
                transactionId: scannedTransactionId,
                // 修正箇所: localStorageから取得したIDを送信
                customerId: customerId,
                timestamp: new Date().toISOString()
            });

            balance -= scannedPaymentAmount;
            transactions.push({
                type: 'payment',
                amount: scannedPaymentAmount,
                timestamp: new Date().toISOString(),
                shopId: scannedShopId,
                transactionId: scannedTransactionId,
                customerId: customerId // 履歴にも顧客IDを追加
            });

            updateBalanceDisplay();
            updateHistoryDisplay();
            showPaymentCompletionSection(scannedPaymentAmount, scannedShopId);

            await database.ref(PAYMENT_REQUEST_DB_PATH + scannedTransactionId).remove();
            console.log("Payment request removed from Firebase after successful payment.");

            setTimeout(() => {
                showSection(mainPaymentSection);
                readAmountDisplay.classList.add('hidden');
                scannedAmountEl.classList.add('hidden');
                confirmPayBtn.classList.add('hidden');
            }, COMPLETION_DISPLAY_TIME);

        } catch (error) {
            console.error("支払い処理中にエラーが発生しました:", error);
            alert("支払処理中にエラーが発生しました。");
            showSection(mainPaymentSection);
        }
    };

    const handleCharge = () => {
        const chargeAmount = parseFloat(chargeAmountInput.value);
        const currentDailyCharge = dailyCharges.reduce((sum, charge) => sum + charge.amount, 0);

        if (isNaN(chargeAmount) || chargeAmount <= 0) {
            alert('有効なチャージ金額を入力してください！');
            return;
        }
        if (currentDailyCharge + chargeAmount > DAILY_CHARGE_LIMIT) {
            alert(`1日のチャージ上限額 (${DAILY_CHARGE_LIMIT.toLocaleString()}円) を超えます。`);
            return;
        }
        if (balance + chargeAmount > MAX_TOTAL_BALANCE) {
            alert(`残高が上限額 (${MAX_TOTAL_BALANCE.toLocaleString()}円) を超えます。`);
            return;
        }

        balance += chargeAmount;
        transactions.push({
            type: 'charge',
            amount: chargeAmount,
            timestamp: new Date().toISOString()
        });
        dailyCharges.push({
            amount: chargeAmount,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem(LOCAL_STORAGE_DAILY_CHARGE_KEY, JSON.stringify(dailyCharges));


        updateBalanceDisplay();
        updateHistoryDisplay();
        showChargeCompletionSection(chargeAmount);

        setTimeout(() => {
            showSection(mainPaymentSection);
            chargeAmountInput.value = '1000';
            updatePredictedBalance();
        }, COMPLETION_DISPLAY_TIME);
    };

    const updatePredictedBalance = () => {
        const chargeAmount = parseFloat(chargeAmountInput.value);
        const predicted = balance + (isNaN(chargeAmount) ? 0 : chargeAmount);
        predictedBalanceEl.textContent = predicted.toLocaleString();
    };

    // --- 初期化処理 ---
    loadAppData();
    updateBalanceDisplay();
    updateHistoryDisplay();
    showSection(mainPaymentSection);
    updatePredictedBalance();

    // --- イベントリスナー ---
    showQrReaderBtn.addEventListener('click', () => {
        showSection(qrReaderSection);
        startQrReader();
    });

    cancelQrReadBtn.addEventListener('click', () => {
        stopQrReader();
        showSection(mainPaymentSection);
    });

    confirmPayBtn.addEventListener('click', handlePayment);

    showChargeBtn.addEventListener('click', () => showSection(chargeSection));
    cancelChargeBtn.addEventListener('click', () => showSection(mainPaymentSection));
    chargeAmountInput.addEventListener('input', updatePredictedBalance);
    confirmChargeBtn.addEventListener('click', handleCharge);

    backToMainFromCompletionBtn.addEventListener('click', () => showSection(mainPaymentSection));
    backToMainFromChargeCompletionBtn.addEventListener('click', () => showSection(mainPaymentSection));
});
