// shop_script.js (Firebase連携版 - 更新済み)
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const mainShopSection = document.getElementById('mainShopSection'); // 新しいDOMの親要素
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    let qrCodeCanvas = document.getElementById('qrCodeCanvas'); 
    const qrUrlText = document.getElementById('qrUrlText'); // 追加された要素
    const paymentStatusText = document.getElementById('paymentStatusText'); // ID変更
    const receivedPaymentInfoEl = document.getElementById('receivedPaymentInfo'); // ID変更
    const resetAppBtn = document.getElementById('resetAppBtn');
    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');

    // 支払い完了時に表示する新しいセクションの要素
    const paymentReceivedSection = document.getElementById('paymentReceivedSection'); // 新しいセクション
    const receivedAmountEl = document.getElementById('receivedAmount'); // 新しいセクション内の要素
    const receivedCustomerInfoNewEl = document.getElementById('receivedCustomerInfo'); // 新しいセクション内の要素
    const backToMainFromShopCompletionBtn = document.getElementById('backToMainFromShopCompletionBtn');


    // --- 定数 ---
    const SHOP_ID = 'MOCKSHOP001';
    const LOCAL_STORAGE_SHOP_HISTORY_KEY = 'shopMockPayPayHistory'; // ローカル履歴は引き続きLocalStorage
    // const LOCAL_STORAGE_CUSTOMER_STATUS_KEY = 'shopPaymentStatus'; // 顧客からの支払い通知用キー - Firebaseに移行


    // --- アプリの状態変数 ---
    let shopTransactions = [];
    let currentExpectedTransactionId = null; // 現在のQRコードが示す取引ID
    let qrCode = null; 

    // --- Firebase Realtime Database 参照の取得 ---
    // HTMLファイルで既にfirebase.initializeApp()とfirebase.database()が実行され、
    // database変数がグローバルに利用可能になっていることを想定
    const PAYMENT_REQUEST_DB_PATH = 'paymentRequests/'; // Firebaseのパス
    const PAYMENT_STATUS_DB_PATH = 'paymentStatuses/'; // Firebaseのパス

    const paymentRequestsRef = database.ref(PAYMENT_REQUEST_DB_PATH);
    const paymentStatusesRef = database.ref(PAYMENT_STATUS_DB_PATH);

    // --- 関数 ---

    const updateShopHistoryDisplay = () => {
        shopTransactionHistoryEl.innerHTML = '';
        if (shopTransactions.length === 0) {
            const noHistoryItem = document.createElement('li');
            noHistoryItem.textContent = '入金履歴はありません。'; 
            shopTransactionHistoryEl.appendChild(noHistoryItem);
            return;
        }
        shopTransactions.sort((a, b) => b.timestamp - a.timestamp).forEach(transaction => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <span>${new Date(transaction.timestamp).toLocaleString()}</span>
                <span>¥ ${transaction.amount.toLocaleString()}</span>
                <span class="shop-id-display">${transaction.shopId}</span>
            `;
            shopTransactionHistoryEl.appendChild(listItem);
        });
    };

    const generateAndDisplayQrCode = () => {
        const amount = parseFloat(paymentAmountInput.value);
        if (isNaN(amount) || amount <= 0) {
            alert('有効な支払い金額を入力してください。');
            return;
        }

        // ユニークな取引IDを生成 (Firebaseのプッシュキーを利用)
        const newPaymentRequestRef = paymentRequestsRef.push();
        const transactionId = newPaymentRequestRef.key; // 生成されたキーを取引IDとする

        const qrData = JSON.stringify({
            amount: amount,
            shopId: SHOP_ID,
            transactionId: transactionId // 取引IDをQRデータに含める
        });

        // QRコードクリア
        if (qrCode) {
            qrCode.clear();
        } else {
            // qrcode.jsがCanvas要素を直接置き換えるので、初回のみ初期化
            qrCodeCanvas.innerHTML = ''; // 古いQRコードをクリア
        }

        // QRコード生成
        qrCode = new QRCode(qrCodeCanvas, {
            text: qrData,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        qrUrlText.textContent = `QRコードデータ: ${qrData}`;
        qrDisplaySection.classList.remove('hidden');

        // 支払いステータス表示をリセット
        paymentStatusText.innerHTML = '<span class="icon">⏳</span> 顧客からの支払い待ち...';
        paymentStatusText.className = 'status-pending';
        receivedPaymentInfoEl.classList.add('hidden');

        // 現在期待する取引IDを保存
        currentExpectedTransactionId = transactionId;

        // Firebaseに支払いリクエストを記録 (オプション: これは顧客側が読み取るため、直接DBに置かなくても良いが、追跡のために置くことも可能)
        newPaymentRequestRef.set({
            amount: amount,
            shopId: SHOP_ID,
            timestamp: Date.now(),
            status: 'pending' // 初期ステータス
        });

        // 顧客からの支払いステータスを監視開始 (特定のtransactionIdの子を監視)
        startListeningForPaymentStatus(transactionId);
    };

    // Firebaseから特定の取引IDの支払いステータスを監視する
    const startListeningForPaymentStatus = (transactionId) => {
        // 以前のリスナーを解除する（念のため）
        // database.ref(PAYMENT_STATUS_DB_PATH).off(); // 全体のリスナーを解除

        // 特定の取引IDのステータス変更を監視
        paymentStatusesRef.child(transactionId).on('value', (snapshot) => {
            const statusData = snapshot.val();
            if (statusData && statusData.status === 'completed' && statusData.transactionId === transactionId) {
                // 支払い完了の通知
                paymentStatusText.innerHTML = '<span class="icon">✅</span> 支払い完了！';
                paymentStatusText.className = 'status-completed';
                receivedPaymentInfoEl.textContent = `顧客から ¥ ${statusData.amount.toLocaleString()} の支払いを確認しました。`;
                receivedPaymentInfoEl.classList.remove('hidden');

                // 履歴に追加
                shopTransactions.push({
                    amount: statusData.amount,
                    timestamp: statusData.timestamp,
                    shopId: statusData.shopId, // 店舗IDも履歴に含める
                    type: 'incoming',
                    transactionId: statusData.transactionId
                });
                saveShopAppData(); // 履歴を保存
                updateShopHistoryDisplay();

                // 支払い完了を受け取ったら、この取引は完了とみなし、次のQR生成まで待機状態に
                // Firebaseからこの取引のステータスを削除
                paymentStatusesRef.child(transactionId).remove();
                currentExpectedTransactionId = null;
            }
        });
    };

    const loadShopAppData = () => {
        const storedTransactions = localStorage.getItem(LOCAL_STORAGE_SHOP_HISTORY_KEY);
        if (storedTransactions) {
            shopTransactions = JSON.parse(storedTransactions);
        }
    };

    const saveShopAppData = () => {
        localStorage.setItem(LOCAL_STORAGE_SHOP_HISTORY_KEY, JSON.stringify(shopTransactions));
    };

    // --- 初期化処理 ---
    loadShopAppData();
    updateShopHistoryDisplay();
    
    // --- イベントリスナー ---
    generateQrBtn.addEventListener('click', generateAndDisplayQrCode);

    resetAppBtn.addEventListener('click', () => { 
        qrDisplaySection.classList.add('hidden');
        paymentAmountInput.value = '0'; 
        paymentStatusText.innerHTML = '<span class="icon">⏳</span> 顧客からの支払い待ち...'; 
        paymentStatusText.className = 'status-pending';
        receivedPaymentInfoEl.classList.add('hidden');
        
        // Firebaseの監視を停止し、現在の期待取引IDをクリア
        if (currentExpectedTransactionId) {
            paymentStatusesRef.child(currentExpectedTransactionId).off('value'); // 監視停止
            currentExpectedTransactionId = null; 
        }

        if (qrCode) { 
            qrCode.clear();
            qrCode = null;
        }
        qrUrlText.textContent = '';
        qrUrlText.classList.add('hidden'); // URL表示を隠す
        // document.getElementById('actionSection').classList.remove('hidden'); // HTMLにactionSection IDがないためコメントアウト
    });

    // ページを閉じる前にデータを保存
    window.addEventListener('beforeunload', saveShopAppData);
});
