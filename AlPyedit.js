/* ============================================================
   EDITOR CORE LOGIC - ALPYEDIT
   Xử lý logic nhập liệu, tính toán con trỏ, highlight & context menu
   ============================================================ */

const editor = document.getElementById("realEditor");
const highlightLayer = document.getElementById("highlightLayer");
const lineNumbers = document.getElementById("lineNumbers");
const virtualCaret = document.getElementById("virtualCaret");
const caretMirror = document.getElementById("caretMirror");
const longPressMenu = document.getElementById("longPressMenu");
const searchInput = document.querySelector(".menu-search-input");

const DEFAULT_CODE = "";
let currentSearchQuery = "";

// Khởi tạo Editor khi load trang
window.addEventListener("load", () => {
    if (editor) {
        editor.value = DEFAULT_CODE;
        updateEditor();
    }
});

// Ô tìm kiếm trong Context Menu
if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        onSearchInput(e.target.value);
    });
}

// Đồng bộ hóa cuộn giữa Textarea và Highlight Layer
if (editor) {
    editor.addEventListener("scroll", () => {
        highlightLayer.scrollTop = editor.scrollTop;
        highlightLayer.scrollLeft = editor.scrollLeft;
        lineNumbers.scrollTop = editor.scrollTop;
        updateVirtualCaret();
    });

    editor.addEventListener("input", () => {
        updateEditor();
    });

    // Xử lý các phím đặc biệt (Tự động lùi dòng, đóng ngoặc)
    editor.addEventListener("keydown", (e) => {
        hideMenu();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const val = editor.value;

        const pairs = { '"': '"', "'": "'", '(': ')', '[': ']', '{': '}' };
        const closeChars = ['"', "'", ')', ']', '}'];

        // Bỏ qua ký tự đóng ngoặc trùng lặp
        if (closeChars.includes(e.key) && start === end && val.charAt(start) === e.key) {
            e.preventDefault();
            editor.selectionStart = editor.selectionEnd = start + 1;
            updateVirtualCaret();
            return;
        }

        // Tự động đóng cặp ngoặc / nháy
        if (pairs[e.key]) {
            e.preventDefault();
            const selectedText = val.substring(start, end);
            editor.value = val.substring(0, start) + e.key + selectedText + pairs[e.key] + val.substring(end);
            if (start === end) {
                editor.selectionStart = editor.selectionEnd = start + 1;
            } else {
                editor.selectionStart = start + 1;
                editor.selectionEnd = end + 1;
            }
            updateEditor();
            return;
        }

        // Xử lý Backspace cho cặp ngoặc và Indent 4 space
        if (e.key === 'Backspace' && start === end && start > 0) {
            const charBefore = val.charAt(start - 1);
            const charAfter = val.charAt(start);

            if (pairs[charBefore] && pairs[charBefore] === charAfter) {
                e.preventDefault();
                editor.value = val.substring(0, start - 1) + val.substring(start + 1);
                editor.selectionStart = editor.selectionEnd = start - 1;
                updateEditor();
                return;
            }

            if (start >= 4 && val.substring(start - 4, start) === '    ') {
                e.preventDefault();
                editor.value = val.substring(0, start - 4) + val.substring(end);
                editor.selectionStart = editor.selectionEnd = start - 4;
                updateEditor();
                return;
            }
        }

        // Tự động thụt dòng (Auto-indentation) khi nhấn Enter
        if (e.key === 'Enter') {
            e.preventDefault();
            const lineStart = val.lastIndexOf('\n', start - 1) + 1;
            const currentLine = val.substring(lineStart, start);
            let indent = currentLine.match(/^\s*/)[0];
            if (currentLine.trim().endsWith(':')) indent += '    ';

            editor.value = val.substring(0, start) + '\n' + indent + val.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 1 + indent.length;
            updateEditor();
            return;
        }
    });

    editor.addEventListener("focus", () => virtualCaret.style.display = "block");
    editor.addEventListener("blur", () => {
        // Tránh ẩn ngay khi nhấn vào context menu
        setTimeout(() => {
            if (document.activeElement !== searchInput) {
                virtualCaret.style.display = "none";
            }
        }, 150);
    });
}

document.addEventListener("selectionchange", () => {
    if (document.activeElement === editor) {
        updateEditor();
    }
});

// Cập nhật giao diện Editor
function updateEditor() {
    if (!editor) return;
    const code = editor.value;
    const lines = code.split('\n');
    const errorLines = new Set();
    checkBracketErrors(code, errorLines);

    let lineHtml = '';
    lines.forEach((_, idx) => {
        const lineNum = idx + 1;
        const isError = errorLines.has(lineNum);
        lineHtml += `<span class="line-num ${isError ? 'error' : ''}">${lineNum}</span>`;
    });
    lineNumbers.innerHTML = lineHtml;

    highlightLayer.innerHTML = highlightSyntax(code) + '\n';
    updateVirtualCaret();
}

// Tính toán vị trí hiển thị con trỏ ảo chuẩn xác theo lề
function updateVirtualCaret() {
    if (!editor || !caretMirror || !virtualCaret) return;
    const pos = editor.selectionStart;
    const textBefore = editor.value.substring(0, pos);

    caretMirror.style.width = editor.clientWidth + 'px';
    caretMirror.innerHTML = '';

    const textNode = document.createTextNode(textBefore);
    const span = document.createElement('span');
    span.id = 'caretTarget';
    span.textContent = '|';

    caretMirror.appendChild(textNode);
    caretMirror.appendChild(span);

    const targetSpan = document.getElementById('caretTarget');
    if (targetSpan) {
        const top = targetSpan.offsetTop - editor.scrollTop;
        const left = targetSpan.offsetLeft - editor.scrollLeft;

        virtualCaret.style.top = top + 'px';
        virtualCaret.style.left = left + 'px';
        virtualCaret.style.display = "block";
    }
}

