document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const paymentAmountInput = document.getElementById('paymentAmount');
    const generateQrBtn = document.getElementById('generateQrBtn');
    const qrDisplaySection = document.getElementById('qrDisplaySection');
    const qrCodeCanvas = document.getElementById('qrCodeCanvas'); 
    const qrUrlText = document.getElementById('qrUrlText'); 
    const paymentStatusEl = document.getElementById('paymentStatusText'); 
    const receivedPaymentInfoEl = document.getElementById('receivedPaymentInfo'); 
    const resetAppBtn = document.getElementById('resetAppBtn'); 
    const shopTransactionHistoryEl = document.getElementById('shopTransactionHistory');

    // --- 定数 ---
    const SHOP_ID = 'MOCKSHOP001'; 
    const LOCAL_STORAGE_SHOP_HISTORY_KEY = 'shopMockPayPayHistory';
    const LOCAL_STORAGE_CUSTOMER_STATUS_KEY = 'shopPaymentStatus'; // 顧客からの支払い通知用キー

    // --- アプリの状態変数 ---
    let shopTransactions = [];
    let currentExpectedTransactionId = null; // 現在のQRコードが示す取引ID
    let qrCode = null; 

    // --- 関数 ---

    const updateShopHistoryDisplay = () => {
        shopTransactionHistoryEl.innerHTML = '';
        if (shopTransactions.length === 0) {
            const noHistoryItem = document.createElement('li');
            noHistoryItem.textContent = '入金履歴はありません。'; 
            shopTransactionHistoryEl.appendChild(noHistoryItem);
            return;
        }

        for (let i = shopTransactions.length - 1; i >= 0; i--) {
            const transaction = shopTransactions[i];
            const listItem = document.createElement('li');
            listItem.classList.add('charge'); 

            const date = new Date(transaction.timestamp);
            const dateStr = date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
            const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

            listItem.innerHTML = `
                <span>入金完了</span>
                <span>¥ ${transaction.amount.toLocaleString()}</span>
                <span class="history-date">${dateStr} ${timeStr}</span>
            `;
            shopTransactionHistoryEl.appendChild(listItem);
        }
        localStorage.setItem(LOCAL_STORAGE_SHOP_HISTORY_KEY, JSON.stringify(shopTransactions));
    };

    const loadShopAppData = () => {
        shopTransactions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SHOP_HISTORY_KEY)) || [];
    };

    /**
     * ユニークな取引IDを生成します。
     */
    const generateUniqueTransactionId = () => {
        return `${SHOP_ID}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    };

    /**
     * QRコードを生成し、表示を更新します。
     */
    const generateAndDisplayQrCode = () => {
        const amount = parseFloat(paymentAmountInput.value);

        if (isNaN(amount) || amount <= 0) {
            alert('有効な金額を入力してください！');
            qrDisplaySection.classList.add('hidden');
            return;
        }

        currentExpectedTransactionId = generateUniqueTransactionId(); // 新しい取引IDを生成

        // QRコード生成に使用するURLデータに取引IDを含める
        const qrDataUrl = `customer.html#amount=${amount}&shopId=${SHOP_ID}&transactionId=${currentExpectedTransactionId}`;
        qrUrlText.textContent = qrDataUrl; 

        // 既存のQRコードがあればクリア
        if (qrCode) {
            qrCode.clear(); 
            qrCode = null;
        }

        // qrCodeCanvas要素が存在するか確認
        if (qrCodeCanvas) {
            qrCodeCanvas.textContent = "";
            // qrcode.js を使ってQRコードを生成し、Canvasに描画
            qrCode = new QRCode(qrCodeCanvas, {
                text: qrDataUrl,
                width: 200,
                height: 200,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });

            // QRコード生成後、canvasのaria-labelを更新 (アクセシビリティ対応)
            qrCodeCanvas.setAttribute('aria-label', `支払い金額${amount.toLocaleString()}円のQRコード（店舗ID: ${SHOP_ID}, 取引ID: ${currentExpectedTransactionId}）`);
        } else {
            // Canvas要素が見つからない場合はエラーをコンソールに出力し、アラート
            console.error('QRコードを描画するためのCanvas要素が見つかりません。HTMLを確認してください。');
            alert('QRコード表示に問題が発生しました。ブラウザのコンソールを確認してください。');
            return; // Canvasがない場合は処理を中断
        }

        qrDisplaySection.classList.remove('hidden');
        paymentStatusEl.innerHTML = '<span class="icon">⏳</span> 顧客からの支払い待ち...';
        paymentStatusEl.className = 'status-pending';
        receivedPaymentInfoEl.classList.add('hidden'); 

        // 新しいQRコードを生成したので、過去の顧客からの通知をクリア
        localStorage.removeItem(LOCAL_STORAGE_CUSTOMER_STATUS_KEY);
    };

    /**
     * 顧客からの支払いステータスをチェックします。
     */
    const checkCustomerPaymentStatus = () => {
        const statusData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_CUSTOMER_STATUS_KEY));

        // currentExpectedTransactionId と受信した transactionId が一致し、かつShopIDも一致する場合に処理
        if (statusData && statusData.status === 'success' && 
            statusData.shopId === SHOP_ID && 
            statusData.transactionId === currentExpectedTransactionId) {
            
            paymentStatusEl.innerHTML = `<span class="icon">✅</span> ¥ ${statusData.amount.toLocaleString()} が入金されました！`;
            paymentStatusEl.className = 'status-success';
            
            receivedPaymentInfoEl.textContent = `取引ID: ${statusData.transactionId} (模擬)`; 
            receivedPaymentInfoEl.classList.remove('hidden');

            shopTransactions.push({
                amount: statusData.amount,
                timestamp: statusData.timestamp,
                type: 'incoming',
                transactionId: statusData.transactionId // 履歴にも取引IDを追加
            });
            updateShopHistoryDisplay();

            // 支払い完了を受け取ったら、この取引は完了とみなし、次のQR生成まで待機状態に
            currentExpectedTransactionId = null; 
            localStorage.removeItem(LOCAL_STORAGE_CUSTOMER_STATUS_KEY); // 通知をクリア
        }
    };

    // --- 初期化処理 ---
    loadShopAppData();
    updateShopHistoryDisplay();
    // 顧客からの支払いステータスを定期的にチェック
    setInterval(checkCustomerPaymentStatus, 1000); 

    // --- イベントリスナー ---
    generateQrBtn.addEventListener('click', generateAndDisplayQrCode);

    resetAppBtn.addEventListener('click', () => { 
        qrDisplaySection.classList.add('hidden');
        paymentAmountInput.value = '0'; 
        paymentStatusEl.innerHTML = '<span class="icon">⏳</span> 顧客からの支払い待ち...'; 
        paymentStatusEl.className = 'status-pending';
        receivedPaymentInfoEl.classList.add('hidden');
        localStorage.removeItem(LOCAL_STORAGE_CUSTOMER_STATUS_KEY); // リセット時もクリア
        currentExpectedTransactionId = null; // リセット時も取引IDをクリア
        
        if (qrCode) { 
            qrCode.clear();
            qrCode = null;
        }
        qrUrlText.textContent = ''; 
        // リセット時もcanvasのaria-labelを初期状態に戻す (アクセシビリティ対応)
        if (qrCodeCanvas) {
            qrCodeCanvas.setAttribute('aria-label', '支払い金額未設定のQRコード表示エリア');
        }
    });
});
