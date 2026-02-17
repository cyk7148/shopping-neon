<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>萌商城 - 2026 馬年營運版</title>
    
    <style>
        :root {
            --primary-gold: #d4af37;
            --noble-red: #800000;
            --glass: rgba(255, 255, 255, 0.9);
        }

        body {
            font-family: -apple-system, sans-serif;
            margin: 0; padding: 0; background: #f8f8f8;
            -webkit-tap-highlight-color: transparent;
        }

        /* [始版 DNA] 32px 漢堡按鈕 */
        .menu-btn {
            width: 32px; height: 32px;
            padding: 10px; cursor: pointer;
            position: fixed; top: 10px; left: 10px; z-index: 1000;
            background: var(--glass); border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        /* 全服同步計數面板 */
        .sync-panel {
            background: linear-gradient(135deg, #fff9e6 0%, #ffffff 100%);
            border: 2px solid var(--primary-gold);
            border-radius: 12px; margin: 65px 15px 15px;
            padding: 20px; text-align: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.05);
        }
        #global-count-display { margin: 0; color: var(--noble-red); font-size: 26px; font-weight: 900; }
        #jackpot-hint { color: #ff4500; font-weight: bold; margin-top: 8px; font-size: 14px; }

        /* [始版 DNA] 紅金漸層公告欄 */
        #winner-announcement {
            margin: 15px; border-radius: 12px; overflow: hidden;
            background: linear-gradient(45deg, #800000, #b22222);
            border: 2px solid var(--primary-gold);
        }
        .announcement-header {
            background: var(--primary-gold); color: white;
            padding: 10px; text-align: center; font-weight: bold;
            animation: blink 2s infinite;
        }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        .winner-msg {
            padding: 12px; color: white; border-bottom: 1px solid rgba(255,255,255,0.1);
            text-align: left; font-size: 14px;
        }
        .winner-msg b { color: #ffd700; margin-right: 5px; }

        /* 商品區塊 [始版 DNA] */
        .product-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 15px; }
        .card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .card img { width: 100%; height: 140px; object-fit: cover; background: #eee; }
        .card-info { padding: 10px; text-align: center; }
        .card-info h4 { margin: 5px 0; font-size: 15px; color: #333; }
        .price { color: var(--noble-red); font-weight: bold; margin-bottom: 8px; }

        /* [始版 DNA] 數量增減按鈕 */
        .qty-control {
            display: flex; align-items: center; justify-content: center;
            gap: 12px; margin: 10px 0;
        }
        .qty-btn {
            width: 26px; height: 26px; border-radius: 50%;
            border: 1px solid #ddd; background: #fff; font-weight: bold; cursor: pointer;
        }
        .qty-btn:active { background: #eee; }

        /* 刮刮樂按鈕 */
        .scratch-area { background: white; margin: 15px; padding: 25px; border-radius: 15px; text-align: center; border: 1px solid #eee; }
        #prize-box { height: 50px; line-height: 50px; background: #f0f0f0; border-radius: 8px; margin: 15px 0; font-weight: bold; color: var(--noble-red); }
        .btn-main { background: var(--noble-red); color: white; border: none; padding: 12px; border-radius: 25px; width: 100%; font-size: 16px; font-weight: bold; cursor: pointer; }
        .btn-main:disabled { background: #ccc; }

        .hidden { display: none; }
    </style>
</head>
<body>

    <img src="https://cdn-icons-png.flaticon.com/512/5068/5068680.png" class="menu-btn" onclick="alert('選單功能載入中...')">

    <div class="sync-panel">
        <h2 id="global-count-display">🔥 全服累計：-- 抽</h2>
        <div id="jackpot-hint">同步中...</div>
    </div>

    <div id="winner-announcement" class="hidden">
        <div class="announcement-header">✨ 2026 馬王榮耀榜 ✨</div>
        <div id="winner-list"></div>
    </div>

    <div class="scratch-area">
        <h3 style="margin:0;">🧧 霸氣刮刮樂</h3>
        <div id="prize-box">準備好開刮了嗎？</div>
        <button class="btn-main" id="scratch-btn" onclick="playScratch()">消耗 10 積分開刮</button>
    </div>

    <div class="product-grid" id="product-list">
        </div>

    <script>
        // [核心設定]
        const API = "https://shopping-neon.onrender.com/api"; 
        let user = JSON.parse(localStorage.getItem('始版_user')) || { email: "test@gmail.com" };

        // 1. 同步全服次數與公告欄
        async function syncAll() {
            try {
                // 更新次數
                const gRes = await fetch(API + "/global-stats");
                const gData = await gRes.json();
                document.getElementById('global-count-display').innerText = `🔥 全服累計：${gData.total} 抽`;
                document.getElementById('jackpot-hint').innerText = `距離下次 88萬 大獎：${100 - (gData.total % 100)} 抽`;

                // 更新公告 (一人一號，由早排到晚)
                const wRes = await fetch(API + "/winners");
                const wData = await wRes.json();
                const board = document.getElementById('winner-announcement');
                const list = document.getElementById('winner-list');
                
                if (wData.length > 0) {
                    board.classList.remove('hidden');
                    list.innerHTML = wData.map(w => `
                        <div class="winner-msg">
                            🏅 <b>No.${w.winner_no} ${w.username}</b> 賀："${w.bio}"
                        </div>
                    `).join('');
                }
            } catch (e) { console.error("同步失敗"); }
        }

        // 2. 載入商品 (福氣熊熊)
        async function loadProducts() {
            try {
                const res = await fetch(API + "/products");
                const products = await res.json();
                const list = document.getElementById('product-list');
                
                list.innerHTML = products.map(p => `
                    <div class="card">
                        <img src="${p.image_url}" alt="${p.name}">
                        <div class="card-info">
                            <h4>${p.name}</h4>
                            <div class="price">$${p.price}</div>
                            <div class="qty-control">
                                <button class="qty-btn" onclick="changeQty(${p.id}, -1)">-</button>
                                <span id="qty-${p.id}">1</span>
                                <button class="qty-btn" onclick="changeQty(${p.id}, 1)">+</button>
                            </div>
                            <button class="btn-main" style="font-size:12px; padding:8px;" onclick="addToCart(${p.id})">加入購物車</button>
                        </div>
                    </div>
                `).join('');
            } catch (e) { console.error("商品載入失敗"); }
        }

        function changeQty(id, delta) {
            const el = document.getElementById(`qty-${id}`);
            let v = parseInt(el.innerText) + delta;
            if (v < 1) v = 1;
            el.innerText = v;
        }

        // 3. 刮刮樂邏輯
        async function playScratch() {
            const btn = document.getElementById('scratch-btn');
            const box = document.getElementById('prize-box');
            btn.disabled = true;
            box.innerText = "正在向馬王求籤...";

            try {
                const res = await fetch(API + "/scratch-win", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: user.email })
                });
                const d = await res.json();
                box.innerText = d.prizeName;
                if (d.prizeName.includes("88萬")) alert(`🎊 恭喜！您是第 ${d.winnerNo} 位馬王！`);
                syncAll();
            } catch (e) {
                alert("餘額不足或系統繁忙");
                box.innerText = "請重試";
            } finally {
                btn.disabled = false;
            }
        }

        // 啟動定時器：每 3 秒同步一次全服數據
        setInterval(syncAll, 3000);
        
        // 初始載入
        window.onload = () => {
            syncAll();
            loadProducts();
        };
    </script>
</body>
</html>
