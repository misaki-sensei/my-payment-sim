document.addEventListener('DOMContentLoaded', () => {
    // **変更点:** デバッグログ: database変数の型と値を確認
    console.log("CUSTOMER_SCRIPT: database variable type at DOMContentLoaded:", typeof database);
    console.log("CUSTOMER_SCRIPT: database variable value at DOMContentLoaded:", database);

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
    const predictedBalanceContainer = document.getElementById('predictedBalanceContainer'); 

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
    // **変更点:** database変数がwindowオブジェクトから取得できることを想定
    const paymentStatusesRef = window.database.ref('paymentStatuses'); 

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
            const paymentStatusData = {
                amount: amount,
                shopId: shopId,
                timestamp: Date.now(),
                status: 'completed',
                transactionId: transactionId // 確認のため取引IDも送信
            };
            console.log("CUSTOMER: Sending payment status to Firebase:", paymentStatusData, "at path:", paymentStatusesRef.child(transactionId).path.toString());

            paymentStatusesRef.child(transactionId).set(paymentStatusData).then(() => {
                console.log("CUSTOMER: Payment status updated in Firebase successfully for transaction:", transactionId);
            }).catch(error => {
                console.error("CUSTOMER: Error updating payment status in Firebase:", error);
                cameraStatus.textContent = `支払い情報の送信に失敗しました: ${error.message}`;
            });

            return true;
        } else {
            cameraStatus.textContent = '残高が不足しています。チャージしてください。';
            console.warn('残高不足');
            return false;
        }
    };

    const processCharge = (amount) => {
        if (isNaN(amount) || amount <= 0) {
            cameraStatus.textContent = '有効なチャージ金額を入力してください。'; // UIにメッセージ表示
            console.warn('無効なチャージ金額');
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
            await qrCameraVideo.play(); 
            cameraStatus.textContent = 'カメラ準備完了。QRコードを読み取ります...';
            
            qrCameraVideo.addEventListener('loadedmetadata', () => {
                qrCanvas.width = qrCameraVideo.videoWidth;
                qrCanvas.height = qrCameraVideo.videoHeight;
                qrCanvas.style.display = 'block'; 
            }, { once: true }); 

            qrCanvas.style.display = 'block';

            qrAnimationFrameRequest = requestAnimationFrame(tick);
        } catch (err) {
            console.error("カメラアクセスエラー:", err);
            let errorMessage = 'カメラアクセスに失敗しました。';
            if (err.name === 'NotAllowedError') {
                errorMessage += 'ブラウザのカメラ使用許可を拒否しました。設定を確認してください。';
            } else if (err.name === 'NotFoundError') {
                errorMessage += '利用可能なカメラが見つかりませんでした。';
            } else if (err.name === 'NotReadableError') {
                errorMessage += 'カメラが既に別のアプリで使用されているか、ハードウェアの問題です。';
            } else if (err.name === 'SecurityError') {
                errorMessage += 'HTTPS接続でのみカメラは動作します。';
            }
            cameraStatus.textContent = errorMessage;
            showSection(mainPaymentSection);
        }
    };

    const stopCamera = () => {
        if (qrCameraVideo.srcObject) {
            qrCameraVideo.srcObject.getTracks().forEach(track => track.stop());
            qrCameraVideo.srcObject = null;
        }
        if (qrAnimationFrameRequest) { 
            cancelAnimationFrame(qrAnimationFrameRequest);
            qrAnimationFrameRequest = null; // **変更点:** IDをクリア
        }
        cameraStatus.textContent = ''; 
        const ctx = qrCanvas.getContext('2d');
        if (ctx) { 
            ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height); 
        }
        qrCanvas.style.display = 'none'; 
        scannedAmountEl.textContent = '¥ 0'; 
        confirmPayBtn.disabled = true; 
        scannedPaymentAmount = 0;
        scannedShopId = '';
        scannedTransactionId = ''; 
    };

    const tick = () => {
        if (qrCameraVideo.readyState === qrCameraVideo.HAVE_ENOUGH_DATA) {
            if (qrCanvas.width === 0 || qrCanvas.height === 0) {
                qrCanvas.width = qrCameraVideo.videoWidth;
                qrCanvas.height = qrCameraVideo.videoHeight;
            }

            let ctx = qrCanvas.getContext('2d');
            ctx.drawImage(qrCameraVideo, 0, 0, qrCanvas.width, qrCanvas.height);
            let imageData = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
            let code = null;
            try {
                code = jsqr(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                });
            } catch (e) {
                console.error("jsQR処理エラー:", e);
                cameraStatus.textContent = 'QRコードの処理中にエラーが発生しました。';
                confirmPayBtn.disabled = true;
                scannedPaymentAmount = 0;
                scannedShopId = '';
                scannedTransactionId = '';
                qrAnimationFrameRequest = requestAnimationFrame(tick); 
                return;
            }

            if (code) {
                // QRコード検出時に赤い枠を描画
                ctx.beginPath();
                ctx.lineTo(code.location.topLeftCorner.x, code.location.topLeftCorner.y);
                ctx.lineTo(code.location.topRightCorner.x, code.location.topRightCorner.y);
                ctx.lineTo(code.location.bottomRightCorner.x, code.location.bottomRightCorner.y);
                ctx.lineTo(code.location.bottomLeftCorner.x, code.location.bottomLeftCorner.y);
                ctx.lineTo(code.location.topLeftCorner.x, code.location.topLeftCorner.y);
                ctx.lineWidth = 4;
                ctx.strokeStyle = "#FF3B58"; 
                ctx.stroke();

                // デバッグ用の点 (オプション)
                ctx.fillStyle = "#FF3B58";
                function drawPoint(point) {
                    ctx.fillRect(point.x - 5, point.y - 5, 10, 10);
                }
                drawPoint(code.location.topLeftCorner);
                drawPoint(code.location.topRightCorner);
                drawPoint(code.location.bottomRightCorner);
                drawPoint(code.location.bottomLeftCorner);

                try {
                    const qrData = JSON.parse(code.data);
                    if (qrData.amount && qrData.shopId && qrData.transactionId) { 
                        scannedPaymentAmount = parseFloat(qrData.amount);
                        scannedShopId = qrData.shopId;
                        scannedTransactionId = qrData.transactionId; 

                        scannedAmountEl.textContent = `¥ ${scannedPaymentAmount.toLocaleString()}`;
                        cameraStatus.textContent = `QRコードを読み取りました。ショップID: ${scannedShopId}`;
                        confirmPayBtn.disabled = false; 

                        cancelAnimationFrame(qrAnimationFrameRequest); 
                        qrAnimationFrameRequest = null; // **変更点:** IDをクリア
                        return; 
                    } else {
                        cameraStatus.textContent = '不正なQRコード形式です。必要な情報が不足しています。';
                        console.error("CUSTOMER: QR Data is missing required fields:", qrData); 
                        confirmPayBtn.disabled = true;
                    }
                } catch (e) {
                    cameraStatus.textContent = 'QRコードの内容を解析できませんでした。';
                    console.error("CUSTOMER: Error parsing QR Code data as JSON:", e, "Raw data:", code.data); 
                    confirmPayBtn.disabled = true;
                }
            } else {
                ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
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
            predictedBalanceContainer.classList.remove('hidden'); 
            confirmChargeBtn.disabled = false; 
        } else {
            predictedBalanceDisplay.textContent = `¥ ${currentBalance.toLocaleString()}`; 
            predictedBalanceContainer.classList.add('hidden'); 
            confirmChargeBtn.disabled = true; 
        }
    };


    // --- 初期化処理 ---
    loadCustomerAppData();
    updateBalanceDisplay();
    updateHistoryDisplay();
    updatePredictedBalance(); 

    // --- イベントリスナー ---
    showQrReaderBtn.addEventListener('click', () => showSection(qrReaderSection));
    showChargeBtn.addEventListener('click', () => showSection(chargeSection));

    cancelQrReadBtn.addEventListener('click', () => {
        stopCamera(); 
        showSection(mainPaymentSection);
    });

    confirmPayBtn.addEventListener('click', () => {
        if (scannedPaymentAmount > 0 && scannedShopId && scannedTransactionId) {
            console.log("CUSTOMER: Initiating payment process for Transaction ID:", scannedTransactionId);
            if (processPayment(scannedPaymentAmount, scannedShopId, scannedTransactionId)) {
                showPaymentCompletionSection(scannedPaymentAmount, scannedShopId); 
                setTimeout(() => {
                    showSection(mainPaymentSection); 
                }, COMPLETION_DISPLAY_TIME);
            } else {
                // processPaymentがfalseを返した場合の処理（メッセージは既にprocessPayment内で表示）
            }
        } else {
            cameraStatus.textContent = '支払う金額が設定されていないか、QRコードが正しく読み取られていません。';
            console.error('支払い情報不足またはQRコード未読み取り');
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
