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
    const predictedBalanceFooter = document.getElementById('predictedBalanceFooter');

    const paymentCompletionSection = document.getElementById('paymentCompletionSection');
    const completedAmountEl = document.getElementById('completedAmount');
    const completedShopIdEl = document.getElementById('completedShopId');
    const backToMainFromCompletionBtn = document.getElementById('backToMainFromCompletionBtn');

    const chargeCompletionSection = document.getElementById('chargeCompletionSection');
    const chargedAmountEl = document.getElementById('chargedAmount');
    const backToMainFromChargeCompletionBtn = document.getElementById('backToMainFromChargeCompletionBtn');


    // --- 定数 ---
    const LOCAL_STORAGE_BALANCE_KEY = 'customerMockPayPayBalance';
    const LOCAL_STORAGE_HISTORY_KEY = 'customerMockPayPayHistory';
    const COMPLETION_DISPLAY_TIME = 3000; // 完了画面表示時間 (ms)

    // --- アプリの状態変数 ---
    let currentBalance = 0;
    let transactions = [];
    let qrAnimationFrameRequest; // requestAnimationFrameのIDを保持
    let scannedPaymentAmount = 0;
    let scannedShopId = '';
    let scannedTransactionId = ''; // 追加: 読み取った取引ID

    // --- Firebase Realtime Database 参照の取得 ---
    // HTMLファイルで既にfirebase.initializeApp()とfirebase.database()が実行され、
    // database変数がグローバルに利用可能になっていることを想定
    const paymentStatusesRef = database.ref('paymentStatuses');

    // --- 関数 ---

    const updateBalanceDisplay = () => {
        currentBalanceEl.textContent = `¥ ${currentBalance.toLocaleString()}`;
    };

    const updateHistoryDisplay = () => {
        transactionHistoryEl.innerHTML = '';
        if (transactions.length === 0) {
            const noHistoryItem = document.createElement('li');
            noHistoryItem.textContent = '履歴はありません。';
            transactionHistoryEl.appendChild(noHistoryItem);
            return;
        }
        // 最新のものを上にする
        transactions.sort((a, b) => b.timestamp - a.timestamp).forEach(transaction => {
            const listItem = document.createElement('li');
            listItem.classList.add(transaction.type); // 'payment' または 'charge'
            listItem.innerHTML = `
                <span>${new Date(transaction.timestamp).toLocaleString()}</span>
                <span>${transaction.type === 'payment' ? '支払い' : 'チャージ'}</span>
                <span>¥ ${transaction.amount.toLocaleString()}</span>
                ${transaction.shopId ? `<span class="shop-id-display">${transaction.shopId}</span>` : ''}
            `;
            transactionHistoryEl.appendChild(listItem);
        });
    };

    const processPayment = (amount, shopId, transactionId) => {
        if (currentBalance >= amount) {
            currentBalance -= amount;
            const newTransaction = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9), // ユニークID
                amount: amount,
                timestamp: Date.now(),
                type: 'payment',
                shopId: shopId,
                transactionId: transactionId // 取引IDを履歴に保存
            };
            transactions.push(newTransaction);
            saveCustomerAppData();
            updateBalanceDisplay();
            updateHistoryDisplay();

            // Firebase Realtime Databaseに支払い完了を通知
            paymentStatusesRef.child(transactionId).set({
                amount: amount,
                shopId: shopId,
                timestamp: Date.now(),
                status: 'completed',
                transactionId: transactionId // 確認のため取引IDも送信
            }).then(() => {
                console.log("Payment status updated in Firebase for transaction:", transactionId);
            }).catch(error => {
                console.error("Error updating payment status in Firebase:", error);
            });

            return true;
        } else {
            alert('残高が不足しています。');
            return false;
        }
    };

    const processCharge = (amount) => {
        if (isNaN(amount) || amount <= 0) {
            alert('有効なチャージ金額を入力してください。');
            return false;
        }
        currentBalance += amount;
        const newTransaction = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9), // ユニークID
            amount: amount,
            timestamp: Date.now(),
            type: 'charge'
        };
        transactions.push(newTransaction);
        saveCustomerAppData();
        updateBalanceDisplay();
        updateHistoryDisplay();
        return true;
    };

    const loadCustomerAppData = () => {
        const storedBalance = localStorage.getItem(LOCAL_STORAGE_BALANCE_KEY);
        if (storedBalance) {
            currentBalance = parseFloat(storedBalance);
        }
        const storedTransactions = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
        if (storedTransactions) {
            transactions = JSON.parse(storedTransactions);
        }
    };

    const saveCustomerAppData = () => {
        localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, currentBalance.toString());
        localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(transactions));
    };

    const showSection = (sectionToShow) => {
        // 全てのセクションを非表示にする
        const sections = [
            mainPaymentSection, qrReaderSection, chargeSection, 
            paymentCompletionSection, chargeCompletionSection
        ];
        sections.forEach(section => section.classList.add('hidden'));
        
        // 指定されたセクションを表示
        sectionToShow.classList.remove('hidden');

        // QRリーダーセクションの表示/非表示に応じてカメラを制御
        if (sectionToShow === qrReaderSection) {
            startCamera();
        } else {
            stopCamera();
        }
    };

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            qrCameraVideo.srcObject = stream;
            qrCameraVideo.setAttribute("playsinline", true); // iOS対応
            qrCameraVideo.play();
            cameraStatus.textContent = 'カメラ準備完了。QRコードを読み取ります...';
            requestAnimationFrame(tick);
        } catch (err) {
            console.error("カメラアクセスエラー:", err);
            cameraStatus.textContent = `カメラアクセスに失敗しました: ${err.name}. HTTPS接続であるか、またはカメラの許可を確認してください。`;
            alert('カメラにアクセスできませんでした。この機能はHTTPS接続でのみ動作します。または、カメラの使用を許可してください。');
        }
    };

    const stopCamera = () => {
        if (qrCameraVideo.srcObject) {
            qrCameraVideo.srcObject.getTracks().forEach(track => track.stop());
            qrCameraVideo.srcObject = null;
        }
        cancelAnimationFrame(qrAnimationFrameRequest);
        cameraStatus.textContent = ''; // カメラステータスをクリア
        qrCanvas.getContext('2d').clearRect(0, 0, qrCanvas.width, qrCanvas.height); // キャンバスをクリア
        scannedAmountEl.textContent = '¥ 0'; // 表示金額をリセット
        confirmPayBtn.disabled = true; // 支払いボタンを無効化
        scannedPaymentAmount = 0;
        scannedShopId = '';
        scannedTransactionId = ''; // 取引IDもリセット
    };

    const tick = () => {
        if (qrCameraVideo.readyState === qrCameraVideo.HAVE_ENOUGH_DATA) {
            qrCanvas.hidden = false;
            qrCanvas.width = qrCameraVideo.videoWidth;
            qrCanvas.height = qrCameraVideo.videoHeight;
            let ctx = qrCanvas.getContext('2d');
            ctx.drawImage(qrCameraVideo, 0, 0, qrCanvas.width, qrCanvas.height);
            let imageData = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
            let code = jsqr(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code) {
                // QRコードを検出した場合
                try {
                    const qrData = JSON.parse(code.data);
                    if (qrData.amount && qrData.shopId && qrData.transactionId) { // transactionId もチェック
                        scannedPaymentAmount = parseFloat(qrData.amount);
                        scannedShopId = qrData.shopId;
                        scannedTransactionId = qrData.transactionId; // 読み取った取引IDをセット

                        scannedAmountEl.textContent = `¥ ${scannedPaymentAmount.toLocaleString()}`;
                        cameraStatus.textContent = `QRコードを読み取りました。ショップID: ${scannedShopId}`;
                        confirmPayBtn.disabled = false; // 支払いボタンを有効化

                        // 読み取り成功後、カメラを停止するかはアプリのUXによる
                        // 例: stopCamera(); // 自動で停止して支払い画面へ移行
                        // 一旦読み取れたら、繰り返し読み取らないようにrequestAnimationFrameを停止
                        cancelAnimationFrame(qrAnimationFrameRequest); 
                        return; // ここで処理を終了し、次のフレームは描画しない
                    } else {
                        cameraStatus.textContent = '不正なQRコード形式です。';
                        confirmPayBtn.disabled = true;
                    }
                } catch (e) {
                    cameraStatus.textContent = 'QRコードの内容を解析できませんでした。';
                    confirmPayBtn.disabled = true;
                }
            } else {
                // QRコードを検出しない場合
                cameraStatus.textContent = 'QRコードを検出できません。カメラを向けてください。';
                confirmPayBtn.disabled = true;
                scannedPaymentAmount = 0;
                scannedShopId = '';
                scannedTransactionId = '';
            }
        }
        qrAnimationFrameRequest = requestAnimationFrame(tick);
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

    const updatePredictedBalance = () => {
        const amountToCharge = parseFloat(chargeAmountInput.value);
        if (!isNaN(amountToCharge) && amountToCharge > 0) {
            predictedBalanceDisplay.textContent = `¥ ${(currentBalance + amountToCharge).toLocaleString()}`;
            predictedBalanceFooter.classList.remove('hidden');
        } else {
            predictedBalanceDisplay.textContent = `¥ ${currentBalance.toLocaleString()}`; // 有効でない場合は現在の残高を表示
            predictedBalanceFooter.classList.add('hidden');
        }
    };


    // --- 初期化処理 ---
    loadCustomerAppData();
    updateBalanceDisplay();
    updateHistoryDisplay();
    updatePredictedBalance(); // 初期表示

    // --- イベントリスナー ---
    showQrReaderBtn.addEventListener('click', () => showSection(qrReaderSection));
    showChargeBtn.addEventListener('click', () => showSection(chargeSection));

    cancelQrReadBtn.addEventListener('click', () => {
        stopCamera(); // カメラを停止
        showSection(mainPaymentSection);
    });

    confirmPayBtn.addEventListener('click', () => {
        // 読み取った金額と店舗ID、取引IDを使って支払い処理を実行
        if (scannedPaymentAmount > 0 && scannedShopId && scannedTransactionId) {
            if (processPayment(scannedPaymentAmount, scannedShopId, scannedTransactionId)) {
                // 支払い成功時に完了画面を表示
                showPaymentCompletionSection(scannedPaymentAmount, scannedShopId); 
                setTimeout(() => {
                    showSection(mainPaymentSection); // 一定時間後にメイン画面に戻る
                }, COMPLETION_DISPLAY_TIME);
            }
        } else {
            alert('支払う金額が設定されていないか、QRコードが正しく読み取られていません。');
        }
    });

    // チャージ画面関連
    cancelChargeBtn.addEventListener('click', () => {
        showSection(mainPaymentSection);
    });

    confirmChargeBtn.addEventListener('click', () => {
        const amountToCharge = parseFloat(chargeAmountInput.value);
        if (processCharge(amountToCharge)) {
            showChargeCompletionSection(amountToCharge); 
            setTimeout(() => {
                showSection(mainPaymentSection);
            }, COMPLETION_DISPLAY_TIME);
        }
    });

    // チャージ金額入力欄の変更を監視し、予測残高を更新
    chargeAmountInput.addEventListener('input', updatePredictedBalance);


    // 各完了画面からメインへ戻る
    backToMainFromCompletionBtn.addEventListener('click', () => {
        showSection(mainPaymentSection);
    });

    backToMainFromChargeCompletionBtn.addEventListener('click', () => {
        showSection(mainPaymentSection);
    });

    // ページを閉じる前にデータを保存
    window.addEventListener('beforeunload', saveCustomerAppData);
});
