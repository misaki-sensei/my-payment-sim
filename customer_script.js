// customer_script.js

// --- 追加: DOM要素の取得 ---
const showReceiveBtn = document.getElementById('showReceiveBtn');
const receiveQrSection = document.getElementById('receiveQrSection');
const closeReceiveBtn = document.getElementById('closeReceiveBtn');
const receiveQrCodeEl = document.getElementById('receiveQrCode');

// --- 追加: ユーザーIDの管理 (localStorageに保存して固定する) ---
let myUserId = localStorage.getItem('posipay_user_id');
if (!myUserId) {
    myUserId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('posipay_user_id', myUserId);
}

// --- 追加: 受け取りボタンの処理 ---
showReceiveBtn.addEventListener('click', () => {
    showSection(receiveQrSection);
    receiveQrCodeEl.innerHTML = ''; // クリア
    
    // 受け取り用QRデータ (タイプとIDを含める)
    const qrData = JSON.stringify({
        type: 'receive_money',
        userId: myUserId
    });

    new QRCode(receiveQrCodeEl, {
        text: qrData,
        width: 200,
        height: 200
    });
});

closeReceiveBtn.addEventListener('click', () => {
    showSection(mainPaymentSection);
});

// --- 追加: お店からの送金を監視 (Firebase) ---
// 'remittances/{userId}' というパスを監視します
const REMITTANCE_PATH = 'remittances/';

// アプリ起動時にリスナーをセット
database.ref(REMITTANCE_PATH + myUserId).on('child_added', (snapshot) => {
    const data = snapshot.val();
    
    // 既に処理済みのIDかチェックなどを入れるのが本来は望ましいですが、簡易的に実装します
    // ここでは「画面が開いている間に新しい送金があったら」反応します
    
    // ※注意: 実際の実装では、一度処理したトランザクションIDをローカルに保存して
    // 再読み込み時の二重加算を防ぐロジックが必要です。
    // 今回は簡易的に「現在時刻より少し前のデータのみ」などの制御は省略し、
    // シンプルに通知と反映を行います。

    const amount = parseInt(data.amount);
    if (!isNaN(amount) && amount > 0) {
        // 残高加算
        let currentBalance = parseFloat(localStorage.getItem(LOCAL_STORAGE_BALANCE_KEY)) || 0;
        currentBalance += amount;
        localStorage.setItem(LOCAL_STORAGE_BALANCE_KEY, currentBalance);
        
        // 履歴に追加
        const history = JSON.parse(localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY)) || [];
        history.unshift({
            type: 'charge', // 履歴上はチャージ扱い、または新しい 'receive' タイプを作る
            shopName: '店舗からの送金',
            amount: amount,
            date: new Date().toLocaleString()
        });
        localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(history));

        // 表示更新
        updateBalanceDisplay();
        updateHistoryDisplay();

        alert(`${amount}円を受け取りました！`);
        
        // Firebaseのデータは消すか、processedフラグを立てるのが一般的
        snapshot.ref.remove(); 
    }
});