const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const POLL_INTERVAL = 5000;   // thời gian poll API
const RETRY_DELAY = 5000;     // thời gian chờ khi lỗi
const MAX_HISTORY = 50;       // lưu tối đa 50 phiên lịch sử

// Biến lưu kết quả hiện tại cho MD5
let latest101 = { Phien: 0, Xuc_xac_1: 0, Xuc_xac_2: 0, Xuc_xac_3: 0, Tong: 0, Ket_qua: "Chưa có" };

// Lịch sử cho MD5
let history101 = [];

function getTaiXiu(d1, d2, d3) {
  // 11 là xí ngầu cân bằng, nhưng theo logic ban đầu: TỔNG <= 10 là Xỉu, > 10 là Tài.
  // Nếu muốn xử lý 11 là Xí Ngầu Cân Bằng (Bão/Hòa) thì cần chỉnh sửa thêm.
  const total = d1 + d2 + d3;
  return total <= 10 ? "Xỉu" : "Tài";
}

function updateResult(store, history, result) {
  // Cập nhật kết quả hiện tại
  Object.assign(store, result);
  // Thêm vào lịch sử
  history.unshift({ ...result });
  // Giới hạn lịch sử
  if (history.length > MAX_HISTORY) history.pop();
}

async function pollApi(gid) { // Bỏ biến isMd5 vì chỉ còn MD5
  const url = `https://jakpotgwab.geightdors.net/glms/v1/notify/taixiu?platform_id=g8&gid=${gid}`;
  while (true) {
    try {
      const resp = await axios.get(url, { headers: { "User-Agent": "Node-Proxy/1.0" }, timeout: 10000 });
      const data = resp.data;

      // Nếu chưa có dữ liệu thì giữ nguyên phiên hiện tại, không update
      if (!data || data.status !== "OK" || !Array.isArray(data.data) || data.data.length === 0) {
        console.log(`[${gid}] ⏸ Chưa có dữ liệu mới, giữ nguyên phiên hiện tại: ${latest101.Phien}`);
      } else {
        
        // Chỉ xử lý cho game vgmn_101 (MD5)
        for (const game of data.data) {
          const cmd = game.cmd;

          // xử lý MD5 (vgmn_101), cmd = 2006
          if (cmd === 2006) {
            const sid = game.sid;
            const { d1, d2, d3 } = game;
            if (sid && d1 != null && d2 != null && d3 != null) {
              const total = d1 + d2 + d3;
              const ketQua = getTaiXiu(d1, d2, d3);
              const result = { Phien: sid, Xuc_xac_1: d1, Xuc_xac_2: d2, Xuc_xac_3: d3, Tong: total, Ket_qua: ketQua };
              
              // Chỉ update kết quả cho MD5
              if (result.Phien !== latest101.Phien) { // Kiểm tra để tránh ghi đè kết quả cũ
                updateResult(latest101, history101, result);
                console.log(`[MD5] ✅ Phiên ${sid} - Tổng: ${total}, Kết quả: ${ketQua}`);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error(`❌ Lỗi khi lấy dữ liệu API ${gid}:`, e.message);
      // lỗi thì giữ nguyên kết quả cũ và chờ trước khi thử lại
      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
    // Chờ trước khi poll lần tiếp theo
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

// format chuẩn xuất ra
function formatResult(result) {
  return {
    Phien: result.Phien,
    Xuc_xac_1: result.Xuc_xac_1,
    Xuc_xac_2: result.Xuc_xac_2,
    Xuc_xac_3: result.Xuc_xac_3,
    Tong: result.Tong,
    Ket_qua: result.Ket_qua
  };
}

// Start polling CHỈ cho MD5 (gid: vgmn_101)
pollApi("vgmn_101");

// API endpoints
// Chỉ giữ lại endpoint cho MD5
app.get("/api/taixiumd5", (req, res) => res.json(formatResult(latest101)));

// Endpoint lịch sử CHỈ trả về lịch sử MD5
app.get("/api/history", (req, res) =>
  res.json({
    taixiumd5: history101.map(formatResult)
  })
);

app.get("/", (req, res) =>
  res.send("API Server for TaiXiu MD5 is running. Endpoints: /api/taixiumd5, /api/history")
);

app.listen(PORT, () => console.log(`✅ Server chạy trên cổng ${PORT}`));
                              
