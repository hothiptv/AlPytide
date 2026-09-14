/**
 * Alpytide JS Library
 * Tự động quản lý kết nối, Render Cold Start và thực thi Python Code
 */

const ALPYTIDE_API_URL = "https://alpytide.onrender.com/api";

const Alpytide = {
    // Tự động kiểm tra và khóa/mở nút RUN khi khởi tạo
    async init(runBtnSelector, outputSelector) {
        const runBtn = document.querySelector(runBtnSelector);
        const output = document.querySelector(outputSelector);

        if (runBtn) runBtn.disabled = true;
        if (output) output.innerText = "API: Vui lòng chờ server được kết nối";

        let isSleeping = false;
        const sleepTimer = setTimeout(() => {
            isSleeping = true;
            if (output) output.innerText = "Đang khởi động API. Vui lòng đợi…";
        }, 3000); // Nếu quá 3 giây chưa phản hồi, xác định Render.com đang ngủ

        try {
            // Kiểm tra trạng thái Server (Ping Check)
            const response = await fetch(ALPYTIDE_API_URL, { method: "GET" });
            clearTimeout(sleepTimer);

            if (response.ok) {
                if (isSleeping && output) {
                    output.innerText = "Đã khởi động!\nĐã kết nối thành công";
                } else if (output) {
                    output.innerText = "Đã kết nối thành công";
                }
                if (runBtn) runBtn.disabled = false; // Mở khóa nút RUN
            } else {
                throw new Error("Server response not ok");
            }
        } catch (error) {
            clearTimeout(sleepTimer);
            if (output) output.innerText = "Server bị lỗi không thể kết nối được";
            if (runBtn) runBtn.disabled = true; // Khóa nút RUN nếu kết nối thất bại
        }
    },

    // Hàm thực thi Code Python
    async run(code, outputSelector, runBtnSelector) {
        const output = document.querySelector(outputSelector);
        const runBtn = document.querySelector(runBtnSelector);

        if (runBtn) runBtn.disabled = true;
        if (output) output.innerText = "Đang thực thi code…";

        try {
            const response = await fetch(ALPYTIDE_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: code })
            });

            if (!response.ok) throw new Error("HTTP Error");

            const data = await response.json();
            
            // Hiển thị kết quả trả về kèm thông báo hoàn tất
            const resultText = data.output || data.result || JSON.stringify(data);
            if (output) {
                output.innerText = resultText + "\n\nĐã thực thi xong!";
            }
        } catch (error) {
            if (output) {
                output.innerText = "Không thể thực thi…\nChi tiết lỗi: " + error.message;
            }
        } finally {
            if (runBtn) runBtn.disabled = false;
        }
    }
};
