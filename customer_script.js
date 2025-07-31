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

    const scannedAmountEl = document.getElementById('scannedAmount'); // QR読み取り後に金額を表示する要素
    const readAmountDisplay = document.getElementById('readAmountDisplay'); // 「読み取りました」の表示を含む可能性のある要素
    const confirmPayBtn = document.getElementById('confirmPayBtn'); // 支払い確認ボタン
    const cancelQrReadBtn = document.getElementById('cancelQrReadBtn'); // QR読み取りキャンセルボタン

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
    const COMPLETION_DISPLAY_TIME = 3000; // 完了メッセージ表示時間

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
        readAmountDisplay.classList.add('hidden'); // 以前の表示を隠す
        confirmPayBtn.classList.add('hidden'); // 以前のボタンを隠す
        scannedAmountEl.textContent = ''; // 以前の金額表示をクリア

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
        cameraStatus.textContent = ''; // カメラの状態メッセージをクリア

        // QRデータからパラメータをパース
        const params = new URLSearchParams(qrData);
        scannedPaymentAmount = parseFloat(params.get('amount'));
        scannedShopId = params.get('shopId');
        scannedTransactionId = params.get('transactionId');
        scannedCustomerId = params.get('customerId'); // 店舗から送られた顧客IDを保持

        if (isNaN(scannedPaymentAmount) || scannedPaymentAmount <= 0 || !scannedShopId || !scannedTransactionId) {
            alert('無効なQRコードです。');
            showSection(mainPaymentSection);
            return;
        }

        // 店舗からの支払いリクエストがFirebaseに存在するか確認
        try {
            const snapshot = await database.ref(PAYMENT_REQUEST_DB_PATH + scannedTransactionId).once('value');
            const requestData = snapshot.val();

            if (!requestData || requestData.amount !== scannedPaymentAmount || requestData.shopId !== scannedShopId) {
                alert('この支払いリクエストは無効か、すでに処理済みです。');
                showSection(mainPaymentSection);
                return;
            }

            // 残高チェック
            if (balance < scannedPaymentAmount) {
                alert('残高が不足しています！チャージしてください。');
                showSection(mainPaymentSection);
                return;
            }

            // ★変更: 「QRコードを読み取りました」メッセージの表示と自動非表示
            readAmountDisplay.textContent = `QRコードを読み取りました: ¥ ${scannedPaymentAmount.toLocaleString()}`;
            readAmountDisplay.classList.remove('hidden'); // 表示する

            // 2秒後にメッセージを非表示にする
            setTimeout(() => {
                readAmountDisplay.classList.add('hidden'); // 非表示にする
            }, 2000); // 2秒

            scannedAmountEl.textContent = `¥ ${scannedPaymentAmount.toLocaleString()}`; // 金額を明確に表示
            scannedAmountEl.classList.remove('hidden'); // 金額はそのまま表示

            confirmPayBtn.classList.remove('hidden'); // 支払いボタンを表示
            // QRリーダーセクションに留まる（支払い確認画面として利用）
            // showSection(qrReaderSection); // この行はコメントアウトまたは削除し、QRリーダーセクションに表示を継続
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

        // Firebaseに支払い完了ステータスを送信
        try {
            await database.ref(PAYMENT_STATUS_DB_PATH + scannedTransactionId).set({
                status: 'success',
                amount: scannedPaymentAmount,
                shopId: scannedShopId,
                transactionId: scannedTransactionId,
                customerId: scannedCustomerId, // 店舗に顧客IDを返送
                timestamp: new Date().toISOString()
            });

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
            showPaymentCompletionSection(scannedPaymentAmount, scannedShopId);

            // 支払いリクエストをFirebaseから削除
            await database.ref(PAYMENT_REQUEST_DB_PATH + scannedTransactionId).remove();
            console.log("Payment request removed from Firebase after successful payment.");

            // 支払い完了画面からメイン画面への自動遷移
            setTimeout(() => {
                showSection(mainPaymentSection);
                // 支払い完了後の各種表示をリセット (任意)
                readAmountDisplay.classList.add('hidden');
                scannedAmountEl.classList.add('hidden');
                confirmPayBtn.classList.add('hidden');
            }, COMPLETION_DISPLAY_TIME);

        } catch (error) {
            console.error("支払い処理中にエラーが発生しました:", error);
            alert("支払処理中にエラーが発生しました。");
            // エラー時もメイン画面に戻る
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
            chargeAmountInput.value = '1000'; // 初期値に戻す
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
