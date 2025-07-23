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
    const COMPLETION_DISPLAY_TIME = 3000; // 完了画面の表示時間 (ミリ秒)

    const LOCAL_STORAGE_DAILY_CHARGE_KEY = 'customerMockPayPayDailyCharges'; // 1日チャージ履歴のキー
    const DAILY_CHARGE_LIMIT = 1000000; // 1日のチャージ上限 100万円
    const MAX_TOTAL_BALANCE = 100000000; // 残高の総上限額 1億円

    // --- アプリの状態変数 ---
    let balance = 0;
    let transactions = [];
    let scannedPaymentAmount = 0; // 読み取った支払い金額
    let scannedShopId = ''; // 読み取った店舗ID
    let scannedTransactionId = ''; // 読み取った取引ID

    let videoStream = null; // カメラ映像のストリーム
    let qrScanInterval = null; // QRスキャン用のインターバルID
    let dailyCharges = []; // 1日のチャージ履歴を保持

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
                listItem.innerHTML = `
                    <span>支払い</span>
                    <span>¥ ${transaction.amount.toLocaleString()}</span>
                    <span class="history-date">${formatDate(transaction.timestamp)} ${transaction.shopId ? `(${transaction.shopId})` : ''}</span>
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

    // 日付フォーマット関数
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
    };

    /**
     * 各セクションの表示/非表示を切り替えるヘルパー関数
     */
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

    /**
     * 支払い完了画面を表示します。
     * @param {number} amount - 支払った金額
     * @param {string} shopId - 支払い先の店舗ID
     */
    const showPaymentCompletionSection = (amount, shopId) => {
        completedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
        completedShopIdEl.textContent = `店舗ID: ${shopId}`;
        showSection(paymentCompletionSection);
    };

    /**
     * チャージ完了画面を表示します。
     * @param {number} amount - チャージした金額
     */
    const showChargeCompletionSection = (amount) => {
        chargedAmountEl.textContent = `¥ ${amount.toLocaleString()}`;
        showSection(chargeCompletionSection);
    };

    /**
     * QRコード読み取り画面を表示し、カメラを起動します。
     */
    const showQrReaderSection = async () => {
        showSection(qrReaderSection);
        scannedAmountEl.textContent = '¥ 0';
        readAmountDisplay.classList.add('hidden');
        confirmPayBtn.classList.add('hidden');
        
        cameraStatus.textContent = 'カメラを起動しています...';
        qrCameraVideo.classList.add('hidden'); 

        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); 
            qrCameraVideo.srcObject = videoStream;
            qrCameraVideo.setAttribute('playsinline', true); 
            await qrCameraVideo.play();
            
            qrCameraVideo.classList.remove('hidden'); 
            cameraStatus.textContent = 'QRコードをスキャン中...';

            // キャンバスとコンテキストを再設定（ビデオのサイズに合わせて）
            qrCanvas.width = qrCameraVideo.videoWidth;
            qrCanvas.height = qrCameraVideo.videoHeight;
            const context = qrCanvas.getContext('2d', { willReadFrequently: true });

            qrScanInterval = setInterval(() => {
                if (qrCameraVideo.readyState === qrCameraVideo.HAVE_ENOUGH_DATA) {
                    context.drawImage(qrCameraVideo, 0, 0, qrCanvas.width, qrCanvas.height);
                    const imageData = context.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert",
                    });

                    if (code) {
                        handleQrCodeRead(code.data);
                        clearInterval(qrScanInterval); 
                        stopCamera(); 
                    }
                }
            }, 100); 
        } catch (err) {
            console.error("カメラの起動に失敗しました:", err);
            cameraStatus.textContent = 'カメラの起動に失敗しました。カメラへのアクセスを許可してください。';
            alert('カメラの起動に失敗しました。ブラウザのカメラアクセスを許可しているか確認してください。');
            stopCamera(); 
            showSection(mainPaymentSection); 
        }
    };

    /**
     * カメラを停止します。
     */
    const stopCamera = () => {
        if (qrScanInterval) {
            clearInterval(qrScanInterval);
            qrScanInterval = null;
        }
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        qrCameraVideo.srcObject = null; 
        qrCameraVideo.classList.add('hidden'); 
        cameraStatus.textContent = ''; 
    };

    /**
     * 読み取ったQRコードデータを処理します。
     * @param {string} qrData - QRコードから読み取られた文字列
     */
    const handleQrCodeRead = (qrData) => {
        try {
            // URLのハッシュ部分からパラメータを解析
            const url = new URL('http://dummy.com/' + qrData); 
            const hashParams = new URLSearchParams(url.hash.substring(1)); 

            const amount = parseFloat(hashParams.get('amount'));
            const shopId = hashParams.get('shopId');
            const transactionId = hashParams.get('transactionId'); // 新しく取引IDを読み込む

            if (isNaN(amount) || amount <= 0 || !shopId || !transactionId) {
                alert('無効なQRコードデータです。正しい形式のQRコードをスキャンしてください。（金額、店舗ID、取引IDが必要です）');
                showQrReaderSection(); 
                return;
            }

            scannedPaymentAmount = amount;
            scannedShopId = shopId;
            scannedTransactionId = transactionId; // 読み取った取引IDを保存

            scannedAmountEl.textContent = `¥ ${scannedPaymentAmount.toLocaleString()}`;
            readAmountDisplay.classList.remove('hidden');
            confirmPayBtn.classList.remove('hidden');

            alert(`店舗ID: ${scannedShopId} から ¥${scannedPaymentAmount.toLocaleString()} の支払いリクエストを読み取りました！\n取引ID: ${scannedTransactionId}`);

        } catch (e) {
            alert('QRコードデータの解析に失敗しました。正しい形式のQRコードをスキャンしてください。');
            console.error(e);
            showQrReaderSection(); 
        }
    };


    /**
     * チャージ画面を表示し、初期化します。
     */
    const showChargeSection = () => {
        showSection(chargeSection);
        chargeAmountInput.value = '1000'; 
        updatePredictedBalance(); // チャージ画面表示時に予測残高を更新
    };

    /**
     * チャージ金額入力時に予測残高を更新して表示します。
     */
    const updatePredictedBalance = () => {
        const chargeAmount = parseFloat(chargeAmountInput.value);
        let predictedBalanceValue = balance; // 初期値は現在の残高

        if (!isNaN(chargeAmount) && chargeAmount > 0) {
            predictedBalanceValue = balance + chargeAmount;
            predictedBalanceDisplay.classList.remove('hidden'); // 表示要素を可視化
        } else {
            predictedBalanceDisplay.classList.add('hidden'); // 入力がない場合は非表示
        }

        // 残高の上限チェックをここでも反映
        if (predictedBalanceValue > MAX_TOTAL_BALANCE) {
            predictedBalanceEl.textContent = `¥ ${MAX_TOTAL_BALANCE.toLocaleString()} (上限)`;
            predictedBalanceEl.style.color = '#ff3366'; // 赤色などで警告
        } else {
            predictedBalanceEl.textContent = `¥ ${predictedBalanceValue.toLocaleString()}`;
            predictedBalanceEl.style.color = '#6a5acd'; // 通常の色（チャージの色に合わせる）
        }
    };


    /**
     * 支払い処理を実行します。
     * @param {number} amount - 処理する金額
     * @param {string} shopId - 決済先の店舗ID
     * @param {string} transactionId - 該当取引のID
     */
    const processPayment = (amount, shopId, transactionId) => {
        if (isNaN(amount) || amount <= 0) {
            alert('金額が不正です。');
            return false;
        }

        if (balance < amount) {
            alert('残高が不足しています！');
            return false;
        }

        balance -= amount;

        const newTransaction = {
            type: 'payment',
            amount: amount,
            timestamp: new Date().toISOString(),
            method: 'QRコード',
            shopId: shopId,
            transactionId: transactionId // 履歴に取引IDを追加
        };
        transactions.push(newTransaction);

        updateBalanceDisplay();
        updateHistoryDisplay();
        
        // 店舗側に支払い完了を通知するデータをLocalStorageに書き込む
        // ここでtransactionIdも渡す
        localStorage.setItem('shopPaymentStatus', JSON.stringify({
            status: 'success',
            amount: amount,
            shopId: shopId,
            transactionId: transactionId, // 取引IDを含める
            timestamp: new Date().toISOString()
        }));

        return true;
    };

    /**
     * チャージ処理を実行します。
     * @param {number} amount - チャージする金額
     */
    const processCharge = (amount) => {
        if (isNaN(amount) || amount <= 0) {
            alert('チャージ金額が不正です。');
            return false;
        }

        const MAX_CHARGE_AMOUNT_PER_TRANSACTION = 1000000; // 1回のチャージ上限額 100万円

        if (amount > MAX_CHARGE_AMOUNT_PER_TRANSACTION) {
            alert(`一度にチャージできる金額は${MAX_CHARGE_AMOUNT_PER_TRANSACTION.toLocaleString()}円までです。`);
            return false;
        }

        if (balance + amount > MAX_TOTAL_BALANCE) {
            alert(`チャージ後の残高が上限の${MAX_TOTAL_BALANCE.toLocaleString()}円を超えてしまいます。現在の残高は${balance.toLocaleString()}円です。`);
            return false;
        }

        // 過去24時間以内のチャージ履歴をクリーンアップ
        const now = Date.now();
        const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000); // 24時間前のUNIXタイムスタンプ

        // 24時間以内のチャージのみをフィルタリング
        dailyCharges = dailyCharges.filter(charge => charge.timestamp > twentyFourHoursAgo);

        // 現在の24時間以内の合計チャージ額を計算
        const currentDailyChargedAmount = dailyCharges.reduce((sum, charge) => sum + charge.amount, 0);

        // 新しいチャージが1日の上限を超えるかチェック
        if (currentDailyChargedAmount + amount > DAILY_CHARGE_LIMIT) {
            alert(`1日のチャージ上限${DAILY_CHARGE_LIMIT.toLocaleString()}円を超えてしまいます。\n本日すでに${currentDailyChargedAmount.toLocaleString()}円チャージ済みです。`);
            return false;
        }

        balance += amount;

        const newTransaction = {
            type: 'charge',
            amount: amount,
            timestamp: new Date().toISOString(),
            method: 'チャージ'
        };
        transactions.push(newTransaction);

        // 1日チャージ履歴に新しいチャージを追加
        dailyCharges.push({
            amount: amount,
            timestamp: now // 現在のUNIXタイムスタンプを記録
        });
        localStorage.setItem(LOCAL_STORAGE_DAILY_CHARGE_KEY, JSON.stringify(dailyCharges));

        updateBalanceDisplay();
        updateHistoryDisplay();
        return true;
    };


    // --- 初期化処理 ---
    loadAppData();
    updateBalanceDisplay();
    updateHistoryDisplay();
    showSection(mainPaymentSection); 

    // --- イベントリスナー ---

    // メイン画面から各画面へ
    showQrReaderBtn.addEventListener('click', showQrReaderSection);
    showChargeBtn.addEventListener('click', showChargeSection);

    // QRリーダー画面関連
    cancelQrReadBtn.addEventListener('click', () => {
        stopCamera(); 
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
});