// Tìm kiếm văn bản
function onSearchInput(query) {
    currentSearchQuery = query;
    updateEditor();
}

// Tô màu cú pháp (Syntax Highlighter)
function highlightSyntax(code) {
    let escaped = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    let res = escaped.replace(
        /(#.*)|(".*?"|'.*?')|\b(def|class|if|elif|else|for|while|import|from|return|in|is|not|and|or|True|False|None)\b|\b(print|len|range|int|str|float|list|dict|sum|max|min|input|type|sqrt)\b|\b(\d+)\b/g,
        (match, comment, string, keyword, func, num) => {
            if (comment) return `<span class="token-comment">${comment}</span>`;
            if (string)  return `<span class="token-string">${string}</span>`;
            if (keyword) return `<span class="token-keyword">${keyword}</span>`;
            if (func)    return `<span class="token-function">${func}</span>`;
            if (num)     return `<span class="token-number">${num}</span>`;
            return match;
        }
    );

    if (currentSearchQuery && currentSearchQuery.trim() !== "") {
        const reg = new RegExp(`(${currentSearchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        res = res.replace(reg, `<mark class="highlight-search">$1</mark>`);
    }

    return res;
}

// Kiểm tra lỗi ngoặc
function checkBracketErrors(code, errorLines) {
    const stack = [];
    const lines = code.split('\n');
    lines.forEach((lineText, idx) => {
        for (let char of lineText) {
            if ('({['.includes(char)) stack.push({ char, line: idx + 1 });
            else if (')}]'.includes(char)) {
                if (stack.length > 0) stack.pop();
                else errorLines.add(idx + 1);
            }
        }
    });
    stack.forEach(item => errorLines.add(item.line));
}

// Sự kiện Nhấn giữ (Long Press) bật Menu
let pressTimer = null;

function startPress(e) {
    if (e.target === searchInput) return;
    hideMenu();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    pressTimer = setTimeout(() => {
        showMenu(clientX, clientY);
    }, 400);
}

function cancelPress() {
    if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
    }
}

function showMenu(x, y) {
    if (!longPressMenu) return;
    const menuWidth = 160;
    const menuHeight = 200;

    let posX = Math.min(x, window.innerWidth - menuWidth - 8);
    let posY = Math.min(y, window.innerHeight - menuHeight - 8);

    longPressMenu.style.left = Math.max(8, posX) + 'px';
    longPressMenu.style.top = Math.max(8, posY) + 'px';
    longPressMenu.style.display = 'flex';
}

function hideMenu() {
    if (longPressMenu) longPressMenu.style.display = 'none';
}

if (editor) {
    editor.addEventListener('touchstart', startPress, { passive: true });
    editor.addEventListener('touchend', cancelPress);
    editor.addEventListener('touchmove', cancelPress);

    editor.addEventListener('mousedown', startPress);
    editor.addEventListener('mouseup', cancelPress);
    editor.addEventListener('mouseleave', cancelPress);
}

// ============================================================
// BỘ HÀM THAO TÁC DỮ LIỆU & BỘ NHỚ TẠM (CLIPBOARD COMMANDS)
// ============================================================

// 1. Cắt (Cut)
async function cutCode() {
    hideMenu();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;

    if (start !== end) {
        const textToCut = editor.value.substring(start, end);
        await navigator.clipboard.writeText(textToCut);
        editor.value = editor.value.substring(0, start) + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start;
        updateEditor();
    }
}

// 2. Sao chép (Copy)
async function copyCode() {
    hideMenu();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const textToCopy = start !== end ? editor.value.substring(start, end) : editor.value;

    await navigator.clipboard.writeText(textToCopy);
}

// 3. Dán (Paste)
async function pasteCode() {
    hideMenu();
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.value = editor.value.substring(0, start) + text + editor.value.substring(end);
            editor.selectionStart = editor.selectionEnd = start + text.length;
            updateEditor();
        }
    } catch {
        // Fallback cho trình duyệt chặn quyền đọc clipboard
        const text = prompt("Dán nội dung vào đây:");
        if (text) {
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.value = editor.value.substring(0, start) + text + editor.value.substring(end);
            editor.selectionStart = editor.selectionEnd = start + text.length;
            updateEditor();
        }
    }
}

// 4. Chọn tất cả (Select All)
function selectAllCode() {
    hideMenu();
    if (editor) {
        editor.focus();
        editor.setSelectionRange(0, editor.value.length);
    }
}

// 5. Xóa tất cả (Clear All)
function clearCode() {
    hideMenu();
    if (confirm("Clear all code?")) {
        editor.value = "";
        updateEditor();
    }
}

// 6. Điều hướng gọi lệnh chung từ Menu (Lệnh linh hoạt)
function execCommand(cmd) {
    switch (cmd) {
        case 'cut':
            cutCode();
            break;
        case 'copy':
            copyCode();
            break;
        case 'paste':
            pasteCode();
            break;
        case 'selectAll':
            selectAllCode();
            break;
        case 'clear':
            clearCode();
            break;
    }
}
