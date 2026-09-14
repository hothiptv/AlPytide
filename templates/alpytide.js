/**
 * Alpytide Python Execution Engine Library v1.0
 */
const Alpytide = {
    apiUrl: "https://alpytide.onrender.com/api",

    /**
     * Hàm thực thi code Python qua Server
     * @param {string} code - Mã nguồn Python cần chạy
     * @param {HTMLElement|string} outputTarget - Phần tử hiển thị kết quả
     */
    async run(code, outputTarget) {
        const outputEl = typeof outputTarget === 'string' ? document.querySelector(outputTarget) : outputTarget;
        if (!outputEl) return;

        // Trạng thái 1: Đang khởi tạo kết nối
        outputEl.style.color = "#e5c07b";
        outputEl.innerText = "[SYSTEM] Đang khởi tạo kết nối tới Python API Engine...\n";

        // Trạng thái 2: Đang gửi gói tin qua Server
        await new Promise(r => setTimeout(r, 400));
        outputEl.innerText += "[NETWORK] Đang gửi mã nguồn tới https://alpytide.onrender.com/api ...\n";

        try {
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: code })
            });

            if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);

            // Trạng thái 3: Server đang xử lý
            outputEl.innerText += "[SERVER] Server đang biên dịch và thực thi trên Render Container...\n";
            await new Promise(r => setTimeout(r, 300));

            const result = await response.json();

            // Trạng thái 4: Trả về kết quả
            if (result.status === "success") {
                outputEl.style.color = "#98c379";
                outputEl.innerText = result.output || "[SUCCESS] Code chạy thành công (Không có output print).";
            } else {
                outputEl.style.color = "#e06c75";
                outputEl.innerText = "[PYTHON ERROR]\n" + result.error;
            }

        } catch (err) {
            // Trường hợp mất kết nối hoặc server đơ -> Báo lỗi & Reload trang
            outputEl.style.color = "#e06c75";
            outputEl.innerText = `[CRITICAL ERROR] Mất kết nối tới Python API! (${err.message})\n[SYSTEM] Hệ thống sẽ tự động tải lại trang sau 3 giây...`;
            
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        }
    }
};
