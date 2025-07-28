// customer_script.js (Firebase連携版)
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
    const DAILY_CHARGE_LIMIT = 1000000; // 100万円
    const MAX_TOTAL_BALANCE = 100000000; // 1億円

    // Firebase Realtime Databaseのパス (店舗側と顧客側で共通)
    const PAYMENT_REQUEST_DB_PATH = 'paymentRequests/'; // 店舗側がQRコードに埋め込む取引情報
    const PAYMENT_STATUS_DB_PATH = 'paymentStatuses/'; // 顧客側が支払い完了時に送信するステータス

    // --- アプリの状態変数 ---
    let balance = 0;
    let transactions = [];
    let scannedPaymentAmount = 0;
    let scannedShopId = '';
    let scannedTransactionId = '';
    let scannedCustomerId = '';
    let dailyCharges = []; // その日のチャージ履歴

    let videoStream = null;
    let qrScanInterval = null;

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

        // 最新の履歴から表示
        for (let i = transactions.length - 1; i >= 0; i--) {
            const transaction = transactions[i];
            const listItem = document.createElement('li');

            if (transaction.type === 'payment') {
                listItem.classList.add('payment');
                // 取引IDの末尾4桁を表示
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

        // 日付が変わったらデイリーチャージ履歴をリセット
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
        scannedPaymentAmount = 0;
        scannedShopId = '';
        scannedTransactionId = '';
        scannedCustomerId = '';

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); // 背面カメラを優先
            qrCameraVideo.srcObject = stream;
            videoStream = stream; // 後で停止するためにストリームを保存

            await qrCameraVideo.play();
            cameraStatus.textContent = 'QRコードを読み取っています...';

            // Canvasのサイズをビデオの解像度に合わせる (重要)
            qrCameraVideo.addEventListener('loadedmetadata', () => {
                qrCanvas.width = qrCameraVideo.videoWidth;
                qrCanvas.height = qrCameraVideo.videoHeight;
            }, { once: true });


            const qrContext = qrCanvas.getContext('2d', { willReadFrequently: true });
            

            qrScanInterval = setInterval(async () => { // asyncを追加
                if (qrCameraVideo.readyState === qrCameraVideo.HAVE_ENOUGH_DATA) {
                    // Canvasのサイズが未設定の場合はここで設定
                    if (qrCanvas.width === 0 || qrCanvas.height === 0) {
                        qrCanvas.width = qrCameraVideo.videoWidth;
                        qrCanvas.height = qrCameraVideo.videoHeight;
                    }

                    qrContext.drawImage(qrCameraVideo, 0, 0, qrCanvas.width, qrCanvas.height);
                    const imageData = qrContext.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert", // QRコードの読み取り精度調整
                    });

                    if (code) {
                        const qrData = code.data;
                        console.log("QRコードデータ:", qrData);
                        stopQrReader(); // 読み取ったらカメラを停止

                        try {
                            // QRコードデータをURLクエリ文字列として解析
                            const params = new URLSearchParams(qrData);
                            const amount = parseFloat(params.get('amount'));
                            const shopId = params.get('shopId');
                            const transactionId = params.get('transactionId');
                            const customerId = params.get('customerId') || ''; // customerIdはオプション

                            if (isNaN(amount) || amount <= 0 || !shopId || !transactionId) {
                                throw new Error('支払い情報が不足しているか無効です。');
                            }

                            // Firebaseから店舗からの支払いリクエスト情報を取得
                            const snapshot = await db.ref(PAYMENT_REQUEST_DB_PATH + transactionId).once('value');
                            const paymentRequest = snapshot.val();

                            if (!paymentRequest) {
                                throw new Error('店舗からの支払いリクエストがFirebaseに見つかりません。店舗アプリで支払い情報を生成してください。');
                            }

                            // 読み取った情報とFirebaseのリクエストが一致するか検証
                            if (paymentRequest.amount !== amount ||
                                paymentRequest.shopId !== shopId ||
                                paymentRequest.transactionId !== transactionId) {
                                throw new Error('読み取ったQRコードの支払い情報が、現在の店舗からの支払いリクエストと一致しません。');
                            }

                            scannedPaymentAmount = amount;
                            scannedShopId = shopId;
                            scannedTransactionId = transactionId;
                            scannedCustomerId = customerId;

                            scannedAmountEl.textContent = `¥ ${scannedPaymentAmount.toLocaleString()}`;
                            readAmountDisplay.classList.remove('hidden');
                            confirmPayBtn.classList.remove('hidden');
                            cameraStatus.textContent = `QRコードを読み取りました。`;

                        } catch (e) {
                            cameraStatus.textContent = `QRコードの解析エラー: ${e.message}`;
                            console.error("QRコード解析エラー:", e);
                            readAmountDisplay.classList.add('hidden');
                            confirmPayBtn.classList.add('hidden');
                        }
                    }
                }
            }, 100); // 100msごとにQRコードをスキャン
        } catch (err) {
            console.error("カメラアクセスエラー:", err);
            cameraStatus.textContent = 'カメラの起動に失敗しました。カメラの許可を確認してください。';
            alert('カメラの起動に失敗しました。ブラウザのカメラアクセス権限を確認してください。');
            stopQrReader();
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
        cameraStatus.textContent = '';
    };

    const handlePayment = async () => { // asyncを追加
        if (scannedPaymentAmount <= 0 || !scannedShopId || !scannedTransactionId) {
            alert('支払う金額が設定されていません。QRコードをもう一度読み込んでください。');
            showSection(mainPaymentSection);
            return;
        }
        if (balance < scannedPaymentAmount) {
            alert('残高が不足しています。チャージしてください。');
            return;
        }

        balance -= scannedPaymentAmount;
        transactions.push({
            type: 'payment',
            amount: scannedPaymentAmount,
            timestamp: new Date().toISOString(),
            shopId: scannedShopId,
            transactionId: scannedTransactionId
        });
        updateBalanceDisplay();
        updateHistoryDisplay();

        // 支払い完了ステータスをFirebaseに書き込む
        try {
            await window.database.ref(PAYMENT_STATUS_DB_PATH + scannedTransactionId).set({
                status: 'success',
                amount: scannedPaymentAmount,
                shopId: scannedShopId,
                customerId: scannedCustomerId,
                transactionId: scannedTransactionId,
                timestamp: new Date().toISOString()
            });
            console.log("Payment status written to Firebase successfully.");

            // 支払いリクエスト情報をFirebaseから削除 (一度きりの取引のため)
            await window.database.ref(PAYMENT_REQUEST_DB_PATH + scannedTransactionId).remove();
            console.log("Payment request removed from Firebase.");

        } catch (error) {
            console.error("Firebaseへの書き込みエラー:", error);
            alert("支払い情報の送信中にエラーが発生しました。");
            return; // エラー時は処理を中断
        }

        showPaymentCompletionSection(scannedPaymentAmount, scannedShopId);

        setTimeout(() => {
            showSection(mainPaymentSection);
            scannedPaymentAmount = 0;
            scannedShopId = '';
            scannedTransactionId = '';
            scannedCustomerId = '';
            readAmountDisplay.classList.add('hidden');
            confirmPayBtn.classList.add('hidden');
        }, COMPLETION_DISPLAY_TIME);
    };

    // -------------------------------------------------------------------------
    // チャージ機能
    // -------------------------------------------------------------------------
    const updatePredictedBalance = () => {
        const chargeAmount = parseFloat(chargeAmountInput.value) || 0;
        const currentDailyCharged = dailyCharges
            .filter(c => new Date(c.timestamp).toDateString() === new Date().toDateString())
            .reduce((sum, c) => sum + c.amount, 0);

        const newBalance = balance + chargeAmount;
        const totalChargedToday = currentDailyCharged + chargeAmount;

        predictedBalanceEl.textContent = `¥ ${newBalance.toLocaleString()}`;

        if (totalChargedToday > DAILY_CHARGE_LIMIT) {
            predictedBalanceDisplay.style.color = 'red';
            predictedBalanceEl.textContent = `¥ ${newBalance.toLocaleString()} (本日上限超過)`;
            confirmChargeBtn.disabled = true;
        } else if (newBalance > MAX_TOTAL_BALANCE) {
            predictedBalanceDisplay.style.color = 'red';
            predictedBalanceEl.textContent = `¥ ${newBalance.toLocaleString()} (総残高上限超過)`;
            confirmChargeBtn.disabled = true;
        }
        else {
            predictedBalanceDisplay.style.color = '';
            confirmChargeBtn.disabled = false;
        }

        // チャージ金額が0以下、または無効な数値の場合はボタンを無効化
        if (chargeAmount <= 0 || isNaN(chargeAmount)) {
            confirmChargeBtn.disabled = true;
        }
    };

    const handleCharge = () => {
        const chargeAmount = parseFloat(chargeAmountInput.value);

        if (isNaN(chargeAmount) || chargeAmount <= 0) {
            alert('有効なチャージ金額を入力してください。');
            return;
        }

        const currentDailyCharged = dailyCharges
            .filter(c => new Date(c.timestamp).toDateString() === new Date().toDateString())
            .reduce((sum, c) => sum + c.amount, 0);

        const totalChargedToday = currentDailyCharged + chargeAmount;

        if (totalChargedToday > DAILY_CHARGE_LIMIT) {
            alert(`本日これ以上チャージできません。1日のチャージ上限は¥${DAILY_CHARGE_LIMIT.toLocaleString()}です。`);
            return;
        }
        if (balance + chargeAmount > MAX_TOTAL_BALANCE) {
            alert(`残高が上限を超えます。現在の総残高上限は¥${MAX_TOTAL_BALANCE.toLocaleString()}です。`);
            return;
        }


        balance += chargeAmount;
        transactions.push({
            type: 'charge',
            amount: chargeAmount,
            timestamp: new Date().toISOString()
        });

        // デイリーチャージ履歴に追加
        dailyCharges.push({
            amount: chargeAmount,
            timestamp: new Date().toISOString()
        });
        // その日のチャージだけを残す（念のため）
        const today = new Date().toDateString();
        dailyCharges = dailyCharges.filter(c => new Date(c.timestamp).toDateString() === today);
        localStorage.setItem(LOCAL_STORAGE_DAILY_CHARGE_KEY, JSON.stringify(dailyCharges));


        updateBalanceDisplay();
        updateHistoryDisplay();
        showChargeCompletionSection(chargeAmount);

        setTimeout(() => {
            showSection(mainPaymentSection);
            chargeAmountInput.value = '1000'; // 初期値に戻す
            updatePredictedBalance();
        }, COMPLETION_DISPLAY_TIME);
    };

    // --- 初期化処理 ---
    loadAppData();
    updateBalanceDisplay();
    updateHistoryDisplay();
    showSection(mainPaymentSection);
    updatePredictedBalance(); // 初期表示時にチャージ予測金額を更新

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
    chargeAmountInput.addEventListener('input', updatePredictedBalance); // 入力があるたびに予測残高を更新
    confirmChargeBtn.addEventListener('click', handleCharge);

    backToMainFromCompletionBtn.addEventListener('click', () => showSection(mainPaymentSection));
    backToMainFromChargeCompletionBtn.addEventListener('click', () => showSection(mainPaymentSection));
});
