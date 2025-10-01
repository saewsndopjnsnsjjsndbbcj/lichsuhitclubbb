const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const POLL_INTERVAL = 5000;   // thời gian poll API
const RETRY_DELAY = 5000;     // thời gian chờ khi lỗi
const MAX_HISTORY = 50;       // lưu tối đa 50 phiên lịch sử

// Biến lưu kết quả hiện tại
let latest100 = { Phien: 0, Xuc_xac_1: 0, Xuc_xac_2: 0, Xuc_xac_3: 0, Tong: 0, Ket_qua: "Chưa có" };
let latest101 = { Phien: 0, Xuc_xac_1: 0, Xuc_xac_2: 0, Xuc_xac_3: 0, Tong: 0, Ket_qua: "Chưa có" };

// Lịch sử
let history100 = [];
let history101 = [];

// Biến hỗ trợ TX
let sidForTX = null;

function getTaiXiu(d1, d2, d3) {
  const total = d1 + d2 + d3;
  return total <= 10 ? "Xỉu" : "Tài";
}

function updateResult(store, history, result) {
  Object.assign(store, result);
  history.unshift({ ...result });
  if (history.length > MAX_HISTORY) history.pop();
}

async function pollApi(gid, isMd5) {
  const url = `https://jakpotgwab.geightdors.net/glms/v1/notify/taixiu?platform_id=g8&gid=${gid}`;
  while (true) {
    try {
      const resp = await axios.get(url, { headers: { "User-Agent": "Node-Proxy/1.0" }, timeout: 10000 });
      const data = resp.data;

      // Nếu chưa có dữ liệu thì giữ nguyên phiên hiện tại, không update
      if (!data || data.status !== "OK" || !Array.isArray(data.data) || data.data.length === 0) {
        console.log(`[${gid}] ⏸ Chưa có dữ liệu mới, giữ nguyên phiên hiện tại: ${isMd5 ? latest101.Phien : latest100.Phien}`);
      } else {
        // lấy sid cho TX từ cmd 1008
        for (const game of data.data) {
          if (!isMd5 && game.cmd === 1008) {
            sidForTX = game.sid;
          }
        }

        for (const game of data.data) {
          const cmd = game.cmd;

          // xử lý MD5 (vgmn_101)
          if (isMd5 && cmd === 2006) {
            const sid = game.sid;
            const { d1, d2, d3 } = game;
            if (sid && d1 != null && d2 != null && d3 != null) {
              const total = d1 + d2 + d3;
              const ketQua = getTaiXiu(d1, d2, d3);
              const result = { Phien: sid, Xuc_xac_1: d1, Xuc_xac_2: d2, Xuc_xac_3: d3, Tong: total, Ket_qua: ketQua };
              updateResult(latest101, history101, result);
              console.log(`[MD5] ✅ Phiên ${sid} - Tổng: ${total}, Kết quả: ${ketQua}`);
            }
          }

          // xử lý TX (vgmn_100)
          else if (!isMd5 && cmd === 1003) {
            const { d1, d2, d3 } = game;
            const sid = sidForTX;
            if (sid && d1 != null && d2 != null && d3 != null) {
              const total = d1 + d2 + d3;
              const ketQua = getTaiXiu(d1, d2, d3);
              const result = { Phien: sid, Xuc_xac_1: d1, Xuc_xac_2: d2, Xuc_xac_3: d3, Tong: total, Ket_qua: ketQua };
              updateResult(latest100, history100, result);
              console.log(`[TX] ✅ Phiên ${sid} - Tổng: ${total}, Kết quả: ${ketQua}`);
              sidForTX = null;
            }
          }
        }
      }
    } catch (e) {
      console.error(`❌ Lỗi khi lấy dữ liệu API ${gid}:`, e.message);
      // lỗi thì giữ nguyên kết quả cũ
      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
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

// Start polling
pollApi("vgmn_100", false);
pollApi("vgmn_101", true);

// API endpoints
app.get("/api/taixiu", (req, res) => res.json(formatResult(latest100)));
app.get("/api/taixiumd5", (req, res) => res.json(formatResult(latest101)));
app.get("/api/history", (req, res) =>
  res.json({
    taixiu: history100.map(formatResult),
    taixiumd5: history101.map(formatResult)
  })
);
app.get("/", (req, res) =>
  res.send("API Server for TaiXiu is running. Endpoints: /api/taixiu, /api/taixiumd5, /api/history")
);

app.listen(PORT, () => console.log(`✅ Server chạy trên cổng ${PORT}`));
